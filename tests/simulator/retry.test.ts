import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateBudget } from '../../simulator/engine.js';
import { UINT256_MAX } from '../../simulator/validation.js';
import { id, proposal, scenario } from './helpers.js';

const execute = (proposalId = 'p1') => ({ kind: 'execute' as const, proposalId });
const topUp = (amount: bigint) => ({ kind: 'top-up' as const, amount });
test('funding after failed execution enables retry without consuming the request early', () => {
  const r = simulateBudget(scenario({ initialBalance: 2n, steps: [execute(), topUp(8n), execute()] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['insufficient-budget', 'applied', 'executed']);
  assert.deepEqual(r.trace.map(t => t.balanceAfter), [2n, 10n, 0n]);
  assert.equal(r.totalDisbursed, 10n);
  assert.equal(r.totalTopUps, 8n);
  assert.deepEqual(r.paidRequestIds, [id(1n)]);
  assert.deepEqual(r.failedProposalIds, []);
  assert.equal(r.proposals[0]!.attempts, 2);
});
test('retries without enough funding remain atomic and can succeed later', () => {
  const r = simulateBudget(scenario({ initialBalance: 0n, steps: [execute(), execute(), topUp(9n), execute(), topUp(1n), execute(), execute()] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['insufficient-budget', 'insufficient-budget', 'applied', 'insufficient-budget', 'applied', 'executed', 'proposal-already-executed']);
  assert.equal(r.totalDisbursed, 10n);
  assert.equal(r.proposals[0]!.attempts, 5);
});
test('top-up cannot revive an already paid shared request', () => {
  const r = simulateBudget(scenario({ initialBalance: 10n, proposals: [proposal(), proposal('p2')], steps: [execute(), topUp(10n), execute('p2'), execute()] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['executed', 'applied', 'request-already-paid', 'proposal-already-executed']);
  assert.equal(r.finalBalance, 10n);
  assert.equal(r.totalDisbursed, 10n);
});
test('funding changes liquidity but never changes supplied eligibility', () => {
  const r = simulateBudget(scenario({ initialBalance: 0n, proposals: [proposal('p1', 10n, id(1n), false)], steps: [execute(), topUp(100n), execute()] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['not-eligible', 'applied', 'not-eligible']);
  assert.equal(r.totalDisbursed, 0n);
});
test('overflowing top-up is a failed transition; later valid steps still run', () => {
  const r = simulateBudget(scenario({ initialBalance: UINT256_MAX, proposals: [proposal('p1', UINT256_MAX)], steps: [topUp(1n), execute(), topUp(UINT256_MAX)] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['balance-overflow', 'executed', 'applied']);
  assert.equal(r.trace[0]!.balanceAfter, UINT256_MAX);
  assert.equal(r.finalBalance, UINT256_MAX);
  assert.equal(r.totalTopUps, UINT256_MAX);
});
test('cumulative top-ups and payouts can exceed uint256 while each balance remains bounded', () => {
  const r = simulateBudget(scenario({ initialBalance: 0n,
    proposals: [proposal('p1', UINT256_MAX), proposal('p2', UINT256_MAX, id(2n))],
    steps: [topUp(UINT256_MAX), execute(), topUp(UINT256_MAX), execute('p2')] }));
  assert.equal(r.totalTopUps, 2n * UINT256_MAX);
  assert.equal(r.totalDisbursed, 2n * UINT256_MAX);
  assert.equal(r.finalBalance, 0n);
});
for (const amount of [0n, -1n, UINT256_MAX + 1n, 1, '1']) {
  test(`invalid top-up ${String(amount)} (${typeof amount}) rejects the whole scenario before transitions`, () => {
    assert.throws(() => simulateBudget(scenario({ steps: [execute(), topUp(amount as bigint)] })), /INVALID_UINT256/);
  });
}
test('top-up rejects fields belonging to an execute action', () => {
  assert.throws(() => simulateBudget(scenario({ steps: [{ ...topUp(1n), proposalId: 'p1' } as never] })), /INVALID_SHAPE/);
});
