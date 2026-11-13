import { AbiCoder, Interface, ZeroAddress, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';
import { decodeLog } from '../decoder.js';
import { IndexerError } from '../errors.js';
import type { ContractRole, JsonObject, NormalizedLog } from '../types.js';

export const treasuryAbi = new Interface(['function disburse(bytes32 requestId,address recipient,uint256 amount)']);
const coder = AbiCoder.defaultAbiCoder();

export interface SourceEvent {
  id: string;
  role: ContractRole;
  address: string;
  block: string;
  blockHash: string;
  timestamp: string;
  tx: string;
  txIndex: string;
  logIndex: string;
  name: string;
  payload: JsonObject;
}
export interface Proposal {
  id: string;
  requestId: string;
  proposer: string;
  recipient: string;
  amount: string;
  description: string;
  descriptionHash: string;
  targets: string[];
  values: string[];
  calldatas: string[];
  snapshot: string;
  deadline: string;
  created: SourceEvent;
  canceled?: SourceEvent;
  executed?: SourceEvent;
  votes: [bigint, bigint, bigint];
  operation?: Operation;
}
export interface Vote {
  proposal: Proposal;
  voter: string;
  support: number;
  weight: string;
  reason: string;
  params: string;
  source: SourceEvent;
}
export interface Operation {
  id: string;
  proposal: Proposal;
  predecessor: string;
  salt: string;
  queuedAt: string;
  eta: string;
  queued: SourceEvent;
  scheduled: SourceEvent;
  executed?: SourceEvent;
  canceled?: SourceEvent;
}
export interface Transfer {
  source: SourceEvent;
  from: string;
  to: string;
  amount: string;
}
export interface Disbursement {
  source: SourceEvent;
  transfer: Transfer;
  proposal: Proposal;
  operation: Operation;
}
export interface Model {
  proposals: Proposal[];
  votes: Vote[];
  operations: Operation[];
  transfers: Transfer[];
  disbursements: Disbursement[];
  totalIn: bigint;
  totalOut: bigint;
  balance: bigint;
}

export function requireProjection(condition: unknown, message: string): asserts condition {
  if (!condition) throw new IndexerError('PROJECTION_INCOMPLETE', message);
}
function str(e: SourceEvent, key: string): string {
  const value = e.payload[key];
  requireProjection(typeof value === 'string', `${e.name}: invalid ${key}.`);
  return value;
}
function array(e: SourceEvent, key: string): string[] {
  const value = e.payload[key];
  requireProjection(Array.isArray(value) && value.every((v) => typeof v === 'string'), `${e.name}: invalid ${key}.`);
  return value as string[];
}
function one<T>(values: T[], message: string): T {
  requireProjection(values.length === 1, message);
  return values[0]!;
}
function sameTx(a: SourceEvent, b: SourceEvent): boolean {
  return a.tx === b.tx && a.blockHash === b.blockHash;
}
function before(a: SourceEvent, b: SourceEvent): boolean {
  return BigInt(a.block) < BigInt(b.block) || (a.block === b.block && BigInt(a.logIndex) < BigInt(b.logIndex));
}

/** OZ 5.4.0 bytes20(address(this)) ^ descriptionHash: right-pad the address. */
export function timelockSalt(governor: string, descriptionHash: string): string {
  return '0x' + (BigInt(governor + '0'.repeat(24)) ^ BigInt(descriptionHash)).toString(16).padStart(64, '0');
}
export function operationId(
  p: Pick<Proposal, 'targets' | 'values' | 'calldatas' | 'descriptionHash'>,
  governor: string,
): string {
  return keccak256(
    coder.encode(
      ['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'],
      [p.targets, p.values, p.calldatas, ZeroHash, timelockSalt(governor, p.descriptionHash)],
    ),
  );
}

// Known administrative events may coexist with the BE03 business ABI subset.
// Validate their complete encoding. Arbitrary unknown topics still stop publication.
const ancillary: Partial<Record<ContractRole, Interface>> = {
  governor: new Interface([
    'event VotingDelaySet(uint256 oldVotingDelay,uint256 newVotingDelay)',
    'event VotingPeriodSet(uint256 oldVotingPeriod,uint256 newVotingPeriod)',
    'event ProposalThresholdSet(uint256 oldProposalThreshold,uint256 newProposalThreshold)',
    'event QuorumNumeratorUpdated(uint256 oldQuorumNumerator,uint256 newQuorumNumerator)',
    'event TimelockChange(address oldTimelock,address newTimelock)',
  ]),
  treasury: new Interface([
    'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
  ]),
  timelock: new Interface([
    'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
    'event MinDelayChange(uint256 oldDuration,uint256 newDuration)',
  ]),
  budget_token: new Interface(['event Approval(address indexed owner,address indexed spender,uint256 value)']),
};
export function classify(log: NormalizedLog): ReturnType<typeof decodeLog> | null {
  const decoded = decodeLog(log);
  if (decoded.status !== 'unknown_topic') return decoded;
  try {
    const abi = ancillary[log.contract.role]!;
    const parsed = abi.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) return decoded;
    const encoded = abi.encodeEventLog(parsed.fragment, parsed.args);
    if (
      encoded.data.toLowerCase() === log.data &&
      JSON.stringify(encoded.topics.map((t) => t.toLowerCase())) === JSON.stringify(log.topics)
    )
      return null;
  } catch {
    /* Unknown or malformed ancillary events cannot be silently skipped. */
  }
  return decoded;
}

