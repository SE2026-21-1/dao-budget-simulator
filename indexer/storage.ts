import type { Pool, PoolClient } from 'pg';
import type { BatchStorage, IndexerConfig, LogBatch, WriteResult } from './types.js';

type StorageCode = 'STORAGE_METADATA_MISMATCH' | 'STORAGE_INVALID_BATCH' | 'STORAGE_CONFLICT' | 'STORAGE_DATABASE_ERROR';

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

async function verifyMetadata(client: PoolClient, config: IndexerConfig): Promise<void> {
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

export class PostgresStorage implements BatchStorage {
  constructor(private readonly pool: Pool) {}

  async writeBatch(config: IndexerConfig, batch: LogBatch): Promise<WriteResult> {
    validateBatch(config, batch);
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      // Serialize BE02 writes on this chain, including coordinate checks that
      // have no BE01 unique constraint. Hash collisions only add serialization.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
      // Lock metadata until COMMIT; never seed or overwrite user deployment data.
      await verifyMetadata(client, config);
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
      }
      await client.query('COMMIT');
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
}
