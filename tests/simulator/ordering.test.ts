import assert from 'node:assert/strict';
import test from 'node:test';
import { withExecutionOrder } from '../../simulator/scenarios.js';
import { simulateBudget } from '../../simulator/engine.js';
import { ScenarioValidationError } from '../../simulator/validation.js';
import { id, proposal, treasury } from './helpers.js';

const base = { treasuryAddress: treasury, initialBalance: 10n,
  proposals: [proposal('large', 8n, id(1n)), proposal('small', 4n, id(2n))] };
test('reversing execution order changes which request gets funded', () => {
  const first = simulateBudget(withExecutionOrder(base, ['large', 'small']));
  const reversed = simulateBudget(withExecutionOrder(base, ['small', 'large']));
  assert.deepEqual(first.executedProposalIds, ['large']);
  assert.deepEqual(reversed.executedProposalIds, ['small']);
  assert.equal(first.finalBalance, 2n);
  assert.equal(reversed.finalBalance, 6n);
  assert.equal(first.trace[1]!.outcome, 'insufficient-budget');
});
test('input order is preserved; there is no implicit sorting or locale dependence', () => {
  const custom = { ...base, initialBalance: 20n, proposals: [proposal('10', 1n, id(1n)), proposal('2', 1n, id(2n))] };
  assert.deepEqual(simulateBudget(withExecutionOrder(custom, ['2', '10'])).executedProposalIds, ['2', '10']);
});
for (const order of [[], ['large'], ['large', 'large'], ['small', 'absent'], ['large', 'small', 'large'], new Array(2)]) {
  test(`reject non-permutation ${JSON.stringify(order)}`, () => {
    assert.throws(() => withExecutionOrder(base, order), (e: unknown) => e instanceof ScenarioValidationError && e.code === 'INVALID_EXECUTION_ORDER');
  });
}
test('empty order is valid for an empty proposal set', () => {
  assert.deepEqual(withExecutionOrder({ ...base, proposals: [] }, []).steps, []);
});
test('a single sparse entry cannot masquerade as a one-proposal permutation', () => {
  assert.throws(() => withExecutionOrder({ ...base, proposals: [base.proposals[0]!] }, new Array(1)), /INVALID_EXECUTION_ORDER/);
});
test('ordering does not mutate or alias caller inputs', () => {
  const before = structuredClone(base), order = ['large', 'small'];
  const result = withExecutionOrder(base, order);
  order.reverse();
  assert.deepEqual(result.steps.map(step => step.proposalId), ['large', 'small']);
  assert.deepEqual(base, before);
  assert.notEqual(result.proposals[0], base.proposals[0]);
});
