// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Address, Hex } from "viem";
import type * as Viem from "viem";
import { WalletProvider, sendTokenTransaction, useWallet, walletSession } from "./wallet";
import type { WalletState } from "./wallet";
import { sendGovernor } from "./transactions";
import type { InjectedProvider } from "./walletProviders";
import { deferred } from "../test/deferred";

const state = vi.hoisted(() => ({
  deployment: {
    chainId: 31337, deploymentId: "wallet-regression", rpcUrl: "http://127.0.0.1:8545",
    governor: "0x1111111111111111111111111111111111111111",
    treasury: "0x2222222222222222222222222222222222222222",
    govToken: "0x3333333333333333333333333333333333333333",
    budToken: "0x4444444444444444444444444444444444444444",
    timelock: "0x5555555555555555555555555555555555555555",
    chain: { id: 31337, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } },
  },
  rpc: { readContract: vi.fn(), getBytecode: vi.fn(), getChainId: vi.fn() },
}));
vi.mock("./config", () => ({ deployment: state.deployment }));
vi.mock("viem", async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => state.rpc }));
const accountA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const accountB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const hash = `0x${"ab".repeat(32)}` as Hex;
let root: Root;
let wallet: WalletState;
let removeAnnouncements: (() => void) | undefined;

interface TestWallet {
  provider: InjectedProvider;
  request: Mock<({ method }: { method: string }) => Promise<string | Address[]>>;
  emit: (event: string, value: unknown) => void;
}
function injected(accounts: Address[]) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return accounts;
    if (method === "eth_chainId") return "0x7a69";
    if (method === "eth_sendTransaction") return hash;
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  const provider = {
    request,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => { listeners.get(event)?.delete(listener); },
  } as unknown as InjectedProvider;
  return { provider, request, emit: (event: string, value: unknown) => { listeners.get(event)?.forEach((listener) => listener(value)); } };
}

