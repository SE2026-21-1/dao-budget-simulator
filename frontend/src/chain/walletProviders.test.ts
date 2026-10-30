import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverWallets, parseWalletChain, switchWalletNetwork, walletErrorMessage, type InjectedProvider, type WalletOption } from "./walletProviders";

afterEach(() => { vi.unstubAllGlobals(); });

const provider = () => ({ request: vi.fn() }) as unknown as InjectedProvider;
function browser() {
  const target = new EventTarget() as EventTarget & { ethereum?: InjectedProvider };
  vi.stubGlobal("window", target);
  return target;
}
function announce(target: EventTarget, wallet: InjectedProvider, name = "Test Wallet") {
  target.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: name, name }, provider: wallet },
  }));
}

describe("FE02 wallet discovery", () => {
  it("discovers an EIP-6963 wallet without window.ethereum and deduplicates announcements", () => {
    const target = browser();
    const wallet = provider();
    const changed = vi.fn();
    target.addEventListener("eip6963:requestProvider", () => announce(target, wallet));
    const discovery = discoverWallets(changed);
    discovery.scan();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0][0]).toMatchObject({ name: "Test Wallet", provider: wallet });
    discovery.stop();
  });

  it("finds delayed legacy injection and multiple wallet extensions", () => {
    const target = browser();
    let wallets: WalletOption[] = [];
    const discovery = discoverWallets((next) => { wallets = next; });
    expect(wallets).toHaveLength(0);
    const first = provider();
    target.ethereum = first;
    target.dispatchEvent(new Event("ethereum#initialized"));
    expect(wallets).toHaveLength(1);
    announce(target, first, "First Wallet");
    announce(target, provider(), "Second Wallet");
    expect(wallets.map((wallet) => wallet.name)).toEqual(["First Wallet", "Second Wallet"]);
    discovery.stop();
    announce(target, provider(), "After cleanup");
    expect(wallets).toHaveLength(2);
  });

  it("rescans on focus, supports legacy provider arrays, and ignores malformed announcements", () => {
    const target = browser();
    let wallets: WalletOption[] = [];
    const discovery = discoverWallets((next) => { wallets = next; });
    target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: null }));
    target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "bad", name: "Bad" }, provider: {} } }));
    expect(wallets).toHaveLength(0);
    target.ethereum = Object.assign(provider(), { providers: [provider(), provider()] });
    target.dispatchEvent(new Event("focus"));
    expect(wallets).toHaveLength(2);
    discovery.stop();
  });
});

describe("FE02 wallet responses", () => {
  it("parses chain IDs without accepting malformed or unsafe values", () => {
    expect(parseWalletChain("0x7a69")).toBe(31337);
    for (const value of ["31337", "0x0", "0x", "0xffffffffffffffffffff", null, 1]) {
      expect(parseWalletChain(value)).toBeNull();
    }
  });

  it("explains rejection and pending requests from plain EIP-1193 errors", () => {
    expect(walletErrorMessage({ code: 4001 }, "fallback")).toContain("từ chối");
    expect(walletErrorMessage({ code: -32002 }, "fallback")).toContain("chờ xử lý");
    expect(walletErrorMessage({ code: -32603, data: { originalError: { code: 4001 } } }, "fallback")).toContain("từ chối");
    expect(walletErrorMessage({}, "fallback")).toBe("fallback");
  });
});

describe("wallet network switching", () => {
  const network = { chainId: 31337, name: "DAO Budget Local", rpcUrl: "http://127.0.0.1:8545" };

  it("adds an unknown chain and verifies the wallet switched", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("0x1")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("0x7a69");
    await switchWalletNetwork({ request } as unknown as InjectedProvider, network);
    expect(request.mock.calls.map(([value]) => value.method)).toEqual([
      "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId", "wallet_switchEthereumChain", "eth_chainId",
    ]);
    expect(request.mock.calls[1][0].params[0]).toMatchObject({
      chainId: "0x7a69", chainName: network.name, rpcUrls: [network.rpcUrl],
    });
  });

  it("does not switch twice when adding the chain already selected it", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("0x7a69")
      .mockResolvedValueOnce("0x7a69");
    await switchWalletNetwork({ request } as unknown as InjectedProvider, network);
    expect(request.mock.calls.map(([value]) => value.method)).toEqual([
      "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId", "eth_chainId",
    ]);
  });

  it("does not add a chain after rejection and does not accept a wrong network", async () => {
    const rejected = vi.fn().mockRejectedValue({ code: 4001 });
    await expect(switchWalletNetwork({ request: rejected } as unknown as InjectedProvider, network)).rejects.toMatchObject({ code: 4001 });
    expect(rejected).toHaveBeenCalledTimes(1);
    const wrongChain = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("0x1");
    await expect(switchWalletNetwork({ request: wrongChain } as unknown as InjectedProvider, network)).rejects.toThrow("Ví chưa chuyển sang mạng");
  });
});
