import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isAddress, type Address } from "viem";
import { deployment } from "./config";
import { publicClient, tokenAbi } from "./wallet";
import { WalletContext } from "./wallet-context";

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
  const selectedWallet = useRef({ account, chainId });
  useLayoutEffect(() => { selectedWallet.current = { account, chainId }; }, [account, chainId]);

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
    if (selectedWallet.current.account !== account || selectedWallet.current.chainId !== chainId) return;
    const generation = ++readGeneration.current;
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
  }, [account, chainId]);

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
