import type { Pool, PoolClient } from 'pg';
import { scopeHash } from '../scope.js';
import { canonical, reconcile } from '../projection/chain.js';
import { IndexerError } from '../errors.js';
import type { RpcTransport } from '../rpc.js';
import type { IndexerConfig } from '../types.js';
import { deploymentScope, sameDeploymentScope } from './manifest.js';

export interface EventCoordinate {
  role: string;
  address: string;
  block: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
}

export interface NormalizedDataset {
  context: {
    chainId: string;
    scope: ReturnType<typeof deploymentScope>;
    atBlock: string;
    blockHash: string;
    blockTimestamp: string;
  };
  governanceConfig: Record<string, string>;
  proposals: Record<string, unknown>[];
  proposalStates: Record<string, unknown>[];
  votes: Record<string, unknown>[];
  operations: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  disbursements: Record<string, unknown>[];
  treasury: { totalIn: string; totalOut: string; balance: string };
  decodeWarnings: { event: EventCoordinate; status: string; code: string; abiVersion: string }[];
  ignoredAncillaryEvents: number;
}

export interface CompareMismatch {
  path: string;
  reference: unknown;
  rebuild: unknown;
}

export interface CompareReport {
  result: 'equal' | 'mismatch';
  requestedBlock: string;
  chainCrossCheck: {
    block: string;
    hash: string;
    reference: 'PASS';
    rebuild: 'PASS';
    proposals: number;
    operations: number;
    treasuryBalance: string;
  } | null;
  mismatches: CompareMismatch[];
  reference: NormalizedDataset | null;
  rebuild: NormalizedDataset | null;
}

type QueryRow = Record<string, any>;

function fail(code: string, message: string): never {
  throw new IndexerError(code, message);
}

function expectedScope(config: IndexerConfig): ReturnType<typeof deploymentScope> {
  return deploymentScope(config);
}

async function selectDeployment(client: PoolClient, config: IndexerConfig): Promise<{
  deploymentId: string;
  governanceConfig: Record<string, unknown>;
  confirmationDepth: number;
}> {
  const result = await client.query<QueryRow>(`SELECT d.deployment_id::text,d.governance_config,d.confirmation_depth,
    c.contract_role,c.contract_address,c.deployment_block::text,c.abi_version
    FROM deployments d LEFT JOIN deployment_contracts c ON c.deployment_id=d.deployment_id
      AND c.contract_role IN ('governor','timelock','treasury','budget_token')
    WHERE d.chain_id=$1 ORDER BY d.deployment_id,c.contract_role`, [config.chainId.toString()]);
  const groups = new Map<string, QueryRow[]>();
  for (const row of result.rows) {
    const group = groups.get(row.deployment_id) ?? [];
    group.push(row);
    groups.set(row.deployment_id, group);
  }
  const expected = expectedScope(config);
  const matches: { deploymentId: string; governanceConfig: Record<string, unknown>; confirmationDepth: number }[] = [];
  for (const [deploymentId, rows] of groups) {
    const contracts = rows.filter((row) => row.contract_role).map((row) => ({
      role: String(row.contract_role), address: String(row.contract_address).toLowerCase(),
      deploymentBlock: String(row.deployment_block), abiVersion: String(row.abi_version),
    })).sort((a, b) => a.role.localeCompare(b.role));
    if (!sameDeploymentScope({ chainId: config.chainId.toString(), contracts }, expected)) continue;
    const row = rows[0]!;
    matches.push({ deploymentId, governanceConfig: row.governance_config as Record<string, unknown>,
      confirmationDepth: Number(row.confirmation_depth) });
  }
  if (matches.length === 0) fail('BE06_SCOPE_MISMATCH', 'Reference/target has no deployment with the exact manifest contract scope.');
  if (matches.length > 1) fail('BE06_SCOPE_AMBIGUOUS', 'More than one deployment matches this chain and contract scope.');
  const found = matches[0]!;
  if (found.confirmationDepth !== (config.confirmations ?? 2)) {
    fail('BE06_SCOPE_MISMATCH', 'Deployment confirmation depth differs from the verified manifest.');
  }
  return found;
}

function governanceFields(value: Record<string, unknown>): Record<string, string> {
  const keys = ['proposalThreshold','quorumNumerator','quorumDenominator','votingDelay','votingPeriod',
    'minDelay','clockMode','govSupply','budSupply'];
  const result: Record<string, string> = {};
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== 'string' || (key !== 'clockMode' && !/^(0|[1-9][0-9]*)$/.test(field))) {
      fail('BE06_METADATA_MISMATCH', `Deployment metadata is missing verified chain field ${key}.`);
    }
    result[key] = field;
  }
  return result;
}

