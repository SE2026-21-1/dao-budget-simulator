#!/usr/bin/env node
// Owns a new unforked Anvil; database must be new, isolated and explicitly selected.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Interface, ZeroHash, id, toQuantity } from 'ethers';
import pg from 'pg';
import { deployGovernance } from './governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from './receipt.mjs';
import { parseConfig } from '../indexer/config.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { PostgresStorage } from '../indexer/storage.ts';
import { sync } from '../indexer/syncer.ts';
import { project } from '../indexer/projection/projector.ts';

const args = process.argv.slice(2);
assert.ok(
  args.length === 2 && args[0] === '--output',
  'Usage: node --import tsx scripts/check_be04_live.mjs --output <report.json>',
);
assert.equal(process.env.BE04_LIVE_ISOLATED, '1', 'Use a new caller-owned isolated database.');
const url = new URL(process.env.BE04_LIVE_DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.username, 'be04_test');
assert.equal(url.pathname, '/be04_live');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(args[1]);
const pool = new pg.Pool({ connectionString: url.href, max: 3 });
const report = {
  scope:
    'BE04 live local projection, K=2, canonical hash-pinned contract reconciliation. Not HTTP API, reorg rollback, testnet or FR15 rebuild acceptance.',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  runtime: { node: process.version },
  receipts: [],
  phases: [],
  checks: [],
};
let anvil;
let anvilOutput = '';
try {
  assert.equal(
    (await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,
    0,
    'Refuse a nonempty database.',
  );
  report.runtime.postgres = (await pool.query('SELECT version() AS version')).rows[0].version;
  for (const name of ['001_initial', '002_be03', '003_be04'])
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
  for (const c of contracts)
    await pool.query(
      `INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
    VALUES($1,31337,$2,$3,$4,$5)`,
      [d, c.role, c.address, c.deploymentBlock, c.abiVersion],
    );
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
    now,
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
  const afterRevert = await phase('underfunded execute reverted', { ...queued, payment: 'Executed' });
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
  const final = await phase('funded retry succeeds', { ...queued, payment: 'Executed' });
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
  for (const p of [...proposals, {
    proposalId: underfundProposalId,
    description: underfundDescription,
    descriptionHash: id(underfundDescription),
  }])
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
  await project(config, transport, pool);
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
  report.proposals = [...proposals, {
    label: 'underfunded-retry',
    proposalId: underfundProposalId,
    requestId: underfundRequest,
    description: underfundDescription,
    targets: underfundTargets,
    values: underfundValues,
    calldatas: underfundCalldatas,
    descriptionHash: id(underfundDescription),
  }];
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
    'database/migrations/003_be04.sql',
    'indexer/storage.ts',
    'indexer/cli.ts',
    'scripts/check_be04_live.mjs',
    'scripts/governance_local.mjs',
    'scripts/receipt.mjs',
    'tests/indexer/projection-storage.test.ts',
    'tests/indexer/be04-live-receipt.test.mjs',
    'package.json',
    'docs/be03.md',
    'docs/be04.md',
  ])
    report.sourceHashes[path] = createHash('sha256')
      .update(await readFile(new URL(`../${path}`, import.meta.url)))
      .digest('hex');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await pool.end();
  if (anvil && anvil.exitCode === null) {
    const exited = once(anvil, 'close');
    anvil.kill();
    await exited;
  }
}
