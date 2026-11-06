import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers';
import type { Pool, PoolClient } from 'pg';

const UINT256_MAX = (1n << 256n) - 1n;
const STATES = new Set(['Pending', 'Active', 'Succeeded', 'Defeated', 'Queued', 'Executed', 'Canceled']);
const ALLOWED_QUERY = new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'state', 'proposalId', 'limit', 'cursor', 'direction']);
const TTL_SECONDS = 900;
const coder = AbiCoder.defaultAbiCoder();

type Json = Record<string, unknown>;
type Scope = { chainId: string; deploymentId: string };
type Context = {
  chainId: string; deploymentId: string; asOfBlock: string; asOfBlockHash: string;
  asOfTimestamp: string; snapshotRevision: string; dataKind: 'chain'; sync: Json;
};
type Snapshot = { id: string; context: Context; summary: Json; expiresAt: number; sourceScope: string };
type Cursor = {
  v: 1; i: string; c: string; d: string; h: string; b: string; r: string; s: string;
  e: string; f: Json; l: number; k: string[]; x: number;
};

class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string,
    public readonly details: Json = {}, public readonly retryable = false, public readonly context: Json | null = null) {
    super(message);
  }
}

function canonicalUint(value: string | undefined, field: string, allowZero = true): string {
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ApiError(400, field === 'proposalId' ? 'INVALID_PROPOSAL_ID' : 'INVALID_ARGUMENT',
      field === 'proposalId' ? 'proposalId phải là chuỗi số nguyên uint256 hợp lệ.' : `${field} phải là số nguyên thập phân canonical.`, { field });
  }
  const n = BigInt(value);
  if (n > UINT256_MAX || (!allowZero && n === 0n)) {
    throw new ApiError(400, field === 'proposalId' ? 'INVALID_PROPOSAL_ID' : 'INVALID_ARGUMENT', `${field} nằm ngoài miền hỗ trợ.`, { field });
  }
  return value;
}

function parseRequest(req: IncomingMessage): { url: URL; query: Map<string, string> } {
  let url: URL;
  try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); }
  catch { throw new ApiError(400, 'INVALID_ARGUMENT', 'Request URL không hợp lệ.'); }
  const query = new Map<string, string>();
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    if (!ALLOWED_QUERY.has(key) || values.length !== 1) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'Query parameter không được hỗ trợ hoặc bị lặp.', { field: key });
    }
    query.set(key, values[0]!);
  }
  return { url, query };
}

function getScope(q: Map<string, string>): Scope {
  const chainId = canonicalUint(q.get('chainId'), 'chainId', false);
  const deploymentId = q.get('deploymentId');
  if (!deploymentId || deploymentId.length > 128 || deploymentId.trim() !== deploymentId || /[\u0000-\u001f]/.test(deploymentId)) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'chainId và deploymentId là bắt buộc.', { field: 'deploymentId' });
  }
  return { chainId, deploymentId };
}

function parseLimit(q: Map<string, string>): number {
  const raw = q.get('limit') ?? '20';
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new ApiError(400, 'INVALID_ARGUMENT', 'limit phải là số nguyên từ 1 đến 100.', { field: 'limit' });
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new ApiError(400, 'INVALID_ARGUMENT', 'limit phải là số nguyên từ 1 đến 100.', { field: 'limit' });
  return n;
}

function encodeCursor(value: Cursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeCursor(raw: string, secret: string): Cursor {
  const parts = raw.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) {
    throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
  }
  const expected = createHmac('sha256', secret).update(parts[0]!).digest();
  let actual: Buffer;
  try { actual = Buffer.from(parts[1]!, 'base64url'); } catch { throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.'); }
  if (actual.toString('base64url') !== parts[1] || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
  }
  const payload = Buffer.from(parts[0]!, 'base64url');
  if (payload.toString('base64url') !== parts[0])
    throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
  let value: unknown;
  try { value = JSON.parse(payload.toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.'); }
  if (!value || typeof value !== 'object') throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
  const c = value as Partial<Cursor>;
  if (c.v !== 1 || typeof c.i !== 'string' || typeof c.c !== 'string' || typeof c.d !== 'string' ||
      typeof c.h !== 'string' || typeof c.b !== 'string' || typeof c.r !== 'string' || typeof c.s !== 'string' || typeof c.e !== 'string' ||
      !c.f || typeof c.f !== 'object' || typeof c.l !== 'number' || !Array.isArray(c.k) ||
      !c.k.every((x) => typeof x === 'string') || typeof c.x !== 'number' || c.x <= Date.now() / 1000) {
    throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
  }
  return c as Cursor;
}

function sameJson(a: Json, b: Json): boolean { return JSON.stringify(a) === JSON.stringify(b); }

function descriptionFields(description: string): { title: string | null; body: string | null } {
  try {
    const parsed: unknown = JSON.parse(description);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = parsed as Record<string, unknown>;
      if (value.version === 1 && typeof value.title === 'string' && typeof value.body === 'string')
        return { title: value.title, body: value.body };
    }
  } catch { /* Raw description remains the canonical display field. */ }
  return { title: null, body: null };
}

function errorBody(error: ApiError): Json {
  return { context: error.context, error: { code: error.code, message: error.message, details: error.details, retryable: error.retryable } };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length,
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(bytes);
}

function sqlCount(value: unknown): number {
  const n = BigInt(String(value));
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(503, 'DATA_NOT_READY', 'Số lượng bản ghi vượt giới hạn phục vụ an toàn.', {}, true);
  return Number(n);
}

async function readHealth(pool: Pool, scope: Scope): Promise<{ status: number; body: Json }> {
  let client: PoolClient;
  try { client = await pool.connect(); }
  catch { return { status: 503, body: { context: null, data: { status: 'unavailable', database: 'down', indexer: 'not_ready', publication: 'not_ready' } } }; }
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const found = await scopeAndPublication(client, scope, false);
    const context = found.context;
    const available = found.ready;
    const sync = context?.sync ?? found.sync;
    const db = await client.query(`SELECT
      count(*) FILTER (WHERE decode_status IS DISTINCT FROM 'decoded')::text AS unresolved,
      count(*) FILTER (WHERE decode_status = 'unknown_topic')::text AS unknown_topics,
      count(*) FILTER (WHERE decode_status = 'decode_error' OR decode_status IS NULL)::text AS decode_errors
      FROM raw_events WHERE deployment_id=$1`, [found.deploymentId]);
    const unresolved = BigInt(db.rows[0].unresolved);
    const lag = sync.status === 'synced' ? false : true;
    const projectionLag = found.raw && found.publication && BigInt(found.raw.h) > BigInt(found.publication.h)
      ? BigInt(found.raw.h) - BigInt(found.publication.h) : 0n;
    const status = !available ? 'unavailable' : lag || unresolved > 0n || projectionLag > 0n ? 'degraded' : 'ok';
    const body = {
      context: context ?? found.notReadyContext,
      data: { status, database: 'up', indexer: available ? (lag ? 'lagging' : 'synced') : 'not_ready',
        publication: available ? 'ready' : 'not_ready', recoveryStatus: sync.recoveryStatus, projectionStatus: !available ? 'not_ready' : projectionLag > 0n ? 'lagging' : 'current',
        publicationBlock: found.publication?.h ?? null, projectionLagBlocks: available ? projectionLag.toString() : null,
        rawDecodeComplete: unresolved === 0n,
        rawDecodeIssues: { unknownTopics: sqlCount(db.rows[0].unknown_topics), decodeErrors: sqlCount(db.rows[0].decode_errors) },
        ignoredAncillaryEvents: found.ignoredAncillaryEvents },
    } as Json;
    await client.query('COMMIT');
    return { status: available ? 200 : 503, body };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ApiError && error.status < 500) throw error;
    return { status: 503, body: { context: null, data: { status: 'unavailable', database: 'down', indexer: 'not_ready', publication: 'not_ready' } } };
  } finally { client.release(); }
}

