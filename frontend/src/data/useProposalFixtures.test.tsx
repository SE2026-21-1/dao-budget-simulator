// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProposalFixtures } from "./useProposalFixtures";
import type { ProposalCollection } from "./proposals";
import { ApiError } from "./api";
import type * as Api from "./api";
import { deferred } from "../test/deferred";

const api = vi.hoisted(() => ({ loadProposals: vi.fn() }));
vi.mock("./api", async (original) => ({ ...await original<typeof Api>(), ...api }));
vi.mock("../chain/config", () => ({ apiBaseUrl: "http://api.local" }));

let root: Root;
let container: HTMLDivElement;
let snapshotSignal: AbortSignal | undefined;
let revokeFromChild: (error: unknown) => void;
const collection = (block: string, revision = "1"): ProposalCollection => ({
  context: { chainId: "31337", deploymentId: "lifecycle", dataKind: "chain", asOfBlock: block, asOfBlockHash: `0x${block.padStart(64, "0")}`, snapshotRevision: revision },
  proposals: [], totalCount: 0, pageSizes: [0],
});

function Probe() {
  const { state, retry, refreshing, refreshError, invalidateSnapshot, snapshotSignal: signal } = useProposalFixtures();
  useEffect(() => { snapshotSignal = signal; revokeFromChild = invalidateSnapshot; }, [signal, invalidateSnapshot]);
  return <><output>{state.status === "success" ? `block:${state.collection.context.asOfBlock}` : state.status === "error" ? state.message : "loading"}</output>
    {state.status === "success" && <span data-testid="snapshot">{state.collection.context.asOfBlockHash}:{state.collection.context.snapshotRevision}</span>}
    <span data-testid="writable">{signal ? signal.aborted ? "blocked" : "live" : "missing"}</span>
    <span data-testid="refreshing">{String(refreshing)}</span><span role="alert">{refreshError}</span><button onClick={retry}>Refresh</button></>;
}
const refresh = () => act(async () => { container.querySelector("button")!.click(); });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  api.loadProposals.mockReset();
  snapshotSignal = undefined;
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("published snapshot refresh", () => {
  it.each([[409, "SNAPSHOT_INVALIDATED"], [503, "DATA_NOT_READY"]] as const)("revokes a lease when a pinned child API returns %s", async (status, code) => {
    api.loadProposals.mockResolvedValueOnce(collection("10", "7")).mockResolvedValueOnce(collection("11", "8"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    const old = snapshotSignal;
    await act(async () => { revokeFromChild(new ApiError(status, code, "Pinned child invalidated")); });
    expect(old?.aborted).toBe(true);
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    await refresh();
    expect(snapshotSignal).not.toBe(old);
    expect(snapshotSignal?.aborted).toBe(false);
    expect(container.querySelector("output")!.textContent).toBe("block:11");
  });
  it("retains the last snapshot on refresh failure and recovers with a fresh request", async () => {
    api.loadProposals.mockResolvedValueOnce(collection("10")).mockRejectedValueOnce(new Error("API unavailable"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    const live = snapshotSignal;
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("API unavailable");
    expect(container.querySelector('[data-testid="refreshing"]')!.textContent).toBe("false");
    expect(snapshotSignal).toBe(live);
    expect(snapshotSignal?.aborted).toBe(false);
    const latest = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(latest.promise);
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("");
    expect(container.querySelector('[data-testid="refreshing"]')!.textContent).toBe("true");
    await act(async () => { latest.resolve(collection("11")); });
    expect(container.querySelector("output")!.textContent).toBe("block:11");
    expect(api.loadProposals.mock.calls.every(([signal]) => signal instanceof AbortSignal)).toBe(true);
    expect(live?.aborted).toBe(true);
    expect(snapshotSignal).not.toBe(live);
    expect(snapshotSignal?.aborted).toBe(false);
  });

  it.each([
    [409, "SNAPSHOT_INVALIDATED"],
    [503, "DATA_NOT_READY"],
  ] as const)("revokes the retained snapshot on %s and only restores writes after canonical success", async (status, code) => {
    // Block, hash and revision identify one publication; refreshing must not relabel it.
    const old = collection("10", "7");
    const canonical = collection("11", "8");
    api.loadProposals.mockResolvedValueOnce(old).mockRejectedValueOnce(new ApiError(status, code, "Publication withdrawn"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    const revoked = snapshotSignal;
    expect(revoked).toBeInstanceOf(AbortSignal);
    expect(revoked?.aborted).toBe(false);

    const expectRetainedAndBlocked = () => {
      expect(container.querySelector("output")!.textContent).toBe("block:10");
      expect(container.querySelector('[data-testid="snapshot"]')!.textContent).toBe(`${old.context.asOfBlockHash}:7`);
      expect(container.querySelector('[data-testid="writable"]')!.textContent).toBe("blocked");
      expect(snapshotSignal).toBe(revoked);
      expect(revoked?.aborted).toBe(true);
    };
    await refresh();
    expectRetainedAndBlocked();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(code);

    const unavailable = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(unavailable.promise);
    await refresh();
    expectRetainedAndBlocked();
    expect(container.querySelector('[data-testid="refreshing"]')!.textContent).toBe("true");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("");
    await act(async () => { unavailable.reject(new Error("RPC temporarily unavailable")); });
    expectRetainedAndBlocked();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("RPC temporarily unavailable");

    const recovery = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(recovery.promise);
    await refresh();
    expectRetainedAndBlocked();
    await act(async () => { recovery.resolve(canonical); });
    expect(container.querySelector("output")!.textContent).toBe("block:11");
    expect(container.querySelector('[data-testid="snapshot"]')!.textContent).toBe(`${canonical.context.asOfBlockHash}:8`);
    expect(container.querySelector('[data-testid="writable"]')!.textContent).toBe("live");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("");
    expect(snapshotSignal).not.toBe(revoked);
    expect(snapshotSignal?.aborted).toBe(false);
    expect(revoked?.aborted).toBe(true);
  });

  it.each([
    [409, "SNAPSHOT_INVALIDATED"],
    [503, "DATA_NOT_READY"],
  ] as const)("ignores a superseded success while the %s snapshot remains revoked", async (status, code) => {
    api.loadProposals.mockResolvedValueOnce(collection("10", "7")).mockRejectedValueOnce(new ApiError(status, code, "Publication withdrawn"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    await refresh();
    const revoked = snapshotSignal;
    const superseded = deferred<ProposalCollection>();
    const latest = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(superseded.promise).mockReturnValueOnce(latest.promise);
    await refresh();
    const supersededRequest = api.loadProposals.mock.calls[2][0] as AbortSignal;
    await refresh();
    expect(supersededRequest.aborted).toBe(true);
    await act(async () => { superseded.resolve(collection("99", "99")); });
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    expect(container.querySelector('[data-testid="writable"]')!.textContent).toBe("blocked");
    expect(snapshotSignal).toBe(revoked);
    expect(revoked?.aborted).toBe(true);
    await act(async () => { latest.resolve(collection("12", "9")); });
    expect(container.querySelector("output")!.textContent).toBe("block:12");
    expect(container.querySelector('[data-testid="writable"]')!.textContent).toBe("live");
    expect(snapshotSignal).not.toBe(revoked);
    expect(snapshotSignal?.aborted).toBe(false);
  });

  it("aborts superseded requests and ignores late responses from an older attempt", async () => {
    const first = deferred<ProposalCollection>();
    const second = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    const firstSignal = api.loadProposals.mock.calls[0][0] as AbortSignal;
    await refresh();
    expect(firstSignal.aborted).toBe(true);
    await act(async () => { second.resolve(collection("12")); });
    const current = snapshotSignal;
    await act(async () => { first.resolve(collection("10")); });
    expect(container.querySelector("output")!.textContent).toBe("block:12");
    expect(snapshotSignal).toBe(current);
    expect(snapshotSignal?.aborted).toBe(false);
  });

  it("still exposes an initial load failure rather than fabricating a snapshot", async () => {
    api.loadProposals.mockRejectedValueOnce(new Error("No publication")).mockResolvedValueOnce(collection("15"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    expect(container.querySelector("output")!.textContent).toBe("No publication");
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:15");
  });
});