function coordinate(row: QueryRow | undefined, field: string): EventCoordinate | null {
  if (!row) return null;
  return {
    role: String(row[`${field}_role`]), address: String(row[`${field}_address`]).toLowerCase(),
    block: String(row[`${field}_block`]), blockHash: String(row[`${field}_hash`]).toLowerCase(),
    transactionHash: String(row[`${field}_tx`]).toLowerCase(),
    transactionIndex: String(row[`${field}_tx_index`]), logIndex: String(row[`${field}_log_index`]),
  };
}

function hexBytes(value: Buffer | Uint8Array | string): string {
  if (typeof value === 'string') return `0x${Buffer.from(value, 'binary').toString('hex')}`;
  return `0x${Buffer.from(value).toString('hex')}`;
}

async function rawCoordinateMap(client: PoolClient, deploymentId: string, at: string): Promise<Map<string, QueryRow>> {
  const result = await client.query<QueryRow>(`SELECT r.raw_event_id::text,
    r.contract_role AS e_role,r.contract_address AS e_address,r.block_number::text AS e_block,
    r.block_hash AS e_hash,r.transaction_hash AS e_tx,r.transaction_index::text AS e_tx_index,r.log_index::text AS e_log_index
    FROM raw_events r WHERE r.deployment_id=$1 AND r.block_number<=$2`, [deploymentId, at]);
  return new Map(result.rows.map((row) => [String(row.raw_event_id), row]));
}

function eventAt(events: Map<string, QueryRow>, id: string | null, field = 'e'): EventCoordinate | null {
  if (id === null) return null;
  const row = events.get(id);
  if (!row) fail('BE06_PUBLICATION_INVALID', `Projection event link ${id} is missing at H.`);
  return coordinate(row, field);
}