type ScopeState = {
  deploymentId: string; chainId: string; name: string; revision: string; governance: Json;
  publication: null | { h: string; hash: string; timestamp: string; revision: string; scope: string; ignored: number };
  raw: null | { h: string; hash: string; head: string; confirmations: number; status: string; sourceScope: string; updatedAt: string;
    timestamp: string | null; headTimestamp: string | null };
  context: Context | null; sync: Json; notReadyContext: Json; ready: boolean; ignoredAncillaryEvents: number;
};

async function scopeAndPublication(client: PoolClient, scope: Scope, requireReady = true): Promise<ScopeState> {
  const result = await client.query(`SELECT d.deployment_id::text, d.chain_id::text, d.deployment_name,
      d.snapshot_revision::text AS deployment_revision, d.governance_config, d.deployment_block::text AS deployment_block,
      p.block_number::text AS projection_h, p.block_hash AS projection_hash,
      b.block_timestamp::text AS projection_timestamp, p.snapshot_revision::text AS projection_revision,
      p.source_scope AS projection_scope, p.ignored_ancillary_events,
      c.block_number::text AS raw_h, c.block_hash AS raw_hash, c.observed_head_block::text AS raw_head,
      c.confirmation_depth, c.sync_status, c.source_scope AS raw_scope, c.updated_at,
      rb.block_timestamp::text AS raw_timestamp, hb.block_timestamp::text AS head_timestamp,
      to_jsonb(d)->'indexer_state' AS recovery_state,
      (SELECT count(*)::text FROM indexed_blocks ib WHERE ib.deployment_id=d.deployment_id
        AND ib.block_number BETWEEN (SELECT deployment_block FROM deployments WHERE deployment_id=d.deployment_id)
        AND COALESCE(p.block_number,0)) AS projection_header_count,
      (SELECT count(*)::text FROM indexed_blocks ib WHERE ib.deployment_id=d.deployment_id
        AND ib.block_number BETWEEN d.deployment_block AND COALESCE(c.block_number,0)) AS raw_header_count
    FROM deployments d
    LEFT JOIN projection_checkpoints p ON p.deployment_id=d.deployment_id
    LEFT JOIN indexed_blocks b ON b.deployment_id=p.deployment_id AND b.block_number=p.block_number AND b.block_hash=p.block_hash
    LEFT JOIN checkpoints c ON c.deployment_id=d.deployment_id
    LEFT JOIN indexed_blocks rb ON rb.deployment_id=c.deployment_id AND rb.block_number=c.block_number AND rb.block_hash=c.block_hash
    LEFT JOIN indexed_blocks hb ON hb.deployment_id=c.deployment_id AND hb.block_number=c.observed_head_block
    WHERE d.chain_id=$1::numeric AND d.deployment_name=$2`, [scope.chainId, scope.deploymentId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'DEPLOYMENT_NOT_FOUND', 'Deployment không tồn tại trong chain đã chọn.', { deploymentId: scope.deploymentId });
  const raw = row.raw_h === null ? null : { h: String(row.raw_h), hash: String(row.raw_hash), head: String(row.raw_head),
    confirmations: Number(row.confirmation_depth), status: String(row.sync_status), sourceScope: String(row.raw_scope), updatedAt: new Date(row.updated_at).toISOString(),
    timestamp: row.raw_timestamp === null ? null : String(row.raw_timestamp), headTimestamp: row.head_timestamp === null ? null : String(row.head_timestamp) };
  const publication = row.projection_h === null ? null : { h: String(row.projection_h), hash: String(row.projection_hash),
    timestamp: String(row.projection_timestamp), revision: String(row.projection_revision), scope: String(row.projection_scope),
    ignored: Number(row.ignored_ancillary_events) };
  const prefixComplete = !!publication && BigInt(row.projection_header_count) === BigInt(publication.h) - BigInt(row.deployment_block) + 1n &&
    !!raw && BigInt(row.raw_header_count) === BigInt(raw.h) - BigInt(row.deployment_block) + 1n;
  const metadataReady = publication ? await servingMetadataReady(client, String(row.deployment_id), String(row.chain_id),
    publication.h, row.governance_config as Json) : false;
  const recovery = row.recovery_state as Json | null;
  const ready = (!recovery || recovery.phase === 'ready') && !!publication && !!raw && raw.status !== 'rebuild_required' && raw.sourceScope === publication.scope &&
    publication.revision === String(row.deployment_revision) && BigInt(raw.h) >= BigInt(publication.h) && row.projection_timestamp !== null &&
    prefixComplete && metadataReady;
  const sync = recovery ? freshness(raw, publication?.h ?? null, recovery) : buildSync(raw, publication);
  const context: Context | null = ready && publication ? { chainId: String(row.chain_id), deploymentId: String(row.deployment_name),
    asOfBlock: publication.h, asOfBlockHash: publication.hash, asOfTimestamp: publication.timestamp,
    snapshotRevision: publication.revision, dataKind: 'chain', sync } : null;
  const notReadyContext = { chainId: String(row.chain_id), deploymentId: String(row.deployment_name), snapshotRevision: String(row.deployment_revision),
    asOfBlock: null, asOfBlockHash: null, asOfTimestamp: null, dataKind: 'chain', sync };
  const state: ScopeState = { deploymentId: String(row.deployment_id), chainId: String(row.chain_id), name: String(row.deployment_name),
    revision: String(row.deployment_revision), governance: row.governance_config as Json, publication, raw, context, sync, notReadyContext,
    ready, ignoredAncillaryEvents: publication?.ignored ?? 0 };
  if (requireReady && !ready) {
    throw new ApiError(503, 'DATA_NOT_READY', 'Không có publication BE04 đáng tin cậy để phục vụ API.',
      { reason: raw?.status === 'rebuild_required' ? 'REBUILD_REQUIRED' : !publication ? 'NO_PUBLICATION' : !prefixComplete ? 'MISSING_HEADER_PREFIX' :
        !metadataReady ? 'UNVERIFIED_DEPLOYMENT_METADATA' : 'PUBLICATION_MISMATCH' }, true, notReadyContext);
  }
  return state;
}

function buildSync(raw: ScopeState['raw'], publication: ScopeState['publication']): Json {
  if (!raw) return { status: 'not_ready', headBlock: null, confirmedBlock: null, indexedBlock: null, lagBlocks: null, lagSeconds: null, confirmations: null, lastIndexedAt: null };
  const confirmed = BigInt(raw.head) > BigInt(raw.confirmations) ? BigInt(raw.head) - BigInt(raw.confirmations) : 0n;
  const lag = confirmed > BigInt(raw.h) ? confirmed - BigInt(raw.h) : 0n;
  const heartbeatAgeMs = Math.max(0, Date.now() - Date.parse(raw.updatedAt));
  let lagSeconds = BigInt(Math.floor(heartbeatAgeMs / 1000));
  // Retained headers measure chain-time publication delay, not wall-clock age of a pinned H.
  const latestTimestamp = raw.headTimestamp ?? raw.timestamp;
  if (publication && latestTimestamp !== null && publication.timestamp !== 'null') {
    const publicationDelay = BigInt(latestTimestamp) - BigInt(publication.timestamp);
    if (publicationDelay > lagSeconds) lagSeconds = publicationDelay;
  }
  const projectionBehind = !!publication && BigInt(raw.h) > BigInt(publication.h);
  return { status: !publication || raw.status === 'rebuild_required' ? 'not_ready'
      : lag > 0n || projectionBehind || heartbeatAgeMs > 30_000 || lagSeconds > 30n ? 'lagging' : 'synced',
    headBlock: raw.head, confirmedBlock: confirmed.toString(), indexedBlock: raw.h,
    lagBlocks: lag.toString(), lagSeconds: lagSeconds.toString(), confirmations: String(raw.confirmations), lastIndexedAt: raw.updatedAt };
}

export function freshness(raw: Pick<NonNullable<ScopeState['raw']>, 'h' | 'head' | 'confirmations' | 'status' | 'updatedAt'> | null,
  publication: string | null, recovery: Json | null, now = Date.now()): Json {
  const confirmed = recovery?.confirmed != null ? BigInt(String(recovery.confirmed)) : raw
    ? (BigInt(raw.head) > BigInt(raw.confirmations) ? BigInt(raw.head) - BigInt(raw.confirmations) : 0n) : null;
  const lag = confirmed === null || publication === null ? null : confirmed > BigInt(publication) ? confirmed - BigInt(publication) : 0n;
  const checked = recovery?.lastCheckedAt ? Date.parse(String(recovery.lastCheckedAt)) : NaN;
  const since = lag && recovery?.lagSince ? Date.parse(String(recovery.lagSince))
    : lag && recovery?.lastPublishedAt ? Date.parse(String(recovery.lastPublishedAt)) : now;
  const age = Number.isFinite(checked) ? Math.max(0, now - checked, now - since) : null;
  const blocked = !raw || publication === null || raw.status === 'rebuild_required' ||
    (!!recovery && recovery.phase !== 'ready');
  const projectionBehind = !!raw && publication !== null && BigInt(raw.h) > BigInt(publication);
  return { status: blocked ? 'not_ready' : lag === 0n && !projectionBehind && age !== null && age <= 30_000 ? 'synced' : 'lagging',
    headBlock: recovery?.head ?? raw?.head ?? null, confirmedBlock: confirmed?.toString() ?? null,
    indexedBlock: raw?.h ?? null, publicationBlock: publication, lagBlocks: lag?.toString() ?? null,
    lagSeconds: age === null ? null : Math.floor(age / 1000).toString(), confirmations: raw ? String(raw.confirmations) : null,
    lastIndexedAt: raw?.updatedAt ?? null, lastRpcCheckAt: recovery?.lastCheckedAt ?? null,
    recoveryStatus: raw?.status === 'rebuild_required' ? 'rebuild_required' : recovery?.phase ?? 'unverified' };
}

function requireGovernance(value: Json): { config: Json } {
  const fields = ['govSupply', 'proposalThreshold', 'quorumNumerator', 'quorumDenominator', 'votingDelay', 'votingPeriod', 'minDelay'];
  for (const field of fields) {
    const v = value[field];
    if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || BigInt(v) > UINT256_MAX)
      throw new ApiError(503, 'DATA_NOT_READY', 'Deployment thiếu governance metadata đã xác minh.', { field }, true);
  }
  if (value.clockMode !== 'mode=timestamp' || BigInt(value.quorumDenominator as string) === 0n ||
      BigInt(value.quorumNumerator as string) > BigInt(value.quorumDenominator as string))
    throw new ApiError(503, 'DATA_NOT_READY', 'Governance metadata không hợp lệ hoặc không thuộc clock timestamp.', { field: 'governance_config' }, true);
  return { config: value };
}

