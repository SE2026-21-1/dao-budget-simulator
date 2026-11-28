import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertOwnedProcess, canonicalRun, captureProcess, signalOwnedProcess } from '../scripts/be09-safety.mjs';
import { waitOwnedRpc } from '../scripts/be09-readiness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const safety = join(root, 'scripts/be09-safety.mjs');
const reserved = [18545, 13300, 55442, 5432, 28545, 3300, 55432, 5173];
const linux = { skip: process.platform !== 'linux' };
const service = `
  const http = require('node:http');
  const forbidden = new Set(JSON.parse(process.env.FIXTURE_RESERVED));
  let server;
  setInterval(() => {}, 1000);
  process.on('message', message => {
    if (message === 'close') server.close(() => process.send({ closed: true }));
  });
  if (process.env.FIXTURE_SERVER === 'yes') {
    server = http.createServer((req, res) => {
      process.send({ request: true });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x7a69' }));
    });
    server.on('error', error => {
      if (error.code === 'EADDRINUSE' && !process.env.FIXTURE_PORT) return listen();
      process.stderr.write(error.message); process.exit(1);
    });
    // Dedicated fixture range excludes every protected/candidate endpoint BEFORE bind.
    const listen = () => server.listen(Number(process.env.FIXTURE_PORT || (60000 + require('node:crypto').randomInt(5000))), process.env.FIXTURE_HOST, () => {
      const port = server.address().port;
      if (forbidden.has(port)) throw new Error('Fixture attempted a reserved port');
      else process.send({ ready: true, port });
    });
    listen();
  } else process.send({ ready: true });
`;

async function directories(t) {
  const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'be09-safety-')));
  const runDir = join(stateRoot, 'runs/fixture');
  await mkdir(join(runDir, 'pids'), { recursive: true });
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  return { root, stateRoot, runDir };
}

function message(child, predicate) {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => done(new Error('Fixture did not become ready')), 3000);
    const onMessage = value => { if (predicate(value)) done(null, value); };
    const onExit = (code, signal) => done(new Error(`Fixture exited before readiness: ${code}/${signal}`));
    function done(error, value) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', done);
      if (error) reject(error); else resolveMessage(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', done);
  });
}

