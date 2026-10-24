import type { Pool, PoolClient } from 'pg';
import { IndexerError } from '../errors.js';
import type { RpcTransport } from '../rpc.js';
import { checkpoint, verifyMetadata } from '../storage.js';
import { scopeHash } from '../scope.js';
import type { IndexerConfig, JsonObject, NormalizedLog } from '../types.js';
import { canonical, reconcile } from './chain.js';
import { buildModel, classify, requireProjection, type Evaluated, type Model, type SourceEvent } from './model.js';

export interface ProjectionReport {
  context: {
    chainId: string;
    deploymentId: string;
    asOfBlock: string;
    asOfBlockHash: string;
    asOfTimestamp: string;
    snapshotRevision: string;
    dataKind: 'chain';
  };
  counts: { proposals: number; votes: number; operations: number; transfers: number; disbursements: number };
  treasury: { totalIn: string; totalOut: string; balance: string };
  ignoredAncillaryEvents: number;
  rawDecodeIssues: number;
}

/** Replays through the latest verified raw H and publishes all derived tables atomically.
 * Full replay is intentional for the BE04 MVP; no external metadata/previous projection is used.
 */
export async function project(config: IndexerConfig, rpc: RpcTransport, pool: Pool): Promise<ProjectionReport> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The same lock as BE03 prevents raw writes/redecode during reconciliation.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
    await verifyMetadata(client, config, true);
    const cp = await checkpoint(client, config);
    requireProjection(cp, 'A verified BE03 raw checkpoint is required before BE04 projection.');
    const meta = (
      await client.query(`SELECT snapshot_revision::text FROM deployments WHERE deployment_id=$1`, [
        config.deploymentId,
      ])
    ).rows[0];
    const header = (
      await client.query(
        `SELECT block_timestamp::text FROM indexed_blocks
      WHERE deployment_id=$1 AND block_number=$2 AND block_hash=$3`,
        [config.deploymentId, cp.number.toString(), cp.hash],
      )
    ).rows[0];
    requireProjection(header, 'Projection checkpoint header is missing.');
    const status = (
      await client.query('SELECT sync_status FROM checkpoints WHERE deployment_id=$1', [config.deploymentId])
    ).rows[0];
    requireProjection(status.sync_status !== 'rebuild_required', 'Raw checkpoint requires rebuild.');
    const old = (
      await client.query('SELECT block_number::text FROM projection_checkpoints WHERE deployment_id=$1', [
        config.deploymentId,
      ])
    ).rows[0];
    requireProjection(!old || BigInt(old.block_number) <= cp.number, 'Projection cannot rewind its checkpoint.');
    await canonical(config, rpc, cp.number, cp.hash);
    const rows = await client.query(
      `SELECT r.*, r.topics::text[] AS topics, b.block_timestamp::text AS timestamp,
      r.block_number::text AS block, r.transaction_index::text AS tx_index, r.log_index::text AS log_index
      FROM raw_events r JOIN indexed_blocks b USING (deployment_id,block_number,block_hash)
      WHERE r.deployment_id=$1 AND r.block_number<=$2
      ORDER BY r.block_number,r.transaction_index,r.log_index`,
      [config.deploymentId, cp.number.toString()],
    );
    const events: SourceEvent[] = [];
    let ignored = 0,
      rawDecodeIssues = 0;
    for (const r of rows.rows) {
      const contract = config.contracts.find((c) => c.role === r.contract_role && c.address === r.contract_address);
      requireProjection(
        contract && BigInt(r.block) >= contract.deploymentBlock,
        'Raw event source differs from manifest.',
      );
      const log: NormalizedLog = {
        contract,
        blockNumber: BigInt(r.block),
        blockHash: r.block_hash,
        transactionHash: r.transaction_hash,
        transactionIndex: BigInt(r.tx_index),
        logIndex: BigInt(r.log_index),
        topics: r.topics,
        data: r.data,
        rawLog: r.rpc_log as JsonObject,
      };
      const decoded = classify(log);
      if (r.decode_status !== 'decoded') rawDecodeIssues++;
      if (!decoded) {
        ignored++;
        continue;
      }
      requireProjection(
        decoded.status === 'decoded',
        'Unknown/malformed business log prevents projection publication; raw checkpoint is preserved.',
      );
      requireProjection(
        r.decode_status === 'decoded' &&
          r.event_name === decoded.eventName &&
          JSON.stringify(sortJson(r.decoded_payload)) === JSON.stringify(sortJson(decoded.payload)),
        'Raw decode status/payload differs from bytes; run --redecode first.',
      );
      events.push({
        id: String(r.raw_event_id),
        role: contract.role,
        address: contract.address,
        block: r.block,
        blockHash: r.block_hash,
        timestamp: r.timestamp,
        tx: r.transaction_hash,
        txIndex: r.tx_index,
        logIndex: r.log_index,
        name: decoded.eventName,
        payload: decoded.payload,
      });
    }
    const treasury = config.contracts.find((c) => c.role === 'treasury')?.address;
    const governor = config.contracts.find((c) => c.role === 'governor')?.address;
    requireProjection(treasury && governor, 'BE04 requires Treasury and Governor.');
    const model = buildModel(events, treasury, governor);
    const evaluated = await reconcile(config, rpc, cp.hash, BigInt(header.block_timestamp), model);
    await canonical(config, rpc, cp.number, cp.hash);
    await publish(client, config, model, evaluated);
    await client.query(
      `INSERT INTO projection_checkpoints
      (deployment_id,block_number,block_hash,source_scope,snapshot_revision,ignored_ancillary_events)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (deployment_id) DO UPDATE
      SET block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash,source_scope=EXCLUDED.source_scope,
      snapshot_revision=EXCLUDED.snapshot_revision,ignored_ancillary_events=EXCLUDED.ignored_ancillary_events,published_at=CURRENT_TIMESTAMP`,
      [config.deploymentId, cp.number.toString(), cp.hash, scopeHash(config), meta.snapshot_revision, ignored],
    );
    await client.query('COMMIT');
    return {
      context: {
        chainId: config.chainId.toString(),
        deploymentId: config.deploymentId,
        asOfBlock: cp.number.toString(),
        asOfBlockHash: cp.hash,
        asOfTimestamp: header.block_timestamp,
        snapshotRevision: meta.snapshot_revision,
        dataKind: 'chain',
      },
      counts: {
        proposals: model.proposals.length,
        votes: model.votes.length,
        operations: model.operations.length,
        transfers: model.transfers.length,
        disbursements: model.disbursements.length,
      },
      treasury: {
        totalIn: model.totalIn.toString(),
        totalOut: model.totalOut.toString(),
        balance: model.balance.toString(),
      },
      ignoredAncillaryEvents: ignored,
      rawDecodeIssues,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof IndexerError) throw error;
    if (error instanceof Error && error.name === 'StorageError') throw error;
    throw new IndexerError(
      'PROJECTION_DATABASE_ERROR',
      'Projection transaction failed; previous publication and raw data were preserved.',
    );
  } finally {
    client.release();
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortJson(v)]),
    );
  return value;
}

