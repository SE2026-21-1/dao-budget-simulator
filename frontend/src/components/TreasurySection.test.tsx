// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TreasurySection from "./TreasurySection";
import DashboardPage from "../pages/DashboardPage";
import type { FixtureContext, ProposalCollection } from "../data/proposals";
import { ApiError, type Summary } from "../data/api";
import type * as Api from "../data/api";
import type * as Viem from "viem";
import type { Hex } from "viem";
import type * as Wallet from "../chain/wallet";
import { WalletProvider } from "../chain/wallet";
import type * as Transactions from "../chain/transactions";
import { deferred } from "../test/deferred";

const state = vi.hoisted(() => ({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  hash: `0x${"ab".repeat(32)}`,
  deployment: {
    chainId: 31337, deploymentId: "receipt-lifecycle", rpcUrl: "http://127.0.0.1:8545",
    treasury: "0x1111111111111111111111111111111111111111",
    budToken: "0x2222222222222222222222222222222222222222",
    governor: "0x3333333333333333333333333333333333333333",
    timelock: "0x4444444444444444444444444444444444444444",
    govToken: "0x5555555555555555555555555555555555555555",
    chain: { id: 31337, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } },
  },
  sendTokenTransaction: vi.fn(), walletSession: vi.fn(), verifyDeployment: vi.fn(), waitForReceipt: vi.fn(),
  loadSummary: vi.fn(), loadTransfers: vi.fn(), loadProposals: vi.fn(),
  rpc: { readContract: vi.fn(), getBytecode: vi.fn(), getChainId: vi.fn() },
}));
vi.mock("../chain/config", () => ({ deployment: state.deployment, apiBaseUrl: "http://api.local", transactionUrl: () => null }));
vi.mock("viem", async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => state.rpc }));
vi.mock("../chain/wallet", async (original) => ({
  ...await original<typeof Wallet>(),
  useWallet: () => ({ account: state.account, chainId: 31337 }),
  sendTokenTransaction: state.sendTokenTransaction, walletSession: state.walletSession,
}));
vi.mock("../chain/transactions", async (original) => ({
  ...await original<typeof Transactions>(), verifyDeployment: state.verifyDeployment, waitForReceipt: state.waitForReceipt,
}));
vi.mock("../data/api", async (original) => ({
  ...await original<typeof Api>(),
  loadSummary: state.loadSummary, loadTransfers: state.loadTransfers, loadProposals: state.loadProposals,
  loadTreasurySnapshot: async (context: FixtureContext, signal: AbortSignal) => {
    const [summary, transfers] = await Promise.all([state.loadSummary(context, signal), state.loadTransfers(context, signal)]);
    return { summary, transfers };
  },
}));