async function mount(...providers: TestWallet[]) {
  const announce = () => providers.forEach(({ provider }, index) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: `wallet-${index}`, name: `Wallet ${index}` }, provider },
  })));
  window.addEventListener("eip6963:requestProvider", announce);
  removeAnnouncements = () => window.removeEventListener("eip6963:requestProvider", announce);
  function Probe() {
    const current = useWallet();
    useLayoutEffect(() => { wallet = current; }, [current]);
    return <span>{current.account}:{current.chainId}</span>;
  }
  await act(async () => { root.render(<WalletProvider><Probe /></WalletProvider>); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.body.appendChild(document.createElement("div")));
  state.rpc.getBytecode.mockReset().mockResolvedValue("0x6000");
  state.rpc.getChainId.mockReset().mockResolvedValue(31337);
  state.rpc.readContract.mockReset().mockImplementation(async ({ functionName, args }) => {
    const addresses: Record<string, string> = { treasury: state.deployment.treasury, token: state.deployment.govToken, timelock: state.deployment.timelock, budgetToken: state.deployment.budToken };
    if (functionName in addresses) return addresses[functionName];
    if (functionName === "delegates") return args[0];
    return args[0] === accountB ? 2n : 1n;
  });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  removeAnnouncements?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("wallet session lifecycle", () => {
  it("does not overwrite newer account or chain events with a delayed connect response", async () => {
    const provider = injected([]);
    await mount(provider);
    const accounts = deferred<Address[]>();
    const chain = deferred<Hex>();
    provider.request.mockImplementation(({ method }) => {
      if (method === "eth_requestAccounts") return accounts.promise;
      if (method === "eth_chainId") return chain.promise;
      throw new Error(`Unexpected request: ${method}`);
    });
    let connecting: Promise<void>;
    await act(async () => { connecting = wallet.connect(); accounts.resolve([accountA]); });
    await act(async () => { provider.emit("accountsChanged", [accountB]); provider.emit("chainChanged", "0x1"); });
    await act(async () => { chain.resolve("0x7a69"); await connecting; });
    expect(wallet.account).toBe(accountB);
    expect(wallet.chainId).toBe(1);
  });

  it("never sends through another provider when selection changes during deployment checks", async () => {
    const first = injected([accountA]);
    const second = injected([accountA]);
    await mount(first, second);
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    const pending = sendGovernor(walletSession(accountA), "castVote", [1n, 1]).catch((error: unknown) => error);
    await act(async () => { wallet.selectWallet("wallet-1"); });
    expect(wallet.account).toBe(accountA);
    bytecode.resolve("0x6000");
    expect(await pending).toMatchObject({ message: expect.stringMatching(/đã thay đổi/) });
    expect(first.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
    expect(second.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it("blocks governor signing when its snapshot is invalidated during deployment RPC checks", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const snapshot = new AbortController();
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    const pending = sendGovernor(walletSession(accountA, snapshot.signal), "castVote", [1n, 1]).catch((error: unknown) => error);
    snapshot.abort();
    bytecode.resolve("0x6000");
    expect(await pending).toBeInstanceOf(Error);
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it("rechecks snapshot validity after an awaited wallet provider check before sending", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const chainRequested = deferred<void>();
    const chain = deferred<Hex>();
    provider.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") {
        chainRequested.resolve();
        return chain.promise;
      }
      if (method === "eth_accounts") return [accountA];
      if (method === "eth_sendTransaction") return hash;
      throw new Error(`Unexpected wallet request: ${method}`);
    });
    const snapshot = new AbortController();
    const pending = sendGovernor(walletSession(accountA, snapshot.signal), "castVote", [1n, 1]).catch((error: unknown) => error);
    await chainRequested.promise;
    snapshot.abort();
    chain.resolve("0x7a69");
    expect(await pending).toBeInstanceOf(Error);
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it("sends the governor action when its provided snapshot signal remains live", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const snapshot = new AbortController();
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    const pending = sendGovernor(walletSession(accountA, snapshot.signal), "castVote", [1n, 1]);
    bytecode.resolve("0x6000");
    expect(await pending).toBe(hash);
    expect(snapshot.signal.aborted).toBe(false);
    const sends = provider.request.mock.calls.filter(([args]) => args.method === "eth_sendTransaction");
    expect(sends).toHaveLength(1);
    const sent = sends[0][0] as unknown as { params: [{ from: string; to: string; data: string }] };
    expect(sent.params[0]).toMatchObject({ from: accountA, to: state.deployment.governor, data: expect.stringMatching(/^0x[0-9a-f]+$/) });
  });

  it("invalidates token signing immediately on an account event, before React commits", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    const pending = sendTokenTransaction(walletSession(accountA), "delegate", [accountA]).catch((error: unknown) => error);
    await act(async () => { provider.emit("accountsChanged", [accountB]); bytecode.resolve("0x6000"); });
    expect(await pending).toMatchObject({ message: expect.stringMatching(/đã thay đổi/) });
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
    expect(wallet.account).toBe(accountB);
  });

  it("still sends the exact token action after a repeated same-account event", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const bytecode = deferred<Hex>();
    state.rpc.getBytecode.mockReturnValueOnce(bytecode.promise);
    const pending = sendTokenTransaction(walletSession(accountA), "delegate", [accountA]);
    await act(async () => { provider.emit("accountsChanged", [accountA]); provider.emit("chainChanged", "0x7a69"); bytecode.resolve("0x6000"); });
    expect(await pending).toBe(hash);
    const sent = provider.request.mock.calls.find(([args]) => args.method === "eth_sendTransaction")?.[0] as unknown as { params: [{ from: string; to: string; data: string }] };
    expect(sent.params[0]).toMatchObject({ from: accountA, to: state.deployment.govToken, data: `0x5c19a95c${accountA.slice(2).padStart(64, "0")}` });
  });

  it("does not let an old receipt callback refresh the account replaced in the same event turn", async () => {
    const provider = injected([accountA]);
    await mount(provider);
    const oldRefresh = wallet.refresh;
    state.rpc.readContract.mockClear();
    await act(async () => { provider.emit("accountsChanged", [accountB]); await oldRefresh(); });
    expect(state.rpc.readContract.mock.calls.every(([args]) => args.args[0] === accountB)).toBe(true);
    expect(wallet.balance).toBe(2n);
    expect(wallet.delegatee).toBe(accountB);
    expect(wallet.votingPower).toBe(2n);
  });
});
