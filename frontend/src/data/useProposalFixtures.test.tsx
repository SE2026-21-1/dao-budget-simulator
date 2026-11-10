// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProposalFixtures } from "./useProposalFixtures";
import type { ProposalCollection } from "./proposals";
import { deferred } from "../test/deferred";

const api = vi.hoisted(() => ({ loadProposals: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("../chain/config", () => ({ apiBaseUrl: "http://api.local" }));

let root: Root;
let container: HTMLDivElement;
const collection = (block: string): ProposalCollection => ({
  context: { chainId: "31337", deploymentId: "lifecycle", dataKind: "chain", asOfBlock: block, asOfBlockHash: `0x${block.padStart(64, "0")}`, snapshotRevision: "1" },
  proposals: [], totalCount: 0, pageSizes: [0],
});

function Probe() {
  const { state, retry, refreshing, refreshError } = useProposalFixtures();
  return <><output>{state.status === "success" ? `block:${state.collection.context.asOfBlock}` : state.status === "error" ? state.message : "loading"}</output>
    <span data-testid="refreshing">{String(refreshing)}</span><span role="alert">{refreshError}</span><button onClick={retry}>Refresh</button></>;
}
const refresh = () => act(async () => { container.querySelector("button")!.click(); });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  api.loadProposals.mockReset();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("published snapshot refresh", () => {
  it("retains the last snapshot on refresh failure and recovers with a fresh request", async () => {
    api.loadProposals.mockResolvedValueOnce(collection("10")).mockRejectedValueOnce(new Error("API unavailable"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("API unavailable");
    expect(container.querySelector('[data-testid="refreshing"]')!.textContent).toBe("false");
    const latest = deferred<ProposalCollection>();
    api.loadProposals.mockReturnValueOnce(latest.promise);
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:10");
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("");
    expect(container.querySelector('[data-testid="refreshing"]')!.textContent).toBe("true");
    await act(async () => { latest.resolve(collection("11")); });
    expect(container.querySelector("output")!.textContent).toBe("block:11");
    expect(api.loadProposals.mock.calls.every(([signal]) => signal instanceof AbortSignal)).toBe(true);
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
    await act(async () => { first.resolve(collection("10")); });
    expect(container.querySelector("output")!.textContent).toBe("block:12");
  });

  it("still exposes an initial load failure rather than fabricating a snapshot", async () => {
    api.loadProposals.mockRejectedValueOnce(new Error("No publication")).mockResolvedValueOnce(collection("15"));
    await act(async () => { root.render(<MemoryRouter><Probe /></MemoryRouter>); });
    expect(container.querySelector("output")!.textContent).toBe("No publication");
    await refresh();
    expect(container.querySelector("output")!.textContent).toBe("block:15");
  });
});