async function servingMetadataReady(client: PoolClient, deploymentId: string, chainId: string, atBlock: string, governance: Json): Promise<boolean> {
  try { requireGovernance(governance); }
  catch { return false; }
  const expected = new Map([
    ['governor', 'oz-5.4.0-governor'], ['timelock', 'oz-5.4.0-timelock'],
    ['treasury', 'sc01-itreasury-v1'], ['budget_token', 'oz-5.4.0-erc20'],
    ['governance_token', 'sc02-governance-token-v1'],
  ]);
  const rows = await client.query(`SELECT contract_role,abi_version,deployment_block::text FROM deployment_contracts WHERE deployment_id=$1 AND chain_id=$2`,
    [deploymentId, chainId]);
  const actual = new Map(rows.rows.map((row) => [String(row.contract_role), row]));
  return expected.size === actual.size && [...expected].every(([role, abi]) => {
    const row = actual.get(role);
    return row !== undefined && String(row.abi_version) === abi && BigInt(String(row.deployment_block)) <= BigInt(atBlock);
  });
}

async function materialize(client: PoolClient, scopeState: ScopeState, ttlSeconds: number): Promise<Snapshot> {
  const { publication, context } = scopeState;
  if (!publication || !context) throw new ApiError(503, 'DATA_NOT_READY', 'Projection chưa sẵn sàng.', {}, true);
  const governance = requireGovernance(scopeState.governance).config;
  const rolesResult = await client.query(`SELECT contract_role, contract_address, abi_version FROM deployment_contracts WHERE deployment_id=$1 AND chain_id=$2`,
    [scopeState.deploymentId, scopeState.chainId]);
  const roles = new Map<string, { address: string; abi: string }>();
  for (const r of rolesResult.rows) roles.set(String(r.contract_role), { address: String(r.contract_address), abi: String(r.abi_version) });
  const governor = roles.get('governor'), timelock = roles.get('timelock'), treasury = roles.get('treasury');
  const bud = roles.get('budget_token'), gov = roles.get('governance_token');
  if (!governor || !timelock || !treasury || !bud || !gov || governor.abi !== 'oz-5.4.0-governor' ||
      timelock.abi !== 'oz-5.4.0-timelock' || treasury.abi !== 'sc01-itreasury-v1' ||
      bud.abi !== 'oz-5.4.0-erc20' || gov.abi !== 'sc02-governance-token-v1')
    throw new ApiError(503, 'DATA_NOT_READY', 'Metadata contract/ABI chưa đầy đủ hoặc chưa được xác minh.', {}, true);

  const invalidRows = await client.query(`SELECT
      (SELECT count(*) FROM proposals p JOIN raw_events r ON r.deployment_id=p.deployment_id AND r.raw_event_id=p.created_event_id
        WHERE p.deployment_id=$1 AND r.block_number>$2::numeric) +
      (SELECT count(*) FROM votes v JOIN raw_events r ON r.deployment_id=v.deployment_id AND r.raw_event_id=v.source_event_id
        WHERE v.deployment_id=$1 AND r.block_number>$2::numeric) +
      (SELECT count(*) FROM transfers t JOIN raw_events r ON r.deployment_id=t.deployment_id AND r.raw_event_id=t.source_event_id
        WHERE t.deployment_id=$1 AND r.block_number>$2::numeric) +
      (SELECT count(*) FROM proposals p CROSS JOIN LATERAL
        (VALUES (p.executed_event_id),(p.canceled_event_id)) e(raw_event_id)
        JOIN raw_events r ON r.deployment_id=p.deployment_id AND r.raw_event_id=e.raw_event_id
        WHERE p.deployment_id=$1 AND r.block_number>$2::numeric) +
      (SELECT count(*) FROM operations o CROSS JOIN LATERAL
        (VALUES (o.queued_event_id),(o.scheduled_event_id),(o.executed_event_id),(o.canceled_event_id)) e(raw_event_id)
        JOIN raw_events r ON r.deployment_id=o.deployment_id AND r.raw_event_id=e.raw_event_id
        WHERE o.deployment_id=$1 AND r.block_number>$2::numeric) +
      (SELECT count(*) FROM disbursements d JOIN raw_events r ON r.deployment_id=d.deployment_id AND r.raw_event_id=d.source_event_id
        WHERE d.deployment_id=$1 AND r.block_number>$2::numeric) AS future_rows`, [scopeState.deploymentId, publication.h]);
  if (BigInt(invalidRows.rows[0].future_rows) !== 0n)
    throw new ApiError(503, 'DATA_NOT_READY', 'Projection chứa source row sau H đã publish.', { reason: 'PROJECTION_AFTER_H' }, true, context);

  const proposalRows = await client.query(`SELECT p.proposal_id::text,p.request_id,p.proposer,p.recipient,p.amount::text,
      p.description,p.description_bytes,p.description_hash,p.targets::text[] AS targets,p.native_values::text[] AS native_values,
      p.calldatas::text[] AS calldatas,p.snapshot::text,p.deadline::text,
      s.state,s.against_votes::text,s.for_votes::text,s.abstain_votes::text,s.quorum::text,s.operation_status,
      o.operation_id,o.predecessor,o.salt,o.queued_at::text,o.eta::text,
      cr.transaction_hash AS created_tx, cr.block_number::text AS created_block,cr.block_hash AS created_block_hash,
      cr.transaction_index::text AS created_tx_index,cr.log_index::text AS created_log_index,
      qr.transaction_hash AS queued_tx,qr.block_number::text AS queued_block,qr.block_hash AS queued_block_hash,
      qr.transaction_index::text AS queued_tx_index,qr.log_index::text AS queued_log_index,
      er.transaction_hash AS executed_tx,er.block_number::text AS executed_block,er.block_hash AS executed_block_hash,
      er.transaction_index::text AS executed_tx_index,er.log_index::text AS executed_log_index,
      xr.transaction_hash AS canceled_tx,xr.block_number::text AS canceled_block,xr.block_hash AS canceled_block_hash,
      xr.transaction_index::text AS canceled_tx_index,xr.log_index::text AS canceled_log_index
    FROM proposals p JOIN proposal_states s USING (deployment_id,proposal_id)
    JOIN raw_events cr ON cr.deployment_id=p.deployment_id AND cr.raw_event_id=p.created_event_id
    LEFT JOIN operations o ON o.deployment_id=p.deployment_id AND o.proposal_id=p.proposal_id
    LEFT JOIN raw_events qr ON qr.deployment_id=o.deployment_id AND qr.raw_event_id=o.queued_event_id
    LEFT JOIN raw_events er ON er.deployment_id=p.deployment_id AND er.raw_event_id=p.executed_event_id
    LEFT JOIN raw_events xr ON xr.deployment_id=p.deployment_id AND xr.raw_event_id=p.canceled_event_id
    WHERE p.deployment_id=$1 ORDER BY cr.block_number DESC,cr.transaction_index DESC,cr.log_index DESC,p.proposal_id DESC`, [scopeState.deploymentId]);
  const proposalPayloads: Array<{ row: Record<string, unknown>; payload: Json }> = [];
  for (const row of proposalRows.rows) {
    if (typeof row.description !== 'string' || !Buffer.isBuffer(row.description_bytes) || !Buffer.from(row.description, 'utf8').equals(row.description_bytes))
      throw new ApiError(503, 'DATA_NOT_READY', 'Description không thể phục vụ nguyên văn dưới hash đã lưu.', { proposalId: String(row.proposal_id) }, true, context);
    const computedDescriptionHash = keccak256(toUtf8Bytes(row.description));
    if (computedDescriptionHash.toLowerCase() !== String(row.description_hash).toLowerCase())
      throw new ApiError(503, 'DATA_NOT_READY', 'descriptionHash không khớp chính xác với description UTF-8.', { proposalId: String(row.proposal_id) }, true, context);
    const computedProposalId = BigInt(keccak256(coder.encode(['address[]','uint256[]','bytes[]','bytes32'],
      [row.targets, row.native_values, row.calldatas, computedDescriptionHash]))).toString();
    if (computedProposalId !== String(row.proposal_id))
      throw new ApiError(503, 'DATA_NOT_READY', 'proposalId không khớp action/calldata/descriptionHash.', { proposalId: String(row.proposal_id) }, true, context);
    const display = descriptionFields(row.description);
    if (row.operation_id !== null && !['Waiting', 'Ready', 'Done', 'Canceled'].includes(String(row.operation_status)))
      throw new ApiError(503, 'DATA_NOT_READY', 'Operation projection thiếu trạng thái hợp lệ.', { proposalId: String(row.proposal_id) }, true, context);
    const operation = row.operation_id === null ? null : { operationId: String(row.operation_id), queuedAt: String(row.queued_at), eta: String(row.eta),
      status: String(row.operation_status), predecessor: String(row.predecessor), salt: String(row.salt) };
    const payload: Json = { proposalId: String(row.proposal_id), requestId: String(row.request_id), proposer: String(row.proposer),
      recipient: String(row.recipient), amount: String(row.amount), description: row.description, descriptionHash: String(row.description_hash),
      ...display, targets: (row.targets as string[]).map((x) => x.toLowerCase()), values: (row.native_values as string[]).map(String),
      calldatas: (row.calldatas as string[]).map((x) => x.toLowerCase()), snapshot: String(row.snapshot), deadline: String(row.deadline),
      state: String(row.state), stateSource: 'contract',
      votes: { against: String(row.against_votes), for: String(row.for_votes), abstain: String(row.abstain_votes), quorum: row.quorum === null ? null : String(row.quorum) },
      operation, created: { transactionHash: String(row.created_tx), transactionIndex: String(row.created_tx_index), blockNumber: String(row.created_block),
        blockHash: String(row.created_block_hash), logIndex: String(row.created_log_index) },
      transactions: { created: String(row.created_tx), queued: row.queued_tx === null ? null : String(row.queued_tx),
        executed: row.executed_tx === null ? null : String(row.executed_tx), canceled: row.canceled_tx === null ? null : String(row.canceled_tx) } };
    proposalPayloads.push({ row, payload });
  }

  const voteRows = await client.query(`SELECT v.proposal_id::text,v.voter,v.support,v.weight::text,v.reason,
      r.block_number::text,r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text
    FROM votes v JOIN raw_events r ON r.deployment_id=v.deployment_id AND r.raw_event_id=v.source_event_id
    WHERE v.deployment_id=$1 ORDER BY r.block_number DESC,r.transaction_index DESC,r.log_index DESC`, [scopeState.deploymentId]);
  const transferRows = await client.query(`SELECT t.token_address,t.from_address,t.to_address,t.amount::text,
      CASE WHEN t.from_address=t.to_address THEN 'self' WHEN t.to_address=t.treasury_address THEN 'in' ELSE 'out' END AS direction,
      d.proposal_id::text,d.request_id,r.block_number::text,r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text
    FROM transfers t JOIN raw_events r ON r.deployment_id=t.deployment_id AND r.raw_event_id=t.source_event_id
    LEFT JOIN disbursements d ON d.deployment_id=t.deployment_id AND d.transfer_id=t.transfer_id
    WHERE t.deployment_id=$1 AND t.token_address=$2::evm_address AND t.treasury_address=$3::evm_address
      AND (t.from_address=t.treasury_address OR t.to_address=t.treasury_address)
    ORDER BY r.block_number DESC,r.transaction_index DESC,r.log_index DESC`, [scopeState.deploymentId, bud.address, treasury.address]);
  const transferPayloads = transferRows.rows.map((r) => ({ row: r as Record<string, unknown>, payload: {
    token: String(r.token_address), from: String(r.from_address), to: String(r.to_address), amount: String(r.amount), direction: String(r.direction),
    proposalId: r.proposal_id === null ? null : String(r.proposal_id), requestId: r.request_id === null ? null : String(r.request_id),
    transactionHash: String(r.transaction_hash), transactionIndex: String(r.transaction_index), blockNumber: String(r.block_number),
    blockHash: String(r.block_hash), logIndex: String(r.log_index),
  } as Json }));

  const totals = await client.query(`SELECT total_in::text,total_out::text,balance::text FROM treasury_totals WHERE deployment_id=$1`, [scopeState.deploymentId]);
  const counts = await client.query(`SELECT state,count(*)::text AS count FROM proposal_states WHERE deployment_id=$1 GROUP BY state`, [scopeState.deploymentId]);
  const byState: Json = Object.fromEntries([...STATES].map((s) => [s, 0]));
  let total = 0;
  for (const r of counts.rows) { const n = sqlCount(r.count); byState[String(r.state)] = n; total += n; }
  const totalIn = totals.rows[0]?.total_in ?? '0', totalOut = totals.rows[0]?.total_out ?? '0', balance = totals.rows[0]?.balance ?? '0';
  const summary: Json = { treasury: { address: treasury.address, token: { address: bud.address, symbol: 'BUD', decimals: 18 }, balance, totalIn, totalOut },
    proposalCounts: { total, byState }, governance: { governor: governor.address, timelock: timelock.address,
      govToken: { address: gov.address, symbol: 'GOV', decimals: 18 }, clockMode: String(governance.clockMode),
      proposalThreshold: String(governance.proposalThreshold), votingDelay: String(governance.votingDelay), votingPeriod: String(governance.votingPeriod),
      timelockDelay: String(governance.minDelay), quorumNumerator: String(governance.quorumNumerator),
      quorumDenominator: String(governance.quorumDenominator), totalSupply: String(governance.govSupply) }, recentActivity: [] };
  const sync = scopeState.sync;
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const inserted = await client.query(`INSERT INTO api_read_snapshots
      (deployment_id,chain_id,block_number,block_hash,block_timestamp,snapshot_revision,source_scope,summary,sync,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,to_timestamp($10)) RETURNING snapshot_id::text`,
  [scopeState.deploymentId, scopeState.chainId, publication.h, publication.hash, publication.timestamp, publication.revision, publication.scope,
    JSON.stringify(summary), JSON.stringify(sync), expiry]);
  const snapshotId = String(inserted.rows[0].snapshot_id);
  await client.query(`INSERT INTO api_read_proposals
      (snapshot_id,proposal_id,state,created_block,created_tx_index,created_log_index,payload)
    SELECT $1,x.proposal_id::numeric,x.state,x.created_block::numeric,x.created_tx_index::bigint,x.created_log_index::bigint,x.payload
    FROM jsonb_to_recordset($2::jsonb) AS x(proposal_id text,state text,created_block text,created_tx_index text,created_log_index text,payload jsonb)`,
    [snapshotId, JSON.stringify(proposalPayloads.map(({ row, payload }) => ({ proposal_id: String(row.proposal_id), state: String(row.state),
      created_block: String(row.created_block), created_tx_index: String(row.created_tx_index), created_log_index: String(row.created_log_index), payload })))]);
  const votePayloads: Array<{ proposalId: string; block: string; tx: string; log: string; payload: Json }> = [];
  for (const row of voteRows.rows) {
    const payload: Json = { proposalId: String(row.proposal_id), voter: String(row.voter), support: Number(row.support), weight: String(row.weight), reason: String(row.reason),
      blockNumber: String(row.block_number), blockHash: String(row.block_hash), transactionHash: String(row.transaction_hash),
      transactionIndex: String(row.transaction_index), logIndex: String(row.log_index) };
    votePayloads.push({ proposalId: String(row.proposal_id), block: String(row.block_number), tx: String(row.transaction_index), log: String(row.log_index), payload });
  }
  await client.query(`INSERT INTO api_read_votes(snapshot_id,proposal_id,block_number,transaction_index,log_index,payload)
    SELECT $1,x.proposal_id::numeric,x.block_number::numeric,x.transaction_index::bigint,x.log_index::bigint,x.payload
    FROM jsonb_to_recordset($2::jsonb) AS x(proposal_id text,block_number text,transaction_index text,log_index text,payload jsonb)`,
    [snapshotId, JSON.stringify(votePayloads.map((x) => ({ proposal_id: x.proposalId, block_number: x.block, transaction_index: x.tx, log_index: x.log, payload: x.payload })))]);
  await client.query(`INSERT INTO api_read_transfers(snapshot_id,block_number,transaction_index,log_index,proposal_id,direction,payload)
    SELECT $1,x.block_number::numeric,x.transaction_index::bigint,x.log_index::bigint,NULLIF(x.proposal_id,'')::numeric,x.direction,x.payload
    FROM jsonb_to_recordset($2::jsonb) AS x(block_number text,transaction_index text,log_index text,proposal_id text,direction text,payload jsonb)`,
    [snapshotId, JSON.stringify(transferPayloads.map(({ row, payload }) => ({ block_number: String(row.block_number), transaction_index: String(row.transaction_index),
      log_index: String(row.log_index), proposal_id: row.proposal_id === null ? '' : String(row.proposal_id), direction: String(row.direction), payload })))]);
  const recent = await client.query(`SELECT payload FROM api_read_transfers WHERE snapshot_id=$1
    ORDER BY block_number DESC,transaction_index DESC,log_index DESC LIMIT 5`, [snapshotId]);
  summary.recentActivity = recent.rows.map((r) => ({ type: 'Transfer', ...(r.payload as Json) }));
  await client.query('UPDATE api_read_snapshots SET summary=$2::jsonb WHERE snapshot_id=$1', [snapshotId, JSON.stringify(summary)]);
  return { id: snapshotId, context: { ...context, sync }, summary, expiresAt: expiry, sourceScope: publication.scope };
}

