import { Interface, keccak256 } from 'ethers';
import treasuryAbi from '../shared/abi/Treasury.json' with { type: 'json' };
import budgetAbi from '../shared/abi/BudgetToken.json' with { type: 'json' };
import type { HypotheticalProposal, ScenarioStep, TreasuryScenario } from './types.js';
import { address, uint256, validateScenario } from './validation.js';

/** The adapter has no signer/URL and invokes only these read methods. Transport supplies timeouts. */
export type SnapshotReadMethod = 'eth_chainId' | 'eth_getBlockByNumber' | 'eth_getCode' | 'eth_call';
export type SnapshotReadRpc = (method: SnapshotReadMethod, params: readonly unknown[]) => Promise<unknown>;
export interface SnapshotReadOptions {
  /** Deadline for the whole read, not a fresh timeout per request. Default 30s; maximum 120s. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}
export interface PinnedChainSnapshot {
  readonly chainId: bigint;
  readonly blockNumber: bigint;
  readonly blockHash: string;
}
export interface TreasuryIdentity {
  readonly treasuryAddress: string;
  readonly budgetTokenAddress: string;
  /** Exact runtime keccak hashes from a separately trusted deployment, not fetched as expectations. */
  readonly treasuryCodeHash: string;
  readonly budgetTokenCodeHash: string;
}
export interface PinnedScenarioRequest {
  readonly snapshot: PinnedChainSnapshot;
  readonly contracts: TreasuryIdentity;
  readonly proposals: readonly HypotheticalProposal[];
  readonly steps: readonly ScenarioStep[];
}
export interface PinnedBudgetInput {
  readonly kind: 'hypothetical-budget-input-from-pinned-chain-v1';
  readonly source: {
    readonly snapshot: PinnedChainSnapshot;
    readonly contracts: TreasuryIdentity;
    readonly paidRequestScope: 'supplied-proposals-only';
    readonly queriedRequestIds: readonly string[];
  };
  /** Initial balance and relevant paid flags were read; eligibility/top-ups remain assumptions. */
  readonly scenario: TreasuryScenario;
}
export type SnapshotReadCode = 'INVALID_SNAPSHOT' | 'RPC_READ_FAILED' | 'INVALID_RPC_DATA'
  | 'SNAPSHOT_MISMATCH' | 'CONTRACT_MISMATCH' | 'UNSUPPORTED_TOKEN' | 'READ_TIMEOUT' | 'READ_ABORTED';
export class SnapshotReadError extends Error {
  constructor(readonly code: SnapshotReadCode, readonly field: string) {
    super(`${code}: ${field}`);
    this.name = 'SnapshotReadError';
  }
}
const treasuryInterface = new Interface(treasuryAbi);
const budgetInterface = new Interface(budgetAbi);
function fail(code: SnapshotReadCode, field: string): never { throw new SnapshotReadError(code, field); }
function hash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) fail('INVALID_RPC_DATA', field);
  return value.toLowerCase();
}
function quantity(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || value.length > 66 || !/^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) {
    fail('INVALID_RPC_DATA', field);
  }
  return BigInt(value);
}

