import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, formatUnits, http, isAddress, parseAbi, type Address, type Hash } from "viem";
import { deployment } from "./config";
import { discoverWallets, parseWalletChain, walletErrorMessage, type InjectedProvider, type WalletOption } from "./walletProviders";

// Transactions must use the same provider that the user selected in FE02.
let activeWalletProvider: InjectedProvider | null = null;

const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function delegates(address account) view returns (address)",
  "function getVotes(address account) view returns (uint256)",
  "function getPastVotes(address account,uint256 timepoint) view returns (uint256)",
  "function delegate(address delegatee)",
  "function transfer(address to,uint256 value) returns (bool)",
]);

export const publicClient = deployment ? createPublicClient({ chain: deployment.chain, transport: http(deployment.rpcUrl) }) : null;
export { tokenAbi };

type WalletState = {
  account: Address | null;
  chainId: number | null;
  busy: boolean;
  error: string | null;
  balance: bigint | null;
  delegatee: Address | null;
  votingPower: bigint | null;
  wallets: WalletOption[];
  selectedWalletId: string | null;
  selectWallet: (id: string) => void;
  discover: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [delegatee, setDelegatee] = useState<Address | null>(null);
  const [votingPower, setVotingPower] = useState<bigint | null>(null);
  const readGeneration = useRef(0);
  const sessionGeneration = useRef(0);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const discovery = useRef<ReturnType<typeof discoverWallets> | null>(null);
  const selectedWallet = wallets.find((wallet) => wallet.id === selectedId) ?? wallets[0];
  const provider = selectedWallet?.provider;
  const invalidateSession = useCallback(() => { sessionGeneration.current++; }, []);

  useEffect(() => {
    const listener = discoverWallets(setWallets);
    discovery.current = listener;
    return () => { listener.stop(); discovery.current = null; };
  }, []);

  const clearReads = useCallback(() => {
    readGeneration.current += 1;
    setBalance(null); setDelegatee(null); setVotingPower(null); setError(null);
  }, []);

  useEffect(() => {
    if (!provider) return;
    activeWalletProvider = provider;
    let mounted = true;
    let accountEvent = false;
    let chainEvent = false;
    const generation = ++sessionGeneration.current;
    const accountsChanged = (...args: unknown[]) => {
      accountEvent = true;
      const next = Array.isArray(args[0]) && typeof args[0][0] === "string" && isAddress(args[0][0]) ? args[0][0] as Address : null;
      if (mounted) { setAccount(next); clearReads(); }
    };
    const chainChanged = (...args: unknown[]) => {
      chainEvent = true;
      if (mounted) { setChainId(parseWalletChain(args[0])); clearReads(); }
    };
    const disconnected = () => {
      if (mounted) { sessionGeneration.current++; setAccount(null); setChainId(null); clearReads(); }
    };
    // Never prompt on mount. Only restore accounts already authorized in this wallet.
    Promise.all([provider.request({ method: "eth_accounts" }), provider.request({ method: "eth_chainId" })])
      .then(([accounts, chain]) => {
        if (mounted && generation === sessionGeneration.current) {
          if (!accountEvent) accountsChanged(accounts);
          if (!chainEvent) chainChanged(chain);
        }
      }).catch(() => {});
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnected);
    return () => {
      mounted = false; invalidateSession();
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnected);
      if (activeWalletProvider === provider) activeWalletProvider = null;
    };
  }, [provider, clearReads, invalidateSession]);

  const refresh = useCallback(async () => {
    clearReads();
    const generation = readGeneration.current;
    if (!account || !deployment || !publicClient || chainId !== deployment.chainId) return;
    try {
      const [nextBalance, nextDelegatee, nextVotes] = await Promise.all([
        publicClient.readContract({ address: deployment.govToken, abi: tokenAbi, functionName: "balanceOf", args: [account] }),
        publicClient.readContract({ address: deployment.govToken, abi: tokenAbi, functionName: "delegates", args: [account] }),
        publicClient.readContract({ address: deployment.govToken, abi: tokenAbi, functionName: "getVotes", args: [account] }),
      ]);
      if (generation === readGeneration.current) {
        setBalance(nextBalance); setDelegatee(nextDelegatee); setVotingPower(nextVotes);
      }
    } catch { if (generation === readGeneration.current) setError("Không đọc được thông tin GOV từ RPC. Thử lại sau."); }
  }, [account, chainId, clearReads]);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    if (!provider) { setError("Trang chưa nhận được ví. Hãy mở web trong trình duyệt đã cài và bật tiện ích ví EVM, rồi bấm Tìm lại ví."); return; }
    if (busy) return;
    const generation = ++sessionGeneration.current;
    setBusy(true); setError(null);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof address !== "string" || !isAddress(address)) throw new Error("Ví không trả địa chỉ hợp lệ.");
      const nextChain = parseWalletChain(await provider.request({ method: "eth_chainId" }));
      if (generation !== sessionGeneration.current) return;
      clearReads();
      activeWalletProvider = provider;
      setAccount(address);
      setChainId(nextChain);
    } catch (cause) { if (generation === sessionGeneration.current) setError(walletErrorMessage(cause, "Không kết nối được ví.")); }
    finally { setBusy(false); }
  };

  const disconnect = () => { sessionGeneration.current++; setAccount(null); clearReads(); };
  const selectWallet = (id: string) => {
    if (busy || !wallets.some((wallet) => wallet.id === id) || id === selectedWallet?.id) return;
    sessionGeneration.current++;
    setAccount(null); setChainId(null); clearReads(); setSelectedId(id);
  };
  const discover = () => { setError(null); discovery.current?.scan(); };
  const switchNetwork = async () => {
    if (!provider || !deployment) return;
    setBusy(true); setError(null);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${deployment.chainId.toString(16)}` }] });
      clearReads();
      setChainId(deployment.chainId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chuyển được mạng."); }
    finally { setBusy(false); }
  };

  return <WalletContext.Provider value={{ account, chainId, busy, error, balance, delegatee, votingPower, wallets, selectedWalletId: selectedWallet?.id ?? null, selectWallet, discover, connect, disconnect, switchNetwork, refresh }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("WalletProvider is missing");
  return context;
}

export function walletClient() {
  if (!activeWalletProvider || !deployment) throw new Error("Thiếu ví hoặc cấu hình deployment.");
  return createWalletClient({ chain: deployment.chain, transport: custom(activeWalletProvider) });
}

export function formatGOV(value: bigint | null): string {
  return value === null ? "—" : `${formatUnits(value, 18)} GOV`;
}

export async function pastVotingPower(account: Address, snapshot: string): Promise<bigint> {
  if (!deployment || !publicClient) throw new Error("Thiếu cấu hình deployment.");
  return publicClient.readContract({ address: deployment.govToken, abi: tokenAbi, functionName: "getPastVotes", args: [account, BigInt(snapshot)] });
}

export async function sendTokenTransaction(functionName: "delegate" | "transfer", args: readonly [Address] | readonly [Address, bigint], account: Address): Promise<Hash> {
  if (!deployment || !publicClient) throw new Error("Thiếu cấu hình deployment.");
  const target = functionName === "delegate" ? deployment.govToken : deployment.budToken;
  const code = await publicClient.getBytecode({ address: target });
  if (await publicClient.getChainId() !== deployment.chainId || !code || code === "0x") {
    throw new Error("RPC hoặc token không khớp deployment đã cấu hình.");
  }
  const data = encodeFunctionData({ abi: tokenAbi, functionName, args });
  return walletClient().sendTransaction({ account, to: target, data });
}
