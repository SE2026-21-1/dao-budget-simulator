import assert from 'node:assert/strict';
import test from 'node:test';
import { Interface, keccak256 } from 'ethers';
import treasuryAbi from '../../shared/abi/Treasury.json' with { type: 'json' };
import budgetAbi from '../../shared/abi/BudgetToken.json' with { type: 'json' };
import { readPinnedScenario, SnapshotReadError } from '../../simulator/snapshot.js';
import type { PinnedScenarioRequest, SnapshotReadRpc } from '../../simulator/snapshot.js';
import { simulateBudget } from '../../simulator/engine.js';
import { LIMITS } from '../../simulator/validation.js';
import { id, proposal, treasury } from './helpers.js';

// Synthetic protocol fixtures: not real headers, deployed code, RPC receipts or chain evidence.
const T = new Interface(treasuryAbi), B = new Interface(budgetAbi);
const token = '0x4444444444444444444444444444444444444444';
const blockHash = '0x' + 'ab'.repeat(32), otherHash = '0x' + 'cd'.repeat(32);
const code = '0x60006000';
function fixture() {
  const request: PinnedScenarioRequest = { snapshot: { chainId: 31337n, blockNumber: 10n, blockHash },
    contracts: { treasuryAddress: treasury, budgetTokenAddress: token,
      treasuryCodeHash: keccak256(code), budgetTokenCodeHash: keccak256(code) },
    proposals: [proposal('p1', 10n), proposal('p2', 20n, id(2n))],
    steps: [{ kind: 'execute', proposalId: 'p1' }, { kind: 'execute', proposalId: 'p2' }] };
  const calls: { method: string; params: readonly unknown[] }[] = [];
  const paid = new Set([id(1n)]);
  const rpc: SnapshotReadRpc = async (method, params) => {
    calls.push({ method, params: structuredClone(params) });
    if (method === 'eth_chainId') { assert.deepEqual(params, []); return '0x7a69'; }
    if (method === 'eth_getBlockByNumber') { assert.deepEqual(params, ['0xa', false]); return { number: '0xa', hash: blockHash }; }
    assert.deepEqual(params[1], { blockHash, requireCanonical: true });
    if (method === 'eth_getCode') { assert.ok([treasury, token].includes(params[0] as string)); return code; }
    assert.equal(method, 'eth_call');
    const tx = params[0] as { to: string; data: string };
    assert.deepEqual(Object.keys(tx).sort(), ['data', 'to']);
    const iface = tx.to === treasury ? T : B;
    const parsed = iface.parseTransaction({ data: tx.data })!;
    if (parsed.name === 'budgetToken') return T.encodeFunctionResult('budgetToken', [token]);
    if (parsed.name === 'decimals') return B.encodeFunctionResult('decimals', [18n]);
    if (parsed.name === 'balanceOf') { assert.equal(parsed.args[0].toLowerCase(), treasury); return B.encodeFunctionResult('balanceOf', [100n]); }
    assert.equal(parsed.name, 'paidRequests');
    return T.encodeFunctionResult('paidRequests', [paid.has(parsed.args[0])]);
  };
  return { request, rpc, calls, paid };
}
function methodName(params: readonly unknown[]): string {
  const tx = params[0] as { to: string; data: string };
  return (tx.to === treasury ? T : B).parseTransaction({ data: tx.data })!.name;
}
const errorCode = (code: string) => (error: unknown) => error instanceof SnapshotReadError && error.code === code;

