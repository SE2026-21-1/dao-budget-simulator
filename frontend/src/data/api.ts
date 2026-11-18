import { isAddress } from "viem";
import { apiBaseUrl, apiScope, configurationError, deployment } from "../chain/config";
import { loadProposalFixtures, proposalStatuses, type FixtureContext, type ProposalCollection } from "./proposals";
import summaryFixture from "../../../fixtures/api/summary.json";
import transfersPage1 from "../../../fixtures/api/transfers-page-1.json";
import transfersPage2 from "../../../fixtures/api/transfers-page-2.json";

export interface Summary {
  context: FixtureContext;
  treasury: { address: string; token: { address: string }; balance: string; totalIn: string; totalOut: string };
  proposalCounts: { total: number; byState: Record<string, number> };
  governance: { governor: string; timelock: string; govToken: { address: string }; proposalThreshold: string };
  recentActivity: Transfer[];
}

export interface Transfer {
  from: string; to: string; amount: string; direction: string;
  transactionHash: string; transactionIndex: string; logIndex: string; blockNumber: string; proposalId: string | null;
  requestId?: string | null; blockHash?: string;
}

export interface Vote {
  proposalId: string; voter: string; support: number; weight: string; reason: string;
  transactionHash: string; transactionIndex: string; logIndex: string; blockNumber: string; blockHash: string;
}

export type ProposalFilters = { state?: (typeof proposalStatuses)[number]; proposalId?: string; context?: FixtureContext };
export type TransferFilters = { direction?: "in" | "out" | "self"; proposalId?: string };

