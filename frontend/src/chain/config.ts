import { defineChain, isAddress, type Address } from "viem";

const chainId = Number(import.meta.env.VITE_CHAIN_ID);
const rpcUrl = import.meta.env.VITE_RPC_URL?.trim() ?? "";
const governor = import.meta.env.VITE_GOVERNOR_ADDRESS?.trim() ?? "";
const treasury = import.meta.env.VITE_TREASURY_ADDRESS?.trim() ?? "";
const govToken = import.meta.env.VITE_GOV_TOKEN_ADDRESS?.trim() ?? "";
const budToken = import.meta.env.VITE_BUD_TOKEN_ADDRESS?.trim() ?? "";
const timelock = import.meta.env.VITE_TIMELOCK_ADDRESS?.trim() ?? "";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
export const deploymentId = import.meta.env.VITE_DEPLOYMENT_ID?.trim() ?? "";
export const explorerUrl = import.meta.env.VITE_EXPLORER_URL?.trim().replace(/\/$/, "") ?? "";

// Fixture addresses are deliberately never used as deployment defaults.
export const deployment = Number.isSafeInteger(chainId) && chainId > 0 && rpcUrl &&
  [governor, treasury, govToken, budToken, timelock].every((address) => isAddress(address) && !/^0x0{40}$/i.test(address)) && deploymentId
  ? {
      chainId,
      rpcUrl,
      governor: governor as Address,
      treasury: treasury as Address,
      govToken: govToken as Address,
      budToken: budToken as Address,
      timelock: timelock as Address,
      deploymentId,
      chain: defineChain({
        id: chainId,
        name: import.meta.env.VITE_CHAIN_NAME?.trim() || `Chain ${chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      }),
    }
  : null;

export const configurationError = apiBaseUrl && !deployment
  ? "API đã bật nhưng thiếu cấu hình chain/RPC/deployment hoặc địa chỉ Governor, Timelock, Treasury, GOV, BUD hợp lệ. Kiểm tra .env.local rồi khởi động lại Vite."
  : null;

export function transactionUrl(hash: string): string | null {
  return explorerUrl ? `${explorerUrl}/tx/${encodeURIComponent(hash)}` : null;
}