async function publish(c: PoolClient, config: IndexerConfig, m: Model, states: Map<string, Evaluated>): Promise<void> {
  const d = config.deploymentId;
  // Dependencies are deleted/inserted in FK order, visible only at COMMIT.
  for (const table of ['disbursements', 'proposal_states', 'votes', 'operations', 'transfers', 'proposals']) {
    await c.query(`DELETE FROM ${table} WHERE deployment_id=$1`, [d]);
  }
  const treasury = config.contracts.find((x) => x.role === 'treasury')!.address;
  const token = config.contracts.find((x) => x.role === 'budget_token')!.address;
  for (const p of m.proposals) {
    await c.query(
      `INSERT INTO proposals (deployment_id,proposal_id,request_id,proposer,treasury_address,recipient,amount,
      description_bytes,description,description_hash,targets,native_values,calldatas,snapshot,deadline,created_event_id,canceled_event_id,executed_event_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        d,
        p.id,
        p.requestId,
        p.proposer,
        treasury,
        p.recipient,
        p.amount,
        Buffer.from(p.description, 'utf8'),
        p.description,
        p.descriptionHash,
        p.targets,
        p.values,
        p.calldatas,
        p.snapshot,
        p.deadline,
        p.created.id,
        p.canceled?.id ?? null,
        p.executed?.id ?? null,
      ],
    );
    const s = states.get(p.id)!;
    await c.query(
      `INSERT INTO proposal_states (deployment_id,proposal_id,state,against_votes,for_votes,abstain_votes,quorum,operation_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d, p.id, s.state, ...p.votes.map((v) => v.toString()), s.quorum?.toString() ?? null, s.operationStatus],
    );
  }
  for (const v of m.votes)
    await c.query(
      `INSERT INTO votes (deployment_id,proposal_id,voter,support,weight,reason,params,source_event_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [d, v.proposal.id, v.voter, v.support, v.weight, v.reason, v.params, v.source.id],
    );
  for (const o of m.operations)
    await c.query(
      `INSERT INTO operations (deployment_id,operation_id,proposal_id,predecessor,salt,queued_at,eta,
    queued_event_id,scheduled_event_id,executed_event_id,canceled_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        d,
        o.id,
        o.proposal.id,
        o.predecessor,
        o.salt,
        o.queuedAt,
        o.eta,
        o.queued.id,
        o.scheduled.id,
        o.executed?.id ?? null,
        o.canceled?.id ?? null,
      ],
    );
  // Use immutable raw identity to keep public transfer IDs stable across replay.
  for (const t of m.transfers)
    await c.query(
      `INSERT INTO transfers (transfer_id,deployment_id,token_address,treasury_address,
    from_address,to_address,amount,source_event_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7,$1)`,
      [t.source.id, d, token, treasury, t.from, t.to, t.amount],
    );
  for (const b of m.disbursements)
    await c.query(
      `INSERT INTO disbursements (deployment_id,chain_id,treasury_address,request_id,
    recipient,amount,source_event_id,transfer_id,proposal_id,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        d,
        config.chainId.toString(),
        treasury,
        b.proposal.requestId,
        b.proposal.recipient,
        b.proposal.amount,
        b.source.id,
        b.transfer.source.id,
        b.proposal.id,
        b.operation.id,
      ],
    );
}
