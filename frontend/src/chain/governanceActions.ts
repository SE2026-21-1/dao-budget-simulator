import { decodeEventLog, encodeAbiParameters, keccak256, parseAbi, parseAbiParameters, stringToHex, toHex, type Abi, type Address, type Hex } from "viem";
import type { Proposal } from "../data/proposals";
import { governorAbi, originalActions, treasuryAbi } from "./transactions";

export type GovernanceAction = "vote" | "queue" | "execute" | "cancel";
export type ActionReceipt = {
  status: string;
  to: Address | null;
  blockNumber: bigint;
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[];
};

export interface GovernanceReads {
  state(proposalId: bigint, blockNumber?: bigint): Promise<number>;
  hasVoted(proposalId: bigint, account: Address, blockNumber?: bigint): Promise<boolean>;
  votingPower(account: Address, snapshot: bigint): Promise<bigint>;
  timestamp(): Promise<bigint>;
  role(contract: "timelock" | "treasury", role: Hex, account: Address): Promise<boolean>;
  operationState(operationId: Hex, blockNumber?: bigint): Promise<number>;
  operationTimestamp(operationId: Hex, blockNumber?: bigint): Promise<bigint>;
  proposalEta(proposalId: bigint, blockNumber?: bigint): Promise<bigint>;
  paid(requestId: Hex, blockNumber?: bigint): Promise<boolean>;
}

export type GovernanceAddresses = { governor: Address; treasury: Address; timelock: Address };
const timelockEvents = parseAbi([
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event CallSalt(bytes32 indexed id, bytes32 salt)",
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
]);
const proposerRole = keccak256(stringToHex("PROPOSER_ROLE"));
const executorRole = keccak256(stringToHex("EXECUTOR_ROLE"));
const spenderRole = keccak256(stringToHex("SPENDER_ROLE"));
const zeroHash = toHex(0n, { size: 32 });

export function operationForActions(actions: ReturnType<typeof originalActions>, governor: Address) {
  const salt = toHex((BigInt(governor) << 96n) ^ BigInt(actions[3]), { size: 32 });
  const id = keccak256(encodeAbiParameters(
    parseAbiParameters("address[], uint256[], bytes[], bytes32, bytes32"),
    [...actions.slice(0, 3), zeroHash, salt] as [Address[], bigint[], Hex[], Hex, Hex],
  ));
  return { id, salt };
}

export async function preflightGovernanceAction(
  kind: GovernanceAction, proposal: Proposal, account: Address, support: string,
  addresses: GovernanceAddresses, reads: GovernanceReads,
) {
  const actions = originalActions(proposal, addresses.treasury);
  const proposalId = BigInt(proposal.proposalId);
  const expectedState = { vote: 1, queue: 4, execute: 5, cancel: 0 }[kind];
  if (await reads.state(proposalId) !== expectedState) throw new Error("Trạng thái on-chain đã thay đổi. Tải dữ liệu mới nhất trước khi thao tác.");
  if (kind === "vote") {
    if (!["0", "1", "2"].includes(support)) throw new Error("Lựa chọn phiếu không hợp lệ.");
    if (await reads.hasVoted(proposalId, account)) throw new Error("Ví này đã bỏ phiếu cho proposal.");
    if (await reads.votingPower(account, BigInt(proposal.snapshot)) === 0n) throw new Error("Ví không có voting power tại snapshot.");
    return { functionName: "castVote" as const, args: [proposalId, Number(support)] as const };
  }
  if (kind === "cancel") {
    if (proposal.proposer.toLowerCase() !== account.toLowerCase()) throw new Error("Chỉ creator được hủy proposal Pending.");
    return { functionName: "cancel" as const, args: actions };
  }
  const operation = operationForActions(actions, addresses.governor);
  const role = kind === "queue" ? proposerRole : executorRole;
  if (!await reads.role("timelock", role, addresses.governor)) throw new Error("Governor thiếu quyền Timelock cho thao tác này.");
  const operationState = await reads.operationState(operation.id);
  if (kind === "queue") {
    if (operationState !== 0) throw new Error("Timelock operation đã tồn tại; tải dữ liệu mới nhất.");
    return { functionName: "queue" as const, args: actions };
  }
  if (operationState !== 2) throw new Error("Timelock operation chưa Ready để execute.");
  const [timestamp, eta, onChainEta, spender, paid] = await Promise.all([
    reads.timestamp(), reads.operationTimestamp(operation.id), reads.proposalEta(proposalId),
    reads.role("treasury", spenderRole, addresses.timelock), reads.paid(proposal.requestId as Hex),
  ]);
  if (eta === 0n || eta !== onChainEta || timestamp < eta) throw new Error("ETA Timelock chưa đến hoặc không khớp Governor.");
  if (!spender) throw new Error("Timelock thiếu quyền giải ngân Treasury.");
  if (paid) throw new Error("Request ID đã được Treasury thanh toán.");
  return { functionName: "execute" as const, args: actions };
}

