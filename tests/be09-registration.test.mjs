import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const rpcUrl = 'http://127.0.0.1:28545';

async function fixture(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'be09-registration-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runtimeDir = join(dir, 'runtime');
  await mkdir(runtimeDir);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const blocks = { GOV: '1', BUD: '2', Treasury: '3', Timelock: '4', Governor: '5' };
  const contracts = Object.fromEntries(Object.entries(blocks).map(([name, deploymentBlock], i) => [name, {
    address: `0x${String(i + 1).padStart(40, '0')}`, deploymentBlock, abiVersion: 'version-1',
  }]));
  const manifest = { format: 'dao-budget-local-governance-v1', sourceCommit: commit, chainId: '31337',
    confirmations: '2', scanFromBlock: '1', contracts, config: { govSupply: '1000', proposalThreshold: '50',
      quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60', votingPeriod: '300', minDelay: '120',
      clockMode: 'mode=timestamp' } };
  const manifestPath = join(dir, 'manifest.json');
  const seedPath = join(dir, 'seed.json');
  const callsPath = join(dir, 'calls.jsonl');
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(seedPath, JSON.stringify({ status: 'PASS', sourceCommit: commit, chainId: '31337', proposalId: '42' }));
  const pgModule = `import {appendFileSync} from 'node:fs';
    const log = event => appendFileSync(process.env.BE09_TEST_CALLS, JSON.stringify(event) + '\\n');
    class Pool { constructor() { log({event:'connect'}); }
      async query(sql, params) { log({sql, params});
        if (sql.startsWith('SELECT count')) return {rows:[{count:'0'}]};
        if (sql.includes('RETURNING deployment_id')) return {rows:[{deployment_id:'7'}]};
        return {rows:[]}; } async end() { log({event:'end'}); } }
    export default {Pool};`;
  const loader = join(dir, 'loader.mjs');
  await writeFile(loader, `import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier, context, next) { if (specifier === 'pg') return {
      url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(pgModule)}), shortCircuit: true};
      return next(specifier, context); }});`);
  const args = ['--manifest', manifestPath, '--runtime', runtimeDir, '--deployment-name',
    'be09-local-20261128T120000Z-123456789abc', '--seed-report', seedPath, '--rpc-url', rpcUrl];
  const env = { ...process.env, BE09_DATABASE_URL: 'postgresql://be09@127.0.0.1:55432/dao_budget_be09',
    BE09_TEST_CALLS: callsPath, BE09_SCOPE: 'issue40' };
  delete env.NODE_TEST_CONTEXT;
  return { dir, runtimeDir, callsPath, args, env, commit,
    run: (argv = args, environment = env) => execute(process.execPath,
      ['--import', loader, join(root, 'scripts/be09-register.mjs'), ...argv], { cwd: root, env: environment }) };
}

async function assertNoWrites(f) {
  await assert.rejects(readFile(f.callsPath), { code: 'ENOENT' });
  for (const name of ['runtime.json', 'runtime.env', 'worker.env', 'indexer-config.json', 'frontend.env']) {
    await assert.rejects(readFile(join(f.runtimeDir, name)), { code: 'ENOENT' });
  }
}

function envValue(text, name) {
  const values = text.split('\n').filter(line => line.startsWith(`${name}=`));
  assert.equal(values.length, 1, name);
  return values[0].slice(name.length + 1);
}

