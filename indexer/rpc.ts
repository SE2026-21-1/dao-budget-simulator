import { IndexerError } from './errors.js';
import { UINT256_MAX } from './config.js';

export interface RpcTransport {
  call(method: string, params: unknown[]): Promise<unknown>;
}

export class HttpRpc implements RpcTransport {
  private id = 0;
  constructor(private readonly url: string, private readonly timeoutMs = 30_000) {}

  async call(method: string, params: unknown[]): Promise<unknown> {
    const id = ++this.id;
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new IndexerError('RPC_UNAVAILABLE', `${method}: RPC transport failed or timed out.`);
    }
    if (!response.ok) throw new IndexerError('RPC_HTTP_ERROR', `${method}: RPC HTTP status ${response.status}.`);
    let body: Record<string, unknown>;
    try { body = rpcObject(await response.json(), 'RPC response'); }
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
