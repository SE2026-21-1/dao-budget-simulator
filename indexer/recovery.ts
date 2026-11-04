import type { Pool, PoolClient } from 'pg';
import { IndexerError } from './errors.js';
import { readHeader } from './reader.js';
import { quantity, type RpcTransport } from './rpc.js';
import { firstBlock } from './scope.js';
import { checkpoint, verifyMetadata, type TransactionHooks } from './storage.js';
import type { Checkpoint, IndexerConfig } from './types.js';

export async function runtime(client: PoolClient, deploymentId: string): Promise<Record<string, unknown> | null> {
  const r = await client.query('SELECT to_jsonb(d)->\'indexer_state\' AS state FROM deployments d WHERE deployment_id=$1', [deploymentId]);
  return r.rows[0]?.state ?? null;
}
export async function lock(client: PoolClient, config: IndexerConfig): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
}
export function sameCheckpoint(a: Checkpoint | null, b: Checkpoint | null): boolean {
  return a?.number === b?.number && a?.hash === b?.hash;
}

/** Commit the serving gate before doing any RPC search or destructive work. */
export async function recover(pool: Pool, config: IndexerConfig, rpc: RpcTransport, expected: Checkpoint,
  hooks: TransactionHooks): Promise<Checkpoint | null> {
  // Callers already observed a hash mismatch after checking chain identity.
  // Persist the gate before another provider request can fail; verify chain again before rollback.
  const c = await pool.connect();
  let revision: string;
  try {
    await c.query('BEGIN'); await lock(c, config); await verifyMetadata(c, config, true);
    const current = await checkpoint(c, config);
    if (!sameCheckpoint(current, expected)) throw new IndexerError('REORG_RETRY', 'Recovery observed a stale checkpoint; restart.');
    const state = await runtime(c, config.deploymentId);
    if (!state) throw new IndexerError('CHECKPOINT_HASH_MISMATCH', 'Apply migration 005 for automatic BE07 recovery.');
    if (state.phase === 'rebuild_required') throw new IndexerError('REBUILD_REQUIRED', 'Rebuild into a new database using BE06.');
    if (state.phase !== 'recovering') {
      await c.query(`UPDATE deployments SET snapshot_revision=gen_random_uuid(),
        indexer_state=indexer_state || jsonb_build_object('phase','recovering','orphanNumber',$2::text,'orphanHash',$3::text)
        WHERE deployment_id=$1`, [config.deploymentId, expected.number.toString(), expected.hash]);
      // Invalidate every revision-bound snapshot, including snapshots below the fork.
      if ((await c.query("SELECT to_regclass('api_read_snapshots') AS t")).rows[0].t)
        await c.query('UPDATE api_read_snapshots SET invalidated_at=clock_timestamp() WHERE deployment_id=$1 AND invalidated_at IS NULL', [config.deploymentId]);
    }
    revision = (await c.query('SELECT snapshot_revision::text AS r FROM deployments WHERE deployment_id=$1', [config.deploymentId])).rows[0].r;
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  await hooks.recoveryMarked?.();

  // Retain all prefix headers for BE03/BE05. Only the search depth is bounded.
  const head = quantity(await rpc.call('eth_blockNumber', []), 'head');
  const ceiling = head < expected.number ? head : expected.number;
  const floor = expected.number - BigInt(config.reorgWindow ?? 128);
  const rows = await pool.query(`SELECT block_number::text AS n,block_hash AS hash FROM indexed_blocks
    WHERE deployment_id=$1 AND block_number BETWEEN $2 AND $3 ORDER BY block_number DESC`,
  [config.deploymentId, (floor > firstBlock(config) ? floor : firstBlock(config)).toString(), ceiling.toString()]);
  let ancestor: Checkpoint | null = null;
  for (const row of rows.rows) {
    const h = await readHeader(rpc, BigInt(row.n)); // RPC failure preserves the durable gate and ALL data.
    if (h.hash === row.hash) { ancestor = { number: h.number, hash: h.hash }; break; }
  }
  if (ancestor && (await readHeader(rpc, ancestor.number)).hash !== ancestor.hash)
    throw new IndexerError('REORG_RETRY', 'Canonical ancestor changed during search; gate remains closed.');
  if (quantity(await rpc.call('eth_chainId', []), 'chainId') !== config.chainId)
    throw new IndexerError('CHAIN_ID_MISMATCH', 'RPC chain changed during ancestor search; gate remains closed.');
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN'); await lock(tx, config); await verifyMetadata(tx, config, true);
    const state = await runtime(tx, config.deploymentId);
    const generation = (await tx.query('SELECT snapshot_revision::text AS r FROM deployments WHERE deployment_id=$1', [config.deploymentId])).rows[0].r;
    if (generation !== revision || state?.phase !== 'recovering' || !sameCheckpoint(await checkpoint(tx, config), expected))
      throw new IndexerError('REORG_RETRY', 'Another recovery completed; restart.');
    if (!ancestor) {
      await tx.query(`UPDATE deployments SET indexer_state=indexer_state || '{"phase":"rebuild_required"}'::jsonb WHERE deployment_id=$1`, [config.deploymentId]);
      await tx.query("UPDATE checkpoints SET sync_status='rebuild_required',last_error_code='REORG_WINDOW_EXCEEDED' WHERE deployment_id=$1", [config.deploymentId]);
    } else {
      // Remove the latest-only model in dependency order, then the orphan raw suffix.
      for (const table of ['disbursements','proposal_states','votes','operations','transfers','proposals','projection_checkpoints']) {
        if ((await tx.query('SELECT to_regclass($1) AS t', [table])).rows[0].t)
          await tx.query(`DELETE FROM ${table} WHERE deployment_id=$1`, [config.deploymentId]);
      }
      await tx.query(`UPDATE checkpoints SET block_number=$2,block_hash=$3,sync_status='syncing',updated_at=clock_timestamp()
        WHERE deployment_id=$1`, [config.deploymentId, ancestor.number.toString(), ancestor.hash]);
      await tx.query('DELETE FROM raw_events WHERE deployment_id=$1 AND block_number>$2', [config.deploymentId, ancestor.number.toString()]);
      await tx.query('DELETE FROM indexed_blocks WHERE deployment_id=$1 AND block_number>$2', [config.deploymentId, ancestor.number.toString()]);
      await tx.query(`UPDATE deployments SET indexer_state=indexer_state ||
        jsonb_build_object('phase','replaying','ancestorNumber',$2::text,'ancestorHash',$3::text) WHERE deployment_id=$1`,
      [config.deploymentId, ancestor.number.toString(), ancestor.hash]);
    }
    await hooks.beforeRollbackCommit?.();
    await tx.query('COMMIT');
  } catch (e) { await tx.query('ROLLBACK'); throw e; } finally { tx.release(); }
  await hooks.afterRollbackCommit?.();
  if (!ancestor) throw new IndexerError('REBUILD_REQUIRED', 'No trusted ancestor within reorgWindow. Use BE06 to rebuild a new database and compare at canonical H/hash.');
  return ancestor;
}
