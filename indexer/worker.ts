import type { Pool } from 'pg';
import { IndexerError, publicError } from './errors.js';
import { HttpRpc, pause, type RpcTransport } from './rpc.js';
import { PostgresStorage, StorageError } from './storage.js';
import { sync, SyncError } from './syncer.js';
import { project } from './projection/projector.js';
import type { IndexerConfig } from './types.js';

const transient = new Set(['RPC_UNAVAILABLE','CHECKPOINT_HEAD_BEHIND','REORG_RETRY','BLOCK_CHANGED']);
/** One serial writer loop; shutdown aborts HTTP, body reads and backoff. */
export async function worker(config: IndexerConfig, pool: Pool, signal: AbortSignal,
  emit: (value: unknown) => void, rpc: RpcTransport = new HttpRpc(config.rpcUrl, 5000, { signal })): Promise<void> {
  if (config.toBlock !== 'latest') throw new IndexerError('INVALID_CONFIG', 'Worker requires toBlock=latest.');
  const state = (await pool.query("SELECT to_jsonb(d)->'indexer_state' AS state FROM deployments d WHERE deployment_id=$1", [config.deploymentId])).rows[0]?.state;
  if (!state) throw new IndexerError('INVALID_CONFIG', 'BE07 worker requires migration 005 and existing deployment metadata.');
  const storage = new PostgresStorage(pool);
  while (!signal.aborted) {
    try {
      await sync(config, rpc, storage);
      const cp = await storage.loadCheckpoint(config);
      if (cp) {
        emit({ type: 'worker_publication', ...(await project(config, rpc, pool)) });
      }
    } catch (error) {
      if (signal.aborted) return;
      const info = error instanceof SyncError ? error.report.error! : error instanceof StorageError ? {code:error.code,message:error.message,retryable:error.retryable} : publicError(error);
      emit({ type: 'worker_error', ...info });
      if (!transient.has(info.code) && !('retryable' in info && info.retryable)) throw error;
    }
    try { await pause(config.pollIntervalMs ?? 1000, signal); } catch { if (!signal.aborted) throw new IndexerError('WORKER_FAILED', 'Worker timer failed.'); }
  }
}
