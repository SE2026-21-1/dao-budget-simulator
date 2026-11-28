import assert from 'node:assert/strict';
import test from 'node:test';
import { simulateBudget, withExecutionOrder, LIMITS, UINT256_MAX } from '../../simulator/index.js';
import type { ScenarioStep, TreasuryScenario } from '../../simulator/types.js';
import { id, proposal, scenario, treasury } from './helpers.js';

/** Reproducible bounded generation, not a source of monetary floating-point arithmetic. */
function generator(seed: bigint) {
  return (bound: number) => {
    seed = (1664525n * seed + 1013904223n) & 0xffffffffn;
    return Number((seed >> 8n) % BigInt(bound));
  };
}

test('500 generated scenarios preserve ledger conservation, payment uniqueness, atomicity and replay', () => {
  const next = generator(0x20261126n);
  const outcomes = new Set<string>();
  for (let run = 0; run < 500; run++) {
    const proposals = Array.from({ length: 6 }, (_, i) => proposal(`p${i}`, BigInt(next(40)) + 1n,
      id(BigInt(next(4))), next(5) !== 0));
    const steps: ScenarioStep[] = Array.from({ length: 40 }, () => next(4) === 0
      ? { kind: 'top-up', amount: BigInt(next(20)) + 1n }
      : { kind: 'execute', proposalId: `p${next(6)}` });
    const input: TreasuryScenario = { treasuryAddress: treasury, initialBalance: BigInt(next(50)),
      initialPaidRequestIds: next(3) === 0 ? [id(0n)] : [], proposals, steps };
    const before = structuredClone(input), result = simulateBudget(input);
    assert.deepEqual(input, before);
    assert.deepEqual(simulateBudget(input), result);
    const paid = new Set(input.initialPaidRequestIds);
    let payouts = 0n, incoming = 0n, running = input.initialBalance;
    for (const [i, entry] of result.trace.entries()) {
      outcomes.add(entry.outcome);
      assert.equal(entry.stepIndex, i);
      assert.equal(entry.balanceBefore, running);
      assert.ok(entry.balanceAfter >= 0n && entry.balanceAfter <= UINT256_MAX);
      if (entry.kind === 'execute' && entry.outcome === 'executed') {
        assert.equal(paid.has(entry.requestId), false);
        paid.add(entry.requestId);
        payouts += entry.amount;
        assert.equal(entry.balanceAfter, running - entry.amount);
      } else if (entry.kind === 'top-up' && entry.outcome === 'applied') {
        incoming += entry.amount;
        assert.equal(entry.balanceAfter, running + entry.amount);
      } else assert.equal(entry.balanceAfter, running);
      running = entry.balanceAfter;
    }
    assert.equal(result.finalBalance, running);
    assert.equal(result.totalDisbursed, payouts);
    assert.equal(result.totalTopUps, incoming);
    assert.equal(input.initialBalance + incoming, result.finalBalance + payouts);
    assert.deepEqual(result.paidRequestIds, [...paid]);
    assert.equal(new Set(result.executedProposalIds).size, result.executedProposalIds.length);
    for (const p of result.proposals) {
      const attempts = result.trace.filter(t => t.kind === 'execute' && t.proposalId === p.proposalId);
      assert.equal(p.attempts, attempts.length);
      assert.equal(p.lastOutcome, attempts.at(-1)?.outcome ?? null);
      assert.equal(p.executed, attempts.some(t => t.outcome === 'executed'));
    }
    const length = next(steps.length + 1);
    const prefix = simulateBudget({ ...input, steps: steps.slice(0, length) });
    assert.deepEqual(prefix.trace, result.trace.slice(0, length));
  }
  // Prevent a generator with only successful or only failed attempts from being vacuous.
  assert.deepEqual([...outcomes].sort(), ['applied', 'executed', 'insufficient-budget', 'not-eligible',
    'proposal-already-executed', 'request-already-paid'].sort());
});

test('scaling every monetary input by 10^18 preserves decisions and scales the ledger exactly', () => {
  const input = scenario({ initialBalance: 7n, proposals: [proposal('p1', 10n), proposal('p2', 3n, id(2n))],
    steps: [{ kind: 'execute', proposalId: 'p1' }, { kind: 'execute', proposalId: 'p2' },
      { kind: 'top-up', amount: 6n }, { kind: 'execute', proposalId: 'p1' }] });
  const scale = 10n ** 18n;
  const scaled: TreasuryScenario = { ...input, initialBalance: input.initialBalance * scale,
    proposals: input.proposals.map(p => ({ ...p, request: { ...p.request, amount: p.request.amount * scale } })),
    steps: input.steps.map(s => s.kind === 'top-up' ? { ...s, amount: s.amount * scale } : s) };
  const a = simulateBudget(input), b = simulateBudget(scaled);
  assert.deepEqual(a.trace.map(t => t.outcome), b.trace.map(t => t.outcome));
  assert.equal(b.finalBalance, a.finalBalance * scale);
  assert.equal(b.totalDisbursed, a.totalDisbursed * scale);
  assert.equal(b.totalTopUps, a.totalTopUps * scale);
});

test('fully funded distinct requests have the same paid set in all six small explicit orders', () => {
  const definition = { treasuryAddress: treasury, initialBalance: 100n,
    proposals: [proposal('a', 10n, id(1n)), proposal('b', 20n, id(2n)), proposal('c', 30n, id(3n))] };
  for (const order of [['a', 'b', 'c'], ['a', 'c', 'b'], ['b', 'a', 'c'], ['b', 'c', 'a'], ['c', 'a', 'b'], ['c', 'b', 'a']]) {
    const r = simulateBudget(withExecutionOrder(definition, order));
    assert.equal(r.finalBalance, 40n);
    assert.deepEqual([...r.paidRequestIds].sort(), [id(1n), id(2n), id(3n)]);
    assert.deepEqual(r.failedProposalIds, []);
  }
});

test('failed ineligible attempts can be inserted without changing the economic result', () => {
  const base = scenario({ proposals: [proposal(), proposal('blocked', 50n, id(2n), false)] });
  const a = simulateBudget(base), b = simulateBudget({ ...base, steps: [
    { kind: 'execute', proposalId: 'blocked' }, ...base.steps, { kind: 'execute', proposalId: 'blocked' }] });
  assert.equal(a.finalBalance, b.finalBalance);
  assert.equal(a.totalDisbursed, b.totalDisbursed);
  assert.deepEqual(a.paidRequestIds, b.paidRequestIds);
});

test('maximum trace size remains bounded and repeated successful attempts never pay twice', () => {
  const r = simulateBudget(scenario({ steps: Array.from({ length: LIMITS.steps }, () => ({ kind: 'execute', proposalId: 'p1' })) }));
  assert.equal(r.trace.length, LIMITS.steps);
  assert.equal(r.totalDisbursed, 10n);
  assert.equal(r.proposals[0]!.attempts, LIMITS.steps);
});
