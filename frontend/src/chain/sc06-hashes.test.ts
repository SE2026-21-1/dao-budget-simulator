import { describe, expect, it } from "vitest";
import {
  decodeFunctionData, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi,
  parseAbiParameters, stringToHex, toHex, type Address, type Hex,
} from "viem";
import sc06 from "./sc06-v1.vectors.json";

// Independent oracle: calculate from TV1's archived values without importing
// Frontend transaction helpers or relying on the projected API model.
const disburseAbi = parseAbi(["function disburse(bytes32 requestId, address recipient, uint256 amount)"]);
const governorAbi = parseAbi([
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
  "function cancel(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
]);
const zeroHash = `0x${"0".repeat(64)}` as Hex;

describe("SC06 independent ABI and hash oracle", () => {
  for (const [index, vector] of sc06.proposals.entries()) {
    it(`matches TV1 proposal ${index + 1}: description, request, proposal and operation hashes`, () => {
      const targets: Address[] = [sc06.treasury as Address];
      const values = [0n];
      const calldatas: Hex[] = [vector.calldata as Hex];
      const descriptionHash = keccak256(stringToHex(vector.description));
      const calldata = encodeFunctionData({ abi: disburseAbi, functionName: "disburse", args: [vector.requestId as Hex, vector.recipient as Address, BigInt(vector.amount)] });
      expect(calldata).toBe(vector.calldata);
      expect(calldata.slice(0, 10)).toBe("0x6664ac91");
      expect(calldata.length).toBe(202);
      expect(descriptionHash).toBe(vector.descriptionHash);

      const proposalId = BigInt(keccak256(encodeAbiParameters(
        parseAbiParameters("address[], uint256[], bytes[], bytes32"),
        [targets, values, calldatas, descriptionHash],
      ))).toString();
      expect(proposalId).toBe(vector.proposalId);
      expect(proposalId).not.toBe(BigInt(vector.requestId).toString());

      // GovernorTimelockControl salts the operation with its 20-byte address.
      const salt = toHex((BigInt(sc06.governor) << 96n) ^ BigInt(descriptionHash), { size: 32 });
      const operationId = keccak256(encodeAbiParameters(
        parseAbiParameters("address[], uint256[], bytes[], bytes32, bytes32"),
        [targets, values, calldatas, zeroHash, salt],
      ));
      expect(salt).toBe(vector.salt);
      expect(operationId).toBe(vector.operationId);
      expect(operationId).not.toBe(descriptionHash);

      const create = encodeFunctionData({ abi: governorAbi, functionName: "propose", args: [targets, values, calldatas, vector.description] });
      expect(create).toBe(vector.inputs.create);
      const decodedCreate = decodeFunctionData({ abi: governorAbi, data: vector.inputs.create as Hex });
      expect(decodedCreate.args?.[3]).toBe(vector.description);

      const events = vector.events as { eventName: string; payload: Record<string, unknown> }[];
      if (index === 0) {
        const actionArgs = [targets, values, calldatas, descriptionHash] as const;
        expect(encodeFunctionData({ abi: governorAbi, functionName: "queue", args: actionArgs })).toBe(vector.inputs.queue);
        expect(encodeFunctionData({ abi: governorAbi, functionName: "execute", args: actionArgs })).toBe(vector.inputs.execute);
        for (const kind of ["queue", "execute"] as const) {
          const decoded = decodeFunctionData({ abi: governorAbi, data: vector.inputs[kind] as Hex });
          expect(decoded.functionName).toBe(kind);
          expect(decoded.args?.[0]?.[0].toLowerCase()).toBe(sc06.treasury.toLowerCase());
          expect(decoded.args?.[1]).toEqual([0n]);
          expect(decoded.args?.[2]).toEqual([vector.calldata]);
          expect(decoded.args?.[3]).toBe(descriptionHash);
        }
        const scheduled = events.find((event) => event.eventName === "CallScheduled")?.payload;
        const callSalt = events.find((event) => event.eventName === "CallSalt")?.payload;
        const queued = events.find((event) => event.eventName === "ProposalQueued")?.payload;
        const executed = events.find((event) => event.eventName === "ProposalExecuted")?.payload;
        const paid = events.find((event) => event.eventName === "BudgetDisbursed")?.payload;
        expect(scheduled).toMatchObject({ id: operationId, data: calldata, predecessor: zeroHash, value: "0" });
        expect(callSalt).toMatchObject({ id: operationId, salt });
        expect(queued).toMatchObject({ proposalId });
        expect(executed).toMatchObject({ proposalId });
        expect(paid).toMatchObject({ requestId: vector.requestId, amount: vector.amount });
        expect(events.some((event) => event.eventName === "CallExecuted" && event.payload.id === operationId)).toBe(true);
      } else {
        expect(encodeFunctionData({ abi: governorAbi, functionName: "cancel", args: [targets, values, calldatas, descriptionHash] })).toBe(vector.inputs.cancel);
        expect(events).toEqual([{ eventName: "ProposalCanceled", payload: { proposalId } }]);
      }
    });
  }
});
