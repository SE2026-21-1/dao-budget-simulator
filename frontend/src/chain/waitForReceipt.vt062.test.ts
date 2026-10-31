import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hash, TransactionReceipt } from "viem";

const receiptHarness = vi.hoisted(() => ({
  wait: vi.fn(),
}));

vi.mock("./wallet", () => ({
  publicClient: { waitForTransactionReceipt: receiptHarness.wait },
}));

vi.mock("./config", () => ({ deployment: null }));

import { ReceiptTerminalError, waitForReceipt } from "./transactions";

const H1 = ("0x" + "11".repeat(32)) as Hash;
const receipt = (status: "success" | "reverted") => ({
  transactionHash: H1,
  status,
}) as TransactionReceipt;

describe("VT-062 receipt outcome classification", () => {
  beforeEach(() => { receiptHarness.wait.mockReset(); });

  it("keeps an RPC timeout retryable", async () => {
    const timeout = new Error("RPC timeout");
    receiptHarness.wait.mockRejectedValue(timeout);
    await expect(waitForReceipt(H1)).rejects.toBe(timeout);
    expect(receiptHarness.wait).toHaveBeenCalledWith(expect.objectContaining({ hash: H1 }));
  });

  it("marks an on-chain revert as terminal", async () => {
    receiptHarness.wait.mockResolvedValue(receipt("reverted"));
    await expect(waitForReceipt(H1)).rejects.toMatchObject({
      kind: "reverted",
      message: expect.stringContaining("revert"),
    });
  });

  it.each(["cancelled", "replaced"] as const)("marks a %s wallet replacement as terminal", async (reason) => {
    receiptHarness.wait.mockImplementation(({ onReplaced }: { onReplaced: (event: { reason: typeof reason }) => void }) => {
      onReplaced({ reason });
      return Promise.resolve(receipt("success"));
    });
    const error = await waitForReceipt(H1).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ReceiptTerminalError);
    expect(error).toMatchObject({ kind: "cancelled" });
  });

  it("keeps cancellation terminal when the RPC wait rejects after replacement notification", async () => {
    receiptHarness.wait.mockImplementation(({ onReplaced }: { onReplaced: (event: { reason: "cancelled" }) => void }) => {
      onReplaced({ reason: "cancelled" });
      return Promise.reject(new Error("RPC stopped tracking replacement"));
    });
    const error = await waitForReceipt(H1).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ReceiptTerminalError);
    expect(error).toMatchObject({ kind: "cancelled" });
  });

  it("accepts a repriced transaction for the same action", async () => {
    receiptHarness.wait.mockImplementation(({ onReplaced }: { onReplaced: (event: { reason: "repriced" }) => void }) => {
      onReplaced({ reason: "repriced" });
      return Promise.resolve(receipt("success"));
    });
    await expect(waitForReceipt(H1)).resolves.toMatchObject({ transactionHash: H1, status: "success" });
  });
});
