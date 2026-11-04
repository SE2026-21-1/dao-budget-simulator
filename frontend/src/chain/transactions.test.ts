import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, formatUnits, keccak256, toHex, type Address, type Hex, type TransactionReceipt } from "viem";
import { buildProposal, governorAbi, originalActions, parseBUD, proposalIdForActions, proposalIdFromReceipt, transactionErrorMessage, treasuryAbi, UINT256_MAX, validateProposalForm, waitForReceipt } from "./transactions";
import { formatBUD } from "../data/formatBUD";
import sc01 from "../../../fixtures/sc01/disbursement-v1.json";
import sc06 from "./sc06-v1.vectors.json";
import type { Proposal } from "../data/proposals";

const treasury = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const requestId = "0x0101010101010101010101010101010101010101010101010101010101010101";

describe("proposal payload", () => {
  it("matches the SC01 calldata and exact description hash", () => {
    const payload = buildProposal("Demo chi ngan sach", "De xuat chi 1000 BUD cho hoat dong DAO.", recipient, "1000", requestId, treasury);
    expect(payload.targets).toEqual([treasury]);
    expect(payload.values).toEqual([0n]);
    expect(payload.calldatas[0]).toBe("0x6664ac910101010101010101010101010101010101010101010101010101010101010101000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000003635c9adc5dea00000");
    expect(keccak256(toHex(payload.description))).toBe("0xba0c4c61001e9366c859ea2e73077299660674c7dd4ff7aa92d93fb9449911aa");
  });

  it("rejects invalid recipients and fractional precision", () => {
    expect(validateProposalForm("Valid title", "A description that is long enough", treasury, "1", treasury)).toMatch(/Địa chỉ/);
    expect(validateProposalForm("Valid title", "A description that is long enough", recipient, "0.0000000000000000001", treasury)).toMatch(/18/);
    expect(validateProposalForm("Valid title", "A description that is long enough", recipient, "0", treasury)).toMatch(/lớn hơn 0/);
  });

  it("keeps raw Unicode and whitespace in the submitted description", () => {
    const title = "  Chi tiêu 🌿  ";
    const body = "  Giữ nguyên mô tả tiếng Việt và xuống dòng.\\n🌿  ";
    const payload = buildProposal(title, body, recipient, "0.000000000000000001", requestId, treasury);
    expect(JSON.parse(payload.description)).toEqual({ version: 1, title, body });
    const decoded = decodeFunctionData({ abi: treasuryAbi, data: payload.calldatas[0] });
    expect(decoded.functionName).toBe("disburse");
    expect(decoded.args).toEqual([requestId, recipient, 1n]);
  });

  it("preserves the full uint256 amount and rejects overflow", () => {
    const whole = UINT256_MAX / 10n ** 18n;
    const fraction = (UINT256_MAX % 10n ** 18n).toString().padStart(18, "0");
    expect(parseBUD(`${whole}.${fraction}`)).toBe(UINT256_MAX);
    expect(() => parseBUD(`${whole}.${BigInt(fraction) + 1n}`)).toThrow(/uint256/);
    expect(() => parseBUD("1e18")).toThrow();
    expect(() => parseBUD("0.0000000000000000001")).toThrow();
  });

  it("keeps original action bytes and rejects changed description or proposal ID", () => {
    const proposal: Proposal = { ...sc01, title: null, body: null, proposer: recipient, state: "Pending", snapshot: "1", deadline: "2" };
    expect(originalActions(proposal, treasury)).toEqual([sc01.targets, [0n], sc01.calldatas, sc01.descriptionHash]);
    expect(() => originalActions({ ...proposal, description: `${proposal.description} ` }, treasury)).toThrow(/description/);
    expect(() => originalActions({ ...proposal, proposalId: "1" }, treasury)).toThrow(/Proposal ID/);
    expect(() => originalActions({ ...proposal, amount: "1" }, treasury)).toThrow(/disburse/);
  });
});

describe("fixture display", () => {

  it("formats a uint256 amount without floating point loss", () => {
    expect(formatBUD("1000000000000000001")).toBe("1,000000000000000001 BUD");
  });
});

