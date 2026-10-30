import { useRef, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { transactionErrorMessage, waitForReceipt, type TransactionPhase } from "./transactions";

export function useTransaction() {
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const busy = phase === "signing" || phase === "submitted" || phase === "confirming";

  const run = async (send: () => Promise<Hash>, afterReceipt?: (receipt: TransactionReceipt) => Promise<void> | void) => {
    if (running.current) return null;
    running.current = true;
    setPhase("signing"); setHash(null); setError(null);
    try {
      const submitted = await send();
      setHash(submitted); setPhase("submitted");
      setPhase("confirming");
      const receipt = await waitForReceipt(submitted);
      setHash(receipt.transactionHash); setPhase("success");
      try { await afterReceipt?.(receipt); } catch { /* Receipt is still successful when optional UI refresh fails. */ }
      return receipt;
    } catch (cause) {
      const message = transactionErrorMessage(cause);
      setError(message);
      setPhase(message.includes("revert") ? "reverted" : "error");
      return null;
    }
    finally { running.current = false; }
  };
  return { phase, hash, error, busy, run };
}