async function fixture(t, { label = 'anvil', server = false, host = '127.0.0.1', port, suffix = '' } = {}) {
  const paths = await directories(t);
  const { runDir } = paths;
  let marker = `be09-anvil-fixture`;
  let args = ['-e', service, '--', marker + suffix];
  if (label === 'api' || label === 'frontend') {
    marker = join(runDir, label === 'api' ? 'runtime.env' : 'frontend.env');
    await writeFile(marker, 'BE09_FIXTURE=1\n');
    args = [`--env-file=${marker}${suffix}`, '-e', service];
  } else if (label === 'worker') {
    marker = join(runDir, 'indexer-config.json');
    await writeFile(marker, '{}\n');
    args = ['-e', service, '--', '--config', marker + suffix];
  } else if (label === 'postgres') {
    marker = join(runDir, 'postgres/data');
    await mkdir(marker, { recursive: true });
    args = ['-e', service, '--', '-D', marker + suffix];
  }
  const child = spawn(process.execPath, args, {
    env: { ...process.env, FIXTURE_SERVER: server ? 'yes' : 'no', FIXTURE_HOST: host,
      FIXTURE_PORT: port === undefined ? '' : String(port), FIXTURE_RESERVED: JSON.stringify(reserved) },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let requests = 0;
  child.on('message', value => { if (value.request) requests++; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
  });
  const ready = await message(child, value => value.ready);
  await writeFile(join(runDir, 'pids', `${label}.pid`), `${child.pid}\n`);
  if (label === 'postgres') await writeFile(join(marker, 'postmaster.pid'), `${child.pid}\n${marker}\n`);
  const capture = (overrides = {}) => captureProcess({ runDir, label, pid: child.pid,
    executable: process.execPath, marker, parentPid: process.pid, ...overrides });
  return { ...paths, child, label, marker, port: ready.port, capture, requests: () => requests };
}

async function cli(args) {
  const child = spawn(process.execPath, [safety, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const [status] = await once(child, 'close');
  return { status, stdout, stderr };
}

test('canonical paths validate future directories without creating anything', linux, async t => {
  const paths = await directories(t);
  const stateRoot = join(paths.stateRoot, 'future-state');
  const runDir = join(stateRoot, 'runs/future');
  assert.deepEqual(await canonicalRun({ root, stateRoot, runDir }), {
    root, stateRoot, runDir, runId: 'future', pgdata: join(runDir, 'postgres/data'),
  });
  await assert.rejects(lstat(stateRoot), { code: 'ENOENT' });
  await assert.rejects(canonicalRun({ root, stateRoot: join(root, 'state'), runDir: join(root, 'state/runs/run') }), /outside checkout/);
  await assert.rejects(canonicalRun({ ...paths, runDir: join(paths.stateRoot, 'escape') }), /immediate child/);
  await assert.rejects(canonicalRun({ ...paths, runDir: join(paths.runDir, 'nested') }), /immediate child/);
  await assert.rejects(canonicalRun({ ...paths, runDir: 'relative' }), /absolute/);
  await assert.rejects(canonicalRun({ ...paths, runDir: `${paths.runDir}/../other` }), /traversal/);
});

test('canonical paths reject state, run and PGDATA symlink components', linux, async t => {
  const paths = await directories(t);
  const alias = join(paths.stateRoot, 'alias');
  await symlink(paths.stateRoot, alias);
  await assert.rejects(canonicalRun({ root, stateRoot: alias, runDir: join(alias, 'runs/fixture') }), /Symlink/);
  const runAlias = join(paths.stateRoot, 'runs/alias');
  await symlink(paths.runDir, runAlias);
  await assert.rejects(canonicalRun({ ...paths, runDir: runAlias }), /Symlink/);
  await mkdir(join(paths.runDir, 'postgres'));
  await symlink(paths.stateRoot, join(paths.runDir, 'postgres/data'));
  await assert.rejects(canonicalRun(paths), /Symlink/);
});

test('owned loopback socket is authenticated without a network request; capture is exclusive', linux, async t => {
  const owned = await fixture(t, { server: true });
  const executable = join(owned.stateRoot, 'node-alias');
  await symlink(process.execPath, executable);
  const identity = await owned.capture({ executable });
  assert.equal(identity.executable, await realpath(process.execPath));
  assert.equal(identity.parentPid, process.pid);
  assert.ok(identity.startTicks);
  assert.ok(identity.bootId);
  assert.deepEqual(await assertOwnedProcess(owned), identity);
  assert.equal(owned.requests(), 0);
  await assert.rejects(owned.capture(), { code: 'EEXIST' });
  assert.equal((await lstat(join(owned.runDir, 'pids/anvil.identity.json'))).mode & 0o777, 0o600);
  let fetched = 0;
  await waitOwnedRpc({ runDir: owned.runDir, url: `http://127.0.0.1:${owned.port}`, timeoutMs: 1000, fetcher: async () => { fetched++; return { ok: true, json: async () => ({ result: '0x7a69' }) }; } });
  assert.equal(fetched, 1);
});

test('unrelated same-chain listener is rejected before any request', linux, async t => {
  const unrelated = await fixture(t, { server: true });
  const owned = await fixture(t);
  await owned.capture();
  await assert.rejects(assertOwnedProcess({ ...owned, port: unrelated.port }), /unrelated listener/);
  assert.equal(unrelated.requests(), 0);
  assert.equal(owned.requests(), 0);
  let fetched = 0, deployed = false, seeded = false;
  await assert.rejects((async () => {
    await waitOwnedRpc({ runDir: owned.runDir, url: `http://127.0.0.1:${unrelated.port}`, timeoutMs: 100, fetcher: async () => { fetched++; return { ok: true, json: async () => ({ result: '0x7a69' }) }; } });
    deployed = true;
    seeded = true;
  })(), /listener/);
  assert.equal(fetched, 0);
  assert.equal(deployed, false);
  assert.equal(seeded, false);
});

test('wildcard socket is not a loopback ownership gate', linux, async t => {
  const owned = await fixture(t, { server: true, host: '0.0.0.0' });
  await owned.capture();
  await assert.rejects(assertOwnedProcess(owned), /wildcard/);
  assert.equal(owned.requests(), 0);
});

test('conflicting unrelated loopback socket rejects even when expected process owns the port', linux, async t => {
  const owned = await fixture(t, { server: true });
  const unrelated = await fixture(t, { server: true, host: '127.0.0.2', port: owned.port });
  await owned.capture();
  await assert.rejects(assertOwnedProcess(owned), /unrelated listener/);
  assert.equal(owned.requests(), 0);
  assert.equal(unrelated.requests(), 0);
});

test('failed child bind cannot authenticate the unrelated listener', linux, async t => {
  const unrelated = await fixture(t, { server: true });
  const paths = await directories(t);
  const child = spawn(process.execPath, ['-e', `require('node:net').createServer().once('error',()=>process.exit(1)).listen(${unrelated.port},'127.0.0.1')`, '--', 'be09-anvil-fixture']);
  assert.equal((await once(child, 'exit'))[0], 1);
  await writeFile(join(paths.runDir, 'pids/anvil.pid'), `${child.pid}\n`);
  await assert.rejects(captureProcess({ runDir: paths.runDir, label: 'anvil', pid: child.pid,
    executable: process.execPath, marker: 'be09-anvil-fixture' }));
  await assert.rejects(assertOwnedProcess({ runDir: paths.runDir, label: 'anvil', port: unrelated.port }));
  assert.equal(unrelated.requests(), 0);
  let fetched = 0;
  await assert.rejects(waitOwnedRpc({ runDir: paths.runDir, url: `http://127.0.0.1:${unrelated.port}`, timeoutMs: 100, fetcher: async () => { fetched++; } }));
  assert.equal(fetched, 0);
});

test('capture rejects wrong executable, parent, and substring marker', linux, async t => {
  const owned = await fixture(t);
  await assert.rejects(owned.capture({ executable: '/bin/sh' }), /executable/);
  await assert.rejects(owned.capture({ parentPid: process.pid + 1 }), /parent/);
  await assert.rejects(owned.capture({ marker: `${owned.marker}-suffix` }), /run marker/);
  const substring = await fixture(t, { suffix: '-other' });
  await assert.rejects(substring.capture(), /exact canonical run marker/);
});

test('reused PID, altered start time and every identity component prohibit signals', linux, async t => {
  const owned = await fixture(t);
  const other = await fixture(t);
  const identity = await owned.capture();
  const path = join(owned.runDir, 'pids/anvil.identity.json');
  for (const change of [
    { startTicks: String(BigInt(identity.startTicks) + 1n) },
    { bootId: 'another-boot' }, { executable: '/bin/sh' },
    { argv: [...identity.argv, 'extra'] }, { argvBytes: '' },
    { runDir: other.runDir }, { stateRoot: other.stateRoot }, { root: other.stateRoot },
    { parentPid: other.child.pid }, { parentStartTicks: '0' },
  ]) {
    await writeFile(path, JSON.stringify({ ...identity, ...change }));
    await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }));
    process.kill(owned.child.pid, 0);
  }
  await writeFile(path, JSON.stringify(identity));
  await writeFile(join(owned.runDir, 'pids/anvil.pid'), `${other.child.pid}\n`);
  await assert.rejects(signalOwnedProcess({ ...owned, signal: 'KILL' }), /PID file/);
  process.kill(other.child.pid, 0);
  process.kill(owned.child.pid, 0);
});

test('all service markers are exact canonical tokens and postgres checks both postmaster lines', linux, async t => {
  for (const label of ['worker', 'api', 'frontend', 'postgres']) {
    const owned = await fixture(t, { label });
    await owned.capture();
    await assertOwnedProcess(owned);
    if (label === 'postgres') {
      const pidfile = join(owned.marker, 'postmaster.pid');
      await writeFile(pidfile, `${owned.child.pid}\n${owned.runDir}\n`);
      await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }), /data directory/);
      await writeFile(pidfile, `${process.pid}\n${owned.marker}\n`);
      await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }), /postmaster PID/);
      process.kill(owned.child.pid, 0);
    }
  }
});