async function getSnapshot(pool: Pool, scope: Scope, query: Map<string, string>, cursor: Cursor | null, ttlSeconds: number): Promise<Snapshot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const state = await scopeAndPublication(client, scope, false);
    const requestedBlock = query.get('asOfBlock');
    const requestedHash = query.get('asOfBlockHash');
    if ((requestedBlock === undefined) !== (requestedHash === undefined))
      throw new ApiError(400, 'INVALID_ARGUMENT', 'asOfBlock và asOfBlockHash phải được truyền cùng nhau.', { field: 'asOfBlock' });
    if (requestedBlock !== undefined) canonicalUint(requestedBlock, 'asOfBlock');
    if (requestedHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(requestedHash))
      throw new ApiError(400, 'INVALID_ARGUMENT', 'asOfBlockHash phải là bytes32.', { field: 'asOfBlockHash' });
    if (cursor) {
      if (cursor.c !== scope.chainId || cursor.d !== scope.deploymentId ||
          (requestedBlock !== undefined && (cursor.h !== requestedBlock || cursor.b !== requestedHash!.toLowerCase())))
        throw new ApiError(400, 'CURSOR_CONTEXT_MISMATCH', 'Cursor thuộc chain, deployment hoặc snapshot khác.');
    }
    if (!state.ready) {
      const status = cursor ? 409 : 503;
      throw new ApiError(status, status === 409 ? 'SNAPSHOT_INVALIDATED' : 'DATA_NOT_READY',
        status === 409 ? 'Snapshot không còn hợp lệ sau thay đổi raw/projection.' : 'Chưa có publication BE04 đáng tin cậy.', {}, status === 503, state.notReadyContext as Context);
    }
    if (cursor && cursor.s !== state.publication!.scope)
      throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Source scope của publication đã thay đổi.', {}, false, state.context);
    if (cursor && cursor.r !== state.revision) throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Snapshot revision đã thay đổi.', {}, false, state.context);
    if (cursor) {
      const cached = await client.query(`SELECT snapshot_id::text,block_number::text,block_hash,block_timestamp::text,
          snapshot_revision::text,source_scope,summary,sync,extract(epoch from expires_at)::bigint::text AS expires
        FROM api_read_snapshots WHERE snapshot_id=$1 AND deployment_id=$2 AND chain_id=$3`, [cursor.i, state.deploymentId, state.chainId]);
      const row = cached.rows[0];
      if (!row) {
        const canonical = await client.query(`SELECT block_hash FROM indexed_blocks WHERE deployment_id=$1 AND block_number=$2`, [state.deploymentId, cursor.h]);
        if (canonical.rowCount !== 1 || String(canonical.rows[0].block_hash).toLowerCase() !== cursor.b)
          throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Hash của snapshot không còn canonical.', {}, false, state.context);
        throw new ApiError(409, 'SNAPSHOT_UNAVAILABLE', 'Snapshot đã hết hạn hoặc không còn được lưu.');
      }
      if (Number(row.expires) <= Date.now() / 1000) throw new ApiError(409, 'SNAPSHOT_UNAVAILABLE', 'Snapshot đã hết hạn hoặc không còn được lưu.');
      if (String(row.block_number) !== cursor.h || String(row.block_hash).toLowerCase() !== cursor.b || String(row.snapshot_revision) !== cursor.r)
        throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Thông tin snapshot không còn khớp.', {}, false, state.context);
      if (String(row.source_scope) !== cursor.s || String(row.source_scope) !== state.publication!.scope)
        throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Source scope của snapshot đã thay đổi.', {}, false, state.context);
      const canonical = await client.query(`SELECT block_hash FROM indexed_blocks WHERE deployment_id=$1 AND block_number=$2`, [state.deploymentId, cursor.h]);
      if (canonical.rowCount !== 1 || String(canonical.rows[0].block_hash).toLowerCase() !== cursor.b)
        throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Hash của snapshot không còn canonical.', {}, false, state.context);
      await client.query('COMMIT');
      return { id: String(row.snapshot_id), context: { chainId: scope.chainId, deploymentId: scope.deploymentId, asOfBlock: String(row.block_number),
        asOfBlockHash: String(row.block_hash), asOfTimestamp: String(row.block_timestamp), snapshotRevision: String(row.snapshot_revision), dataKind: 'chain', sync: state.sync },
        summary: row.summary, expiresAt: Number(row.expires), sourceScope: String(row.source_scope) };
    }
    if (requestedBlock !== undefined) {
      const cached = await client.query(`SELECT snapshot_id::text,block_number::text,block_hash,block_timestamp::text,
          snapshot_revision::text,source_scope,summary,sync,extract(epoch from expires_at)::bigint::text AS expires
        FROM api_read_snapshots WHERE deployment_id=$1 AND chain_id=$2 AND block_number=$3 AND block_hash=$4
          AND snapshot_revision=$5 AND source_scope=$6 AND expires_at>clock_timestamp() AND invalidated_at IS NULL`,
      [state.deploymentId, state.chainId, requestedBlock, requestedHash!.toLowerCase(), state.revision, state.publication!.scope]);
      if (cached.rowCount) {
        const row = cached.rows[0]!;
        const canonical = await client.query(`SELECT block_hash FROM indexed_blocks WHERE deployment_id=$1 AND block_number=$2`, [state.deploymentId, requestedBlock]);
        if (canonical.rowCount !== 1 || String(canonical.rows[0].block_hash).toLowerCase() !== requestedHash!.toLowerCase())
          throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Hash của snapshot không còn canonical.');
        await client.query('COMMIT');
        return { id: String(row.snapshot_id), context: { chainId: scope.chainId, deploymentId: scope.deploymentId, asOfBlock: String(row.block_number),
          asOfBlockHash: String(row.block_hash), asOfTimestamp: String(row.block_timestamp), snapshotRevision: String(row.snapshot_revision), dataKind: 'chain', sync: state.sync },
          summary: row.summary, expiresAt: Number(row.expires), sourceScope: String(row.source_scope) };
      }
      if (BigInt(requestedBlock) > BigInt(state.publication!.h))
        throw new ApiError(503, 'DATA_NOT_READY', 'H yêu cầu cao hơn publication hiện có.', { requestedBlock, publishedBlock: state.publication!.h }, true, state.context);
      const canonical = await client.query(`SELECT block_hash FROM indexed_blocks WHERE deployment_id=$1 AND block_number=$2`,
        [state.deploymentId, requestedBlock]);
      if (canonical.rowCount !== 1 || String(canonical.rows[0].block_hash).toLowerCase() !== requestedHash!.toLowerCase())
        throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Hash yêu cầu không còn canonical tại H.', {}, false, state.context);
      const staleSnapshot = await client.query(`SELECT snapshot_revision::text,source_scope,invalidated_at
        FROM api_read_snapshots WHERE deployment_id=$1 AND chain_id=$2 AND block_number=$3 AND block_hash=$4
        ORDER BY created_at DESC LIMIT 1`, [state.deploymentId, state.chainId, requestedBlock, requestedHash!.toLowerCase()]);
      if (staleSnapshot.rowCount && (staleSnapshot.rows[0].invalidated_at ||
          String(staleSnapshot.rows[0].snapshot_revision) !== state.revision ||
          String(staleSnapshot.rows[0].source_scope) !== state.publication!.scope))
        throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Snapshot đã bị thay thế bởi source scope hoặc revision khác.', {}, false, state.context);
      if (requestedBlock !== state.publication!.h)
        throw new ApiError(409, 'SNAPSHOT_UNAVAILABLE', 'Snapshot H/hash không được lưu hoặc không phải publication hiện tại.', {}, false, state.context);
    }
    if (!state.publication) throw new ApiError(503, 'DATA_NOT_READY', 'Chưa có publication BE04.', {}, true, state.notReadyContext as Context);
    await client.query('DELETE FROM api_read_snapshots WHERE expires_at<=clock_timestamp()');
    const existing = await client.query(`SELECT snapshot_id::text,block_number::text,block_hash,block_timestamp::text,snapshot_revision::text,source_scope,
        summary,sync,extract(epoch from expires_at)::bigint::text AS expires
      FROM api_read_snapshots WHERE deployment_id=$1 AND block_number=$2 AND block_hash=$3 AND snapshot_revision=$4
        AND source_scope=$5 AND expires_at>clock_timestamp() AND invalidated_at IS NULL`,
    [state.deploymentId, state.publication.h, state.publication.hash, state.publication.revision, state.publication.scope]);
    if (existing.rowCount) {
      const row = existing.rows[0]!;
      await client.query('COMMIT');
      return { id: String(row.snapshot_id), context: { chainId: scope.chainId, deploymentId: scope.deploymentId, asOfBlock: String(row.block_number),
        asOfBlockHash: String(row.block_hash), asOfTimestamp: String(row.block_timestamp), snapshotRevision: String(row.snapshot_revision), dataKind: 'chain', sync: state.sync },
        summary: row.summary, expiresAt: Number(row.expires), sourceScope: String(row.source_scope) };
    }
    const snapshot = await materialize(client, state, ttlSeconds);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ApiError) throw error;
    if ((error as { code?: string })?.code === '23505') return getSnapshot(pool, scope, query, cursor, ttlSeconds);
    throw new ApiError(503, 'DATA_NOT_READY', 'Không thể đọc publication PostgreSQL nhất quán.', {}, true);
  } finally { client.release(); }
}

