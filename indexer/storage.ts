import type { Pool, PoolClient } from 'pg';
import { decodeLog } from './decoder.js';
import { confirmationDepth, firstBlock, scopeHash, sourceKey } from './scope.js';
import type { BatchStorage, Checkpoint, DecodeIssue, IndexerConfig, LogBatch, NormalizedLog, SyncStorage, WriteResult } from './types.js';

type StorageCode = 'STORAGE_METADATA_MISMATCH' | 'STORAGE_INVALID_BATCH' | 'STORAGE_CONFLICT' | 'STORAGE_DATABASE_ERROR' | 'CHECKPOINT_CONFLICT';

export class StorageError extends Error {
  constructor(
    public readonly code: StorageCode,
    message: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// The equality predicate is part of the conflict action, so PostgreSQL checks it
// while holding the conflicting row lock. An equal retry returns a no-op update;
// a different row returns nothing and causes the entire batch to roll back.
const INSERT_BLOCK = `
  INSERT INTO indexed_blocks (deployment_id, block_number, block_hash, parent_hash, block_timestamp)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (deployment_id, block_number) DO UPDATE
    SET block_number = indexed_blocks.block_number
    WHERE indexed_blocks.block_hash = EXCLUDED.block_hash
      AND indexed_blocks.parent_hash = EXCLUDED.parent_hash
      AND indexed_blocks.block_timestamp = EXCLUDED.block_timestamp
  RETURNING (xmax = 0) AS inserted`;

const INSERT_EVENT = `
  INSERT INTO raw_events (
    deployment_id, chain_id, contract_role, contract_address,
    block_number, block_hash, transaction_hash, transaction_index, log_index,
    topics, data, removed, event_name, decoded_payload, rpc_log
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::evm_hash32[], $11, FALSE, $12, $13::jsonb, $14::jsonb)
  ON CONFLICT (chain_id, transaction_hash, log_index) DO UPDATE
    SET log_index = raw_events.log_index
    WHERE raw_events.deployment_id = EXCLUDED.deployment_id
      AND raw_events.chain_id = EXCLUDED.chain_id
      AND raw_events.contract_role = EXCLUDED.contract_role
      AND raw_events.contract_address = EXCLUDED.contract_address
      AND raw_events.block_number = EXCLUDED.block_number
      AND raw_events.block_hash = EXCLUDED.block_hash
      AND raw_events.transaction_hash = EXCLUDED.transaction_hash
      AND raw_events.transaction_index = EXCLUDED.transaction_index
      AND raw_events.log_index = EXCLUDED.log_index
      AND raw_events.topics = EXCLUDED.topics
      AND raw_events.data = EXCLUDED.data
      AND raw_events.removed = EXCLUDED.removed
      AND raw_events.event_name IS NOT DISTINCT FROM EXCLUDED.event_name
      AND raw_events.decoded_payload IS NOT DISTINCT FROM EXCLUDED.decoded_payload
      AND raw_events.rpc_log = EXCLUDED.rpc_log
  RETURNING (xmax = 0) AS inserted`;

function invalid(message: string): never {
  throw new StorageError('STORAGE_INVALID_BATCH', message);
}

function validateBatch(config: IndexerConfig, batch: LogBatch): void {
  if (batch.fromBlock < config.fromBlock || batch.toBlock < batch.fromBlock
      || (config.toBlock !== 'latest' && batch.toBlock > config.toBlock)
      || BigInt(batch.blocks.length) !== batch.toBlock - batch.fromBlock + 1n) {
    invalid('Batch must contain every header in its configured inclusive range.');
  }
  const headers = new Map(batch.blocks.map((block) => [block.number, block]));
  for (let index = 0; index < batch.blocks.length; index += 1) {
    const block = batch.blocks[index]!;
    if (block.number !== batch.fromBlock + BigInt(index)
        || (index > 0 && block.parentHash !== batch.blocks[index - 1]!.hash)) {
      invalid('Batch headers are unordered, missing, or have inconsistent parent hashes.');
    }
  }
  for (const { log, decode } of batch.logs) {
    const contract = config.contracts.find((item) => item.role === log.contract.role
      && item.address === log.contract.address);
    if (!contract || contract.deploymentBlock !== log.contract.deploymentBlock
        || contract.abiVersion !== log.contract.abiVersion || decode.abiVersion !== contract.abiVersion
        || log.blockNumber < contract.deploymentBlock) {
      invalid('Log contract or ABI does not match the configured deployment.');
    }
    const header = headers.get(log.blockNumber);
    if (!header || log.blockHash !== header.hash || log.transactionIndex < 0n
        || log.transactionIndex >= BigInt(header.transactions.length)
        || header.transactions[Number(log.transactionIndex)] !== log.transactionHash
        || log.logIndex < 0n || log.rawLog.removed === true) {
      invalid('Log coordinates do not match its canonical batch header.');
    }
  }
}

export async function verifyMetadata(client: PoolClient, config: IndexerConfig, strict = false): Promise<void> {
  const deployments = await client.query<{ chain_id: string; deployment_block: string }>(`
    SELECT trunc(chain_id)::text AS chain_id, trunc(deployment_block)::text AS deployment_block FROM deployments
    WHERE deployment_id = $1 FOR SHARE`, [config.deploymentId]);
  const deployment = deployments.rows[0];
  if (!deployment || deployment.chain_id !== config.chainId.toString()) {
    throw new StorageError('STORAGE_METADATA_MISMATCH', 'Deployment is absent or belongs to another chain.', {
      deploymentId: config.deploymentId,
    });
  }
  const contracts = await client.query<{
    contract_role: string; contract_address: string; deployment_block: string; abi_version: string;
  }>(`
    SELECT contract_role, contract_address, trunc(deployment_block)::text AS deployment_block, abi_version
    FROM deployment_contracts WHERE deployment_id = $1 AND chain_id = $2
    ORDER BY contract_role FOR SHARE`, [config.deploymentId, config.chainId.toString()]);
  for (const expected of config.contracts) {
    const actual = contracts.rows.find((row) => row.contract_role === expected.role);
    if (!actual || actual.contract_address !== expected.address
        || actual.deployment_block !== expected.deploymentBlock.toString()
        || actual.abi_version !== expected.abiVersion
        || BigInt(deployment.deployment_block) > expected.deploymentBlock) {
      throw new StorageError('STORAGE_METADATA_MISMATCH', 'Configured contract does not match existing deployment metadata.', {
        deploymentId: config.deploymentId,
        contractRole: expected.role,
      });
    }
  }
  if (strict) {
    const supported = contracts.rows.filter((c) => c.contract_role !== 'governance_token');
    const depth = await client.query('SELECT confirmation_depth FROM deployments WHERE deployment_id = $1', [config.deploymentId]);
    if (supported.length !== config.contracts.length || depth.rows[0].confirmation_depth !== confirmationDepth(config)
        || config.fromBlock > firstBlock(config)) {
      throw new StorageError('STORAGE_METADATA_MISMATCH', 'BE03 requires every supported manifest source, matching K, and fromBlock <= earliest deployment block.');
    }
  }
}

export async function checkpoint(client: PoolClient, config: IndexerConfig): Promise<Checkpoint | null> {
  const result = await client.query(`SELECT trunc(block_number)::text AS number, block_hash, source_scope, confirmation_depth
    FROM checkpoints WHERE deployment_id = $1 FOR UPDATE`, [config.deploymentId]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.source_scope !== scopeHash(config) || row.confirmation_depth !== confirmationDepth(config)) {
    throw new StorageError('CHECKPOINT_CONFLICT', 'Checkpoint source scope or K differs; legacy checkpoints cannot be adopted implicitly.');
  }
  const number = BigInt(row.number);
  const headers = await client.query(`SELECT count(*)::text AS count FROM indexed_blocks
    WHERE deployment_id = $1 AND block_number BETWEEN $2 AND $3`, [config.deploymentId, firstBlock(config).toString(), number.toString()]);
  if (number < firstBlock(config) || BigInt(headers.rows[0].count) !== number - firstBlock(config) + 1n) {
    throw new StorageError('CHECKPOINT_CONFLICT', 'Checkpoint has missing stored prefix headers.');
  }
  return { number, hash: row.block_hash };
}

interface Progress { expected: Checkpoint | null; head: bigint }
export interface TransactionHooks {
  /** Test dependency injection only; production CLI never configures hooks. */
  beforeCommit?: () => Promise<void>;
  afterCommit?: () => Promise<void>;
}

async function verifyStoredBoundaries(client: PoolClient, config: IndexerConfig, batch: LogBatch): Promise<void> {
  const neighbors = await client.query<{ block_number: string; block_hash: string; parent_hash: string }>(`
    SELECT trunc(block_number)::text AS block_number, block_hash, parent_hash FROM indexed_blocks
    WHERE deployment_id = $1 AND block_number IN ($2::numeric, $3::numeric) FOR SHARE`,
  [config.deploymentId, (batch.fromBlock - 1n).toString(), (batch.toBlock + 1n).toString()]);
  for (const neighbor of neighbors.rows) {
    const before = BigInt(neighbor.block_number) < batch.fromBlock;
    if ((before && neighbor.block_hash !== batch.blocks[0]!.parentHash)
        || (!before && neighbor.parent_hash !== batch.blocks[batch.blocks.length - 1]!.hash)) {
      throw new StorageError('STORAGE_CONFLICT', 'Batch does not connect to an already stored neighboring block.', {
        entity: 'indexed_blocks', deploymentId: config.deploymentId, blockNumber: neighbor.block_number,
      });
    }
  }
}

export class PostgresStorage implements BatchStorage, SyncStorage {
  constructor(private readonly pool: Pool, private readonly hooks: TransactionHooks = {}) {}

  async loadCheckpoint(config: IndexerConfig): Promise<Checkpoint | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
      await verifyMetadata(client, config, true);
      const result = await checkpoint(client, config);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async decodeIssues(config: IndexerConfig, at?: bigint): Promise<{ unknownTopics: number; decodeErrors: number; issues: DecodeIssue[] }> {
    const result = await this.pool.query(`WITH unresolved AS (
      SELECT r.*, d.abi_version FROM raw_events r
      JOIN deployment_contracts d USING (deployment_id, chain_id, contract_role, contract_address)
      LEFT JOIN checkpoints c USING (deployment_id)
      WHERE r.deployment_id = $1 AND r.block_number <= COALESCE($2::numeric, c.block_number, r.block_number)
        AND r.decode_status IS DISTINCT FROM 'decoded'
    ) SELECT count(*) FILTER (WHERE decode_status = 'unknown_topic')::int AS unknown,
      count(*) FILTER (WHERE decode_status = 'decode_error' OR decode_status IS NULL)::int AS errors,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('blockNumber', trunc(block_number)::text,
        'transactionHash', transaction_hash, 'logIndex', log_index::text,
        'code', COALESCE(decode_error_code,'UNCLASSIFIED_LEGACY'), 'abiVersion', abi_version)
        ORDER BY block_number,transaction_index,log_index)
        FROM (SELECT * FROM unresolved ORDER BY block_number,transaction_index,log_index LIMIT 100) sample), '[]'::jsonb) AS issues
      FROM unresolved`, [config.deploymentId, at?.toString() ?? null]);
    return { unknownTopics: result.rows[0].unknown, decodeErrors: result.rows[0].errors, issues: result.rows[0].issues };
  }

  async writeCheckpointBatch(config: IndexerConfig, batch: LogBatch, expected: Checkpoint | null, head: bigint): Promise<WriteResult> {
    return this.writeBatch(config, batch, { expected, head });
  }

  async writeBatch(config: IndexerConfig, batch: LogBatch, progress?: Progress): Promise<WriteResult> {
    validateBatch(config, batch);
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      // Serialize BE02 writes on this chain, including coordinate checks that
      // have no BE01 unique constraint. Hash collisions only add serialization.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
      // Lock metadata until COMMIT; never seed or overwrite user deployment data.
      await verifyMetadata(client, config, !!progress);
      if (progress) {
        const current = await checkpoint(client, config);
        if (current?.number !== progress.expected?.number || current?.hash !== progress.expected?.hash
            || batch.fromBlock !== (current ? current.number + 1n : firstBlock(config))) {
          throw new StorageError('CHECKPOINT_CONFLICT', 'Stale writer or noncontiguous checkpoint batch; restart and verify RPC hash.');
        }
        if (progress.head < batch.toBlock + BigInt(confirmationDepth(config))) invalid('Batch exceeds confirmed head.');
        const expectedSources = config.contracts.filter((c) => c.deploymentBlock <= batch.toBlock).map(sourceKey).sort();
        if (JSON.stringify(batch.scannedSources?.slice().sort()) !== JSON.stringify(expectedSources)) {
          invalid('Not every active manifest source was scanned successfully.');
        }
      } else {
        const existing = await client.query('SELECT 1 FROM checkpoints WHERE deployment_id = $1', [config.deploymentId]);
        if (existing.rowCount) throw new StorageError('CHECKPOINT_CONFLICT', 'Use BE03 sync for a deployment with a checkpoint.');
      }
      await verifyStoredBoundaries(client, config, batch);
      const result: WriteResult = { insertedBlocks: 0, insertedEvents: 0, duplicateEvents: 0 };
      for (const block of batch.blocks) {
        const written = await client.query<{ inserted: boolean }>(INSERT_BLOCK, [
          config.deploymentId, block.number.toString(), block.hash, block.parentHash, block.timestamp.toString(),
        ]);
        if (written.rowCount !== 1) {
          throw new StorageError('STORAGE_CONFLICT', 'Stored block differs from the requested canonical header.', {
            entity: 'indexed_blocks', deploymentId: config.deploymentId, blockNumber: block.number.toString(),
          });
        }
        if (written.rows[0]!.inserted) result.insertedBlocks += 1;
      }
      for (const { log, decode } of batch.logs) {
        const contradictory = await client.query(`
          SELECT raw_event_id FROM raw_events
          WHERE chain_id = $1 AND (
            (transaction_hash = $5 AND (block_number <> $2 OR transaction_index <> $6)) OR
            (block_number = $2 AND (
              block_hash <> $3 OR
              (log_index = $4 AND (transaction_hash <> $5 OR transaction_index <> $6)) OR
              (transaction_index = $6 AND transaction_hash <> $5) OR
              (transaction_hash = $5 AND transaction_index <> $6) OR
              (transaction_index < $6 AND log_index >= $4) OR
              (transaction_index > $6 AND log_index <= $4)
            ))
          ) LIMIT 1`, [config.chainId.toString(), log.blockNumber.toString(), log.blockHash,
          log.logIndex.toString(), log.transactionHash, log.transactionIndex.toString()]);
        if (contradictory.rowCount !== 0) {
          throw new StorageError('STORAGE_CONFLICT', 'Log coordinates contradict an already stored canonical log.', {
            entity: 'raw_events', chainId: config.chainId.toString(), blockNumber: log.blockNumber.toString(),
          });
        }
        const written = await client.query<{ inserted: boolean }>(INSERT_EVENT, [
          config.deploymentId, config.chainId.toString(), log.contract.role, log.contract.address,
          log.blockNumber.toString(), log.blockHash, log.transactionHash,
          log.transactionIndex.toString(), log.logIndex.toString(), log.topics, log.data,
          decode.status === 'decoded' ? decode.eventName : null,
          decode.status === 'decoded' ? JSON.stringify(decode.payload) : null,
          JSON.stringify(log.rawLog),
        ]);
        if (written.rowCount !== 1) {
          throw new StorageError('STORAGE_CONFLICT', 'Stored raw event differs at the chain deduplication key.', {
            entity: 'raw_events', chainId: config.chainId.toString(),
            transactionHash: log.transactionHash, logIndex: log.logIndex.toString(),
          });
        }
        if (written.rows[0]!.inserted) result.insertedEvents += 1;
        else result.duplicateEvents += 1;
        if (progress) {
          await client.query(`UPDATE raw_events SET decode_status = $4, decode_error_code = $5
            WHERE chain_id = $1 AND transaction_hash = $2 AND log_index = $3`,
          [config.chainId.toString(), log.transactionHash, log.logIndex.toString(), decode.status,
            decode.status === 'decoded' ? null : decode.code]);
        }
      }
      if (progress) {
        const last = batch.blocks.at(-1)!;
        await client.query(`INSERT INTO checkpoints
          (deployment_id, block_number, block_hash, observed_head_block, confirmation_depth, sync_status, source_scope)
          VALUES ($1,$2,$3,$4,$5,'syncing',$6)
          ON CONFLICT (deployment_id) DO UPDATE SET block_number = EXCLUDED.block_number,
            block_hash = EXCLUDED.block_hash, observed_head_block = EXCLUDED.observed_head_block,
            confirmation_depth = EXCLUDED.confirmation_depth, source_scope = EXCLUDED.source_scope,
            sync_status = 'syncing', updated_at = CURRENT_TIMESTAMP`,
        [config.deploymentId, last.number.toString(), last.hash, progress.head.toString(), confirmationDepth(config), scopeHash(config)]);
        await this.markDecodeState(client, config);
      }
      await this.hooks.beforeCommit?.();
      await client.query('COMMIT');
      await this.hooks.afterCommit?.();
      return result;
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
      }
      if (error instanceof StorageError) throw error;
      // SQL errors may echo RPC payloads or connection credentials. Expose only
      // the SQLSTATE, while keeping a useful, stable CLI error classification.
      const sqlState = typeof error === 'object' && error !== null && 'code' in error
        && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : 'unknown';
      throw new StorageError('STORAGE_DATABASE_ERROR', 'PostgreSQL batch failed; inspect the connection or SQLSTATE before retrying.', { sqlState });
    } finally {
      client?.release();
    }
  }

