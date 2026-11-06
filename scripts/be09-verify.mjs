#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { Interface, id, toQuantity } from 'ethers';
import { classifyLiveTest, liveTestEnvironment } from './be09-live-test.mjs';
import { sourceProvenance } from './be09-provenance.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const params = process.argv.slice(2);
function getOption(name) {
  const at = params.indexOf(name);
  if (at < 0 || !params[at + 1] || params.indexOf(name, at + 1) >= 0) throw new Error(`Usage: be09-verify.mjs --runtime <run-dir> --report <report-dir>`);
  return params[at + 1];
}

class BlockedError extends Error { constructor(message) { super(message); this.name = 'BlockedError'; } }
const report = {
  format: 'dao-budget-be09-verification-v1', status: 'BLOCKED', startedAt: new Date().toISOString(),
  scope: 'This report covers only the local WSL run created by scripts/be09-local.sh. It does not attest CI, testnet, browser/wallet E2E, or separate TV3/TV4 review.',
  sourceCommit: null, worktree: null, chainId: null, deploymentName: null, proposalId: null, context: null,
  endpoints: [], contractComparison: null, workerRestart: null, cors: null, liveTest: null, stageErrors: [], error: null,
};

function readEnvFile(content) {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) throw new Error('Malformed runtime environment file.');
    result[line.slice(0, index)] = line.slice(index + 1);
  }
  return result;
}

async function rpc(url, method, args) {
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: args }) });
  } catch (error) { throw new BlockedError(`RPC ${method} could not connect: ${error.message}`); }
  if (!response.ok) throw new Error(`RPC ${method} returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method} failed: ${body.error.message}`);
  return body.result;
}

async function request(url, label, endpointList) {
  let response;
  try { response = await fetch(url); }
  catch (error) {
    endpointList.push({ endpoint: label, method: 'GET', httpStatus: null, error: error.message });
    return { status: null, body: {} };
  }
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  endpointList.push({ endpoint: label, method: 'GET', httpStatus: response.status });
  return { status: response.status, body };
}

function scopedUrl(base, path, runtime, context) {
  const url = new URL(path, `${base}/`);
  url.searchParams.set('chainId', runtime.chainId);
  url.searchParams.set('deploymentId', runtime.deploymentName);
  if (context) {
    url.searchParams.set('asOfBlock', context.asOfBlock);
    url.searchParams.set('asOfBlockHash', context.asOfBlockHash);
  }
  return url;
}

