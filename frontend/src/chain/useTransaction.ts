import { useState } from "react";
import type { Hash } from "viem";
import { transactionErrorMessage, waitForReceipt, type TransactionPhase } from "./transactions";

export function useTransaction() {
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (send: () => Promise<Hash>, afterReceipt?: (hash: Hash) => Promise<void> | void) => {
    setPhase("signing"); setHash(null); setError(null);
    try {
      const submitted = await send();
      setHash(submitted); setPhase("submitted");
      setPhase("confirming");
      await waitForReceipt(submitted);
      setPhase("success");
      try { await afterReceipt?.(submitted); } catch { /* Receipt is still successful when optional UI refresh fails. */ }
      return submitted;
    } catch (cause) {
      const message = transactionErrorMessage(cause);
      setError(message);
      setPhase(message.includes("revert") ? "reverted" : "error");
      return null;
    }
  };
  return { phase, hash, error, run };
}
