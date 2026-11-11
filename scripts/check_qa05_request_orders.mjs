#!/usr/bin/env node
// TC10: each request kind/order receives its own empty-chain deployment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, ZeroHash, id, toQuantity } from 'ethers';
import { deployGovernance, checkGovernanceRoles } from './governance_local.mjs';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';

assert.equal(process.argv.length, 4, 'Usage: node scripts/check_qa05_request_orders.mjs --output <new-report.json>');
assert.equal(process.argv[2], '--output');
const output = resolve(process.argv[3]);
try { await stat(output); throw new Error('Output already exists; never overwrite evidence'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const root = fileURLToPath(new URL('../', import.meta.url));
const life = createSmokeLifecycle();
const U = 10n ** 18n;
const pause = ms => new Promise(done => setTimeout(done, ms));
const report = {
  scope: 'TC10 real Anvil receipts, independent empty-chain resets for hashed/zero requestId and both execution orders. Not API/UI, PostgreSQL, extension wallet, testnet or full QA05 acceptance.',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: {}, node: process.version, cases: [],
};
try {
  for (const path of ['scripts/check_qa05_request_orders.mjs', 'scripts/governance_local.mjs', 'scripts/governance_operations.mjs', 'scripts/smoke_lifecycle.mjs', 'contracts/BudgetGovernor.sol', 'contracts/Treasury.sol']) {
    const bytes = await readFile(resolve(root, path));
    // Bind executed files to committed source, never describe a dirty overlay as the SHA.
    assert.deepEqual(bytes, execFileSync('git', ['show', `${report.sourceCommit}:${path}`], { cwd: root }));
    report.sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
  }
  const reserve = createServer();
  await new Promise((done, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', done); });
  const port = reserve.address().port;
  await new Promise((done, reject) => reserve.close(error => error ? reject(error) : done()));
  const anvil = life.spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = '';
  anvil.on('error', error => { diagnostic += error.message; });
  for (const stream of [anvil.stdout, anvil.stderr]) stream.on('data', data => { diagnostic += data; });
  let rpcId = 0;
  const rpc = async (method, params = []) => {
    life.throwIfInterrupted();
    assert.equal(anvil.exitCode, null, diagnostic);
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: AbortSignal.any([life.signal, AbortSignal.timeout(10_000)]),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    if (result.error) throw new Error(`${method}: ${JSON.stringify(result.error)}`);
    return result.result;
  };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(anvil.exitCode, null, diagnostic);
    try { ready = await rpc('eth_chainId') === '0x7a69'; } catch { /* bounded startup only */ }
    if (ready) break;
    await pause(50);
  }
  assert.ok(ready, 'Owned Anvil did not start');
  const raw = await rpc('eth_accounts');
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, raw[i]]));
  for (const requestKind of ['hashed', 'zero']) for (const winner of [0, 1]) {
    const reset = await rpc('evm_snapshot');
    assert.equal(await rpc('eth_blockNumber'), '0x0', 'Each variant starts on empty chain');
    const { manifest, abis } = await deployGovernance(rpc, { root, accounts });
    const abi = Object.fromEntries(Object.entries(abis).map(([key, value]) => [key, new Interface(value)]));
    const address = Object.fromEntries(Object.entries(manifest.contracts).map(([key, value]) => [key, value.address]));
    const call = async (name, method, values = []) => abi[name].decodeFunctionResult(method, await rpc('eth_call', [{ to: address[name], data: abi[name].encodeFunctionData(method, values) }, 'latest']));
    const one = async (...args) => (await call(...args))[0];
    const row = { requestKind, winner: winner + 1, manifest, receipts: [], reset: 'empty block 0, fresh deployment/seed/final-role audit; evm_revert only after H/hash evidence retained' };
    row.roles = await checkGovernanceRoles(rpc, manifest, { root });
    const tx = async (label, from, method, values, at, expectedError) => {
      if (at !== undefined) await rpc('evm_setNextBlockTimestamp', [Number(at)]);
      const hash = await rpc('eth_sendTransaction', [{ from, to: address.Governor, data: abi.Governor.encodeFunctionData(method, values), gas: toQuantity(8_000_000) }]);
      let receipt;
      for (let i = 0; i < 100; i++) { receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) break; await pause(50); }
      assert.ok(receipt, `${label}: missing mined receipt`);
      assert.equal(receipt.status, expectedError ? '0x0' : '0x1', label);
      const block = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
      if (at !== undefined) assert.equal(BigInt(block.timestamp), at, `${label}: exact boundary`);
      const record = { ...receipt, label, timestamp: BigInt(block.timestamp).toString() };
      if (expectedError) {
        assert.deepEqual(receipt.logs, []);
        const trace = await rpc('debug_traceTransaction', [hash, { disableStorage: true, disableStack: true, enableMemory: false }]);
        const data = trace.returnValue.startsWith('0x') ? trace.returnValue : `0x${trace.returnValue}`;
        const error = abi.Treasury.parseError(data);
        assert.equal(error?.name, expectedError);
        assert.deepEqual(Array.from(error.args), [row.requestId]);
        record.error = { name: error.name, requestId: error.args[0], data };
      }
      row.receipts.push(record);
      return record;
    };
    row.requestId = requestKind === 'zero' ? ZeroHash : id('tv4:TC10');
    const amounts = [1_000n * U, 2_000n * U];
    const recipients = [accounts.recipient, raw[9]];
    const proposals = [];
    for (let i = 0; i < 2; i++) {
      const description = JSON.stringify({ version: 1, title: `TC10 independent P${i + 1}`, body: 'Distinct proposal, shared request, no budget reservation.' });
      const action = [[address.Treasury], [0], [abi.Treasury.encodeFunctionData('disburse', [row.requestId, recipients[i], amounts[i]])], id(description)];
      const proposalId = await one('Governor', 'hashProposal', action);
      await tx(`P${i + 1} propose`, accounts.A, 'propose', [...action.slice(0, 3), description]);
      proposals.push({ id: proposalId, action, description, snapshot: await one('Governor', 'proposalSnapshot', [proposalId]), deadline: await one('Governor', 'proposalDeadline', [proposalId]) });
    }
    assert.notEqual(proposals[0].id, proposals[1].id);
    const active = proposals.reduce((max, p) => p.snapshot > max ? p.snapshot : max, 0n) + 1n;
    for (const p of proposals) {
      await tx('A For400', accounts.A, 'castVote', [p.id, 1], active);
      await tx('B For300', accounts.B, 'castVote', [p.id, 1], active);
      assert.deepEqual(Array.from(await call('Governor', 'proposalVotes', [p.id])), [0n, 700n * U, 0n]);
    }
    const queueAt = proposals.reduce((max, p) => p.deadline > max ? p.deadline : max, 0n) + 1n;
    for (const p of proposals) {
      await tx('Unprivileged caller queues via Governor', accounts.caller, 'queue', p.action, queueAt);
      p.eta = await one('Governor', 'proposalEta', [p.id]);
      assert.equal(p.eta, queueAt + 120n);
      const salt = '0x' + (BigInt(address.Governor + '0'.repeat(24)) ^ BigInt(p.action[3])).toString(16).padStart(64, '0');
      p.operationId = await one('Timelock', 'hashOperationBatch', [...p.action.slice(0, 3), ZeroHash, salt]);
    }
    assert.notEqual(proposals[0].operationId, proposals[1].operationId);
    const balances = async () => Promise.all([address.Treasury, ...recipients, accounts.funding].map(recipient => one('BUD', 'balanceOf', [recipient])));
    assert.deepEqual(await balances(), [10_000n * U, 0n, 0n, 10_000n * U]);
    assert.equal(await one('Treasury', 'paidRequests', [row.requestId]), false);
    const first = proposals[winner], loser = proposals[1 - winner];
    const paid = await tx('Winner executes at exact ETA via Governor', accounts.outsider, 'execute', first.action, first.eta);
    assert.equal(await one('Governor', 'state', [first.id]), 7n);
    assert.equal(await one('Timelock', 'isOperationDone', [first.operationId]), true);
    assert.equal(await one('Treasury', 'paidRequests', [row.requestId]), true);
    const expected = [10_000n * U - amounts[winner], winner === 0 ? amounts[0] : 0n, winner === 1 ? amounts[1] : 0n, 10_000n * U];
    assert.deepEqual(await balances(), expected);
    assert.ok(expected[0] >= amounts[1 - winner], 'Loser has sufficient budget: reject for duplicate request, not funds');
    const transfers = paid.logs.filter(log => log.address.toLowerCase() === address.BUD.toLowerCase()).map(log => abi.BUD.parseLog(log)).filter(log => log?.name === 'Transfer');
    const disbursements = paid.logs.filter(log => log.address.toLowerCase() === address.Treasury.toLowerCase()).map(log => abi.Treasury.parseLog(log)).filter(log => log?.name === 'BudgetDisbursed');
    assert.equal(transfers.length, 1);
    assert.deepEqual(Array.from(transfers[0].args).map(String).map(x => x.toLowerCase()), [address.Treasury, recipients[winner], String(amounts[winner])].map(x => x.toLowerCase()));
    assert.equal(disbursements.length, 1);
    assert.deepEqual(Array.from(disbursements[0].args).map(String).map(x => x.toLowerCase()), [row.requestId, recipients[winner], String(amounts[winner])].map(x => x.toLowerCase()));
    await tx('Loser duplicate request rejected despite sufficient funds', accounts.caller, 'execute', loser.action, first.eta + 1n, 'RequestAlreadyPaid');
    assert.deepEqual(await balances(), expected, 'Rejected execution changes no BUD balances');
    assert.equal(await one('Governor', 'state', [loser.id]), 5n);
    assert.equal(await one('Timelock', 'getTimestamp', [loser.operationId]), loser.eta);
    assert.equal(await one('Timelock', 'isOperationReady', [loser.operationId]), true);
    assert.equal(await one('Timelock', 'isOperationDone', [loser.operationId]), false);
    assert.equal(await one('Governor', 'state', [first.id]), 7n);
    assert.equal(await one('Treasury', 'paidRequests', [row.requestId]), true);
    const head = await rpc('eth_getBlockByNumber', ['latest', false]);
    row.proposals = proposals;
    row.head = { number: BigInt(head.number).toString(), hash: head.hash, timestamp: BigInt(head.timestamp).toString() };
    row.expectedBalances = expected;
    row.actualBalances = await balances();
    row.result = 'PASS';
    row.apiUi = 'NOT RUN: no published API snapshot/revision or UI claimed for this chain branch';
    report.cases.push(row);
    assert.equal(await rpc('evm_revert', [reset]), true);
    assert.equal(await rpc('eth_blockNumber'), '0x0');
  }
  await life.complete(output, JSON.parse(JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value)), 'TC10 four independent request/order receipt variants PASS');
} catch (error) {
  console.error(error);
  process.exitCode = life.signal.aborted ? process.exitCode || 1 : 1;
} finally {
  try { await life.cleanup(); } finally { life.dispose(); }
}