test('cleanup works without runtime metadata and after the owned listener disappears', linux, async t => {
  const owned = await fixture(t, { label: 'api', server: true });
  await owned.capture();
  await assert.rejects(lstat(join(owned.runDir, 'runtime.json')), { code: 'ENOENT' });
  const closed = message(owned.child, value => value.closed);
  owned.child.send('close');
  await closed;
  await assert.rejects(assertOwnedProcess(owned), /no owned loopback listener/);
  const exit = once(owned.child, 'exit');
  await signalOwnedProcess({ ...owned, signal: 'TERM' });
  assert.deepEqual(await exit, [null, 'SIGTERM']);
});

test('identity and PID symlinks cannot authorize cleanup', linux, async t => {
  const owned = await fixture(t);
  await owned.capture();
  const pidfile = join(owned.runDir, 'pids/anvil.pid');
  const copy = join(owned.stateRoot, 'pid-copy');
  await writeFile(copy, `${owned.child.pid}\n`);
  await rm(pidfile);
  await symlink(copy, pidfile);
  await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }), /regular file/);
  process.kill(owned.child.pid, 0);
});

test('CLI paths, capture, owned failure and guarded signal use the same API', linux, async t => {
  const owned = await fixture(t);
  const paths = await cli(['paths', root, owned.stateRoot, owned.runDir]);
  assert.equal(paths.status, 0, paths.stderr);
  assert.equal(JSON.parse(paths.stdout).runDir, owned.runDir);
  const captured = await cli(['capture', owned.runDir, 'anvil', String(owned.child.pid), process.execPath, owned.marker, String(process.pid)]);
  assert.equal(captured.status, 0, captured.stderr);
  assert.equal((await cli(['owned', owned.runDir, 'anvil'])).status, 0);
  assert.equal((await cli(['owned', owned.runDir, 'api'])).status, 1);
  const exit = once(owned.child, 'exit');
  const stopped = await cli(['signal', owned.runDir, 'anvil', 'TERM']);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.deepEqual(await exit, [null, 'SIGTERM']);
});