function filtersFor(endpoint: string, q: Map<string, string>): Json {
  if (endpoint === '/api/proposals') {
    const state = q.get('state') ?? null;
    if (state && !STATES.has(state)) throw new ApiError(400, 'INVALID_ARGUMENT', 'state không được hỗ trợ.', { field: 'state' });
    const proposalId = q.has('proposalId') ? canonicalUint(q.get('proposalId'), 'proposalId') : null;
    return { state, proposalId };
  }
  if (endpoint === '/api/treasury/transfers') {
    const direction = q.get('direction') ?? null;
    if (direction !== null && !['in', 'out', 'self'].includes(direction)) throw new ApiError(400, 'INVALID_ARGUMENT', 'direction không được hỗ trợ.', { field: 'direction' });
    const proposalId = q.has('proposalId') ? canonicalUint(q.get('proposalId'), 'proposalId') : null;
    return { direction, proposalId };
  }
  return {};
}

function cursorContext(cursor: Cursor, endpoint: string, filters: Json, limit: number, scope: Scope): void {
  if (cursor.e !== endpoint || cursor.l !== limit || !sameJson(cursor.f, filters) || cursor.c !== scope.chainId || cursor.d !== scope.deploymentId)
    throw new ApiError(400, 'CURSOR_CONTEXT_MISMATCH', 'Cursor endpoint, filter, limit hoặc scope không khớp request.');
}

