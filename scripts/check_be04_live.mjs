#!/usr/bin/env node
// Owns a new unforked Anvil; database must be new, isolated and explicitly selected.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Interface, ZeroHash, id, toQuantity } from 'ethers';
import pg from 'pg';
import { deployGovernance } from './governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from './receipt.mjs';
import { parseConfig } from '../indexer/config.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { PostgresStorage as CurrentPostgresStorage } from '../indexer/storage.ts';
import { sync as Currentsync } from '../indexer/syncer.ts';
import { project as Currentproject } from '../indexer/projection/projector.ts';
import { createApiServer as CurrentcreateApiServer } from '../indexer/api/server.ts';
import { assertEmptyDatabase } from '../indexer/be06/rebuild.ts';

// Baseline mode loads immutable c41a9ab modules from a detached local worktree.
const baselineRoot = process.env.BE07_BASELINE_ROOT;
const PostgresStorage = baselineRoot ? (await import(pathToFileURL(resolve(baselineRoot,'indexer/storage.ts')))).PostgresStorage : CurrentPostgresStorage;
const sync = baselineRoot ? (await import(pathToFileURL(resolve(baselineRoot,'indexer/syncer.ts')))).sync : Currentsync;
const project = baselineRoot ? (await import(pathToFileURL(resolve(baselineRoot,'indexer/projection/projector.ts')))).project : Currentproject;
const createApiServer = baselineRoot ? (await import(pathToFileURL(resolve(baselineRoot,'indexer/api/server.ts')))).createApiServer : CurrentcreateApiServer;
const args = process.argv.slice(2);
const flags = args.slice(2);
const withBe07 = flags.includes('--be07');
const withApi = flags.includes('--api') || withBe07;
const withBe06 = flags.includes('--be06');
assert.ok(args.length >= 2 && args[0] === '--output' && flags.every((flag) => ['--api', '--be06', '--be07'].includes(flag))
  && new Set(flags).size === flags.length,
  'Usage: node --import tsx scripts/check_be04_live.mjs --output <report.json> [--api] [--be06]');
