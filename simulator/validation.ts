import { getAddress, ZeroAddress } from 'ethers';
import type { HypotheticalProposal, ScenarioDefinition, ScenarioStep, TreasuryScenario } from './types.js';

export const UINT256_MAX = (1n << 256n) - 1n;
export const LIMITS = Object.freeze({ proposals: 1000, steps: 10000, paidRequests: 10000, comparisons: 16 });
export type ValidationCode = 'INVALID_SHAPE' | 'INVALID_UINT256' | 'INVALID_ADDRESS' | 'INVALID_REQUEST_ID'
  | 'INVALID_PROPOSAL_ID' | 'DUPLICATE_PROPOSAL_ID' | 'DUPLICATE_PAID_REQUEST_ID'
  | 'INVALID_EXECUTION_ORDER' | 'UNKNOWN_PROPOSAL' | 'LIMIT_EXCEEDED';

export class ScenarioValidationError extends Error {
  constructor(readonly code: ValidationCode, readonly path: string) {
    super(`${code}: ${path}`);
    this.name = 'ScenarioValidationError';
  }
}

export function invalid(code: ValidationCode, path: string): never {
  throw new ScenarioValidationError(code, path);
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('INVALID_SHAPE', path);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) invalid('INVALID_SHAPE', path);
  return result;
}

function boundedArray(value: unknown, path: string, limit: number): unknown[] {
  if (!Array.isArray(value)) invalid('INVALID_SHAPE', path);
  if (value.length > limit) invalid('LIMIT_EXCEEDED', path);
  return value;
}

export function uint256(value: unknown, path: string, positive = false): bigint {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > UINT256_MAX) {
    invalid('INVALID_UINT256', path);
  }
  return value;
}

export function address(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) invalid('INVALID_ADDRESS', path);
  try {
    const normalized = getAddress(value);
    if (normalized === ZeroAddress) invalid('INVALID_ADDRESS', path);
    return normalized.toLowerCase();
  } catch {
    return invalid('INVALID_ADDRESS', path);
  }
}

export function requestId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) invalid('INVALID_REQUEST_ID', path);
  // bytes32(0) is valid: neither Treasury nor Governor forbids it.
  return value.toLowerCase();
}

export function proposalId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value.trim() !== value) {
    invalid('INVALID_PROPOSAL_ID', path);
  }
  return value;
}

export function validateDefinition(input: unknown): ScenarioDefinition {
  const value = record(input, 'scenario', ['treasuryAddress', 'initialBalance', 'initialPaidRequestIds', 'proposals']);
  const treasuryAddress = address(value.treasuryAddress, 'treasuryAddress');
  const initialBalance = uint256(value.initialBalance, 'initialBalance');
  const paid = new Set<string>();
  const initialPaidRequestIds = Array.from(boundedArray(value.initialPaidRequestIds ?? [], 'initialPaidRequestIds', LIMITS.paidRequests), (item, i) => {
    const id = requestId(item, `initialPaidRequestIds[${i}]`);
    if (paid.has(id)) invalid('DUPLICATE_PAID_REQUEST_ID', `initialPaidRequestIds[${i}]`);
    paid.add(id);
    return id;
  });
  const ids = new Set<string>();
  const proposals: HypotheticalProposal[] = Array.from(boundedArray(value.proposals, 'proposals', LIMITS.proposals), (item, i) => {
    const path = `proposals[${i}]`;
    const p = record(item, path, ['proposalId', 'request', 'executionAllowed']);
    const id = proposalId(p.proposalId, `${path}.proposalId`);
    if (ids.has(id)) invalid('DUPLICATE_PROPOSAL_ID', `${path}.proposalId`);
    ids.add(id);
    if (typeof p.executionAllowed !== 'boolean') invalid('INVALID_SHAPE', `${path}.executionAllowed`);
    const r = record(p.request, `${path}.request`, ['requestId', 'recipient', 'amount']);
    const recipient = address(r.recipient, `${path}.request.recipient`);
    if (recipient === treasuryAddress) invalid('INVALID_ADDRESS', `${path}.request.recipient`);
    return { proposalId: id, executionAllowed: p.executionAllowed,
      request: { requestId: requestId(r.requestId, `${path}.request.requestId`), recipient,
        amount: uint256(r.amount, `${path}.request.amount`, true) } };
  });
  return { treasuryAddress, initialBalance, initialPaidRequestIds, proposals };
}

export function validateScenario(input: unknown): TreasuryScenario {
  const value = record(input, 'scenario', ['treasuryAddress', 'initialBalance', 'initialPaidRequestIds', 'proposals', 'steps']);
  const base = validateDefinition({ treasuryAddress: value.treasuryAddress, initialBalance: value.initialBalance,
    initialPaidRequestIds: value.initialPaidRequestIds, proposals: value.proposals });
  const ids = new Set(base.proposals.map(p => p.proposalId));
  const steps: ScenarioStep[] = Array.from(boundedArray(value.steps, 'steps', LIMITS.steps), (item, i) => {
    const path = `steps[${i}]`;
    const step = record(item, path, ['kind', 'proposalId']);
    if (step.kind !== 'execute') invalid('INVALID_SHAPE', `${path}.kind`);
    const id = proposalId(step.proposalId, `${path}.proposalId`);
    if (!ids.has(id)) invalid('UNKNOWN_PROPOSAL', `${path}.proposalId`);
    return { kind: 'execute', proposalId: id };
  });
  return { ...base, steps };
}
