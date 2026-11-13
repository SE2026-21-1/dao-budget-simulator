/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeEventLog, encodeFunctionData, keccak256, toHex, type Address, type Hex } from "viem";
import { governorAbi, originalActions, proposalIdForActions, proposalIdFromReceipt, treasuryAbi } from "./transactions";
import { operationForActions } from "./governanceActions";
import governorShared from "../../../shared/abi/BudgetGovernor.json";
import treasuryShared from "../../../shared/abi/Treasury.json";
import timelockShared from "../../../shared/abi/TimelockController.json";
import type { Proposal } from "../data/proposals";

// Point this at a NEW run of scripts/generate_sc06_chain.mjs. That generator
// checks every transaction, receipt, log and pinned call against its real Anvil.
const runPath = process.env.SC06_LIVE_RUN;
type RawLog = { address: Address; data: Hex; topics: Hex[] };
type RawReceipt = { status: string; to: Address; blockNumber: Hex; blockHash: Hex; logs: RawLog[] };
type RawTx = { input: Hex; from: Address; to: Address; blockHash: Hex };
type RawProposal = {
  requestId: Hex; recipient: Address; amount: string; calldata: Hex;
  description: string; descriptionHash: Hex; proposalId: string; operationId: Hex; salt: Hex;
  transactions: Record<string, Hex>;
};
type Run = {
  generation: { sourceCommit: string }; verification: { liveRpcVerified: boolean };
  manifest: { contracts: Record<string, { address: Address }> };
  proposals: RawProposal[]; transactions: (RawTx & { hash: Hex })[];
  receipts: (RawReceipt & { transactionHash: Hex })[];
  calls: { to: Address; data: Hex; block: Hex; result: Hex }[];
  head: { number: Hex; hash: Hex };
};

