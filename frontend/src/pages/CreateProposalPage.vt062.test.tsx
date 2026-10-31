// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hash, TransactionReceipt } from "viem";
import { MemoryRouter } from "react-router";

const uiHarness = vi.hoisted(() => ({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hash,
  treasury: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  requestId: "0x0101010101010101010101010101010101010101010101010101010101010101",
  hash: ("0x" + "11".repeat(32)) as Hash,
  loadSummary: vi.fn(),
  useWallet: vi.fn(),
  assertWritable: vi.fn(),
  assertCanPropose: vi.fn(),
  buildProposal: vi.fn(),
  newRequestId: vi.fn(),
  validateProposalForm: vi.fn(),
  proposalIdFromReceipt: vi.fn(),
  sendGovernor: vi.fn(),
  transactionErrorMessage: vi.fn(),
  waitForReceipt: vi.fn(),
}));

vi.mock("../chain/config", () => ({
  deployment: {
    chainId: 31337,
    deploymentId: "vt062-local",
    governor: "0xdddddddddddddddddddddddddddddddddddddddd",
    treasury: uiHarness.treasury,
  },
  transactionUrl: () => null,
}));

vi.mock("../chain/wallet", () => ({
  useWallet: uiHarness.useWallet,
}));

vi.mock("../chain/transactions", () => ({
  ReceiptTerminalError: class ReceiptTerminalError extends Error {
    readonly kind: "reverted" | "cancelled";
    constructor(kind: "reverted" | "cancelled", message: string) { super(message); this.kind = kind; }
  },
  assertWritable: uiHarness.assertWritable,
  assertCanPropose: uiHarness.assertCanPropose,
  buildProposal: uiHarness.buildProposal,
  newRequestId: uiHarness.newRequestId,
  validateProposalForm: uiHarness.validateProposalForm,
  proposalIdFromReceipt: uiHarness.proposalIdFromReceipt,
  sendGovernor: uiHarness.sendGovernor,
  transactionErrorMessage: uiHarness.transactionErrorMessage,
  waitForReceipt: uiHarness.waitForReceipt,
}));

vi.mock("../data/api", () => ({
  loadSummary: uiHarness.loadSummary,
}));