async function page(pool: Pool, snapshot: Snapshot, endpoint: string, filters: Json, limit: number, cursor: Cursor | null, scope: Scope, secret: string): Promise<Json> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const stillValid = await client.query(`SELECT s.invalidated_at,s.expires_at,d.snapshot_revision::text,s.source_scope::text AS snapshot_scope,
        p.source_scope::text AS projection_scope,c.source_scope::text AS raw_scope,c.sync_status,to_jsonb(d)->'indexer_state' AS recovery_state,ib.block_hash
      FROM api_read_snapshots s JOIN deployments d USING (deployment_id)
        JOIN checkpoints c USING (deployment_id) LEFT JOIN indexed_blocks ib
          ON ib.deployment_id=s.deployment_id AND ib.block_number=s.block_number
        LEFT JOIN projection_checkpoints p ON p.deployment_id=s.deployment_id
        WHERE s.snapshot_id=$1 AND d.deployment_name=$2 AND d.chain_id=$3`, [snapshot.id, scope.deploymentId, scope.chainId]);
    const validity = stillValid.rows[0];
    if (!validity || validity.invalidated_at || new Date(validity.expires_at).getTime() <= Date.now() || validity.sync_status === 'rebuild_required' || (validity.recovery_state && validity.recovery_state.phase !== 'ready') ||
        String(validity.snapshot_scope) !== snapshot.sourceScope || String(validity.projection_scope) !== snapshot.sourceScope || String(validity.raw_scope) !== snapshot.sourceScope ||
        String(validity.snapshot_revision) !== snapshot.context.snapshotRevision || String(validity.block_hash).toLowerCase() !== snapshot.context.asOfBlockHash.toLowerCase())
      throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Snapshot đã hết hạn hoặc bị invalidated.', {}, false, snapshot.context);
    let table: string, where = ['snapshot_id=$1'], values: unknown[] = [snapshot.id], order: string, keys: string[], projection: string;
    if (endpoint === '/api/proposals') {
      table = 'api_read_proposals'; order = 'created_block::numeric DESC,created_tx_index::numeric DESC,created_log_index::numeric DESC,proposal_id::numeric DESC';
      if (filters.state) { values.push(filters.state); where.push(`state=$${values.length}`); }
      if (filters.proposalId) { values.push(filters.proposalId); where.push(`proposal_id=$${values.length}::numeric`); }
      keys = ['created_block::numeric','created_tx_index::numeric','created_log_index::numeric','proposal_id::numeric']; projection = 'payload';
    } else if (endpoint.endsWith('/votes')) {
      table = 'api_read_votes'; order = 'block_number::numeric DESC,transaction_index::numeric DESC,log_index::numeric DESC';
      values.push((filters as Json).proposalId ?? ''); where.push(`proposal_id=$${values.length}::numeric`);
      keys = ['block_number::numeric','transaction_index::numeric','log_index::numeric']; projection = 'payload';
    } else {
      table = 'api_read_transfers'; order = 'block_number::numeric DESC,transaction_index::numeric DESC,log_index::numeric DESC';
      if (filters.direction) { values.push(filters.direction); where.push(`direction=$${values.length}`); }
      if (filters.proposalId) { values.push(filters.proposalId); where.push(`proposal_id=$${values.length}::numeric`); }
      keys = ['block_number::numeric','transaction_index::numeric','log_index::numeric']; projection = 'payload';
    }
    if (endpoint.endsWith('/votes')) {
      const proposal = await client.query('SELECT 1 FROM api_read_proposals WHERE snapshot_id=$1 AND proposal_id=$2::numeric', [snapshot.id, (filters as Json).proposalId]);
      if (!proposal.rowCount) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Proposal không tồn tại tại snapshot H.', { proposalId: String((filters as Json).proposalId) }, false, snapshot.context);
    }
    if (cursor) {
      const last = cursor.k;
      if (last.length !== keys.length || last.some((x) => !/^(0|[1-9][0-9]*)$/.test(x))) throw new ApiError(400, 'INVALID_CURSOR', 'Cursor tuple không hợp lệ.');
      const casts = keys.map((_, i) => `${i === 0 ? '' : ''}$${values.length + i + 1}::numeric`);
      const columns = keys.map((key) => `(${key})`).join(',');
      values.push(...last);
      where.push(`ROW(${columns}) < ROW(${casts.join(',')})`);
    }
    const whereSql = where.join(' AND ');
    const countValues: unknown[] = [snapshot.id];
    const countWhere = ['snapshot_id=$1'];
    if (endpoint === '/api/proposals') {
      if (filters.state) { countValues.push(filters.state); countWhere.push(`state=$${countValues.length}`); }
      if (filters.proposalId) { countValues.push(filters.proposalId); countWhere.push(`proposal_id=$${countValues.length}::numeric`); }
    } else if (endpoint.endsWith('/votes')) {
      countValues.push((filters as Json).proposalId); countWhere.push(`proposal_id=$${countValues.length}::numeric`);
    } else {
      if (filters.direction) { countValues.push(filters.direction); countWhere.push(`direction=$${countValues.length}`); }
      if (filters.proposalId) { countValues.push(filters.proposalId); countWhere.push(`proposal_id=$${countValues.length}::numeric`); }
    }
    const count = await client.query(`SELECT count(*)::text AS total FROM ${table} WHERE ${countWhere.join(' AND ')}`, countValues);
    values.push(limit + 1);
    const rows = await client.query(`SELECT ${projection}${endpoint === '/api/proposals' ? ',created_block::text,created_tx_index::text,created_log_index::text,proposal_id::text' : endpoint.endsWith('/votes') ? ',block_number::text,transaction_index::text,log_index::text' : ',block_number::text,transaction_index::text,log_index::text'}
      FROM ${table} WHERE ${whereSql} ORDER BY ${order} LIMIT $${values.length}`, values);
    const hasMore = rows.rows.length > limit;
    const selected = rows.rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (hasMore && selected.length) {
      const last = selected.at(-1)!;
      const key = endpoint === '/api/proposals' ? [String(last.created_block), String(last.created_tx_index), String(last.created_log_index), String(last.proposal_id)] :
        [String(last.block_number), String(last.transaction_index), String(last.log_index)];
      nextCursor = encodeCursor({ v: 1, i: snapshot.id, c: scope.chainId, d: scope.deploymentId, h: snapshot.context.asOfBlock,
        b: snapshot.context.asOfBlockHash.toLowerCase(), r: snapshot.context.snapshotRevision, s: snapshot.sourceScope,
        e: endpoint, f: filters, l: limit, k: key, x: snapshot.expiresAt }, secret);
    }
    snapshot.context.sync = (await scopeAndPublication(client, scope, false)).sync;
    await client.query('COMMIT');
    return { context: snapshot.context, data: selected.map((row) => row.payload), pagination: { limit, totalCount: sqlCount(count.rows[0].total), nextCursor } };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DATA_NOT_READY', 'Không thể đọc snapshot PostgreSQL nhất quán.', {}, true, snapshot.context);
  } finally { client.release(); }
}

