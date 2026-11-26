/** BUD amounts are uint256 base units (18 decimals), never JS numbers. */
export interface DisbursementRequest {
  readonly requestId: string;
  readonly recipient: string;
  readonly amount: bigint;
}

export interface HypotheticalProposal {
  /** Opaque, case-sensitive label; not a computed Governor proposal hash. */
  readonly proposalId: string;
  readonly request: DisbursementRequest;
  /** A supplied assumption, not a chain authorization or governance calculation. */
  readonly executionAllowed: boolean;
}

export interface ScenarioDefinition {
  readonly treasuryAddress: string;
  readonly initialBalance: bigint;
  readonly initialPaidRequestIds?: readonly string[];
  readonly proposals: readonly HypotheticalProposal[];
}

export interface ExecuteStep {
  readonly kind: 'execute';
  readonly proposalId: string;
}

export type ScenarioStep = ExecuteStep;

export interface TreasuryScenario extends ScenarioDefinition {
  /** Array order is execution order. Repeated proposal IDs are explicit retries. */
  readonly steps: readonly ScenarioStep[];
}

export type ExecutionOutcome = 'executed' | 'not-eligible' | 'proposal-already-executed'
  | 'request-already-paid' | 'insufficient-budget';

export interface ExecutionTrace {
  readonly kind: 'execute';
  readonly stepIndex: number;
  readonly proposalId: string;
  readonly requestId: string;
  readonly recipient: string;
  readonly amount: bigint;
  readonly outcome: ExecutionOutcome;
  readonly balanceBefore: bigint;
  readonly balanceAfter: bigint;
}

export type StepTrace = ExecutionTrace;

export interface ProposalResult {
  readonly proposalId: string;
  readonly requestId: string;
  readonly attempts: number;
  readonly executed: boolean;
  readonly lastOutcome: ExecutionOutcome | null;
}

export interface SimulationResult {
  readonly kind: 'hypothetical-budget-result-v1';
  readonly treasuryAddress: string;
  readonly initialBalance: bigint;
  readonly finalBalance: bigint;
  readonly totalDisbursed: bigint;
  readonly paidRequestIds: readonly string[];
  readonly trace: readonly StepTrace[];
  /** Summaries follow input proposal order; attempts include failed retries. */
  readonly proposals: readonly ProposalResult[];
  readonly executedProposalIds: readonly string[];
  /** Attempted proposals that have never succeeded, not transient failed attempts. */
  readonly failedProposalIds: readonly string[];
  readonly unattemptedProposalIds: readonly string[];
}
