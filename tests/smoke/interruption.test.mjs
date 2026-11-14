import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lifecycleUrl = new URL('../../scripts/smoke_lifecycle.mjs', import.meta.url).href;
const posix = process.platform !== 'win32';

async function executable(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const path = join(directory, name);
    try { await access(path, constants.X_OK); return resolve(path); } catch { /* next PATH entry */ }
  }
  throw new Error(`Required real executable missing: ${name}`);
}

async function until(predicate, description, milliseconds = 15_000) {
  const end = Date.now() + milliseconds;
  do {
    if (await predicate()) return;
    await pause(10);
  } while (Date.now() < end);
  throw new Error(`Timed out: ${description}`);
}

async function exists(path) {
  try { await access(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function listening(port) {
  return await new Promise(done => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); done(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(250, () => finish(false));
  });
}

async function chainReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(500),
    });
    return (await response.json()).result === '0x7a69';
  } catch { return false; }
}

async function interruptedRun(t, { entrypoint, signal, forceEscalation = false, existingOutput = false, ownedDirectory = false, completing = false }) {
  const directory = await mkdtemp(join(tmpdir(), 'tv4-interruption-test-'));
  const record = join(directory, 'anvil.argv');
  let smoke, closed, anvilPid;
  t.after(async () => {
    try {
      // This detached session contains only processes spawned by this case,
      // including a launcher that may not have written its PID record yet.
      if (smoke?.pid) {
        try { process.kill(-smoke.pid, 'SIGCONT'); process.kill(-smoke.pid, 'SIGKILL'); } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
      await closed;
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  const temporaryRoot = join(directory, 'tmp');
  const bin = join(directory, 'bin');
  await mkdir(temporaryRoot);
  await mkdir(bin);
  const callerFile = join(temporaryRoot, 'caller-owned');
  await writeFile(callerFile, 'caller resource must survive\n');
  const output = join(directory, 'evidence.json');
  const previous = '{"caller":"previous evidence"}\n';
  if (existingOutput) await writeFile(output, previous);
  const gate = join(directory, 'start-anvil');
  const wrapper = join(bin, 'anvil');
  // This launcher is only a deterministic startup barrier and PID recorder. It
  // execs the real binary, so the PID we assert reaped really serves Anvil RPC.
  await writeFile(wrapper, `#!/bin/sh
if [ "$1" = '--version' ]; then exec "$TV4_TEST_REAL_ANVIL" "$@"; fi
printf '%s\\n' "$$" "$@" > "$TV4_TEST_ANVIL_RECORD"
: > "$TV4_TEST_ANVIL_RECORD.ready"
while [ ! -f "$TV4_TEST_ANVIL_GATE" ]; do sleep 0.01; done
exec "$TV4_TEST_REAL_ANVIL" "$@"
`);
  await chmod(wrapper, 0o700);
  const env = { ...process.env, TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot,
    TSX_DISABLE_CACHE: '1', NODE_DISABLE_COMPILE_CACHE: '1',
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, TV4_TEST_REAL_ANVIL: await executable('anvil'),
    TV4_TEST_ANVIL_RECORD: record, TV4_TEST_ANVIL_GATE: gate,
    // Neither entrypoint is permitted to use caller chain/database settings.
    RPC_URL: 'http://127.0.0.1:1/caller-rpc', DATABASE_URL: 'postgresql://caller:secret@127.0.0.1:1/caller',
    TV4_TEST_ANVIL_PORT: ownedDirectory ? String(await reservePort()) : '',
    TV4_TEST_OUTPUT: output,
  };
  delete env.NODE_OPTIONS;
  const fixture = `
import { createSmokeLifecycle } from ${JSON.stringify(lifecycleUrl)};
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const lifecycle = createSmokeLifecycle();
try {
  await lifecycle.temporaryDirectory(join(tmpdir(), 'tv4-governance-storage-'));
  const child = lifecycle.spawn('anvil', ['--host', '127.0.0.1', '--port', process.env.TV4_TEST_ANVIL_PORT, '--chain-id', '31337', '--silent'], { stdio: 'ignore' });
  ${completing ? `
  while (true) {
    try {
      const response = await fetch('http://127.0.0.1:' + process.env.TV4_TEST_ANVIL_PORT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(500),
      });
      if ((await response.json()).result === '0x7a69') break;
    } catch {}
    await new Promise(done => setTimeout(done, 10));
  }
  process.kill(child.pid, 'SIGSTOP');
  await lifecycle.complete(process.env.TV4_TEST_OUTPUT, { result: 'passed' }, 'PASS: lifecycle fixture');
  ` : `
  await new Promise((resolve, reject) => lifecycle.signal.addEventListener('abort', () => reject(lifecycle.signal.reason), { once: true }));
  `}
} finally { await lifecycle.cleanup(); lifecycle.dispose(); }
`;
  // Fixture cases use real resource management and Anvil, with no mocked child.
  const args = ownedDirectory
    ? ['--input-type=module', '--eval', fixture]
    : ['--import', 'tsx', join(root, 'scripts', entrypoint), '--output', output];
  smoke = spawn(process.execPath, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  smoke.stdout.on('data', chunk => { stdout += chunk; });
  smoke.stderr.on('data', chunk => { stderr += chunk; });
  closed = new Promise((done, reject) => {
    smoke.once('error', reject);
    smoke.once('close', (code, exitSignal) => done({ code, signal: exitSignal }));
  });

  await until(async () => {
    assert.equal(smoke.exitCode, null, `Smoke exited before Anvil startup: ${stdout}\n${stderr}`);
    assert.equal(smoke.signalCode, null);
    return await exists(`${record}.ready`);
  }, 'real Anvil spawn');
  const lines = (await readFile(record, 'utf8')).trim().split('\n');
  anvilPid = Number(lines[0]);
  const port = Number(lines[lines.indexOf('--port') + 1]);
  assert.ok(Number.isSafeInteger(anvilPid) && anvilPid > 0);
  assert.ok(port > 0);
  // Freeze the real smoke while Anvil is still behind the launcher barrier.
  // Release Anvil and establish RPC readiness externally before delivering the
  // signal: the smoke cannot race through its full campaign before interruption.
  smoke.kill('SIGSTOP');
  await writeFile(gate, 'start\n');
  await until(() => chainReady(port), 'real child Anvil RPC readiness');
  if (ownedDirectory) {
    assert.ok((await readdir(temporaryRoot)).some(name => name.startsWith('tv4-governance-storage-')));
  }
  if (completing) {
    smoke.kill('SIGCONT');
    await until(async () => {
      const staging = (await readdir(directory)).find(name => name.startsWith('.evidence.json-'));
      return staging !== undefined && await exists(join(directory, staging, 'completed.json'));
    }, 'real staged evidence while the stopped Anvil keeps final cleanup active');
  }
  if (forceEscalation) process.kill(anvilPid, 'SIGSTOP');
  smoke.kill(signal);
  smoke.kill('SIGCONT');
  // Escalation cases keep cleanup active long enough to deliver a genuinely
  // repeated signal while the main finally is also awaiting the same cleanup.
  if (forceEscalation || completing) { await pause(100); smoke.kill(signal); }
  let deadline;
  const result = await Promise.race([
    closed,
    new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Smoke cleanup exceeded its bounded stop/reap deadline')), 14_000); }),
  ]).finally(() => clearTimeout(deadline));
  assert.deepEqual(result, { code: signal === 'SIGINT' ? 130 : 143, signal: null }, `${stdout}\n${stderr}`);
  assert.equal(alive(anvilPid), false, 'Owned Anvil was not reaped');
  assert.equal(await listening(port), false, 'Owned Anvil RPC is still listening');
  assert.doesNotMatch(stdout, /PASS:/, 'Interruption must not announce success');
  if (existingOutput) assert.equal(await readFile(output, 'utf8'), previous, 'Caller evidence was replaced on interruption');
  else assert.equal(await exists(output), false, 'Interruption published successful evidence');
  assert.equal(await readFile(callerFile, 'utf8'), 'caller resource must survive\n');
  assert.deepEqual(await readdir(temporaryRoot), ['caller-owned']);
  assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('.evidence.json-')), [], 'Owned partial evidence staging leaked');
}

async function reservePort() {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}

for (const entrypoint of ['smoke_governance.mjs', 'smoke_treasury.mjs']) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const forceEscalation = (entrypoint === 'smoke_governance.mjs') === (signal === 'SIGTERM');
    test(`${entrypoint}: ${signal} cleans real Anvil${forceEscalation ? ' with repeated signal and SIGKILL escalation' : ''}`, { skip: !posix, timeout: 35_000 }, async t => {
      await interruptedRun(t, { entrypoint, signal, forceEscalation, existingOutput: signal === 'SIGTERM' });
    });
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`owned storage-style temporary directory: ${signal} cleans real Anvil and files`, { skip: !posix, timeout: 30_000 }, async t => {
    await interruptedRun(t, { signal, ownedDirectory: true });
  });
  test(`staged successful evidence: ${signal} discards files during concurrent final cleanup`, { skip: !posix, timeout: 35_000 }, async t => {
    await interruptedRun(t, { signal, ownedDirectory: true, completing: true, existingOutput: true });
  });
}