import CreateProposalPage from "./CreateProposalPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const context = {
  chainId: "31337",
  deploymentId: "vt062-local",
  snapshotRevision: "1",
  asOfBlock: "1",
  asOfBlockHash: "0x" + "22".repeat(32),
  dataKind: "chain",
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  uiHarness.loadSummary.mockReset().mockResolvedValue({ context });
  uiHarness.useWallet.mockReset().mockReturnValue({ account: uiHarness.account, chainId: 31337 });
  uiHarness.assertWritable.mockReset();
  uiHarness.assertCanPropose.mockReset().mockResolvedValue(undefined);
  uiHarness.buildProposal.mockReset().mockReturnValue({
    targets: [uiHarness.treasury],
    values: [0n],
    calldatas: ["0x1234"],
    description: "{\"version\":1,\"title\":\"VT-062\",\"body\":\"Retry same request.\"}",
  });
  uiHarness.newRequestId.mockReset().mockReturnValue(uiHarness.requestId);
  uiHarness.validateProposalForm.mockReset().mockReturnValue(null);
  uiHarness.proposalIdFromReceipt.mockReset().mockReturnValue("42");
  uiHarness.sendGovernor.mockReset().mockResolvedValue(uiHarness.hash);
  uiHarness.transactionErrorMessage.mockReset().mockImplementation((cause: unknown) =>
    cause instanceof Error ? cause.message : String(cause));
  uiHarness.waitForReceipt.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function setFieldValue(id: string, value: string) {
  const element = container.querySelector("#" + id) as HTMLInputElement | HTMLTextAreaElement;
  const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function submitButton() {
  return container.querySelector('button[type="submit"]') as HTMLButtonElement;
}

describe("VT-062 proposal retry through the product form", () => {
  it("retries receipt tracking for H1 through the enabled form without sending a second transaction", async () => {
    const receipt = {
      transactionHash: uiHarness.hash,
      status: "success",
      logs: [],
    } as unknown as TransactionReceipt;
    const firstReceiptWait = deferred<TransactionReceipt>();
    const firstWaitStarted = deferred<void>();
    const firstErrorHandled = deferred<void>();
    const secondWaitStarted = deferred<void>();

    uiHarness.sendGovernor.mockResolvedValue(uiHarness.hash);
    uiHarness.waitForReceipt
      .mockImplementationOnce(() => {
        firstWaitStarted.resolve(undefined);
        return firstReceiptWait.promise;
      })
      .mockImplementationOnce(() => {
        secondWaitStarted.resolve(undefined);
        return Promise.resolve(receipt);
      });
    uiHarness.transactionErrorMessage.mockImplementation((cause: unknown) => {
      firstErrorHandled.resolve(undefined);
      return cause instanceof Error ? cause.message : String(cause);
    });

    await act(async () => {
      root.render(<MemoryRouter><CreateProposalPage /></MemoryRouter>);
      await Promise.resolve();
    });
    expect(submitButton().disabled).toBe(false);

    await act(async () => {
      setFieldValue("proposal-title", "VT-062 retry");
      setFieldValue("proposal-body", "Retry tracks the existing transaction hash.");
      setFieldValue("proposal-recipient", "0xcccccccccccccccccccccccccccccccccccccccc");
      setFieldValue("proposal-amount", "1");
    });

    await act(async () => {
      submitButton().click();
      await firstWaitStarted.promise;
    });
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledWith(uiHarness.hash);

    firstReceiptWait.reject(new Error("RPC timeout"));
    await act(async () => {
      await firstErrorHandled.promise;
    });
    expect(submitButton().disabled).toBe(false);
    expect(container.textContent).toContain(uiHarness.hash);
    expect(container.textContent).toContain("RPC timeout");
    expect((container.querySelector("#proposal-title") as HTMLInputElement).value).toBe("VT-062 retry");
    expect((container.querySelector("#proposal-body") as HTMLTextAreaElement).value).toBe("Retry tracks the existing transaction hash.");
    expect((container.querySelector("#proposal-recipient") as HTMLInputElement).value).toBe("0xcccccccccccccccccccccccccccccccccccccccc");
    expect((container.querySelector("#proposal-amount") as HTMLInputElement).value).toBe("1");

    await act(async () => {
      submitButton().click();
      await secondWaitStarted.promise;
    });

    expect(uiHarness.buildProposal).toHaveBeenCalledTimes(2);
    const expectedDraft = [
      "VT-062 retry",
      "Retry tracks the existing transaction hash.",
      "0xcccccccccccccccccccccccccccccccccccccccc",
      "1",
      uiHarness.requestId,
    ];
    expect(uiHarness.buildProposal.mock.calls[0].slice(0, 5)).toEqual(expectedDraft);
    expect(uiHarness.buildProposal.mock.calls[1].slice(0, 5)).toEqual(expectedDraft);
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledTimes(2);
    expect(uiHarness.waitForReceipt).toHaveBeenNthCalledWith(1, uiHarness.hash);
    expect(uiHarness.waitForReceipt).toHaveBeenNthCalledWith(2, uiHarness.hash);
    expect(container.textContent).toContain("Proposal ID: 42");
    expect(submitButton().disabled).toBe(true);
    await act(async () => { submitButton().click(); });
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledTimes(2);
  });

  it("does not attach a changed payload or wallet account to the unresolved hash", async () => {
    const firstReceiptWait = deferred<TransactionReceipt>();
    const firstWaitStarted = deferred<void>();
    const firstErrorHandled = deferred<void>();
    uiHarness.buildProposal.mockImplementation((...args: unknown[]) => ({
      targets: [uiHarness.treasury],
      values: [0n],
      calldatas: [args[3] === "1" ? "0x1234" : "0x5678"],
      description: "same description",
    }));
    uiHarness.waitForReceipt
      .mockImplementationOnce(() => {
        firstWaitStarted.resolve(undefined);
        return firstReceiptWait.promise;
      })
      .mockResolvedValueOnce({ transactionHash: uiHarness.hash, status: "success", logs: [] } as unknown as TransactionReceipt);
    uiHarness.transactionErrorMessage.mockImplementation((cause: unknown) => {
      firstErrorHandled.resolve(undefined);
      return cause instanceof Error ? cause.message : String(cause);
    });

    await act(async () => {
      root.render(<MemoryRouter><CreateProposalPage /></MemoryRouter>);
      await Promise.resolve();
    });
    await act(async () => {
      setFieldValue("proposal-title", "VT-062 retry");
      setFieldValue("proposal-body", "Retry tracks the existing transaction hash.");
      setFieldValue("proposal-recipient", "0xcccccccccccccccccccccccccccccccccccccccc");
      setFieldValue("proposal-amount", "1");
    });
    await act(async () => {
      submitButton().click();
      await firstWaitStarted.promise;
    });
    firstReceiptWait.reject(new Error("RPC timeout"));
    await act(async () => { await firstErrorHandled.promise; });

    await act(async () => { setFieldValue("proposal-amount", "2"); });
    await act(async () => { submitButton().click(); });
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Chỉ có thể thử lại cùng yêu cầu");

    await act(async () => { setFieldValue("proposal-amount", "1"); });
    uiHarness.useWallet.mockReturnValue({ account: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", chainId: 31337 });
    await act(async () => { root.render(<MemoryRouter><CreateProposalPage /></MemoryRouter>); });
    await act(async () => { submitButton().click(); });
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledTimes(1);

    uiHarness.useWallet.mockReturnValue({ account: uiHarness.account, chainId: 31337 });
    await act(async () => { root.render(<MemoryRouter><CreateProposalPage /></MemoryRouter>); });
    await act(async () => { submitButton().click(); });
    expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1);
    expect(uiHarness.waitForReceipt).toHaveBeenCalledTimes(2);
    expect(uiHarness.waitForReceipt).toHaveBeenNthCalledWith(2, uiHarness.hash);
    expect(container.textContent).toContain("Proposal ID: 42");
  });
});
