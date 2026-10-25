import { setTimeout as sleep } from 'node:timers/promises';
import { IndexerError } from './errors.js';
import { UINT256_MAX } from './config.js';

export interface RpcTransport {
  call(method: string, params: unknown[]): Promise<unknown>;
}

export interface HttpRpcRetryPolicy {
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
}

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_READ_METHODS: Record<string, true> = {
  eth_chainId: true,
  eth_blockNumber: true,
  eth_getBlockByNumber: true,
  eth_getLogs: true,
  eth_getCode: true,
  eth_call: true,
};

class RetryableRpcError extends IndexerError {
  constructor(code: string, message: string, readonly retryAfterMs = 0) { super(code, message, true); }
}

function retryAfterMs(value: string | null, now: number): number {
  if (value === null) return 0;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const delay = Number.isNaN(seconds) ? Date.parse(value) - now : seconds * 1_000;
  return Number.isNaN(delay) ? 0 : Math.min(MAX_RETRY_DELAY_MS, Math.max(0, delay));
}

export class HttpRpc implements RpcTransport {
  private id = 0;
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 30_000,
    private readonly retryPolicy: HttpRpcRetryPolicy = {},
  ) {}

  async call(method: string, params: unknown[]): Promise<unknown> {
    const id = ++this.id;
    for (let attempt = 1; ; attempt++) {
      try { return await this.callAttempt(method, params, id); }
      catch (error) {
        if (!(error instanceof RetryableRpcError)) throw error;
        if (!Object.hasOwn(RETRYABLE_READ_METHODS, method)) throw new IndexerError(error.code, error.message);
        if (attempt >= MAX_ATTEMPTS) throw error;
        const delay = Math.min(MAX_RETRY_DELAY_MS, Math.max(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), error.retryAfterMs));
        if (this.retryPolicy.sleep) await this.retryPolicy.sleep(delay);
        else await sleep(delay);
      }
    }
  }

  private async callAttempt(method: string, params: unknown[], id: number): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RetryableRpcError('RPC_UNAVAILABLE', `${method}: RPC transport failed or timed out.`);
    }
    if (!response.ok) {
      const delay = retryAfterMs(response.headers.get('retry-after'), this.retryPolicy.now?.() ?? Date.now());
      // Do not consume or expose provider error bodies; release the connection before retrying.
      await response.body?.cancel().catch(() => undefined);
      const message = `${method}: RPC HTTP status ${response.status}.`;
      if (TRANSIENT_HTTP_STATUSES.has(response.status)) throw new RetryableRpcError('RPC_HTTP_ERROR', message, delay);
      throw new IndexerError('RPC_HTTP_ERROR', message);
    }
    let text: string;
    // The fetch signal remains active while reading the body, not just until headers arrive.
    try { text = await response.text(); }
    catch { throw new RetryableRpcError('RPC_UNAVAILABLE', `${method}: RPC transport failed or timed out.`); }
    let body: Record<string, unknown>;
    try { body = rpcObject(JSON.parse(text), 'RPC response'); }
    catch { throw new IndexerError('RPC_INVALID_RESPONSE', `${method}: RPC response is not a JSON object.`); }
    if (body.id !== id || body.jsonrpc !== '2.0') {
      throw new IndexerError('RPC_INVALID_RESPONSE', `${method}: RPC response ID/version mismatch.`);
    }
    if (body.error !== undefined) throw new IndexerError('RPC_ERROR', `${method}: provider returned a JSON-RPC error.`);
    if (!Object.hasOwn(body, 'result')) throw new IndexerError('RPC_INVALID_RESPONSE', `${method}: missing RPC result.`);
    return body.result;
  }
}

export function rpcObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IndexerError('RPC_INVALID_DATA', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function quantity(value: unknown, field: string, max = UINT256_MAX): bigint {
  if (typeof value !== 'string' || !/^0x(0|[1-9a-f][0-9a-f]*)$/i.test(value) || BigInt(value) > max) {
    throw new IndexerError('RPC_INVALID_DATA', `${field} must be a valid in-range RPC quantity.`);
  }
  return BigInt(value);
}

export function hex(value: unknown, field: string, bytes?: number): string {
  const pattern = bytes === undefined ? /^0x(?:[0-9a-f]{2})*$/i : new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`, 'i');
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new IndexerError('RPC_INVALID_DATA', `${field} must be valid hex${bytes === undefined ? '' : ` (${bytes} bytes)`}.`);
  }
  return value.toLowerCase();
}

export function blockTag(block: bigint): string { return '0x' + block.toString(16); }