/** Opt-in, fail-closed snapshot reader. Never falls back to number-tagged state or latest. */
export async function readPinnedScenario(rpc: SnapshotReadRpc, input: PinnedScenarioRequest,
  options: SnapshotReadOptions = {}): Promise<PinnedBudgetInput> {
  if (!input || !input.snapshot || !input.contracts || typeof rpc !== 'function') fail('INVALID_SNAPSHOT', 'input');
  if (!options || typeof options !== 'object') fail('INVALID_SNAPSHOT', 'options');
  const timeoutMs = options.timeoutMs === undefined ? 30_000 : options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) fail('INVALID_SNAPSHOT', 'timeoutMs');
  const signal = options.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) fail('INVALID_SNAPSHOT', 'signal');
  const deadline = performance.now() + timeoutMs;
  // Copy all supplied data before the first await; async caller mutation cannot switch the pin or proposals.
  const snapshot = { chainId: uint256(input.snapshot.chainId, 'snapshot.chainId', true),
    blockNumber: uint256(input.snapshot.blockNumber, 'snapshot.blockNumber'),
    blockHash: hash(input.snapshot.blockHash, 'snapshot.blockHash') };
  const contracts = { treasuryAddress: address(input.contracts.treasuryAddress, 'contracts.treasuryAddress'),
    budgetTokenAddress: address(input.contracts.budgetTokenAddress, 'contracts.budgetTokenAddress'),
    treasuryCodeHash: hash(input.contracts.treasuryCodeHash, 'contracts.treasuryCodeHash'),
    budgetTokenCodeHash: hash(input.contracts.budgetTokenCodeHash, 'contracts.budgetTokenCodeHash') };
  if (contracts.treasuryAddress === contracts.budgetTokenAddress) fail('CONTRACT_MISMATCH', 'addresses');
  const template = validateScenario({ treasuryAddress: contracts.treasuryAddress, initialBalance: 0n,
    proposals: input.proposals, steps: input.steps });
  const queriedRequestIds = [...new Set(template.proposals.map(p => p.request.requestId))];
  const tag = Object.freeze({ blockHash: snapshot.blockHash, requireCanonical: true });
  const read = async (method: SnapshotReadMethod, params: readonly unknown[]): Promise<unknown> => {
    if (signal?.aborted) fail('READ_ABORTED', method);
    const remaining = deadline - performance.now();
    if (remaining <= 0) fail('READ_TIMEOUT', method);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const value = await Promise.race([
        Promise.resolve().then(async () => {
          if (signal?.aborted) fail('READ_ABORTED', method);
          if (performance.now() >= deadline) fail('READ_TIMEOUT', method);
          try { return await rpc(method, params); }
          catch { return fail('RPC_READ_FAILED', method); } // Never leak provider URLs or credentials.
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new SnapshotReadError('READ_TIMEOUT', method)), Math.ceil(remaining));
          if (signal) {
            onAbort = () => reject(new SnapshotReadError('READ_ABORTED', method));
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
          }
        }),
      ]);
      if (signal?.aborted) fail('READ_ABORTED', method);
      if (performance.now() >= deadline) fail('READ_TIMEOUT', method);
      return value;
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  };
  const anchor = async (): Promise<void> => {
    if (quantity(await read('eth_chainId', []), 'chainId') !== snapshot.chainId) fail('SNAPSHOT_MISMATCH', 'chainId');
    const raw = await read('eth_getBlockByNumber', [`0x${snapshot.blockNumber.toString(16)}`, false]);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_RPC_DATA', 'block');
    const block = raw as Record<string, unknown>;
    if (quantity(block.number, 'block.number') !== snapshot.blockNumber || hash(block.hash, 'block.hash') !== snapshot.blockHash) {
      fail('SNAPSHOT_MISMATCH', 'block');
    }
  };
  const code = async (to: string, expectedHash: string): Promise<void> => {
    const value = await read('eth_getCode', [to, tag]);
    if (typeof value !== 'string' || value.length > 131074 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
      fail('INVALID_RPC_DATA', 'runtimeCode');
    }
    if (keccak256(value) !== expectedHash) fail('CONTRACT_MISMATCH', 'runtimeCodeHash');
  };
  const call = async (iface: Interface, to: string, method: string, args: readonly unknown[]): Promise<unknown> => {
    const data = iface.encodeFunctionData(method, args);
    const raw = await read('eth_call', [{ to, data }, tag]);
    if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw)) fail('INVALID_RPC_DATA', method);
    try {
      const decoded = iface.decodeFunctionResult(method, raw);
      // Reject dirty bool/address words and trailing bytes even if a decoder tolerates them.
      if (iface.encodeFunctionResult(method, decoded).toLowerCase() !== raw.toLowerCase()) fail('INVALID_RPC_DATA', method);
      return decoded[0];
    } catch { return fail('INVALID_RPC_DATA', method); }
  };

  await anchor();
  await code(contracts.treasuryAddress, contracts.treasuryCodeHash);
  await code(contracts.budgetTokenAddress, contracts.budgetTokenCodeHash);
  const configuredToken = await call(treasuryInterface, contracts.treasuryAddress, 'budgetToken', []);
  if (typeof configuredToken !== 'string' || configuredToken.toLowerCase() !== contracts.budgetTokenAddress) {
    fail('CONTRACT_MISMATCH', 'budgetToken');
  }
  if (await call(budgetInterface, contracts.budgetTokenAddress, 'decimals', []) !== 18n) fail('UNSUPPORTED_TOKEN', 'decimals');
  const initialBalance = uint256(await call(budgetInterface, contracts.budgetTokenAddress, 'balanceOf', [contracts.treasuryAddress]), 'balanceOf');
  const initialPaidRequestIds: string[] = [];
  for (const requestId of queriedRequestIds) {
    if (await call(treasuryInterface, contracts.treasuryAddress, 'paidRequests', [requestId]) === true) initialPaidRequestIds.push(requestId);
  }
  await anchor();
  return { kind: 'hypothetical-budget-input-from-pinned-chain-v1',
    source: { snapshot, contracts, paidRequestScope: 'supplied-proposals-only', queriedRequestIds },
    scenario: { ...template, initialBalance, initialPaidRequestIds } };
}