assert.equal(process.env.BE04_LIVE_ISOLATED, '1', 'Use a new caller-owned isolated database.');
const url = new URL(process.env.BE04_LIVE_DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.username, 'be04_test');
assert.equal(url.pathname, baselineRoot ? '/be04_live_baseline' : '/be04_live');
if (withBe06) assert.equal(process.env.BE06_LIVE_ISOLATED, '1', 'Use two new caller-owned isolated BE06 target databases.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(args[1]);
const pool = new pg.Pool({ connectionString: url.href, max: 3 });
const liveBe06Pools = [];
function be06TargetPool(name) {
  const value = process.env[name];
  assert.ok(value, `Set ${name} to a new isolated PostgreSQL database.`);
  const targetUrl = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(targetUrl.protocol));
  assert.equal(targetUrl.hostname, '127.0.0.1', `${name} must use numeric loopback PostgreSQL.`);
  assert.ok(!targetUrl.search && !targetUrl.hash, `${name} must not contain query or fragment parameters.`);
  const target = new pg.Pool({ connectionString: targetUrl.href, max: 4 });
  liveBe06Pools.push(target);
  return target;
}
const be06Target = withBe06 ? be06TargetPool('BE06_LIVE_TARGET_DATABASE_URL') : null;
const be06AdvancedTarget = withBe06 ? be06TargetPool('BE06_LIVE_ADVANCED_TARGET_DATABASE_URL') : null;
const report = {
  // BE08 adopts the BE07 scope correction from TV4 213f9f7 (Phan Thanh Dũng).
  scope: withBe07 ? 'Live local Anvil and isolated PostgreSQL: governance, API, BE07 reorg rollback/replay, fail-closed serving, RPC outage/freshness, deep-fork rebuild requirement and BE06 same-H/hash comparison. No testnet or extension wallet.' :
    withBe06 ? 'Live local Anvil and isolated PostgreSQL: governance history, BE03/BE04 publication, independent BE06 rebuilds at the same H/hash, normalized compare, chain reconciliation, and post-H event exclusion.' :
    withApi ? 'BE05 live local Anvil→deploy→governance→BE03→BE04→HTTP API integration, including contract/SQL reconciliation at H. No testnet or reorg rollback.' :
      'BE04 live local projection, K=2, canonical hash-pinned contract reconciliation. No HTTP API, reorg rollback or testnet.',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  runtime: { node: process.version },
  receipts: [],
  phases: [],
  checks: [],
};
let anvil;
let phaseApi;
let phaseApiBase;
let phaseApiChecks = [];
let anvilOutput = '';
try {
  assert.equal(
    (await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,
    0,
    'Refuse a nonempty database.',
  );
  if (withBe06) {
    await assertEmptyDatabase(be06Target);
    await assertEmptyDatabase(be06AdvancedTarget);
  }
  report.runtime.postgres = (await pool.query('SELECT version() AS version')).rows[0].version;
  report.runtime.tsx = JSON.parse(await readFile(new URL('../node_modules/tsx/package.json', import.meta.url), 'utf8')).version;
  report.runtime.typescript = JSON.parse(await readFile(new URL('../node_modules/typescript/package.json', import.meta.url), 'utf8')).version;
  for (const name of ['001_initial', '002_be03', '003_be04', ...(withApi ? ['004_be05_api'] : []), ...(withBe07 && !baselineRoot ? ['005_be07'] : [])])
    await pool.query(await readFile(new URL(`../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
  const reserve = createServer();
  await new Promise((done, reject) => {
    reserve.once('error', reject);
    reserve.listen(0, '127.0.0.1', done);
  });
  const port = reserve.address().port;
  await new Promise((done) => reserve.close(done));
  const bin = process.env.ANVIL_BIN ?? 'anvil';
  report.runtime.anvil = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  report.runtime.forge = execFileSync(process.env.FORGE_BIN ?? 'forge', ['--version'], { encoding: 'utf8' }).trim();
  report.runtime.compiler = '0.8.37+commit.f401782d';
  report.runtime.evm = 'osaka';
  anvil = spawn(
    bin,
    [
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--chain-id',
      '31337',
      '--hardfork',
      'osaka',
      '--timestamp',
      '1800000000',
      '--silent',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  anvil.on('error', (error) => {
    anvilOutput += error.message;
  });
  for (const s of [anvil.stdout, anvil.stderr])
    s.on('data', (data) => {
      anvilOutput += data;
    });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const transport = new HttpRpc(rpcUrl);
  const rpc = (m, p = []) => transport.call(m, p);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await rpc('eth_chainId')) === '0x7a69';
    } catch {}
    if (ready) break;
    assert.equal(anvil.exitCode, null, anvilOutput);
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(ready, 'Owned Anvil startup failed.');
  const wallets = await rpc('eth_accounts');
  const accounts = Object.fromEntries(
    ['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, wallets[i]]),
  );
  const { manifest, abis } = await deployGovernance(rpc, { root, accounts });
  report.manifest = manifest;
  const reorgSnapshot = withBe07 ? await rpc('evm_snapshot', []) : null;
  const reorgAncestor = withBe07 ? await rpc('eth_getBlockByNumber', ['latest', false]) : null;
  const abi = Object.fromEntries(Object.entries(abis).map(([k, v]) => [k, new Interface(v)]));
  const address = Object.fromEntries(Object.entries(manifest.contracts).map(([k, v]) => [k, v.address]));
  const tx = async (label, from, name, method, values = [], at, success = true) => {
    if (at !== undefined) await rpc('evm_setNextBlockTimestamp', [toQuantity(at)]);
    const transactionHash = await rpc('eth_sendTransaction', [
      { from, to: address[name], data: abi[name].encodeFunctionData(method, values), gas: toQuantity(8_000_000) },
    ]);
    const receipt = await waitForReceipt(rpc, transactionHash, { step: label });
    assertReceiptStatus(receipt, transactionHash, label, success);
    if (!success) assert.deepEqual(receipt.logs, []);
    report.receipts.push({ ...receipt, label });
    return receipt;
  };
  const call = async (name, method, values = []) =>
    abi[name].decodeFunctionResult(
      method,
      await rpc('eth_call', [{ to: address[name], data: abi[name].encodeFunctionData(method, values) }, 'latest']),
    );
  const U = 10n ** 18n;
  const shared = ZeroHash;
  const definitions = [
    ['payment', shared],
    ['duplicate', shared],
    ['low-quorum', id('be04:low')],
    ['abstain', id('be04:abstain')],
    ['cancel', id('be04:cancel')],
  ];
  const proposals = [];
  const now = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 1n;
  for (const [label, requestId] of definitions) {
    const description = `  ${JSON.stringify({ version: 1, title: `BE04 ${label} 🗳️`, body: 'Giữ nguyên description và calldata để đối chiếu.' })}  `;
    const targets = [address.Treasury],
      values = ['0'],
      calldatas = [abi.Treasury.encodeFunctionData('disburse', [requestId, accounts.recipient, 1000n * U])];
    const proposalId = String(
      (await call('Governor', 'hashProposal', [targets, values, calldatas, id(description)]))[0],
    );
    await tx(`propose ${label}`, accounts.A, 'Governor', 'propose', [targets, values, calldatas, description], now);
    proposals.push({
      label,
      proposalId,
      requestId,
      description,
      targets,
      values,
      calldatas,
      descriptionHash: id(description),
    });
  }
  const first = proposals[0],
    snapshot = BigInt((await call('Governor', 'proposalSnapshot', [first.proposalId]))[0]);
  const deadline = BigInt((await call('Governor', 'proposalDeadline', [first.proposalId]))[0]);
  const keys = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
  const start = Object.values(keys)
    .map((k) => BigInt(manifest.contracts[k].deploymentBlock))
    .reduce((a, b) => (a < b ? a : b));
  const d = (
    await pool.query(
      `INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config)
    VALUES(31337,'be04-live',$1,'be04-live',$2::jsonb) RETURNING deployment_id::text`,
      [String(start), JSON.stringify(manifest.config)],
    )
  ).rows[0].deployment_id;
  const contracts = Object.entries(keys).map(([role, k]) => ({
    role,
    address: manifest.contracts[k].address.toLowerCase(),
    deploymentBlock: manifest.contracts[k].deploymentBlock,
    abiVersion: manifest.contracts[k].abiVersion,
  }));
  if (withApi) {
    const govContract = manifest.contracts.GOV;
    assert.ok(govContract, 'Manifest must provide the deployed governance token address and ABI version for BE05.');
    await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
      VALUES($1,31337,'governance_token',$2,$3,$4)`, [d, govContract.address.toLowerCase(), govContract.deploymentBlock, govContract.abiVersion]);
  }
  for (const c of contracts)
    await pool.query(
      `INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
    VALUES($1,31337,$2,$3,$4,$5)`,
      [d, c.role, c.address, c.deploymentBlock, c.abiVersion],
    );
  if (withApi) {
    phaseApi = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 900 });
    await new Promise((done, reject) => { phaseApi.once('error', reject); phaseApi.listen(0, '127.0.0.1', done); });
    phaseApiBase = `http://127.0.0.1:${phaseApi.address().port}/api`;
  }
  const phaseApiGet = async (path, params = new URLSearchParams({ chainId: '31337', deploymentId: 'be04-live' })) => {
    const response = await fetch(`${phaseApiBase}${path}?${params}`);
    return { status: response.status, body: await response.json() };
  };
  const config = parseConfig(
    {
      rpcUrl,
      chainId: '31337',
      deploymentId: d,
      fromBlock: String(start),
      toBlock: 'latest',
      batchSize: '7',
      confirmations: 2,
      contracts,
    },
    {},
  );
  const storage = new PostgresStorage(pool);
  const phase = async (label, expected) => {
    const h = await rpc('eth_getBlockByNumber', ['latest', false]);
    await rpc('anvil_mine', ['0x2', '0x0']);
    config.toBlock = BigInt(h.number);
    const raw = await sync(config, transport, storage);
    assert.equal(raw.checkpoint.number, String(BigInt(h.number)));
    assert.equal(raw.checkpoint.hash, h.hash);
    const projection = await project(config, transport, pool);
    const states = (
      await pool.query(
        `SELECT p.proposal_id::text,s.state,s.quorum::text,s.operation_status FROM proposals p
      JOIN proposal_states s USING(deployment_id,proposal_id) WHERE p.deployment_id=$1 ORDER BY p.proposal_id`,
        [d],
      )
    ).rows;
    for (const p of proposals) {
      const row = states.find((s) => s.proposal_id === p.proposalId);
      assert.equal(row?.state, expected[p.label], `${label}/${p.label}`);
    }
    if (withApi) {
      const scope = new URLSearchParams({ chainId: '31337', deploymentId: 'be04-live' });
      const summary = await phaseApiGet('/summary', scope);
      assert.equal(summary.status, 200, `${label}/summary: ${JSON.stringify(summary.body)}`);
      for (const key of ['chainId','asOfBlock','asOfBlockHash','asOfTimestamp','snapshotRevision','dataKind'])
        assert.equal(summary.body.context[key], projection.context[key], `${label}/summary ${key}`);
      assert.equal(summary.body.data.treasury.balance, projection.treasury.balance, `${label}/summary balance`);
      assert.equal(summary.body.data.proposalCounts.total, proposals.length, `${label}/summary count`);
      const pinned = new URLSearchParams({ ...Object.fromEntries(scope), asOfBlock: projection.context.asOfBlock,
        asOfBlockHash: projection.context.asOfBlockHash });
      const list = await phaseApiGet('/proposals', pinned);
      assert.equal(list.status, 200, `${label}/proposals`);
      assert.equal(list.body.pagination.totalCount, proposals.length, `${label}/proposal count`);
      const sqlTotals = (await pool.query('SELECT total_in::text,total_out::text,balance::text FROM treasury_totals WHERE deployment_id=$1', [d])).rows[0];
      for (const key of ['totalIn','totalOut','balance'])
        assert.equal(summary.body.data.treasury[key], sqlTotals[{ totalIn: 'total_in', totalOut: 'total_out', balance: 'balance' }[key]], `${label}/SQL ${key}`);
      let contractBalance;
      const balanceCall = await rpc('eth_call', [
        { to: address.BUD, data: abi.BUD.encodeFunctionData('balanceOf', [address.Treasury]) },
        { blockHash: projection.context.asOfBlockHash, requireCanonical: true },
      ]);
      contractBalance = String(abi.BUD.decodeFunctionResult('balanceOf', balanceCall)[0]);
      assert.equal(summary.body.data.treasury.balance, contractBalance, `${label}/balanceOf(H)`);
      for (const p of proposals) {
        const row = states.find((s) => s.proposal_id === p.proposalId);
        const detail = await phaseApiGet(`/proposals/${p.proposalId}`, pinned);
        assert.equal(detail.status, 200, `${label}/detail ${p.label}`);
        assert.equal(detail.body.context.asOfBlockHash, projection.context.asOfBlockHash);
        assert.equal(detail.body.data.state, row.state, `${label}/state ${p.label}`);
        assert.equal(detail.body.data.votes.quorum, row.quorum === null ? null : String(row.quorum), `${label}/quorum ${p.label}`);
        assert.equal(detail.body.data.operation?.status ?? null, row.operation_status, `${label}/operation ${p.label}`);
        const votes = await phaseApiGet(`/proposals/${p.proposalId}/votes`, pinned);
        assert.equal(votes.status, 200, `${label}/votes ${p.label}`);
        const sums = [0n, 0n, 0n];
        for (const vote of votes.body.data) sums[vote.support] += BigInt(vote.weight);
        assert.deepEqual(sums.map(String), [detail.body.data.votes.against, detail.body.data.votes.for, detail.body.data.votes.abstain],
          `${label}/vote totals ${p.label}`);
      }
      const transferParams = new URLSearchParams({ ...Object.fromEntries(pinned), limit: '100' });
      const transfers = await phaseApiGet('/treasury/transfers', transferParams);
      assert.equal(transfers.status, 200, `${label}/transfers`);
      const transferCount = (await pool.query(`SELECT count(*)::text AS count FROM transfers
        WHERE deployment_id=$1 AND token_address=$2 AND treasury_address=$3 AND (from_address=treasury_address OR to_address=treasury_address)`,
      [d, address.BUD.toLowerCase(), address.Treasury.toLowerCase()])).rows[0].count;
      assert.equal(transfers.body.pagination.totalCount, Number(transferCount), `${label}/transfer count`);
      const health = await phaseApiGet('/health', scope);
      assert.equal(health.status, 200, `${label}/health`);
      assert.equal(health.body.data.publication, 'ready');
      assert.equal(health.body.data.rawDecodeComplete, false);
      phaseApiChecks.push({ label, context: summary.body.context, balance: contractBalance, totals: sqlTotals,
        proposalCount: list.body.pagination.totalCount, transferCount, health: health.body.data.status });
    }
    report.phases.push({
      label,
      raw: { checkpoint: raw.checkpoint, decodeComplete: raw.decodeComplete, unknownTopics: raw.unknownTopics },
      projection,
      states,
    });
    console.log(
      JSON.stringify({
        phase: label,
        H: projection.context.asOfBlock,
        counts: projection.counts,
        balance: projection.treasury.balance,
      }),
    );
    return { h, states, projection };
  };
  const all = (state) => Object.fromEntries(proposals.map((p) => [p.label, state]));
  const pending = await phase('created', all('Pending'));
  assert.ok(pending.states.every((s) => s.quorum === null));
  await tx(
    'cancel Pending',
    accounts.A,
    'Governor',
    'cancel',
    [proposals[4].targets, proposals[4].values, proposals[4].calldatas, proposals[4].descriptionHash],
    snapshot - 1n,
  );
  await rpc('evm_setNextBlockTimestamp', [toQuantity(snapshot)]);
  await rpc('evm_mine');
  const atSnapshot = await phase('exact snapshot', { ...all('Pending'), cancel: 'Canceled' });
  assert.ok(atSnapshot.states.every((s) => s.quorum === null));
  await rpc('evm_setNextBlockTimestamp', [toQuantity(snapshot + 1n)]);
  await rpc('evm_mine');
  await phase('empty Active block', { ...all('Active'), cancel: 'Canceled' });
  for (const p of proposals.slice(0, 2)) {
    await tx(
      `WithParams ${p.label}`,
      accounts.A,
      'Governor',
      'castVoteWithReasonAndParams',
      [p.proposalId, 1, 'Đồng ý 🗳️', '0x0001ff00'],
      snapshot + 1n,
    );
    await tx(`vote B ${p.label}`, accounts.B, 'Governor', 'castVote', [p.proposalId, 1], snapshot + 1n);
  }
  await tx('insufficient quorum', accounts.D, 'Governor', 'castVote', [proposals[2].proposalId, 1], snapshot + 1n);
  await tx('abstain For', accounts.D, 'Governor', 'castVote', [proposals[3].proposalId, 1], snapshot + 1n);
  await tx('abstain counts quorum', accounts.C, 'Governor', 'castVote', [proposals[3].proposalId, 2], snapshot + 1n);
  await rpc('evm_setNextBlockTimestamp', [toQuantity(deadline)]);
  await rpc('evm_mine');
  await phase('exact deadline', { ...all('Active'), cancel: 'Canceled' });
  await rpc('evm_setNextBlockTimestamp', [toQuantity(deadline + 1n)]);
  await rpc('evm_mine');
  await phase('empty result block', { ...all('Succeeded'), 'low-quorum': 'Defeated', cancel: 'Canceled' });
  const operationArgs = (p) => [p.targets, p.values, p.calldatas, p.descriptionHash];
  for (const p of proposals.slice(0, 2))
    await tx(`queue ${p.label}`, accounts.caller, 'Governor', 'queue', operationArgs(p), deadline + 1n);
  const eta = BigInt((await call('Governor', 'proposalEta', [first.proposalId]))[0]);
  const queued = {
    ...all('Succeeded'),
    payment: 'Queued',
    duplicate: 'Queued',
    'low-quorum': 'Defeated',
    cancel: 'Canceled',
  };
  await phase('queued Waiting', queued);
  await rpc('evm_setNextBlockTimestamp', [toQuantity(eta)]);
  await rpc('evm_mine');
  const readyPhase = await phase('empty Ready block', queued);
  assert.equal(readyPhase.states.filter((s) => s.operation_status === 'Ready').length, 2);
  await tx('execute 1000 BUD', accounts.outsider, 'Governor', 'execute', operationArgs(first), eta);
  await tx(
    'same request cannot pay again',
    accounts.outsider,
    'Governor',
    'execute',
    operationArgs(proposals[1]),
    eta,
    false,
  );
  const firstPayment = await phase('executed plus zero requestId duplicate revert', { ...queued, payment: 'Executed' });
  assert.equal(firstPayment.projection.treasury.balance, String(9000n * U));
  assert.equal(firstPayment.projection.treasury.totalOut, String(1000n * U));
  assert.deepEqual(firstPayment.projection.counts, { proposals: 5, votes: 7, operations: 2, transfers: 2, disbursements: 1 });

  const underfundRequest = id('be04:underfunded-retry');
  const underfundDescription = '  {"version":1,"title":"BE04 insufficient funds","body":"Nạp quỹ rồi thử lại."}  ';
  const underfundTargets = [address.Treasury];
  const underfundValues = ['0'];
  const underfundCalldatas = [
    abi.Treasury.encodeFunctionData('disburse', [underfundRequest, accounts.recipient, 11000n * U]),
  ];
  const underfundProposalId = String(
    (await call('Governor', 'hashProposal', [underfundTargets, underfundValues, underfundCalldatas, id(underfundDescription)]))[0],
  );
  const underfundProposal = { label: 'underfunded-retry', proposalId: underfundProposalId, requestId: underfundRequest,
    description: underfundDescription, targets: underfundTargets, values: underfundValues, calldatas: underfundCalldatas,
    descriptionHash: id(underfundDescription) };
  proposals.push(underfundProposal);
  const underfundNow = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 1n;
  await tx(
    'propose underfunded payment',
    accounts.A,
    'Governor',
    'propose',
    [underfundTargets, underfundValues, underfundCalldatas, underfundDescription],
    underfundNow,
  );
  const underfundSnapshot = BigInt((await call('Governor', 'proposalSnapshot', [underfundProposalId]))[0]);
  const underfundDeadline = BigInt((await call('Governor', 'proposalDeadline', [underfundProposalId]))[0]);
  await tx('vote underfunded proposal A', accounts.A, 'Governor', 'castVote', [underfundProposalId, 1], underfundSnapshot + 1n);
  await tx('vote underfunded proposal B', accounts.B, 'Governor', 'castVote', [underfundProposalId, 1], underfundSnapshot + 1n);
  const underfundArgs = [underfundTargets, underfundValues, underfundCalldatas, id(underfundDescription)];
  const underfundBalanceBefore = (await call('BUD', 'balanceOf', [address.Treasury]))[0];
  assert.equal(underfundBalanceBefore, 9000n * U);
  await tx('queue underfunded proposal', accounts.caller, 'Governor', 'queue', underfundArgs, underfundDeadline + 1n);
  const underfundEta = BigInt((await call('Governor', 'proposalEta', [underfundProposalId]))[0]);
  await rpc('evm_setNextBlockTimestamp', [toQuantity(underfundEta)]);
  await rpc('evm_mine');
  await tx(
    'underfunded execute reverts',
    accounts.outsider,
    'Governor',
    'execute',
    underfundArgs,
    underfundEta,
    false,
  );
  const paidAfterRevert = (await call('Treasury', 'paidRequests', [underfundRequest]))[0];
  const balanceAfterRevert = (await call('BUD', 'balanceOf', [address.Treasury]))[0];
  assert.equal(paidAfterRevert, false);
  assert.equal(balanceAfterRevert, underfundBalanceBefore);
  const afterRevert = await phase('underfunded execute reverted', { ...queued, payment: 'Executed', 'underfunded-retry': 'Queued' });
  assert.equal(afterRevert.projection.treasury.balance, String(9000n * U));
  assert.deepEqual(afterRevert.projection.counts,
    { proposals: 6, votes: 9, operations: 3, transfers: 2, disbursements: 1 });
  const underfundState = async () =>
    (
      await pool.query(
        `SELECT s.state,s.operation_status FROM proposal_states s WHERE s.deployment_id=$1 AND s.proposal_id=$2`,
        [d, underfundProposalId],
      )
    ).rows[0];
  const stateAfterRevert = await underfundState();
  assert.deepEqual(stateAfterRevert, { state: 'Queued', operation_status: 'Ready' });
  await tx(
    'top up Treasury after execute revert',
    accounts.funding,
    'BUD',
    'transfer',
    [address.Treasury, 3000n * U],
  );
  const balanceAfterTopUp = (await call('BUD', 'balanceOf', [address.Treasury]))[0];
  assert.equal(balanceAfterTopUp, 12000n * U);
  await tx('retry underfunded execute after funding', accounts.outsider, 'Governor', 'execute', underfundArgs, underfundEta + 2n);
  const paidAfterRetry = (await call('Treasury', 'paidRequests', [underfundRequest]))[0];
  assert.equal(paidAfterRetry, true);
  const final = await phase('funded retry succeeds', { ...queued, payment: 'Executed', 'underfunded-retry': 'Executed' });
  assert.equal(final.projection.treasury.balance, String(1000n * U));
  assert.equal(final.projection.treasury.totalIn, String(13000n * U));
  assert.equal(final.projection.treasury.totalOut, String(12000n * U));
  assert.deepEqual(final.projection.counts, { proposals: 6, votes: 9, operations: 3, transfers: 4, disbursements: 2 });
  const stateAfterRetry = await underfundState();
  assert.deepEqual(stateAfterRetry, { state: 'Executed', operation_status: 'Done' });
  report.underfundingCheck = {
    requestId: underfundRequest,
    amount: String(11000n * U),
    balanceBefore: underfundBalanceBefore.toString(),
    failedExecutionReceipt: report.receipts.find((r) => r.label === 'underfunded execute reverts'),
    paidAfterRevert,
    balanceAfterRevert: balanceAfterRevert.toString(),
    topUpAmount: String(3000n * U),
    balanceAfterTopUp: balanceAfterTopUp.toString(),
    successfulRetryReceipt: report.receipts.find((r) => r.label === 'retry underfunded execute after funding'),
    paidAfterRetry,
    balanceAfterRetry: final.projection.treasury.balance,
    stateAfterRevert,
    stateAfterRetry,
    revertProjectionContext: afterRevert.projection.context,
    retryProjectionContext: final.projection.context,
  };
  const rows = (
    await pool.query(
      `SELECT p.proposal_id::text,p.request_id,p.description,p.description_hash,v.params,s.state,
    b.request_id AS paid_request,b.proposal_id::text AS paid_proposal,t.amount::text AS transfer_amount
    FROM proposals p LEFT JOIN votes v ON v.deployment_id=p.deployment_id AND v.proposal_id=p.proposal_id
    JOIN proposal_states s ON s.deployment_id=p.deployment_id AND s.proposal_id=p.proposal_id
    LEFT JOIN disbursements b ON b.deployment_id=p.deployment_id AND b.proposal_id=p.proposal_id
    LEFT JOIN transfers t ON t.deployment_id=b.deployment_id AND t.transfer_id=b.transfer_id
    WHERE p.deployment_id=$1 ORDER BY p.proposal_id,v.voter`,
      [d],
    )
  ).rows;
  for (const p of proposals)
    assert.ok(
      rows
        .filter((r) => r.proposal_id === p.proposalId)
        .every((r) => r.description === p.description && r.description_hash === p.descriptionHash),
    );
  assert.ok(rows.filter((r) => r.proposal_id === proposals[1].proposalId).every((r) => r.paid_request === null));
  const firstZeroRequestPayment = rows.find((r) => r.proposal_id === proposals[0].proposalId);
  assert.equal(firstZeroRequestPayment?.request_id, ZeroHash);
  assert.equal(firstZeroRequestPayment?.paid_request, ZeroHash);
  assert.equal(firstZeroRequestPayment?.paid_proposal, proposals[0].proposalId);
  assert.equal(rows.find((r) => r.proposal_id === underfundProposalId)?.transfer_amount, String(11000n * U));
  const stable = async () => {
    const snapshot = {};
    for (const t of ['proposals', 'votes', 'operations', 'transfers', 'disbursements', 'proposal_states'])
      snapshot[t] = (
        await pool.query(`SELECT to_jsonb(t) AS row FROM ${t} t WHERE deployment_id=$1 ORDER BY to_jsonb(t)::text`, [d])
      ).rows;
    return snapshot;
  };
  const before = await stable();
  const finalProjection = await project(config, transport, pool);
  assert.deepEqual(await stable(), before);
  const rawBefore = (
    await pool.query(
      'SELECT raw_event_id,rpc_log,decode_status FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id',
      [d],
    )
  ).rows;
  const restarted = await sync(config, transport, storage);
  assert.equal(restarted.committedBatches, 0);
  assert.deepEqual(
    (
      await pool.query(
        'SELECT raw_event_id,rpc_log,decode_status FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id',
        [d],
      )
    ).rows,
    rawBefore,
  );
  const readQueries = (
    await readFile(new URL('../database/queries/be04_read_model.sql', import.meta.url), 'utf8')
  ).replaceAll(":'deployment_id'", d);
  await pool.query(readQueries);
  report.proposals = [...proposals];
  report.finalRows = rows;
  report.finalSnapshot = before;
  report.checks.push(
    'five proposals: payment, same request duplicate, quorum failure, abstain quorum, Pending cancellation',
    'snapshot/deadline/ETA boundaries and empty-block state transitions reconciled at each H',
    'WithParams/reason/description preserved; salt and operationId reconstructed from pinned OZ algorithm',
    'one BUD outflow, one disbursement, 9000 BUD balance after 1000 BUD payment',
    'zero requestId with same recipient/amount paid once; duplicate execution made no payment',
    'insufficient-funds execute reverted with zero logs, no paid request or ledger row; top-up and retry succeeded',
    'Treasury balance reconciled 9000 -> 12000 -> 1000 BUD across revert, top-up and retry',
    'repeat projection is row-stable; idle BE03 restart preserves raw identity/unknown classifications',
  );
  report.status = 'PASS';
  if (withApi) {
    const api = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 900 });
    await new Promise((done, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', done); });
    try {
      const base = `http://127.0.0.1:${api.address().port}/api`;
      const common = new URLSearchParams({ chainId: '31337', deploymentId: 'be04-live' });
      const request = async (path, query = common) => {
        const response = await fetch(`${base}${path}?${query}`);
        return { status: response.status, body: await response.json() };
      };
      const summary = await request('/summary');
      assert.equal(summary.status, 200);
      const expectedContext = finalProjection.context;
      for (const key of ['chainId','asOfBlock','asOfBlockHash','asOfTimestamp','snapshotRevision','dataKind'])
        assert.equal(summary.body.context[key], expectedContext[key], `API summary ${key} must match BE04 H.`);
      assert.equal(summary.body.context.deploymentId, 'be04-live', 'API scope uses the verified deployment name, not BE04 internal serial ID.');
      const tagged = new URLSearchParams({ ...Object.fromEntries(common), asOfBlock: expectedContext.asOfBlock, asOfBlockHash: expectedContext.asOfBlockHash });
      const detail = await request(`/proposals/${proposals[0].proposalId}`, tagged);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.description, proposals[0].description);
      assert.equal(detail.body.data.descriptionHash, proposals[0].descriptionHash);
      assert.equal(detail.body.context.asOfBlockHash, expectedContext.asOfBlockHash);
      const votes = await request(`/proposals/${proposals[0].proposalId}/votes`, tagged);
      assert.equal(votes.status, 200);
      assert.equal(votes.body.context.asOfBlock, expectedContext.asOfBlock);
      const transferPage = await request('/treasury/transfers', new URLSearchParams({ ...Object.fromEntries(tagged), direction: 'out', limit: '1' }));
      assert.equal(transferPage.status, 200);
      assert.equal(transferPage.body.pagination.totalCount, 2);
      assert.ok(transferPage.body.pagination.nextCursor);
      const secondTransfers = await request('/treasury/transfers', new URLSearchParams({ ...Object.fromEntries(tagged), direction: 'out', limit: '1', cursor: transferPage.body.pagination.nextCursor }));
      assert.equal(secondTransfers.status, 200);
      assert.equal(secondTransfers.body.data.length, 1);
      assert.equal(secondTransfers.body.pagination.nextCursor, null);
      const proposalPage1 = await request('/proposals', new URLSearchParams({ ...Object.fromEntries(tagged), limit: '2' }));
      const proposalIds = [...proposalPage1.body.data.map((p) => p.proposalId)];
      let next = proposalPage1.body.pagination.nextCursor;
      while (next) {
        const page = await request('/proposals', new URLSearchParams({ ...Object.fromEntries(tagged), limit: '2', cursor: next }));
        assert.equal(page.status, 200);
        assert.equal(page.body.context.asOfBlockHash, expectedContext.asOfBlockHash);
        proposalIds.push(...page.body.data.map((p) => p.proposalId));
        next = page.body.pagination.nextCursor;
      }
      assert.equal(proposalIds.length, Number(summary.body.data.proposalCounts.total));
      assert.equal(new Set(proposalIds).size, proposalIds.length);
      const pinnedCall = await rpc('eth_call', [
        { to: address.BUD, data: abi.BUD.encodeFunctionData('balanceOf', [address.Treasury]) },
        { blockHash: expectedContext.asOfBlockHash, requireCanonical: true },
      ]);
      const contractBalance = String(abi.BUD.decodeFunctionResult('balanceOf', pinnedCall)[0]);
      const sqlTotals = (await pool.query(`SELECT total_in::text,total_out::text,balance::text FROM treasury_totals WHERE deployment_id=$1`, [d])).rows[0];
      assert.equal(summary.body.data.treasury.balance, contractBalance);
      assert.equal(summary.body.data.treasury.balance, sqlTotals.balance);
      assert.equal(summary.body.data.treasury.totalIn, sqlTotals.total_in);
      assert.equal(summary.body.data.treasury.totalOut, sqlTotals.total_out);
      const transferCount = (await pool.query(`SELECT count(*)::text AS count FROM transfers
        WHERE deployment_id=$1 AND token_address=$2 AND treasury_address=$3 AND (from_address=treasury_address OR to_address=treasury_address)`,
      [d, address.BUD.toLowerCase(), address.Treasury.toLowerCase()])).rows[0].count;
      assert.equal((await request('/treasury/transfers', tagged)).body.pagination.totalCount, Number(transferCount));
      const health = await request('/health');
      assert.ok(health.status === 200 || health.status === 503);
      report.api = { status: 'PASS', context: summary.body.context, summary: summary.body.data,
        contractBalance, sqlTotals, transferCount, proposalsPaged: proposalIds.length,
        phaseChecks: phaseApiChecks,
        health: health.body, checks: ['all six GET routes responded from the live PostgreSQL deployment',
          'proposal pages had no duplicates and retained one H/hash', 'Transfer totals and treasury balance match SQL and hash-pinned contract balanceOf(H)',
          'proposal detail description/hash and votes read from the live projection'] };
    } finally { await new Promise((done) => api.close(done)); }
  }
  if (withBe07) {
    const { checkBe07Live } = await import('./check_be07_live.mjs');
    report.be07 = await checkBe07Live({pool,config,rpc,transport,storage,project,sync,tx,accounts,address,manifest,
      reorgSnapshot,reorgAncestor,apiGet:phaseApiGet,baselineRoot,stable,call,abi});
  }
  if (withBe06) {
    const atBlock = finalProjection.context.asOfBlock;
    const manifestInput = {
      format: manifest.format,
      sourceCommit: manifest.sourceCommit,
      chainId: manifest.chainId,
      deploymentName: 'be06-live-anvil',
      scanFromBlock: manifest.scanFromBlock,
      confirmations: manifest.confirmations,
      batchSize: '7',
      contracts: {
        ...Object.fromEntries([
          ['governor', 'Governor'], ['timelock', 'Timelock'], ['treasury', 'Treasury'], ['budget_token', 'BUD'],
        ].map(([role, key]) => [role, {
          address: manifest.contracts[key].address,
          deploymentBlock: manifest.contracts[key].deploymentBlock,
          abiVersion: manifest.contracts[key].abiVersion,
        }])),
        GOV: {
          address: manifest.contracts.GOV.address,
          deploymentBlock: manifest.contracts.GOV.deploymentBlock,
          abiVersion: manifest.contracts.GOV.abiVersion,
        },
      },
    };
    const manifestBytes = `${JSON.stringify(manifestInput, null, 2)}\n`;
    const manifestPath = `${output}.be06-manifest.json`;
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, manifestBytes, { flag: 'wx', mode: 0o600 });
    const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
    const blockHash = finalProjection.context.asOfBlockHash;
    const cliCommands = [];
    const invokeBe06Cli = (targetDatabaseUrl, commandArgs, expectedExit = 0) => {
      const args = ['--import', 'tsx', 'indexer/be06/cli.ts', ...commandArgs];
      const env = { ...process.env, RPC_URL: rpcUrl, BE06_REFERENCE_DATABASE_URL: url.href,
        BE06_TARGET_DATABASE_URL: targetDatabaseUrl };
      let stdout = '';
      let exitCode = 0;
      try { stdout = execFileSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' }); }
      catch (error) {
        exitCode = error.status ?? 1;
        stdout = error.stdout?.toString() ?? '';
        if (exitCode !== expectedExit) throw error;
      }
      assert.equal(exitCode, expectedExit, 'BE06 command exited with an unexpected status.');
      cliCommands.push({ argv: ['node', ...args], exitCode });
      return stdout;
    };
    const jsonFile = async (path) => JSON.parse(await readFile(path, 'utf8'));

    const firstRebuildPath = `${output}.be06-first-rebuild.json`;
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['rebuild', '--manifest', manifestPath, '--at', atBlock, '--output', firstRebuildPath]);
    const firstRebuild = await jsonFile(firstRebuildPath);
    assert.equal(firstRebuild.rawCheckpoint.block, atBlock);
    assert.equal(firstRebuild.rawCheckpoint.hash, blockHash);
    const firstReferenceExportPath = `${output}.be06-first-reference.json`;
    const firstTargetExportPath = `${output}.be06-first-target.json`;
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['export', '--manifest', manifestPath, '--at', atBlock, '--database', 'reference', '--output', firstReferenceExportPath]);
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['export', '--manifest', manifestPath, '--at', atBlock, '--database', 'target', '--output', firstTargetExportPath]);
    const firstComparePath = `${output}.be06-first-compare.json`;
    const firstSummaryPath = `${output}.be06-first-compare.md`;
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['compare', '--manifest', manifestPath, '--at', atBlock, '--json-output', firstComparePath,
        '--summary-output', firstSummaryPath]);
    const firstCompare = await jsonFile(firstComparePath);
    assert.equal(firstCompare.result, 'equal', JSON.stringify(firstCompare.mismatches));
    assert.equal(firstCompare.chainCrossCheck?.hash, blockHash);
    const referenceData = await jsonFile(firstReferenceExportPath);
    const firstData = await jsonFile(firstTargetExportPath);
    assert.deepEqual(firstData, referenceData);
    const normalizedSha256 = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const sourceDecode = report.phases.at(-1).raw;
    assert.equal(sourceDecode.unknownTopics, 16, 'Keep all 16 known bootstrap ancillary unknown logs.');
    assert.equal(firstRebuild.decodeWarnings.complete, sourceDecode.decodeComplete);
    assert.equal(firstRebuild.decodeWarnings.complete, false, 'Ancillary unknown logs must not become full decode.');
    assert.equal(firstRebuild.decodeWarnings.unknownTopics, sourceDecode.unknownTopics);

    const proposalId = String(firstData.proposalStates[0].proposalId);
    const originalState = String(firstData.proposalStates[0].state);
    const wrongState = originalState === 'Defeated' ? 'Succeeded' : 'Defeated';
    await be06Target.query('UPDATE proposal_states SET state=$3 WHERE deployment_id=$1 AND proposal_id=$2',
      [firstRebuild.target.deploymentId, proposalId, wrongState]);
    const mismatchPath = `${output}.be06-mismatch-probe.json`;
    const mismatchSummaryPath = `${output}.be06-mismatch-probe.md`;
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['compare', '--manifest', manifestPath, '--at', atBlock, '--json-output', mismatchPath,
        '--summary-output', mismatchSummaryPath], 2);
    const mismatchProbe = await jsonFile(mismatchPath);
    assert.equal(mismatchProbe.result, 'mismatch');
    assert.ok(mismatchProbe.mismatches.some((item) => item.path === `proposalStates[proposal:${proposalId}].state`
      && item.reference === originalState && item.rebuild === wrongState));
    await be06Target.query('UPDATE proposal_states SET state=$3 WHERE deployment_id=$1 AND proposal_id=$2',
      [firstRebuild.target.deploymentId, proposalId, originalState]);
    const restoredComparePath = `${output}.be06-restored-compare.json`;
    const restoredSummaryPath = `${output}.be06-restored-compare.md`;
    invokeBe06Cli(process.env.BE06_LIVE_TARGET_DATABASE_URL,
      ['compare', '--manifest', manifestPath, '--at', atBlock, '--json-output', restoredComparePath,
        '--summary-output', restoredSummaryPath]);
    assert.equal((await jsonFile(restoredComparePath)).result, 'equal');

    // Advance Anvil with a real BUD Transfer after H. A second fresh target must
    // still index and publish exactly H, even though later logs are available.
    const laterTransfer = await tx('BE06 post-H BUD Transfer', accounts.funding, 'BUD', 'transfer',
      [accounts.recipient, 1n * U]);
    const laterBlock = BigInt(laterTransfer.blockNumber);
    assert.ok(laterBlock > BigInt(atBlock), 'Post-H transfer must be in a later block.');
    const laterLogs = await rpc('eth_getLogs', [{ address: address.BUD, fromBlock: laterTransfer.blockNumber,
      toBlock: laterTransfer.blockNumber }]);
    assert.ok(laterLogs.length > 0, 'The post-H BUD Transfer must be available from RPC.');
    await rpc('anvil_mine', ['0x3', '0x0']);

    const advancedRebuildPath = `${output}.be06-advanced-rebuild.json`;
    invokeBe06Cli(process.env.BE06_LIVE_ADVANCED_TARGET_DATABASE_URL,
      ['rebuild', '--manifest', manifestPath, '--at', atBlock, '--output', advancedRebuildPath]);
    const advancedRebuild = await jsonFile(advancedRebuildPath);
    assert.equal(advancedRebuild.rawCheckpoint.block, atBlock);
    assert.equal(advancedRebuild.rawCheckpoint.hash, blockHash);
    const advancedReferenceExportPath = `${output}.be06-advanced-reference.json`;
    const advancedTargetExportPath = `${output}.be06-advanced-target.json`;
    invokeBe06Cli(process.env.BE06_LIVE_ADVANCED_TARGET_DATABASE_URL,
      ['export', '--manifest', manifestPath, '--at', atBlock, '--database', 'reference', '--output', advancedReferenceExportPath]);
    invokeBe06Cli(process.env.BE06_LIVE_ADVANCED_TARGET_DATABASE_URL,
      ['export', '--manifest', manifestPath, '--at', atBlock, '--database', 'target', '--output', advancedTargetExportPath]);
    const advancedComparePath = `${output}.be06-advanced-compare.json`;
    const advancedSummaryPath = `${output}.be06-advanced-compare.md`;
    invokeBe06Cli(process.env.BE06_LIVE_ADVANCED_TARGET_DATABASE_URL,
      ['compare', '--manifest', manifestPath, '--at', atBlock, '--json-output', advancedComparePath,
        '--summary-output', advancedSummaryPath]);
    const advancedCompare = await jsonFile(advancedComparePath);
    assert.equal(advancedCompare.result, 'equal', JSON.stringify(advancedCompare.mismatches));
    assert.equal(advancedCompare.chainCrossCheck?.hash, blockHash);
    const advancedReferenceData = await jsonFile(advancedReferenceExportPath);
    const advancedData = await jsonFile(advancedTargetExportPath);
    assert.deepEqual(advancedReferenceData, referenceData);
    assert.deepEqual(advancedData, referenceData);
    assert.equal(advancedRebuild.decodeWarnings.complete, false);
    assert.equal(advancedRebuild.decodeWarnings.unknownTopics, 16);
    for (const [targetPool, identity] of [[be06Target, firstRebuild.target], [be06AdvancedTarget, advancedRebuild.target]]) {
      const [blocksAhead, eventsAhead] = await Promise.all([
        targetPool.query('SELECT count(*)::text AS count FROM indexed_blocks WHERE deployment_id=$1 AND block_number>$2',
          [identity.deploymentId, atBlock]),
        targetPool.query('SELECT count(*)::text AS count FROM raw_events WHERE deployment_id=$1 AND block_number>$2',
          [identity.deploymentId, atBlock]),
      ]);
      assert.equal(blocksAhead.rows[0].count, '0', 'No indexed header may exist after H.');
      assert.equal(eventsAhead.rows[0].count, '0', 'No raw event may exist after H.');
    }
    report.be06 = {
      status: 'PASS',
      manifest: { path: manifestPath, sha256: manifestSha256, sourceCommit: manifest.sourceCommit },
      deploymentScope: referenceData.context.scope,
      requestedBlock: atBlock,
      blockHash,
      confirmations: Number(manifest.confirmations),
      cliCommands,
      mismatchProbe: { result: mismatchProbe.result, exitCode: 2, mismatches: mismatchProbe.mismatches },
      firstRebuild,
      firstCompare: { result: firstCompare.result, chainCrossCheck: firstCompare.chainCrossCheck, mismatches: firstCompare.mismatches },
      postH: { transfer: laterTransfer, block: laterBlock.toString(), rpcLogCount: laterLogs.length,
        chainHeadAfterMining: await rpc('eth_blockNumber'), excludedFromBothTargets: true },
      advancedRebuild,
      advancedCompare: { result: advancedCompare.result, chainCrossCheck: advancedCompare.chainCrossCheck,
        mismatches: advancedCompare.mismatches },
      normalized: { sha256: { reference: normalizedSha256(referenceData), firstRebuild: normalizedSha256(firstData),
        advancedRebuild: normalizedSha256(advancedData) },
        reference: referenceData, firstRebuild: firstData, advancedRebuild: advancedData },
      checks: ['fresh PostgreSQL targets rebuilt from the verified manifest and RPC using BE03 sync and BE04 projection',
        'both targets published exactly H/hash and matched the source publication at the same H/hash and deployment scope',
        'proposal state, proposalVotes/quorum, timelock, contract links and balanceOf reconciled at H/hash',
        'a BUD Transfer mined after H was returned by RPC but excluded from both target databases'],
    };
  }
} catch (error) {
  report.status = 'FAIL';
  report.error = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  report.sourceHashes = {};
  for (const path of [
    'indexer/projection/model.ts',
    'indexer/projection/chain.ts',
    'indexer/projection/projector.ts',
    'indexer/api/server.ts',
    'database/migrations/004_be05_api.sql',
    'database/migrations/003_be04.sql',
    'indexer/storage.ts',
    'indexer/recovery.ts',
    'indexer/worker.ts',
    'indexer/rpc.ts',
    'database/migrations/005_be07.sql',
    'scripts/check_be07_live.mjs',
    'indexer/cli.ts',
    'indexer/api/main.ts',
    'scripts/check_be04_live.mjs',
    'scripts/check_be05_database.sh',
    'scripts/check_be05_live_database.sh',
    'scripts/governance_local.mjs',
    'scripts/receipt.mjs',
    'tests/indexer/projection-storage.test.ts',
    'tests/indexer/be04-live-receipt.test.mjs',
    'tests/api/server.test.mjs',
    'package.json',
    'package-lock.json',
    '.github/workflows/ci.yml',
    '.env.example',
    'docs/api.md',
    'docs/be03.md',
    'docs/be04.md',
    'README.md',
    '.env.example',
    'docs/be06.md',
    'indexer/config/be06.manifest.example.json',
    'indexer/be06/manifest.ts',
    'indexer/be06/rebuild.ts',
    'indexer/be06/compare.ts',
    'indexer/be06/cli.ts',
    'tests/indexer/be06.test.ts',
    'tests/indexer/be06-db.test.mjs',
  ])
    report.sourceHashes[path] = createHash('sha256')
      .update(await readFile(new URL(`../${path}`, import.meta.url)))
      .digest('hex');
  try {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } finally {
    await pool.end();
    await Promise.all(liveBe06Pools.map((target) => target.end()));
    if (phaseApi && phaseApi.listening) await new Promise((done) => phaseApi.close(done));
    if (anvil && anvil.exitCode === null) {
      const exited = once(anvil, 'close');
      anvil.kill();
      await exited;
    }
  }
}
