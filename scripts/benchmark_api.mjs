#!/usr/bin/env node
// Derived from TV4 d2617d0/fa498d6, Phan Thanh Dũng (ref 213f9f7).
// BE08 uses migration 005, the real CLI worker, and NFR03/04 probes.
// NFR02: caller supplies one NEW disposable native database; this script owns Anvil.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Interface, id, toQuantity } from 'ethers';
import pg from 'pg';
import { deployGovernance } from './governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from './receipt.mjs';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';
import { HttpRpc } from '../indexer/rpc.ts';
import { startWorkerProbe } from './be08_worker_probe.mjs';
import { measureJson, metrics } from './be08_measurement.mjs';
import { createApiServer } from '../indexer/api/server.ts';
import { assertEmptyDatabase } from '../indexer/be06/rebuild.ts';

const usage = 'Usage: TV4_BENCHMARK_ISOLATED=1 TV4_BENCHMARK_DATABASE_URL=postgresql://be04_test:<password>@127.0.0.1:<port>/tv4_benchmark node --import tsx scripts/benchmark_api.mjs --output <new-report.json>';
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--output' && args[1], usage);
assert.equal(process.env.TV4_BENCHMARK_ISOLATED, '1', usage);
assert.ok(process.env.TV4_BENCHMARK_DATABASE_URL, usage);
const dbUrl = new URL(process.env.TV4_BENCHMARK_DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(dbUrl.protocol), 'PostgreSQL URL required');
assert.ok(['127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'Numeric loopback database required');
assert.equal(dbUrl.username, 'be04_test', 'Dedicated be04_test role required');
assert.equal(dbUrl.pathname, '/tv4_benchmark', 'Dedicated tv4_benchmark database required');
assert.ok(dbUrl.port && !dbUrl.search && !dbUrl.hash, 'Explicit port and no query/fragment required');
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node >=24 required');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(args[1]);
// O_EXCL reserves the new evidence path, including against concurrent invocations.
// A failure after reservation is written as FAIL, never as an old success report.
const evidence = await open(output, 'wx', 0o600);
const scope = createSmokeLifecycle();
// Reuse its resource ownership, but own signals so API/pool close and FAIL evidence
// are also awaited; the helper's default handler only knows children/directories.
scope.dispose();
const controller = new AbortController();
const handlers = Object.fromEntries(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
  if (!controller.signal.aborted) controller.abort(new Error(`Interrupted by ${signal}`));
}]));
for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
const check = () => controller.signal.throwIfAborted();
const redact = value => String(value).replaceAll(process.env.TV4_BENCHMARK_DATABASE_URL, '[REDACTED_DATABASE_URL]')
  .replaceAll(decodeURIComponent(dbUrl.password) || '\u0000', '[REDACTED]')
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
const U = 10n ** 18n;
const durationMs = 60_000;
const concurrency = 10;
const report = {
  format: 'dao-budget-be08-nfr02-04-v2', status: 'RUNNING', startedAt: new Date().toISOString(),
  command: ['node', '--import', 'tsx', 'scripts/benchmark_api.mjs', '--output', args[1]],
  environment: { required: ['TV4_BENCHMARK_ISOLATED=1', 'TV4_BENCHMARK_DATABASE_URL'],
    database: { host: dbUrl.hostname, port: Number(dbUrl.port), user: 'be04_test', name: 'tv4_benchmark' },
    optional: ['ANVIL_BIN', 'FORGE_BIN'], callerDatabaseAndRpcIgnored: true },
  scope: 'Real unforked owned Anvil, deployed production contracts, genuine transactions, BE03/BE04/BE05/BE07, actual CLI worker, loopback HTTP. Not testnet, remote-client, or browser performance.',
  method: { concurrency, durationMs, model: 'Ten closed-loop HTTP clients, one outstanding request each, no think time or request retries; starts stop after at least 60s and completion of ten concurrent freshness samples; in-flight requests drain. Client, API and PostgreSQL are loopback; client/API share one Node process, worker is a separate CLI process.',
    timedCycle: ['list', 'list', 'summary', 'detail', 'votes', 'transfers'], intendedPercent: { list: 100/3, summary: 100/6, detail: 100/6, votes: 100/6, transfers: 100/6 },
    extraRoutes: 'Health measured separately (100 sequential reads), excluded from data percentiles. Data reads pin the baseline H/hash snapshot; event probes use latest transfers and verify the new publication.',
    latency: 'Monotonic performance.now(), immediately before fetch through complete JSON body consumption; semantic validation occurs afterward.',
    percentile: 'Exact nearest-rank: sorted successful request latencies at ceil(0.95*N)-1. Errors reported separately and any error fails acceptance.',
    threshold: 'Global and each timed endpoint successful p95 strictly <1000ms, zero errors, exact 100 proposals/1000 indexed votes.',
    timestampControl: 'LOCAL Anvil anvil_setBlockTimestampInterval(0), explicit identical timestamp per transaction, every receipt header checked; no production config changed.',
    accountPolicy: 'Standard ten unlocked Anvil accounts (no keys or impersonation); each holds and self-delegates 100 GOV. Historical Q-PERF named Y is replaced by the tenth standard account.' },
  machine: { hostname: os.hostname(), platform: os.platform(), release: os.release(), version: os.version(), arch: os.arch(),
    logicalCpuCount: os.cpus().length, availableParallelism: os.availableParallelism(),
    cpus: os.cpus().map(({ model, speed }) => ({ model, nominalMHz: speed })),
    totalRamBytes: os.totalmem(), freeRamBytesAtStart: os.freemem(), loadAverageAtStart: os.loadavg() },
  runtime: { node: process.version, versions: process.versions, compiler: '0.8.37+commit.f401782d', evm: 'osaka' },
  baseCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  timingsMs: {}, sourceHashes: {}, transactions: [], cleanup: { status: 'NOT_RUN' },
};
let pool;
let workerProbe;
let freshnessDeposits = 0;
let lock;
let api;
let anvil;
let anvilOutput = '';
let stage = 'database_isolation';
let failure;
async function timed(name, work) {
  check();
  stage = name;
  const started = performance.now();
  try { return await work(); } finally { report.timingsMs[name] = performance.now() - started; }
}
async function reservePort() {
  const reservation = createServer();
  await new Promise((done, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', done); });
  const port = reservation.address().port;
  await new Promise((done, reject) => reservation.close(error => error ? reject(error) : done()));
  return port;
}

try {
  // Explicit connection fields, including TLS/options, prevent libpq/PG* ambient
  // settings from selecting a different destination or schema.
  pool = new pg.Pool({ host: dbUrl.hostname.replace(/^\[|\]$/g, ''), port: Number(dbUrl.port), user: 'be04_test',
    password: decodeURIComponent(dbUrl.password), database: 'tv4_benchmark', ssl: false,
    options: '-c search_path=public', application_name: 'tv4-nfr02-benchmark',
    max: 11, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  pool.on('error', error => { if (!controller.signal.aborted) controller.abort(new Error(`Database pool error: ${redact(error.message)}`)); });
  lock = await pool.connect();
  const identity = (await lock.query(`SELECT current_database() AS database,current_user AS role,
    host(inet_server_addr()) AS address,inet_server_port() AS port,version() AS version,
    (SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database()) AS owned`)).rows[0];
  assert.equal(identity.database, 'tv4_benchmark');
  assert.equal(identity.role, 'be04_test');
  assert.equal(identity.owned, true, 'Connecting role must own disposable database');
  assert.ok(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(lock.connection.stream.remoteAddress));
  assert.ok(['127.0.0.1', '::1'].includes(identity.address), 'Native loopback PostgreSQL required');
  assert.match(identity.version, /PostgreSQL 18\.4(?:\s|$)/, 'PostgreSQL18.4 required');
  assert.equal((await lock.query('SELECT pg_try_advisory_lock(747004, 2) AS acquired')).rows[0].acquired, true, 'Another benchmark owns this database');
  await assertEmptyDatabase(pool);
  const extras = (await pool.query(`SELECT (SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql')::text AS extensions,
    (SELECT count(*) FROM pg_largeobject_metadata)::text AS large_objects`)).rows[0];
  assert.deepEqual(extras, { extensions: '0', large_objects: '0' }, 'Database must be new and empty');
  report.databaseIdentity = identity;
  report.runtime.postgres = identity.version;
  for (const name of ['tsx', 'typescript', 'pg', 'ethers'])
    report.runtime[name] = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
  for (const path of ['scripts/benchmark_api.mjs', 'scripts/governance_local.mjs', 'scripts/smoke_lifecycle.mjs',
    'scripts/be08_worker_probe.mjs','scripts/be08_measurement.mjs','indexer/worker.ts','indexer/cli.ts','indexer/recovery.ts','indexer/rpc.ts','indexer/storage.ts','indexer/api/server.ts', 'indexer/syncer.ts', 'indexer/projection/projector.ts', 'package-lock.json',
    ...['001_initial', '002_be03', '003_be04', '004_be05_api', '005_be07'].map(name => `database/migrations/${name}.sql`)])
    report.sourceHashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
  await timed('migrations', async () => {
    for (const name of ['001_initial', '002_be03', '003_be04', '004_be05_api', '005_be07'])
      await pool.query(await readFile(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
  });
  const port = await reservePort();
  const bin = process.env.ANVIL_BIN ?? 'anvil';
  report.runtime.anvil = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  report.runtime.forge = execFileSync(process.env.FORGE_BIN ?? 'forge', ['--version'], { encoding: 'utf8' }).trim();
  const anvilArgs = ['--host', '127.0.0.1', '--port', String(port), '--accounts', '10', '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'];
  report.anvilCommand = [bin, ...anvilArgs];
  anvil = scope.spawn(bin, anvilArgs, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  anvil.on('error', error => { anvilOutput += error.message; });
  for (const stream of [anvil.stdout, anvil.stderr]) stream.on('data', chunk => { anvilOutput = (anvilOutput + chunk).slice(-32_000); });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const transport = new HttpRpc(rpcUrl);
  const rpc = (method, params = []) => { check(); return transport.call(method, params); };
  await timed('anvil_startup', async () => {
    let ready = false;
    // Startup readiness only, never a retry policy for transactions or API reads.
    for (let attempt = 0; attempt < 100; attempt++) {
      check();
      assert.equal(anvil.exitCode, null, `Owned Anvil exited: ${anvilOutput}`);
      try { ready = await rpc('eth_chainId') === '0x7a69'; } catch (error) { check(); }
      if (ready) break;
      await new Promise(done => setTimeout(done, 50));
    }
    assert.ok(ready, `Owned Anvil startup failed: ${anvilOutput}`);
  });
  const wallets = await rpc('eth_accounts');
  assert.equal(wallets.length, 10, 'Ten standard unlocked accounts required');
  assert.equal(new Set(wallets.map(value => value.toLowerCase())).size, 10);
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, wallets[i]]));
  const { manifest, abis } = await timed('deployment', () => deployGovernance(rpc, { root, accounts }));
  report.manifest = manifest;
  const abi = Object.fromEntries(Object.entries(abis).map(([name, value]) => [name, new Interface(value)]));
  const address = Object.fromEntries(Object.entries(manifest.contracts).map(([name, value]) => [name, value.address]));
  const call = async (name, method, values = [], at = 'latest') => abi[name].decodeFunctionResult(method,
    await rpc('eth_call', [{ to: address[name], data: abi[name].encodeFunctionData(method, values) }, at]));
  const tx = async (label, from, name, method, values, timestamp) => {
    await rpc('evm_setNextBlockTimestamp', [toQuantity(timestamp)]);
    const hash = await rpc('eth_sendTransaction', [{ from, to: address[name], data: abi[name].encodeFunctionData(method, values), gas: toQuantity(8_000_000) }]);
    const receipt = await waitForReceipt(rpc, hash, { step: label });
    assertReceiptStatus(receipt, hash, label);
    const header = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
    assert.equal(BigInt(header.timestamp), timestamp, `${label}: local timestamp drift`);
    report.transactions.push({ label, transactionHash: hash, blockNumber: String(BigInt(receipt.blockNumber)), blockHash: receipt.blockHash, timestamp: String(timestamp), gasUsed: String(BigInt(receipt.gasUsed)), status: receipt.status });
    return receipt;
  };
  await rpc('anvil_setBlockTimestampInterval', [0]);
  const base = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
  const t0 = base + 4n;
  await timed('redistribution_and_delegation', async () => {
    // 400/300/200/100 initial allocation becomes exactly 100 for every wallet.
    for (const [source, destination] of [[0, 4], [0, 5], [0, 6], [1, 7], [1, 8], [2, 9]])
      await tx(`redistribute GOV ${source}->${destination}`, wallets[source], 'GOV', 'transfer', [wallets[destination], 100n * U], base + 1n);
    for (const wallet of wallets) {
      assert.equal((await call('GOV', 'balanceOf', [wallet]))[0], 100n * U);
      await tx(`self-delegate ${wallet}`, wallet, 'GOV', 'delegate', [wallet], t0 - 2n);
    }
    await rpc('evm_setNextBlockTimestamp', [toQuantity(t0 - 1n)]);
    await rpc('evm_mine');
    for (const wallet of wallets) assert.equal((await call('GOV', 'getPastVotes', [wallet, t0 - 2n]))[0], 100n * U);
    assert.equal((await call('GOV', 'totalSupply'))[0], 1000n * U);
  });
  const proposals = [];
  report.proposals = proposals;
  await timed('proposal_generation', async () => {
    for (let i = 0; i < 100; i++) {
      const requestId = id(`tv4-nfr02-request-${i}`);
      const description = JSON.stringify({ version: 1, title: `NFR02 proposal ${i + 1}`, body: `Genuine local benchmark disbursement ${i + 1}, 1 BUD.` });
      const targets = [address.Treasury];
      const values = ['0'];
      const calldatas = [abi.Treasury.encodeFunctionData('disburse', [requestId, accounts.recipient, U])];
      const descriptionHash = id(description);
      const proposalId = String((await call('Governor', 'hashProposal', [targets, values, calldatas, descriptionHash]))[0]);
      const receipt = await tx(`propose ${i + 1}`, accounts.A, 'Governor', 'propose', [targets, values, calldatas, description], t0);
      const event = receipt.logs.filter(log => log.address.toLowerCase() === address.Governor.toLowerCase())
        .map(log => abi.Governor.parseLog(log)).find(log => log?.name === 'ProposalCreated');
      assert.equal(String(event?.args.proposalId), proposalId);
      assert.equal(event.args.voteStart, t0 + 60n);
      assert.equal(event.args.voteEnd, t0 + 360n);
      proposals.push({ proposalId, requestId, description, descriptionHash, targets, values, calldatas,
        snapshot: String(event.args.voteStart), deadline: String(event.args.voteEnd), transactionHash: receipt.transactionHash });
    }
    assert.equal(new Set(proposals.map(p => p.proposalId)).size, 100);
  });
  const voteAt = t0 + 61n;
  await timed('vote_generation', async () => {
    for (const proposal of proposals) for (const wallet of wallets) {
      const receipt = await tx(`vote ${proposal.proposalId}/${wallet}`, wallet, 'Governor', 'castVote', [proposal.proposalId, 1], voteAt);
      const event = receipt.logs.filter(log => log.address.toLowerCase() === address.Governor.toLowerCase())
        .map(log => abi.Governor.parseLog(log)).find(log => log?.name === 'VoteCast');
      assert.equal(String(event?.args.proposalId), proposal.proposalId);
      assert.equal(event.args.voter.toLowerCase(), wallet.toLowerCase());
      assert.equal(event.args.support, 1n);
      assert.equal(event.args.weight, 100n * U);
    }
  });
  await rpc('evm_setNextBlockTimestamp', [toQuantity(t0 + 362n)]);
  await rpc('evm_mine');
  const h = await rpc('eth_getBlockByNumber', ['latest', false]);
  await rpc('anvil_mine', ['0x2', '0x0']);
  assert.ok(BigInt(h.timestamp) > BigInt(proposals[0].deadline) + 1n);
  const pinned = { blockHash: h.hash, requireCanonical: true };
  report.chain = { H: String(BigInt(h.number)), hash: h.hash, timestamp: String(BigInt(h.timestamp)),
    observedHead: String(BigInt(await rpc('eth_blockNumber'))), confirmations: 2, t0: String(t0), voteAt: String(voteAt),
    voterBalancesAndDelegatedWeights: wallets.map(wallet => ({ address: wallet.toLowerCase(), balance: String(100n * U), delegatedWeight: String(100n * U) })) };
  await timed('chain_reconciliation', async () => {
    const chainLogs = await rpc('eth_getLogs', [{ address: address.Governor, fromBlock: toQuantity(BigInt(manifest.contracts.Governor.deploymentBlock)), toBlock: h.number }]);
    const parsed = chainLogs.map(log => abi.Governor.parseLog(log));
    const created = parsed.filter(log => log?.name === 'ProposalCreated');
    const votes = parsed.filter(log => log?.name === 'VoteCast');
    assert.equal(created.length, 100);
    assert.equal(votes.length, 1000);
    const expectedVotes = new Set(proposals.flatMap(p => wallets.map(wallet => `${p.proposalId}/${wallet.toLowerCase()}`)));
    for (const vote of votes) {
      assert.equal(vote.args.support, 1n);
      assert.equal(vote.args.weight, 100n * U);
      assert.ok(expectedVotes.delete(`${vote.args.proposalId}/${vote.args.voter.toLowerCase()}`), 'Duplicate/unexpected chain vote');
    }
    assert.equal(expectedVotes.size, 0);
    assert.deepEqual(created.map(log => String(log.args.proposalId)).sort(), proposals.map(p => p.proposalId).sort());
    for (const p of proposals) {
      assert.equal((await call('Governor', 'state', [p.proposalId], pinned))[0], 4n, 'Proposal must be Succeeded at H');
      assert.deepEqual([...(await call('Governor', 'proposalVotes', [p.proposalId], pinned))], [0n, 1000n * U, 0n]);
    }
    assert.equal((await call('BUD', 'balanceOf', [address.Treasury], pinned))[0], 10000n * U);
    report.chain.counts = { proposals: created.length, votes: votes.length };
    report.chain.treasuryBalance = String(10000n * U);
  });
  const keys = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
  const contracts = Object.entries(keys).map(([role, key]) => ({ role, address: address[key].toLowerCase(), deploymentBlock: manifest.contracts[key].deploymentBlock, abiVersion: manifest.contracts[key].abiVersion }));
  const start = contracts.reduce((min, contract) => BigInt(contract.deploymentBlock) < min ? BigInt(contract.deploymentBlock) : min, BigInt(h.number));
  const deploymentId = (await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config)
    VALUES(31337,'tv4-benchmark',$1,'tv4-nfr02-real-v1',$2::jsonb) RETURNING deployment_id::text`, [String(start), JSON.stringify(manifest.config)])).rows[0].deployment_id;
  for (const c of [...contracts, { role: 'governance_token', address: address.GOV.toLowerCase(), ...manifest.contracts.GOV }])
    await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
      VALUES($1,31337,$2,$3,$4,$5)`, [deploymentId, c.role, c.address.toLowerCase(), c.deploymentBlock, c.abiVersion]);
  report.deployment = { internalId: deploymentId, apiName: 'tv4-benchmark', contracts };
  const workerConfig = { rpcUrl, chainId:'31337', deploymentId, fromBlock:String(start), toBlock:'latest', batchSize:'100', confirmations:2, contracts };
  workerProbe = await startWorkerProbe({scope,root,dbUrl:dbUrl.href,rpc,config:workerConfig,pool,deploymentId,report});
  await timed('worker_initial_publication',()=>workerProbe.ready(String(BigInt(h.number)),h.hash));
  const countsSql = `SELECT
    (SELECT count(*) FROM proposals WHERE deployment_id=$1)::text AS proposals,
    (SELECT count(*) FROM votes WHERE deployment_id=$1)::text AS votes,
    (SELECT count(*) FROM proposal_states WHERE deployment_id=$1 AND state='Succeeded')::text AS succeeded,
    (SELECT count(*) FROM transfers WHERE deployment_id=$1)::text AS transfers,
    (SELECT count(*) FROM raw_events WHERE deployment_id=$1 AND event_name='ProposalCreated')::text AS raw_proposals,
    (SELECT count(*) FROM raw_events WHERE deployment_id=$1 AND event_name='VoteCast')::text AS raw_votes`;
  const assertDataset = async () => {
    const counts = (await pool.query(countsSql, [deploymentId])).rows[0];
    assert.deepEqual(counts, { proposals: '100', votes: '1000', succeeded: '100', transfers: String(1+freshnessDeposits), raw_proposals: '100', raw_votes: '1000' });
    const ids = (await pool.query('SELECT proposal_id::text FROM proposals WHERE deployment_id=$1', [deploymentId])).rows.map(row => row.proposal_id).sort();
    assert.deepEqual(ids, proposals.map(p => p.proposalId).sort());
    const votes = (await pool.query('SELECT proposal_id::text,voter,support,weight::text FROM votes WHERE deployment_id=$1 ORDER BY proposal_id,voter', [deploymentId])).rows;
    const expected = new Set(proposals.flatMap(p => wallets.map(wallet => `${p.proposalId}/${wallet.toLowerCase()}`)));
    for (const vote of votes) {
      assert.equal(vote.support, 1);
      assert.equal(vote.weight, String(100n * U));
      assert.ok(expected.delete(`${vote.proposal_id}/${vote.voter}`));
    }
    assert.equal(expected.size, 0);
    const treasury = (await pool.query('SELECT total_in::text,total_out::text,balance::text FROM treasury_totals WHERE deployment_id=$1', [deploymentId])).rows[0];
    assert.deepEqual(treasury, { total_in: String(10000n * U + BigInt(freshnessDeposits)), total_out: '0', balance: String(10000n * U + BigInt(freshnessDeposits)) });
    return { counts, proposalIds: ids, votes, treasury };
  };
  report.dataset = await timed('sql_reconciliation', assertDataset);
  report.dataset.countsSql = countsSql;
  api = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 900 });
  await new Promise((done, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', done); });
  const baseUrl = `http://127.0.0.1:${api.address().port}/api`;
  const common = { chainId: '31337', deploymentId: 'tv4-benchmark' };
  const snapshot = { ...common, asOfBlock: report.chain.H, asOfBlockHash: h.hash };
  const byId = new Map(proposals.map(p => [p.proposalId, p]));
  const paths = { list: '/proposals', summary: '/summary', detail: '', votes: '', transfers: '/treasury/transfers', health: '/health' };
  const request = async (endpoint, proposalId) => {
    check();
    const path = endpoint === 'detail' ? `/proposals/${proposalId}` : endpoint === 'votes' ? `/proposals/${proposalId}/votes` : paths[endpoint];
    const params = new URLSearchParams(endpoint === 'health' ? common : snapshot);
    if (['list', 'votes', 'transfers'].includes(endpoint)) params.set('limit', endpoint === 'list' ? '20' : '100');
    return measureJson(`${baseUrl}${path}?${params}`, (body,status) => {
      assert.equal(status, 200, `${endpoint}: HTTP ${status}, ${JSON.stringify(body.error ?? body.data)}`);
      assert.ok(!body.error, `${endpoint}: error response is not a success`);
      if(endpoint !== 'health') { assert.equal(body.context?.asOfBlock, report.chain.H); assert.equal(body.context?.asOfBlockHash, h.hash); }
      assert.equal(body.context?.deploymentId, 'tv4-benchmark');
      assert.equal(body.context?.dataKind, 'chain');
      if (endpoint === 'list') {
        assert.equal(body.pagination?.totalCount, 100);
        assert.equal(body.data?.length, 20);
        assert.equal(new Set(body.data.map(p => p.proposalId)).size, 20);
        for (const p of body.data) { assert.ok(byId.has(p.proposalId)); assert.equal(p.state, 'Succeeded'); }
      } else if (endpoint === 'detail') {
        const p = byId.get(proposalId);
        assert.equal(body.data?.proposalId, proposalId);
        assert.equal(body.data?.description, p.description);
        assert.equal(body.data?.descriptionHash, p.descriptionHash);
        assert.equal(body.data?.amount, String(U));
        assert.equal(body.data?.state, 'Succeeded');
        assert.deepEqual(body.data?.votes, { against: '0', for: String(1000n * U), abstain: '0', quorum: String(200n * U) });
      } else if (endpoint === 'votes') {
        assert.equal(body.pagination?.totalCount, 10);
        assert.equal(body.data?.length, 10);
        const voters = new Set(wallets.map(wallet => wallet.toLowerCase()));
        for (const vote of body.data) {
          assert.equal(vote.proposalId, proposalId); assert.equal(vote.support, 1); assert.equal(vote.weight, String(100n * U));
          assert.ok(voters.delete(vote.voter));
        }
        assert.equal(voters.size, 0);
      } else if (endpoint === 'summary') {
        assert.equal(body.data?.proposalCounts?.total, 100);
        assert.equal(body.data?.proposalCounts?.byState?.Succeeded, 100);
        assert.equal(body.data?.treasury?.balance, String(10000n * U));
        assert.equal(body.data?.treasury?.totalOut, '0');
      } else if (endpoint === 'transfers') {
        assert.equal(body.pagination?.totalCount, 1); assert.equal(body.data?.length, 1);
      } else if (endpoint === 'health') {
        assert.equal(body.data?.publication, 'ready'); assert.equal(body.data?.database, 'up');
        assert.equal(body.data?.rawDecodeIssues?.decodeErrors, 0);
      }
    }, {signal:controller.signal});
  };
  await timed('preflight_outside_measurement', async () => {
    report.preflight = [];
    for (const endpoint of ['list', 'summary', 'detail', 'votes', 'transfers', 'health']) {
      const result = await request(endpoint, proposals[0].proposalId);
      report.preflight.push({ endpoint, ...result });
      assert.equal(result.ok, true, `Preflight ${endpoint}: ${result.error}`);
    }
    // Every exact ID must be HTTP-readable, not just SQL-visible; excluded from load.
    for (const p of proposals) for (const endpoint of ['detail', 'votes']) {
      const result = await request(endpoint, p.proposalId);
      assert.equal(result.ok, true, `Preflight ${endpoint}/${p.proposalId}: ${result.error}`);
    }
    report.preflightAllProposalDetailsAndVotes = 100;
  });
  const sendFreshness = async () => {
    const receipt = await tx('BE08 freshness deposit '+(freshnessDeposits+1),accounts.funding,'BUD','transfer',[address.Treasury,1n],t0+363n+BigInt(freshnessDeposits));
    freshnessDeposits++; return receipt;
  };
  await timed('normal_rpc_idle',()=>workerProbe.samples({phase:'idle',base:baseUrl,send:sendFreshness},10));
  report.datasetBeforeMeasurement = await assertDataset();
  await timed('warmup',async()=>{
    const warmup=report.warmup={durationMs:5000,concurrency,rawSamples:[],errors:[]}; const started=performance.now();
    await Promise.all(Array.from({length:concurrency},async(_,worker)=>{
      let sequence=0; while(performance.now()-started<5000) {
        const endpoint=report.method.timedCycle[sequence++ % report.method.timedCycle.length];
        const result=await request(endpoint,proposals[worker].proposalId);
        warmup.rawSamples.push({worker,endpoint,...result}); if(!result.ok)warmup.errors.push(result);
      }
    }));
    warmup.elapsedMs=performance.now()-started; assert.equal(warmup.errors.length,0,'Warm-up errors must be retained and fail acceptance');
  });
  await timed('http_load', async () => {
    const load = report.load = { status: 'RUNNING', concurrency, durationMs, startedAt: new Date().toISOString(),
      rawSampleColumns: ['worker', 'sequence', 'endpoint', 'proposalId', 'startOffsetMs', 'latencyMs', 'httpStatus', 'ok'],
      rawSamples: [], errors: [], workers: [], cpuUsageAtStart: process.cpuUsage(), resourceUsageAtStart: process.resourceUsage() };
    const cycle = report.method.timedCycle;
    const start = performance.now();
    const deadline = start + durationMs;
    let activeClients=0, freshnessDone=false;
    const clients = Array.from({ length: concurrency }, async (_, worker) => {
      activeClients++;
      let sequence = 0;
      const workerStart = performance.now();
      while ((performance.now() < deadline || !freshnessDone) && !controller.signal.aborted) {
        const endpoint = cycle[sequence % cycle.length];
        const proposalId = proposals[(worker + Math.floor(sequence / cycle.length) * concurrency) % proposals.length].proposalId;
        const offset = performance.now() - start;
        const result = await request(endpoint, proposalId);
        const index = load.rawSamples.length;
        load.rawSamples.push([worker, sequence, endpoint, ['detail', 'votes'].includes(endpoint) ? proposalId : null, offset, result.latencyMs, result.status, result.ok]);
        if (!result.ok) load.errors.push({ sampleIndex: index, worker, sequence, endpoint, proposalId, ...result });
        sequence++;
      }
      activeClients--;
      load.workers.push({ worker, requests: sequence, startOffsetMs: workerStart - start, finishedOffsetMs: performance.now() - start });
    });
    const freshness = (async()=>{ try {
      await new Promise(resolve=>setTimeout(resolve,1000));
      await workerProbe.samples({phase:'load',base:baseUrl,send:sendFreshness,activeClients:()=>activeClients},10);
    } finally {freshnessDone=true;} })();
    const results=await Promise.allSettled([...clients,freshness]);
    const failed=results.find(r=>r.status==='rejected'); if(failed)throw failed.reason;
    load.completedAt = new Date().toISOString();
    load.elapsedIncludingDrainMs = performance.now() - start;
    load.cpuUsage = process.cpuUsage(load.cpuUsageAtStart);
    load.resourceUsageAtEnd = process.resourceUsage();
    load.httpStatuses = {};
    for (const sample of load.rawSamples) load.httpStatuses[sample[6] ?? 'transport_error'] = (load.httpStatuses[sample[6] ?? 'transport_error'] ?? 0) + 1;
    const successful = load.rawSamples.filter(sample => sample[7]);
    load.successfulRequests = successful.length;
    load.errorRequests = load.errors.length;
    load.global = metrics(successful.map(sample => sample[5]));
    load.allResponsesIncludingErrors = metrics(load.rawSamples.map(sample => sample[5]));
    load.endpoints = Object.fromEntries([...new Set(cycle)].map(endpoint => [endpoint, {
      ...metrics(successful.filter(sample => sample[2] === endpoint).map(sample => sample[5])),
      errors: load.errors.filter(error => error.endpoint === endpoint).length,
    }]));
    load.successfulRequestsPerSecond = successful.length / (load.elapsedIncludingDrainMs / 1000);
    load.status = load.errorRequests === 0 && load.global.count > 0 && load.global.p95Ms < 1000 &&
      Object.values(load.endpoints).every(endpoint => endpoint.count > 0 && endpoint.p95Ms < 1000) ? 'PASS' : 'FAIL';
    check();
    assert.ok(load.elapsedIncludingDrainMs >= durationMs, 'Must run the full 60s');
    assert.ok(load.workers.every(worker => worker.requests > 0 && worker.finishedOffsetMs >= durationMs), 'All ten workers must run throughout measurement');
    assert.equal(load.errorRequests, 0, 'Legitimate read errors invalidate performance acceptance');
    assert.equal(load.status, 'PASS', 'NFR02 requires global and per-endpoint successful p95 strictly <1000ms');
  });
  report.datasetAfterMeasurement = await assertDataset();
  await timed('health_separate',async()=>{
    const health=report.health={model:'100 sequential reads after data load; worker remains active',rawSamples:[]};
    for(let i=0;i<100;i++)health.rawSamples.push(await request('health'));
    health.metrics=metrics(health.rawSamples.filter(r=>r.ok).map(r=>r.latencyMs));
    health.errors=health.rawSamples.filter(r=>!r.ok);assert.equal(health.errors.length,0);
  });
  await timed('rpc_outage',()=>workerProbe.outage(baseUrl));
  report.datasetAfterOutage = await assertDataset();
  const canonical = await rpc('eth_getBlockByNumber', [h.number, false]);
  assert.equal(canonical.hash, h.hash);
  report.status = 'PASS';
} catch (error) {
  failure = error;
  report.status = 'FAIL';
  report.failedStage = stage;
  report.error = { name: error.name, message: redact(error.message), code: error.code ?? null };
  if (error.report) report.failureReport = error.report;
  if (anvilOutput) report.anvilDiagnostics = redact(anvilOutput);
} finally {
  const errors = [];
  if (workerProbe) { try { await workerProbe.close(); } catch(error) { errors.push(`Worker close: ${redact(error.message)}`); } }
  if (api) {
    try {
      await new Promise((done, reject) => { api.close(error => error ? reject(error) : done()); api.closeAllConnections(); });
    } catch (error) { errors.push(`API close: ${redact(error.message)}`); }
  }
  if (lock) { lock.release(); lock = null; }
  if (pool) try { await pool.end(); } catch (error) { errors.push(`Pool close: ${redact(error.message)}`); }
  try { await scope.cleanup(); } catch (error) { errors.push(`Owned Anvil cleanup: ${redact(error.message)}`); }
  scope.dispose();
  for (const [signal, handler] of Object.entries(handlers)) process.removeListener(signal, handler);
  report.cleanup = { status: errors.length ? 'FAIL' : 'PASS', errors, callerDatabaseDropped: false };
  if (errors.length) { report.status = 'FAIL'; failure ??= new Error(errors.join('; ')); }
  report.completedAt = new Date().toISOString();
  report.machine.freeRamBytesAtEnd = os.freemem();
  report.machine.loadAverageAtEnd = os.loadavg();
  try { await evidence.writeFile(JSON.stringify(report, null, 2) + '\n'); await evidence.sync(); }
  finally { await evidence.close(); }
}
console.log(JSON.stringify({ status: report.status, output, successfulRequests: report.load?.successfulRequests ?? 0,
  errorRequests: report.load?.errorRequests ?? 0, p95Ms: report.load?.global?.p95Ms ?? null, failedStage: report.failedStage ?? null }));
if (failure) { console.error(redact(failure.message)); process.exitCode = controller.signal.aborted ? 130 : 1; }
