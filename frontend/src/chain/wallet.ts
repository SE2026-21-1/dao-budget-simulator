import { useContext } from "react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, formatUnits, http, parseAbi, type Address, type EIP1193Provider, type Hash } from "viem";
import { deployment } from "./config";
import { WalletContext } from "./wallet-context";

declare global {
  interface Window { ethereum?: EIP1193Provider & {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  } }
}

export const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function delegates(address account) view returns (address)",
  "function getVotes(address account) view returns (uint256)",
  "function getPastVotes(address account,uint256 timepoint) view returns (uint256)",
  "function delegate(address delegatee)",
  "function transfer(address to,uint256 value) returns (bool)",
]);

export const publicClient = deployment ? createPublicClient({ chain: deployment.chain, transport: http(deployment.rpcUrl) }) : null;

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
