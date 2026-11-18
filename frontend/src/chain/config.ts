import { defineChain, isAddress, type Address } from "viem";

// Local Vite keeps its documented offline defaults. Container builds must receive
// a public runtime script before this module loads; never fall back to fixtures.
const runtime = (globalThis as typeof globalThis & {
  __DAO_PUBLIC_CONFIG__?: Record<string, string>;
}).__DAO_PUBLIC_CONFIG__;
if (import.meta.env.VITE_CONTAINER_RUNTIME === "1" && !runtime) {
  throw new Error("Missing live public runtime configuration.");
}
const env = runtime ?? import.meta.env;
const chainId = Number(env.VITE_CHAIN_ID);
const rpcUrl = env.VITE_RPC_URL?.trim() ?? "";
const governor = env.VITE_GOVERNOR_ADDRESS?.trim() ?? "";
const treasury = env.VITE_TREASURY_ADDRESS?.trim() ?? "";
const govToken = env.VITE_GOV_TOKEN_ADDRESS?.trim() ?? "";
const budToken = env.VITE_BUD_TOKEN_ADDRESS?.trim() ?? "";
const timelock = env.VITE_TIMELOCK_ADDRESS?.trim() ?? "";

// Preserve the documented offline default; an explicit fixture choice also
// ignores stale API/deployment settings left by a previous local run.
export const apiBaseUrl = env.VITE_DATA_SOURCE?.trim() === "fixture"
  ? "" : env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
export const deploymentId = env.VITE_DEPLOYMENT_ID?.trim() ?? "";
export const explorerUrl = env.VITE_EXPLORER_URL?.trim().replace(/\/$/, "") ?? "";

// The read-only API needs only its scope. Wallet transactions need the complete deployment.
export const apiScope = apiBaseUrl && Number.isSafeInteger(chainId) && chainId > 0 && deploymentId
  ? { chainId, deploymentId } : null;
export const deployment = apiScope && rpcUrl &&
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
        name: env.VITE_CHAIN_NAME?.trim() || `Chain ${chainId}`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      }),
    }
  : null;

export const configurationError = apiBaseUrl && !apiScope
  ? "Thiếu VITE_CHAIN_ID hoặc VITE_DEPLOYMENT_ID hợp lệ để đọc API TV2. Điền cấu hình deployment thật trong .env.local rồi khởi động lại Vite."
  : null;

export function transactionUrl(hash: string): string | null {
  return explorerUrl ? `${explorerUrl}/tx/${encodeURIComponent(hash)}` : null;
}
