// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters, toHex } from "viem";
import type { Address, Hex } from "viem";
import type * as Viem from "viem";
import ProposalDetailPage from "./ProposalDetailPage";
import { ApiError } from "../data/api";
import type * as Api from "../data/api";
import type { Proposal, ProposalCollection, ProposalStatus } from "../data/proposals";
import { governorAbi, treasuryAbi } from "../chain/transactions";
import { operationForActions } from "../chain/governanceActions";
import { WalletProvider } from "../chain/wallet";
import type { InjectedProvider } from "../chain/walletProviders";
import { deferred } from "../test/deferred";

const state = vi.hoisted(() => ({
  deployment: {
    chainId: 31337, deploymentId: "snapshot-detail", rpcUrl: "http://127.0.0.1:8545",
    governor: "0x1111111111111111111111111111111111111111",
    treasury: "0x2222222222222222222222222222222222222222",
    govToken: "0x3333333333333333333333333333333333333333",
    budToken: "0x4444444444444444444444444444444444444444",
    timelock: "0x5555555555555555555555555555555555555555",
    chain: { id: 31337, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } },
  },
  rpc: { readContract: vi.fn(), getBytecode: vi.fn(), getChainId: vi.fn(), getBlock: vi.fn(), waitForTransactionReceipt: vi.fn() },
  request: vi.fn(), loadProposals: vi.fn(),
  confirmationMatches: true,
  proposalState: 1,
  pendingState: undefined as Promise<bigint> | undefined,
}));
vi.mock("../chain/config", () => ({
  deployment: state.deployment, apiBaseUrl: "http://api.local", configurationError: null,
  transactionUrl: (hash: string) => `https://explorer.local/tx/${hash}`,
}));
vi.mock("viem", async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => state.rpc }));
vi.mock("../data/api", async (original) => ({ ...await original<typeof Api>(), loadProposals: state.loadProposals }));

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const recipient = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const hash = `0x${"ab".repeat(32)}` as Hex;
const requestId = `0x${"12".repeat(32)}` as Hex;
const description = JSON.stringify({ version: 1, title: "Canonical governance payment", body: "Pay the approved recipient" });
const descriptionHash = keccak256(toHex(description));
const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "disburse", args: [requestId, recipient, 10n ** 18n] });
const proposalId = BigInt(keccak256(encodeAbiParameters(
  parseAbiParameters("address[], uint256[], bytes[], bytes32"),
  [[state.deployment.treasury as Address], [0n], [calldata], descriptionHash],
))).toString();

// A complete, hash-consistent Treasury payload passes the real originalActions guard.
// Creator ownership, positive past votes, no prior vote and a passed ETA make every
// listed action genuinely usable before invalidation; none is a disabled fixture control.
const actions = [
  { proposalState: "Active", label: "Bỏ phiếu", rpcState: 1, functionName: "castVote" },
  { proposalState: "Pending", label: "Hủy đề xuất", rpcState: 0, functionName: "cancel" },
  { proposalState: "Succeeded", label: "Queue", rpcState: 4, functionName: "queue" },
  { proposalState: "Queued", label: "Execute", rpcState: 5, functionName: "execute" },
] as const;
const invalidations = [
  { status: 409, code: "SNAPSHOT_INVALIDATED" },
  { status: 503, code: "DATA_NOT_READY" },
] as const;

