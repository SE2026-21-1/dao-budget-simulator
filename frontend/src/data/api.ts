import { apiBaseUrl, deployment } from "../chain/config";
import { loadProposalFixtures, type FixtureContext, type ProposalCollection } from "./proposals";

export interface Summary {
  context: FixtureContext;
  treasury: { address: string; token: { address: string }; balance: string; totalIn: string; totalOut: string };
  proposalCounts: { total: number; byState: Record<string, number> };
  governance: { governor: string; govToken: { address: string }; proposalThreshold: string };
  recentActivity: Transfer[];
}

export interface Transfer {
  from: string; to: string; amount: string; direction: string;
  transactionHash: string; blockNumber: string; proposalId: string | null;
}

function snapshotQuery(context?: FixtureContext) {
  const query = new URLSearchParams({ chainId: String(deployment!.chainId), deploymentId: deployment!.deploymentId });
  if (context) { query.set("asOfBlock", context.asOfBlock); query.set("asOfBlockHash", context.asOfBlockHash); }
  return query;
}

async function get(path: string, query: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/${path}?${query}`, { signal });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`API ${response.status}: ${typeof body === "object" && body && "message" in body ? String(body.message) : "Không tải được dữ liệu."}`);
  return body;
}

function assertContext(context: FixtureContext, pinned?: FixtureContext) {
  if (!deployment || context.dataKind !== "chain" || context.chainId !== String(deployment.chainId) || context.deploymentId !== deployment.deploymentId ||
      !context.asOfBlock || !context.asOfBlockHash ||
      (pinned && (context.asOfBlock !== pinned.asOfBlock || context.asOfBlockHash !== pinned.asOfBlockHash || context.snapshotRevision !== pinned.snapshotRevision))) {
    throw new Error("Snapshot API không khớp chain/deployment hoặc đã thay đổi khi phân trang.");
  }
}

export async function loadProposals(signal?: AbortSignal): Promise<ProposalCollection> {
  if (!apiBaseUrl || !deployment) return loadProposalFixtures();
  const all: ProposalCollection["proposals"] = [];
  const pageSizes: number[] = [];
  let context: FixtureContext | undefined;
  let cursor: string | null = null;
  let totalCount = 0;
  do {
    const query = snapshotQuery(context);
    query.set("limit", "20");
    if (cursor) query.set("cursor", cursor);
    const page = await get("proposals", query, signal) as { context: FixtureContext; data: ProposalCollection["proposals"]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(page.context, context);
    if (!Array.isArray(page.data) || !page.pagination || page.data.length > 20) throw new Error("Trang API proposal sai cấu trúc.");
    context ??= page.context;
    if (pageSizes.length === 0) totalCount = page.pagination.totalCount;
    if (page.pagination.totalCount !== totalCount) throw new Error("Tổng số proposal thay đổi giữa các trang.");
    all.push(...page.data);
    pageSizes.push(page.data.length);
    cursor = page.pagination.nextCursor;
    if (pageSizes.length > 1000) throw new Error("API phân trang quá nhiều lần.");
  } while (cursor);
  if (new Set(all.map((item) => item.proposalId)).size !== all.length || all.length !== totalCount) throw new Error("Proposal API bị trùng hoặc thiếu mục.");
  return { context: context!, proposals: all, totalCount, pageSizes };
}

export async function loadSummary(context?: FixtureContext, signal?: AbortSignal): Promise<Summary> {
  if (!apiBaseUrl || !deployment) {
    const module = await import("./fixtures/summary.json");
    const fixture = module.default;
    return { context: fixture.context, ...fixture.data };
  }
  const response = await get("summary", snapshotQuery(context), signal) as { context: FixtureContext; data: Omit<Summary, "context"> };
  assertContext(response.context, context);
  if (response.data.treasury.address.toLowerCase() !== deployment.treasury.toLowerCase() ||
      response.data.treasury.token.address.toLowerCase() !== deployment.budToken.toLowerCase() ||
      response.data.governance.governor.toLowerCase() !== deployment.governor.toLowerCase() ||
      response.data.governance.govToken.address.toLowerCase() !== deployment.govToken.toLowerCase()) {
    throw new Error("Địa chỉ contract trong API không khớp deployment đã cấu hình.");
  }
  return { context: response.context, ...response.data };
}

export async function loadTransfers(context?: FixtureContext, signal?: AbortSignal): Promise<Transfer[]> {
  if (!apiBaseUrl || !deployment) {
    const pages = await Promise.all([import("./fixtures/transfers-page-1.json"), import("./fixtures/transfers-page-2.json")]);
    return pages.flatMap((item) => item.default.data);
  }
  const all: Transfer[] = [];
  let cursor: string | null = null;
  let count = 0;
  do {
    const query = snapshotQuery(context);
    query.set("limit", "20");
    if (cursor) query.set("cursor", cursor);
    const response = await get("treasury/transfers", query, signal) as { context: FixtureContext; data: Transfer[]; pagination: { totalCount: number; nextCursor: string | null } };
    assertContext(response.context, context);
    if (!Array.isArray(response.data)) throw new Error("Lịch sử Treasury sai cấu trúc.");
    if (count === 0) count = response.pagination.totalCount;
    all.push(...response.data);
    cursor = response.pagination.nextCursor;
    if (all.length > 10000) throw new Error("Lịch sử Treasury quá dài.");
  } while (cursor);
  if (all.length !== count) throw new Error("Lịch sử Treasury bị thiếu mục.");
  return all;
}