describe("wallet failure reporting", () => {
  it("distinguishes a rejected signature from an on-chain revert", () => {
    expect(transactionErrorMessage({ code: 4001, message: "User rejected the request" })).toMatch(/từ chối ký/);
    expect(transactionErrorMessage(new Error("Giao dịch đã lên chain nhưng bị revert."))).toMatch(/revert/);
  });

  it("accepts a confirmed or repriced receipt, rejects revert and changed actions", async () => {
    const hash = `0x${"1".repeat(64)}` as Hex;
    const success = { status: "success", transactionHash: hash } as TransactionReceipt;
    const waiter = (receipt: TransactionReceipt, reason?: string) => ({
      waitForTransactionReceipt: async ({ onReplaced }: { onReplaced?: (value: { reason: string }) => void }) => {
        if (reason) onReplaced?.({ reason });
        return receipt;
      },
    }) as unknown as NonNullable<Parameters<typeof waitForReceipt>[1]>;
    await expect(waitForReceipt(hash, waiter(success))).resolves.toBe(success);
    await expect(waitForReceipt(hash, waiter(success, "repriced"))).resolves.toBe(success);
    await expect(waitForReceipt(hash, waiter({ ...success, status: "reverted" }))).rejects.toThrow(/revert/);
    await expect(waitForReceipt(hash, waiter(success, "cancelled"))).rejects.toThrow(/thay/);
  });
});

describe("TV1 SC06 canonical chain vectors", () => {
  for (const vector of sc06.proposals) {
    it(`round-trips calldata, requestId, descriptionHash and proposalId ${vector.proposalId.slice(0, 8)}`, () => {
      const decoded = decodeFunctionData({ abi: treasuryAbi, data: vector.calldata as Hex });
      expect(decoded.functionName).toBe("disburse");
      expect(decoded.args?.[0]).toBe(vector.requestId);
      expect(String(decoded.args?.[1]).toLowerCase()).toBe(vector.recipient);
      expect(decoded.args?.[2]).toBe(BigInt(vector.amount));
      const built = buildProposal("SC06 vector", "Description long enough for a proposal", vector.recipient as Address,
        formatUnits(BigInt(vector.amount), 18), vector.requestId as Hex, sc06.treasury as Address);
      expect(built.calldatas).toEqual([vector.calldata]);
      expect(vector.calldata.length).toBe(202);
      expect(keccak256(toHex(vector.description))).toBe(vector.descriptionHash);
      expect(proposalIdForActions([sc06.treasury as Address], [0n], [vector.calldata as Hex], vector.descriptionHash as Hex)).toBe(vector.proposalId);

      const proposal: Proposal = {
        proposalId: vector.proposalId, requestId: vector.requestId, title: null, body: null,
        description: vector.description, descriptionHash: vector.descriptionHash, targets: [sc06.treasury],
        values: ["0"], calldatas: [vector.calldata], recipient: vector.recipient, amount: vector.amount,
        proposer: vector.recipient, state: "Pending", snapshot: "1", deadline: "2",
      };
      expect(originalActions(proposal, sc06.treasury as Address)).toEqual([[sc06.treasury], [0n], [vector.calldata], vector.descriptionHash]);
      expect(encodeFunctionData({ abi: governorAbi, functionName: "propose", args: [[sc06.treasury], [0n], [vector.calldata], vector.description] })).toBe(vector.inputs.create);
      for (const kind of ["queue", "execute", "cancel"] as const) {
        if (!(kind in vector.inputs)) continue;
        expect(encodeFunctionData({ abi: governorAbi, functionName: kind, args: originalActions(proposal, sc06.treasury as Address) })).toBe(vector.inputs[kind as keyof typeof vector.inputs]);
      }
      expect(() => originalActions({ ...proposal, requestId: sc06.proposals.find((item) => item !== vector)!.requestId }, sc06.treasury as Address)).toThrow(/disburse/);
      expect(() => originalActions({ ...proposal, calldatas: [`${vector.calldata}00`] }, sc06.treasury as Address)).toThrow(/Payload/);
      expect(() => originalActions({ ...proposal, description: vector.description.trim() }, sc06.treasury as Address)).toThrow(/description/);
      expect(() => originalActions({ ...proposal, proposalId: "1" }, sc06.treasury as Address)).toThrow(/Proposal ID/);

      const log = { address: vector.createLog.address as Address, data: vector.createLog.data as Hex, topics: vector.createLog.topics as Hex[] };
      expect(proposalIdFromReceipt([log], sc06.governor as Address, vector.proposalId)).toBe(vector.proposalId);
      expect(proposalIdFromReceipt([log], sc06.treasury as Address, vector.proposalId)).toBeNull();
      expect(proposalIdFromReceipt([log], sc06.governor as Address, "1")).toBeNull();
    });
  }
});
