import type { ExecuteStep, ScenarioDefinition, TreasuryScenario } from './types.js';
import { invalid, LIMITS, validateDefinition } from './validation.js';

/** A permutation must mention every proposal exactly once; retries use explicit steps instead. */
export function withExecutionOrder(input: ScenarioDefinition, order: readonly string[]): Omit<TreasuryScenario, 'steps'> & { readonly steps: readonly ExecuteStep[] } {
  const base = validateDefinition(input);
  if (!Array.isArray(order) || order.length > LIMITS.proposals) invalid('INVALID_EXECUTION_ORDER', 'order');
  const ids = new Set(base.proposals.map(p => p.proposalId));
  if (order.length !== ids.size || new Set(order).size !== ids.size) {
    invalid('INVALID_EXECUTION_ORDER', 'order');
  }
  for (const id of order) if (!ids.has(id)) invalid('INVALID_EXECUTION_ORDER', 'order');
  return { ...base, steps: Array.from(order, proposalId => ({ kind: 'execute', proposalId })) };
}
