import { useRef, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { ReceiptTerminalError, transactionErrorMessage, waitForReceipt, type TransactionPhase } from "./transactions";

export function useTransaction() {
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const pending = useRef<{ hash: Hash; key: string | (() => Promise<Hash>) } | null>(null);
  const busy = phase === "signing" || phase === "submitted" || phase === "confirming";

  const run = async (send: () => Promise<Hash>, afterReceipt?: (receipt: TransactionReceipt) => Promise<void> | void, requestKey?: string) => {
    if (running.current) return null;
    const key = requestKey ?? send;
    if (pending.current && pending.current.key !== key) {
      if (typeof pending.current.key === "string" || typeof key === "string") {
        setError("Giao dịch trước vẫn chưa rõ kết quả. Chỉ có thể thử lại cùng yêu cầu và ví/mạng ban đầu.");
        setPhase("error");
        return null;
      }
      // Callers without a request key keep their prior behavior for a new callback/action.
      pending.current = null;
    }
    running.current = true;
    const previous = pending.current;
    setPhase(previous ? "confirming" : "signing");
    if (!previous) setHash(null);
    setError(null);
    try {
      const submitted = previous?.hash ?? await send();
      if (!previous) {
        pending.current = { hash: submitted, key };
        setHash(submitted); setPhase("submitted");
      }
      setPhase("confirming");
      const receipt = await waitForReceipt(submitted);
      pending.current = null;
      setHash(receipt.transactionHash); setPhase("success");
      try { await afterReceipt?.(receipt); } catch { /* Receipt is still successful when optional UI refresh fails. */ }
      return receipt;
    } catch (cause) {
      if (cause instanceof ReceiptTerminalError) pending.current = null;
      const message = transactionErrorMessage(cause);
      setError(message);
      setPhase(cause instanceof ReceiptTerminalError && cause.kind === "reverted" ? "reverted" : "error");
      return null;
    }
    finally { running.current = false; }
  };
  return { phase, hash, error, busy, run };
}
