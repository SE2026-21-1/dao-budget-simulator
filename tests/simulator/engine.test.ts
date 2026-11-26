import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateBudget } from '../../simulator/engine.js';
import { UINT256_MAX } from '../../simulator/validation.js';
import { id, proposal, scenario } from './helpers.js';

const execute = (proposalId: string) => ({ kind: 'execute' as const, proposalId });
test('empty scenario preserves balance and explicit hypothetical label', () => {
  const r = simulateBudget(scenario({ initialBalance: 0n, proposals: [], steps: [] }));
  assert.equal(r.kind, 'hypothetical-budget-result-v1');
  assert.equal(r.finalBalance, 0n);
  assert.equal(r.totalDisbursed, 0n);
  assert.deepEqual(r.trace, []);
  assert.deepEqual(r.paidRequestIds, []);
});
test('one successful payment produces a complete trace', () => {
  const r = simulateBudget(scenario());
  assert.equal(r.finalBalance, 90n);
  assert.equal(r.totalDisbursed, 10n);
  assert.deepEqual(r.paidRequestIds, [id(1n)]);
  assert.deepEqual(r.trace, [{ kind: 'execute', stepIndex: 0, proposalId: 'p1', ...proposal().request,
    outcome: 'executed', balanceBefore: 100n, balanceAfter: 90n }]);
  assert.deepEqual(r.executedProposalIds, ['p1']);
  assert.deepEqual(r.failedProposalIds, []);
});
test('multiple distinct requests and recipients execute exactly once each', () => {
  const r = simulateBudget(scenario({ proposals: [proposal(), proposal('p2', 25n, id(2n))], steps: [execute('p1'), execute('p2')] }));
  assert.equal(r.finalBalance, 65n);
  assert.equal(r.totalDisbursed, 35n);
  assert.deepEqual(r.paidRequestIds, [id(1n), id(2n)]);
});
for (const initialBalance of [0n, 9n]) {
  test(`insufficient budget is atomic at balance ${initialBalance}`, () => {
    const r = simulateBudget(scenario({ initialBalance }));
    assert.equal(r.trace[0]!.outcome, 'insufficient-budget');
    assert.equal(r.finalBalance, initialBalance);
    assert.equal(r.totalDisbursed, 0n);
    assert.deepEqual(r.paidRequestIds, []);
    assert.deepEqual(r.failedProposalIds, ['p1']);
  });
}
test('exact balance succeeds and never becomes negative', () => {
  const r = simulateBudget(scenario({ initialBalance: 10n }));
  assert.equal(r.trace[0]!.outcome, 'executed');
  assert.equal(r.finalBalance, 0n);
});
test('eligibility is explicit and does not consume funds or paid requests', () => {
  const r = simulateBudget(scenario({ proposals: [proposal('p1', 10n, id(1n), false)] }));
  assert.equal(r.trace[0]!.outcome, 'not-eligible');
  assert.equal(r.finalBalance, 100n);
  assert.deepEqual(r.paidRequestIds, []);
});
test('prepaid request takes precedence over insufficient funds', () => {
  const r = simulateBudget(scenario({ initialBalance: 0n, initialPaidRequestIds: [id(1n)] }));
  assert.equal(r.trace[0]!.outcome, 'request-already-paid');
  assert.equal(r.totalDisbursed, 0n);
});
test('shared request with different recipient/amount cannot pay twice', () => {
  const p2 = { ...proposal('p2', 20n), request: { ...proposal('p2', 20n).request, recipient: '0x3333333333333333333333333333333333333333' } };
  const r = simulateBudget(scenario({ proposals: [proposal(), p2], steps: [execute('p1'), execute('p2')] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['executed', 'request-already-paid']);
  assert.equal(r.finalBalance, 90n);
  assert.deepEqual(r.failedProposalIds, ['p2']);
});
test('successful proposal replay is rejected independently of remaining funds', () => {
  const r = simulateBudget(scenario({ steps: [execute('p1'), execute('p1')] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['executed', 'proposal-already-executed']);
  assert.equal(r.proposals[0]!.executed, true);
  assert.equal(r.proposals[0]!.attempts, 2);
  assert.deepEqual(r.failedProposalIds, []);
});
test('failed expensive request leaves shared request available to a smaller proposal', () => {
  const r = simulateBudget(scenario({ initialBalance: 10n, proposals: [proposal('p1', 11n), proposal('p2', 5n)], steps: [execute('p1'), execute('p2')] }));
  assert.deepEqual(r.trace.map(t => t.outcome), ['insufficient-budget', 'executed']);
  assert.equal(r.finalBalance, 5n);
  assert.deepEqual(r.paidRequestIds, [id(1n)]);
});
test('unattempted proposals are distinguished from failed proposals', () => {
  const r = simulateBudget(scenario({ steps: [] }));
  assert.deepEqual(r.failedProposalIds, []);
  assert.deepEqual(r.unattemptedProposalIds, ['p1']);
  assert.equal(r.proposals[0]!.lastOutcome, null);
});
test('uint256 maximum and base-unit precision use exact bigint arithmetic', () => {
  const r = simulateBudget(scenario({ initialBalance: UINT256_MAX, proposals: [proposal('p1', UINT256_MAX - 1n)] }));
  assert.equal(r.finalBalance, 1n);
  assert.equal(r.totalDisbursed, UINT256_MAX - 1n);
});
test('replay is deterministic and does not mutate a frozen input', () => {
  const input = scenario();
  Object.freeze(input.proposals[0]!.request); Object.freeze(input.proposals[0]);
  Object.freeze(input.proposals); Object.freeze(input.steps[0]); Object.freeze(input.steps); Object.freeze(input);
  assert.deepEqual(simulateBudget(input), simulateBudget(input));
});
