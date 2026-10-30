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
  transactionErrorMessage: (cause: unknown) => cause instanceof Error ? cause.message : String(cause),
  waitForReceipt: hookHarness.waitForReceipt,
}));

import { useTransaction } from "./useTransaction";

const H1 = ("0x" + "11".repeat(32)) as Hash;
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
});
