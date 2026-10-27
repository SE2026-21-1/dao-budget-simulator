import { apiBaseUrl, configurationError, deployment } from "../chain/config";
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
}

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
  if (!deployment) throw new Error("Thiếu cấu hình deployment API.");
  const query = new URLSearchParams({ chainId: String(deployment.chainId), deploymentId: deployment.deploymentId });
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
  if (!deployment || !context || context.dataKind !== "chain" || context.chainId !== String(deployment.chainId) || context.deploymentId !== deployment.deploymentId) {
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

export async function loadHealth(signal?: AbortSignal): Promise<Health> {
  const response = await request("health", snapshotQuery(), signal);
  const body = await response.json() as Health & { error?: { code: string; message: string } };
  if (body.error) throw new ApiError(response.status, body.error.code, body.error.message);
  // BE05 intentionally returns the health data envelope with 503 when unavailable.
  if (!body.data || !["ok", "degraded", "unavailable"].includes(body.data.status)) throw new Error("Health API sai cấu trúc.");
  if (body.context) { assertScope(body.context); assertSync(body.context.sync); }
  return body;
}

export async function loadProposals(signal?: AbortSignal): Promise<ProposalCollection> {
  if (!apiBaseUrl) return loadProposalFixtures();
  const all: ProposalCollection["proposals"] = [];
  const pageSizes: number[] = [];
  const cursors = new Set<string>();
  let context: FixtureContext | undefined;
  let cursor: string | null = null;
  let totalCount: number | undefined;
  do {
    const query = snapshotQuery(context);
    query.set("limit", "20");
    if (cursor) query.set("cursor", cursor);
    const page = await get("proposals", query, signal) as { context: FixtureContext; data: ProposalCollection["proposals"]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(page.context, context);
    if (!Array.isArray(page.data) || !page.pagination || page.data.length > 20 || !Number.isSafeInteger(page.pagination.totalCount) || page.pagination.totalCount < 0 ||
        page.data.some((item) => !/^(0|[1-9]\d*)$/.test(item.proposalId) || BigInt(item.proposalId) >= 1n << 256n || !/^(0|[1-9]\d*)$/.test(item.amount) || !proposalStatuses.includes(item.state))) {
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
  if (new Set(all.map((item) => item.proposalId)).size !== all.length || all.length !== totalCount) throw new Error("Proposal API bị trùng hoặc thiếu mục.");
  return { context: context!, proposals: all, totalCount, pageSizes };
}

export async function loadSummary(context?: FixtureContext, signal?: AbortSignal): Promise<Summary> {
  if (!apiBaseUrl) {
    return { context: summaryFixture.context, ...summaryFixture.data };
  }
  const response = await get("summary", snapshotQuery(context), signal) as { context: FixtureContext; data: Omit<Summary, "context"> };
  assertContext(response.context, context);
  if (response.data.treasury.address.toLowerCase() !== deployment!.treasury.toLowerCase() ||
      response.data.treasury.token.address.toLowerCase() !== deployment!.budToken.toLowerCase() ||
      response.data.governance.governor.toLowerCase() !== deployment!.governor.toLowerCase() ||
      response.data.governance.timelock.toLowerCase() !== deployment!.timelock.toLowerCase() ||
      response.data.governance.govToken.address.toLowerCase() !== deployment!.govToken.toLowerCase()) {
    throw new Error("Địa chỉ contract trong API không khớp deployment đã cấu hình.");
  }
  return { context: response.context, ...response.data };
}

export async function loadTransfers(context?: FixtureContext, signal?: AbortSignal): Promise<Transfer[]> {
  if (!apiBaseUrl) {
    return [...transfersPage1.data, ...transfersPage2.data];
  }
  const all: Transfer[] = [];
  const cursors = new Set<string>();
  let pinned = context;
  let cursor: string | null = null;
  let count: number | undefined;
  do {
    const query = snapshotQuery(pinned);
    query.set("limit", "20");
    if (cursor) query.set("cursor", cursor);
    const response = await get("treasury/transfers", query, signal) as { context: FixtureContext; data: Transfer[]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(response.context, pinned);
    pinned ??= response.context;
    if (!Array.isArray(response.data) || !response.pagination || !Number.isSafeInteger(response.pagination.totalCount) || response.pagination.totalCount < 0) throw new Error("Lịch sử Treasury sai cấu trúc.");
    count ??= response.pagination.totalCount;
    if (response.pagination.totalCount !== count) throw new Error("Tổng Transfer thay đổi giữa các trang.");
    all.push(...response.data);
    cursor = response.pagination.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor) || response.data.length === 0)) throw new Error("Cursor Transfer bị lặp hoặc không tiến tới trang tiếp theo.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (new Set(all.map((item) => `${item.blockNumber}:${item.logIndex}`)).size !== all.length || all.length !== count) throw new Error("Lịch sử Treasury bị trùng hoặc thiếu mục.");
  return all;
}