async function exportWithin(client: PoolClient, config: IndexerConfig, at: string): Promise<NormalizedDataset> {
  const deployment = await selectDeployment(client, config);
  const internalConfig = { ...config, deploymentId: deployment.deploymentId };
  const raw = await client.query<QueryRow>(`SELECT trunc(block_number)::text AS block_number,block_hash,
      confirmation_depth,source_scope,sync_status
    FROM checkpoints WHERE deployment_id=$1`, [deployment.deploymentId]);
  if (raw.rowCount !== 1 || raw.rows[0]!.sync_status === 'rebuild_required'
      || Number(raw.rows[0]!.confirmation_depth) !== (config.confirmations ?? 2)
      || raw.rows[0]!.source_scope !== scopeHash(internalConfig)) {
    fail('BE06_SOURCE_CHECKPOINT_INVALID', 'Raw checkpoint scope/K is absent, incomplete or does not match the manifest.');
  }
  const publication = await client.query<QueryRow>(`SELECT trunc(p.block_number)::text AS block_number,p.block_hash,
      p.source_scope,p.ignored_ancillary_events,b.block_timestamp::text AS block_timestamp
    FROM projection_checkpoints p JOIN indexed_blocks b USING (deployment_id,block_number,block_hash)
    WHERE p.deployment_id=$1`, [deployment.deploymentId]);
  if (publication.rowCount !== 1) fail('BE06_REFERENCE_PUBLICATION_MISSING', 'Database has no BE04 projection publication.');
  const published = publication.rows[0]!;
  if (published.block_number !== at) {
    fail('BE06_REFERENCE_H_MISMATCH', `Latest BE04 publication is H=${published.block_number}; requested H=${at}. A newer projection cannot be filtered to simulate history.`);
  }
  if (BigInt(raw.rows[0]!.block_number) < BigInt(at) || published.source_scope !== scopeHash(internalConfig)) {
    fail('BE06_SOURCE_CHECKPOINT_INVALID', 'Publication H is beyond raw checkpoint or its source scope differs.');
  }
  const header = await client.query<QueryRow>(`SELECT block_hash,block_timestamp::text FROM indexed_blocks
    WHERE deployment_id=$1 AND block_number=$2`, [deployment.deploymentId, at]);
  if (header.rowCount !== 1 || header.rows[0]!.block_hash !== published.block_hash
      || header.rows[0]!.block_timestamp !== published.block_timestamp) {
    fail('BE06_PUBLICATION_INVALID', 'Published H/hash/timestamp is not backed by its indexed block header.');
  }
  const events = await rawCoordinateMap(client, deployment.deploymentId, at);
  const coordJoin = `r.contract_role AS e_role,r.contract_address AS e_address,r.block_number::text AS e_block,
      r.block_hash AS e_hash,r.transaction_hash AS e_tx,r.transaction_index::text AS e_tx_index,r.log_index::text AS e_log_index`;

  const proposalRows = await client.query<QueryRow>(`SELECT p.proposal_id::text,p.request_id,p.proposer,p.treasury_address,
      p.recipient,p.amount::text,p.description_bytes,p.description,p.description_hash,p.targets::text[] AS targets,
      p.native_values::text[] AS native_values,p.calldatas::text[] AS calldatas,
      p.snapshot::text,p.deadline::text,p.created_event_id::text,p.canceled_event_id::text,p.executed_event_id::text,
      ${coordJoin.replaceAll('r.', 'created.')}
    FROM proposals p JOIN raw_events created ON created.deployment_id=p.deployment_id AND created.raw_event_id=p.created_event_id
    WHERE p.deployment_id=$1 ORDER BY p.proposal_id`, [deployment.deploymentId]);
  const proposals = proposalRows.rows.map((row) => ({
    proposalId: String(row.proposal_id), requestId: String(row.request_id).toLowerCase(), proposer: String(row.proposer).toLowerCase(),
    treasuryAddress: String(row.treasury_address).toLowerCase(), recipient: String(row.recipient).toLowerCase(), amount: String(row.amount),
    descriptionBytes: hexBytes(row.description_bytes), descriptionText: row.description === null ? null : String(row.description),
    descriptionHash: String(row.description_hash).toLowerCase(), targets: row.targets.map((v: string) => v.toLowerCase()),
    nativeValues: row.native_values.map(String), calldatas: row.calldatas.map((v: string) => v.toLowerCase()),
    snapshot: String(row.snapshot), deadline: String(row.deadline),
    createdEvent: coordinate(row, 'e'), canceledEvent: eventAt(events, row.canceled_event_id),
    executedEvent: eventAt(events, row.executed_event_id),
  }));

  const stateRows = await client.query<QueryRow>(`SELECT proposal_id::text,state,against_votes::text,for_votes::text,
    abstain_votes::text,quorum::text,operation_status FROM proposal_states WHERE deployment_id=$1 ORDER BY proposal_id`,
  [deployment.deploymentId]);
  const proposalStates = stateRows.rows.map((row) => ({ proposalId: String(row.proposal_id), state: String(row.state),
    againstVotes: String(row.against_votes), forVotes: String(row.for_votes), abstainVotes: String(row.abstain_votes),
    quorum: row.quorum === null ? null : String(row.quorum), operationStatus: row.operation_status === null ? null : String(row.operation_status) }));

  const voteRows = await client.query<QueryRow>(`SELECT v.proposal_id::text,v.voter,v.support,v.weight::text,v.reason,v.params,
      ${coordJoin.replaceAll('r.', 'e.')}
    FROM votes v JOIN raw_events e ON e.deployment_id=v.deployment_id AND e.raw_event_id=v.source_event_id
    WHERE v.deployment_id=$1 ORDER BY v.proposal_id,v.voter`, [deployment.deploymentId]);
  const votes = voteRows.rows.map((row) => ({ proposalId: String(row.proposal_id), voter: String(row.voter).toLowerCase(),
    support: Number(row.support), weight: String(row.weight), reason: String(row.reason), params: String(row.params).toLowerCase(),
    event: coordinate(row, 'e') }));

  const operationRows = await client.query<QueryRow>(`SELECT o.operation_id,o.proposal_id::text,o.predecessor,o.salt,
      o.queued_at::text,o.eta::text,o.queued_event_id::text,o.scheduled_event_id::text,
      o.executed_event_id::text,o.canceled_event_id::text
    FROM operations o WHERE o.deployment_id=$1 ORDER BY o.operation_id`, [deployment.deploymentId]);
  const operations = operationRows.rows.map((row) => ({ operationId: String(row.operation_id).toLowerCase(),
    proposalId: String(row.proposal_id), predecessor: String(row.predecessor).toLowerCase(), salt: String(row.salt).toLowerCase(),
    queuedAt: String(row.queued_at), eta: String(row.eta), queuedEvent: eventAt(events, row.queued_event_id),
    scheduledEvent: eventAt(events, row.scheduled_event_id), executedEvent: eventAt(events, row.executed_event_id),
    canceledEvent: eventAt(events, row.canceled_event_id) }));

  const transferRows = await client.query<QueryRow>(`SELECT t.token_address,t.treasury_address,t.from_address,t.to_address,
      t.amount::text,${coordJoin.replaceAll('r.', 'e.')}
    FROM transfers t JOIN raw_events e ON e.deployment_id=t.deployment_id AND e.raw_event_id=t.source_event_id
    WHERE t.deployment_id=$1 ORDER BY e.block_number,e.transaction_index,e.log_index`, [deployment.deploymentId]);
  const transfers = transferRows.rows.map((row) => ({ tokenAddress: String(row.token_address).toLowerCase(),
    treasuryAddress: String(row.treasury_address).toLowerCase(), from: String(row.from_address).toLowerCase(),
    to: String(row.to_address).toLowerCase(), amount: String(row.amount), event: coordinate(row, 'e') }));
  const transferByCoordinate = new Map(transfers.map((row) => [JSON.stringify(row.event), row.event]));

  const disbursementRows = await client.query<QueryRow>(`SELECT d.request_id,d.recipient,d.amount::text,d.proposal_id::text,d.operation_id,
      d.source_event_id::text,d.transfer_id::text,${coordJoin.replaceAll('r.', 'e.')},
      tr.contract_role AS transfer_role,tr.contract_address AS transfer_address,tr.block_number::text AS transfer_block,
      tr.block_hash AS transfer_hash,tr.transaction_hash AS transfer_tx,tr.transaction_index::text AS transfer_tx_index,
      tr.log_index::text AS transfer_log_index
    FROM disbursements d JOIN raw_events e ON e.deployment_id=d.deployment_id AND e.raw_event_id=d.source_event_id
    JOIN transfers t ON t.deployment_id=d.deployment_id AND t.transfer_id=d.transfer_id
    JOIN raw_events tr ON tr.deployment_id=t.deployment_id AND tr.raw_event_id=t.source_event_id
    WHERE d.deployment_id=$1 ORDER BY d.request_id`, [deployment.deploymentId]);
  const disbursements = disbursementRows.rows.map((row) => ({ requestId: String(row.request_id).toLowerCase(),
    recipient: String(row.recipient).toLowerCase(), amount: String(row.amount),
    proposalId: row.proposal_id === null ? null : String(row.proposal_id),
    operationId: row.operation_id === null ? null : String(row.operation_id).toLowerCase(), event: coordinate(row, 'e'),
    transferEvent: coordinate(row, 'transfer') }));
  // Keep this lookup as an integrity assertion: a Disbursement points at a
  // Transfer event, never a second source of Treasury flow.
  for (const item of disbursements) {
    if (!transferByCoordinate.has(JSON.stringify(item.transferEvent))) {
      fail('BE06_PUBLICATION_INVALID', 'BudgetDisbursed link does not identify a projected BUD Transfer.');
    }
  }

  const totals = await client.query<QueryRow>(`SELECT total_in::text,total_out::text,balance::text
    FROM treasury_totals WHERE deployment_id=$1`, [deployment.deploymentId]);
  const warnings = await client.query<QueryRow>(`SELECT ${coordJoin},r.decode_status,r.decode_error_code,
      c.abi_version
    FROM raw_events r JOIN deployment_contracts c USING (deployment_id,chain_id,contract_role,contract_address)
    JOIN indexed_blocks b USING (deployment_id,block_number,block_hash)
    WHERE r.deployment_id=$1 AND r.block_number<=$2 AND r.decode_status IS DISTINCT FROM 'decoded'
    ORDER BY r.block_number,r.transaction_index,r.log_index`, [deployment.deploymentId, at]);
  const ignored = Number(published.ignored_ancillary_events);
  const governanceConfig = governanceFields(deployment.governanceConfig);
  if (!totals.rows[0]) fail('BE06_PUBLICATION_INVALID', 'Treasury totals view has no row for deployment.');
  return {
    context: { chainId: config.chainId.toString(), scope: expectedScope(config), atBlock: at,
      blockHash: String(published.block_hash).toLowerCase(), blockTimestamp: String(published.block_timestamp) },
    governanceConfig,
    proposals,
    proposalStates,
    votes,
    operations,
    transfers,
    disbursements,
    treasury: { totalIn: String(totals.rows[0]!.total_in), totalOut: String(totals.rows[0]!.total_out), balance: String(totals.rows[0]!.balance) },
    decodeWarnings: warnings.rows.map((row) => ({ event: coordinate(row, 'e')!,
      status: String(row.decode_status ?? 'unclassified'), code: String(row.decode_error_code ?? 'UNCLASSIFIED_LEGACY'),
      abiVersion: String(row.abi_version) })),
    ignoredAncillaryEvents: ignored,
  };
}