/** Pure deterministic replay; callers supply canonical source order, never DB insertion order. */
export function buildModel(events: SourceEvent[], treasury: string, governor: string): Model {
  const byId = new Map<string, Proposal>();
  const used = new Set<string>();
  const mark = (e: SourceEvent) => {
    requireProjection(!used.has(e.id), 'Source event matched more than once.');
    used.add(e.id);
  };
  const find = (e: SourceEvent) => {
    const p = byId.get(str(e, 'proposalId'));
    requireProjection(p && before(p.created, e), 'Proposal event is missing its earlier ProposalCreated.');
    return p;
  };
  const transfers: Transfer[] = [];
  for (const e of events) {
    if (e.role === 'budget_token' && e.name === 'Transfer') {
      const from = str(e, 'from'),
        to = str(e, 'to'),
        amount = str(e, 'value');
      if (from === treasury || to === treasury) transfers.push({ source: e, from, to, amount });
      mark(e);
    } else if (e.role === 'governor' && e.name === 'ProposalCreated') {
      const targets = array(e, 'targets'),
        values = array(e, 'values'),
        calldatas = array(e, 'calldatas');
      requireProjection(
        targets.length === 1 &&
          targets[0] === treasury &&
          values.length === 1 &&
          values[0] === '0' &&
          calldatas.length === 1 &&
          array(e, 'signatures').length === 1 &&
          array(e, 'signatures')[0] === '',
        'Proposal action is outside BudgetGovernor scope.',
      );
      let args;
      try {
        args = treasuryAbi.decodeFunctionData('disburse', calldatas[0]!);
      } catch {
        throw new IndexerError('PROJECTION_INCOMPLETE', 'Proposal calldata is not disburse.');
      }
      const [requestId, recipient, amount] = [
        String(args[0]).toLowerCase(),
        String(args[1]).toLowerCase(),
        String(args[2]),
      ];
      requireProjection(
        treasuryAbi.encodeFunctionData('disburse', args).toLowerCase() === calldatas[0] &&
          recipient !== ZeroAddress &&
          recipient !== treasury &&
          BigInt(amount) > 0n,
        'Proposal calldata is noncanonical or invalid.',
      );
      const description = str(e, 'description'),
        descriptionHash = keccak256(toUtf8Bytes(description));
      const id = BigInt(
        keccak256(
          coder.encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32'], [targets, values, calldatas, descriptionHash]),
        ),
      ).toString();
      requireProjection(
        id === str(e, 'proposalId') && !byId.has(id),
        'Proposal ID/hash mismatch or duplicate creation.',
      );
      const snapshot = str(e, 'voteStart'),
        deadline = str(e, 'voteEnd');
      requireProjection(
        BigInt(snapshot) >= BigInt(e.timestamp) && BigInt(deadline) >= BigInt(snapshot),
        'Invalid proposal clock boundaries.',
      );
      byId.set(id, {
        id,
        requestId,
        proposer: str(e, 'proposer'),
        recipient,
        amount,
        description,
        descriptionHash,
        targets,
        values,
        calldatas,
        snapshot,
        deadline,
        created: e,
        votes: [0n, 0n, 0n],
      });
      mark(e);
    }
  }
  const votes: Vote[] = [],
    operations: Operation[] = [];
  const voters = new Set<string>();
  for (const e of events) {
    if (e.role !== 'governor' || e.name === 'ProposalCreated') continue;
    const p = find(e);
    if (e.name === 'VoteCast' || e.name === 'VoteCastWithParams') {
      const voter = str(e, 'voter'),
        support = Number(str(e, 'support')),
        weight = str(e, 'weight');
      const key = `${p.id}:${voter}`;
      requireProjection(
        [0, 1, 2].includes(support) &&
          !voters.has(key) &&
          !p.canceled &&
          !p.executed &&
          BigInt(e.timestamp) > BigInt(p.snapshot) &&
          BigInt(e.timestamp) <= BigInt(p.deadline),
        'Duplicate vote or vote outside Active window.',
      );
      voters.add(key);
      p.votes[support as 0 | 1 | 2] += BigInt(weight);
      votes.push({
        proposal: p,
        voter,
        support,
        weight,
        reason: str(e, 'reason'),
        params: e.name === 'VoteCastWithParams' ? str(e, 'params') : '0x',
        source: e,
      });
    } else if (e.name === 'ProposalQueued') {
      requireProjection(
        !p.operation && !p.canceled && !p.executed && BigInt(e.timestamp) > BigInt(p.deadline),
        'Invalid queue event.',
      );
      const id = operationId(p, governor),
        salt = timelockSalt(governor, p.descriptionHash);
      const scheduled = one(
        events.filter(
          (s) => s.role === 'timelock' && s.name === 'CallScheduled' && sameTx(s, e) && str(s, 'id') === id,
        ),
        'Queue must match exactly one CallScheduled in the same transaction.',
      );
      requireProjection(
        before(scheduled, e) &&
          str(scheduled, 'index') === '0' &&
          str(scheduled, 'target') === treasury &&
          str(scheduled, 'value') === '0' &&
          str(scheduled, 'data') === p.calldatas[0] &&
          str(scheduled, 'predecessor') === ZeroHash &&
          BigInt(str(e, 'etaSeconds')) === BigInt(e.timestamp) + BigInt(str(scheduled, 'delay')),
        'Scheduled operation/calldata/ETA mismatch.',
      );
      const salts = events.filter(
        (s) => s.role === 'timelock' && s.name === 'CallSalt' && sameTx(s, e) && str(s, 'id') === id,
      );
      requireProjection(
        salts.length === (salt === ZeroHash ? 0 : 1) && salts.every((s) => str(s, 'salt') === salt && before(s, e)),
        'Timelock CallSalt mismatch.',
      );
      salts.forEach(mark);
      mark(scheduled);
      const op: Operation = {
        id,
        proposal: p,
        predecessor: ZeroHash,
        salt,
        queuedAt: e.timestamp,
        eta: str(e, 'etaSeconds'),
        queued: e,
        scheduled,
      };
      p.operation = op;
      operations.push(op);
    } else if (e.name === 'ProposalExecuted') {
      requireProjection(
        p.operation &&
          !p.executed &&
          !p.canceled &&
          !p.operation.canceled &&
          BigInt(e.timestamp) >= BigInt(p.operation.eta),
        'Execute without a ready operation.',
      );
      const execution = one(
        events.filter(
          (s) => s.role === 'timelock' && s.name === 'CallExecuted' && sameTx(s, e) && str(s, 'id') === p.operation!.id,
        ),
        'Execution must match exactly one CallExecuted.',
      );
      requireProjection(
        before(p.operation.queued, e) &&
          before(execution, e) &&
          str(execution, 'index') === '0' &&
          str(execution, 'target') === treasury &&
          str(execution, 'value') === '0' &&
          str(execution, 'data') === p.calldatas[0],
        'Executed operation calldata mismatch.',
      );
      p.executed = e;
      p.operation.executed = execution;
      mark(execution);
    } else if (e.name === 'ProposalCanceled') {
      requireProjection(!p.canceled && !p.executed, 'Conflicting proposal cancellation.');
      p.canceled = e;
    } else throw new IndexerError('PROJECTION_INCOMPLETE', 'Unsupported governor business event.');
    mark(e);
  }
  for (const e of events.filter((e) => e.role === 'timelock' && e.name === 'Cancelled')) {
    const op = one(
      operations.filter((o) => o.id === str(e, 'id')),
      'Cancelled operation has no matching proposal.',
    );
    requireProjection(!op.executed && !op.canceled && before(op.queued, e), 'Conflicting operation cancellation.');
    op.canceled = e;
    mark(e);
  }
  // Cancellation is checked after all governor events because Timelock emits first.
  for (const op of operations)
    requireProjection(
      !(op.executed && op.canceled) &&
        (!op.proposal.canceled || (op.canceled && sameTx(op.proposal.canceled, op.canceled))),
      'Queued cancellation has inconsistent receipts.',
    );
  const disbursements: Disbursement[] = [],
    paid = new Set<string>(),
    linked = new Set<string>();
  for (const e of events.filter((e) => e.role === 'treasury' && e.name === 'BudgetDisbursed')) {
    const request = str(e, 'requestId'),
      recipient = str(e, 'recipient'),
      amount = str(e, 'amount');
    requireProjection(!paid.has(request), 'requestId was paid more than once.');
    const p = one(
      [...byId.values()].filter(
        (p) =>
          p.executed &&
          sameTx(p.executed, e) &&
          p.requestId === request &&
          p.recipient === recipient &&
          p.amount === amount,
      ),
      'Disbursement must match an executed proposal in the same transaction.',
    );
    const op = p.operation!;
    requireProjection(before(e, op.executed!), 'Disbursement order differs from Timelock execution.');
    const transfer = one(
      transfers.filter(
        (t) =>
          sameTx(t.source, e) &&
          before(t.source, e) &&
          t.from === treasury &&
          t.to === recipient &&
          t.amount === amount &&
          !linked.has(t.source.id),
      ),
      'Disbursement Transfer is missing or ambiguous.',
    );
    paid.add(request);
    linked.add(transfer.source.id);
    disbursements.push({ source: e, transfer, proposal: p, operation: op });
    mark(e);
  }
  for (const p of byId.values())
    requireProjection(
      !p.executed || disbursements.filter((d) => d.proposal === p).length === 1,
      'Executed proposal is missing its payment.',
    );
  for (const e of events)
    requireProjection(used.has(e.id), 'Unmatched business event; projection cannot be published.');
  let totalIn = 0n,
    totalOut = 0n;
  for (const t of transfers) {
    if (t.from === t.to) continue;
    if (t.to === treasury) totalIn += BigInt(t.amount);
    else {
      totalOut += BigInt(t.amount);
      requireProjection(
        BigInt(t.amount) === 0n || linked.has(t.source.id),
        'Treasury outflow has no matching BudgetDisbursed.',
      );
    }
  }
  requireProjection(totalIn >= totalOut, 'Treasury flow balance is negative; deployment history is incomplete.');
  return {
    proposals: [...byId.values()],
    votes,
    operations,
    transfers,
    disbursements,
    totalIn,
    totalOut,
    balance: totalIn - totalOut,
  };
}