async function apiChecks(runtime, seed, manifest) {
  const endpoints = report.endpoints;
  const healthResult = await request(scopedUrl(runtime.urls.api, '/api/health', runtime), '/api/health', endpoints);
  const health = healthResult.body;
  const proposalId = seed.proposalId;
  const proposalsUrl = scopedUrl(runtime.urls.api, '/api/proposals', runtime);
  proposalsUrl.searchParams.set('limit', '100');
  const proposalsResult = await request(proposalsUrl, '/api/proposals', endpoints);
  const proposals = proposalsResult.body;
  const context = proposals.context;
  const pinUsable = Boolean(context?.asOfBlock && context?.asOfBlockHash);
  const pinned = (path) => scopedUrl(runtime.urls.api, path, runtime, pinUsable ? context : undefined);
  const summaryResult = await request(pinned('/api/summary'), '/api/summary', endpoints);
  const detailResult = await request(pinned(`/api/proposals/${encodeURIComponent(proposalId)}`), `/api/proposals/${proposalId}`, endpoints);
  const votesUrl = pinned(`/api/proposals/${encodeURIComponent(proposalId)}/votes`);
  votesUrl.searchParams.set('limit', '100');
  const votesResult = await request(votesUrl, `/api/proposals/${proposalId}/votes`, endpoints);
  const transfersUrl = pinned('/api/treasury/transfers');
  transfersUrl.searchParams.set('limit', '100');
  const transfersResult = await request(transfersUrl, '/api/treasury/transfers', endpoints);
  const summary = summaryResult.body, detail = detailResult.body, votes = votesResult.body, transfers = transfersResult.body;
  const results = [
    ['/api/health', healthResult], ['/api/proposals', proposalsResult], ['/api/summary', summaryResult],
    [`/api/proposals/${proposalId}`, detailResult], [`/api/proposals/${proposalId}/votes`, votesResult],
    ['/api/treasury/transfers', transfersResult],
  ];
  for (const [label, result] of results) {
    if (result.status === null || result.status === 503) throw new BlockedError(`GET ${label} did not return an HTTP response or returned HTTP 503.`);
    assert.equal(result.status, 200, `GET ${label} returned HTTP ${result.status}`);
  }
  assert.equal(health.data?.database, 'up');
  assert.equal(health.data?.publication, 'ready');
  assert.equal(health.data?.indexer, 'synced');
  assert.equal(context?.dataKind, 'chain');
  assert.equal(context?.chainId, runtime.chainId);
  assert.equal(context?.deploymentId, runtime.deploymentName);
  assert.match(context?.asOfBlock ?? '', /^(0|[1-9][0-9]*)$/);
  assert.match(context?.asOfBlockHash ?? '', /^0x[0-9a-f]{64}$/i);
  assert.match(context?.snapshotRevision ?? '', /^[0-9a-f-]{36}$/i);
  assert.equal(proposals.pagination?.totalCount, 1, 'Expected the real seeded proposal in API list');
  assert.equal(proposals.data?.length, 1);
  assert.equal(proposals.data[0].proposalId, proposalId);
  report.context = { chainId: context.chainId, deploymentName: context.deploymentId,
    H: context.asOfBlock, hash: context.asOfBlockHash, revision: context.snapshotRevision };
  for (const item of [summary, detail, votes, transfers]) {
    assert.equal(item.context?.chainId, context.chainId);
    assert.equal(item.context?.deploymentId, context.deploymentId);
    assert.equal(item.context?.asOfBlock, context.asOfBlock);
    assert.equal(item.context?.asOfBlockHash?.toLowerCase(), context.asOfBlockHash.toLowerCase());
    assert.equal(item.context?.snapshotRevision, context.snapshotRevision);
  }
  assert.equal(summary.data?.treasury?.address?.toLowerCase(), manifest.contracts.Treasury.address.toLowerCase());
  assert.equal(summary.data?.treasury?.token?.address?.toLowerCase(), manifest.contracts.BUD.address.toLowerCase());
  assert.equal(summary.data?.proposalCounts?.total, 1);
  assert.equal(summary.data?.proposalCounts?.byState?.Executed, 1);
  assert.equal(detail.data?.proposalId, proposalId);
  assert.equal(detail.data?.requestId, seed.requestId);
  assert.equal(detail.data?.description, seed.proposal.description);
  assert.equal(detail.data?.descriptionHash?.toLowerCase(), seed.proposal.descriptionHash.toLowerCase());
  assert.equal(detail.data?.recipient?.toLowerCase(), seed.execution.recipient.toLowerCase());
  assert.equal(detail.data?.amount, seed.execution.amount);
  assert.deepEqual(detail.data?.targets, seed.proposal.targets.map((address) => address.toLowerCase()));
  assert.deepEqual(detail.data?.values, seed.proposal.values);
  assert.deepEqual(detail.data?.calldatas, seed.proposal.calldatas.map((data) => data.toLowerCase()));
  assert.equal(detail.data?.state, 'Executed');
  assert.deepEqual(detail.data?.votes && [detail.data.votes.against, detail.data.votes.for, detail.data.votes.abstain],
    ['0', '700000000000000000000', '0']);
  assert.equal(votes.pagination?.totalCount, 2);
  assert.equal(votes.data?.length, 2);
  assert.equal(transfers.pagination?.totalCount, 2);
  assert.equal(transfers.data?.length, 2);
  const executionTransfer = transfers.data.find((item) => item.transactionHash.toLowerCase() === seed.execution.transactionHash.toLowerCase());
  assert.ok(executionTransfer, 'Executed proposal transfer is absent from API');
  assert.equal(executionTransfer.proposalId, proposalId);
  assert.equal(executionTransfer.requestId, seed.requestId);
  assert.equal(executionTransfer.amount, '1000000000000000000000');
  assert.equal(executionTransfer.direction, 'out');
  return { health, proposals, summary, detail: detail.data, votes: votes.data, transfers: transfers.data, context };
}

