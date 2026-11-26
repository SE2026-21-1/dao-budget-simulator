import type { HypotheticalProposal, TreasuryScenario } from '../../simulator/types.js';

export const treasury = '0x1111111111111111111111111111111111111111';
export const recipient = '0x2222222222222222222222222222222222222222';
export const id = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}`;
export function proposal(proposalId = 'p1', amount = 10n, requestId = id(1n), executionAllowed = true): HypotheticalProposal {
  return { proposalId, executionAllowed, request: { requestId, recipient, amount } };
}
export function scenario(overrides: Partial<TreasuryScenario> = {}): TreasuryScenario {
  return { treasuryAddress: treasury, initialBalance: 100n, proposals: [proposal()],
    steps: [{ kind: 'execute', proposalId: 'p1' }], ...overrides };
}
