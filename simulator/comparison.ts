import { simulateBudget } from './engine.js';
import { withExecutionOrder } from './scenarios.js';
import type { ExecutionOrder, ScenarioComparison, ScenarioDefinition, SimulationPlan } from './types.js';
import { invalid, LIMITS, proposalId, validateDefinition, validateScenario } from './validation.js';

function checkCount(values: readonly unknown[]): void {
  if (!Array.isArray(values) || values.length === 0) invalid('INVALID_SHAPE', 'alternatives');
  if (values.length > LIMITS.comparisons) invalid('LIMIT_EXCEEDED', 'alternatives');
}

/** Compare only explicit bounded plans; never enumerate permutations or fetch chain state. */
export function compareScenarios(input: ScenarioDefinition, plans: readonly SimulationPlan[]): ScenarioComparison {
  checkCount(plans);
  const base = validateDefinition(input);
  const names = new Set<string>();
  const normalized = Array.from(plans, (plan, i) => {
    if (!plan || typeof plan !== 'object' || Object.keys(plan).some(key => !['name', 'steps'].includes(key))) {
      invalid('INVALID_SHAPE', `alternatives[${i}]`);
    }
    const name = proposalId(plan.name, `alternatives[${i}].name`);
    if (names.has(name)) invalid('INVALID_SHAPE', `alternatives[${i}].name`);
    names.add(name);
    return { name, scenario: validateScenario({ ...base, steps: plan.steps }) };
  });
  const variants = normalized.map(plan => ({ name: plan.name, result: simulateBudget(plan.scenario) }));
  const baseline = variants[0]!;
  const baselineExecuted = new Set(baseline.result.executedProposalIds);
  const differences = variants.slice(1).map(({ name, result }) => {
    const executed = new Set(result.executedProposalIds);
    return { name, newlyExecutedProposalIds: result.executedProposalIds.filter(id => !baselineExecuted.has(id)),
      noLongerExecutedProposalIds: baseline.result.executedProposalIds.filter(id => !executed.has(id)),
      totalDisbursedDelta: result.totalDisbursed - baseline.result.totalDisbursed,
      totalTopUpsDelta: result.totalTopUps - baseline.result.totalTopUps,
      finalBalanceDelta: result.finalBalance - baseline.result.finalBalance };
  });
  return { kind: 'hypothetical-budget-comparison-v1', baselineName: baseline.name, variants, differences };
}

/** Convenience API for full permutations, excluding top-ups and retries. */
export function compareExecutionOrders(input: ScenarioDefinition, orders: readonly ExecutionOrder[]): ScenarioComparison {
  checkCount(orders);
  return compareScenarios(input, Array.from(orders, (order, i) => {
    if (!order || typeof order !== 'object' || Object.keys(order).some(key => !['name', 'proposalIds'].includes(key))) {
      invalid('INVALID_SHAPE', `alternatives[${i}]`);
    }
    return { name: order.name, steps: withExecutionOrder(input, order.proposalIds).steps };
  }));
}
