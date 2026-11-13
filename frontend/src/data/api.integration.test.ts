/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixtureRoot = new URL("../../../fixtures/api/", import.meta.url);
function fixture(file: string) {
  const body = JSON.parse(readFileSync(new URL(file, fixtureRoot), "utf8"));
  if (body.context) body.context.dataKind = "chain";
  return body;
}

const summaryFixture = fixture("summary.json");
const proposalPages = [1, 2, 3].map((page) => fixture(`proposals-page-${page}.json`));
const transferPages = [1, 2].map((page) => fixture(`transfers-page-${page}.json`));
const allTransfers = transferPages.flatMap((page) => page.data);

vi.mock("../chain/config", () => ({
  apiBaseUrl: "http://be05.test",
  apiScope: { chainId: 31337, deploymentId: "synthetic-local-v1" },
  configurationError: null,
  deployment: {
    chainId: 31337,
    deploymentId: "synthetic-local-v1",
    treasury: "0x1111111111111111111111111111111111111111",
    budToken: "0x6666666666666666666666666666666666666666",
    governor: "0x3333333333333333333333333333333333333333",
    timelock: "0x4444444444444444444444444444444444444444",
    govToken: "0x5555555555555555555555555555555555555555",
  },
}));

import { loadHealth, loadProposalDetail, loadProposals, loadProposalSnapshot, loadSummary, loadTransfers, loadTreasurySnapshot, loadVotes } from "./api";

const urls: URL[] = [];
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function serveFixture(input: string): Response {
  const url = new URL(input);
  urls.push(url);
  const path = url.pathname;
  const cursor = url.searchParams.get("cursor");
  if (path === "/api/health") return response(fixture("health-synced.json"));
  if (path === "/api/summary") return response(summaryFixture);
  if (path === "/api/proposals") {
    const state = url.searchParams.get("state");
    const id = url.searchParams.get("proposalId");
    if (state) return response(fixture(`proposals-state-${state}.json`));
    if (id) return response(fixture(id === "41188251149770464419086128880638239388642337502157923625475508004855043094545" ? "proposals-search-sc01.json" : "proposals-search-unknown.json"));
    return response(proposalPages[cursor === null ? 0 : cursor === proposalPages[0].pagination.nextCursor ? 1 : 2]);
  }
  const detail = path.match(/^\/api\/proposals\/(\d+)$/);
  if (detail) return response(fixture(`proposals/${detail[1]}.json`));
  const votes = path.match(/^\/api\/proposals\/(\d+)\/votes$/);
  if (votes) return response(fixture(`votes/${votes[1]}.json`));
  if (path === "/api/treasury/transfers") {
    const direction = url.searchParams.get("direction");
    const id = url.searchParams.get("proposalId");
    if (direction === "in" && !id) return response(fixture(cursor ? "transfers-direction-in-2.json" : "transfers-direction-in-1.json"));
    if (direction || id) {
      const data = allTransfers.filter((item: { direction: string; proposalId: string | null }) => (!direction || item.direction === direction) && (!id || item.proposalId === id));
      return response({ context: transferPages[0].context, data, pagination: { limit: 20, totalCount: data.length, nextCursor: null } });
    }
    return response(transferPages[cursor === null ? 0 : 1]);
  }
  throw new Error(`Unexpected BE05 route: ${url}`);
}

afterEach(() => { vi.unstubAllGlobals(); urls.length = 0; });

