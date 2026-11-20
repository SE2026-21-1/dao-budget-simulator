// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEventTopics, type Address, type Hex } from "viem";
import type * as Viem from "viem";
import type * as Wallet from "../chain/wallet";
import type * as Transactions from "../chain/transactions";
import { tokenAbi } from "../chain/wallet";
import WalletPanel from "./WalletPanel";

const state = vi.hoisted(() => ({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  token: "0x1111111111111111111111111111111111111111",
  other: "0x2222222222222222222222222222222222222222",
  hash: `0x${"ab".repeat(32)}`,
  send: vi.fn(), session: vi.fn(), refresh: vi.fn(), waitForReceipt: vi.fn(),
}));
vi.mock("../chain/config", () => ({
  deployment: { chainId: 31337, govToken: state.token }, transactionUrl: () => null,
}));
vi.mock("viem", async (original) => ({ ...await original<typeof Viem>(), createPublicClient: () => ({}) }));
vi.mock("../chain/wallet", async (original) => ({
  ...await original<typeof Wallet>(),
  useWallet: () => ({
    account: state.account, chainId: 31337, wallets: [{ id: "wallet", name: "Test wallet" }],
    busy: false, balance: 1n, votingPower: 0n, delegatee: state.other, refresh: state.refresh,
  }),
  sendTokenTransaction: state.send, walletSession: state.session,
}));
vi.mock("../chain/transactions", async (original) => ({
  ...await original<typeof Transactions>(), waitForReceipt: state.waitForReceipt,
}));

let root: Root;
let container: HTMLDivElement;
function delegationLog(delegator = state.account, delegatee = state.account, address = state.token) {
  return {
    address, data: "0x" as Hex,
    topics: encodeEventTopics({ abi: tokenAbi, eventName: "DelegateChanged", args: {
      delegator: delegator as Address, fromDelegate: state.other as Address, toDelegate: delegatee as Address,
    } }),
  };
}
const receipt = () => ({ transactionHash: state.hash, status: "success", from: state.account, to: state.token, logs: [delegationLog()] });
async function delegate() {
  await act(async () => { root.render(<WalletPanel />); });
  await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Self-delegate")!.click(); });
  expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ send: expect.any(Function) }), "delegate", [state.account]);
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  state.send.mockReset().mockResolvedValue(state.hash);
  state.session.mockReset().mockReturnValue({ send: vi.fn() });
  state.refresh.mockReset().mockResolvedValue(undefined);
  state.waitForReceipt.mockReset().mockResolvedValue(receipt());
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("self-delegate receipt verification", () => {
  it("reports success and refreshes only after a matching GOV delegation event", async () => {
    await delegate();
    expect(container.textContent).toContain("Giao dịch đã được xác nhận.");
    expect(container.textContent).toContain(state.hash);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "emitter", "delegator", "delegatee", "target", "transaction sender", "malformed"] as const)(
    "retains the hash without reporting success for the wrong %s outcome", async (mismatch) => {
      const mined = receipt();
      if (mismatch === "missing") mined.logs = [];
      if (mismatch === "emitter") mined.logs = [delegationLog(state.account, state.account, state.other)];
      if (mismatch === "delegator") mined.logs = [delegationLog(state.other)];
      if (mismatch === "delegatee") mined.logs = [delegationLog(state.account, state.other)];
      if (mismatch === "target") mined.to = state.other;
      if (mismatch === "transaction sender") mined.from = state.other;
      if (mismatch === "malformed") mined.logs[0].topics = ["0x"];
      state.waitForReceipt.mockResolvedValueOnce(mined);
      await delegate();
      expect(container.textContent).not.toContain("Giao dịch đã được xác nhận.");
      expect(container.textContent).toContain("Receipt");
      expect(container.textContent).toContain(state.hash);
    },
  );
});