function receiptLog(address: Address, signature: string, data: Hex, indexed: Hex[] = []) {
  return { address, data, topics: [keccak256(toHex(signature)), ...indexed] };
}
function confirmedReceipt() {
  const governor = state.deployment.governor as Address;
  const treasury = state.deployment.treasury as Address;
  const timelock = state.deployment.timelock as Address;
  const operation = operationForActions([[treasury], [0n], [calldata], descriptionHash], governor);
  let logs: ReturnType<typeof receiptLog>[];
  if (state.proposalState === 1) {
    logs = [receiptLog(governor, "VoteCast(address,uint256,uint8,uint256,string)",
      encodeAbiParameters(parseAbiParameters("uint256,uint8,uint256,string"), [BigInt(proposalId), 1, 2n * 10n ** 18n, ""]),
      [toHex(BigInt(account), { size: 32 })])];
  } else if (state.proposalState === 0) {
    logs = [receiptLog(governor, "ProposalCanceled(uint256)", encodeAbiParameters(parseAbiParameters("uint256"), [BigInt(proposalId)]))];
  } else if (state.proposalState === 4) {
    logs = [
      receiptLog(governor, "ProposalQueued(uint256,uint256)", encodeAbiParameters(parseAbiParameters("uint256,uint256"), [BigInt(proposalId), 150n])),
      receiptLog(timelock, "CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)",
        encodeAbiParameters(parseAbiParameters("address,uint256,bytes,bytes32,uint256"), [treasury, 0n, calldata, toHex(0n, { size: 32 }), 120n]),
        [operation.id, toHex(0n, { size: 32 })]),
      receiptLog(timelock, "CallSalt(bytes32,bytes32)", encodeAbiParameters(parseAbiParameters("bytes32"), [operation.salt]), [operation.id]),
    ];
  } else {
    logs = [
      receiptLog(governor, "ProposalExecuted(uint256)", encodeAbiParameters(parseAbiParameters("uint256"), [BigInt(proposalId)])),
      receiptLog(timelock, "CallExecuted(bytes32,uint256,address,uint256,bytes)",
        encodeAbiParameters(parseAbiParameters("address,uint256,bytes"), [treasury, 0n, calldata]), [operation.id, toHex(0n, { size: 32 })]),
      receiptLog(treasury, "BudgetDisbursed(bytes32,address,uint256)",
        encodeAbiParameters(parseAbiParameters("uint256"), [10n ** 18n]), [requestId, toHex(BigInt(recipient), { size: 32 })]),
    ];
  }
  return { transactionHash: hash, status: "success" as const, to: governor, blockNumber: 1002n, logs };
}

function collection(proposalState: ProposalStatus, canonical = false): ProposalCollection {
  const proposal: Proposal = {
    proposalId, requestId, title: "Canonical governance payment", body: "Pay the approved recipient", description,
    descriptionHash, targets: [state.deployment.treasury], values: ["0"], calldatas: [calldata],
    amount: "1000000000000000000", state: proposalState, proposer: account, recipient,
    snapshot: "100", deadline: "140", operation: proposalState === "Queued" ? { eta: "150", status: "Ready" } : null,
    votes: { against: "0", for: "2000000000000000000", abstain: "0", quorum: "1000000000000000000" },
  };
  return {
    context: {
      chainId: "31337", deploymentId: state.deployment.deploymentId, dataKind: "chain",
      asOfBlock: canonical ? "1001" : "1000", asOfBlockHash: `0x${(canonical ? "02" : "01").repeat(32)}`,
      snapshotRevision: canonical ? "18" : "17", sync: { status: "synced", lagSeconds: "0", lagBlocks: "0" },
    },
    proposals: [proposal], totalCount: 1, pageSizes: [1],
  };
}

