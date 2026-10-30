/* eslint-disable react-hooks/rules-of-hooks, react/immutability -- Intentional unit harness with controlled hook state. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hash, TransactionReceipt } from "viem";

const hookHarness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  waitForReceipt: vi.fn(),
}));

vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.slots)) hookHarness.slots[index] = initial;
    const setState = (value: unknown) => {
      const current = hookHarness.slots[index];
      hookHarness.slots[index] = typeof value === "function"
        ? (value as (current: unknown) => unknown)(current)
        : value;
    };
    return [hookHarness.slots[index], setState];
  },
  useRef(initial: unknown) {
    const index = hookHarness.cursor++;
    if (!(index in hookHarness.slots)) hookHarness.slots[index] = { current: initial };
    return hookHarness.slots[index];
  },
}));

vi.mock("./transactions", () => ({
  ReceiptTerminalError: class ReceiptTerminalError extends Error {
    readonly kind: "reverted" | "cancelled";
    constructor(kind: "reverted" | "cancelled", message: string) { super(message); this.kind = kind; }
  },
  transactionErrorMessage: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
  waitForReceipt: hookHarness.waitForReceipt,
}));

import { useTransaction } from "./useTransaction";
import { ReceiptTerminalError } from "./transactions";

const H1 = ("0x" + "11".repeat(32)) as Hash;
const H2 = ("0x" + "22".repeat(32)) as Hash;
const receiptFor = (transactionHash: Hash) => ({
  transactionHash,
  status: "success",
  logs: [],
}) as unknown as TransactionReceipt;

function useHarnessTransaction() {
  hookHarness.cursor = 0;
  return useTransaction();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("VT-062 receipt retry", () => {
  beforeEach(() => {
    hookHarness.slots = [];
    hookHarness.cursor = 0;
    hookHarness.waitForReceipt.mockReset();
  });

  it("resumes the known hash after a transient receipt failure without sending again", async () => {
    const receipt = receiptFor(H1);
    hookHarness.waitForReceipt
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce(receipt);
    const send = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);
    const afterReceipt = vi.fn();

    const firstAttempt = await useHarnessTransaction().run(send, afterReceipt);
    expect(firstAttempt).toBeNull();
    expect(useHarnessTransaction()).toMatchObject({ phase: "error", hash: H1, busy: false });
    expect(afterReceipt).not.toHaveBeenCalled();

    const retryAttempt = await useHarnessTransaction().run(send, afterReceipt);

    expect(send).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenNthCalledWith(1, H1);
    expect(hookHarness.waitForReceipt).toHaveBeenNthCalledWith(2, H1);
    expect(retryAttempt).toBe(receipt);
    expect(afterReceipt).toHaveBeenCalledTimes(1);
    expect(useHarnessTransaction()).toMatchObject({ phase: "success", hash: H1, error: null, busy: false });
  });

  it("allows retry when wallet signing failed before any hash existed", async () => {
    const receipt = receiptFor(H1);
    hookHarness.waitForReceipt.mockResolvedValue(receipt);
    const send = vi.fn<() => Promise<Hash>>()
      .mockRejectedValueOnce(Object.assign(new Error("User rejected"), { code: 4001 }))
      .mockResolvedValueOnce(H1);

    expect(await useHarnessTransaction().run(send)).toBeNull();
    expect(useHarnessTransaction()).toMatchObject({ phase: "error", hash: null, busy: false });
    expect(await useHarnessTransaction().run(send)).toBe(receipt);
    expect(send).toHaveBeenCalledTimes(2);
    expect(hookHarness.waitForReceipt).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenCalledWith(H1);
  });

  it("does not start a second send while the first receipt wait is pending", async () => {
    const receipt = receiptFor(H1);
    const waiting = deferred<TransactionReceipt>();
    const waitStarted = deferred<void>();
    hookHarness.waitForReceipt.mockImplementation(() => {
      waitStarted.resolve(undefined);
      return waiting.promise;
    });
    const send = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);

    const firstRun = useHarnessTransaction().run(send);
    await waitStarted.promise;
    expect(useHarnessTransaction()).toMatchObject({ phase: "confirming", hash: H1, busy: true });

    const overlappingRun = await useHarnessTransaction().run(send);
    expect(overlappingRun).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenCalledTimes(1);

    waiting.resolve(receipt);
    expect(await firstRun).toBe(receipt);
    expect(useHarnessTransaction()).toMatchObject({ phase: "success", hash: H1, busy: false });
  });

  it("does not attach a changed request to H1 or send while H1 is unresolved", async () => {
    hookHarness.waitForReceipt
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce(receiptFor(H1));
    const sendOriginal = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);
    const sendChanged = vi.fn<() => Promise<Hash>>().mockResolvedValue(H2);

    expect(await useHarnessTransaction().run(sendOriginal, undefined, "draft/account/chain/deployment-A")).toBeNull();
    expect(await useHarnessTransaction().run(sendChanged, undefined, "draft/account/chain/deployment-B")).toBeNull();
    expect(sendChanged).not.toHaveBeenCalled();
    expect(hookHarness.waitForReceipt).toHaveBeenCalledTimes(1);
    expect(useHarnessTransaction()).toMatchObject({ phase: "error", hash: H1 });

    expect(await useHarnessTransaction().run(sendOriginal, undefined, "draft/account/chain/deployment-A")).toMatchObject({ transactionHash: H1 });
    expect(sendOriginal).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenNthCalledWith(2, H1);
  });

  it.each([
    ["reverted", "reverted"],
    ["cancelled", "error"],
  ] as const)("clears the pending hash after a terminal %s outcome", async (kind, phase) => {
    hookHarness.waitForReceipt
      .mockRejectedValueOnce(new ReceiptTerminalError(kind, kind))
      .mockResolvedValueOnce(receiptFor(H2));
    const firstSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);
    const nextSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H2);
    const afterReceipt = vi.fn();

    expect(await useHarnessTransaction().run(firstSend, afterReceipt, "request-A")).toBeNull();
    expect(useHarnessTransaction()).toMatchObject({ phase, hash: H1, busy: false });
    expect(afterReceipt).not.toHaveBeenCalled();

    expect(await useHarnessTransaction().run(nextSend, afterReceipt, "request-B")).toMatchObject({ transactionHash: H2 });
    expect(nextSend).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenNthCalledWith(2, H2);
    expect(afterReceipt).toHaveBeenCalledTimes(1);
  });

  it("allows a distinct action after H1 has succeeded", async () => {
    hookHarness.waitForReceipt
      .mockResolvedValueOnce(receiptFor(H1))
      .mockResolvedValueOnce(receiptFor(H2));
    const firstSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);
    const nextSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H2);

    expect(await useHarnessTransaction().run(firstSend, undefined, "request-A")).toMatchObject({ transactionHash: H1 });
    expect(await useHarnessTransaction().run(nextSend, undefined, "request-B")).toMatchObject({ transactionHash: H2 });
    expect(firstSend).toHaveBeenCalledTimes(1);
    expect(nextSend).toHaveBeenCalledTimes(1);
  });

  it("preserves the old new-action behavior for callers without a request key", async () => {
    hookHarness.waitForReceipt
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce(receiptFor(H2));
    const firstSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H1);
    const nextSend = vi.fn<() => Promise<Hash>>().mockResolvedValue(H2);

    expect(await useHarnessTransaction().run(firstSend)).toBeNull();
    expect(await useHarnessTransaction().run(nextSend)).toMatchObject({ transactionHash: H2 });
    expect(firstSend).toHaveBeenCalledTimes(1);
    expect(nextSend).toHaveBeenCalledTimes(1);
    expect(hookHarness.waitForReceipt).toHaveBeenNthCalledWith(2, H2);
  });
});
