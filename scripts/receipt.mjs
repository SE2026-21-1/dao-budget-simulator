import { performance } from 'node:perf_hooks';

export class ReceiptTimeoutError extends Error {
  constructor(step, transactionHash, timeoutMs) {
    super(`${step}: timed out after ${timeoutMs}ms waiting for receipt (${transactionHash})`);
    this.name = 'ReceiptTimeoutError';
    this.code = 'RECEIPT_TIMEOUT';
  }
}

export class ReceiptRpcError extends Error {
  constructor(step, transactionHash) {
    super(`${step}: RPC failed or returned a malformed receipt (${transactionHash})`);
    this.name = 'ReceiptRpcError';
    this.code = 'RECEIPT_RPC_ERROR';
  }
}

export class ReceiptStatusError extends Error {
  constructor(step, transactionHash, expected, actual) {
    super(`${step}: expected receipt status ${expected}, got ${actual} (${transactionHash})`);
    this.name = 'ReceiptStatusError';
    this.code = 'RECEIPT_STATUS_MISMATCH';
  }
}

/** Polls only for the receipt of the already submitted transaction; it never resends it. */
export async function waitForReceipt(rpc, transactionHash, {
  step = 'transaction', timeoutMs = 60_000, pollIntervalMs = 100,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0
      || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new TypeError('Receipt timeout and polling interval must be positive safe integers.');
  }
  const deadline = performance.now() + timeoutMs;
  while (true) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new ReceiptTimeoutError(step, transactionHash, timeoutMs);
    let timer;
    let receipt;
    try {
      receipt = await Promise.race([
        Promise.resolve().then(() => rpc('eth_getTransactionReceipt', [transactionHash])),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new ReceiptTimeoutError(step, transactionHash, timeoutMs)), remaining);
        }),
      ]);
    } catch (error) {
      if (error instanceof ReceiptTimeoutError) throw error;
      // Provider exceptions may include URLs, credentials, or request payloads.
      throw new ReceiptRpcError(step, transactionHash);
    } finally {
      clearTimeout(timer);
    }

    if (performance.now() >= deadline) throw new ReceiptTimeoutError(step, transactionHash, timeoutMs);
    if (receipt !== null) {
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
        throw new ReceiptRpcError(step, transactionHash);
      }
      return receipt;
    }

    const waitMs = Math.min(pollIntervalMs, deadline - performance.now());
    if (waitMs <= 0) throw new ReceiptTimeoutError(step, transactionHash, timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export function assertReceiptStatus(receipt, transactionHash, step, success = true) {
  const expected = success ? '0x1' : '0x0';
  if (receipt.status !== expected) {
    throw new ReceiptStatusError(step, transactionHash, expected, String(receipt.status ?? 'missing'));
  }
}
