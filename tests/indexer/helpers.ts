import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { parseConfig } from '../../indexer/config.js';
import { blockTag, type RpcTransport } from '../../indexer/rpc.js';
import type { BatchStorage, JsonObject, LogBatch } from '../../indexer/types.js';

export const address = '0x4444444444444444444444444444444444444444';
export const treasury = '0x1111111111111111111111111111111111111111';
export const hash = (n: bigint | number) => '0x' + BigInt(n).toString(16).padStart(64, '0');
export const configInput = () => ({ rpcUrl: 'http://127.0.0.1:8545', chainId: '31337', deploymentId: '1', fromBlock: '100',
  toBlock: '105', batchSize: '2', contracts: [{ role: 'budget_token', address, deploymentBlock: '100', abiVersion: 'oz-5.4.0-erc20' }] });
export const config = () => parseConfig(configInput(), {});

export function rpcLog(block = 100n, txIndex = 0n, index = 0n): JsonObject {
  return { address, blockNumber: blockTag(block), blockHash: hash(block), transactionHash: hash(10_000n + block * 10n + txIndex),
    transactionIndex: blockTag(txIndex), logIndex: blockTag(index), removed: false,
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', hash(1), hash(2)],
    data: hash((1n << 255n) + 1n), syntheticExtra: { retained: true } };
}

export class FixtureRpc implements RpcTransport {
  calls: { method: string; params: unknown[] }[] = [];
  logs: JsonObject[] = [];
  chainId = '0x7a69';
  head = 105n;
  override?: (method: string, params: unknown[]) => unknown;
  async call(method: string, params: unknown[]): Promise<unknown> {
    this.calls.push({ method, params });
    const override = this.override?.(method, params);
    if (override !== undefined) return override;
    if (method === 'eth_chainId') return this.chainId;
    if (method === 'eth_blockNumber') return blockTag(this.head++);
    if (method === 'eth_getBlockByNumber') {
      const number = BigInt(params[0] as string);
      return { number: blockTag(number), hash: hash(number), parentHash: hash(number - 1n), timestamp: blockTag(1_700_000_000n + number),
        transactions: [0n, 1n, 2n].map((tx) => hash(10_000n + number * 10n + tx)) };
    }
    if (method === 'eth_getLogs') {
      const filter = params[0] as { address: string; fromBlock: string; toBlock: string };
      return this.logs.filter((log) => log.address === filter.address && BigInt(log.blockNumber as string) >= BigInt(filter.fromBlock)
        && BigInt(log.blockNumber as string) <= BigInt(filter.toBlock));
    }
    throw new Error('Unexpected RPC method');
  }
}

export class RecordingStorage implements BatchStorage {
  batches: LogBatch[] = [];
  failBatch = -1;
  async writeBatch(_config: unknown, batch: LogBatch) {
    if (this.batches.length === this.failBatch) throw new Error('Simulated database failure');
    this.batches.push(structuredClone(batch));
    return { insertedBlocks: batch.blocks.length, insertedEvents: batch.logs.length, duplicateEvents: 0 };
  }
}

export async function serveRpc(handler: (body: { id: unknown; method: string; params: unknown[] }) => unknown | Promise<unknown>): Promise<{ url: string; server: Server }> {
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    const body = JSON.parse(raw);
    try { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: await handler(body) })); }
    catch { res.statusCode = 503; res.end('provider error with secret'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address();
  if (!bound || typeof bound === 'string') throw new Error('Missing listener');
  return { url: `http://127.0.0.1:${bound.port}/rpc-secret`, server };
}
