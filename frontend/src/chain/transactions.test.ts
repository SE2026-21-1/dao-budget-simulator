import { describe, expect, it } from "vitest";
import { decodeFunctionData, keccak256, toHex } from "viem";
import { buildProposal, originalActions, parseBUD, treasuryAbi, UINT256_MAX, validateProposalForm } from "./transactions";
import { formatBUD } from "../data/formatBUD";
import sc01 from "../../../fixtures/sc01/disbursement-v1.json";
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
