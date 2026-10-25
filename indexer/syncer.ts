import { IndexerError, publicError } from './errors.js';
import { blockRanges, readBatch, readHeader } from './reader.js';
import { quantity, type RpcTransport } from './rpc.js';
import { confirmationDepth, firstBlock, safeBlock } from './scope.js';
import { StorageError } from './storage.js';
import type { BlockHeader, Checkpoint, DecodeIssue, IndexerConfig, SyncStorage } from './types.js';

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
  reorg?: { from: string; ancestor: string | null; replayFrom: string };
}

export class SyncError extends Error {
  constructor(public readonly report: SyncReport) { super(report.error?.message); }
}

// A deeper replacement stays fail-closed and requires an explicit BE06 rebuild.
const REORG_WINDOW = 64n;

async function recover(config: IndexerConfig, rpc: RpcTransport, storage: SyncStorage,
  cp: Checkpoint, safe: bigint | null): Promise<Checkpoint | null> {
  await storage.invalidate(config, cp, 'REORG_DETECTED');
  const first = firstBlock(config);
  const lower = cp.number - REORG_WINDOW > first ? cp.number - REORG_WINDOW : first;
  const candidates = await storage.recentCheckpoints(config, cp, lower);
  let ancestor: Checkpoint | null = null;
  for (const candidate of candidates) {
    if (safe === null || candidate.number > safe || candidate.number >= cp.number) continue;
    if ((await readHeader(rpc, candidate.number)).hash === candidate.hash) {
      ancestor = candidate;
      break;
    }
  }
  if (!ancestor && cp.number - first + 1n > REORG_WINDOW)
    throw new IndexerError('REORG_WINDOW_EXCEEDED', 'No common confirmed ancestor within 64 blocks; publication disabled. Use an explicit BE06 rebuild into a new database.');
  // The provider may reorganize while the search is in progress.
  if (ancestor && (await readHeader(rpc, ancestor.number)).hash !== ancestor.hash)
    throw new IndexerError('REORG_UNSTABLE', 'Common ancestor changed during recovery; publication remains disabled.');
  await storage.rewind(config, cp, ancestor);
  return ancestor;
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
    const head = quantity(await rpc.call('eth_blockNumber', []), 'eth_blockNumber');
    const safe = safeBlock(head, k);
    report.head = head.toString();
    report.safeBlock = safe?.toString() ?? null;
    let previous: BlockHeader | undefined;
    if (cp) {
      report.checkpoint = { number: cp.number.toString(), hash: cp.hash };
      previous = cp.number <= head ? await readHeader(rpc, cp.number) : undefined;
      if (!previous || previous.hash !== cp.hash || safe === null || cp.number > safe) {
        const old = cp;
        cp = await recover(config, rpc, storage, cp, safe);
        report.reorg = { from: old.number.toString(), ancestor: cp?.number.toString() ?? null,
          replayFrom: (cp ? cp.number + 1n : firstBlock(config)).toString() };
        report.checkpoint = cp ? { number: cp.number.toString(), hash: cp.hash } : null;
        previous = cp ? await readHeader(rpc, cp.number) : undefined;
      }
    }
    const to = safe === null ? null : config.toBlock === 'latest' || config.toBlock > safe ? safe : config.toBlock;
    const from = cp ? cp.number + 1n : firstBlock(config);
    if (to !== null && from <= to) {
      for (const [start, end] of blockRanges(from, to, config.batchSize)) {
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
    if (cp) {
      if ((await readHeader(rpc, cp.number)).hash !== cp.hash)
        throw new IndexerError('REORG_UNSTABLE', 'Checkpoint changed during ingestion; retry from the last committed checkpoint.');
      await storage.completeSync(config, cp, head);
    }
    Object.assign(report, await storage.decodeIssues(config, cp?.number));
    report.decodeComplete = report.unknownTopics + report.decodeErrors === 0;
    report.status = report.decodeComplete ? 'raw_synced' : 'raw_synced_with_decode_issues';
    return report;
  } catch (error) {
    if (cp && error instanceof IndexerError &&
        ['BLOCK_MISMATCH', 'LOG_BLOCK_MISMATCH', 'REMOVED_LOG', 'REORG_UNSTABLE'].includes(error.code)) {
      await storage.invalidate(config, cp, error.code);
    }
    report.error = error instanceof StorageError ? { code: error.code, message: error.message } : publicError(error);
    throw new SyncError(report);
  }
}