  private async markDecodeState(client: PoolClient, config: IndexerConfig): Promise<void> {
    await client.query(`UPDATE checkpoints c SET last_error_code = CASE WHEN EXISTS (
      SELECT 1 FROM raw_events r WHERE r.deployment_id = c.deployment_id AND r.block_number <= c.block_number
      AND r.decode_status IS DISTINCT FROM 'decoded') THEN 'DECODE_INCOMPLETE' ELSE NULL END
      WHERE c.deployment_id = $1`, [config.deploymentId]);
  }

  /** Explicit recovery from immutable raw bytes; does not move the raw checkpoint. */
  async redecode(config: IndexerConfig): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
      await verifyMetadata(client, config, true);
      await checkpoint(client, config);
      const rows = await client.query(`SELECT *, topics::text[] AS topics FROM raw_events WHERE deployment_id = $1
        AND block_number <= COALESCE((SELECT block_number FROM checkpoints WHERE deployment_id=$1), block_number)
        AND decode_status IS DISTINCT FROM 'decoded' ORDER BY block_number, transaction_index, log_index FOR UPDATE`, [config.deploymentId]);
      for (const row of rows.rows) {
        const log: NormalizedLog = { contract: config.contracts.find((c) => c.role === row.contract_role)!,
          blockNumber: BigInt(row.block_number), blockHash: row.block_hash, transactionHash: row.transaction_hash,
          transactionIndex: BigInt(row.transaction_index), logIndex: BigInt(row.log_index),
          topics: row.topics, data: row.data, rawLog: row.rpc_log };
        const decoded = decodeLog(log);
        await client.query(`UPDATE raw_events SET event_name=$2, decoded_payload=$3::jsonb, decode_status=$4, decode_error_code=$5
          WHERE raw_event_id=$1`, [row.raw_event_id, decoded.status === 'decoded' ? decoded.eventName : null,
          decoded.status === 'decoded' ? JSON.stringify(decoded.payload) : null, decoded.status, decoded.status === 'decoded' ? null : decoded.code]);
      }
      await this.markDecodeState(client, config);
      await client.query('COMMIT');
      return rows.rowCount!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
