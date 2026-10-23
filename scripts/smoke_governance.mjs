#!/usr/bin/env node
// Owns its Anvil. All positive executions use EOA -> Governor -> Timelock -> Treasury.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AbiCoder, Interface, ZeroAddress, ZeroHash, id, keccak256, toBeHex, toQuantity } from 'ethers';
import { deployGovernance, checkGovernanceRoles } from './governance_local.mjs';
import { decodeLog } from '../indexer/decoder.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { readBatch } from '../indexer/reader.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (!((args.length === 2 || (args.length === 3 && args[2] === '--database')) && args[0] === '--output')) {
  console.error('Usage: node --import tsx scripts/smoke_governance.mjs --output <evidence.json> [--database]\nBuild with forge first. Own loopback Anvil only; no RPC URL or keys.\nDatabase opt-in requires TV4_SMOKE_ISOLATED=1 and two new owned loopback databases via TV4_SMOKE_DATABASE_URL / TV4_SMOKE_REBUILD_DATABASE_URL; caller DATABASE_URL is ignored.');
  process.exit(1);
}
const output = resolve(args[1]);
const databaseMode = args.length === 3;
const storageHelper = databaseMode ? await import('./governance_storage.mjs') : undefined;
const storageUrls = storageHelper?.storageSmokeEnvironment();
const pause = ms => new Promise(done => setTimeout(done, ms));
const U = 10n ** 18n;
let anvil;
let anvilOutput = '';
let rpcId = 0;
const report = {
  scope: `Local deployed contracts, final roles, real governance transactions and BE02 receipt decoding.${databaseMode ? ' Includes actual raw PostgreSQL ingestion/restart/second-database replay at fixed H; not FR15 production projection rebuild or TC11 checkpoints/reorg.' : ''} Not testnet, frontend/API, confirmations, reorg or whole-system TC acceptance.`,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: {}, receipts: [], proposals: [], assertions: [],
};
try {
  for (const path of ['scripts/smoke_governance.mjs', 'scripts/governance_local.mjs', 'contracts/BudgetGovernor.sol', 'contracts/GovernanceToken.sol', 'contracts/BudgetToken.sol', 'contracts/Treasury.sol', 'indexer/decoder.ts', 'indexer/abi-registry.ts', 'indexer/reader.ts', 'indexer/rpc.ts']) {
    report.sourceHashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
  }
  report.runtime = { node: process.version, anvil: execFileSync('anvil', ['--version'], { encoding: 'utf8' }).trim(), forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }).trim(), evm: 'osaka', chainId: '31337', isolation: 'owned ephemeral loopback Anvil; unlocked local accounts, no keys; exact transaction timestamps' };
  const reserve = createServer();
  await new Promise((done, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', done); });
  const port = reserve.address().port;
  await new Promise((done, reject) => reserve.close(error => error ? reject(error) : done()));
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  anvil.on('error', error => { anvilOutput += error.message; });
  for (const stream of [anvil.stdout, anvil.stderr]) stream.on('data', data => { anvilOutput += data; });
  const rpc = async (method, params = []) => {
    assert.equal(anvil.exitCode, null, `Owned Anvil exited: ${anvilOutput}`);
    const response = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    const result = await response.json();
    if (result.error) throw new Error(`${method}: ${JSON.stringify(result.error)}`);
    return result.result;
  };
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (anvil.exitCode !== null || anvil.pid === undefined) throw new Error(`Anvil startup failed: ${anvilOutput}`);
    try { ready = await rpc('eth_chainId') === '0x7a69'; } catch { /* bounded startup wait only */ }
    if (ready) break;
    await pause(50);
  }
  assert.ok(ready, 'Owned Anvil did not become ready');
  await pause(100);
  assert.equal(anvil.exitCode, null, `Anvil port collision: ${anvilOutput}`);
  const raw = await rpc('eth_accounts');
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, raw[i]]));
  const recipient2 = raw[9];
  report.recipient2 = recipient2;
  const { manifest, abis } = await deployGovernance(rpc, { root, accounts });
  report.manifest = manifest;
  report.receipts = [...manifest.receipts];
  const abi = Object.fromEntries(Object.entries(abis).map(([name, value]) => [name, new Interface(value)]));
  const address = Object.fromEntries(Object.entries(manifest.contracts).map(([name, value]) => [name, value.address]));
  const call = async (name, method, values = [], block = 'latest') => abi[name].decodeFunctionResult(method, await rpc('eth_call', [{ to: address[name], data: abi[name].encodeFunctionData(method, values) }, block]));
  const one = async (...params) => (await call(...params))[0];
  const block = async () => await rpc('eth_getBlockByNumber', ['latest', false]);
  const mineAt = async timestamp => { await rpc('evm_setNextBlockTimestamp', [Number(timestamp)]); await rpc('evm_mine'); };
  const tx = async (label, from, name, method, values = [], { at, error, errorArgs } = {}) => {
    if (at !== undefined) await rpc('evm_setNextBlockTimestamp', [Number(at)]);
    const hash = await rpc('eth_sendTransaction', [{ from, to: address[name], data: abi[name].encodeFunctionData(method, values), gas: toQuantity(8_000_000) }]);
    let receipt;
    for (let attempt = 0; attempt < 100; attempt++) { receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) break; await pause(50); }
    assert.ok(receipt, `${label}: missing receipt`);
    assert.equal(receipt.status, error ? '0x0' : '0x1', label);
    const mined = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
    if (at !== undefined) assert.equal(BigInt(mined.timestamp), BigInt(at), `${label}: transaction boundary drift`);
    const record = { ...receipt, label, timestamp: BigInt(mined.timestamp).toString() };
    if (error) {
      assert.deepEqual(receipt.logs, [], `${label}: reverted transaction committed logs`);
      const trace = await rpc('debug_traceTransaction', [hash, { disableStorage: true, disableStack: true, enableMemory: false }]);
      const data = trace.returnValue.startsWith('0x') ? trace.returnValue : `0x${trace.returnValue}`;
      let decoded;
      for (const parser of Object.values(abi)) { try { decoded = parser.parseError(data); } catch { /* other contract ABI */ } if (decoded) break; }
      assert.equal(decoded?.name, error, `${label}: wrong revert data ${data}`);
      if (errorArgs) assert.deepEqual(Array.from(decoded.args).map(x => String(x).toLowerCase()), errorArgs.map(x => String(x).toLowerCase()), `${label}: wrong revert arguments`);
      record.error = { name: decoded.name, args: Array.from(decoded.args).map(String), data };
    }
    report.receipts.push(record);
    return record;
  };
  const balances = async () => Object.fromEntries(await Promise.all(['Treasury', 'recipient', 'recipient2', 'funding'].map(async key => [key, String(await one('BUD', 'balanceOf', [key === 'recipient2' ? recipient2 : address[key] ?? accounts[key]]))])));
  report.initialRoles = await checkGovernanceRoles(rpc, manifest, { root });
  // QA02's exact 1000-BUD demo has its own F0 branch. Its receipts are retained
  // separately because evm_revert removes this branch before the attack campaign.
  const demoSnapshot = await rpc('evm_snapshot');
  const demoReceiptStart = report.receipts.length;
  const demoDescription = '{"version":1,"title":"Demo chi 1000 BUD","body":"Khoan chi mo phong cho nghiem thu QA02."}';
  const demoRequest = id('tv4:qa02-demo-1000');
  const demoArgs = [[address.Treasury], ['0'], [abi.Treasury.encodeFunctionData('disburse', [demoRequest, accounts.recipient, 1000n * U])], id(demoDescription)];
  const demoId = await one('Governor', 'hashProposal', demoArgs);
  await tx('QA02 demo propose 1000 BUD', accounts.A, 'Governor', 'propose', [...demoArgs.slice(0, 3), demoDescription]);
  const demoS = await one('Governor', 'proposalSnapshot', [demoId]);
  const demoD = await one('Governor', 'proposalDeadline', [demoId]);
  await tx('QA02 A votes For 400 GOV', accounts.A, 'Governor', 'castVote', [demoId, 1], { at: demoS + 1n });
  await tx('QA02 B votes For 300 GOV', accounts.B, 'Governor', 'castVote', [demoId, 1], { at: demoS + 1n });
  await tx('QA02 caller queues through Governor', accounts.caller, 'Governor', 'queue', demoArgs, { at: demoD + 1n });
  const demoEta = await one('Governor', 'proposalEta', [demoId]);
  assert.equal(demoEta, demoD + 121n);
  await tx('QA02 outsider executes 1000 BUD through Governor at ETA', accounts.outsider, 'Governor', 'execute', demoArgs, { at: demoEta });
  assert.equal(await one('Governor', 'state', [demoId]), 7n);
  assert.equal(await one('Treasury', 'paidRequests', [demoRequest]), true);
  const demoBalances = await balances();
  assert.deepEqual(demoBalances, { Treasury: String(9000n * U), recipient: String(1000n * U), recipient2: '0', funding: String(10000n * U) });
  const demoH = await block();
  report.demo1000 = {
    scope: 'Independent F0 snapshot branch, real mined receipts; reverted after verification, NOT canonical at the main campaign finalBlock.',
    proposalId: String(demoId), requestId: demoRequest, description: demoDescription, snapshot: String(demoS), deadline: String(demoD), eta: String(demoEta),
    receipts: report.receipts.splice(demoReceiptStart), finalBalances: demoBalances, finalBlock: { number: BigInt(demoH.number).toString(), hash: demoH.hash },
    roles: await checkGovernanceRoles(rpc, manifest, { root }),
  };
  assert.equal(await rpc('evm_revert', [demoSnapshot]), true);
  assert.equal(await one('BUD', 'balanceOf', [address.Treasury]), 10000n * U);
  // An auditor must reject a mismatched deployment, not bless any supplied addresses/config.
  const wrongManifest = structuredClone(manifest);
  wrongManifest.contracts.Treasury.address = accounts.outsider;
  await assert.rejects(() => checkGovernanceRoles(rpc, wrongManifest, { root }));
  report.assertions.push('role checker rejects a manifest pointing Treasury at an EOA');
  const before = await balances();
  const admin = ZeroHash;
  const spender = id('SPENDER_ROLE');
  for (const actor of [accounts.outsider, accounts.deployer]) {
    await tx('unprivileged direct Treasury payment denied', actor, 'Treasury', 'disburse', [id('direct'), accounts.recipient, U], { error: 'AccessControlUnauthorizedAccount', errorArgs: [actor, spender] });
    for (const role of [admin, spender]) await tx('cannot restore Treasury authority after renounce', actor, 'Treasury', 'grantRole', [role, actor], { error: 'AccessControlUnauthorizedAccount', errorArgs: [actor, admin] });
    for (const role of [admin, id('PROPOSER_ROLE'), id('EXECUTOR_ROLE'), id('CANCELLER_ROLE')]) await tx('cannot restore Timelock authority after renounce', actor, 'Timelock', 'grantRole', [role, actor], { error: 'AccessControlUnauthorizedAccount', errorArgs: [actor, admin] });
    await tx('cannot open executor role', actor, 'Timelock', 'grantRole', [id('EXECUTOR_ROLE'), ZeroAddress], { error: 'AccessControlUnauthorizedAccount' });
    await tx('cannot bypass Timelock delay setter', actor, 'Timelock', 'updateDelay', [0], { error: 'TimelockUnauthorizedCaller', errorArgs: [actor] });
  }
  assert.deepEqual(await balances(), before);
  const description = label => JSON.stringify({ version: 1, title: `Chi ngan sach ${label}`, body: 'Khoan chi mo phong cho nghiem thu TV4.' });
  const payload = (request, recipient, amount) => abi.Treasury.encodeFunctionData('disburse', [request, recipient, amount]);
  const sharedRequest = id('tv4:shared-request');
  const definitions = [
    ['payment', sharedRequest, accounts.recipient, 7_000n * U],
    ['duplicate', sharedRequest, recipient2, 2_000n * U],
    ['retry', id('tv4:retry'), recipient2, 6_000n * U],
    ['cancel', id('tv4:cancel'), accounts.recipient, U],
    ['low-quorum', id('tv4:low-quorum'), accounts.recipient, U],
    ['tie', id('tv4:tie'), accounts.recipient, U],
    ['abstain-quorum', id('tv4:abstain-quorum'), accounts.recipient, U],
    ['abstain-only', id('tv4:abstain-only'), accounts.recipient, U],
  ];
  const valid = payload(sharedRequest, accounts.recipient, U);
  const invalid = [
    ['InvalidActionCount', [], [], []],
    ['InvalidActionCount', [address.Treasury, address.Treasury], [0, 0], [valid, valid]],
    ['InvalidTarget', [address.BUD], [0], [valid]],
    ['InvalidNativeValue', [address.Treasury], [1], [valid]],
    ['InvalidCalldata', [address.Treasury], [0], [abi.Treasury.encodeFunctionData('grantRole', [spender, accounts.outsider])]],
    ['InvalidCalldata', [address.Treasury], [0], [valid.slice(0, -2)]],
    ['InvalidCalldata', [address.Treasury], [0], [`${valid}00`]],
    ['InvalidRecipient', [address.Treasury], [0], [payload(sharedRequest, ZeroAddress, U)]],
    ['InvalidRecipient', [address.Treasury], [0], [payload(sharedRequest, address.Treasury, U)]],
    ['InvalidAmount', [address.Treasury], [0], [payload(sharedRequest, accounts.recipient, 0n)]],
  ];
  for (const [error, targets, values, calldatas] of invalid) await tx(`on-chain payload restriction ${error}`, accounts.A, 'Governor', 'propose', [targets, values, calldatas, description(error)], { error });
  await tx('zero past votes cannot propose', accounts.caller, 'Governor', 'propose', [[address.Treasury], [0], [valid], description('threshold')], { error: 'GovernorInsufficientProposerVotes', errorArgs: [accounts.caller, 0, 50n * U] });
  const t0 = BigInt((await block()).timestamp) + 2n;
  for (const [label, requestId, recipient, amount] of definitions) {
    const p = { label, requestId, recipient, amount: String(amount), description: description(label), targets: [address.Treasury], values: ['0'], calldatas: [payload(requestId, recipient, amount)] };
    p.descriptionHash = id(p.description);
    p.id = String(await one('Governor', 'hashProposal', [p.targets, p.values, p.calldatas, p.descriptionHash]));
    const receipt = await tx(`propose ${label}`, accounts.A, 'Governor', 'propose', [p.targets, p.values, p.calldatas, p.description], { at: t0 });
    const event = receipt.logs.filter(log => log.address.toLowerCase() === address.Governor.toLowerCase()).map(log => abi.Governor.parseLog(log)).find(event => event?.name === 'ProposalCreated');
    assert.equal(String(event.args.proposalId), p.id);
    assert.equal(event.args.description, p.description);
    p.snapshot = String(await one('Governor', 'proposalSnapshot', [p.id]));
    p.deadline = String(await one('Governor', 'proposalDeadline', [p.id]));
    assert.equal(BigInt(p.snapshot), t0 + 60n);
    assert.equal(BigInt(p.deadline), t0 + 360n);
    report.proposals.push(p);
  }
  const [payment, duplicate, retry, canceled, low, tie, abstain, onlyAbstain] = report.proposals;
  const cancel = p => [p.targets, p.values, p.calldatas, p.descriptionHash];
  const S = BigInt(payment.snapshot), D = BigInt(payment.deadline);
  const state = async (p, expected) => assert.equal(await one('Governor', 'state', [p.id]), BigInt(expected), `${p.label}: state`);
  await tx('outsider cannot cancel proposer pending', accounts.outsider, 'Governor', 'cancel', cancel(canceled), { at: S, error: 'GovernorUnableToCancel' });
  await tx('creator cancels at exact snapshot while Pending', accounts.A, 'Governor', 'cancel', cancel(canceled), { at: S });
  await state(canceled, 2);
  await tx('vote at exact snapshot rejected', accounts.A, 'Governor', 'castVote', [payment.id, 1], { at: S, error: 'GovernorUnexpectedProposalState' });
  await state(payment, 0);
  for (const p of [payment, duplicate, retry, tie]) await tx(`snapshot A For ${p.label}`, accounts.A, 'Governor', 'castVote', [p.id, 1], { at: S + 1n });
  await tx('A transfers entire GOV after snapshot', accounts.A, 'GOV', 'transfer', [accounts.caller, 400n * U], { at: S + 1n });
  await tx('receiver delegates after snapshot', accounts.caller, 'GOV', 'delegate', [accounts.caller], { at: S + 1n });
  await tx('B changes delegate after snapshot', accounts.B, 'GOV', 'delegate', [accounts.caller], { at: S + 1n });
  assert.equal(await one('GOV', 'getVotes', [accounts.caller]), 700n * U);
  for (const [who, weight] of [['A', 400n], ['B', 300n], ['caller', 0n]]) assert.equal(await one('GOV', 'getPastVotes', [accounts[who], S]), weight * U);
  await tx('post-snapshot receiver cannot double count A or B', accounts.caller, 'Governor', 'castVote', [payment.id, 1], { at: S + 1n });
  await tx('B retains snapshot weight despite new delegate', accounts.B, 'Governor', 'castVote', [payment.id, 1], { at: S + 1n });
  await tx('A cannot vote twice', accounts.A, 'Governor', 'castVote', [payment.id, 0], { at: S + 1n, error: 'GovernorAlreadyCastVote' });
  await tx('creator cannot cancel Active', accounts.A, 'Governor', 'cancel', cancel(payment), { at: S + 1n, error: 'GovernorUnableToCancel' });
  for (const [p, actor, support] of [[low, 'D', 1], [tie, 'B', 0], [tie, 'D', 0], [abstain, 'D', 1], [abstain, 'C', 2], [onlyAbstain, 'C', 2]]) await tx(`quorum/tally ${p.label} ${actor}`, accounts[actor], 'Governor', 'castVote', [p.id, support], { at: S + 1n });
  await tx('first vote at exact deadline is valid', accounts.D, 'Governor', 'castVote', [payment.id, 1], { at: D });
  await tx('queue at exact deadline still Active', accounts.caller, 'Governor', 'queue', cancel(payment), { at: D, error: 'GovernorUnexpectedProposalState' });
  await mineAt(D + 1n);
  for (const p of [payment, duplicate, retry, abstain]) await state(p, 4);
  for (const p of [low, tie, onlyAbstain]) {
    await state(p, 3);
    await tx(`defeated cannot queue: ${p.label}`, accounts.caller, 'Governor', 'queue', cancel(p), { at: D + 1n, error: 'GovernorUnexpectedProposalState' });
  }
  assert.deepEqual(Array.from(await call('Governor', 'proposalVotes', [payment.id])), [0n, 800n * U, 0n]);
  await tx('creator cannot cancel Succeeded', accounts.A, 'Governor', 'cancel', cancel(payment), { at: D + 1n, error: 'GovernorUnableToCancel' });
  await tx('late vote cannot alter result', accounts.C, 'Governor', 'castVote', [payment.id, 1], { at: D + 1n, error: 'GovernorUnexpectedProposalState' });
  const changed = [...cancel(payment)]; changed[3] = id(`${payment.description} `);
  await tx('different description hash cannot queue original proposal', accounts.caller, 'Governor', 'queue', changed, { at: D + 1n, error: 'GovernorNonexistentProposal' });
  const q = D + 1n;
  for (const p of [payment, duplicate, retry, abstain]) {
    const receipt = await tx(`permissionless caller queues ${p.label} through Governor`, accounts.caller, 'Governor', 'queue', cancel(p), { at: q });
    // bytes20(address) -> bytes32 is RIGHT padded in OZ5.4, not a left-padded integer address.
    p.salt = toBeHex(BigInt(`${address.Governor}${'00'.repeat(12)}`) ^ BigInt(p.descriptionHash), 32);
    p.operationId = keccak256(AbiCoder.defaultAbiCoder().encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'], [p.targets, p.values, p.calldatas, ZeroHash, p.salt]));
    assert.equal(await one('Timelock', 'hashOperationBatch', [p.targets, p.values, p.calldatas, ZeroHash, p.salt]), p.operationId);
    p.eta = String(await one('Governor', 'proposalEta', [p.id]));
    assert.equal(BigInt(p.eta), q + 120n);
    assert.equal(await one('Timelock', 'getTimestamp', [p.operationId]), BigInt(p.eta));
    const scheduled = receipt.logs.filter(log => log.address.toLowerCase() === address.Timelock.toLowerCase()).map(log => abi.Timelock.parseLog(log)).find(event => event?.name === 'CallScheduled');
    assert.equal(scheduled.args.id, p.operationId);
    assert.equal(scheduled.args.target.toLowerCase(), address.Treasury.toLowerCase());
    assert.equal(scheduled.args.data, p.calldatas[0]);
  }
  const E = BigInt(payment.eta);
  await tx('Governor execution before exact ETA rejected', accounts.caller, 'Governor', 'execute', cancel(payment), { at: E - 1n, error: 'TimelockUnexpectedOperationState' });
  await state(payment, 5);
  assert.equal(await one('Timelock', 'isOperationReady', [payment.operationId]), false);
  assert.deepEqual(await balances(), before);
  await mineAt(E);
  assert.equal(await one('Timelock', 'isOperationReady', [payment.operationId]), true);
  for (const actor of [accounts.outsider, accounts.deployer]) {
    for (const delay of [0, 120]) {
      await tx('direct schedule denied regardless of requested delay', actor, 'Timelock', 'schedule', [address.Treasury, 0, payment.calldatas[0], ZeroHash, payment.salt, delay], { at: E, error: 'AccessControlUnauthorizedAccount' });
      await tx('direct scheduleBatch denied', actor, 'Timelock', 'scheduleBatch', [payment.targets, payment.values, payment.calldatas, ZeroHash, payment.salt, delay], { at: E, error: 'AccessControlUnauthorizedAccount' });
    }
    await tx('direct execute of Ready operation denied', actor, 'Timelock', 'execute', [address.Treasury, 0, payment.calldatas[0], ZeroHash, payment.salt], { at: E, error: 'AccessControlUnauthorizedAccount' });
    await tx('direct executeBatch of Ready operation denied', actor, 'Timelock', 'executeBatch', [payment.targets, payment.values, payment.calldatas, ZeroHash, payment.salt], { at: E, error: 'AccessControlUnauthorizedAccount' });
  }
  const first = await tx('valid execution exactly at ETA through Governor', accounts.caller, 'Governor', 'execute', cancel(payment), { at: E });
  await state(payment, 7);
  assert.equal(await one('Timelock', 'isOperationDone', [payment.operationId]), true);
  assert.equal(await one('Treasury', 'paidRequests', [sharedRequest]), true);
  const events = first.logs.map(log => { for (const [name, target] of Object.entries(address)) if (target.toLowerCase() === log.address.toLowerCase()) return abi[name].parseLog(log)?.name; });
  assert.deepEqual(events, ['Transfer', 'BudgetDisbursed', 'CallExecuted', 'ProposalExecuted']);
  await tx('same Governor operation cannot execute again', accounts.caller, 'Governor', 'execute', cancel(payment), { at: E, error: 'GovernorUnexpectedProposalState' });
  await tx('different proposal/operation sharing request cannot pay twice', accounts.caller, 'Governor', 'execute', cancel(duplicate), { at: E, error: 'RequestAlreadyPaid', errorArgs: [sharedRequest] });
  const afterFirst = await balances();
  assert.equal(afterFirst.Treasury, String(3_000n * U));
  await tx('competing valid proposal reverts atomically on budget shortage', accounts.caller, 'Governor', 'execute', cancel(retry), { at: E, error: 'InsufficientBudget', errorArgs: [3_000n * U, 6_000n * U] });
  assert.deepEqual(await balances(), afterFirst);
  await state(retry, 5);
  assert.equal(await one('Treasury', 'paidRequests', [retry.requestId]), false);
  assert.equal(await one('Timelock', 'getTimestamp', [retry.operationId]), E);
  assert.equal(await one('Timelock', 'isOperationReady', [retry.operationId]), true);
  assert.equal(await one('Timelock', 'isOperationDone', [retry.operationId]), false);
  await tx('funding wallet tops up 3000 BUD', accounts.funding, 'BUD', 'transfer', [address.Treasury, 3_000n * U], { at: E });
  await tx('retry same proposal/request/operation after topup succeeds', accounts.outsider, 'Governor', 'execute', cancel(retry), { at: E });
  await state(retry, 7);
  await state(duplicate, 5);
  assert.equal(await one('Timelock', 'isOperationDone', [retry.operationId]), true);
  assert.equal(await one('Timelock', 'isOperationDone', [duplicate.operationId]), false);
  report.finalRoles = await checkGovernanceRoles(rpc, manifest, { root });
  const H = await block();
  const Htag = H.number;
  const logs = await rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: Htag, address: Object.values(address) }]);
  let totalIn = 0n, totalOut = 0n, payoutTotal = 0n;
  const paidIds = new Set();
  const decodedCounts = {};
  const roleMap = { BUD: ['budget_token', 'oz-5.4.0-erc20'], Treasury: ['treasury', 'sc01-itreasury-v1'], Timelock: ['timelock', 'oz-5.4.0-timelock'], Governor: ['governor', 'oz-5.4.0-governor'] };
  report.decodedLogs = [];
  for (const log of logs) {
    const name = Object.keys(address).find(key => address[key].toLowerCase() === log.address.toLowerCase());
    const event = abi[name].parseLog(log);
    if (name === 'BUD' && event?.name === 'Transfer') {
      if (event.args.to.toLowerCase() === address.Treasury.toLowerCase()) totalIn += event.args.value;
      if (event.args.from.toLowerCase() === address.Treasury.toLowerCase()) totalOut += event.args.value;
    }
    if (event?.name === 'BudgetDisbursed') {
      assert.ok(!paidIds.has(event.args.requestId)); paidIds.add(event.args.requestId); payoutTotal += event.args.amount;
    }
    // BE02 currently supports these four roles; GOV raw receipts remain in evidence.
    if (!roleMap[name] || !['Transfer', 'BudgetDisbursed', 'ProposalCreated', 'VoteCast', 'ProposalQueued', 'ProposalExecuted', 'ProposalCanceled', 'CallScheduled', 'CallExecuted', 'CallSalt'].includes(event?.name)) continue;
    const [role, abiVersion] = roleMap[name];
    const contract = { role, address: log.address, deploymentBlock: BigInt(manifest.contracts[name].deploymentBlock), abiVersion };
    const decoded = decodeLog({ contract, blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash, transactionHash: log.transactionHash, transactionIndex: BigInt(log.transactionIndex), logIndex: BigInt(log.logIndex), topics: log.topics, data: log.data, rawLog: log });
    assert.equal(decoded.status, 'decoded', `BE02 failed live ${name}.${event.name}: ${JSON.stringify(decoded)}`);
    assert.equal(decoded.eventName, event.name);
    decodedCounts[event.name] = (decodedCounts[event.name] ?? 0) + 1;
    report.decodedLogs.push({ transactionHash: log.transactionHash, logIndex: log.logIndex, contract: name, ...decoded });
  }
  const contracts = Object.entries(roleMap).map(([name, [role, abiVersion]]) => ({
    role, abiVersion, address: address[name].toLowerCase(), deploymentBlock: BigInt(manifest.contracts[name].deploymentBlock),
  }));
  const fromBlock = contracts.reduce((min, item) => item.deploymentBlock < min ? item.deploymentBlock : min, BigInt(H.number));
  const config = { rpcUrl: `http://127.0.0.1:${port}`, chainId: 31337n, deploymentId: 'tv4-live-governance', fromBlock, toBlock: BigInt(H.number), batchSize: 200n, contracts };
  const { batch, discardedOutsideDeployment } = await readBatch(config, new HttpRpc(config.rpcUrl), fromBlock, config.toBlock);
  assert.equal(discardedOutsideDeployment, 0);
  assert.equal(batch.blocks.length, Number(config.toBlock - fromBlock + 1n));
  assert.equal(batch.blocks.at(-1).hash, H.hash);
  assert.equal(batch.logs.filter(item => item.decode.status === 'decode_error').length, 0);
  const expectedDecoded = new Map(report.decodedLogs.map(item => [`${item.transactionHash}:${BigInt(item.logIndex)}`, item]));
  for (const { log, decode } of batch.logs.filter(item => item.decode.status === 'decoded')) {
    const expected = expectedDecoded.get(`${log.transactionHash}:${log.logIndex}`);
    assert.ok(expected, 'BE02 reader returned an unexpected decoded event');
    assert.deepEqual(decode.payload, expected.payload);
    assert.equal(decode.eventName, expected.eventName);
    expectedDecoded.delete(`${log.transactionHash}:${log.logIndex}`);
  }
  assert.equal(expectedDecoded.size, 0, 'BE02 reader lost canonical decoded receipt events');
  report.reader = {
    fromBlock: String(fromBlock), toBlock: String(config.toBlock), blockHash: H.hash,
    headers: batch.blocks.length, rawLogs: batch.logs.length,
    decoded: batch.logs.filter(item => item.decode.status === 'decoded').length,
    unknownTopics: batch.logs.filter(item => item.decode.status === 'unknown_topic').length,
    decodeErrors: 0, discardedOutsideDeployment,
    scope: 'Actual BE02 HttpRpc/readBatch over owned Anvil, all contiguous headers including empty/reverted blocks and all four supported roles. Unknown initialization/access-control topics retained raw. No database/checkpoint/reorg/projection/API acceptance.',
  };
  assert.equal(totalIn, 13_000n * U); assert.equal(totalOut, 13_000n * U); assert.equal(payoutTotal, totalOut); assert.equal(paidIds.size, 2);
  const finalBalances = await balances();
  assert.deepEqual(finalBalances, { Treasury: '0', recipient: String(7_000n * U), recipient2: String(6_000n * U), funding: String(7_000n * U) });
  assert.equal(await one('BUD', 'totalSupply', [], Htag), 20_000n * U);
  for (const p of report.proposals) {
    p.finalState = String(await one('Governor', 'state', [p.id], Htag));
    p.finalVotes = Array.from(await call('Governor', 'proposalVotes', [p.id], Htag)).map(String);
    p.paid = await one('Treasury', 'paidRequests', [p.requestId], Htag);
  }
  report.assertions.push('final roles audited from complete grant/revoke history at fixed H and unchanged after calls', 'deployer and outsider cannot regain roles, directly spend/schedule/execute or change delay', 'canonical single Treasury action whitelist enforced on-chain', 'Pending/Active/deadline/ETA boundaries verified with exact mined transaction timestamps', 'snapshot weights survive token transfer/delegate changes and cannot be double counted', 'low quorum, tie and abstain-only defeated; For+Abstain contributes quorum', 'creator-only Pending cancellation, late cancellation denied', 'operationId uses actual OZ5.4 right-padded Governor address XOR descriptionHash salt', 'permissionless EOA queue/execute through Governor with exact real event ordering', 'early execution, operation replay and distinct proposals sharing request are denied', 'oversubscribed execution leaves Queued/Ready/unpaid and original ETA; same-operation retry succeeds', 'same-H Transfer ledger equals actual balances and successful BudgetDisbursed totals without double counting', 'BE02 decodes actual mined governance/token/timelock/treasury receipts');
  report.ledger = { totalIn: String(totalIn), totalOut: String(totalOut), payoutTotal: String(payoutTotal), paidRequestIds: [...paidIds], finalBalances };
  report.be02 = { decodedCounts, scope: `real RPC reader and receipt decoding for Governor/Timelock/Treasury/BUD; GOV receipts remain raw only.${databaseMode ? ' Actual PostgreSQL raw persistence/replay evidence is in storage; no production projection/API/checkpoint/reorg acceptance.' : ' No database/projection/API/checkpoint/reorg acceptance'}` };
  report.finalBlock = { number: BigInt(H.number).toString(), hash: H.hash, timestamp: BigInt(H.timestamp).toString() };
  if (databaseMode) {
    report.storage = await storageHelper.governanceStorageSmoke({
      root, urls: storageUrls, manifest, abis, config, batch, head: H, chainLedger: report.ledger,
      readBalance: account => one('BUD', 'balanceOf', [account], Htag),
      readSupply: () => one('BUD', 'totalSupply', [], Htag),
    });
  }
  report.result = 'passed';
} finally {
  if (anvil && anvil.exitCode === null) {
    const exited = new Promise(done => anvil.once('exit', done));
    anvil.kill('SIGTERM');
    const timer = setTimeout(() => anvil.kill('SIGKILL'), 5_000);
    await exited; clearTimeout(timer);
  }
}
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: real local Governor -> Timelock -> Treasury, final roles, attacks/retry, live BE02 decoding. Evidence: ${output}`);
