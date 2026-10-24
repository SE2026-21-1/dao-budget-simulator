import { defineChain, isAddress, type Address } from "viem";

const chainId = Number(import.meta.env.VITE_CHAIN_ID);
const rpcUrl = import.meta.env.VITE_RPC_URL?.trim() ?? "";
const governor = import.meta.env.VITE_GOVERNOR_ADDRESS?.trim() ?? "";
const treasury = import.meta.env.VITE_TREASURY_ADDRESS?.trim() ?? "";
const govToken = import.meta.env.VITE_GOV_TOKEN_ADDRESS?.trim() ?? "";
const budToken = import.meta.env.VITE_BUD_TOKEN_ADDRESS?.trim() ?? "";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
export const deploymentId = import.meta.env.VITE_DEPLOYMENT_ID?.trim() ?? "";
export const explorerUrl = import.meta.env.VITE_EXPLORER_URL?.trim().replace(/\/$/, "") ?? "";

// Fixture addresses are deliberately never used as deployment defaults.
export const deployment = Number.isSafeInteger(chainId) && chainId > 0 && rpcUrl &&
  isAddress(governor) && isAddress(treasury) && isAddress(govToken) && isAddress(budToken) && deploymentId
  ? {
      chainId,
      rpcUrl,
      governor: governor as Address,
      treasury: treasury as Address,
      govToken: govToken as Address,
      budToken: budToken as Address,
      deploymentId,
      chain: defineChain({
        id: chainId,
        name: import.meta.env.VITE_CHAIN_NAME?.trim() || `Chain ${chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      }),
    }
  : null;

export function transactionUrl(hash: string): string | null {
  return explorerUrl ? `${explorerUrl}/tx/${encodeURIComponent(hash)}` : null;
}