test('registration CLI propagates explicit RPC URL to every output', async t => {
  const f = await fixture(t);
  const { stdout } = await f.run();
  const report = JSON.parse(stdout);
  assert.equal(report.status, 'PASS');
  assert.equal(report.rpcUrl, rpcUrl);
  assert.equal(report.deploymentId, '7');
  assert.equal(report.sourceCommit, f.commit);
  const runtime = JSON.parse(await readFile(join(f.runtimeDir, 'runtime.json'), 'utf8'));
  assert.equal(runtime.urls.rpc, rpcUrl);
  assert.equal(runtime.runtimeDir, f.runtimeDir);
  const runtimeEnv = await readFile(join(f.runtimeDir, 'runtime.env'), 'utf8');
  assert.equal(envValue(runtimeEnv, 'RPC_URL'), rpcUrl);
  assert.equal(envValue(runtimeEnv, 'BE05_LIVE_RPC_URL'), rpcUrl);
  assert.equal(envValue(await readFile(join(f.runtimeDir, 'worker.env'), 'utf8'), 'RPC_URL'), rpcUrl);
  assert.equal(envValue(await readFile(join(f.runtimeDir, 'frontend.env'), 'utf8'), 'VITE_RPC_URL'), rpcUrl);
  const config = JSON.parse(await readFile(join(f.runtimeDir, 'indexer-config.json'), 'utf8'));
  assert.equal(config.rpcUrl, rpcUrl);
  assert.equal(config.fromBlock, '2');
  assert.equal(config.confirmations, 2);
  assert.equal(config.deploymentId, '7');
  assert.deepEqual(config.contracts.map(item => item.role).sort(), ['budget_token', 'governor', 'timelock', 'treasury']);
  const calls = (await readFile(f.callsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.find(call => call.sql?.includes('INSERT INTO deployments')).params[2], '2');
  const roles = calls.filter(call => call.sql?.includes('INSERT INTO deployment_contracts'));
  assert.equal(roles.length, 5);
  assert.deepEqual(roles.map(call => call.params[2]).sort(),
    ['budget_token', 'governance_token', 'governor', 'timelock', 'treasury']);
  assert.equal(roles.find(call => call.params[2] === 'governance_token').params[4], '1');
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});

test('registration rejects malformed flags before any database interaction', async t => {
  const cases = [
    ['missing RPC flag', args => args.slice(0, -2)],
    ['missing RPC value', args => args.slice(0, -1)],
    ['empty RPC value', args => [...args.slice(0, -1), '']],
    ['unknown flag', args => [...args, '--unknown', 'x']],
    ['unknown replacement', args => args.map(arg => arg === '--rpc-url' ? '--other' : arg)],
    ['duplicate RPC flag', args => [...args, '--rpc-url', rpcUrl]],
    ['duplicate manifest flag', args => [...args, '--manifest', args[1]]],
    ['flag instead of value', args => args.filter((_, i) => i !== 1)],
    ['missing runtime flag', args => args.filter((_, i) => i !== 2 && i !== 3)],
    ['unexpected positional value', args => [...args, 'extra']],
  ];
  for (const [name, change] of cases) await t.test(name, async sub => {
    const f = await fixture(sub);
    await assert.rejects(f.run(change(f.args)), error => error.code === 1 && /BE09 registration failed:/.test(error.stderr));
    await assertNoWrites(f);
  });
});

test('registration rejects invalid RPC URLs and scopes before database interaction', async t => {
  const cases = [
    ['protected default', 'http://127.0.0.1:18545', 'issue40'],
    ['protected API', 'http://127.0.0.1:13300', 'issue40'],
    ['protected PostgreSQL', 'http://127.0.0.1:55442', 'issue40'],
    ['unallocated port', 'http://127.0.0.1:28546', 'issue40'],
    ['API collision', 'http://127.0.0.1:3300', 'ordinary'],
    ['database collision', 'http://127.0.0.1:55432', 'ordinary'],
    ['frontend collision', 'http://127.0.0.1:5173', 'ordinary'],
    ['trailing slash', `${rpcUrl}/`, 'ordinary'],
    ['zero padding', 'http://127.0.0.1:028545', 'ordinary'],
    ['hostname', 'http://localhost:28545', 'ordinary'],
    ['empty scope', rpcUrl, ''],
    ['unknown scope', rpcUrl, 'other'],
  ];
  for (const [name, url, scope] of cases) await t.test(name, async sub => {
    const f = await fixture(sub);
    await assert.rejects(f.run([...f.args.slice(0, -1), url], { ...f.env, BE09_SCOPE: scope }));
    await assertNoWrites(f);
  });
});

test('registration rejects noncanonical and symlink runtime paths before database interaction', async t => {
  for (const kind of ['symlink', 'dot segment', 'relative', 'missing']) await t.test(kind, async sub => {
    const f = await fixture(sub);
    let path;
    if (kind === 'symlink') {
      path = join(f.dir, 'runtime-link');
      await symlink(f.runtimeDir, path);
    } else if (kind === 'dot segment') path = `${f.runtimeDir}/../runtime`;
    else if (kind === 'relative') path = '.';
    else path = join(f.dir, 'missing');
    const args = [...f.args];
    args[3] = path;
    await assert.rejects(f.run(args));
    await assertNoWrites(f);
  });
});

test('ordinary registration accepts the explicit legacy RPC allocation', async t => {
  const f = await fixture(t);
  const env = { ...f.env };
  delete env.BE09_SCOPE;
  const { stdout } = await f.run([...f.args.slice(0, -1), 'http://127.0.0.1:18545'], env);
  assert.equal(JSON.parse(stdout).rpcUrl, 'http://127.0.0.1:18545');
});

test('Issue40 registration rejects protected or inconsistent DB URLs before connection', async t => {
  for (const url of ['postgresql://be09@127.0.0.1:55442/dao_budget_be09', 'postgresql://be09@127.0.0.1:5432/dao_budget_be09', 'postgresql://example.invalid/test']) {
    const f = await fixture(t);
    await assert.rejects(f.run(f.args, { ...f.env, BE09_DATABASE_URL: url }), error => /private database allocation/.test(error.stderr));
    await assertNoWrites(f);
  }
});
