import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, type Address, type Hex } from "viem";
import type { Proposal } from "../data/proposals";
import { operationForActions, preflightGovernanceAction, verifyGovernanceOutcome, type ActionReceipt, type GovernanceAction, type GovernanceReads } from "./governanceActions";
import { governorAbi, originalActions } from "./transactions";
import sc06 from "./sc06-v1.vectors.json";

const addresses = { governor: sc06.governor as Address, treasury: sc06.treasury as Address, timelock: sc06.timelock as Address };
const voter = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
const outsider = "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f" as Address;
const eta = 1800000486n;

function proposal(index: number): Proposal {
  const v = sc06.proposals[index];
  return {
    proposalId: v.proposalId, requestId: v.requestId, title: null, body: null,
    description: v.description, descriptionHash: v.descriptionHash, targets: [sc06.treasury],
    values: ["0"], calldatas: [v.calldata], recipient: v.recipient, amount: v.amount,
    proposer: voter, state: index === 0 ? "Active" : "Pending", snapshot: "1800000065", deadline: "1800000365",
  };
}

function fixtureReceipt(index: number, kind: string): ActionReceipt {
  const receipts = sc06.proposals[index].receipts as unknown as Record<string, {
    status: string; to: string; blockNumber: string;
    logs: { address: string; data: string; topics: string[] }[];
  }>;
  const raw = receipts[kind];
  if (!raw) throw new Error(`Missing SC06 receipt: ${kind}`);
  return {
    status: raw.status === "0x1" ? "success" : "reverted",
    to: raw.to as Address, blockNumber: BigInt(raw.blockNumber),
    logs: raw.logs.map((log) => ({ address: log.address as Address, data: log.data as Hex, topics: log.topics as Hex[] })),
  };
}

function fakeReads(kind: GovernanceAction, overrides: Partial<GovernanceReads> = {}): GovernanceReads {
  const before = { vote: 1, queue: 4, execute: 5, cancel: 0 }[kind];
  const after = { vote: 1, queue: 5, execute: 7, cancel: 2 }[kind];
  return {
    state: vi.fn(async (_id, block) => block === undefined ? before : after),
    hasVoted: vi.fn(async (_id, _account, block) => block !== undefined),
    votingPower: vi.fn(async () => 400n * 10n ** 18n),
    timestamp: vi.fn(async () => eta + 1n),
    role: vi.fn(async () => true),
    operationState: vi.fn(async (_id, block) => block === undefined ? (kind === "execute" ? 2 : 0) : (kind === "execute" ? 3 : 1)),
    operationTimestamp: vi.fn(async () => eta),
    proposalEta: vi.fn(async () => eta),
    paid: vi.fn(async (_id, block) => block !== undefined && kind === "execute"),
    ...overrides,
  };
}

describe("SC06 governance action preflight", () => {
  it("uses snapshot voting power, hasVoted and uint256 proposalId for Vote", async () => {
    const p = proposal(0);
    const reads = fakeReads("vote");
    const action = await preflightGovernanceAction("vote", p, voter, "1", addresses, reads);
    expect(action).toEqual({ functionName: "castVote", args: [BigInt(p.proposalId), 1] });
    expect(encodeFunctionData({ abi: governorAbi, functionName: "castVote", args: [BigInt(p.proposalId), 1] })).toBe(sc06.proposals[0].inputs.voteA);
    expect(reads.votingPower).toHaveBeenCalledWith(voter, BigInt(p.snapshot));
    expect(reads.hasVoted).toHaveBeenCalledWith(BigInt(p.proposalId), voter);
    await expect(preflightGovernanceAction("vote", p, voter, "1", addresses, fakeReads("vote", { hasVoted: async () => true }))).rejects.toThrow(/đã bỏ phiếu/);
    await expect(preflightGovernanceAction("vote", p, voter, "1", addresses, fakeReads("vote", { votingPower: async () => 0n }))).rejects.toThrow(/snapshot/);
    await expect(preflightGovernanceAction("vote", p, voter, "3", addresses, fakeReads("vote"))).rejects.toThrow(/phiếu/);
  });

  it.each(["vote", "queue", "execute", "cancel"] as const)("rejects stale on-chain state for %s", async (kind) => {
    const p = proposal(kind === "cancel" ? 1 : 0);
    await expect(preflightGovernanceAction(kind, p, voter, "1", addresses, fakeReads(kind, { state: async () => 3 }))).rejects.toThrow(/Trạng thái on-chain/);
  });

  it("allows only the Pending creator to Cancel", async () => {
    const p = proposal(1);
    expect((await preflightGovernanceAction("cancel", p, voter, "1", addresses, fakeReads("cancel"))).functionName).toBe("cancel");
    await expect(preflightGovernanceAction("cancel", p, outsider, "1", addresses, fakeReads("cancel"))).rejects.toThrow(/creator/);
  });

  it("checks Governor Timelock role and operation availability before Queue", async () => {
    const p = proposal(0);
    const reads = fakeReads("queue");
    expect((await preflightGovernanceAction("queue", p, voter, "1", addresses, reads)).functionName).toBe("queue");
    expect(reads.role).toHaveBeenCalledWith("timelock", expect.any(String), addresses.governor);
    await expect(preflightGovernanceAction("queue", p, voter, "1", addresses, fakeReads("queue", { role: async () => false }))).rejects.toThrow(/thiếu quyền Timelock/);
    await expect(preflightGovernanceAction("queue", p, voter, "1", addresses, fakeReads("queue", { operationState: async () => 1 }))).rejects.toThrow(/đã tồn tại/);
  });

  it("checks Ready, Governor/Timelock ETA, spender role and unpaid request before Execute", async () => {
    const p = proposal(0);
    expect((await preflightGovernanceAction("execute", p, voter, "1", addresses, fakeReads("execute"))).functionName).toBe("execute");
    const rejects: [Partial<GovernanceReads>, RegExp][] = [
      [{ operationState: async () => 1 }, /chưa Ready/],
      [{ timestamp: async () => eta - 1n }, /ETA/],
      [{ proposalEta: async () => eta + 1n }, /ETA/],
      [{ operationTimestamp: async () => 0n }, /ETA/],
      [{ role: async (contract) => contract === "timelock" }, /quyền giải ngân/],
      [{ paid: async () => true }, /đã được Treasury thanh toán/],
    ];
    for (const [override, message] of rejects) {
      await expect(preflightGovernanceAction("execute", p, voter, "1", addresses, fakeReads("execute", override))).rejects.toThrow(message);
    }
  });
});