test('pinned reader seeds relevant paid flags and balance while retaining hypothetical assumptions', async () => {
  const f = fixture(); const plan = await readPinnedScenario(f.rpc, f.request);
  assert.equal(plan.kind, 'hypothetical-budget-input-from-pinned-chain-v1');
  assert.equal(plan.source.snapshot.blockHash, blockHash);
  assert.equal(plan.source.paidRequestScope, 'supplied-proposals-only');
  assert.deepEqual(plan.source.queriedRequestIds, [id(1n), id(2n)]);
  assert.equal(plan.scenario.initialBalance, 100n);
  assert.deepEqual(plan.scenario.initialPaidRequestIds, [id(1n)]);
  const result = simulateBudget(plan.scenario);
  assert.deepEqual(result.trace.map(t => t.outcome), ['request-already-paid', 'executed']);
  assert.equal(result.finalBalance, 80n);
  assert.deepEqual(plan.source.contracts, f.request.contracts);
  assert.deepEqual([...new Set(f.calls.map(c => c.method))].sort(), ['eth_call', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode'].sort());
});
test('shared/case-normalized IDs and zero ID are read once each, not inferred from transfer history', async () => {
  const f = fixture();
  f.paid.clear(); f.paid.add(id(0n));
  const request = { ...f.request, proposals: [proposal('p1', 1n, id(0n)), proposal('p2', 1n, id(0n)),
    proposal('p3', 1n, '0x' + 'AB'.repeat(32))] };
  const plan = await readPinnedScenario(f.rpc, request);
  assert.deepEqual(plan.source.queriedRequestIds, [id(0n), '0x' + 'ab'.repeat(32)]);
  assert.deepEqual(plan.scenario.initialPaidRequestIds, [id(0n)]);
  assert.equal(f.calls.filter(c => c.method === 'eth_call' && methodName(c.params) === 'paidRequests').length, 2);
});
test('empty proposal scope is explicit and does not claim all historical requests were checked', async () => {
  const f = fixture();
  const plan = await readPinnedScenario(f.rpc, { ...f.request, proposals: [], steps: [] });
  assert.deepEqual(plan.source.queriedRequestIds, []);
  assert.equal(plan.scenario.initialBalance, 100n);
  assert.equal(f.calls.length, 9);
});
for (const phase of ['before', 'after']) for (const mismatch of ['chain', 'block hash', 'block number']) {
  test(`reject ${mismatch} mismatch ${phase} state reads`, async () => {
    const f = fixture(); let chains = 0, headers = 0;
    const rpc: SnapshotReadRpc = async (method, params) => {
      const value = await f.rpc(method, params);
      const target = phase === 'before' ? 1 : 2;
      if (method === 'eth_chainId' && ++chains === target && mismatch === 'chain') return '0x1';
      if (method === 'eth_getBlockByNumber' && ++headers === target) {
        if (mismatch === 'block hash') return { number: '0xa', hash: otherHash };
        if (mismatch === 'block number') return { number: '0xb', hash: blockHash };
      }
      return value;
    };
    await assert.rejects(readPinnedScenario(rpc, f.request), errorCode('SNAPSHOT_MISMATCH'));
  });
}
test('unsupported EIP-1898 fails closed with no fallback/latest or leaked provider credentials', async () => {
  const f = fixture();
  const rpc: SnapshotReadRpc = async (method, params) => {
    if (method === 'eth_getCode') throw Error('https://user:secret@provider.invalid');
    return f.rpc(method, params);
  };
  await assert.rejects(readPinnedScenario(rpc, f.request), (e: unknown) =>
    e instanceof SnapshotReadError && e.code === 'RPC_READ_FAILED' && !e.message.includes('secret'));
  assert.equal(f.calls.length, 2);
});
for (const value of [null, {}, { number: '0x0a', hash: blockHash }, { number: '0xa', hash: '0x00' }]) {
  test(`reject malformed header ${JSON.stringify(value)}`, async () => {
    const f = fixture();
    await assert.rejects(readPinnedScenario(async (m, p) => m === 'eth_getBlockByNumber' ? value : f.rpc(m, p), f.request), errorCode('INVALID_RPC_DATA'));
  });
}
for (const value of ['0x', '0x0', '0xgg', null, '0x6001']) {
  test(`reject missing/malformed/mismatched runtime code ${String(value)}`, async () => {
    const f = fixture();
    await assert.rejects(readPinnedScenario(async (m, p) => m === 'eth_getCode' ? value : f.rpc(m, p), f.request),
      errorCode(value === '0x6001' ? 'CONTRACT_MISMATCH' : 'INVALID_RPC_DATA'));
  });
}
for (const [name, value, code] of [
  ['budgetToken', T.encodeFunctionResult('budgetToken', [treasury]), 'CONTRACT_MISMATCH'],
  ['decimals', B.encodeFunctionResult('decimals', [6]), 'UNSUPPORTED_TOKEN'],
  ['balanceOf', '0x', 'INVALID_RPC_DATA'],
  ['paidRequests', '0x' + '0'.repeat(63) + '2', 'INVALID_RPC_DATA'],
  ['balanceOf', B.encodeFunctionResult('balanceOf', [100n]) + '00', 'INVALID_RPC_DATA'],
] as const) {
  test(`reject inconsistent or noncanonical ${name} return`, async () => {
    const f = fixture();
    await assert.rejects(readPinnedScenario(async (m, p) => m === 'eth_call' && methodName(p) === name ? value : f.rpc(m, p), f.request), errorCode(code));
  });
}
test('RPC failure during paid reads rejects the entire read, never returns a partially seeded scenario', async () => {
  const f = fixture(); let reads = 0;
  await assert.rejects(readPinnedScenario(async (m, p) => {
    if (m === 'eth_call' && methodName(p) === 'paidRequests' && ++reads === 2) throw Error('historical state unavailable');
    return f.rpc(m, p);
  }, f.request), errorCode('RPC_READ_FAILED'));
});
test('mutating caller data while an await is pending cannot change snapshot or scenario', async () => {
  const f = fixture(); let first = true;
  const plan = await readPinnedScenario(async (m, p) => {
    if (first) {
      first = false;
      (f.request.snapshot as { blockHash: string }).blockHash = otherHash;
      (f.request.proposals[0]!.request as { amount: bigint }).amount = 999n;
    }
    return f.rpc(m, p);
  }, f.request);
  assert.equal(plan.source.snapshot.blockHash, blockHash);
  assert.equal(plan.scenario.proposals[0]!.request.amount, 10n);
});
test('invalid snapshot/scenario input fails before any network reads', async () => {
  const f = fixture();
  for (const request of [{ ...f.request, snapshot: undefined },
    { ...f.request, snapshot: { ...f.request.snapshot, blockNumber: -1n } },
    { ...f.request, contracts: { ...f.request.contracts, treasuryCodeHash: '0x12' } },
    { ...f.request, contracts: { ...f.request.contracts, budgetTokenAddress: treasury } },
    { ...f.request, proposals: new Array(LIMITS.proposals + 1) }]) {
    await assert.rejects(readPinnedScenario(f.rpc, request as never));
  }
  assert.equal(f.calls.length, 0);
});
test('top-ups and eligibility remain explicit assumptions after a successful snapshot read', async () => {
  const f = fixture();
  const plan = await readPinnedScenario(f.rpc, { ...f.request, proposals: [{ ...proposal('p1', 200n), executionAllowed: false }],
    steps: [{ kind: 'top-up', amount: 1000n }, { kind: 'execute', proposalId: 'p1' }] });
  assert.equal(simulateBudget(plan.scenario).trace[1]!.outcome, 'not-eligible');
});
