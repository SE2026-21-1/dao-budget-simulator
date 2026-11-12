import { afterEach, describe, expect, it, vi } from "vitest";

const addresses = {
  VITE_GOVERNOR_ADDRESS: "0x1111111111111111111111111111111111111111",
  VITE_TIMELOCK_ADDRESS: "0x2222222222222222222222222222222222222222",
  VITE_TREASURY_ADDRESS: "0x3333333333333333333333333333333333333333",
  VITE_GOV_TOKEN_ADDRESS: "0x4444444444444444444444444444444444444444",
  VITE_BUD_TOKEN_ADDRESS: "0x5555555555555555555555555555555555555555",
};

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("deployment mode", () => {
  it("ignores stale deployment settings while viewing fixtures", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "fixture");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_CHAIN_ID", "31337");
    vi.stubEnv("VITE_RPC_URL", "http://127.0.0.1:8545");
    vi.stubEnv("VITE_DEPLOYMENT_ID", "old-local-demo");
    for (const [key, value] of Object.entries(addresses)) vi.stubEnv(key, value);

    const config = await import("./config");
    expect(config.deployment).toBeNull();
    expect(config.apiScope).toBeNull();
    expect(config.configurationError).toBeNull();
  });

  it("uses TV2 API by default with read-only scope", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
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
});
