import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, formatUnits, http, isAddress, parseAbi, type Address, type EIP1193Provider, type Hash } from "viem";
import { deployment } from "./config";

declare global {
  interface Window { ethereum?: EIP1193Provider & {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  } }
}

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
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

function parseChain(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number(BigInt(value));
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [delegatee, setDelegatee] = useState<Address | null>(null);
  const [votingPower, setVotingPower] = useState<bigint | null>(null);
  const readGeneration = useRef(0);

  const clearReads = useCallback(() => {
    readGeneration.current += 1;
    setBalance(null); setDelegatee(null); setVotingPower(null); setError(null);
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    let mounted = true;
    const accountsChanged = (...args: unknown[]) => {
      const next = Array.isArray(args[0]) && typeof args[0][0] === "string" && isAddress(args[0][0]) ? args[0][0] as Address : null;
      if (mounted) { setAccount(next); clearReads(); }
    };
    const chainChanged = (...args: unknown[]) => {
      if (mounted) { setChainId(parseChain(args[0])); clearReads(); }
    };
    provider.request({ method: "eth_accounts" }).then((accounts) => { if (mounted) accountsChanged(accounts); }).catch(() => {});
    provider.request({ method: "eth_chainId" }).then((chain) => { if (mounted) chainChanged(chain); }).catch(() => {});
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    return () => { mounted = false; provider.removeListener?.("accountsChanged", accountsChanged); provider.removeListener?.("chainChanged", chainChanged); };
  }, [clearReads]);

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
    if (!window.ethereum) { setError("Chưa tìm thấy ví EVM trong trình duyệt."); return; }
    setBusy(true); setError(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof address !== "string" || !isAddress(address)) throw new Error("Ví không trả địa chỉ hợp lệ.");
      clearReads();
      setAccount(address);
      setChainId(parseChain(await window.ethereum.request({ method: "eth_chainId" })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không kết nối được ví."); }
    finally { setBusy(false); }
  };

  const disconnect = () => { setAccount(null); clearReads(); };
  const switchNetwork = async () => {
    if (!window.ethereum || !deployment) return;
    setBusy(true); setError(null);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${deployment.chainId.toString(16)}` }] });
      clearReads();
      setChainId(deployment.chainId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chuyển được mạng."); }
    finally { setBusy(false); }
  };

  return <WalletContext.Provider value={{ account, chainId, busy, error, balance, delegatee, votingPower, connect, disconnect, switchNetwork, refresh }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("WalletProvider is missing");
  return context;
}

export function walletClient() {
  if (!window.ethereum || !deployment) throw new Error("Thiếu ví hoặc cấu hình deployment.");
  return createWalletClient({ chain: deployment.chain, transport: custom(window.ethereum) });
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
