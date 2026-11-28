// Reviewer-only offline reproduction. NOT EXECUTED by the review worker.
// Run explicitly with Node 24.15.0 after review:
// node /tmp/tv4-20261128/Issue40MetadataReview-repro.mjs /tmp/dao-tv4-issue40-source-review
// No sockets, database connections, service starts, or signals are performed.
// The production readiness-failure branch is extracted verbatim; only readiness
// and postgres ownership are simulated. Metadata validation and diagnose run real.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '/tmp/dao-tv4-issue40-source-review');
const runnerPath = join(root, 'scripts/be09-local.sh');
const runner = await readFile(runnerPath, 'utf8');
const start = runner.indexOf("  if ! wait_api_ready 'http://127.0.0.1:3300' \"$deployment_name\"; then\n");
const end = runner.indexOf("  start_service 'Frontend Vite'", start);
assert.ok(start >= 0 && end > start, 'Production diagnostic branch was not found');
const branch = runner.slice(start, end);
const stateRoot = await mkdtemp(join(tmpdir(), 'dao-budget-issue40-lifecycle-reviewer-'));
try {
  const runDir = join(stateRoot, 'runs/reviewer');
  for (const relative of ['pids', 'postgres/data', 'public', 'reports', 'cache/vite']) {
    await mkdir(join(runDir, relative), { recursive: true });
  }
  const rpcUrl = 'http://127.0.0.1:28545'; // Persisted string only; never contacted.
  const databaseUrl = 'postgresql://be09@127.0.0.1:55432/dao_budget_be09'; // String only.
  const options = { root, stateRoot, runDir, rpcUrl, scope: 'issue40' };
  const { initializeRun, sealRun } = await import(pathToFileURL(join(root, 'scripts/be09-metadata.mjs')));
  await writeFile(join(runDir, 'run-id'), 'reviewer\n');
  const identity = await initializeRun(options);
  const deploymentName = 'be09-local-20261128T120000Z-0123456789ab';
  const runtime = {
    format: 'dao-budget-be09-runtime-v1', sourceCommit: identity.sourceCommit,
    chainId: '31337', runId: 'reviewer', runtimeDir: runDir, urls: identity.urls,
    deploymentName, deploymentId: '1', proposalId: '42',
    manifest: join(runDir, 'public/manifest.json'),
    seedReport: join(runDir, 'reports/governance-seed.json'),
    indexerConfig: join(runDir, 'indexer-config.json'), workerEnv: join(runDir, 'worker.env'),
  };
  const json = async (relative, value) => writeFile(join(runDir, relative), JSON.stringify(value) + '\n');
  await json('runtime.json', runtime);
  await json('public/manifest.json', { format: 'dao-budget-local-governance-v1', sourceCommit: identity.sourceCommit, chainId: '31337', confirmations: '2' });
  await json('reports/governance-seed.json', { sourceCommit: identity.sourceCommit, chainId: '31337', status: 'PASS', proposalId: '42' });
  await json('reports/source-provenance.json', identity.source);
  await json('indexer-config.json', { rpcUrl, chainId: '31337', deploymentId: '1' });
  await writeFile(join(runDir, 'runtime.env'), `DATABASE_URL=${databaseUrl}\nRPC_URL=${rpcUrl}\nBE05_LIVE_RPC_URL=${rpcUrl}\nAPI_HOST=127.0.0.1\nAPI_PORT=3300\nAPI_CORS_ORIGINS=${identity.urls.frontend}\nDEPLOYMENT_NAME=${deploymentName}\nBE05_LIVE_API_URL=${identity.urls.api}\nBE05_LIVE_CHAIN_ID=31337\nBE05_LIVE_DEPLOYMENT_ID=${deploymentName}\n`);
  await writeFile(join(runDir, 'worker.env'), `DATABASE_URL=${databaseUrl}\nRPC_URL=${rpcUrl}\n`);
  await writeFile(join(runDir, 'frontend.env'), `VITE_RPC_URL=${rpcUrl}\nVITE_API_BASE_URL=${identity.urls.api}\nVITE_CHAIN_ID=31337\nVITE_DEPLOYMENT_ID=${deploymentName}\nDAO_VITE_CACHE_DIR=${join(runDir, 'cache/vite')}\n`);
  await sealRun(options);

  const eventsPath = join(stateRoot, 'events.jsonl');
  const loaderPath = join(stateRoot, 'offline-loader.mjs');
  const fakePg = `import {appendFileSync} from 'node:fs';
    const log = event => appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify(event)+'\\n');
    class Client {
      constructor(options) { log({kind:'db-client',connectionString:options.connectionString}); }
      async connect() { log({kind:'db-connect-blocked'}); throw new Error('Reviewer deliberately blocks all database connections'); }
      async query() { throw new Error('Reviewer forbids database queries'); }
      async end() {}
    }
    export default {Client};`;
  await writeFile(loaderPath, `import {registerHooks} from 'node:module';
    import {appendFileSync} from 'node:fs';
    registerHooks({resolve(specifier, context, next) {
      if (specifier === 'pg') return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(fakePg)}),shortCircuit:true};
      return next(specifier, context);
    }});
    globalThis.fetch = async url => {
      appendFileSync(${JSON.stringify(eventsPath)},JSON.stringify({kind:'fetch-blocked',url:String(url)})+'\\n');
      return {status:200,text:async()=>JSON.stringify({data:{}}),json:async()=>({data:{}})};
    };\n`);

  const shell = `
    source "$1" help >/dev/null
    RUN_DIR="$2"
    NODE_BIN="$4"
    deployment_name=${deploymentName}
    wait_api_ready() {
      printf '%s\\n' '{"kind":"readiness-failed-before-probe"}' >> "$REVIEW_EVENTS"
      return 1
    }
    # The runner already authenticated its private postgres; the API is absent.
    # This returns false if a corrected branch starts guarding the API.
    owned() {
      printf '{"kind":"ownership","label":"%s","port":"%s"}\\n' "$1" "\${2:-}" >> "$REVIEW_EVENTS"
      [[ "$1" = postgres && "\${2:-}" = 55432 ]]
    }
    reviewer_readiness_failure() {
${branch}
    }
    if reviewer_readiness_failure "$1" "$2" "$3"; then exit 91; else [[ $? = 1 ]]; fi
  `;
  const result = spawnSync('bash', ['-c', shell, 'reviewer', runnerPath, runDir, eventsPath, process.execPath], {
    cwd: root,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: stateRoot,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
      BE09_STATE_ROOT: stateRoot, BE09_SCOPE: 'issue40',
      NODE_OPTIONS: `--import=${pathToFileURL(loaderPath).href}`, REVIEW_EVENTS: eventsPath },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const events = (await readFile(eventsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.some(event => event.kind === 'readiness-failed-before-probe'));
  const ownership = events.filter(event => event.kind === 'ownership');
  assert.deepEqual(ownership.map(event => [event.label, event.port]), [['postgres', '55432']]);
  const requests = events.filter(event => event.kind === 'fetch-blocked').map(event => event.url);
  assert.deepEqual(requests, [
    `http://127.0.0.1:3300/api/health?chainId=31337&deploymentId=${deploymentName}`,
    `http://127.0.0.1:3300/api/summary?chainId=31337&deploymentId=${deploymentName}`,
  ]);
  assert.equal(events.filter(event => event.kind === 'db-client').length, 2);
  assert.equal(events.filter(event => event.kind === 'db-connect-blocked').length, 2);
  console.log(JSON.stringify({ result: 'REPRODUCED_IN_OFFLINE_SHIMS', actualMetadataValidation: true,
    missingApiIdentity: true, mockedReadinessAndPostgresOwnership: true,
    attemptedApiRequests: requests, attemptedDbConnections: 2,
    realNetworkConnections: 0, realDatabaseConnections: 0, serviceStarts: 0, signals: 0 }));
} finally {
  await rm(stateRoot, { recursive: true, force: true });
}