export async function exportNormalizedDatabase(pool: Pool, config: IndexerConfig, atBlock: string): Promise<NormalizedDataset> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const dataset = await exportWithin(client, config, atBlock);
    await client.query('COMMIT');
    return dataset;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function normalizedDiff(reference: unknown, rebuild: unknown, path = ''): CompareMismatch[] {
  if (Object.is(reference, rebuild)) return [];
  if (Array.isArray(reference) && Array.isArray(rebuild)) {
    const identity = (value: unknown): string | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const row = value as Record<string, unknown>;
      const event = row.event && typeof row.event === 'object' && !Array.isArray(row.event)
        ? JSON.stringify(row.event) : null;
      if (typeof row.proposalId === 'string' && typeof row.voter === 'string') return `vote:${row.proposalId}:${row.voter}`;
      if (typeof row.operationId === 'string') return `operation:${row.operationId}`;
      if (typeof row.requestId === 'string' && event) return `disbursement:${row.requestId}:${event}`;
      if (typeof event === 'string') return `event:${event}`;
      if (typeof row.proposalId === 'string') return `proposal:${row.proposalId}`;
      return null;
    };
    const referenceKeys = reference.map(identity);
    const rebuildKeys = rebuild.map(identity);
    if (referenceKeys.every((key) => key !== null) && rebuildKeys.every((key) => key !== null)) {
      const a = new Map(referenceKeys.map((key, index) => [key!, reference[index]]));
      const b = new Map(rebuildKeys.map((key, index) => [key!, rebuild[index]]));
      const differences: CompareMismatch[] = [];
      for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
        const itemPath = `${path}[${key}]`;
        if (!a.has(key) || !b.has(key)) {
          differences.push({ path: itemPath, reference: a.has(key) ? a.get(key) : null,
            rebuild: b.has(key) ? b.get(key) : null });
        } else differences.push(...normalizedDiff(a.get(key), b.get(key), itemPath));
      }
      return differences;
    }
    const differences: CompareMismatch[] = [];
    if (reference.length !== rebuild.length) differences.push({ path: `${path}.length`, reference: reference.length, rebuild: rebuild.length });
    for (let index = 0; index < Math.min(reference.length, rebuild.length); index += 1) {
      differences.push(...normalizedDiff(reference[index], rebuild[index], `${path}[${index}]`));
    }
    return differences;
  }
  if (reference && rebuild && typeof reference === 'object' && typeof rebuild === 'object'
      && !Array.isArray(reference) && !Array.isArray(rebuild)) {
    const a = reference as Record<string, unknown>;
    const b = rebuild as Record<string, unknown>;
    const differences: CompareMismatch[] = [];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      differences.push(...normalizedDiff(a[key], b[key], path ? `${path}.${key}` : key));
    }
    return differences;
  }
  return [{ path, reference, rebuild }];
}

