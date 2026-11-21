import { IndexerError, publicError } from './errors.js';
import { blockRanges, readBatch, readHeader } from './reader.js';
import { quantity, type RpcTransport } from './rpc.js';
import { confirmationDepth, firstBlock, safeBlock } from './scope.js';
import { StorageError } from './storage.js';
import type { Checkpoint, DecodeIssue, IndexerConfig, SyncStorage } from './types.js';

export interface SyncReport {
  status: 'raw_synced' | 'raw_synced_with_decode_issues' | 'failed';
  chainId: string;
  deploymentId: string;
  head?: string;
  safeBlock?: string | null;
  checkpoint: { number: string; hash: string } | null;
  decodeComplete: boolean;
  unknownTopics: number;
  decodeErrors: number;
  issues: DecodeIssue[];
  committedBatches: number;
  error?: { code: string; message: string; retryable?: boolean };
}

export class SyncError extends Error {
  constructor(public readonly report: SyncReport) { super(report.error?.message); }
}

/** One bounded catch-up. Invoke again to resume; each invocation verifies H even when idle. */
export async function sync(config: IndexerConfig, rpc: RpcTransport, storage: SyncStorage,
  onBatch?: (batch: { type: 'batch_committed'; fromBlock: string; toBlock: string }) => void): Promise<SyncReport> {
  const report: SyncReport = { status: 'failed', chainId: config.chainId.toString(), deploymentId: config.deploymentId,
    checkpoint: null, decodeComplete: false, unknownTopics: 0, decodeErrors: 0, issues: [], committedBatches: 0 };
  let cp: Checkpoint | null = null;
  try {
    const k = confirmationDepth(config);
    if (config.fromBlock > firstBlock(config)) throw new IndexerError('INVALID_CONFIG', 'BE03 cannot skip source deployment blocks.');
    if (quantity(await rpc.call('eth_chainId', []), 'eth_chainId') !== config.chainId) {
      throw new IndexerError('CHAIN_ID_MISMATCH', 'RPC chain differs from configuration.');
    }
    cp = await storage.loadCheckpoint(config);
    let previous;
    if (cp) {
      report.checkpoint = { number: cp.number.toString(), hash: cp.hash };
      try { previous = await readHeader(rpc, cp.number); } // Check even when idle.
      catch (error) {
        if (!(error instanceof IndexerError) || error.code !== 'RPC_INVALID_DATA' || !storage.recoverShorterChain) throw error;
        cp = await storage.recoverShorterChain(config, rpc, cp);
        previous = cp ? await readHeader(rpc, cp.number) : undefined;
      }
      report.checkpoint = cp ? { number: cp.number.toString(), hash: cp.hash } : null;
      if (cp && (previous?.hash !== cp.hash || await storage.recoveryPending?.(config))) {
        if (!storage.recoverCheckpoint) throw new IndexerError('CHECKPOINT_HASH_MISMATCH', 'RPC checkpoint hash differs; recovery storage is required.');
        cp = await storage.recoverCheckpoint(config, rpc, cp);
        previous = cp ? await readHeader(rpc, cp.number) : undefined;
        report.checkpoint = cp ? { number: cp.number.toString(), hash: cp.hash } : null;
      }
    }
    const head = quantity(await rpc.call('eth_blockNumber', []), 'eth_blockNumber');
    if (cp && head < cp.number) throw new IndexerError('CHECKPOINT_HEAD_BEHIND', 'RPC head is below verified checkpoint.');
    const safe = safeBlock(head, k);
    report.head = head.toString();
    report.safeBlock = safe?.toString() ?? null;
    const to = safe === null ? null : config.toBlock === 'latest' || config.toBlock > safe ? safe : config.toBlock;
    const from = cp ? cp.number + 1n : firstBlock(config);
    if (to !== null && from <= to) {
      for (const [start, end] of blockRanges(from, to, config.batchSize)) {
        if (cp && (await readHeader(rpc, cp.number)).hash !== cp.hash) {
          await storage.recoverCheckpoint?.(config, rpc, cp);
          throw new IndexerError('REORG_RETRY', 'Checkpoint changed during catch-up; recovery persisted. Run sync again.');
        }
        const { batch } = await readBatch(config, rpc, start, end, previous);
        await storage.writeCheckpointBatch(config, batch, cp, head);
        const last = batch.blocks.at(-1)!;
        cp = { number: last.number, hash: last.hash };
        previous = last;
        report.checkpoint = { number: cp.number.toString(), hash: cp.hash };
        report.committedBatches++;
        onBatch?.({ type: 'batch_committed', fromBlock: start.toString(), toBlock: end.toString() });
      }
    }
    if (cp && (await readHeader(rpc, cp.number)).hash !== cp.hash) {
      await storage.recoverCheckpoint?.(config, rpc, cp);
      throw new IndexerError('REORG_RETRY', 'Checkpoint changed after ingestion; recovery persisted. Run sync again.');
    }
    await storage.observe?.(config, head, cp);
    Object.assign(report, await storage.decodeIssues(config, cp?.number));
    report.decodeComplete = report.unknownTopics + report.decodeErrors === 0;
    report.status = report.decodeComplete ? 'raw_synced' : 'raw_synced_with_decode_issues';
    return report;
  } catch (error) {
    if (cp && error instanceof IndexerError && error.code === 'RPC_INVALID_DATA' && storage.recoverShorterChain) {
      try {
        await storage.recoverShorterChain(config, rpc, cp);
        error = new IndexerError('REORG_RETRY', 'Shorter fork detected during catch-up; recovery persisted.');
      } catch (recoveryError) { error = recoveryError; }
    }
    if (cp && error instanceof IndexerError && ['BLOCK_CHANGED','BLOCK_MISMATCH','LOG_BLOCK_MISMATCH','REMOVED_LOG'].includes(error.code)) {
      try {
        if ((await readHeader(rpc, cp.number)).hash !== cp.hash && storage.recoverCheckpoint) {
          await storage.recoverCheckpoint(config, rpc, cp);
          error = new IndexerError('REORG_RETRY', 'Fork detected during batch read; recovery persisted.');
        }
      } catch (recoveryError) { error = recoveryError; }
    }
    report.error = error instanceof StorageError ? { code: error.code, message: error.message, retryable: error.retryable } : publicError(error);
    throw new SyncError(report);
  }
}
