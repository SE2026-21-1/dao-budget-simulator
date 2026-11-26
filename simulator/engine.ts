import type { ExecutionOutcome, HypotheticalProposal, ProposalResult, SimulationResult, StepTrace, TreasuryScenario } from './types.js';
import { validateScenario } from './validation.js';

/** Pure hypothetical transitions. No RPC, clock, randomness or mutation of input. */
export function simulateBudget(input: TreasuryScenario): SimulationResult {
  const scenario = validateScenario(input);
  const paid = new Set(scenario.initialPaidRequestIds);
  const executed = new Set<string>();
  const proposals = new Map(scenario.proposals.map(p => [p.proposalId, p]));
  const summaries = new Map<string, ProposalResult>(scenario.proposals.map(p => [p.proposalId,
    { proposalId: p.proposalId, requestId: p.request.requestId, attempts: 0, executed: false, lastOutcome: null }]));
  const trace: StepTrace[] = [];
  let balance = scenario.initialBalance;
  let totalDisbursed = 0n;

  function outcome(p: HypotheticalProposal): ExecutionOutcome {
    if (!p.executionAllowed) return 'not-eligible';
    if (executed.has(p.proposalId)) return 'proposal-already-executed';
    if (paid.has(p.request.requestId)) return 'request-already-paid';
    if (balance < p.request.amount) return 'insufficient-budget';
    return 'executed';
  }

  for (const [stepIndex, step] of scenario.steps.entries()) {
    // validateScenario guarantees every execute step refers to this map.
    const p = proposals.get(step.proposalId)!;
    const result = outcome(p);
    const balanceBefore = balance;
    if (result === 'executed') {
      balance -= p.request.amount;
      totalDisbursed += p.request.amount;
      paid.add(p.request.requestId);
      executed.add(p.proposalId);
    }
    const prior = summaries.get(p.proposalId)!;
    summaries.set(p.proposalId, { ...prior, attempts: prior.attempts + 1,
      executed: executed.has(p.proposalId), lastOutcome: result });
    trace.push({ kind: 'execute', stepIndex, proposalId: p.proposalId, requestId: p.request.requestId,
      recipient: p.request.recipient, amount: p.request.amount, outcome: result, balanceBefore, balanceAfter: balance });
  }

  const results = [...summaries.values()];
  return { kind: 'hypothetical-budget-result-v1', treasuryAddress: scenario.treasuryAddress,
    initialBalance: scenario.initialBalance, finalBalance: balance, totalDisbursed,
    paidRequestIds: [...paid], trace, proposals: results, executedProposalIds: [...executed],
    failedProposalIds: results.filter(p => p.attempts > 0 && !p.executed).map(p => p.proposalId),
    unattemptedProposalIds: results.filter(p => p.attempts === 0).map(p => p.proposalId) };
}