describe("fixture-backed BE05 six-endpoint consumer contract at one snapshot", () => {
  it("joins summary, 45 list/detail/votes, 29 transfers and health without duplicate or loss", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => serveFixture(input)));
    const collection = await loadProposals();
    const context = collection.context;
    const [summary, transfers, health] = await Promise.all([loadSummary(context), loadTransfers(context), loadHealth()]);
    expect((await loadTreasurySnapshot(context)).transfers).toEqual(transfers);
    expect([context.asOfBlock, context.asOfBlockHash, context.snapshotRevision]).toEqual(["9000", summary.context.asOfBlockHash, "fixture-v2"]);
    expect(collection.pageSizes).toEqual([20, 20, 5]);
    expect(collection.totalCount).toBe(summary.proposalCounts.total);
    expect(new Set(collection.proposals.map((item) => item.proposalId)).size).toBe(45);
    expect(transfers).toHaveLength(29);
    expect(new Set(transfers.map((item) => `${item.blockNumber}:${item.logIndex}`)).size).toBe(29);
    expect(health.data.status).toBe("ok");
    for (const [state, count] of Object.entries(summary.proposalCounts.byState)) {
      expect(collection.proposals.filter((item) => item.state === state)).toHaveLength(count as number);
    }
    expect(summary.recentActivity.map((item) => item.transactionHash)).toEqual(transfers.slice(0, 5).map((item) => item.transactionHash));
    const incoming = transfers.filter((item) => item.direction === "in").reduce((sum, item) => sum + BigInt(item.amount), 0n);
    const outgoing = transfers.filter((item) => item.direction === "out").reduce((sum, item) => sum + BigInt(item.amount), 0n);
    expect(incoming.toString()).toBe(summary.treasury.totalIn);
    expect(outgoing.toString()).toBe(summary.treasury.totalOut);

    for (const item of collection.proposals) {
      const detail = await loadProposalDetail(item.proposalId, context);
      const votes = await loadVotes(item.proposalId, context);
      expect(detail).toEqual(item);
      const totals = [0n, 0n, 0n];
      for (const vote of votes) totals[vote.support] += BigInt(vote.weight);
      expect(totals.map(String)).toEqual([detail.votes?.against, detail.votes?.for, detail.votes?.abstain]);
    }
    const sc01 = collection.proposals.find((item) => item.proposalId === "41188251149770464419086128880638239388642337502157923625475508004855043094545")!;
    const snapshot = await loadProposalSnapshot(sc01, context);
    expect(snapshot.proposal).toEqual(sc01);
    expect(snapshot.votes).toHaveLength(3);
    expect(snapshot.transfers.every((item) => item.proposalId === sc01.proposalId)).toBe(true);
    for (const url of urls.filter((item) => item.pathname !== "/api/health" && item.pathname !== "/api/proposals")) {
      expect(url.searchParams.get("asOfBlock")).toBe(context.asOfBlock);
      expect(url.searchParams.get("asOfBlockHash")).toBe(context.asOfBlockHash);
    }
    expect(new Set(urls.map((url) => url.pathname))).toContain("/api/summary");
    expect(new Set(urls.map((url) => url.pathname))).toContain("/api/treasury/transfers");
  });

  it("keeps filters and H/hash on pagination, including empty filter results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => serveFixture(input)));
    const all = await loadProposals();
    const executed = await loadProposals(undefined, { state: "Executed", context: all.context });
    expect(executed.proposals).toHaveLength(7);
    expect(executed.proposals.every((item) => item.state === "Executed")).toBe(true);
    const sc01Id = "41188251149770464419086128880638239388642337502157923625475508004855043094545";
    const exact = await loadProposals(undefined, { proposalId: sc01Id, context: all.context });
    expect(exact.proposals.map((item) => item.proposalId)).toEqual([sc01Id]);
    const unknown = await loadProposals(undefined, { proposalId: "1", context: all.context });
    expect(unknown.proposals).toHaveLength(0);
    const outgoing = await loadTransfers(all.context, undefined, { direction: "out" });
    expect(outgoing.every((item) => item.direction === "out")).toBe(true);
    const incoming = await loadTransfers(all.context, undefined, { direction: "in" });
    expect(incoming).toHaveLength(21);
    expect(incoming.every((item) => item.direction === "in")).toBe(true);
    expect(urls.filter((url) => url.searchParams.has("cursor")).every((url) => url.searchParams.get("asOfBlockHash") === all.context.asOfBlockHash)).toBe(true);
    expect(urls.find((url) => url.searchParams.get("state") === "Executed")?.searchParams.get("asOfBlock")).toBe(all.context.asOfBlock);
    expect(urls.find((url) => url.pathname === "/api/treasury/transfers" && url.searchParams.has("cursor") && url.searchParams.get("direction") === "in")?.searchParams.get("direction")).toBe("in");
  });

  it("reads every vote across a signed-cursor-shaped multi-page response", async () => {
    const id = "41188251149770464419086128880638239388642337502157923625475508004855043094545";
    const base = fixture(`votes/${id}.json`);
    const votes = Array.from({ length: 21 }, (_, index) => ({
      ...base.data[0], voter: `0x${(index + 1).toString(16).padStart(40, "0")}`,
      logIndex: String(index), transactionIndex: String(index),
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      urls.push(url);
      return response({ context: base.context, data: url.searchParams.has("cursor") ? votes.slice(20) : votes.slice(0, 20),
        pagination: { limit: 20, totalCount: 21, nextCursor: url.searchParams.has("cursor") ? null : "signed-cursor-opaque" } });
    }));
    expect(await loadVotes(id, base.context)).toHaveLength(21);
    expect(urls.map((url) => url.searchParams.get("cursor"))).toEqual([null, "signed-cursor-opaque"]);
    expect(urls[1].searchParams.get("asOfBlockHash")).toBe(base.context.asOfBlockHash);
  });

  it("surfaces health lagging/not-ready and structured API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/api/health") return response(fixture("health-lagging.json"));
      return serveFixture(input);
    }));
    expect((await loadHealth()).context?.sync?.status).toBe("lagging");
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("health-not-ready.json"), 503)));
    expect((await loadHealth()).data.status).toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => {
      const body = fixture("health-synced.json");
      body.context.asOfBlockHash = null;
      return response(body);
    }));
    await expect(loadHealth()).rejects.toThrow(/H\/hash/);
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("error-snapshot-invalidated.json"), 409)));
    await expect(loadProposals()).rejects.toMatchObject({ status: 409, code: "SNAPSHOT_INVALIDATED" });
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("error-data-not-ready.json"), 503)));
    await expect(loadSummary()).rejects.toMatchObject({ status: 503, code: "DATA_NOT_READY" });
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("error-invalid-cursor.json"), 400)));
    await expect(loadProposals()).rejects.toMatchObject({ status: 400, code: "INVALID_CURSOR" });
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("error-cursor-context-mismatch.json"), 400)));
    await expect(loadTransfers()).rejects.toMatchObject({ status: 400, code: "CURSOR_CONTEXT_MISMATCH" });
    vi.stubGlobal("fetch", vi.fn(async () => response(fixture("error-not-found.json"), 404)));
    await expect(loadProposalDetail("1", proposalPages[0].context)).rejects.toMatchObject({ status: 404, code: "PROPOSAL_NOT_FOUND" });
  });

  it("rejects hash/revision drift, duplicate votes and missing transfers", async () => {
    const context = { ...proposalPages[0].context };
    const id = proposalPages[0].data[0].proposalId;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      const body = serveFixture(input);
      if (url.pathname.endsWith("/votes")) {
        const json = await body.json();
        return response({ ...json, context: { ...json.context, snapshotRevision: "changed" } });
      }
      return body;
    }));
    await expect(loadVotes(id, context)).rejects.toThrow(/Snapshot API/);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      const body = serveFixture(input);
      if (url.pathname.endsWith("/votes")) {
        const json = await body.json();
        return response({ ...json, data: [json.data[0], json.data[0], ...json.data.slice(2)] });
      }
      return body;
    }));
    const sc01Id = "41188251149770464419086128880638239388642337502157923625475508004855043094545";
    await expect(loadVotes(sc01Id, context)).rejects.toThrow(/trùng hoặc thiếu/);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      const body = serveFixture(input);
      if (url.pathname === "/api/treasury/transfers" && url.searchParams.has("cursor")) {
        const json = await body.json();
        return response({ ...json, context: { ...json.context, asOfBlockHash: `0x${"1".repeat(64)}` } });
      }
      return body;
    }));
    await expect(loadTransfers(context)).rejects.toThrow(/Snapshot API/);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      const body = serveFixture(input);
      if (url.pathname === "/api/treasury/transfers" && url.searchParams.has("cursor")) {
        const json = await body.json();
        return response({ ...json, data: json.data.slice(1), pagination: { ...json.pagination, totalCount: 29 } });
      }
      return body;
    }));
    await expect(loadTransfers(context)).rejects.toThrow(/trùng, thiếu/);
    vi.stubGlobal("fetch", vi.fn(async () => response({ context, data: null })));
    await expect(loadSummary(context)).rejects.toThrow(/Summary API sai cấu trúc/);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      const body = serveFixture(input);
      if (url.pathname === "/api/summary") {
        const json = await body.json();
        return response({ ...json, data: { ...json.data, treasury: { ...json.data.treasury, totalOut: "1" } } });
      }
      return body;
    }));
    await expect(loadTreasurySnapshot(context)).rejects.toThrow(/khớp lịch sử Transfer/);
  });
});
