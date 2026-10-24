import { describe, expect, it } from "vitest";
import { keccak256, toHex } from "viem";
import { buildProposal, validateProposalForm } from "./transactions";
import { formatBUD } from "../data/formatBUD";
import { loadProposalFixtures } from "../data/proposals";

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
});

describe("fixture display", () => {
  it("keeps all 45 proposal IDs unique across three pages", async () => {
    const collection = await loadProposalFixtures();
    expect(collection.pageSizes).toEqual([20, 20, 5]);
    expect(new Set(collection.proposals.map((item) => item.proposalId)).size).toBe(45);
    expect(new Set(collection.proposals.map((item) => item.state)).size).toBe(7);
  });

  it("formats a uint256 amount without floating point loss", () => {
    expect(formatBUD("1000000000000000001")).toBe("1,000000000000000001 BUD");
  });
});
