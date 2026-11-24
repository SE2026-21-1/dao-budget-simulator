import type { Pool, PoolClient } from 'pg';
import { PostgresStorage } from '../storage.js';
import { readHeader } from '../reader.js';
import { quantity } from '../rpc.js';
import { runtime } from '../recovery.js';
import { IndexerError } from '../errors.js';
import type { RpcTransport } from '../rpc.js';
import { checkpoint, invalidatePublication, verifyMetadata } from '../storage.js';
import { confirmationDepth, scopeHash } from '../scope.js';
import type { Checkpoint, IndexerConfig, JsonObject, NormalizedLog } from '../types.js';
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

class ProjectionReorgError extends IndexerError {
  constructor(readonly checkpoint: Checkpoint) {
    super('PROJECTION_REORG', 'Projection H is no longer canonical; publication must be invalidated.');
  }
}

/** Replays the verified raw prefix and atomically publishes one reconciled H/hash. */
export async function project(config: IndexerConfig, rpc: RpcTransport, pool: Pool): Promise<ProjectionReport> {
  try { return await projectTransaction(config, rpc, pool); }
  catch (error) {
    // The failed publication transaction has released its lock/connection first.
    if (error instanceof ProjectionReorgError) {
      // A verified mismatch is already evidence of a fork. Persist the gate
      // before another RPC request can fail and leave known-orphan data serving.
      await new PostgresStorage(pool).recoverCheckpoint(config, rpc, error.checkpoint);
      throw new IndexerError('REORG_RETRY', 'Reorg detected during projection; recovery persisted.');
    }
    const state = (await pool.query("SELECT to_jsonb(d)->'indexer_state' AS s FROM deployments d WHERE deployment_id=$1", [config.deploymentId])).rows[0]?.s;
    if (state && state.phase !== 'rebuild_required' && quantity(await rpc.call('eth_chainId', []), 'chainId') === config.chainId) {
      const storage = new PostgresStorage(pool);
      const cp = await storage.loadCheckpoint(config);
      let header;
      if (cp) {
        try { header = await readHeader(rpc, cp.number); }
        catch (verifyError) {
          if (!(verifyError instanceof IndexerError) || verifyError.code !== 'RPC_INVALID_DATA') throw verifyError;
          await storage.recoverShorterChain(config, rpc, cp);
          throw new IndexerError('REORG_RETRY', 'Shorter fork detected during projection; recovery persisted.');
        }
      }
      if (cp && header?.hash !== cp.hash) {
        await storage.recoverCheckpoint(config, rpc, cp);
        throw new IndexerError('REORG_RETRY', 'Reorg detected during projection; recovery persisted.');
      }
    }
    throw error;
  }
}

