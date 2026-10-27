import type { EIP1193Provider } from "viem";

export type InjectedProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: InjectedProvider[];
  isMetaMask?: boolean;
};

declare global {
  interface Window { ethereum?: InjectedProvider }
}

export interface WalletOption {
  id: string;
  name: string;
  provider: InjectedProvider;
}

// Discover both EIP-6963 wallets and legacy injections, including late injections.
export function discoverWallets(onChange: (wallets: WalletOption[]) => void) {
  const wallets: WalletOption[] = [];
  const add = (provider: InjectedProvider | undefined, name: string, id?: string) => {
    if (!provider || typeof provider.request !== "function") return;
    const existing = wallets.find((wallet) => wallet.provider === provider);
    if (existing) {
      if (id && existing.name !== name) {
        existing.name = name;
        onChange([...wallets]);
      }
      return;
    }
    wallets.push({ id: id || `injected-${wallets.length}`, name, provider });
    onChange([...wallets]);
  };
  const announce = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail as {
      info?: { uuid?: string; name?: string }; provider?: InjectedProvider;
    } | undefined;
    if (typeof detail?.info?.uuid === "string" && typeof detail.info.name === "string") {
      add(detail.provider, detail.info.name, detail.info.uuid);
    }
  };
  const scan = () => {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const providers = window.ethereum?.providers?.length ? window.ethereum.providers : [window.ethereum];
    providers.forEach((provider, index) => add(provider, provider?.isMetaMask ? "MetaMask" : `Ví EVM${index ? ` ${index + 1}` : ""}`));
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.addEventListener("ethereum#initialized", scan);
  window.addEventListener("focus", scan);
  scan();
  return {
    scan,
    stop: () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      window.removeEventListener("ethereum#initialized", scan);
      window.removeEventListener("focus", scan);
    },
  };
}

export function parseWalletChain(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number(BigInt(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function walletErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { code?: unknown; data?: { originalError?: { code?: unknown } }; cause?: unknown };
  if (typeof value.code === "number" && value.code !== -32603) return value.code;
  const originalCode = value.data?.originalError?.code;
  return typeof originalCode === "number" ? originalCode : undefined;
}

export function walletErrorMessage(error: unknown, fallback: string): string {
  switch (walletErrorCode(error)) {
    case 4001: return "Bạn đã từ chối yêu cầu trong ví. Có thể thử lại khi sẵn sàng.";
    case -32002: return "Ví đang có yêu cầu chờ xử lý. Mở tiện ích ví để xác nhận hoặc hủy yêu cầu đó.";
    case 4100: return "Ví chưa cấp quyền cho trang này. Hãy kết nối lại và cho phép truy cập tài khoản.";
    case 4900: return "Ví đang mất kết nối. Mở ví, kiểm tra mạng rồi thử lại.";
  }
  return error instanceof Error ? error.message : fallback;
}