test('identity symlinks and redirected canonical service files cannot authorize signals', linux, async t => {
  const owned = await fixture(t, { label: 'worker' });
  await owned.capture();
  const identity = join(owned.runDir, 'pids/worker.identity.json');
  const copy = join(owned.stateRoot, 'identity-copy');
  await writeFile(copy, await readFile(identity));
  await rm(identity);
  await symlink(copy, identity);
  await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }), /regular file/);
  await rm(identity);
  await writeFile(identity, await readFile(copy));
  const config = join(owned.stateRoot, 'external-config');
  await writeFile(config, '{}');
  await rm(owned.marker);
  await symlink(config, owned.marker);
  await assert.rejects(signalOwnedProcess({ ...owned, signal: 'TERM' }), /Noncanonical process marker/);
  process.kill(owned.child.pid, 0);
});

test('postgres capture refuses a postmaster data-directory mismatch', linux, async t => {
  const owned = await fixture(t, { label: 'postgres' });
  await writeFile(join(owned.marker, 'postmaster.pid'), `${owned.child.pid}\n${owned.stateRoot}\n`);
  await assert.rejects(owned.capture(), /data directory/);
  await assert.rejects(lstat(join(owned.runDir, 'pids/postgres.identity.json')), { code: 'ENOENT' });
});

test('only reparenting to init after the recorded parent exits remains owned', linux, async t => {
  const paths = await directories(t);
  const marker = 'be09-anvil-fixture';
  const broker = spawn(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', ${JSON.stringify(marker)}], { stdio: 'ignore' });
    child.once('spawn', () => process.send({ pid: child.pid }));
    process.on('message', () => process.exit(0));
  `], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (broker.exitCode === null && broker.signalCode === null) broker.kill('SIGKILL'); });
  const { pid } = await message(broker, value => Number.isSafeInteger(value.pid));
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } });
  await writeFile(join(paths.runDir, 'pids/anvil.pid'), `${pid}\n`);
  await captureProcess({ runDir: paths.runDir, label: 'anvil', pid,
    executable: process.execPath, marker, parentPid: broker.pid });
  const exited = once(broker, 'exit');
  broker.send('exit');
  await exited;
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  const parentPid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  if (parentPid !== 1) {
    await assert.rejects(assertOwnedProcess({ ...paths, label: 'anvil' }), /non-init/);
  } else {
    await assertOwnedProcess({ ...paths, label: 'anvil' });
    await signalOwnedProcess({ ...paths, label: 'anvil', signal: 'TERM' });
  }
});

test('an external state ancestor cannot place a run inside the checkout', linux, async t => {
  const paths = await directories(t);
  await assert.rejects(canonicalRun({ ...paths, root: join(paths.stateRoot, 'runs') }), /outside checkout/);
});

test('an owned listener on another loopback address cannot authenticate 127.0.0.1', linux, async t => {
  const owned = await fixture(t, { server: true, host: '127.0.0.2' });
  await owned.capture();
  await assert.rejects(assertOwnedProcess(owned), /no owned loopback listener at 127\.0\.0\.1/);
  assert.equal(owned.requests(), 0);
});

test('private postgres fast shutdown signals only its authenticated PID', linux, async t => {
  const owned = await fixture(t, { label: 'postgres' });
  await owned.capture();
  const exited = once(owned.child, 'exit');
  await signalOwnedProcess({ ...owned, signal: 'INT' });
  assert.deepEqual(await exited, [null, 'SIGINT']);
});
