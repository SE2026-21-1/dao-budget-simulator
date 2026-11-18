import { afterEach, describe, expect, it, vi } from "vitest";

const addresses = {
  VITE_GOVERNOR_ADDRESS: "0x1111111111111111111111111111111111111111",
  VITE_TIMELOCK_ADDRESS: "0x2222222222222222222222222222222222222222",
  VITE_TREASURY_ADDRESS: "0x3333333333333333333333333333333333333333",
  VITE_GOV_TOKEN_ADDRESS: "0x4444444444444444444444444444444444444444",
  VITE_BUD_TOKEN_ADDRESS: "0x5555555555555555555555555555555555555555",
};

// Config reads import.meta.env at module initialization; reset/re-import is
// intentional here so each case exercises that loading boundary.
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("deployment mode", () => {
  it.each(["", "fixture"])("ignores stale deployment settings with fixture selection %s", async (source) => {
    vi.stubEnv("VITE_DATA_SOURCE", source);
    vi.stubEnv("VITE_API_BASE_URL", source ? "http://old-api.local" : "");
    vi.stubEnv("VITE_CHAIN_ID", "31337");
    vi.stubEnv("VITE_RPC_URL", "http://127.0.0.1:8545");
    vi.stubEnv("VITE_DEPLOYMENT_ID", "old-local-demo");
    for (const [key, value] of Object.entries(addresses)) vi.stubEnv(key, value);

    const config = await import("./config");
    expect(config.deployment).toBeNull();
    expect(config.apiScope).toBeNull();
    expect(config.configurationError).toBeNull();
  });

  it("reads an explicitly configured API without wallet RPC or addresses", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "");
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("VITE_CHAIN_ID", "31337");
    vi.stubEnv("VITE_DEPLOYMENT_ID", "local-demo");
    vi.stubEnv("VITE_RPC_URL", "");
    for (const key of Object.keys(addresses)) vi.stubEnv(key, "");

    const config = await import("./config");
    expect(config.apiBaseUrl).toBe("http://127.0.0.1:3000");
    expect(config.apiScope).toEqual({ chainId: 31337, deploymentId: "local-demo" });
    expect(config.deployment).toBeNull();
    expect(config.configurationError).toBeNull();
  });

  it("uses a complete deployment when the API is enabled", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "");
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("VITE_CHAIN_ID", "31337");
    vi.stubEnv("VITE_RPC_URL", "http://127.0.0.1:8545");
    vi.stubEnv("VITE_DEPLOYMENT_ID", "local-demo");
    for (const [key, value] of Object.entries(addresses)) vi.stubEnv(key, value);

    const config = await import("./config");
    expect(config.deployment?.chainId).toBe(31337);
    expect(config.deployment?.deploymentId).toBe("local-demo");
    expect(config.configurationError).toBeNull();
  });

  it("reports incomplete API scope without silently selecting fixtures", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "");
    vi.stubEnv("VITE_API_BASE_URL", "http://api.local/");
    vi.stubEnv("VITE_CHAIN_ID", "");
    vi.stubEnv("VITE_DEPLOYMENT_ID", "");
    const config = await import("./config");
    expect(config.apiBaseUrl).toBe("http://api.local");
    expect(config.apiScope).toBeNull();
    expect(config.deployment).toBeNull();
    expect(config.configurationError).toContain("VITE_CHAIN_ID");
  });
});