async function blockHashCall(rpcUrl, iface, to, method, values, blockHash) {
  const data = iface.encodeFunctionData(method, values);
  const result = await rpc(rpcUrl, 'eth_call', [{ to, data }, { blockHash, requireCanonical: true }]);
  return iface.decodeFunctionResult(method, result);
}

async function checkContracts(runtime, manifest, seed, api) {
  assert.equal(manifest.sourceCommit, runtime.sourceCommit);
  assert.equal(seed.status, 'PASS');
  assert.equal(seed.chainId, runtime.chainId);
  assert.equal(BigInt(await rpc(runtime.urls.rpc, 'eth_chainId', [])), BigInt(runtime.chainId));
  const h = BigInt(api.context.asOfBlock);
  const block = await rpc(runtime.urls.rpc, 'eth_getBlockByNumber', [toQuantity(h), false]);
  assert.equal(block?.hash?.toLowerCase(), api.context.asOfBlockHash.toLowerCase(), 'API H/hash is not canonical on the configured chain');
  const governorArtifact = JSON.parse(await readFile(resolve(root, 'out/BudgetGovernor.sol/BudgetGovernor.json'), 'utf8'));
  const treasuryArtifact = JSON.parse(await readFile(resolve(root, 'out/Treasury.sol/Treasury.json'), 'utf8'));
  const budArtifact = JSON.parse(await readFile(resolve(root, 'out/BudgetToken.sol/BudgetToken.json'), 'utf8'));
  const governor = new Interface(governorArtifact.abi), treasury = new Interface(treasuryArtifact.abi), bud = new Interface(budArtifact.abi);
  const [state, votes, proposalHash, paid, balance] = await Promise.all([
    blockHashCall(runtime.urls.rpc, governor, manifest.contracts.Governor.address, 'state', [seed.proposalId], block.hash),
    blockHashCall(runtime.urls.rpc, governor, manifest.contracts.Governor.address, 'proposalVotes', [seed.proposalId], block.hash),
    blockHashCall(runtime.urls.rpc, governor, manifest.contracts.Governor.address, 'hashProposal',
      [seed.proposal.targets, seed.proposal.values, seed.proposal.calldatas, seed.proposal.descriptionHash], block.hash),
    blockHashCall(runtime.urls.rpc, treasury, manifest.contracts.Treasury.address, 'paidRequests', [seed.requestId], block.hash),
    blockHashCall(runtime.urls.rpc, bud, manifest.contracts.BUD.address, 'balanceOf', [manifest.contracts.Treasury.address], block.hash),
  ]);
  assert.equal(BigInt(state[0]), 7n);
  assert.deepEqual(Array.from(votes).map(String), ['0', '700000000000000000000', '0']);
  assert.equal(String(proposalHash[0]), seed.proposalId);
  assert.equal(paid[0], true);
  assert.equal(String(balance[0]), api.summary.data.treasury.balance);
  assert.equal(api.summary.data.treasury.balance, '9000000000000000000000');

  const topic = id('Transfer(address,address,uint256)');
  const logs = await rpc(runtime.urls.rpc, 'eth_getLogs', [{ address: manifest.contracts.BUD.address,
    fromBlock: toQuantity(BigInt(manifest.scanFromBlock)), toBlock: toQuantity(h), topics: [topic] }]);
  const chainTransfers = logs.map((log) => {
    assert.ok(BigInt(log.blockNumber) <= h);
    const parsed = bud.parseLog(log);
    const from = parsed.args.from.toLowerCase(), to = parsed.args.to.toLowerCase();
    return { from, to, amount: String(parsed.args.value),
      direction: from === to ? 'self' : to === manifest.contracts.Treasury.address.toLowerCase() ? 'in' : 'out',
      transactionHash: log.transactionHash.toLowerCase(), blockNumber: BigInt(log.blockNumber).toString(),
      blockHash: log.blockHash.toLowerCase(), logIndex: BigInt(log.logIndex).toString() };
  }).filter((row) => row.from === manifest.contracts.Treasury.address.toLowerCase() || row.to === manifest.contracts.Treasury.address.toLowerCase());
  const apiTransfers = api.transfers.map((row) => ({ from: row.from.toLowerCase(), to: row.to.toLowerCase(), amount: row.amount, direction: row.direction,
    transactionHash: row.transactionHash.toLowerCase(), blockNumber: row.blockNumber,
    blockHash: row.blockHash.toLowerCase(), logIndex: row.logIndex }));
  const key = (row) => [row.blockNumber, row.transactionHash, row.logIndex].join(':');
  const ordered = (rows) => rows.sort((a, b) => key(a).localeCompare(key(b)));
  assert.deepEqual(ordered(apiTransfers), ordered(chainTransfers), 'API BUD Treasury transfers differ from canonical on-chain logs through H');
  const totalIn = chainTransfers.filter((row) => row.to === manifest.contracts.Treasury.address.toLowerCase() && row.from !== row.to)
    .reduce((total, row) => total + BigInt(row.amount), 0n);
  const totalOut = chainTransfers.filter((row) => row.from === manifest.contracts.Treasury.address.toLowerCase() && row.from !== row.to)
    .reduce((total, row) => total + BigInt(row.amount), 0n);
  assert.equal(api.summary.data.treasury.totalIn, String(totalIn));
  assert.equal(api.summary.data.treasury.totalOut, String(totalOut));
  const voteTopic = governor.getEvent('VoteCast').topicHash;
  const voteLogs = await rpc(runtime.urls.rpc, 'eth_getLogs', [{ address: manifest.contracts.Governor.address,
    fromBlock: toQuantity(BigInt(manifest.scanFromBlock)), toBlock: toQuantity(h), topics: [voteTopic] }]);
  const chainVotes = voteLogs.map((log) => {
    const parsed = governor.parseLog(log);
    return { proposalId: String(parsed.args.proposalId), voter: parsed.args.voter.toLowerCase(), support: Number(parsed.args.support),
      weight: String(parsed.args.weight), reason: parsed.args.reason, transactionHash: log.transactionHash.toLowerCase(),
      blockNumber: BigInt(log.blockNumber).toString(), blockHash: log.blockHash.toLowerCase(), logIndex: BigInt(log.logIndex).toString() };
  }).filter((vote) => vote.proposalId === seed.proposalId);
  const apiVotes = api.votes.map((vote) => ({ proposalId: vote.proposalId, voter: vote.voter.toLowerCase(), support: vote.support,
    weight: vote.weight, reason: vote.reason, transactionHash: vote.transactionHash.toLowerCase(), blockNumber: vote.blockNumber,
    blockHash: vote.blockHash.toLowerCase(), logIndex: vote.logIndex }));
  const voteKey = (vote) => [vote.blockNumber, vote.transactionHash, vote.logIndex].join(':');
  assert.deepEqual(apiVotes.sort((a, b) => voteKey(a).localeCompare(voteKey(b))),
    chainVotes.sort((a, b) => voteKey(a).localeCompare(voteKey(b))), 'API vote rows differ from canonical VoteCast logs through H');
  return { H: h.toString(), hash: block.hash, revision: api.context.snapshotRevision,
    proposalState: 'Executed', votes: Array.from(votes).map(String), paidRequest: Boolean(paid[0]),
    treasuryBalance: String(balance[0]), apiAndChainVoteRows: chainVotes.length, apiAndChainTransfers: chainTransfers.length,
    totalIn: String(totalIn), totalOut: String(totalOut), result: 'PASS' };
}