function validateCursorFilters(cursor: Cursor, endpoint: string, filters: Json, limit: number, scope: Scope): void {
  cursorContext(cursor, endpoint, filters, limit, scope);
}

export type ServerOptions = { pool: Pool; cursorSecret: string; corsOrigins?: string; snapshotTtlSeconds?: number };

export function createApiServer(options: ServerOptions): Server {
  if (Buffer.byteLength(options.cursorSecret) < 32) throw new Error('API_CURSOR_SECRET must contain at least 32 bytes.');
  const origins = new Set((options.corsOrigins ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  const ttl = options.snapshotTtlSeconds ?? TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) throw new Error('API_SNAPSHOT_TTL_SECONDS must be an integer in [60,86400].');
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) { res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin'); res.setHeader('access-control-allow-methods', 'GET, OPTIONS'); res.setHeader('access-control-allow-headers', 'content-type'); }
    else if (origin && origins.size) { send(res, 403, { context: null, error: { code: 'INVALID_ARGUMENT', message: 'Origin không được cấu hình.', details: {}, retryable: false } }); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET') { send(res, 405, { context: null, error: { code: 'INVALID_ARGUMENT', message: 'Chỉ hỗ trợ GET.', details: {}, retryable: false } }); return; }
    try {
      const { url, query } = parseRequest(req);
      const route = url.pathname;
      const voteMatch = route.match(/^\/api\/proposals\/([^/]+)\/votes$/);
      const detailMatch = route.match(/^\/api\/proposals\/([^/]+)$/);
      if (route === '/api/health') {
        const scope = getScope(query);
        if (query.has('asOfBlock') || query.has('asOfBlockHash') || query.has('cursor') || query.has('limit') || query.has('state') || query.has('proposalId') || query.has('direction'))
          throw new ApiError(400, 'INVALID_ARGUMENT', 'Health không nhận snapshot hoặc filter.', { field: 'query' });
        const result = await readHealth(options.pool, scope);
        send(res, result.status, result.body); return;
      }
      const isProposalList = route === '/api/proposals';
      const isSummary = route === '/api/summary';
      const isTransfers = route === '/api/treasury/transfers';
      const isDetail = !!detailMatch;
      const isVotes = !!voteMatch;
      if (!isSummary && !isProposalList && !isTransfers && !isDetail && !isVotes)
        throw new ApiError(404, 'INVALID_ARGUMENT', 'Endpoint không tồn tại.');
      if (isDetail || isVotes) {
        if (query.has('proposalId')) throw new ApiError(400, 'INVALID_ARGUMENT', 'proposalId lấy từ path, không nhận query trùng.', { field: 'proposalId' });
        let encodedId: string;
        try { encodedId = decodeURIComponent((detailMatch ?? voteMatch)![1]!); }
        catch { throw new ApiError(400, 'INVALID_PROPOSAL_ID', 'proposalId phải là chuỗi số nguyên uint256 hợp lệ.', { field: 'proposalId' }); }
        canonicalUint(encodedId, 'proposalId');
        query.set('proposalId', encodedId);
      }
      const scope = getScope(query);
      const allowedForEndpoint = isSummary ? new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash']) :
        isDetail ? new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'proposalId']) :
        isVotes ? new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'limit', 'cursor', 'proposalId']) :
        isProposalList ? new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'limit', 'cursor', 'state', 'proposalId']) :
        new Set(['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'limit', 'cursor', 'direction', 'proposalId']);
      for (const key of query.keys()) if (!allowedForEndpoint.has(key))
        throw new ApiError(400, 'INVALID_ARGUMENT', 'Query parameter không được hỗ trợ cho endpoint này.', { field: key });
      const endpoint = route;
      const cursorRaw = query.get('cursor');
      if (query.has('cursor') && !cursorRaw) throw new ApiError(400, 'INVALID_CURSOR', 'Cursor không hợp lệ hoặc đã hết hạn.');
      const cursor = cursorRaw ? decodeCursor(cursorRaw, options.cursorSecret) : null;
      const filters = filtersFor(isProposalList ? route : isTransfers ? route : isVotes ? route : '', query);
      if (isVotes) filters.proposalId = query.get('proposalId')!;
      const limit = isProposalList || isTransfers || isVotes ? parseLimit(query) : 20;
      if (cursor) validateCursorFilters(cursor, endpoint, filters, limit, scope);
      const snapshot = await getSnapshot(options.pool, scope, query, cursor, ttl);
      if (isSummary) { send(res, 200, { context: snapshot.context, data: snapshot.summary }); return; }
      if (isDetail) {
        const client = await options.pool.connect();
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          const snapshotCheck = await client.query(`SELECT s.invalidated_at,s.expires_at,d.snapshot_revision::text,s.source_scope::text AS snapshot_scope,
              p.source_scope::text AS projection_scope,c.source_scope::text AS raw_scope,c.sync_status,to_jsonb(d)->'indexer_state' AS recovery_state,ib.block_hash
            FROM api_read_snapshots s JOIN deployments d USING (deployment_id)
              JOIN checkpoints c USING (deployment_id) LEFT JOIN indexed_blocks ib
                ON ib.deployment_id=s.deployment_id AND ib.block_number=s.block_number
              LEFT JOIN projection_checkpoints p ON p.deployment_id=s.deployment_id
              WHERE s.snapshot_id=$1 AND d.deployment_name=$2 AND d.chain_id=$3`, [snapshot.id, scope.deploymentId, scope.chainId]);
          const meta = snapshotCheck.rows[0];
          if (!meta || meta.invalidated_at || new Date(meta.expires_at).getTime() <= Date.now() || meta.sync_status === 'rebuild_required' || (meta.recovery_state && meta.recovery_state.phase !== 'ready') ||
              String(meta.snapshot_scope) !== snapshot.sourceScope || String(meta.projection_scope) !== snapshot.sourceScope || String(meta.raw_scope) !== snapshot.sourceScope ||
              String(meta.snapshot_revision) !== snapshot.context.snapshotRevision || String(meta.block_hash).toLowerCase() !== snapshot.context.asOfBlockHash.toLowerCase())
            throw new ApiError(409, 'SNAPSHOT_INVALIDATED', 'Snapshot đã hết hạn hoặc bị invalidated.', {}, false, snapshot.context);
          const valid = await client.query(`SELECT 1 FROM api_read_snapshots WHERE snapshot_id=$1 AND expires_at>clock_timestamp() AND invalidated_at IS NULL`, [snapshot.id]);
          if (!valid.rowCount) throw new ApiError(409, 'SNAPSHOT_UNAVAILABLE', 'Snapshot đã hết hạn.');
          const found = await client.query('SELECT payload FROM api_read_proposals WHERE snapshot_id=$1 AND proposal_id=$2::numeric', [snapshot.id, query.get('proposalId')]);
          if (!found.rowCount) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Proposal không tồn tại tại snapshot H.', { proposalId: query.get('proposalId') }, false, snapshot.context);
          await client.query('COMMIT');
          send(res, 200, { context: snapshot.context, data: found.rows[0].payload }); return;
        } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
        finally { client.release(); }
      }
      send(res, 200, await page(options.pool, snapshot, endpoint, filters, limit, cursor, scope, options.cursorSecret));
    } catch (error) {
      if (error instanceof ApiError) { send(res, error.status, errorBody(error)); return; }
      send(res, 503, errorBody(new ApiError(503, 'DATA_NOT_READY', 'Dịch vụ dữ liệu hiện không khả dụng.', {}, true)));
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 12000;
  server.keepAliveTimeout = 5000;
  return server;
}