describe("SC06 raw receipts and on-chain confirmation", () => {
  it("matches the archived Timelock operationId", () => {
    const p = proposal(0);
    expect(operationForActions(originalActions(p, addresses.treasury), addresses.governor).id).toBe(sc06.proposals[0].operationId);
  });

  it.each(["voteA", "voteB"] as const)("verifies %s VoteCast receipt and pinned hasVoted", async (vote) => {
    const p = proposal(0);
    const account = vote === "voteA" ? voter : "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as Address;
    const receipt = fixtureReceipt(0, vote);
    const reads = fakeReads("vote", { votingPower: vi.fn(async () => (vote === "voteA" ? 400n : 300n) * 10n ** 18n) });
    await verifyGovernanceOutcome("vote", p, account, "1", addresses, reads, receipt);
    expect(reads.hasVoted).toHaveBeenCalledWith(BigInt(p.proposalId), account, receipt.blockNumber);
  });

  it("verifies Queue and Execute across Governor, Timelock and Treasury receipts", async () => {
    const p = proposal(0);
    const queued = fixtureReceipt(0, "queue");
    const queueReads = fakeReads("queue");
    await verifyGovernanceOutcome("queue", p, voter, "1", addresses, queueReads, queued);
    expect(queueReads.operationTimestamp).toHaveBeenCalledWith(sc06.proposals[0].operationId, queued.blockNumber);
    const executed = fixtureReceipt(0, "execute");
    const executeReads = fakeReads("execute");
    await verifyGovernanceOutcome("execute", p, voter, "1", addresses, executeReads, executed);
    expect(executeReads.paid).toHaveBeenCalledWith(p.requestId, executed.blockNumber);
  });

  it("verifies Pending Cancel without requiring a Timelock event", async () => {
    const p = proposal(1);
    await verifyGovernanceOutcome("cancel", p, voter, "1", addresses, fakeReads("cancel"), fixtureReceipt(1, "cancel"));
  });

  it("rejects reverted, wrong-emitter, missing-event and mismatched on-chain outcomes", async () => {
    const p = proposal(0);
    const receipt = fixtureReceipt(0, "execute");
    await expect(verifyGovernanceOutcome("execute", p, voter, "1", addresses, fakeReads("execute"), { ...receipt, status: "reverted" })).rejects.toThrow(/revert/);
    await expect(verifyGovernanceOutcome("execute", p, voter, "1", addresses, fakeReads("execute"), { ...receipt, to: addresses.treasury })).rejects.toThrow(/Governor/);
    await expect(verifyGovernanceOutcome("execute", p, voter, "1", addresses, fakeReads("execute"), { ...receipt, logs: [] })).rejects.toThrow(/Receipt thiếu/);
    await expect(verifyGovernanceOutcome("execute", p, voter, "1", addresses, fakeReads("execute"), {
      ...receipt, logs: receipt.logs.map((log) => log.address.toLowerCase() === addresses.governor.toLowerCase() ? { ...log, address: outsider } : log),
    })).rejects.toThrow(/Receipt thiếu/);
    await expect(verifyGovernanceOutcome("execute", p, voter, "1", addresses, fakeReads("execute", { paid: async () => false }), receipt)).rejects.toThrow(/chưa xác nhận/);
    const queue = fixtureReceipt(0, "queue");
    await expect(verifyGovernanceOutcome("queue", p, voter, "1", addresses, fakeReads("queue", { operationTimestamp: async () => eta + 1n }), queue)).rejects.toThrow(/chưa ghi nhận/);
    const vote = fixtureReceipt(0, "voteA");
    await expect(verifyGovernanceOutcome("vote", p, voter, "1", addresses, fakeReads("vote", { hasVoted: async () => false }), vote)).rejects.toThrow(/chưa ghi nhận/);
    await expect(verifyGovernanceOutcome("vote", p, voter, "1", addresses, fakeReads("vote", { votingPower: async () => 1n }), vote)).rejects.toThrow(/weight/);
  });
});