async function databaseSnapshot(pool, deploymentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const single = async (sql, values = [deploymentId]) => (await client.query(sql, values)).rows[0];
    const checkpoint = await single(`SELECT block_number::text,block_hash,observed_head_block::text,confirmation_depth,sync_status
      FROM checkpoints WHERE deployment_id=$1`);
    const publication = await single(`SELECT block_number::text,block_hash,source_scope,snapshot_revision::text,ignored_ancillary_events
      FROM projection_checkpoints WHERE deployment_id=$1`);
    if (!checkpoint || !publication) throw new BlockedError('Worker has not published both raw and projection checkpoints.');
    const definitions = [
    ['indexed_blocks', `SELECT COALESCE(jsonb_agg(jsonb_build_array(block_number::text,block_hash,parent_hash,block_timestamp::text)
      ORDER BY block_number::numeric),'[]'::jsonb) AS rows FROM indexed_blocks WHERE deployment_id=$1`],
    ['raw_events', `SELECT COALESCE(jsonb_agg(jsonb_build_array(raw_event_id::text,chain_id::text,contract_role,contract_address,block_number::text,
      block_hash,transaction_hash,transaction_index::text,log_index::text,topics::text,data,event_name,decoded_payload)
      ORDER BY block_number::numeric,transaction_index,log_index),'[]'::jsonb) AS rows FROM raw_events WHERE deployment_id=$1`],
    ['proposals', `SELECT COALESCE(jsonb_agg(jsonb_build_array(proposal_id::text,request_id,proposer,recipient,amount::text,description,description_hash,
      snapshot::text,deadline::text,created_event_id::text,canceled_event_id::text,executed_event_id::text)
      ORDER BY proposal_id::numeric),'[]'::jsonb) AS rows FROM proposals WHERE deployment_id=$1`],
    ['votes', `SELECT COALESCE(jsonb_agg(jsonb_build_array(v.proposal_id::text,v.voter,v.support,v.weight::text,v.reason,v.params::text,r.block_hash,
      r.transaction_hash,r.transaction_index::text,r.log_index::text)
      ORDER BY v.proposal_id::numeric,r.block_number::numeric,r.transaction_index,r.log_index),'[]'::jsonb) AS rows
      FROM votes v JOIN raw_events r ON r.deployment_id=v.deployment_id AND r.raw_event_id=v.source_event_id WHERE v.deployment_id=$1`],
    ['operations', `SELECT COALESCE(jsonb_agg(jsonb_build_array(o.operation_id,o.proposal_id::text,o.predecessor,o.salt,o.queued_at::text,o.eta::text,
      o.queued_event_id::text,o.scheduled_event_id::text,o.executed_event_id::text,o.canceled_event_id::text)
      ORDER BY o.proposal_id::numeric),'[]'::jsonb) AS rows FROM operations o WHERE o.deployment_id=$1`],
    ['transfers', `SELECT COALESCE(jsonb_agg(jsonb_build_array(t.token_address,t.from_address,t.to_address,t.amount::text,t.source_event_id::text,
      r.block_number::text,r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text)
      ORDER BY r.block_number::numeric,r.transaction_index,r.log_index),'[]'::jsonb) AS rows
      FROM transfers t JOIN raw_events r ON r.deployment_id=t.deployment_id AND r.raw_event_id=t.source_event_id WHERE t.deployment_id=$1`],
    ['disbursements', `SELECT COALESCE(jsonb_agg(jsonb_build_array(d.request_id,d.recipient,d.amount::text,d.source_event_id::text,d.proposal_id::text,d.operation_id,
      r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text)
      ORDER BY d.request_id),'[]'::jsonb) AS rows FROM disbursements d JOIN raw_events r ON r.deployment_id=d.deployment_id AND r.raw_event_id=d.source_event_id
      WHERE d.deployment_id=$1`],
    ['proposal_states', `SELECT COALESCE(jsonb_agg(jsonb_build_array(proposal_id::text,state,against_votes::text,for_votes::text,abstain_votes::text,quorum::text,operation_status)
      ORDER BY proposal_id::numeric),'[]'::jsonb) AS rows FROM proposal_states WHERE deployment_id=$1`],
    ];
    const tableDigests = {};
    for (const [name, sql] of definitions) {
      const rows = (await client.query(sql, [deploymentId])).rows[0].rows;
      tableDigests[name] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    await client.query('COMMIT');
    return { checkpoint, publication, tableDigests };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function procCommand(pid) {
  try { return (await readFile(`/proc/${pid}/cmdline`)).toString().replaceAll('\0', ' '); }
  catch { return ''; }
}
async function assertWorkerOwned(pidFile, configPath) {
  const pid = Number((await readFile(pidFile, 'utf8')).trim());
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  const command = await procCommand(pid);
  if (!command.includes(configPath) || !command.includes('--worker')) throw new BlockedError('Worker PID is not alive or does not belong to this BE09 run.');
  return pid;
}
async function waitWorkerGone(pid, configPath, timeoutMs = 12000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const command = await procCommand(pid);
    if (!command) return;
    if (!command.includes(configPath)) throw new Error('Worker PID was reused by a different process; refusing further signals.');
    await sleep(200);
  }
  throw new Error('Worker did not stop after SIGTERM.');
}
function startWorker(runtimeDir, logPath, pidPath, configPath, env) {
  const log = openSync(logPath, 'a');
  const child = spawn(process.execPath, [`--env-file=${resolve(runtimeDir, 'worker.env')}`, '--import', 'tsx', 'indexer/cli.ts',
    '--config', configPath, '--worker'], { cwd: root, detached: true, stdio: ['ignore', log, log],
    env: { PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, HOME: process.env.HOME,
      DATABASE_URL: env.DATABASE_URL, RPC_URL: env.RPC_URL } });
  closeSync(log);
  child.unref();
  if (!child.pid) throw new Error('Could not start the replacement worker process.');
  return writeFile(pidPath, `${child.pid}\n`, { mode: 0o600 }).then(() => chmod(pidPath, 0o600)).then(() => child.pid);
}

async function restartWorker(runtime, env, pool, before) {
  const pidFile = resolve(runtime.runtimeDir, 'pids/worker.pid');
  const pid = await assertWorkerOwned(pidFile, runtime.indexerConfig);
  const logPath = resolve(runtime.runtimeDir, 'logs/worker.log');
  const oldLogSize = (await readFile(logPath).catch(() => Buffer.alloc(0))).length;
  process.kill(pid, 'SIGTERM');
  await waitWorkerGone(pid, runtime.indexerConfig);
  const newPid = await startWorker(runtime.runtimeDir, logPath, pidFile, runtime.indexerConfig, env);
  const until = Date.now() + 30000;
  let after, publicationObserved = false;
  while (Date.now() < until) {
    const command = await procCommand(newPid);
    if (!command) { await sleep(100); continue; }
    if (!command.includes(runtime.indexerConfig)) throw new Error('Restarted worker exited or lost run identity.');
    try {
      after = await databaseSnapshot(pool, runtime.deploymentId);
      const logBytes = await readFile(logPath);
      if (logBytes.subarray(oldLogSize).toString('utf8').includes('worker_publication')) { publicationObserved = true; break; }
    } catch (error) { if (!(error instanceof BlockedError)) throw error; }
    await sleep(500);
  }
  assert.ok(after && publicationObserved, 'Restarted worker did not publish from the same PostgreSQL checkpoint.');
  assert.deepEqual(after, before, 'Database checkpoint or semantic rows changed/duplicated after worker restart');
  return { oldPid: pid, newPid, databaseDigestUnchanged: true, publication: after.publication };
}

export async function runLiveTest(runtime, env, reportDir) {
  const names = ['BE05_LIVE_API_URL', 'BE05_LIVE_CHAIN_ID', 'BE05_LIVE_DEPLOYMENT_ID', 'BE05_LIVE_RPC_URL'];
  const testEnv = liveTestEnvironment(runtime);
  const jsonPath = resolve(reportDir, 'frontend-api-live-test.vitest.json');
  closeSync(openSync(jsonPath, 'wx', 0o600));
  const run = spawnSync('npm', ['run', 'test', '--prefix', 'frontend', '--', 'src/data/api.live.test.ts',
    '--reporter=default', '--reporter=json', `--outputFile.json=${jsonPath}`],
    { cwd: root, env: testEnv, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  const testLogPath = resolve(reportDir, 'frontend-api-live-test.log');
  const redactions = [env.API_CURSOR_SECRET, env.DATABASE_URL];
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /(PRIVATE_KEY|SECRET)/i.test(name)) redactions.push(value);
  }
  const redact = text => redactions.filter(Boolean).reduce((value, secret) => value.replaceAll(secret, '[redacted]'), text);
  const logBody = redact(`${run.stdout ?? ''}${run.stderr ?? ''}`);
  await writeFile(testLogPath, logBody, { flag: 'wx', mode: 0o600 });
  await chmod(testLogPath, 0o600);
  const rawJson = await readFile(jsonPath, 'utf8');
  let json;
  try { json = JSON.parse(rawJson); } catch { json = null; }
  // Store only a redacted JSON result, including any failure messages.
  await writeFile(jsonPath, json ? JSON.stringify(json, (_key, value) => typeof value === 'string' ? redact(value) : value) + '\n' : redact(rawJson), { mode: 0o600 });
  const classification = classifyLiveTest(run, json, resolve(root, 'frontend/src/data/api.live.test.ts'));
  report.liveTest = { command: `npm run test --prefix frontend -- src/data/api.live.test.ts --reporter=default --reporter=json --outputFile.json=${jsonPath}`,
    ...classification, exitCode: run.status, log: testLogPath, vitestJson: jsonPath, variables: names,
    runtimeInputs: { apiUrl: runtime.urls.api, chainId: runtime.chainId, deploymentName: runtime.deploymentName, rpcUrl: runtime.urls.rpc },
    deploymentIdIsReal: testEnv.BE05_LIVE_DEPLOYMENT_ID === runtime.deploymentName };
  assert.equal(report.liveTest.deploymentIdIsReal, true, 'Live test deployment ID is not the actual deployment name');
  if (run.error) report.liveTest.error = redact(run.error.message);
  return report.liveTest;
}

function safeError(error, env = {}) {
  let message = error?.message ?? String(error);
  for (const value of [env.API_CURSOR_SECRET, env.DATABASE_URL]) {
    if (value) message = message.replaceAll(value, '[redacted]');
  }
  return { kind: error instanceof BlockedError ? 'runtime-unavailable' : 'verification-failed',
    name: error?.name ?? 'Error', message };
}
function addStageError(stage, error, env = {}) {
  report.stageErrors.push({ stage, ...safeError(error, env) });
}

async function worktreeEvidence() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--short', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const { sha256 } = await sourceProvenance(root, head);
  return { head, status, sha256, note: 'Hashes describe the current verification worktree, not a reconstruction of the earlier deployment worktree.' };
}

