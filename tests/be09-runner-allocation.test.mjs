import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'scripts/be09-local.sh');
async function fixture(t, scope = 'ordinary') {
  const dir = await mkdtemp(join(tmpdir(), 'be09-input-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = join(dir, scope === 'issue40' ? 'dao-budget-issue40-lifecycle-unit' : 'state');
  const env = { ...process.env, BE09_STATE_ROOT: state, BE09_SCOPE: scope, BE09_NODE_DIR: dirname(process.execPath) };
  delete env.BE09_RPC_PORT;
  return { state, env };
}
for (const [scope, input, expected] of [['ordinary', undefined, 18545], ['ordinary', '00028545', 28545], ['issue40', '28545', 28545]]) {
  test(`runner derives one canonical URL, scope=${scope}, input=${input ?? 'unset'}`, async t => {
    const { state, env } = await fixture(t, scope);
    if (input !== undefined) env.BE09_RPC_PORT = input;
    // Source only; help + pure configuration. Never invokes up, binds or probes.
    const result = spawnSync('bash', ['-c', 'source "$1" help >/dev/null; configure_rpc; printf "RPC=%s\\nPORT=%s\\n" "$RPC_URL" "$RPC_PORT"', 'unit', runner], { env, cwd: root, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `RPC=http://127.0.0.1:${expected}\nPORT=${expected}\n`);
    await assert.rejects(access(state), { code: 'ENOENT' });
  });
}
for (const value of ['', ' ', '+28545', '28545\n', '0', '65536', '9'.repeat(1000), '0'.repeat(1000) + '1', '3300', '55432', '5173', '18545', '13300', '55442']) {
  test(`Issue40 invalid/protected RPC is refused before bootstrap: ${JSON.stringify(value.slice(0, 20))}`, async t => {
    const { state, env } = await fixture(t, 'issue40');
    env.BE09_RPC_PORT = value;
    const result = spawnSync('bash', [runner, 'up'], { env, cwd: root, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /Tracked worktree|Git index|Untracked file|unavailable:/);
    await assert.rejects(access(state), { code: 'ENOENT' });
  });
}
test('Issue40 default18545 is refused, and generic state root cannot opt into Issue40', async t => {
  const { state, env } = await fixture(t, 'ordinary');
  env.BE09_SCOPE = 'issue40';
  env.BE09_RPC_PORT = '28545';
  const result = spawnSync('bash', [runner, 'up'], { env, cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /private per-attempt state root/);
  await assert.rejects(access(state), { code: 'ENOENT' });
});

test('Issue40 unset RPC refuses ordinary default before any state creation', async t => {
  const { state, env } = await fixture(t, 'issue40');
  const result = spawnSync('bash', [runner, 'up'], { env, cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires the allocated RPC port 28545/);
  await assert.rejects(access(state), { code: 'ENOENT' });
});

for (const scenario of ['restart', 'source-mismatch', 'foreign-rpc']) {
  test(`foreground worker restart grace remains fail-closed: ${scenario}`, async t => {
    const { env } = await fixture(t);
    const script = `
      source "$1" help >/dev/null
      RPC_PORT=28545
      first=1
      metadata() {
        if [[ "$1" = validate ]]; then [[ "$MODE" != source-mismatch ]]; return; fi
        if [[ "$first" = 1 ]]; then first=0; return 1; fi
        return 0
      }
      owned() { [[ "$MODE" != foreign-rpc || "$1" != anvil ]]; }
      sleep() { :; }
      check_service_health
    `;
    const result = spawnSync('bash', ['-c', script, 'unit', runner], { env: { ...env, MODE: scenario }, cwd: root, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, scenario === 'restart' ? 0 : 1, result.stderr);
  });
}
