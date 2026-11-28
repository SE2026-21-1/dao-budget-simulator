import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { initializeRun, sealRun, validateRun, probeRun, assertRunLive, parseRunEnv } from '../scripts/be09-metadata.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rpcUrl = 'http://127.0.0.1:28545';
const database = 'postgresql://be09@127.0.0.1:55432/dao_budget_be09';
async function fixture(t) {
  const stateRoot = await mkdtemp(join(tmpdir(), 'dao-budget-issue40-lifecycle-unit-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const runDir = join(stateRoot, 'runs/unit');
  for (const dir of ['pids', 'postgres/data', 'reports', 'public', 'cache/vite']) await mkdir(join(runDir, dir), { recursive: true });
  const options = { root, stateRoot, runDir, rpcUrl, scope: 'issue40' };
  await writeFile(join(runDir, 'run-id'), 'unit\n');
  const identity = await initializeRun(options);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const deploymentName = 'be09-local-20261128T120000Z-0123456789ab';
  const runtime = { format: 'dao-budget-be09-runtime-v1', sourceCommit, chainId: '31337', runId: 'unit', runtimeDir: runDir, urls: identity.urls, deploymentName, deploymentId: '1', proposalId: '42', manifest: join(runDir, 'public/manifest.json'), seedReport: join(runDir, 'reports/governance-seed.json'), indexerConfig: join(runDir, 'indexer-config.json'), workerEnv: join(runDir, 'worker.env') };
  const json = async (name, value) => writeFile(join(runDir, name), JSON.stringify(value) + '\n');
  await json('runtime.json', runtime);
  await json('public/manifest.json', { format: 'dao-budget-local-governance-v1', sourceCommit, chainId: '31337', confirmations: '2' });
  await json('reports/governance-seed.json', { sourceCommit, chainId: '31337', status: 'PASS', proposalId: '42' });
  await json('reports/source-provenance.json', identity.source);
  await json('indexer-config.json', { rpcUrl, chainId: '31337', deploymentId: '1' });
  await writeFile(join(runDir, 'runtime.env'), `DATABASE_URL=${database}\nRPC_URL=${rpcUrl}\nBE05_LIVE_RPC_URL=${rpcUrl}\nAPI_HOST=127.0.0.1\nAPI_PORT=3300\nAPI_CORS_ORIGINS=${identity.urls.frontend}\nDEPLOYMENT_NAME=${deploymentName}\nBE05_LIVE_API_URL=${identity.urls.api}\nBE05_LIVE_CHAIN_ID=31337\nBE05_LIVE_DEPLOYMENT_ID=${deploymentName}\n`);
  await writeFile(join(runDir, 'worker.env'), `DATABASE_URL=${database}\nRPC_URL=${rpcUrl}\n`);
  await writeFile(join(runDir, 'frontend.env'), `VITE_RPC_URL=${rpcUrl}\nVITE_API_BASE_URL=${identity.urls.api}\nVITE_CHAIN_ID=31337\nVITE_DEPLOYMENT_ID=${deploymentName}\nDAO_VITE_CACHE_DIR=${join(runDir, 'cache/vite')}\n`);
  await sealRun(options);
  return { options, identity, runtime, json };
}
for (const override of [undefined, '18545']) {
  test(`fresh terminal RPC override ${override ?? 'unset'} cannot replace persisted RPC`, async t => {
    const { options } = await fixture(t);
    const env = { ...process.env, RPC_URL: 'http://127.0.0.1:18545' };
    if (override === undefined) delete env.BE09_RPC_PORT; else env.BE09_RPC_PORT = override;
    const result = spawnSync(process.execPath, [join(root, 'scripts/be09-metadata.mjs'), 'rpc-url', root, options.stateRoot, options.runDir], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), rpcUrl);
    const urls = [];
    const runtime = await probeRun(options, async url => { urls.push(String(url)); return { status: 200, json: async () => ({ result: '0x7a69', data: { publication: 'ready', indexer: 'synced' } }) }; }, async () => {});
    assert.equal(runtime.urls.rpc, rpcUrl);
    assert.deepEqual(urls, [rpcUrl, `http://127.0.0.1:3300/api/health?chainId=31337&deploymentId=${runtime.deploymentName}`, 'http://127.0.0.1:5173/']);
  });
}
const mutations = {
  'cross-run identity': async f => { const identity = { ...f.identity, runId: 'other' }; await f.json('run-identity.json', identity); },
  'source mismatch': async f => f.json('run-identity.json', { ...f.identity, sourceCommit: '0'.repeat(40) }),
  'malformed runtime': async f => writeFile(join(f.options.runDir, 'runtime.json'), '{'),
  'missing metadata': async f => rm(join(f.options.runDir, 'runtime.json')),
  'protected RPC': async f => f.json('run-identity.json', { ...f.identity, rpcUrl: 'http://127.0.0.1:18545', urls: { ...f.identity.urls, rpc: 'http://127.0.0.1:18545' } }),
  'protected API': async f => f.json('runtime.json', { ...f.runtime, urls: { ...f.runtime.urls, api: 'http://127.0.0.1:13300' } }),
  'cross-run artifact': async f => f.json('runtime.json', { ...f.runtime, manifest: join(f.options.stateRoot, 'runs/other/public/manifest.json') }),
  'worker JSON RPC mismatch': async f => f.json('indexer-config.json', { rpcUrl: 'http://127.0.0.1:18545', chainId: '31337', deploymentId: '1' }),
  'worker env RPC mismatch': async f => writeFile(join(f.options.runDir, 'worker.env'), `DATABASE_URL=${database}\nRPC_URL=http://127.0.0.1:18545\n`),
  'protected database': async f => writeFile(join(f.options.runDir, 'worker.env'), `DATABASE_URL=postgresql://be09@127.0.0.1:55442/dao_budget_be09\nRPC_URL=${rpcUrl}\n`),
  'frontend mismatch': async f => writeFile(join(f.options.runDir, 'frontend.env'), 'VITE_RPC_URL=http://127.0.0.1:18545\n'),
  'duplicate worker env': async f => writeFile(join(f.options.runDir, 'worker.env'), `DATABASE_URL=${database}\nRPC_URL=${rpcUrl}\nRPC_URL=${rpcUrl}\n`),
  'unsealed bytes': async f => { const name = join(f.options.runDir, 'runtime.env'); await writeFile(name, await readFile(name, 'utf8') + '# changed\n'); },
  'artifact symlink': async f => { const file = join(f.options.runDir, 'worker.env'); const bytes = await readFile(file); await rm(file); const target = join(f.options.stateRoot, 'external.env'); await writeFile(target, bytes); await symlink(target, file); },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test(`${name} fails closed before fetch or process operations`, async t => {
    const f = await fixture(t);
    await mutate(f);
    let fetched = 0, guarded = 0;
    await assert.rejects(probeRun(f.options, async () => { fetched++; throw new Error('unexpected fetch'); }, async () => { guarded++; }));
    assert.equal(fetched, 0);
    assert.equal(guarded, 0);
  });
}
test('stopped run with valid metadata cannot probe a reclaimed endpoint', async t => {
  const { options } = await fixture(t);
  const data = await validateRun(options);
  await assert.rejects(assertRunLive(data));
  let requests = 0;
  await assert.rejects(probeRun(options, async () => { requests++; }));
  assert.equal(requests, 0);
});
test('runtime environment rejects malformed keys and duplicate overrides', () => {
  assert.throws(() => parseRunEnv('RPC_URL=a\nRPC_URL=b\n'), /Duplicate/);
  assert.throws(() => parseRunEnv('bad key=value\n'));
});

test('source working-state mismatch prevents network before any ownership guard', async t => {
  const f = await fixture(t);
  await f.json('run-identity.json', { ...f.identity, workingSource: { diffSha256: '0'.repeat(64), status: '' } });
  let fetched = 0;
  await assert.rejects(probeRun(f.options, async () => { fetched++; }), /Working source/);
  assert.equal(fetched, 0);
});

test('verify rejects a stopped fixture before live tests, DB or report writes', async t => {
  const f = await fixture(t);
  const reportDir = join(f.options.runDir, 'reports/verify-unit');
  await mkdir(reportDir);
  const result = spawnSync(process.execPath, [join(root, 'scripts/be09-verify.mjs'), '--runtime', f.options.runDir, '--report', reportDir], {
    cwd: root, env: { ...process.env, BE09_STATE_ROOT: f.options.stateRoot, BE09_SCOPE: 'issue40' }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1, result.stderr);
  await assert.rejects(readFile(join(reportDir, 'results.json')), { code: 'ENOENT' });
  const { runLiveTest } = await import('../scripts/be09-verify.mjs');
  await assert.rejects(runLiveTest(f.runtime, {}, reportDir));
  await assert.rejects(readFile(join(reportDir, 'frontend-api-live-test.vitest.json')), { code: 'ENOENT' });
});