async function main() {
  let pool;
  let runDir;
  let reportDir;
  let env = {};
  try {
    assert.equal(params.length, 4, 'Usage: be09-verify.mjs --runtime <run-dir> --report <report-dir>');
    runDir = resolve(getOption('--runtime'));
    reportDir = resolve(getOption('--report'));
    const runtime = JSON.parse(await readFile(resolve(runDir, 'runtime.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(runtime.manifest, 'utf8'));
    const seed = JSON.parse(await readFile(runtime.seedReport, 'utf8'));
    env = readEnvFile(await readFile(resolve(runDir, 'runtime.env'), 'utf8'));
    report.sourceCommit = runtime.sourceCommit;
    report.worktree = await worktreeEvidence();
    report.chainId = runtime.chainId;
    report.deploymentName = runtime.deploymentName;
    report.proposalId = runtime.proposalId;
    assert.equal(runtime.format, 'dao-budget-be09-runtime-v1');
    assert.equal(report.worktree.head, runtime.sourceCommit, 'Current HEAD differs from the runtime source revision');
    assert.match(runtime.deploymentName, /^be09-local-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/);
    assert.equal(runtime.proposalId, seed.proposalId);

    try {
      await runLiveTest(runtime, env, reportDir);
      if (report.liveTest.status === 'FAIL') addStageError('frontend-live-test', new Error(`api.live.test.ts failed: ${report.liveTest.reason ?? 'inspect its retained log'}`), env);
      if (report.liveTest.status === 'SKIP') addStageError('frontend-live-test', new BlockedError('api.live.test.ts contains skipped tests; inspect its retained result.'), env);
    } catch (error) { addStageError('frontend-live-test', error, env); }

    const conn = env.DATABASE_URL;
    if (!conn) throw new BlockedError('Runtime database URL is missing.');
    pool = new pg.Pool({ connectionString: conn, max: 2, connectionTimeoutMillis: 3000 });
    try { await pool.query('SELECT 1'); }
    catch (error) { addStageError('postgres', new BlockedError(`Isolated PostgreSQL is unavailable: ${error.message}`), env); }

    let api;
    try {
      api = await apiChecks(runtime, seed, manifest);
    } catch (error) { addStageError('api-endpoints', error, env); }
    if (api) {
      try { report.contractComparison = await checkContracts(runtime, manifest, seed, api); }
      catch (error) { addStageError('contract-api-comparison', error, env); }
    }

    try {
      const corsResponse = await fetch(`${runtime.urls.api}/api/health?chainId=${runtime.chainId}&deploymentId=${encodeURIComponent(runtime.deploymentName)}`,
        { method: 'OPTIONS', headers: { origin: runtime.urls.frontend } });
      report.cors = { preflightHttpStatus: corsResponse.status,
        allowOrigin: corsResponse.headers.get('access-control-allow-origin'), expectedOrigin: runtime.urls.frontend };
      assert.equal(corsResponse.status, 204);
      assert.equal(report.cors.allowOrigin, runtime.urls.frontend);
    } catch (error) { addStageError('cors', error, env); }

    if (pool) {
      try {
        const before = await databaseSnapshot(pool, runtime.deploymentId);
        report.workerRestart = await restartWorker(runtime, env, pool, before);
      } catch (error) { addStageError('worker-restart', error, env); }
    }
  } catch (error) {
    report.error = safeError(error, env);
  } finally {
    await pool?.end().catch(() => undefined);
  }
  report.finishedAt = new Date().toISOString();
  reportDir ??= resolve(getOption('--report'));
  if (report.error) report.stageErrors.unshift({ stage: 'setup', ...report.error });
  const hasFail = report.stageErrors.some((item) => item.kind === 'verification-failed');
  const hasBlocked = report.stageErrors.some((item) => item.kind === 'runtime-unavailable');
  report.status = hasFail ? 'FAIL' : hasBlocked ? 'BLOCKED' : 'PASS';
  const reportPath = resolve(reportDir, 'results.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(reportPath, 0o600);
  const context = report.context;
  const lines = [
    `# BE09 local verification — ${report.status}`, '',
    `- Source revision: \`${report.sourceCommit ?? 'unknown'}\``,
    `- Verification worktree HEAD: \`${report.worktree?.head ?? 'unknown'}\` (local file hashes and status in results.json)`,
    `- Chain ID: \`${report.chainId ?? 'unknown'}\``,
    `- Deployment name: \`${report.deploymentName ?? 'unknown'}\``,
    `- Real proposal ID: \`${report.proposalId ?? 'unknown'}\``,
    `- Snapshot: H=${context?.H ?? 'N/A'}, hash=${context?.hash ?? 'N/A'}, revision=${context?.revision ?? 'N/A'}`,
    '', '## API endpoints', '',
    '| GET endpoint | HTTP |', '| --- | ---: |',
    ...report.endpoints.map((item) => `| ${item.endpoint} | ${item.httpStatus} |`),
    '', '## Checks', '',
    `- Contract/API comparison at the same H/hash: **${report.contractComparison?.result ?? 'NOT RUN'}**`,
    `- CORS origin ${report.cors?.expectedOrigin ?? runtimeFront(runDir)}: **${report.cors?.allowOrigin === report.cors?.expectedOrigin ? 'PASS' : 'NOT RUN/FAIL'}**`,
    `- Worker restart, checkpoint and semantic database digest: **${report.workerRestart?.databaseDigestUnchanged ? 'PASS' : 'NOT RUN/FAIL'}**`,
    `- frontend/src/data/api.live.test.ts: **${report.liveTest?.status ?? 'NOT RUN'}**`,
  ];
  if (report.stageErrors.length) lines.push('', '## Issues', '', ...report.stageErrors.map((item) => `- ${item.stage} (${item.kind}): ${item.message}`));
  lines.push('', `Machine-readable evidence: \`${reportPath}\``,
    'This local result does not replace CI, testnet, browser/wallet E2E, or TV3/TV4 review.',
    'No cursor secret, database password, or private key is included in this report.', '');
  const markdownPath = resolve(reportDir, 'report.md');
  await writeFile(markdownPath, lines.join('\n'), { flag: 'wx', mode: 0o600 });
  await chmod(markdownPath, 0o600);
  console.log(JSON.stringify({ status: report.status, report: markdownPath, results: reportPath }));
  if (report.status !== 'PASS') process.exitCode = 1;
}

function runtimeFront(runDir) {
  return `configured frontend origin for ${runDir}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => { console.error(`BE09 verification report generation failed: ${error.message}`); process.exitCode = 1; });