let root: Root;
let container: HTMLDivElement;
let removeAnnouncements: (() => void) | undefined;
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
  state.walletSession.mockReset().mockReturnValue({ send: vi.fn() });
  state.rpc.readContract.mockReset().mockResolvedValue(1n);
  state.rpc.getBytecode.mockReset().mockResolvedValue("0x6000");
  state.rpc.getChainId.mockReset().mockResolvedValue(31337);
  state.verifyDeployment.mockReset().mockResolvedValue(undefined);
  state.waitForReceipt.mockReset().mockResolvedValue({ transactionHash: state.hash, status: "success", logs: [] });
  state.loadSummary.mockReset().mockResolvedValue(summary);
  state.loadTransfers.mockReset().mockResolvedValue([]);
  state.loadProposals.mockReset().mockResolvedValue(collection);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  removeAnnouncements?.();
  removeAnnouncements = undefined;
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
    expect(button("Nạp quỹ").disabled).toBe(false);
    expect(container.textContent).toContain(state.hash);
    expect(container.querySelector<HTMLInputElement>("#deposit-amount")!.value).toBe("2");
    const nextContext = { ...context, snapshotRevision: "2", asOfBlock: "11", asOfBlockHash: `0x${"02".repeat(32)}` };
    state.loadProposals.mockResolvedValueOnce({ ...collection, context: nextContext });
    state.loadSummary.mockResolvedValueOnce({ ...summary, context: nextContext });
    await act(async () => { button("Tải dữ liệu mới nhất").click(); });
    expect(container.textContent).not.toContain("Publication unavailable");
    expect(container.textContent).toContain("block 11");
    expect(container.textContent).toContain(state.hash);
    expect(state.sendTokenTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 409, code: "SNAPSHOT_INVALIDATED" },
    { status: 503, code: "SNAPSHOT_NOT_READY" },
  ])("retains a confirmed deposit but blocks stale signing after collection refresh $status until canonical recovery", async ({ status, code }) => {
    state.loadProposals.mockResolvedValueOnce(collection).mockRejectedValueOnce(new ApiError(status, code, "Snapshot unavailable"));
    await act(async () => { root.render(<MemoryRouter><DashboardPage /></MemoryRouter>); });
    const input = container.querySelector<HTMLInputElement>("#deposit-amount")!;
    await deposit();
    expect(container.textContent).toContain(`${code}: Snapshot unavailable`);
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(container.querySelector("#deposit-amount")).toBe(input);
    expect(input.value).toBe("2");
    expect(button("Nạp quỹ").disabled).toBe(true);
    const staleSnapshot = container.querySelector('[aria-label="Thông tin snapshot"]')!;
    expect(staleSnapshot.textContent).toContain("Block 10");
    expect(staleSnapshot.textContent).toContain(context.asOfBlockHash);
    expect(staleSnapshot.textContent).toContain("Revision 1");

    const failedRetry = deferred<ProposalCollection>();
    state.loadProposals.mockReturnValueOnce(failedRetry.promise);
    await act(async () => { button("Tải dữ liệu mới nhất").click(); });
    expect(button("Nạp quỹ").disabled).toBe(true);
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    await act(async () => { failedRetry.reject(new Error("Network still unavailable")); });
    expect(container.textContent).toContain("Network still unavailable");
    expect(button("Nạp quỹ").disabled).toBe(true);
    expect(container.querySelector("#deposit-amount")).toBe(input);

    const canonicalRetry = deferred<ProposalCollection>();
    const nextContext = { ...context, snapshotRevision: "2", asOfBlock: "11", asOfBlockHash: `0x${"02".repeat(32)}` };
    state.loadProposals.mockReturnValueOnce(canonicalRetry.promise);
    state.loadSummary.mockResolvedValueOnce({ ...summary, context: nextContext });
    await act(async () => { button("Tải dữ liệu mới nhất").click(); });
    expect(button("Nạp quỹ").disabled).toBe(true);
    expect(container.textContent).toContain(state.hash);
    await act(async () => { canonicalRetry.resolve({ ...collection, context: nextContext }); });
    expect(button("Nạp quỹ").disabled).toBe(false);
    expect(container.textContent).not.toContain("Network still unavailable");
    const recoveredSnapshot = container.querySelector('[aria-label="Thông tin snapshot"]')!;
    expect(recoveredSnapshot.textContent).toContain("Block 11");
    expect(recoveredSnapshot.textContent).toContain(nextContext.asOfBlockHash);
    expect(recoveredSnapshot.textContent).toContain("Revision 2");
    expect(state.loadSummary).toHaveBeenLastCalledWith(nextContext, expect.any(AbortSignal));
    expect(container.querySelector<HTMLInputElement>("#deposit-amount")!.value).toBe("2");
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(state.sendTokenTransaction).toHaveBeenCalledTimes(1);
  });

  it("shows the receipt while Treasury loads a newer context and after that read fails", async () => {
    const onConfirmed = vi.fn();
    const onSnapshotError = vi.fn();
    const snapshotSignal = new AbortController().signal;
    await act(async () => { root.render(<TreasurySection context={context} snapshotSignal={snapshotSignal} onConfirmed={onConfirmed} onSnapshotError={onSnapshotError} />); });
    await deposit();
    const pending = deferred<Summary>();
    state.loadSummary.mockReturnValueOnce(pending.promise);
    await act(async () => { root.render(<TreasurySection context={{ ...context, asOfBlock: "11" }} snapshotSignal={snapshotSignal} onConfirmed={onConfirmed} onSnapshotError={onSnapshotError} />); });
    expect(container.textContent).toContain("Đang tải dữ liệu Treasury");
    expect(container.textContent).toContain(state.hash);
    await act(async () => { pending.reject(new Error("Snapshot invalidated")); });
    expect(container.textContent).toContain("Snapshot invalidated");
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onSnapshotError).toHaveBeenCalledWith(expect.objectContaining({ message: "Snapshot invalidated" }));
  });

  it.each(["snapshot lease", "Treasury context"])("never sends a deposit invalidated by %s during token RPC prerequisites", async (invalidation) => {
    const actualWallet = await vi.importActual<typeof Wallet>("../chain/wallet");
    state.walletSession.mockImplementation(actualWallet.walletSession);
    state.sendTokenTransaction.mockImplementation(actualWallet.sendTokenTransaction);
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [state.account];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "eth_sendTransaction") return state.hash;
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid: "deposit-wallet", name: "Deposit wallet" }, provider: { request } },
    }));
    window.addEventListener("eip6963:requestProvider", announce);
    removeAnnouncements = () => window.removeEventListener("eip6963:requestProvider", announce);
    const controller = new AbortController();
    const onConfirmed = vi.fn();
    const onSnapshotError = vi.fn();
    await act(async () => { root.render(<WalletProvider><TreasurySection context={context} snapshotSignal={controller.signal} onConfirmed={onConfirmed} onSnapshotError={onSnapshotError} /></WalletProvider>); });
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    await deposit();
    expect(state.rpc.getBytecode).toHaveBeenCalledWith({ address: state.deployment.budToken });
    expect(request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
    await act(async () => {
      if (invalidation === "snapshot lease") controller.abort();
      else root.render(<WalletProvider><TreasurySection context={{ ...context, snapshotRevision: "2", asOfBlock: "11", asOfBlockHash: `0x${"02".repeat(32)}` }} snapshotSignal={controller.signal} onConfirmed={onConfirmed} onSnapshotError={onSnapshotError} /></WalletProvider>);
    });
    await act(async () => { bytecode.resolve("0x6000"); });
    expect(request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
    expect(state.waitForReceipt).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(invalidation === "snapshot lease");
    if (invalidation === "snapshot lease") expect(button("Nạp quỹ").disabled).toBe(true);
  });
});
