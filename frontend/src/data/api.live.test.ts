/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";

const baseUrl = process.env.BE05_LIVE_API_URL;
const chainId = process.env.BE05_LIVE_CHAIN_ID;
const deploymentId = process.env.BE05_LIVE_DEPLOYMENT_ID;
const rpcUrl = process.env.BE05_LIVE_RPC_URL;
const enabled = Boolean(baseUrl && chainId && deploymentId && rpcUrl);

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe.skipIf(!enabled)("BE05 live Frontend/Backend snapshot", () => {
  it("reads all six real endpoints at one H/hash/revision without duplicate or missing rows", async () => {
    vi.stubEnv("VITE_API_BASE_URL", baseUrl!);
    vi.stubEnv("VITE_CHAIN_ID", chainId!);
    vi.stubEnv("VITE_DEPLOYMENT_ID", deploymentId!);
    vi.stubEnv("VITE_RPC_URL", "");
    for (const name of ["VITE_GOVERNOR_ADDRESS", "VITE_TREASURY_ADDRESS", "VITE_TIMELOCK_ADDRESS", "VITE_GOV_TOKEN_ADDRESS", "VITE_BUD_TOKEN_ADDRESS"]) vi.stubEnv(name, "");
    vi.resetModules();

    const api = await import("./api");
    const scope = { chainId: chainId!, deploymentId: deploymentId! };
    const direct = async (path: string, params: Record<string, string> = {}) => {
      const url = new URL(`/api/${path}`, baseUrl!);
      for (const [key, value] of Object.entries({ ...scope, ...params })) url.searchParams.set(key, value);
      const response = await fetch(url);
      expect(response.status, `${path}: HTTP status`).toBe(200);
      return response.json();
    };
    const same = (actual: { context: { asOfBlock: string; asOfBlockHash: string; snapshotRevision: string } }, expected: typeof actual) => {
      expect(actual.context.asOfBlock).toBe(expected.context.asOfBlock);
      expect(actual.context.asOfBlockHash).toBe(expected.context.asOfBlockHash);
      expect(actual.context.snapshotRevision).toBe(expected.context.snapshotRevision);
    };
    const directPages = async (path: string, pinned: Record<string, string>) => {
      const all: unknown[] = [];
      let cursor: string | null = null;
      let total: number | undefined;
      let pageCount = 0;
      do {
        const page = await direct(path, { asOfBlock: pinned.asOfBlock, asOfBlockHash: pinned.asOfBlockHash, limit: "1", ...(cursor ? { cursor } : {}) });
        same(page, { context: pinned as typeof page.context });
        pageCount++;
        total ??= page.pagination.totalCount;
        expect(page.pagination.totalCount).toBe(total);
        all.push(...page.data);
        cursor = page.pagination.nextCursor;
      } while (cursor);
      expect(all.length).toBe(total);
      expect(pageCount).toBe(total || 1);
      return all;
    };

    const proposals = await api.loadProposals();
    expect(proposals.context.dataKind).toBe("chain");
    const pinned = { asOfBlock: proposals.context.asOfBlock, asOfBlockHash: proposals.context.asOfBlockHash, snapshotRevision: proposals.context.snapshotRevision };
    const query = { asOfBlock: pinned.asOfBlock, asOfBlockHash: pinned.asOfBlockHash };
    const directProposals = await directPages("proposals", pinned);
    expect(proposals.proposals).toEqual(directProposals);
    expect(new Set(proposals.proposals.map((item) => item.proposalId)).size).toBe(proposals.totalCount);

    const [summary, directSummary, transfers, directTransfers, health, directHealth] = await Promise.all([
      api.loadSummary(proposals.context), direct("summary", query), api.loadTransfers(proposals.context),
      directPages("treasury/transfers", pinned), api.loadHealth(), direct("health"),
    ]);
    same(directSummary, { context: pinned });
    expect(summary).toEqual({ context: directSummary.context, ...directSummary.data });
    expect(transfers).toEqual(directTransfers);
    expect(new Set(transfers.map((item) => `${item.blockNumber}:${item.logIndex}`)).size).toBe(transfers.length);
    expect(proposals.totalCount).toBe(summary.proposalCounts.total);
    expect(health).toEqual(directHealth);
    expect(health.data.publication).toBe("ready");
    expect(health.context?.sync?.status).toBe("synced");
    expect((await api.loadTreasurySnapshot(proposals.context)).transfers).toEqual(transfers);

    if (proposals.proposals[0]) {
      const first = proposals.proposals[0];
      expect((await api.loadProposals(undefined, { state: first.state, context: proposals.context })).proposals.every((item) => item.state === first.state)).toBe(true);
      expect((await api.loadProposals(undefined, { proposalId: first.proposalId, context: proposals.context })).proposals.map((item) => item.proposalId)).toEqual([first.proposalId]);
    }
    for (const direction of ["in", "out", "self"] as const) {
      const filtered = await api.loadTransfers(proposals.context, undefined, { direction });
      expect(filtered).toEqual(transfers.filter((item) => item.direction === direction));
    }

    for (const proposal of proposals.proposals) {
      const [detail, directDetail, votes, directVotes] = await Promise.all([
        api.loadProposalDetail(proposal.proposalId, proposals.context),
        direct(`proposals/${proposal.proposalId}`, query),
        api.loadVotes(proposal.proposalId, proposals.context),
        directPages(`proposals/${proposal.proposalId}/votes`, pinned),
      ]);
      same(directDetail, { context: pinned });
      expect(detail).toEqual(directDetail.data);
      expect(detail).toEqual(proposal);
      expect(votes).toEqual(directVotes);
      expect((await api.loadProposalSnapshot(proposal, proposals.context)).votes).toEqual(votes);
    }

    const rpc = await fetch(rpcUrl!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [`0x${BigInt(pinned.asOfBlock).toString(16)}`, false] }) });
    expect((await rpc.json()).result.hash).toBe(pinned.asOfBlockHash);
    await expect(api.loadProposalDetail("0", proposals.context)).rejects.toMatchObject({ status: 404, code: "PROPOSAL_NOT_FOUND" });
    await expect(api.loadSummary({ ...proposals.context, asOfBlockHash: `0x${"0".repeat(64)}` })).rejects.toMatchObject({ status: 409, code: "SNAPSHOT_INVALIDATED" });
  }, 60_000);
});