let root: Root;
let container: HTMLDivElement;
let announce: () => void;
function button(label: string) {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing rendered control: ${label}`);
  return found;
}
const click = (label: string) => act(async () => { button(label).click(); });
const refresh = () => click("Tải dữ liệu mới nhất");
const sends = () => state.request.mock.calls.filter(([request]) => request.method === "eth_sendTransaction");
function expectSnapshot(expected: ProposalCollection) {
  const info = container.querySelector('[aria-label="Thông tin snapshot"]')!;
  expect(info.textContent).toContain(`Block ${expected.context.asOfBlock} ·`);
  expect(info.textContent).toContain(expected.context.asOfBlockHash);
  expect(info.textContent).toContain(`Revision ${expected.context.snapshotRevision}`);
}
async function mount(initial: ProposalCollection) {
  state.proposalState = actions.find((action) => action.proposalState === initial.proposals[0].state)!.rpcState;
  state.loadProposals.mockResolvedValueOnce(initial);
  await act(async () => {
    root.render(<WalletProvider><MemoryRouter initialEntries={[`/proposals/${proposalId}`]}>
      <Routes><Route path="/proposals/:id" element={<ProposalDetailPage />} /></Routes>
    </MemoryRouter></WalletProvider>);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  state.pendingState = undefined;
  state.proposalState = 1;
  state.confirmationMatches = true;
  state.loadProposals.mockReset();
  state.rpc.getBytecode.mockReset().mockResolvedValue("0x6000");
  state.rpc.getChainId.mockReset().mockResolvedValue(31337);
  state.rpc.getBlock.mockReset().mockResolvedValue({ timestamp: 200n });
  state.rpc.waitForTransactionReceipt.mockReset().mockImplementation(async () => confirmedReceipt());
  state.rpc.readContract.mockReset().mockImplementation(async ({ functionName, blockNumber }) => {
    if (blockNumber !== undefined) expect(blockNumber).toBe(1002n);
    const addresses: Record<string, string> = {
      treasury: state.deployment.treasury, token: state.deployment.govToken,
      timelock: state.deployment.timelock, budgetToken: state.deployment.budToken, delegates: account,
    };
    if (functionName in addresses) return addresses[functionName];
    if (functionName === "hasVoted") return blockNumber !== undefined;
    if (functionName === "state") return blockNumber === undefined
      ? state.pendingState ?? BigInt(state.proposalState)
      : state.confirmationMatches ? BigInt(({ 1: 1, 0: 2, 4: 5, 5: 7 } as Record<number, number>)[state.proposalState]) : 3n;
    if (functionName === "hasRole") return true;
    if (functionName === "getOperationState") return blockNumber === undefined ? state.proposalState === 5 ? 2n : 0n : state.proposalState === 5 ? 3n : 1n;
    if (functionName === "getTimestamp" || functionName === "proposalEta") return 150n;
    if (functionName === "paidRequests") return blockNumber !== undefined && state.proposalState === 5;
    if (["balanceOf", "getVotes", "getPastVotes"].includes(functionName)) return 2n * 10n ** 18n;
    throw new Error(`Unexpected RPC read: ${functionName}`);
  });
  state.request.mockReset().mockImplementation(async ({ method }) => {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
    if (method === "eth_chainId") return "0x7a69";
    if (method === "eth_sendTransaction") return hash;
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  const provider = { request: state.request } as unknown as InjectedProvider;
  announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: "snapshot-detail-wallet", name: "Snapshot detail wallet" }, provider },
  }));
  window.addEventListener("eip6963:requestProvider", announce);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  window.removeEventListener("eip6963:requestProvider", announce);
  container.remove();
  vi.unstubAllGlobals();
});

describe.each(invalidations)("proposal detail $status $code recovery", ({ status, code }) => {
  it.each(actions)("blocks a valid $proposalState $label until a complete canonical reload succeeds", async ({ proposalState, label, functionName }) => {
    const old = collection(proposalState);
    const canonical = collection(proposalState, true);
    await mount(old);
    const control = button(label);
    expect(control.disabled).toBe(false);
    expectSnapshot(old);

    state.loadProposals.mockRejectedValueOnce(new ApiError(status, code, "Publication withdrawn"));
    await refresh();
    expectSnapshot(old);
    expect(container.textContent).toContain(code);
    expect(button(label)).toBe(control);
    expect(control.disabled).toBe(true);
    await click(label);
    expect(sends()).toHaveLength(0);

    const unavailable = deferred<ProposalCollection>();
    state.loadProposals.mockReturnValueOnce(unavailable.promise);
    await refresh();
    expectSnapshot(old);
    expect(control.disabled).toBe(true);
    expect(container.textContent).toContain("Đang tải snapshot mới nhất");
    await click(label);
    await act(async () => { unavailable.reject(new Error("Indexer transport unavailable")); });
    expect(container.textContent).toContain("Indexer transport unavailable");
    expectSnapshot(old);
    expect(control.disabled).toBe(true);
    await click(label);
    expect(sends()).toHaveLength(0);

    const recovery = deferred<ProposalCollection>();
    state.loadProposals.mockReturnValueOnce(recovery.promise);
    await refresh();
    expectSnapshot(old);
    expect(control.disabled).toBe(true);
    await click(label);
    expect(sends()).toHaveLength(0);
    await act(async () => { recovery.resolve(canonical); });
    expectSnapshot(canonical);
    expect(container.textContent).not.toContain("Indexer transport unavailable");
    expect(button(label)).toBe(control);
    expect(control.disabled).toBe(false);

    // Positive control: the recovered button completes the real transaction hook,
    // governor payload validation, RPC deployment checks and injected-wallet send.
    state.loadProposals.mockResolvedValue(canonical);
    await click(label);
    expect(sends()).toHaveLength(1);
    const sent = sends()[0][0].params[0];
    expect(sent.to.toLowerCase()).toBe(state.deployment.governor);
    expect(decodeFunctionData({ abi: governorAbi, data: sent.data }).functionName).toBe(functionName);
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(hash);
  });

  it("retains an in-flight and then confirmed receipt through invalidation, failed retry and recovery", async () => {
    const old = collection("Active");
    const canonical = collection("Succeeded", true);
    await mount(old);
    const receipt = deferred<ReturnType<typeof confirmedReceipt>>();
    state.rpc.waitForTransactionReceipt.mockReturnValueOnce(receipt.promise);
    await click("Bỏ phiếu");
    expect(sends()).toHaveLength(1);
    expect(container.textContent).toContain("Đang chờ xác nhận trên chain");
    const statusNode = container.querySelector(".transaction-status")!;
    expect(statusNode.textContent).toContain(hash);

    state.loadProposals.mockRejectedValueOnce(new ApiError(status, code, "Publication withdrawn"));
    await refresh();
    expectSnapshot(old);
    expect(container.textContent).toContain(code);
    expect(button("Bỏ phiếu").disabled).toBe(true);
    expect(container.querySelector(".transaction-status")).toBe(statusNode);
    expect(statusNode.textContent).toContain(hash);

    // Receipt confirmation triggers a real onConfirmed refresh. A generic failure
    // after the invalidation must not clear that receipt or restore write access.
    state.loadProposals.mockRejectedValueOnce(new Error("Indexer still unavailable"));
    await act(async () => { receipt.resolve(confirmedReceipt()); });
    expect(container.textContent).toContain("Indexer still unavailable");
    expect(container.querySelector(".transaction-status")).toBe(statusNode);
    expect(statusNode.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(statusNode.textContent).toContain(hash);
    expect(button("Bỏ phiếu").disabled).toBe(true);
    await click("Bỏ phiếu");
    expect(sends()).toHaveLength(1);

    const recovery = deferred<ProposalCollection>();
    state.loadProposals.mockReturnValueOnce(recovery.promise);
    await refresh();
    expectSnapshot(old);
    expect(button("Bỏ phiếu").disabled).toBe(true);
    expect(container.querySelector(".transaction-status")).toBe(statusNode);
    await act(async () => { recovery.resolve(canonical); });
    expectSnapshot(canonical);
    expect(button("Queue").disabled).toBe(false);
    expect(container.querySelector(".transaction-status")).toBe(statusNode);
    expect(statusNode.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(statusNode.textContent).toContain(hash);
    expect(container.querySelector<HTMLAnchorElement>(`.transaction-status a`)!.href).toBe(`https://explorer.local/tx/${hash}`);
    expect(sends()).toHaveLength(1);
  });

  it("never sends an old in-flight action after canonical recovery replaces its revoked snapshot", async () => {
    const old = collection("Active");
    const canonical = collection("Active", true);
    await mount(old);
    expect(button("Bỏ phiếu").disabled).toBe(false);
    const preflight = deferred<bigint>();
    state.pendingState = preflight.promise;
    await click("Bỏ phiếu");
    expect(container.textContent).toContain("Đang chờ ký trong ví");
    expect(sends()).toHaveLength(0);

    state.loadProposals.mockRejectedValueOnce(new ApiError(status, code, "Publication withdrawn"));
    await refresh();
    expectSnapshot(old);
    expect(button("Bỏ phiếu").disabled).toBe(true);
    state.loadProposals.mockResolvedValueOnce(canonical);
    await refresh();
    expectSnapshot(canonical);
    expect(button("Bỏ phiếu").disabled).toBe(true);

    // This continues the old page action, not a fresh click. Even a successful
    // replacement publication cannot authorize a session captured at the old H.
    state.pendingState = undefined;
    await act(async () => { preflight.resolve(1n); });
    expect(sends()).toHaveLength(0);
    expect(button("Bỏ phiếu").disabled).toBe(false);
    state.loadProposals.mockResolvedValue(canonical);
    await click("Bỏ phiếu");
    expect(sends()).toHaveLength(1);
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
  });
});

