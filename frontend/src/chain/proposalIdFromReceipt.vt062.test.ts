import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type AbiEvent, type Hex } from "viem";
import governorAbi from "../abi/BudgetGovernor.json";
import { proposalIdFromReceipt } from "./transactions";

const event = governorAbi.find((entry) => entry.type === "event" && entry.name === "ProposalCreated") as AbiEvent;
const proposalId = 987654321n;
const topics: readonly Hex[] = [encodeEventTopics({ abi: [event], eventName: "ProposalCreated" })[0] as Hex];
const data = encodeAbiParameters(event.inputs, [
  proposalId,
  "0x1111111111111111111111111111111111111111",
  ["0x2222222222222222222222222222222222222222"],
  [0n],
  [""],
  ["0x1234"],
  123n,
  456n,
  "A proposal fixture",
]);

describe("VT-062 actual Governor event decoder", () => {
  it("extracts the proposal ID from a log encoded with the repository ABI", () => {
    expect(proposalIdFromReceipt([{ topics, data }])).toBe("987654321");
  });

  it("returns null when the receipt has no matching event", () => {
    expect(proposalIdFromReceipt([])).toBeNull();
    expect(proposalIdFromReceipt([{ topics: ["0x1234"], data: "0x" }, { topics, data }])).toBe("987654321");
  });
});