export type ProposalState = 'Pending' | 'Active' | 'Canceled' | 'Defeated' | 'Succeeded' | 'Queued' | 'Executed';
export interface Evaluated {
  state: ProposalState;
  quorum: bigint | null;
  operationStatus: 'Waiting' | 'Ready' | 'Done' | 'Canceled' | null;
}
export function evaluate(p: Proposal, clock: bigint, quorum: bigint | null): Evaluated {
  requireProjection(
    clock <= BigInt(p.snapshot) ? quorum === null : quorum !== null,
    'Quorum must be historical and unavailable until after snapshot.',
  );
  const op = p.operation;
  const operationStatus = !op
    ? null
    : op.executed
      ? 'Done'
      : op.canceled
        ? 'Canceled'
        : clock >= BigInt(op.eta)
          ? 'Ready'
          : 'Waiting';
  const state: ProposalState = p.executed
    ? 'Executed'
    : p.canceled || op?.canceled
      ? 'Canceled'
      : op
        ? 'Queued'
        : clock <= BigInt(p.snapshot)
          ? 'Pending'
          : clock <= BigInt(p.deadline)
            ? 'Active'
            : p.votes[1] + p.votes[2] >= quorum! && p.votes[1] > p.votes[0]
              ? 'Succeeded'
              : 'Defeated';
  return { state, quorum, operationStatus };
}
