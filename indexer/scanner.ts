import { IndexerError, publicError } from './errors.js';
import { blockRanges, readBatch } from './reader.js';
import { quantity, type RpcTransport } from './rpc.js';
import type { BatchStorage, BlockHeader, IndexerConfig, WriteResult } from './types.js';

export interface BatchReport extends WriteResult {
  fromBlock: string;
  toBlock: string;
  decoded: number;
  unknownTopics: number;
  decodeErrors: number;
  discardedOutsideDeployment: number;
  issues: { blockNumber: string; transactionHash: string; logIndex: string; code: string; abiVersion: string }[];
}

export interface ScanReport {
  status: 'completed' | 'completed_with_decode_issues' | 'failed';
  chainId: string;
  deploymentId: string;
  fromBlock: string;
  toBlock: string;
  committedBatches: BatchReport[];
  failedBatch?: { fromBlock: string; toBlock: string };
  error?: { code: string; message: string };
}

export class ScanError extends Error {
  constructor(public readonly report: ScanReport) { super(report.error?.message ?? 'Scan failed.'); }
}

export async function scan(
  config: IndexerConfig, rpc: RpcTransport, storage: BatchStorage, onBatch?: (report: BatchReport) => void,
): Promise<ScanReport> {
  const report: ScanReport = { status: 'failed', chainId: config.chainId.toString(), deploymentId: config.deploymentId,
    fromBlock: config.fromBlock.toString(), toBlock: config.toBlock.toString(), committedBatches: [] };
  try {
    const actualChain = quantity(await rpc.call('eth_chainId', []), 'eth_chainId');
    if (actualChain !== config.chainId) throw new IndexerError('CHAIN_ID_MISMATCH', 'RPC chainId differs from configured chainId; no database writes attempted.');
    // Pin latest exactly once. No polling or moving scan boundary in BE02.
    const to = config.toBlock === 'latest' ? quantity(await rpc.call('eth_blockNumber', []), 'eth_blockNumber') : config.toBlock;
    report.toBlock = to.toString();
    if (to < config.fromBlock) throw new IndexerError('INVALID_RANGE', 'Pinned head is below fromBlock.');
    const earliest = config.contracts.reduce((min, contract) => contract.deploymentBlock < min ? contract.deploymentBlock : min, config.contracts[0]!.deploymentBlock);
    const from = config.fromBlock > earliest ? config.fromBlock : earliest;
    report.fromBlock = from.toString();
    let previous: BlockHeader | undefined;
    if (from <= to) {
      for (const [start, end] of blockRanges(from, to, config.batchSize)) {
        report.failedBatch = { fromBlock: start.toString(), toBlock: end.toString() };
        const { batch, discardedOutsideDeployment } = await readBatch(config, rpc, start, end, previous);
        const written = await storage.writeBatch(config, batch);
        const batchReport: BatchReport = { fromBlock: start.toString(), toBlock: end.toString(), ...written,
          decoded: batch.logs.filter(({ decode }) => decode.status === 'decoded').length,
          unknownTopics: batch.logs.filter(({ decode }) => decode.status === 'unknown_topic').length,
          decodeErrors: batch.logs.filter(({ decode }) => decode.status === 'decode_error').length,
          discardedOutsideDeployment,
          issues: batch.logs.flatMap(({ log, decode }) => decode.status === 'decoded' ? [] : [{ blockNumber: log.blockNumber.toString(),
            transactionHash: log.transactionHash, logIndex: log.logIndex.toString(), code: decode.code, abiVersion: decode.abiVersion }]),
        };
        report.committedBatches.push(batchReport);
        delete report.failedBatch;
        previous = batch.blocks.at(-1);
        onBatch?.(batchReport);
      }
    }
    report.status = report.committedBatches.some((batch) => batch.unknownTopics + batch.decodeErrors > 0) ? 'completed_with_decode_issues' : 'completed';
    return report;
  } catch (error) {
    report.error = publicError(error);
    // Storage exposes safe diagnostics without forwarding PostgreSQL error text.
    if (error instanceof Error && error.name === 'StorageError' && 'code' in error && typeof error.code === 'string') {
      report.error = { code: error.code, message: 'Database batch failed. Check deployment metadata, conflicting stored data or connection availability.' };
    }
    throw new ScanError(report);
  }
}