async function projectTransaction(config: IndexerConfig, rpc: RpcTransport, pool: Pool): Promise<ProjectionReport> {
  const client = await pool.connect();
  let cp: Checkpoint | null = null;
  let legacy = false;
  try {
    await client.query('BEGIN');
    // The same lock as BE03 prevents raw writes/redecode during reconciliation.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
    await verifyMetadata(client, config, true);
    cp = await checkpoint(client, config);
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
    const recovery = await runtime(client, config.deploymentId);
    legacy = recovery === null;
    requireProjection(status.sync_status !== 'rebuild_required' && recovery?.phase !== 'rebuild_required' && recovery?.phase !== 'recovering', 'Recovery gate blocks publication.');
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
    if (recovery && quantity(await rpc.call('eth_blockNumber', []), 'head') < cp.number + BigInt(confirmationDepth(config)))
      throw new IndexerError('RPC_UNAVAILABLE', 'Projection H no longer has K following blocks; wait for confirmed head.');
    await publish(client, config, model, evaluated);
    await client.query(
      `INSERT INTO projection_checkpoints
      (deployment_id,block_number,block_hash,source_scope,snapshot_revision,ignored_ancillary_events)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (deployment_id) DO UPDATE
      SET block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash,source_scope=EXCLUDED.source_scope,
      snapshot_revision=EXCLUDED.snapshot_revision,ignored_ancillary_events=EXCLUDED.ignored_ancillary_events,published_at=CURRENT_TIMESTAMP`,
      [config.deploymentId, cp.number.toString(), cp.hash, scopeHash(config), meta.snapshot_revision, ignored],
    );
    if (recovery) await client.query(`UPDATE deployments SET indexer_state=indexer_state ||
      jsonb_build_object('phase','ready','lastPublishedAt',clock_timestamp()) WHERE deployment_id=$1`, [config.deploymentId]);
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
    if (legacy && cp && error instanceof IndexerError && error.code === 'PROJECTION_REORG') {
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`be02-chain:${config.chainId}`]);
        await verifyMetadata(client, config, true);
        const current = await checkpoint(client, config);
        if (current?.number === cp.number && current.hash === cp.hash)
          await invalidatePublication(client, config, error.code);
        await client.query('COMMIT');
      } catch (barrierError) {
        await client.query('ROLLBACK');
        throw barrierError;
      }
    }
    if (!legacy && cp && error instanceof IndexerError && error.code === 'PROJECTION_REORG')
      throw new ProjectionReorgError(cp);
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
  // One set-based insert per table, rather than one SQL round trip per row.
  // JSON strings retain uint256 precision; PostgreSQL still enforces every domain/FK.
  if (m.proposals.length) {
    await c.query(
      `INSERT INTO proposals (deployment_id,proposal_id,request_id,proposer,treasury_address,recipient,amount,
      description_bytes,description,description_hash,targets,native_values,calldatas,snapshot,deadline,created_event_id,canceled_event_id,executed_event_id)
      SELECT $1,x.proposal_id,x.request_id,x.proposer,$2,x.recipient,x.amount,
        convert_to(x.description,'UTF8'),x.description,x.description_hash,x.targets,x.native_values,x.calldatas,
        x.snapshot,x.deadline,x.created_event_id,x.canceled_event_id,x.executed_event_id
      FROM jsonb_to_recordset($3::jsonb) AS x(proposal_id numeric,request_id text,proposer text,recipient text,amount numeric,
        description text,description_hash text,targets text[],native_values numeric[],calldatas text[],
        snapshot numeric,deadline numeric,created_event_id bigint,canceled_event_id bigint,executed_event_id bigint)`,
      [d, treasury, JSON.stringify(m.proposals.map(p => ({
        proposal_id: p.id, request_id: p.requestId, proposer: p.proposer, recipient: p.recipient, amount: p.amount,
        description: p.description, description_hash: p.descriptionHash, targets: p.targets, native_values: p.values,
        calldatas: p.calldatas, snapshot: p.snapshot, deadline: p.deadline, created_event_id: p.created.id,
        canceled_event_id: p.canceled?.id ?? null, executed_event_id: p.executed?.id ?? null,
      })))],
    );
    await c.query(
      `INSERT INTO proposal_states (deployment_id,proposal_id,state,against_votes,for_votes,abstain_votes,quorum,operation_status)
      SELECT $1,x.proposal_id,x.state,x.against_votes,x.for_votes,x.abstain_votes,x.quorum,x.operation_status
      FROM jsonb_to_recordset($2::jsonb) AS x(proposal_id numeric,state text,against_votes numeric,for_votes numeric,
        abstain_votes numeric,quorum numeric,operation_status text)`,
      [d, JSON.stringify(m.proposals.map(p => {
        const s = states.get(p.id)!;
        return { proposal_id: p.id, state: s.state, against_votes: p.votes[0].toString(), for_votes: p.votes[1].toString(),
          abstain_votes: p.votes[2].toString(), quorum: s.quorum?.toString() ?? null, operation_status: s.operationStatus };
      }))],
    );
  }
  if (m.votes.length) await c.query(
    `INSERT INTO votes (deployment_id,proposal_id,voter,support,weight,reason,params,source_event_id)
    SELECT $1,x.proposal_id,x.voter,x.support,x.weight,x.reason,x.params,x.source_event_id
    FROM jsonb_to_recordset($2::jsonb) AS x(proposal_id numeric,voter text,support smallint,weight numeric,
      reason text,params text,source_event_id bigint)`,
    [d, JSON.stringify(m.votes.map(v => ({
      proposal_id: v.proposal.id, voter: v.voter, support: v.support, weight: v.weight,
      reason: v.reason, params: v.params, source_event_id: v.source.id,
    })))],
  );
  if (m.operations.length) await c.query(
    `INSERT INTO operations (deployment_id,operation_id,proposal_id,predecessor,salt,queued_at,eta,
      queued_event_id,scheduled_event_id,executed_event_id,canceled_event_id)
    SELECT $1,x.operation_id,x.proposal_id,x.predecessor,x.salt,x.queued_at,x.eta,
      x.queued_event_id,x.scheduled_event_id,x.executed_event_id,x.canceled_event_id
    FROM jsonb_to_recordset($2::jsonb) AS x(operation_id text,proposal_id numeric,predecessor text,salt text,
      queued_at numeric,eta numeric,queued_event_id bigint,scheduled_event_id bigint,executed_event_id bigint,canceled_event_id bigint)`,
    [d, JSON.stringify(m.operations.map(o => ({
      operation_id: o.id, proposal_id: o.proposal.id, predecessor: o.predecessor, salt: o.salt,
      queued_at: o.queuedAt, eta: o.eta, queued_event_id: o.queued.id, scheduled_event_id: o.scheduled.id,
      executed_event_id: o.executed?.id ?? null, canceled_event_id: o.canceled?.id ?? null,
    })))],
  );
  // Use immutable raw identity to keep public transfer IDs stable across replay.
  if (m.transfers.length) await c.query(
    `INSERT INTO transfers (transfer_id,deployment_id,token_address,treasury_address,
      from_address,to_address,amount,source_event_id) OVERRIDING SYSTEM VALUE
    SELECT x.source_event_id,$1,$2,$3,x.from_address,x.to_address,x.amount,x.source_event_id
    FROM jsonb_to_recordset($4::jsonb) AS x(from_address text,to_address text,amount numeric,source_event_id bigint)`,
    [d, token, treasury, JSON.stringify(m.transfers.map(t => ({
      from_address: t.from, to_address: t.to, amount: t.amount, source_event_id: t.source.id,
    })))],
  );
  if (m.disbursements.length) await c.query(
    `INSERT INTO disbursements (deployment_id,chain_id,treasury_address,request_id,
      recipient,amount,source_event_id,transfer_id,proposal_id,operation_id)
    SELECT $1,$2,$3,x.request_id,x.recipient,x.amount,x.source_event_id,x.transfer_id,x.proposal_id,x.operation_id
    FROM jsonb_to_recordset($4::jsonb) AS x(request_id text,recipient text,amount numeric,source_event_id bigint,
      transfer_id bigint,proposal_id numeric,operation_id text)`,
    [d, config.chainId.toString(), treasury, JSON.stringify(m.disbursements.map(b => ({
      request_id: b.proposal.requestId, recipient: b.proposal.recipient, amount: b.proposal.amount,
      source_event_id: b.source.id, transfer_id: b.transfer.source.id, proposal_id: b.proposal.id, operation_id: b.operation.id,
    })))],
  );
}
