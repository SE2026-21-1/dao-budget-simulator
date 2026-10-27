import { isDeepStrictEqual } from 'node:util';
import { decodeLog } from './decoder.js';
import { PG_BIGINT_MAX } from './config.js';
import { IndexerError } from './errors.js';
import { blockTag, hex, quantity, rpcObject, type RpcTransport } from './rpc.js';
import type { BlockHeader, IndexerConfig, JsonObject, LogBatch, NormalizedLog } from './types.js';
import { sourceKey } from './scope.js';

export function* blockRanges(from: bigint, to: bigint, size: bigint): Generator<[bigint, bigint]> {
  if (size < 1n || from < 0n || to < from) throw new IndexerError('INVALID_RANGE', 'Invalid finite block range/batch size.');
  for (let start = from; start <= to; start += size) yield [start, start + size - 1n < to ? start + size - 1n : to];
}

export async function readHeader(rpc: RpcTransport, number: bigint): Promise<BlockHeader> {
  const header = rpcObject(await rpc.call('eth_getBlockByNumber', [blockTag(number), false]), 'block header');
  if (quantity(header.number, 'block.number') !== number) throw new IndexerError('BLOCK_MISMATCH', 'RPC returned the wrong block number.');
  if (!Array.isArray(header.transactions)) throw new IndexerError('RPC_INVALID_DATA', 'Block transaction hashes are required.');
  const transactions = header.transactions.map((tx) => hex(tx, 'block transaction hash', 32));
  if (new Set(transactions).size !== transactions.length) {
    throw new IndexerError('RPC_INVALID_DATA', 'Block contains duplicate transaction hashes.');
  }
  return {
    number, hash: hex(header.hash, 'block.hash', 32), parentHash: hex(header.parentHash, 'block.parentHash', 32),
    timestamp: quantity(header.timestamp, 'block.timestamp'),
    transactions,
  };
}

export interface ReadResult { batch: LogBatch; discardedOutsideDeployment: number }

export async function readBatch(
  config: IndexerConfig, rpc: RpcTransport, from: bigint, to: bigint, previous?: BlockHeader,
): Promise<ReadResult> {
  const blocks: BlockHeader[] = [];
  let parent = previous;
  for (let number = from; number <= to; number++) {
    const header = await readHeader(rpc, number);
    if (parent && (header.number !== parent.number + 1n || header.parentHash !== parent.hash || header.timestamp < parent.timestamp)) {
      throw new IndexerError('BLOCK_MISMATCH', 'Headers are not a consistent contiguous parent chain.');
    }
    blocks.push(header);
    parent = header;
  }
  const headers = new Map(blocks.map((block) => [block.number, block]));
  const scope = new Map(config.contracts.map((contract) => [contract.address, contract]));
  const logs: NormalizedLog[] = [];
  let discardedOutsideDeployment = 0;
  const scannedSources: string[] = [];
  for (const contract of config.contracts) {
    const start = from > contract.deploymentBlock ? from : contract.deploymentBlock;
    if (start > to) continue;
    const result = await rpc.call('eth_getLogs', [{ address: contract.address, fromBlock: blockTag(start), toBlock: blockTag(to) }]);
    if (!Array.isArray(result)) throw new IndexerError('RPC_INVALID_DATA', 'eth_getLogs must return an array.');
    scannedSources.push(sourceKey(contract));
    for (const value of result) {
      const raw = rpcObject(value, 'log');
      const address = hex(raw.address, 'log.address', 20);
      if (!scope.has(address)) { discardedOutsideDeployment++; continue; }
      if (address !== contract.address) throw new IndexerError('RPC_FILTER_MISMATCH', 'RPC log does not match the requested contract filter.');
      if (raw.removed !== false) throw new IndexerError('REMOVED_LOG', 'Removed or unconfirmed logs cannot be stored as canonical.');
      const blockNumber = quantity(raw.blockNumber, 'log.blockNumber');
      const blockHash = hex(raw.blockHash, 'log.blockHash', 32);
      const transactionHash = hex(raw.transactionHash, 'log.transactionHash', 32);
      const transactionIndex = quantity(raw.transactionIndex, 'log.transactionIndex', PG_BIGINT_MAX);
      const logIndex = quantity(raw.logIndex, 'log.logIndex', PG_BIGINT_MAX);
      const header = headers.get(blockNumber);
      if (blockNumber < start || blockNumber > to || !header || header.hash !== blockHash) {
        throw new IndexerError('LOG_BLOCK_MISMATCH', 'Log block coordinates/hash do not match the requested headers.');
      }
      // A JS array length is bounded by a safe integer; only convert after checking that bound.
      if (transactionIndex >= BigInt(header.transactions.length) || header.transactions[Number(transactionIndex)] !== transactionHash) {
        throw new IndexerError('LOG_TRANSACTION_MISMATCH', 'Log transaction hash/index does not match its block.');
      }
      if (!Array.isArray(raw.topics) || raw.topics.length > 4) throw new IndexerError('RPC_INVALID_DATA', 'Log topics must contain zero to four hashes.');
      logs.push({ contract, blockNumber, blockHash, transactionHash, transactionIndex, logIndex,
        topics: raw.topics.map((topic) => hex(topic, 'log.topic', 32)), data: hex(raw.data, 'log.data'), rawLog: raw as JsonObject });
    }
  }
  logs.sort((a, b) => {
    for (const field of ['blockNumber', 'transactionIndex', 'logIndex'] as const) {
      if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
    }
    return 0;
  });
  const positions = new Set<string>();
  const txBlocks = new Map<string, bigint>();
  let preceding: NormalizedLog | undefined;
  for (const log of logs) {
    const position = `${log.blockNumber}:${log.logIndex}`;
    if (positions.has(position) || (preceding && preceding.blockNumber === log.blockNumber && preceding.logIndex >= log.logIndex)) {
      throw new IndexerError('LOG_POSITION_CONFLICT', 'Log positions collide or disagree with transaction order.');
    }
    if (txBlocks.has(log.transactionHash) && txBlocks.get(log.transactionHash) !== log.blockNumber) {
      throw new IndexerError('LOG_TRANSACTION_MISMATCH', 'Transaction appears in multiple blocks.');
    }
    positions.add(position);
    txBlocks.set(log.transactionHash, log.blockNumber);
    preceding = log;
  }
  // Catch a branch change while fetching logs; this is detection, not reorg rollback.
  const last = blocks.at(-1);
  if (last && !isDeepStrictEqual(await readHeader(rpc, last.number), last)) {
    throw new IndexerError('BLOCK_CHANGED', 'Batch end header changed during the scan; batch was not written.');
  }
  return { batch: { fromBlock: from, toBlock: to, blocks, scannedSources, logs: logs.map((log) => ({ log, decode: decodeLog(log) })) }, discardedOutsideDeployment };
}