describe("receipt confirmation is not merely status=success", () => {
  it.each(["missing event", "wrong emitter", "wrong receipt-block state"] as const)("retains hash and rejects %s before displaying success", async (failure) => {
    const snapshot = collection("Active");
    await mount(snapshot);
    const receipt = confirmedReceipt();
    if (failure === "missing event") receipt.logs = [];
    if (failure === "wrong emitter") receipt.logs = receipt.logs.map((log) => ({ ...log, address: recipient }));
    if (failure === "wrong receipt-block state") state.confirmationMatches = false;
    state.rpc.waitForTransactionReceipt.mockResolvedValueOnce(receipt);
    state.loadProposals.mockResolvedValue(snapshot);
    await click("Bỏ phiếu");
    expect(sends()).toHaveLength(1);
    const status = container.querySelector(".transaction-status")!;
    expect(status.textContent).toContain(hash);
    expect(status.textContent).not.toContain("Giao dịch đã được xác nhận.");
    expect(status.textContent).toMatch(failure === "wrong receipt-block state" ? /Governor chưa ghi nhận phiếu/ : /Receipt thiếu VoteCast/);
    state.confirmationMatches = true;
    await click("Bỏ phiếu");
    expect(sends()).toHaveLength(2);
    expect(status.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(status.textContent).toContain(hash);
  });
});