describe.skipIf(!runPath)("TV3 against newly generated SC06 Anvil receipts", () => {
  let run: Run;
  let governor: Address;
  let treasury: Address;
  let timelock: Address;
  let transactions: Map<Hex, RawTx & { hash: Hex }>;
  let receipts: Map<Hex, RawReceipt & { transactionHash: Hex }>;
  beforeAll(() => {
    run = JSON.parse(readFileSync(runPath!, "utf8")) as Run;
    governor = run.manifest.contracts.Governor.address;
    treasury = run.manifest.contracts.Treasury.address;
    timelock = run.manifest.contracts.Timelock.address;
    transactions = new Map(run.transactions.map((tx) => [tx.hash, tx]));
    receipts = new Map(run.receipts.map((receipt) => [receipt.transactionHash, receipt]));
  });

  it("uses the merged SC06 ABI and deployment addresses", () => {
    expect(run.verification.liveRpcVerified).toBe(true);
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../../", import.meta.url), encoding: "utf8" }).trim();
    expect(run.generation.sourceCommit).toBe(sourceCommit);
    expect(governorAbi).toEqual(governorShared);
    expect(treasuryAbi).toEqual(treasuryShared);
    expect(run.proposals).toHaveLength(2);
    expect(run.head.number).toBe("0x1a");
    expect(governor.toLowerCase()).toBe("0x2706a171ecb68e0038378d40dd1d136361d0cb7d");
    expect(treasury.toLowerCase()).toBe("0x1eb835eb7beeee9e6bbfe08f16a2d2ef668204bd");
    expect(timelock.toLowerCase()).toBe("0x31a65c6d4eb07ad51e7afc890ac3b7be84df2ead");
  });

  for (const index of [0, 1]) {
    it(`matches Frontend calldata, IDs, receipt events and final state for proposal ${index + 1}`, () => {
      const raw = run.proposals[index];
      const proposal: Proposal = {
        proposalId: raw.proposalId, requestId: raw.requestId, title: null, body: null,
        description: raw.description, descriptionHash: raw.descriptionHash,
        targets: [treasury], values: ["0"], calldatas: [raw.calldata],
        recipient: raw.recipient, amount: raw.amount, proposer: transactions.get(raw.transactions.create)!.from,
        state: index === 0 ? "Executed" : "Canceled", snapshot: "1", deadline: "2",
      };
      const actions = originalActions(proposal, treasury);
      expect(keccak256(toHex(raw.description))).toBe(raw.descriptionHash);
      expect(proposalIdForActions(actions[0], actions[1], actions[2], actions[3])).toBe(raw.proposalId);
      expect(operationForActions(actions, governor)).toEqual({ id: raw.operationId, salt: raw.salt });
      expect(encodeFunctionData({ abi: treasuryAbi, functionName: "disburse", args: [raw.requestId, raw.recipient, BigInt(raw.amount)] })).toBe(raw.calldata);

      const expected: Record<string, Hex> = {
        create: encodeFunctionData({ abi: governorAbi, functionName: "propose", args: [...actions.slice(0, 3), raw.description] }),
        ...(index === 0 ? {
          voteA: encodeFunctionData({ abi: governorAbi, functionName: "castVote", args: [BigInt(raw.proposalId), 1] }),
          voteB: encodeFunctionData({ abi: governorAbi, functionName: "castVote", args: [BigInt(raw.proposalId), 1] }),
          queue: encodeFunctionData({ abi: governorAbi, functionName: "queue", args: actions }),
          execute: encodeFunctionData({ abi: governorAbi, functionName: "execute", args: actions }),
        } : { cancel: encodeFunctionData({ abi: governorAbi, functionName: "cancel", args: actions }) }),
      };
      expect(Object.keys(raw.transactions).sort()).toEqual(Object.keys(expected).sort());
      for (const [kind, hash] of Object.entries(raw.transactions)) {
        const tx = transactions.get(hash);
        const receipt = receipts.get(hash);
        expect(tx?.input, `${kind} calldata`).toBe(expected[kind]);
        expect(tx?.to.toLowerCase(), `${kind} target`).toBe(governor.toLowerCase());
        expect(receipt?.status, `${kind} receipt`).toBe("0x1");
        expect(receipt?.blockHash).toBe(tx?.blockHash);
      }
      const created = receipts.get(raw.transactions.create)!;
      expect(proposalIdFromReceipt(created.logs, governor, raw.proposalId)).toBe(raw.proposalId);
      const createdEvent = created.logs.map((log) => {
        if (log.address.toLowerCase() !== governor.toLowerCase()) return null;
        try { return decodeEventLog({ abi: governorAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }); }
        catch { return null; }
      }).find((event) => event?.eventName === "ProposalCreated");
      expect(createdEvent?.args).toMatchObject({ proposalId: BigInt(raw.proposalId), description: raw.description });

      const callResult = (to: Address, data: Hex) => run.calls.find((call) =>
        call.to.toLowerCase() === to.toLowerCase() && call.data === data && call.block === run.head.number)?.result;
      const stateData = encodeFunctionData({ abi: governorAbi, functionName: "state", args: [BigInt(raw.proposalId)] });
      const timestampData = encodeFunctionData({ abi: timelockShared, functionName: "getTimestamp", args: [raw.operationId] });
      const paidData = encodeFunctionData({ abi: treasuryAbi, functionName: "paidRequests", args: [raw.requestId] });
      expect(BigInt(callResult(governor, stateData)!), "Governor final state").toBe(index === 0 ? 7n : 2n);
      expect(BigInt(callResult(timelock, timestampData)!), "Timelock final timestamp").toBe(index === 0 ? 1n : 0n);
      expect(BigInt(callResult(treasury, paidData)!), "Treasury paid request").toBe(index === 0 ? 1n : 0n);

      if (index === 0) {
        const queued = receipts.get(raw.transactions.queue)!;
        const executed = receipts.get(raw.transactions.execute)!;
        const event = (logs: RawLog[], name: string) => logs.map((log) => {
          if (log.address.toLowerCase() !== timelock.toLowerCase()) return null;
          try { return decodeEventLog({ abi: timelockShared, data: log.data, topics: log.topics as [Hex, ...Hex[]] }); }
          catch { return null; }
        }).find((decoded) => decoded?.eventName === name);
        expect(event(queued.logs, "CallScheduled")?.args).toMatchObject({ id: raw.operationId, target: treasury, data: raw.calldata });
        expect(event(queued.logs, "CallSalt")?.args).toMatchObject({ id: raw.operationId, salt: raw.salt });
        expect(event(executed.logs, "CallExecuted")?.args).toMatchObject({ id: raw.operationId, target: treasury, data: raw.calldata });
      } else {
        expect(raw.transactions.cancel).toBeDefined();
      }
    });
  }
});
