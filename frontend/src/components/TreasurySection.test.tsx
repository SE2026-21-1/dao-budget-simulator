// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TreasurySection from "./TreasurySection";
import DashboardPage from "../pages/DashboardPage";
import type { FixtureContext, ProposalCollection } from "../data/proposals";
import type { Summary } from "../data/api";
import type * as Transactions from "../chain/transactions";
import { deferred } from "../test/deferred";

const state = vi.hoisted(() => ({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  hash: `0x${"ab".repeat(32)}`,
  deployment: { chainId: 31337, deploymentId: "receipt-lifecycle", treasury: "0x1111111111111111111111111111111111111111" },
  sendTokenTransaction: vi.fn(), verifyDeployment: vi.fn(), waitForReceipt: vi.fn(),
  loadSummary: vi.fn(), loadTransfers: vi.fn(), loadProposals: vi.fn(),
}));
vi.mock("../chain/config", () => ({ deployment: state.deployment, apiBaseUrl: "http://api.local", transactionUrl: () => null }));
vi.mock("../chain/wallet", () => ({
  useWallet: () => ({ account: state.account, chainId: 31337 }),
  publicClient: {}, sendTokenTransaction: state.sendTokenTransaction, walletSession: () => ({ send: vi.fn() }),
}));
vi.mock("../chain/transactions", async (original) => ({
  ...await original<typeof Transactions>(), verifyDeployment: state.verifyDeployment, waitForReceipt: state.waitForReceipt,
}));
vi.mock("../data/api", () => ({ loadSummary: state.loadSummary, loadTransfers: state.loadTransfers, loadProposals: state.loadProposals }));

let root: Root;
let container: HTMLDivElement;
const context: FixtureContext = { chainId: "31337", deploymentId: "receipt-lifecycle", dataKind: "chain", snapshotRevision: "1", asOfBlock: "10", asOfBlockHash: `0x${"01".repeat(32)}` };
const summary: Summary = {
  context,
  treasury: { address: state.deployment.treasury, token: { address: "0x2222222222222222222222222222222222222222" }, balance: "1000000000000000000", totalIn: "1000000000000000000", totalOut: "0" },
  proposalCounts: { total: 0, byState: {} },
  governance: { governor: "0x3333333333333333333333333333333333333333", timelock: "0x4444444444444444444444444444444444444444", govToken: { address: "0x5555555555555555555555555555555555555555" }, proposalThreshold: "1" },
  recentActivity: [],
};
const collection: ProposalCollection = { context, proposals: [], totalCount: 0, pageSizes: [0] };

function button(label: string) {
  return [...container.querySelectorAll("button")].find((element) => element.textContent === label)!;
}
async function deposit() {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>("#deposit-amount")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Nạp quỹ").click(); });
  expect(state.sendTokenTransaction).toHaveBeenCalledWith(expect.objectContaining({ send: expect.any(Function) }), "transfer", [state.deployment.treasury, 2n * 10n ** 18n]);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  state.sendTokenTransaction.mockReset().mockResolvedValue(state.hash);
  state.verifyDeployment.mockReset().mockResolvedValue(undefined);
  state.waitForReceipt.mockReset().mockResolvedValue({ transactionHash: state.hash, status: "success", logs: [] });
  state.loadSummary.mockReset().mockResolvedValue(summary);
  state.loadTransfers.mockReset().mockResolvedValue([]);
  state.loadProposals.mockReset().mockResolvedValue(collection);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Treasury receipt lifecycle", () => {
  it("keeps a confirmed deposit visible when the automatic proposal refresh fails, then recovers", async () => {
    state.loadProposals.mockResolvedValueOnce(collection).mockRejectedValueOnce(new Error("Publication unavailable"));
    await act(async () => { root.render(<MemoryRouter><DashboardPage /></MemoryRouter>); });
    await deposit();
    expect(container.textContent).toContain("Publication unavailable");
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(container.querySelector<HTMLInputElement>("#deposit-amount")!.value).toBe("2");
    const nextContext = { ...context, asOfBlock: "11", asOfBlockHash: `0x${"02".repeat(32)}` };
    state.loadProposals.mockResolvedValueOnce({ ...collection, context: nextContext });
    state.loadSummary.mockResolvedValueOnce({ ...summary, context: nextContext });
    await act(async () => { button("Tải dữ liệu mới nhất").click(); });
    expect(container.textContent).not.toContain("Publication unavailable");
    expect(container.textContent).toContain("block 11");
    expect(container.textContent).toContain(state.hash);
    expect(state.sendTokenTransaction).toHaveBeenCalledTimes(1);
  });

  it("shows the receipt while Treasury loads a newer context and after that read fails", async () => {
    const onConfirmed = vi.fn();
    await act(async () => { root.render(<TreasurySection context={context} onConfirmed={onConfirmed} />); });
    await deposit();
    const pending = deferred<Summary>();
    state.loadSummary.mockReturnValueOnce(pending.promise);
    await act(async () => { root.render(<TreasurySection context={{ ...context, asOfBlock: "11" }} onConfirmed={onConfirmed} />); });
    expect(container.textContent).toContain("Đang tải dữ liệu Treasury");
    expect(container.textContent).toContain(state.hash);
    await act(async () => { pending.reject(new Error("Snapshot invalidated")); });
    expect(container.textContent).toContain("Snapshot invalidated");
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
