import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { initializeRun, sealRun, validateRun } from '../scripts/be09-metadata.mjs';
import { captureProcess, assertOwnedProcess } from '../scripts/be09-safety.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'scripts/be09-local.sh');
const diagnostic = join(root, 'scripts/be09-diagnose.mjs');
const apiLog = 'fixture: API startup/readiness failed\n';
const workerLog = 'fixture: worker local failure context\n';

async function setup(t, { api = 'missing', postgres = true, loseAfterHealth = false, databaseFailure = true, failReport = false } = {}) {
  const stateRoot = await mkdtemp(join(tmpdir(), 'dao-budget-issue40-lifecycle-f40-unit-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const runDir = join(stateRoot, 'runs/unit');
  for (const dir of ['pids', 'postgres/data', 'reports', 'public', 'cache/vite', 'logs']) await mkdir(join(runDir, dir), { recursive: true });
  const options = { root, stateRoot, runDir, rpcUrl: 'http://127.0.0.1:28545', scope: 'issue40' };
  await writeFile(join(runDir, 'run-id'), 'unit\n');
  const identity = await initializeRun(options);
  const deploymentName = 'be09-local-20261128T120000Z-0123456789ab';
  const runtime = { format: 'dao-budget-be09-runtime-v1', sourceCommit: identity.sourceCommit, chainId: '31337', runId: 'unit', runtimeDir: runDir, urls: identity.urls, deploymentName, deploymentId: '1', proposalId: '42', manifest: join(runDir, 'public/manifest.json'), seedReport: join(runDir, 'reports/governance-seed.json'), indexerConfig: join(runDir, 'indexer-config.json'), workerEnv: join(runDir, 'worker.env') };
  const json = (name, value) => writeFile(join(runDir, name), JSON.stringify(value) + '\n');
  await json('runtime.json', runtime);
  await json('public/manifest.json', { format: 'dao-budget-local-governance-v1', sourceCommit: identity.sourceCommit, chainId: '31337', confirmations: '2' });
  await json('reports/governance-seed.json', { sourceCommit: identity.sourceCommit, chainId: '31337', status: 'PASS', proposalId: '42' });
  await json('reports/source-provenance.json', identity.source);
  await json('indexer-config.json', { rpcUrl: options.rpcUrl, chainId: '31337', deploymentId: '1' });
  const db = 'postgresql://be09@127.0.0.1:55432/dao_budget_be09';
  await writeFile(join(runDir, 'runtime.env'), `DATABASE_URL=${db}\nRPC_URL=${options.rpcUrl}\nBE05_LIVE_RPC_URL=${options.rpcUrl}\nAPI_HOST=127.0.0.1\nAPI_PORT=3300\nAPI_CORS_ORIGINS=${identity.urls.frontend}\nDEPLOYMENT_NAME=${deploymentName}\nBE05_LIVE_API_URL=${identity.urls.api}\nBE05_LIVE_CHAIN_ID=31337\nBE05_LIVE_DEPLOYMENT_ID=${deploymentName}\n`);
  await writeFile(join(runDir, 'worker.env'), `DATABASE_URL=${db}\nRPC_URL=${options.rpcUrl}\n`);
  await writeFile(join(runDir, 'frontend.env'), `VITE_RPC_URL=${options.rpcUrl}\nVITE_API_BASE_URL=${identity.urls.api}\nVITE_CHAIN_ID=31337\nVITE_DEPLOYMENT_ID=${deploymentName}\nDAO_VITE_CACHE_DIR=${join(runDir, 'cache/vite')}\n`);
  await sealRun(options);
  assert.deepEqual((await validateRun(options)).runtime, runtime);
  await writeFile(join(runDir, 'logs/api.log'), apiLog);
  await writeFile(join(runDir, 'logs/worker.log'), workerLog);

  const children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  });
  let port = 0;
  async function listener(requestedPort) {
    const child = spawn(process.execPath, [`--env-file=${join(runDir, 'runtime.env')}`, '-e', `
      const server=require('node:http').createServer((_,r)=>r.end('foreign or owned fixture'));
      const listen=()=>server.listen(${requestedPort ?? 0} || (60000+require('node:crypto').randomInt(5000)), '127.0.0.1',()=>process.send({port:server.address().port}));
      server.on('error',e=>{if(e.code==='EADDRINUSE'&&${requestedPort === undefined})listen();else process.exit(1)});listen();`], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    const message = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error('fixture listener failed'); })]);
    return { child, port: message[0].port };
  }
  if (api !== 'missing') {
    const owned = await listener();
    port = owned.port;
    await writeFile(join(runDir, 'pids/api.pid'), `${owned.child.pid}\n`);
    await captureProcess({ runDir, label: 'api', pid: owned.child.pid, executable: process.execPath, marker: join(runDir, 'runtime.env'), parentPid: process.pid });
    await assertOwnedProcess({ runDir, label: 'api', port });
    if (api === 'reclaimed') {
      const exited = once(owned.child, 'exit'); owned.child.kill('SIGTERM'); await exited;
      await listener(port);
    } else if (api === 'mismatch') {
      const file = join(runDir, 'pids/api.identity.json');
      const value = JSON.parse(await readFile(file, 'utf8')); value.startTicks = String(BigInt(value.startTicks) + 1n);
      await writeFile(file, JSON.stringify(value));
    }
  }
  const eventsPath = join(stateRoot, 'events.jsonl');
  const loader = join(stateRoot, 'intercept.mjs');
  const logSource = `import {appendFileSync,readFileSync,writeFileSync} from 'node:fs'; const log=e=>appendFileSync(${JSON.stringify(eventsPath)},JSON.stringify(e)+'\\n');`;
  const safetyUrl = pathToFileURL(join(root, 'scripts/be09-safety.mjs')).href + '?f40-real';
  // PG ownership is simulated; API checks use the REAL existing /proc helper.
  // Map only the fixture's API allocated-port check to an owned high port.
  const safetyShim = `${logSource}
    export * from ${JSON.stringify(safetyUrl)};
    import {assertOwnedProcess as real} from ${JSON.stringify(safetyUrl)};
    export async function assertOwnedProcess(options) {
      log({kind:'ownership',label:options.label,port:options.port});
      if(options.runDir!==${JSON.stringify(runDir)})throw Error('wrong diagnostic run');
      if(options.label==='postgres') { if(options.port!==55432)throw Error('wrong PG allocation');if(${postgres})return {fixture:true};throw Error('fixture PG ownership absent'); }
      if(options.label==='api'&&options.port!==3300)throw Error('API listener port guard required');
      return real({...options,port:options.label==='api'?${port}:options.port});
    }`;
  const pgShim = `${logSource}
    class Client {
      constructor(options){log({kind:'db-client',url:options.connectionString});}
      async connect(){log({kind:'db-connect-intercepted'});if(${databaseFailure})throw Error('fixture blocks real DB');}
      async query(sql){log({kind:'db-query',sql});return {rows:sql.includes('current_database()')?[{database:'unit',host:'127.0.0.1',port:55432,system_id:'unit'}]:[]};}
      async end(){}
    }export default {Client};`;
  const fsShim = `${logSource}
    export * from 'node:fs/promises';
    import {writeFile as realWrite} from 'node:fs/promises';
    export function writeFile(...args){if(${failReport}){log({kind:'diagnostic-write-failed'});throw Error('fixture report write failure');}return realWrite(...args);}`;
  await writeFile(loader, `import {registerHooks} from 'node:module'; ${logSource}
    registerHooks({resolve(specifier,context,next){
      if(specifier==='pg')return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(pgShim)}),shortCircuit:true};
      if(specifier==='node:fs/promises'&&context.parentURL===${JSON.stringify(pathToFileURL(diagnostic).href)})return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(fsShim)}),shortCircuit:true};
      if(specifier.endsWith('/be09-safety.mjs'))return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(safetyShim)}),shortCircuit:true};
      return next(specifier,context);
    }});
    globalThis.fetch=async url=>{
      log({kind:'http-intercepted',url:String(url)});
      if(${loseAfterHealth}&&new URL(url).pathname==='/api/health') {
        const file=${JSON.stringify(join(runDir, 'pids/api.identity.json'))}; const value=JSON.parse(readFileSync(file));value.startTicks='0';writeFileSync(file,JSON.stringify(value));
      }
      return {status:200,text:async()=>JSON.stringify({data:{publication:'ready',indexer:'synced'}})};
    };
    process.kill=()=>{log({kind:'signal-blocked'});throw Error('fixture forbids diagnostic signals');};
  `);
  const env = { PATH: process.env.PATH, HOME: stateRoot, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '', BE09_STATE_ROOT: stateRoot, BE09_SCOPE: 'issue40', NODE_OPTIONS: `--import=${pathToFileURL(loader).href}`, F40_EVENTS: eventsPath };
  async function execute({ direct = false, invalidOutput = false, override } = {}) {
    const text = await readFile(runner, 'utf8');
    const start = text.indexOf("  if ! wait_api_ready 'http://127.0.0.1:3300' \"$deployment_name\"; then\n");
    const end = text.indexOf("  start_service 'Frontend Vite'", start);
    assert.ok(start >= 0 && end > start, 'actual runner failure branch must exist');
    const branch = text.slice(start, end);
    const shell = `source "$1" help >/dev/null
      RUN_DIR="$2"; NODE_BIN="$3"; deployment_name=${deploymentName}
      wait_api_ready(){ printf '%s\\n' '{"kind":"readiness-failed"}' >> "$F40_EVENTS"; return 1; }
      owned(){
        printf '{"kind":"runner-ownership","label":"%s","port":"%s"}\\n' "$1" "\${2:-}" >> "$F40_EVENTS"
        [[ "$1" = postgres && "\${2:-}" = 55432 && ${postgres} = true ]]
      }
      start_service(){ printf '%s\\n' '{"kind":"unexpected-service-start"}' >> "$F40_EVENTS"; return 99; }
      fail_startup(){
${branch}
        start_service frontend
      }
      fail_startup
    `;
    const args = direct ? [diagnostic, runDir, invalidOutput ? join(runDir, 'reports/absent/output.json') : join(runDir, 'reports/direct.json')] : ['-c', shell, 'unit', runner, runDir, process.execPath];
    const result = spawnSync(direct ? process.execPath : 'bash', args, { cwd: root, env: { ...env, ...(override ? { BE09_DIAGNOSTIC_DATABASE_URL: override } : {}) }, encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    const events = (await readFile(eventsPath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const reportPath = join(runDir, direct ? 'reports/direct.json' : 'reports/readiness-timeout/diagnostic.json');
    const report = await readFile(reportPath, 'utf8').then(JSON.parse).catch(() => null);
    const counts = { httpAttempts: events.filter(e => e.kind === 'http-intercepted').length, dbAttempts: events.filter(e => e.kind === 'db-connect-intercepted').length, signals: events.filter(e => e.kind === 'signal-blocked').length, unexpectedStarts: events.filter(e => e.kind === 'unexpected-service-start').length };
    console.log(JSON.stringify({ api, postgres, direct, ...counts, exit: result.status, stdout: result.stdout, stderr: result.stderr, realNetworkConnections: 0, realDatabaseConnections: 0 }));
    if (!direct) {
      assert.equal(result.status, 1, 'original startup failure must remain failure');
      assert.equal(await readFile(join(runDir, 'reports/readiness-timeout/api.log'), 'utf8'), apiLog);
      assert.equal(await readFile(join(runDir, 'reports/readiness-timeout/worker.log'), 'utf8'), workerLog);
    }
    assert.equal(counts.signals, 0);
    assert.equal(counts.unexpectedStarts, 0);
    for (const child of children) if (child.signalCode === null && child.exitCode === null) process.kill(child.pid, 0);
    assert.ok(!events.some(e => e.kind === 'ownership' && e.label === 'frontend'), 'frontend has not started; do not require full-tuple liveness');
    return { result, events, report, counts };
  }
  return { execute };
}

test('F40-1 API identity missing: actual runner failure branch makes zero HTTP attempts', async t => {
  const { counts, report } = await (await setup(t)).execute();
  assert.equal(counts.httpAttempts, 0);
  assert.ok(counts.dbAttempts > 0, 'owned private PG still allows DB-only diagnostics');
  assert.match(report.responses.health.skipped, /ownership/);
  assert.match(report.responses.summary.skipped, /ownership/);
});
for (const api of ['reclaimed', 'mismatch']) {
  test(`F40-1 API ${api}: actual failure branch never probes foreign/unowned listener`, async t => {
    const { counts } = await (await setup(t, { api })).execute();
    assert.equal(counts.httpAttempts, 0);
    assert.ok(counts.dbAttempts > 0);
  });
}
test('F40-1 owned API diagnostics retain health/summary without frontend startup', async t => {
  const { counts, report, events } = await (await setup(t, { api: 'owned', databaseFailure: false })).execute();
  assert.equal(counts.httpAttempts, 2);
  assert.equal(counts.dbAttempts, 2);
  assert.equal(report.responses.health.status, 200);
  assert.equal(report.responses.summary.status, 200);
  assert.equal(report.conditions.databaseIdentity.status, 'PASS');
  assert.ok(events.some(e => e.kind === 'db-query' && e.sql.includes('READ ONLY')));
});
test('F40-1 direct CLI with neither API nor PostgreSQL ownership stays offline', async t => {
  const { counts, report, result } = await (await setup(t, { postgres: false })).execute({ direct: true });
  assert.equal(result.status, 0);
  assert.equal(counts.httpAttempts, 0);
  assert.equal(counts.dbAttempts, 0);
  assert.equal(report.databaseDiagnostic.status, 'SKIP');
});
test('F40-1 runner preserves local logs and failure when PostgreSQL is unowned', async t => {
  const { counts, report } = await (await setup(t, { postgres: false })).execute();
  assert.equal(counts.httpAttempts, 0);
  assert.equal(counts.dbAttempts, 0);
  assert.equal(report, null);
});
test('F40-1 direct CLI cannot bypass API ownership with valid sealed metadata', async t => {
  const { counts, report } = await (await setup(t)).execute({ direct: true });
  assert.equal(counts.httpAttempts, 0);
  assert.ok(counts.dbAttempts > 0);
  assert.match(report.responses.health.skipped, /ownership/);
});
test('F40-1 direct owned API stops probing after ownership changes during health', async t => {
  const { counts, report } = await (await setup(t, { api: 'owned', loseAfterHealth: true })).execute({ direct: true });
  assert.equal(counts.httpAttempts, 1);
  assert.equal(report.responses.health.status, 200);
  assert.match(report.responses.summary.skipped, /ownership/);
});
test('F40-1 diagnostic write failure does not hide startup failure', async t => {
  const fixture = await setup(t);
  const { result, counts } = await fixture.execute({ direct: true, invalidOutput: true });
  assert.equal(result.status, 1);
  assert.equal(counts.httpAttempts, 0);
});
test('F40-1 diagnostic DB override cannot bypass private allocation', async t => {
  const { counts } = await (await setup(t)).execute({ direct: true, override: 'postgresql://example.invalid/unowned' });
  assert.equal(counts.httpAttempts, 0);
  assert.equal(counts.dbAttempts, 0);
});

test('F40-1 actual runner keeps failure and local logs when diagnostic output fails', async t => {
  const { result, counts, report, events } = await (await setup(t, { failReport: true })).execute();
  assert.equal(result.status, 1);
  assert.equal(counts.httpAttempts, 0);
  assert.ok(counts.dbAttempts > 0);
  assert.equal(report, null);
  assert.ok(events.some(e => e.kind === 'diagnostic-write-failed'));
  assert.match(result.stdout, /Readiness diagnostic could not complete; logs retained/);
});
