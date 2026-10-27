#!/usr/bin/env node
// Native alternative to the Docker wrappers. Never connects to a caller database.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { openSync, closeSync, writeSync, constants } from 'node:fs';
import { access, chmod, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: node --import tsx scripts/check_tv4_native.mjs --postgres-bin <absolute-bin-dir> --output <new-evidence-directory> [--benchmark]';
const args = process.argv.slice(2);
assert.ok(args.length === 4 || (args.length === 5 && args[4] === '--benchmark'), usage);
const withBenchmark = args[4] === '--benchmark';
assert.equal(args[0], '--postgres-bin', usage);
assert.equal(args[2], '--output', usage);
assert.ok(isAbsolute(args[1]), '--postgres-bin must be absolute');
assert.ok(args[3], usage);
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node.js >=24 is required');
assert.equal(process.platform, 'linux', 'This native runner requires Linux process groups');
assert.notEqual(process.getuid(), 0, 'Run as an unprivileged current user; privilege changes are forbidden');
const bin = await realpath(args[1]);
const output = resolve(args[3]);
// Accept an existing empty real directory, but never overwrite historical evidence.
try {
  const info = await lstat(output);
  assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Output must be a real directory');
  assert.deepEqual(await readdir(output), [], 'Output must be empty');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(output, { recursive: false, mode: 0o700 });
}
await chmod(output, 0o700);
const logs = join(output, 'logs');
await mkdir(logs, { mode: 0o700 });
const lifecycle = createSmokeLifecycle();
// Its child/directory ownership API is reused, but PostgreSQL is a daemon, not a
// tracked child: our handler must stop the cluster BEFORE deleting its directory.
lifecycle.dispose();
let interrupted;
const signalController = new AbortController();
const handlers = Object.fromEntries(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
  if (interrupted) return;
  interrupted = signal;
  signalController.abort(new Error(`Interrupted by ${signal}`));
}]));
for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
const password = randomBytes(32).toString('hex');
const clean = value => String(value).replaceAll(password, '[REDACTED]')
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
// Do not inherit settings which can redirect SQL/RPC, load caller Node hooks,
// override test destinations, or make libpq read caller credentials/services.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|BE0[1-6]_.*|TV4_.*|DATABASE_URL$|RPC_URL$|NODE_OPTIONS$|NODE_PATH$)/.test(key)));
env.PGCONNECT_TIMEOUT = '5';
env.PGAPPNAME = 'tv4-native-acceptance';
const report = {
  format: 'dao-budget-tv4-native-v1', status: 'RUNNING', startedAt: new Date().toISOString(),
  scope: 'Fresh native PostgreSQL, BE01 SQL, BE02/03/04/05/06 DB suites, governance storage smoke, live Anvil/API/two-target rebuild; optional real-chain NFR02 benchmark. No testnet or browser acceptance.',
  isolation: { currentUid: process.getuid(), currentGid: process.getgid(), callerDatabaseAndRpcIgnored: true,
    privilegesChanged: false, freshCluster: true, numericLoopback: '127.0.0.1',
    portAllocation: 'Kernel-reserved ephemeral TCP port, held through initdb; released immediately before pg_ctl. Bind collision fails closed.',
    migrations: 'Dedicated BE01 DB uses SQL files; every other suite owns its own migrations on separate empty databases.' },
  runtime: { node: process.version, executable: process.execPath, platform: process.platform, arch: process.arch, postgresBin: bin },
  provenance: { sourceHashes: {}, binaryHashes: {} }, commands: [],
  suites: Object.fromEntries(['be01-sql', 'be02-storage', 'be03-checkpoint-crash', 'be04-projection', 'be05-api', 'be06-two-db', 'governance-storage', 'live-api-be06', ...(withBenchmark ? ['api-benchmark'] : [])].map(name => [name, { status: 'NOT_RUN' }])),
  cleanup: { status: 'NOT_RUN' },
};
let directory;
let data;
let serverLog;
let startAttempted = false;
let reservation;
let serial = 0;
const groups = new Set();
const sleep = ms => new Promise(done => setTimeout(done, ms));
function checkSignal() { if (interrupted) throw signalController.signal.reason; }
function killGroup(pid, signal) {
  try { process.kill(-pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function stopGroup(pid) {
  killGroup(pid, 'SIGTERM');
  // Give nested smoke scopes time to remove their own directories and reap Anvil.
  for (let attempt = 0; attempt < 60; attempt++) {
    try { process.kill(-pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await sleep(100);
  }
  killGroup(pid, 'SIGKILL');
  for (let attempt = 0; attempt < 50; attempt++) {
    try { process.kill(-pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await sleep(100);
  }
  throw new Error('Owned command process group remained after SIGKILL');
}
async function run(name, command, argv, options = {}) {
  if (!options.cleanup) checkSignal();
  const entry = { name, argv: [command, ...argv].map(clean), startedAt: new Date().toISOString(),
    timeoutMs: options.timeout ?? 180_000, log: `logs/${String(++serial).padStart(2, '0')}-${name}.log` };
  report.commands.push(entry);
  const fd = openSync(join(output, entry.log), 'wx', 0o600);
  const started = performance.now();
  let child;
  let stdout = '';
  let timedOut = false;
  let aborted = false;
  let timer;
  let escalation;
  const buffers = { stdout: '', stderr: '' };
  const log = (label, text) => {
    const safe = clean(text);
    writeSync(fd, `[${label}] ${safe}\n`);
    (label === 'stderr' ? process.stderr : process.stdout).write(safe + '\n');
    if (label === 'stdout') stdout += safe + '\n';
  };
  const flush = (label, chunk, final = false) => {
    buffers[label] += chunk;
    let end;
    while ((end = buffers[label].indexOf('\n')) >= 0) {
      log(label, buffers[label].slice(0, end));
      buffers[label] = buffers[label].slice(end + 1);
    }
    if (final && buffers[label]) { log(label, buffers[label]); buffers[label] = ''; }
  };
  const terminate = () => {
    if (!child?.pid) return;
    if (options.group) killGroup(child.pid, 'SIGTERM'); else child.kill('SIGTERM');
    escalation ??= setTimeout(() => {
      if (options.group) killGroup(child.pid, 'SIGKILL'); else child.kill('SIGKILL');
    }, 6_000);
  };
  const abort = () => { aborted = true; terminate(); };
  try {
    child = lifecycle.spawn(command, argv, { cwd: root, env: { ...env, ...options.env },
      detached: Boolean(options.group), stdio: ['pipe', 'pipe', 'pipe'] });
    if (options.group && child.pid) groups.add(child.pid);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => flush('stdout', chunk));
    child.stderr.on('data', chunk => flush('stderr', chunk));
    child.stdin.on('error', () => {});
    child.stdin.end(options.input);
    if (!options.cleanup) signalController.signal.addEventListener('abort', abort, { once: true });
    if (!options.cleanup && interrupted) abort();
    timer = setTimeout(() => { timedOut = true; terminate(); }, entry.timeoutMs);
    const result = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => done({ code, signal }));
    });
    entry.exitCode = result.code;
    entry.signal = result.signal;
    if (options.group && child.pid) { await stopGroup(child.pid); groups.delete(child.pid); }
    flush('stdout', '', true); flush('stderr', '', true);
    entry.timedOut = timedOut;
    if (timedOut) throw new Error(`${name} timed out`);
    if (aborted) throw signalController.signal.reason;
    if (!(options.exits ?? [0]).includes(result.code)) throw new Error(`${name} exited ${result.code ?? result.signal}`);
    entry.status = 'PASS';
    return { stdout, exitCode: result.code };
  } catch (error) {
    entry.status = 'FAIL'; entry.error = clean(error.message);
    throw error;
  } finally {
    clearTimeout(timer); clearTimeout(escalation);
    signalController.signal.removeEventListener('abort', abort);
    entry.durationMs = Math.round(performance.now() - started);
    closeSync(fd);
  }
}
async function suite(name, work) {
  checkSignal();
  const started = performance.now();
  report.suites[name] = { status: 'RUNNING' };
  try { await work(); report.suites[name].status = 'PASS'; }
  catch (error) { report.suites[name].status = 'FAIL'; report.suites[name].error = clean(error.message); }
  report.suites[name].durationMs = Math.round(performance.now() - started);
  checkSignal();
}
async function testSuite(name, file, settings) {
  await suite(name, async () => {
    const result = await run(name, process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', file],
      { group: true, timeout: 300_000, env: settings });
    const counts = {};
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const matches = [...result.stdout.matchAll(new RegExp(`^# ${key} (\\d+)\\s*$`, 'gm'))];
      assert.equal(matches.length, 1, `Missing/ambiguous TAP ${key} summary`);
      counts[key] = Number(matches[0][1]);
    }
    report.suites[name].tests = counts;
    assert.ok(counts.tests > 0 && counts.pass > 0, 'Suite must execute real tests');
    for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(counts[key], 0, `${name}: ${key} is not acceptance`);
  });
}

// Run SQL in a bounded child using the installed pg driver, not an optional
// psql binary. Arrays keep CREATE DATABASE outside implicit multi-query blocks.
async function sqlCommand(name, statements, settings) {
  const code = `import pg from 'pg';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const client = new pg.Client({ connectionTimeoutMillis: 5000, query_timeout: 60000 });
client.on('notice', notice => console.log(notice.message));
try {
  await client.connect();
  for (const sql of JSON.parse(input)) {
    const result = await client.query(sql);
    for (const item of Array.isArray(result) ? result : [result])
      console.log(JSON.stringify({ command: item.command, rows: item.rows }));
  }
} finally { await client.end(); }`;
  return run(name, process.execPath, ['--input-type=module', '-e', code],
    { env: settings, input: JSON.stringify(statements), timeout: 120_000, group: true });
}

try {
  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    const path = join(bin, executable);
    await access(path, constants.X_OK);
    report.provenance.binaryHashes[executable] = createHash('sha256').update(await readFile(await realpath(path))).digest('hex');
  }
  for (const path of ['scripts/check_tv4_native.mjs', 'scripts/benchmark_api.mjs', 'scripts/smoke_lifecycle.mjs', 'scripts/check_be04_live.mjs',
    'scripts/smoke_governance.mjs', 'scripts/governance_storage.mjs', 'scripts/governance_local.mjs',
    'indexer/syncer.ts', 'indexer/storage.ts', 'indexer/rpc.ts', 'indexer/types.ts',
    'indexer/api/server.ts', 'indexer/projection/projector.ts', 'indexer/projection/chain.ts',
    'tests/indexer/storage.test.ts', 'tests/indexer/checkpoint-storage.test.ts', 'tests/indexer/projection-storage.test.ts',
    'tests/api/server.test.mjs', 'tests/indexer/be06-db.test.mjs', 'database/migrations/001_initial.sql',
    'database/migrations/002_be03.sql', 'database/migrations/003_be04.sql', 'database/migrations/004_be05_api.sql',
    'database/tests/001_initial_checks.sql', 'package.json', 'package-lock.json', 'foundry.toml', 'foundry.lock']) {
    report.provenance.sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  report.runtime.postgres = (await run('postgres-version', join(bin, 'postgres'), ['--version'])).stdout.trim();
  assert.match(report.runtime.postgres, /PostgreSQL\) 18\.4(?:\s|$)/, 'PostgreSQL 18.4 binaries are required');
  for (const [name, command] of [['anvil', env.ANVIL_BIN ?? 'anvil'], ['forge', env.FORGE_BIN ?? 'forge']]) {
    report.runtime[name] = (await run(`${name}-version`, command, ['--version'])).stdout.trim();
  }
  for (const name of ['tsx', 'typescript', 'pg']) report.runtime[name] = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  directory = await lifecycle.temporaryDirectory(join(tmpdir(), 'dao-tv4-native-'));
  await chmod(directory, 0o700);
  assert.equal((await lstat(directory)).uid, process.getuid(), 'Cluster must belong to current user');
  data = join(directory, 'data');
  serverLog = join(directory, 'postgres.log');
  const pwfile = join(directory, 'password');
  await writeFile(pwfile, password + '\n', { flag: 'wx', mode: 0o600 });
  reservation = createServer();
  await new Promise((done, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', done); });
  const port = reservation.address().port;
  report.isolation.postgresPort = port;
  await run('initdb', join(bin, 'initdb'), ['-D', data, '-U', 'tv4_native_admin', '--auth-local=trust',
    '--auth-host=scram-sha-256', '--pwfile', pwfile, '--encoding=UTF8', '--locale=C'], { timeout: 60_000 });
  // Config file avoids pg_ctl shell quoting of temporary paths. Socket is private.
  await writeFile(join(data, 'postgresql.auto.conf'), `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${directory.replaceAll("'", "''")}'\nunix_socket_permissions = 0700\npassword_encryption = 'scram-sha-256'\n`, { mode: 0o600 });
  checkSignal();
  await new Promise(done => reservation.close(done)); reservation = undefined;
  startAttempted = true;
  await run('postgres-start', join(bin, 'pg_ctl'), ['start', '-w', '-t', '30', '-D', data, '-l', serverLog], { timeout: 40_000 });
  const sqlEnv = { PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'tv4_native_admin', PGDATABASE: 'postgres', PGPASSWORD: password };
  const identity = await sqlCommand('postgres-identity', [
    "SELECT version(), current_setting('data_directory') AS directory, host(inet_server_addr()) || ':' || inet_server_port() AS binding"
  ], sqlEnv);
  assert.ok(identity.stdout.includes(data), 'Connected server must be the newly owned cluster');
  assert.ok(identity.stdout.includes(`127.0.0.1:${port}`), 'Server must use reserved numeric loopback binding');
  report.runtime.postgresServer = JSON.parse(identity.stdout.trim().split('\n').at(-1)).rows[0].version;
  const databases = [ ['be01_test', 'be01_test'], ['be02_test', 'be02_test'], ['be03_test', 'be03_test'],
    ['be04_test', 'be04_test'], ['tv4_be05_api', 'be05_test'], ['tv4_be06_reference', 'be06_test'],
    ['tv4_be06_target', 'be06_test'], ['be04_live', 'be04_test'], ['tv4_be06_live_target', 'be04_test'],
    ['tv4_be06_live_advanced', 'be04_test'], ['tv4_governance', 'tv4_smoke'], ['tv4_governance_rebuild', 'tv4_smoke'] ];
  if (withBenchmark) databases.push(['tv4_benchmark', 'be04_test']);
  // Password is stdin only, never argv or evidence. Roles have no elevated privileges.
  const roles = [...new Set(databases.map(([, role]) => role))];
  const sql = roles.map(role => `CREATE ROLE ${role} LOGIN PASSWORD '${password}';`).concat(
    databases.map(([database, role]) => `CREATE DATABASE ${database} OWNER ${role} TEMPLATE template0;`));
  await sqlCommand('create-fresh-databases', sql, sqlEnv);
  report.isolation.databases = databases.map(([database, owner]) => ({ database, owner }));
  const url = (database, role) => `postgresql://${role}:${password}@127.0.0.1:${port}/${database}`;
  await suite('be01-sql', async () => {
    const settings = { ...sqlEnv, PGUSER: 'be01_test', PGDATABASE: 'be01_test' };
    await sqlCommand('be01-migrate', [await readFile(join(root, 'database/migrations/001_initial.sql'), 'utf8')], settings);
    await sqlCommand('be01-constraints', [await readFile(join(root, 'database/tests/001_initial_checks.sql'), 'utf8')], settings);
  });
  await testSuite('be02-storage', 'tests/indexer/storage.test.ts', { BE02_TEST_ISOLATED: '1', BE02_TEST_DATABASE_URL: url('be02_test', 'be02_test') });
  await testSuite('be03-checkpoint-crash', 'tests/indexer/checkpoint-storage.test.ts', { BE03_TEST_ISOLATED: '1', BE03_TEST_DATABASE_URL: url('be03_test', 'be03_test') });
  await testSuite('be04-projection', 'tests/indexer/projection-storage.test.ts', { BE04_TEST_ISOLATED: '1', BE04_TEST_DATABASE_URL: url('be04_test', 'be04_test') });
  await testSuite('be05-api', 'tests/api/server.test.mjs', { BE05_TEST_ISOLATED: '1', BE05_TEST_DATABASE_URL: url('tv4_be05_api', 'be05_test') });
  await testSuite('be06-two-db', 'tests/indexer/be06-db.test.mjs', { BE06_TEST_ISOLATED: '1',
    BE06_TEST_REFERENCE_DATABASE_URL: url('tv4_be06_reference', 'be06_test'), BE06_TEST_TARGET_DATABASE_URL: url('tv4_be06_target', 'be06_test') });
  await suite('governance-storage', async () => {
    await run('governance-storage', process.execPath, ['--import', 'tsx', 'scripts/smoke_governance.mjs', '--output', join(output, 'governance-storage.json'), '--database'],
      { group: true, timeout: 600_000, env: { TV4_SMOKE_ISOLATED: '1', TV4_SMOKE_DATABASE_URL: url('tv4_governance', 'tv4_smoke'),
        TV4_SMOKE_REBUILD_DATABASE_URL: url('tv4_governance_rebuild', 'tv4_smoke') } });
    const result = JSON.parse(await readFile(join(output, 'governance-storage.json'), 'utf8'));
    assert.equal(result.result, 'passed'); assert.ok(result.storage, 'Storage evidence is mandatory');
  });
  await suite('live-api-be06', async () => {
    await run('live-api-be06', process.execPath, ['--import', 'tsx', 'scripts/check_be04_live.mjs', '--output', join(output, 'live.json'), '--api', '--be06'],
      { group: true, timeout: 600_000, env: { BE04_LIVE_ISOLATED: '1', BE04_LIVE_DATABASE_URL: url('be04_live', 'be04_test'),
        BE06_LIVE_ISOLATED: '1', BE06_LIVE_TARGET_DATABASE_URL: url('tv4_be06_live_target', 'be04_test'),
        BE06_LIVE_ADVANCED_TARGET_DATABASE_URL: url('tv4_be06_live_advanced', 'be04_test') } });
    const result = JSON.parse(await readFile(join(output, 'live.json'), 'utf8'));
    assert.equal(result.status, 'PASS'); assert.equal(result.api?.status, 'PASS'); assert.equal(result.be06?.status, 'PASS');
    assert.equal(result.recovery?.status, 'PASS', 'Reorg, cursor invalidation and heartbeat recovery are mandatory.');
    report.suites['live-api-be06'].evidence = 'live.json';
  });
  if (withBenchmark) await suite('api-benchmark', async () => {
    await run('api-benchmark', process.execPath, ['--import', 'tsx', 'scripts/benchmark_api.mjs', '--output', join(output, 'benchmark.json')],
      { group: true, timeout: 900_000, env: { TV4_BENCHMARK_ISOLATED: '1', TV4_BENCHMARK_DATABASE_URL: url('tv4_benchmark', 'be04_test') } });
    const result = JSON.parse(await readFile(join(output, 'benchmark.json'), 'utf8'));
    assert.equal(result.status, 'PASS');
    report.suites['api-benchmark'].evidence = 'benchmark.json';
  });
} catch (error) {
  report.error = clean(error.message);
} finally {
  const failures = [];
  if (reservation) await new Promise(done => reservation.close(done)).catch(error => failures.push(clean(error.message)));
  for (const pid of groups) await stopGroup(pid).catch(error => failures.push(clean(error.message)));
  let stopped = !startAttempted;
  if (startAttempted) {
    for (const mode of ['fast', 'immediate']) {
      try {
        await run(`postgres-stop-${mode}`, join(bin, 'pg_ctl'), ['stop', '-w', '-t', '15', '-m', mode, '-D', data], { cleanup: true, timeout: 20_000 });
        stopped = true; break;
      } catch {
        try {
          const status = await run(`postgres-status-${mode}`, join(bin, 'pg_ctl'), ['status', '-D', data], { cleanup: true, timeout: 5_000, exits: [0, 3] });
          if (status.exitCode === 3) { stopped = true; break; }
        } catch {}
      }
    }
    if (!stopped) failures.push('Could not stop owned PostgreSQL cluster; retaining its private temporary directory instead of deleting live data');
  }
  if (serverLog) {
    try { await writeFile(join(logs, 'postgres.log'), clean(await readFile(serverLog, 'utf8')), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'ENOENT') failures.push(clean(error.message)); }
  }
  // Existing live helpers write JSON themselves. Scrub even their failure evidence
  // (execFile errors can carry environment URLs); never copy historical evidence.
  async function scrubFiles(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const file = join(path, item.name);
      if (item.isDirectory()) await scrubFiles(file);
      else if (item.isFile()) {
        const original = await readFile(file, 'utf8');
        const safe = clean(original);
        if (safe !== original) await writeFile(file, safe, { mode: 0o600 });
      }
    }
  }
  try { await scrubFiles(output); } catch (error) { failures.push(clean(error.message)); }
  if (stopped) {
    try { await lifecycle.cleanup(); } catch (error) { failures.push(clean(error.message)); }
  } else {
    try { await lifecycle.stopChildren(); } catch (error) { failures.push(clean(error.message)); }
    report.cleanup.retainedCluster = data;
  }
  lifecycle.dispose();
  for (const [signal, handler] of Object.entries(handlers)) process.removeListener(signal, handler);
  report.cleanup = { ...report.cleanup, status: failures.length ? 'FAIL' : 'PASS', clusterStopped: stopped,
    temporaryFilesRemoved: stopped && failures.length === 0, errors: failures };
  report.status = !interrupted && !report.error && failures.length === 0 && Object.values(report.suites).every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
  if (interrupted) report.interruptedBy = interrupted;
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), clean(JSON.stringify(report, null, 2)) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`${report.status}: native TV4 acceptance; evidence: ${join(output, 'report.json')}`);
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : report.status === 'PASS' ? 0 : 1;
}