export interface Health {
  context: (Omit<FixtureContext, "asOfBlock" | "asOfBlockHash"> & { asOfBlock: string | null; asOfBlockHash: string | null }) | null;
  data: {
    status: "ok" | "degraded" | "unavailable";
    database: string; indexer: string; publication: string;
    projectionStatus?: string; projectionLagBlocks?: string | null;
    rawDecodeComplete?: boolean;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(`${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

function snapshotQuery(context?: FixtureContext) {
  if (configurationError) throw new Error(configurationError);
  if (!apiScope) throw new Error("Thiếu cấu hình deployment API.");
  const query = new URLSearchParams({ chainId: String(apiScope.chainId), deploymentId: apiScope.deploymentId });
  if (context) { query.set("asOfBlock", context.asOfBlock); query.set("asOfBlockHash", context.asOfBlockHash); }
  return query;
}

async function request(path: string, query: URLSearchParams, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl}/api/${path}?${query}`, { signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error("Không kết nối được API. Kiểm tra dịch vụ và cấu hình mạng rồi thử lại.", { cause });
  }
}

async function get(path: string, query: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await request(path, query, signal);
  const body = await response.json() as { error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? `HTTP_${response.status}`, body.error?.message ?? "Không tải được dữ liệu.");
  return body;
}

function assertScope(context: Pick<FixtureContext, "chainId" | "deploymentId" | "dataKind">) {
  if (!apiScope || !context || context.dataKind !== "chain" || context.chainId !== String(apiScope.chainId) || context.deploymentId !== apiScope.deploymentId) {
    throw new Error("Dữ liệu API không khớp chain/deployment đã cấu hình.");
  }
}

function assertSync(sync: FixtureContext["sync"]) {
  if (sync && (!["synced", "lagging", "not_ready"].includes(sync.status) ||
      (sync.lagSeconds !== null && (typeof sync.lagSeconds !== "string" || !/^(0|[1-9]\d*)$/.test(sync.lagSeconds))) ||
      (sync.lagBlocks != null && (typeof sync.lagBlocks !== "string" || !/^(0|[1-9]\d*)$/.test(sync.lagBlocks))))) {
    throw new Error("Thông tin đồng bộ API sai cấu trúc.");
  }
}

function assertContext(context: FixtureContext, pinned?: FixtureContext) {
  assertScope(context);
  assertSync(context.sync);
  if (!/^(0|[1-9]\d*)$/.test(context.asOfBlock) || !/^0x[0-9a-f]{64}$/i.test(context.asOfBlockHash) || !context.snapshotRevision ||
      (pinned && (context.asOfBlock !== pinned.asOfBlock || context.asOfBlockHash !== pinned.asOfBlockHash || context.snapshotRevision !== pinned.snapshotRevision))) {
    throw new Error("Snapshot API không khớp hoặc đã thay đổi khi phân trang. Tải lại từ trang đầu.");
  }
}

function assertProposalId(id: string) {
  if (!/^(0|[1-9]\d*)$/.test(id) || BigInt(id) >= 1n << 256n) throw new Error("Proposal ID phải là uint256 thập phân canonical.");
}

function assertTransfer(item: Transfer) {
  if (!item || !isAddress(item.from) || !isAddress(item.to) || !["in", "out", "self"].includes(item.direction) || !/^(0|[1-9]\d*)$/.test(item.amount) ||
      !/^(0|[1-9]\d*)$/.test(item.blockNumber) || !/^(0|[1-9]\d*)$/.test(item.logIndex) ||
      !/^(0|[1-9]\d*)$/.test(item.transactionIndex) || !/^0x[0-9a-f]{64}$/i.test(item.transactionHash) ||
      (item.proposalId !== null && !/^(0|[1-9]\d*)$/.test(item.proposalId))) throw new Error("Transfer API sai cấu trúc.");
}

function assertVote(item: Vote, proposalId: string) {
  if (!item || item.proposalId !== proposalId || !isAddress(item.voter) || ![0, 1, 2].includes(item.support) ||
      !/^(0|[1-9]\d*)$/.test(item.weight) || !/^(0|[1-9]\d*)$/.test(item.blockNumber) ||
      !/^(0|[1-9]\d*)$/.test(item.transactionIndex) || !/^(0|[1-9]\d*)$/.test(item.logIndex) ||
      !/^0x[0-9a-f]{64}$/i.test(item.blockHash) || !/^0x[0-9a-f]{64}$/i.test(item.transactionHash) ||
      typeof item.reason !== "string") throw new Error("Phiếu API sai cấu trúc.");
}

export async function loadHealth(signal?: AbortSignal): Promise<Health> {
  const response = await request("health", snapshotQuery(), signal);
  const body = await response.json() as Health & { error?: { code: string; message: string } };
  if (body.error) throw new ApiError(response.status, body.error.code, body.error.message);
  // BE05 intentionally returns the health data envelope with 503 when unavailable.
  if (!body.data || !["ok", "degraded", "unavailable"].includes(body.data.status)) throw new Error("Health API sai cấu trúc.");
  if (body.context) {
    assertScope(body.context);
    assertSync(body.context.sync);
    if (body.context.asOfBlock === null || body.context.asOfBlockHash === null) {
      if (body.context.asOfBlock !== null || body.context.asOfBlockHash !== null || body.data.status !== "unavailable")
        throw new Error("Health API có snapshot H/hash không nhất quán.");
    } else assertContext(body.context as FixtureContext);
  }
  return body;
}

export async function loadProposals(signal?: AbortSignal, filters: ProposalFilters = {}): Promise<ProposalCollection> {
  if (filters.proposalId !== undefined) assertProposalId(filters.proposalId);
  if (filters.state !== undefined && !proposalStatuses.includes(filters.state)) throw new Error("State proposal không hợp lệ.");
  if (!apiBaseUrl) {
    const fixture = await loadProposalFixtures();
    if (!filters.state && !filters.proposalId) return fixture;
    const proposals = fixture.proposals.filter((item) => (!filters.state || item.state === filters.state) && (!filters.proposalId || item.proposalId === filters.proposalId));
    return { ...fixture, proposals, totalCount: proposals.length, pageSizes: [proposals.length] };
  }
  const all: ProposalCollection["proposals"] = [];
  const pageSizes: number[] = [];
  const cursors = new Set<string>();
  let context: FixtureContext | undefined = filters.context;
  let cursor: string | null = null;
  let totalCount: number | undefined;
  do {
    const query = snapshotQuery(context);
    query.set("limit", "20");
    if (filters.state) query.set("state", filters.state);
    if (filters.proposalId) query.set("proposalId", filters.proposalId);
    if (cursor) query.set("cursor", cursor);
    const page = await get("proposals", query, signal) as { context: FixtureContext; data: ProposalCollection["proposals"]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(page.context, context);
    if (!Array.isArray(page.data) || !page.pagination || page.data.length > 20 || !Number.isSafeInteger(page.pagination.totalCount) || page.pagination.totalCount < 0 ||
        page.data.some((item) => !item || !/^(0|[1-9]\d*)$/.test(item.proposalId) || BigInt(item.proposalId) >= 1n << 256n || !/^(0|[1-9]\d*)$/.test(item.amount) || !proposalStatuses.includes(item.state))) {
      throw new Error("Trang API proposal sai cấu trúc.");
    }
    context ??= page.context;
    totalCount ??= page.pagination.totalCount;
    if (page.pagination.totalCount !== totalCount) throw new Error("Tổng số proposal thay đổi giữa các trang.");
    all.push(...page.data);
    pageSizes.push(page.data.length);
    cursor = page.pagination.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor) || page.data.length === 0)) throw new Error("Cursor proposal bị lặp hoặc không tiến tới trang tiếp theo.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (new Set(all.map((item) => item.proposalId)).size !== all.length || all.length !== totalCount ||
      all.some((item) => (filters.state && item.state !== filters.state) || (filters.proposalId && item.proposalId !== filters.proposalId)))
    throw new Error("Proposal API bị trùng hoặc thiếu mục hoặc sai bộ lọc.");
  return { context: context!, proposals: all, totalCount, pageSizes };
}

export async function loadProposalDetail(id: string, context: FixtureContext, signal?: AbortSignal): Promise<ProposalCollection["proposals"][number]> {
  assertProposalId(id);
  if (!apiBaseUrl) {
    const fixture = await loadProposalFixtures();
    const proposal = fixture.proposals.find((item) => item.proposalId === id);
    if (!proposal) throw new ApiError(404, "PROPOSAL_NOT_FOUND", "Proposal không tồn tại.");
    return proposal;
  }
  const response = await get(`proposals/${id}`, snapshotQuery(context), signal) as { context: FixtureContext; data: ProposalCollection["proposals"][number] };
  assertContext(response.context, context);
  if (!response.data || response.data.proposalId !== id || !proposalStatuses.includes(response.data.state)) throw new Error("Chi tiết proposal API sai cấu trúc.");
  return response.data;
}

export async function loadVotes(id: string, context: FixtureContext, signal?: AbortSignal): Promise<Vote[]> {
  assertProposalId(id);
  if (!apiBaseUrl) throw new Error("Lịch sử phiếu BE05 chỉ có ở chế độ API.");
  const votes: Vote[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let count: number | undefined;
  do {
    const query = snapshotQuery(context);
    query.set("limit", "20");
    if (cursor) query.set("cursor", cursor);
    const page = await get(`proposals/${id}/votes`, query, signal) as { context: FixtureContext; data: Vote[]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(page.context, context);
    if (!Array.isArray(page.data) || page.data.length > 20 || !page.pagination || !Number.isSafeInteger(page.pagination.totalCount) || page.pagination.totalCount < 0) throw new Error("Trang phiếu API sai cấu trúc.");
    page.data.forEach((vote) => assertVote(vote, id));
    count ??= page.pagination.totalCount;
    if (count !== page.pagination.totalCount) throw new Error("Tổng số phiếu thay đổi giữa các trang.");
    votes.push(...page.data);
    cursor = page.pagination.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor) || page.data.length === 0)) throw new Error("Cursor phiếu bị lặp hoặc không tiến tới trang tiếp theo.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (votes.length !== count || new Set(votes.map((vote) => `${vote.blockHash}:${vote.logIndex}`)).size !== votes.length ||
      new Set(votes.map((vote) => vote.voter.toLowerCase())).size !== votes.length) throw new Error("Phiếu API bị trùng hoặc thiếu mục.");
  return votes;
}

export async function loadProposalSnapshot(listItem: ProposalCollection["proposals"][number], context: FixtureContext, signal?: AbortSignal) {
  const [detail, votes, transfers] = await Promise.all([
    loadProposalDetail(listItem.proposalId, context, signal),
    loadVotes(listItem.proposalId, context, signal),
    loadTransfers(context, signal, { proposalId: listItem.proposalId }),
  ]);
  if (JSON.stringify(detail) !== JSON.stringify(listItem)) throw new Error("Chi tiết proposal không khớp danh sách tại cùng snapshot.");
  const totals = [0n, 0n, 0n];
  for (const vote of votes) totals[vote.support] += BigInt(vote.weight);
  if (!detail.votes || totals[0].toString() !== detail.votes.against || totals[1].toString() !== detail.votes.for || totals[2].toString() !== detail.votes.abstain)
    throw new Error("Tổng phiếu detail không khớp lịch sử phiếu tại cùng snapshot.");
  if (transfers.some((item) => item.proposalId !== detail.proposalId || (item.requestId != null && item.requestId !== detail.requestId)))
    throw new Error("Transfer không khớp proposal tại cùng snapshot.");
  return { proposal: detail, votes, transfers };
}

export async function loadSummary(context?: FixtureContext, signal?: AbortSignal): Promise<Summary> {
  if (!apiBaseUrl) {
    return { context: summaryFixture.context, ...summaryFixture.data };
  }
  const response = await get("summary", snapshotQuery(context), signal) as { context: FixtureContext; data: Omit<Summary, "context"> };
  assertContext(response.context, context);
  if (!response.data?.treasury?.token || !response.data?.governance?.govToken || !response.data.proposalCounts?.byState ||
      !Array.isArray(response.data.recentActivity) || !Number.isSafeInteger(response.data.proposalCounts.total) ||
      [response.data.treasury.balance, response.data.treasury.totalIn, response.data.treasury.totalOut].some((value) => !/^(0|[1-9]\d*)$/.test(value)))
    throw new Error("Summary API sai cấu trúc.");
  response.data.recentActivity.forEach(assertTransfer);
  if (deployment && (response.data.treasury.address.toLowerCase() !== deployment.treasury.toLowerCase() ||
      response.data.treasury.token.address.toLowerCase() !== deployment.budToken.toLowerCase() ||
      response.data.governance.governor.toLowerCase() !== deployment.governor.toLowerCase() ||
      response.data.governance.timelock.toLowerCase() !== deployment.timelock.toLowerCase() ||
      response.data.governance.govToken.address.toLowerCase() !== deployment.govToken.toLowerCase())) {
    throw new Error("Địa chỉ contract trong API không khớp deployment đã cấu hình.");
  }
  return { context: response.context, ...response.data };
}

export async function loadTransfers(context?: FixtureContext, signal?: AbortSignal, filters: TransferFilters = {}): Promise<Transfer[]> {
  if (filters.proposalId !== undefined) assertProposalId(filters.proposalId);
  if (filters.direction !== undefined && !["in", "out", "self"].includes(filters.direction)) throw new Error("Direction Transfer không hợp lệ.");
  if (!apiBaseUrl) {
    return [...transfersPage1.data, ...transfersPage2.data].filter((item) => (!filters.direction || item.direction === filters.direction) && (!filters.proposalId || item.proposalId === filters.proposalId));
  }
  const all: Transfer[] = [];
  const cursors = new Set<string>();
  let pinned = context;
  let cursor: string | null = null;
  let count: number | undefined;
  do {
    const query = snapshotQuery(pinned);
    query.set("limit", "20");
    if (filters.direction) query.set("direction", filters.direction);
    if (filters.proposalId) query.set("proposalId", filters.proposalId);
    if (cursor) query.set("cursor", cursor);
    const response = await get("treasury/transfers", query, signal) as { context: FixtureContext; data: Transfer[]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(response.context, pinned);
    pinned ??= response.context;
    if (!Array.isArray(response.data) || response.data.length > 20 || !response.pagination || !Number.isSafeInteger(response.pagination.totalCount) || response.pagination.totalCount < 0) throw new Error("Lịch sử Treasury sai cấu trúc.");
    response.data.forEach(assertTransfer);
    count ??= response.pagination.totalCount;
    if (response.pagination.totalCount !== count) throw new Error("Tổng Transfer thay đổi giữa các trang.");
    all.push(...response.data);
    cursor = response.pagination.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor) || response.data.length === 0)) throw new Error("Cursor Transfer bị lặp hoặc không tiến tới trang tiếp theo.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (new Set(all.map((item) => `${item.blockNumber}:${item.logIndex}`)).size !== all.length || all.length !== count ||
      all.some((item) => (filters.direction && item.direction !== filters.direction) || (filters.proposalId && item.proposalId !== filters.proposalId)))
    throw new Error("Lịch sử Treasury bị trùng, thiếu hoặc sai bộ lọc.");
  return all;
}

export async function loadTreasurySnapshot(context: FixtureContext, signal?: AbortSignal) {
  const [summary, transfers] = await Promise.all([loadSummary(context, signal), loadTransfers(context, signal)]);
  const incoming = transfers.filter((item) => item.direction === "in").reduce((sum, item) => sum + BigInt(item.amount), 0n);
  const outgoing = transfers.filter((item) => item.direction === "out").reduce((sum, item) => sum + BigInt(item.amount), 0n);
  if (incoming.toString() !== summary.treasury.totalIn || outgoing.toString() !== summary.treasury.totalOut ||
      JSON.stringify(summary.recentActivity.map((item) => [item.transactionHash, item.logIndex])) !==
      JSON.stringify(transfers.slice(0, 5).map((item) => [item.transactionHash, item.logIndex])))
    throw new Error("Summary Treasury không khớp lịch sử Transfer tại cùng snapshot.");
  return { summary, transfers };
}