function modelFromDataset(dataset: NormalizedDataset): Parameters<typeof reconcile>[4] {
  const states = new Map(dataset.proposalStates.map((row) => [String(row.proposalId), row]));
  const operations = new Map(dataset.operations.map((row) => [String(row.proposalId), row]));
  const proposals = dataset.proposals.map((row) => {
    const id = String(row.proposalId);
    const state = states.get(id);
    if (!state) fail('BE06_PUBLICATION_INVALID', `Proposal ${id} has no BE04 state row.`);
    const op = operations.get(id);
    const operation = op ? {
      id: String(op.operationId), eta: String(op.eta),
      executed: op.executedEvent === null ? undefined : {} as never,
      canceled: op.canceledEvent === null ? undefined : {} as never,
    } : undefined;
    return {
      id,
      snapshot: String(row.snapshot),
      deadline: String(row.deadline),
      canceled: row.canceledEvent === null ? undefined : {} as never,
      executed: row.executedEvent === null ? undefined : {} as never,
      votes: [BigInt(String(state.againstVotes)), BigInt(String(state.forVotes)), BigInt(String(state.abstainVotes))] as [bigint,bigint,bigint],
      operation,
    } as unknown as Parameters<typeof reconcile>[4]['proposals'][number];
  });
  return {
    proposals,
    votes: [], operations: [], transfers: [], disbursements: [],
    totalIn: BigInt(dataset.treasury.totalIn), totalOut: BigInt(dataset.treasury.totalOut),
    balance: BigInt(dataset.treasury.balance),
  };
}

