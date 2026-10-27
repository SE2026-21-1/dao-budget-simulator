import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverWallets, parseWalletChain, walletErrorMessage, type InjectedProvider, type WalletOption } from "./walletProviders";

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