function hasEvent(receipt: ActionReceipt, emitter: Address, abi: Abi, name: string, matches: (args: Record<string, unknown>) => boolean) {
  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== emitter.toLowerCase()) return false;
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      return event.eventName === name && event.args !== undefined && !Array.isArray(event.args) && matches(event.args as unknown as Record<string, unknown>);
    } catch { return false; }
  });
}

export async function verifyGovernanceOutcome(
  kind: GovernanceAction, proposal: Proposal, account: Address, support: string,
  addresses: GovernanceAddresses, reads: GovernanceReads, receipt: ActionReceipt,
) {
  if (receipt.status !== "success") throw new Error("Giao dịch đã lên chain nhưng bị revert.");
  if (receipt.to?.toLowerCase() !== addresses.governor.toLowerCase()) throw new Error("Receipt không thuộc Governor đã cấu hình.");
  const proposalId = BigInt(proposal.proposalId);
  const block = receipt.blockNumber;
  const actions = originalActions(proposal, addresses.treasury);
  const operation = operationForActions(actions, addresses.governor);
  const governorEvent = (name: string, match: (args: Record<string, unknown>) => boolean) =>
    hasEvent(receipt, addresses.governor, governorAbi, name, match);
  const timelockEvent = (name: string, match: (args: Record<string, unknown>) => boolean) =>
    hasEvent(receipt, addresses.timelock, timelockEvents, name, match);
  const sameId = (args: Record<string, unknown>) => args.proposalId === proposalId;
  if (kind === "vote") {
    let weight = 0n;
    if (!governorEvent("VoteCast", (args) => {
      if (!sameId(args) || String(args.voter).toLowerCase() !== account.toLowerCase() || args.support !== Number(support)) return false;
      weight = args.weight as bigint;
      return weight > 0n;
    }))
      throw new Error("Receipt thiếu VoteCast khớp ví, proposal và lựa chọn phiếu.");
    const [state, voted, power] = await Promise.all([
      reads.state(proposalId, block), reads.hasVoted(proposalId, account, block),
      reads.votingPower(account, BigInt(proposal.snapshot)),
    ]);
    if (state !== 1 || !voted || power !== weight) throw new Error("Governor chưa ghi nhận phiếu hoặc weight không khớp snapshot tại block receipt.");
    return;
  }
  if (kind === "cancel") {
    if (!governorEvent("ProposalCanceled", sameId) || await reads.state(proposalId, block) !== 2)
      throw new Error("Receipt hoặc trạng thái Governor không xác nhận cancel.");
    return;
  }
  if (kind === "queue") {
    let eta = 0n;
    if (!governorEvent("ProposalQueued", (args) => { if (!sameId(args)) return false; eta = args.etaSeconds as bigint; return eta > 0n; }) ||
        !timelockEvent("CallScheduled", (args) => args.id === operation.id && args.index === 0n && String(args.target).toLowerCase() === addresses.treasury.toLowerCase() && args.value === 0n && args.data === actions[2][0] && args.predecessor === zeroHash) ||
        !timelockEvent("CallSalt", (args) => args.id === operation.id && args.salt === operation.salt))
      throw new Error("Receipt thiếu sự kiện Queue/Timelock khớp payload.");
    const [state, chainEta, scheduledEta, operationState] = await Promise.all([
      reads.state(proposalId, block), reads.proposalEta(proposalId, block),
      reads.operationTimestamp(operation.id, block), reads.operationState(operation.id, block),
    ]);
    if (state !== 5 || chainEta !== eta || scheduledEta !== eta || ![1, 2].includes(operationState))
      throw new Error("Governor hoặc Timelock chưa ghi nhận Queue tại block receipt.");
    return;
  }
  if (!governorEvent("ProposalExecuted", sameId) ||
      !timelockEvent("CallExecuted", (args) => args.id === operation.id && args.index === 0n && String(args.target).toLowerCase() === addresses.treasury.toLowerCase() && args.value === 0n && args.data === actions[2][0]) ||
      !hasEvent(receipt, addresses.treasury, treasuryAbi, "BudgetDisbursed", (args) => args.requestId === proposal.requestId && String(args.recipient).toLowerCase() === proposal.recipient.toLowerCase() && args.amount === BigInt(proposal.amount)))
    throw new Error("Receipt thiếu sự kiện Execute/giải ngân khớp payload.");
  const [state, operationState, paid] = await Promise.all([
    reads.state(proposalId, block), reads.operationState(operation.id, block), reads.paid(proposal.requestId as Hex, block),
  ]);
  if (state !== 7 || operationState !== 3 || !paid)
    throw new Error("Governor, Timelock hoặc Treasury chưa xác nhận Execute tại block receipt.");
}