export async function compareDatabases(options: {
  referencePool: Pool;
  rebuildPool: Pool;
  config: IndexerConfig;
  atBlock: string;
  rpc: RpcTransport;
}): Promise<CompareReport> {
  const [referenceResult, rebuildResult] = await Promise.allSettled([
    exportNormalizedDatabase(options.referencePool, options.config, options.atBlock),
    exportNormalizedDatabase(options.rebuildPool, options.config, options.atBlock),
  ]);
  const reference = referenceResult.status === 'fulfilled' ? referenceResult.value : null;
  const rebuild = rebuildResult.status === 'fulfilled' ? rebuildResult.value : null;
  const mismatches: CompareMismatch[] = [];
  if (!reference) mismatches.push({ path: 'reference', reference: 'published database at H', rebuild: {
    code: (referenceResult as PromiseRejectedResult).reason?.code ?? 'EXPORT_FAILED',
    error: (referenceResult as PromiseRejectedResult).reason?.message ?? 'Cannot export reference database.',
  } });
  if (!rebuild) mismatches.push({ path: 'rebuild', reference: 'rebuilt database at H', rebuild: {
    code: (rebuildResult as PromiseRejectedResult).reason?.code ?? 'EXPORT_FAILED',
    error: (rebuildResult as PromiseRejectedResult).reason?.message ?? 'Cannot export rebuilt database.',
  } });
  if (reference && rebuild) {
    mismatches.push(...normalizedDiff(reference, rebuild));
    const datasets: [string, NormalizedDataset][] = [['reference', reference], ['rebuild', rebuild]];
    for (const [label, dataset] of datasets) {
      try {
        if (!sameDeploymentScope(dataset.context.scope, expectedScope(options.config))) {
          fail('BE06_SCOPE_MISMATCH', 'Normalized export scope differs from manifest.');
        }
        if (dataset.context.atBlock !== options.atBlock) fail('BE06_H_MISMATCH', 'Normalized publication is not at requested H.');
        const chainStates = await reconcile(options.config, options.rpc, dataset.context.blockHash,
          BigInt(dataset.context.blockTimestamp), modelFromDataset(dataset));
        const publishedStates = new Map(dataset.proposalStates.map((state) => [String(state.proposalId), state]));
        for (const [proposalId, expected] of chainStates) {
          const published = publishedStates.get(proposalId);
          const actual = published ? {
            state: published.state,
            quorum: published.quorum === null ? null : String(published.quorum),
            operationStatus: published.operationStatus,
          } : null;
          const chainValue = { state: expected.state, quorum: expected.quorum?.toString() ?? null,
            operationStatus: expected.operationStatus };
          if (!published || JSON.stringify(actual) !== JSON.stringify(chainValue)) {
            mismatches.push({ path: `chain.${label}.proposalStates[proposal:${proposalId}]`,
              reference: chainValue, rebuild: actual });
          }
        }
      } catch (error) {
        mismatches.push({ path: `chain.${label}`, reference: 'reconciles at H/hash', rebuild: {
          code: (error as { code?: string }).code ?? 'CHAIN_RECONCILIATION_FAILED',
          error: error instanceof Error ? error.message : 'On-chain reconciliation failed.',
        } });
      }
    }
    try { await canonical(options.config, options.rpc, BigInt(options.atBlock), reference.context.blockHash); }
    catch (error) {
      mismatches.push({ path: 'chain.canonicalAfter', reference: reference.context.blockHash,
        rebuild: error instanceof Error ? error.message : 'H/hash changed after comparison.' });
    }
  }
  return {
    result: mismatches.length === 0 ? 'equal' : 'mismatch',
    requestedBlock: options.atBlock,
    chainCrossCheck: mismatches.some((item) => item.path.startsWith('chain.')) || !reference || !rebuild ? null : {
      block: options.atBlock,
      hash: reference.context.blockHash,
      reference: 'PASS', rebuild: 'PASS',
      proposals: reference.proposals.length,
      operations: reference.operations.length,
      treasuryBalance: reference.treasury.balance,
    },
    mismatches,
    reference,
    rebuild,
  };
}

export function compareError(code: string, message: string): IndexerError {
  return new IndexerError(code, message);
}
