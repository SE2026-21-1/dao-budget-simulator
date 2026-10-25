import { IndexerError } from './errors.js';
import { UINT256_MAX } from './config.js';

export interface RpcTransport {
  call(method: string, params: unknown[]): Promise<unknown>;
}

export class RpcError extends IndexerError {
  constructor(code: string, message: string, public readonly retryable: boolean) { super(code, message); }
}
export interface RpcOptions {
  maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; signal?: AbortSignal;
  random?: () => number;
}
export class HttpRpc implements RpcTransport {
  private id = 0;
  constructor(private readonly url: string, private readonly timeoutMs = 5000, private readonly options: RpcOptions = {}) {
    try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
    catch { throw new IndexerError('INVALID_CONFIG', 'RPC requires an HTTP(S) URL.'); }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
        !Number.isInteger(options.maxAttempts ?? 4) || (options.maxAttempts ?? 4) < 1 || (options.maxAttempts ?? 4) > 10 ||
        !Number.isFinite(options.baseDelayMs ?? 250) || (options.baseDelayMs ?? 250) < 0 ||
        !Number.isFinite(options.maxDelayMs ?? 2000) || (options.maxDelayMs ?? 2000) < 0)
      throw new IndexerError('INVALID_CONFIG', 'Invalid bounded RPC retry/timeout configuration.');
  }
  async call(method: string, params: unknown[]): Promise<unknown> {
    const attempts = this.options.maxAttempts ?? 4;
    for (let attempt = 0; ; attempt++) {
      if (this.options.signal?.aborted) throw new IndexerError('STOPPED', 'RPC stopped.');
      try { return await this.request(method, params); }
      catch (e) {
        if (this.options.signal?.aborted) throw new IndexerError('STOPPED', 'RPC stopped.');
        if (!(e instanceof RpcError) || !e.retryable || attempt + 1 >= attempts) throw e;
        const cap = Math.min(this.options.maxDelayMs ?? 2000, (this.options.baseDelayMs ?? 250) * 2 ** attempt);
        const delay = cap * (0.5 + 0.5 * (this.options.random ?? Math.random)());
        try { await pause(delay, this.options.signal); }
        catch { throw new IndexerError('STOPPED', 'RPC stopped during backoff.'); }
      }
    }
  }
  private async request(method: string, params: unknown[]): Promise<unknown> {
    const id = ++this.id;
    const signals = [AbortSignal.timeout(this.timeoutMs), ...(this.options.signal ? [this.options.signal] : [])];
    let response: Response;
    let body: Record<string, unknown>;
    try {
      response = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.any(signals),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const temporary = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new RpcError(temporary ? 'RPC_UNAVAILABLE' : 'RPC_HTTP_ERROR', `${method}: RPC HTTP status ${response.status}.`, temporary);
      }
      try { body = rpcObject(await response.json(), 'RPC response'); }
      catch {
        if (signals.some(s => s.aborted)) throw new RpcError('RPC_UNAVAILABLE', `${method}: RPC timed out.`, true);
        throw new RpcError('RPC_INVALID_RESPONSE', `${method}: invalid JSON response.`, false);
      }
    } catch (e) {
      if (e instanceof IndexerError) throw e;
      throw new RpcError('RPC_UNAVAILABLE', `${method}: RPC transport failed or timed out.`, true);
    }
    if (body.id !== id || body.jsonrpc !== '2.0')
      throw new RpcError('RPC_INVALID_RESPONSE', `${method}: RPC response ID/version mismatch.`, false);
    if (body.error !== undefined) {
      const code = typeof body.error === 'object' && body.error !== null ? (body.error as Record<string, unknown>).code : null;
      const temporary = code === -32005 || code === -32016 || code === -32603;
      throw new RpcError(temporary ? 'RPC_UNAVAILABLE' : 'RPC_ERROR', `${method}: provider JSON-RPC error code ${typeof code === 'number' ? code : 'invalid'}.`, temporary);
    }
    if (!Object.hasOwn(body, 'result')) throw new RpcError('RPC_INVALID_RESPONSE', `${method}: missing RPC result.`, false);
    return body.result;
  }
}

export async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  const { setTimeout } = await import('node:timers/promises');
  await setTimeout(ms, undefined, signal ? { signal } : {});
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
