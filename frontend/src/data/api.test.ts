import { afterEach, describe, expect, it, vi } from "vitest";
import page1 from "../../../fixtures/api/proposals-page-1.json";
import page2 from "../../../fixtures/api/proposals-page-2.json";
import page3 from "../../../fixtures/api/proposals-page-3.json";

vi.mock("../chain/config", () => ({
  apiBaseUrl: "http://127.0.0.1:3000",
  apiScope: { chainId: 31337, deploymentId: "test-deployment" },
  configurationError: null,
  deployment: {
    chainId: 31337,
    deploymentId: "test-deployment",
    treasury: "0x1111111111111111111111111111111111111111",
    budToken: "0x2222222222222222222222222222222222222222",
    governor: "0x3333333333333333333333333333333333333333",
    timelock: "0x4444444444444444444444444444444444444444",
    govToken: "0x5555555555555555555555555555555555555555",
  },
}));

import { loadProposals } from "./api";

const context = { ...page1.context, chainId: "31337", deploymentId: "test-deployment", dataKind: "chain" };
const pages = [page1, page2, page3].map((page, index) => ({
  context,
  data: page.data,
  pagination: { totalCount: 45, nextCursor: index < 2 ? `cursor-${index + 1}` : null },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("BE05 proposal pagination", () => {
  it("reads 45 proposals from one pinned snapshot without losing IDs", async () => {
    const urls: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      return jsonResponse(pages[urls.length - 1]);
    }));

    const result = await loadProposals();
    expect(result.pageSizes).toEqual([20, 20, 5]);
    expect(result.totalCount).toBe(45);
    expect(new Set(result.proposals.map((proposal) => proposal.proposalId)).size).toBe(45);
    expect(urls.map((url) => url.searchParams.get("cursor"))).toEqual([null, "cursor-1", "cursor-2"]);
    expect(urls[0].searchParams.has("asOfBlock")).toBe(false);
    for (const url of urls.slice(1)) {
      expect(url.searchParams.get("asOfBlock")).toBe(context.asOfBlock);
      expect(url.searchParams.get("asOfBlockHash")).toBe(context.asOfBlockHash);
      expect(url.searchParams.get("deploymentId")).toBe(context.deploymentId);
    }
  });

  it("rejects a changed snapshot instead of combining pages", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const page = pages[call++];
      return jsonResponse(call === 2
        ? { ...page, context: { ...context, snapshotRevision: "different-revision" } }
        : page);
    }));
    await expect(loadProposals()).rejects.toThrow(/Snapshot API không khớp/);
  });

  it("rejects repeated IDs even when the server count is 45", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const page = pages[call++];
      return jsonResponse(call === 3
        ? { ...page, data: [{ ...page.data[0], proposalId: pages[0].data[0].proposalId }, ...page.data.slice(1)] }
        : page);
    }));
    await expect(loadProposals()).rejects.toThrow(/trùng hoặc thiếu/);
  });

  it("surfaces API failure without selecting synthetic fixtures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "PUBLICATION_UNAVAILABLE", message: "Chưa có snapshot" } }, 503)));
    await expect(loadProposals()).rejects.toMatchObject({ status: 503, code: "PUBLICATION_UNAVAILABLE" });
  });
});
