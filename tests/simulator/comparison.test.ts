import assert from 'node:assert/strict';
import test from 'node:test';
import { compareExecutionOrders, compareScenarios } from '../../simulator/comparison.js';
import { LIMITS } from '../../simulator/validation.js';
import { id, proposal, treasury } from './helpers.js';

const base = { treasuryAddress: treasury, initialBalance: 10n,
  proposals: [proposal('large', 8n, id(1n)), proposal('small', 4n, id(2n))] };
const orders = [{ name: 'large-first', proposalIds: ['large', 'small'] }, { name: 'small-first', proposalIds: ['small', 'large'] }];
test('order comparison reports exact winners, failures and signed deltas', () => {
  const r = compareExecutionOrders(base, orders);
  assert.equal(r.kind, 'hypothetical-budget-comparison-v1');
  assert.equal(r.baselineName, 'large-first');
  assert.deepEqual(r.variants.map(v => v.result.failedProposalIds), [['small'], ['large']]);
  assert.deepEqual(r.differences, [{ name: 'small-first', newlyExecutedProposalIds: ['small'], noLongerExecutedProposalIds: ['large'],
    totalDisbursedDelta: -4n, totalTopUpsDelta: 0n, finalBalanceDelta: 4n }]);
});
test('comparison reuses the same initial paid state independently for every variant', () => {
  const r = compareExecutionOrders({ ...base, initialPaidRequestIds: [id(1n)] }, orders);
  for (const { result } of r.variants) {
    assert.deepEqual(result.executedProposalIds, ['small']);
    assert.equal(result.finalBalance, 6n);
  }
});
test('compare explicit retry plans and disclose differing top-up assumptions', () => {
  const r = compareScenarios(base, [{ name: 'baseline', steps: [{ kind: 'execute', proposalId: 'large' }] },
    { name: 'fund-and-retry', steps: [{ kind: 'execute', proposalId: 'large' }, { kind: 'execute', proposalId: 'small' },
      { kind: 'top-up', amount: 2n }, { kind: 'execute', proposalId: 'small' }] }]);
  assert.deepEqual(r.variants[0]!.result.unattemptedProposalIds, ['small']);
  assert.deepEqual(r.variants[1]!.result.executedProposalIds, ['large', 'small']);
  assert.equal(r.differences[0]!.totalTopUpsDelta, 2n);
  assert.equal(r.differences[0]!.totalDisbursedDelta, 4n);
  assert.equal(r.differences[0]!.finalBalanceDelta, -2n);
});
test('comparison is deterministic and does not mutate orders/base', () => {
  const before = structuredClone({ base, orders });
  assert.deepEqual(compareExecutionOrders(base, orders), compareExecutionOrders(base, orders));
  assert.deepEqual({ base, orders }, before);
});
test('one named baseline is valid and has no differences', () => {
  assert.deepEqual(compareExecutionOrders(base, [orders[0]!]).differences, []);
});
test('reject missing, excessive, duplicate, malformed and invalid alternatives', () => {
  for (const plans of [[], new Array(LIMITS.comparisons + 1), new Array(1), [null],
    [{ name: 'a', steps: [] }, { name: 'a', steps: [] }], [{ name: ' ', steps: [] }],
    [{ name: 'a', steps: [{ kind: 'execute', proposalId: 'absent' }] }],
    [{ name: 'a', steps: [], extra: true }]]) {
    assert.throws(() => compareScenarios(base, plans as never));
  }
  assert.throws(() => compareExecutionOrders(base, [{ name: 'bad', proposalIds: ['large'] }]));
  assert.throws(() => compareExecutionOrders(base, [{ name: 'bad', proposalIds: ['large', 'small'], steps: [] }] as never));
});
test('maximum explicit comparison count is accepted without permutation enumeration', () => {
  const r = compareExecutionOrders(base, Array.from({ length: LIMITS.comparisons }, (_, i) => ({ name: `order-${i}`, proposalIds: ['large', 'small'] })));
  assert.equal(r.variants.length, LIMITS.comparisons);
});
