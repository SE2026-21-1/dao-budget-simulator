import proposalsPage1 from "../../../fixtures/api/proposals-page-1.json";
import proposalsPage2 from "../../../fixtures/api/proposals-page-2.json";
import proposalsPage3 from "../../../fixtures/api/proposals-page-3.json";

export const proposalStatuses = [
  "Pending", "Active", "Succeeded", "Defeated", "Queued", "Executed", "Canceled",
] as const;

export type ProposalStatus = (typeof proposalStatuses)[number];

// BE01 dùng chuỗi thập phân cho uint256: không ép Proposal ID hoặc amount sang number.
export interface Proposal {
  proposalId: string;
  requestId: string;
  title: string | null;
  body: string | null;
  description: string;
  amount: string;
  state: ProposalStatus;
  proposer: string;
  recipient: string;
  snapshot: string;
  deadline: string;
  descriptionHash?: string;
  targets?: string[];
  values?: string[];
  calldatas?: string[];
  votes?: { against: string; for: string; abstain: string; quorum: string | null };
  operation?: { eta: string; status: string } | null;
  transactions?: { created: string | null; queued: string | null; executed: string | null; canceled: string | null };
}

export interface FixtureContext {
  chainId: string;
  deploymentId: string;
  snapshotRevision: string;
  asOfBlock: string;
  asOfBlockHash: string;
  dataKind: string;
  asOfTimestamp?: string;
  sync?: { status: string; lagSeconds: string | null; lagBlocks?: string | null };
}

export interface ProposalCollection {
  context: FixtureContext;
  proposals: Proposal[];
  totalCount: number;
  pageSizes: number[];
}

interface RawPage {
  context: FixtureContext;
  data: Array<Omit<Proposal, "state"> & { state: string }>;
  pagination: { limit: number; totalCount: number; nextCursor: string | null };
}

function isProposalStatus(value: string): value is ProposalStatus {
  return proposalStatuses.some((status) => status === value);
}

function validatePage(input: unknown): RawPage {
  const page = input as RawPage;
  if (!page?.context?.asOfBlockHash || !Array.isArray(page.data) || !page.pagination) {
    throw new Error("Fixture BE01 không đúng cấu trúc trang đề xuất.");
  }
  for (const item of page.data) {
    if (!/^\d+$/.test(item.proposalId) || !/^\d+$/.test(item.amount) || !isProposalStatus(item.state)) {
      throw new Error("Fixture BE01 có Proposal ID, amount hoặc state không hợp lệ.");
    }
  }
  return page;
}

export async function loadProposalFixtures(simulateError = false): Promise<ProposalCollection> {
  if (simulateError) throw new Error("Lỗi tải dữ liệu mô phỏng để kiểm tra giao diện.");

  const pages = [proposalsPage1, proposalsPage2, proposalsPage3].map(validatePage);
  const context = pages[0].context;
  const totalCount = pages[0].pagination.totalCount;
  const proposals = pages.flatMap((page) => page.data).map((item) => ({ ...item, state: item.state as ProposalStatus }));
  const ids = new Set(proposals.map((item) => item.proposalId));

  if (pages.some((page) => page.context.chainId !== context.chainId ||
      page.context.deploymentId !== context.deploymentId ||
      page.context.asOfBlock !== context.asOfBlock ||
      page.context.asOfBlockHash !== context.asOfBlockHash ||
      page.context.snapshotRevision !== context.snapshotRevision ||
      page.pagination.totalCount !== totalCount) ||
      ids.size !== proposals.length || proposals.length !== totalCount ||
      pages.at(-1)?.pagination.nextCursor !== null) {
    throw new Error("Các trang fixture BE01 không cùng snapshot hoặc bị trùng/thiếu đề xuất.");
  }

  return { context, proposals, totalCount, pageSizes: pages.map((page) => page.data.length) };
}
