#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { validateRun } from './be09-metadata.mjs';
import { assertOwnedProcess } from './be09-safety.mjs';

const roles = { governor: 'oz-5.4.0-governor', timelock: 'oz-5.4.0-timelock',
  treasury: 'sc01-itreasury-v1', budget_token: 'oz-5.4.0-erc20', governance_token: 'sc02-governance-token-v1' };
const fields = ['govSupply', 'proposalThreshold', 'quorumNumerator', 'quorumDenominator', 'votingDelay', 'votingPeriod', 'minDelay'];
const max = (1n << 256n) - 1n;
const numeric = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= max;
const check = (pass, actual, expected) => ({ status: pass ? 'PASS' : 'FAIL', actual, expected });

export function assess(row, contractRows, config, runtime) {
  if (!row) return { deployment: check(false, null, 'matching chainId and deployment name') };
  const governance = row.governance_config ?? {};
  const governanceValid = fields.every(field => numeric(governance[field])) && governance.clockMode === 'mode=timestamp' &&
    BigInt(governance.quorumDenominator) > 0n && BigInt(governance.quorumNumerator) <= BigInt(governance.quorumDenominator);
  const contracts = Object.fromEntries(contractRows.map(item => [item.contract_role, item]));
  const roleChecks = Object.fromEntries(Object.entries(roles).map(([role, abi]) => {
    const item = contracts[role];
    return [role, check(!!item && item.abi_version === abi && row.projection_h !== null && BigInt(item.deployment_block) <= BigInt(row.projection_h),
      item ? { abiVersion: item.abi_version, deploymentBlock: item.deployment_block } : null,
      { abiVersion: abi, deploymentBlock: `<= ${row.projection_h ?? 'publication H'}` })];
  }));
  const prefix = (height, count) => height !== null && BigInt(count) === BigInt(height) - BigInt(row.deployment_block) + 1n;
  const recovery = row.recovery_state;
  return {
    scope: check(row.chain_id === runtime.chainId && row.deployment_name === runtime.deploymentName &&
      row.deployment_id === runtime.deploymentId && config.chainId === row.chain_id && config.deploymentId === row.deployment_id,
    { database: { id: row.deployment_id, chainId: row.chain_id, name: row.deployment_name }, worker: { id: config.deploymentId, chainId: config.chainId },
      api: { chainId: runtime.chainId, name: runtime.deploymentName } }, 'worker, API runtime and database refer to the same deployment'),
    rawCheckpoint: check(row.raw_h !== null, row.raw_h, 'present'),
    projectionCheckpoint: check(row.projection_h !== null, row.projection_h, 'present'),
    recovery: check(!recovery || recovery.phase === 'ready', recovery?.phase ?? null, 'null or ready'),
    syncStatus: check(row.raw_h !== null && row.sync_status !== 'rebuild_required', row.sync_status, 'checkpoint present and not rebuild_required'),
    sourceScope: check(row.raw_h !== null && row.projection_h !== null && row.raw_scope === row.projection_scope,
      { raw: row.raw_scope, projection: row.projection_scope }, 'equal'),
    revision: check(row.projection_h !== null && row.deployment_revision === row.projection_revision,
      { deployment: row.deployment_revision, projection: row.projection_revision }, 'equal'),
    heights: check(row.raw_h !== null && row.projection_h !== null && BigInt(row.raw_h) >= BigInt(row.projection_h),
      { raw: row.raw_h, publication: row.projection_h, head: row.raw_head, confirmations: row.confirmation_depth }, 'raw H >= publication H'),
    publicationHeader: check(row.projection_h !== null && row.projection_timestamp !== null,
      { block: row.projection_h, hash: row.projection_hash, timestamp: row.projection_timestamp }, 'matching H/hash header and timestamp present'),
    projectionPrefix: check(prefix(row.projection_h, row.projection_header_count),
      { from: row.deployment_block, to: row.projection_h, count: row.projection_header_count },
      row.projection_h === null ? 'publication checkpoint required' : (BigInt(row.projection_h) - BigInt(row.deployment_block) + 1n).toString()),
    rawPrefix: check(prefix(row.raw_h, row.raw_header_count),
      { from: row.deployment_block, to: row.raw_h, count: row.raw_header_count },
      row.raw_h === null ? 'raw checkpoint required' : (BigInt(row.raw_h) - BigInt(row.deployment_block) + 1n).toString()),
    governance: check(governanceValid, governance, 'uint256 decimal fields, valid quorum and timestamp clock'),
    roleCount: check(contractRows.length === Object.keys(roles).length, contractRows.length, 5),
    roles: roleChecks,
  };
}

async function identity(client) {
  const result = await client.query("SELECT current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port, (pg_control_system()).system_identifier::text AS system_id");
  return result.rows[0];
}

async function main() {
  const [runtimeDirArg, outputArg] = process.argv.slice(2);
  if (!runtimeDirArg || !outputArg || process.argv.length !== 4) throw new Error('Usage: be09-diagnose.mjs <runtime-dir> <output.json>');
  const dir = resolve(runtimeDirArg), output = resolve(outputArg);
  const root = resolve(new URL('..', import.meta.url).pathname);
  const { runtime, config, env } = await validateRun({
    root, stateRoot: process.env.BE09_STATE_ROOT ?? dirname(dirname(dir)), runDir: dir, scope: process.env.BE09_SCOPE,
  });
  const workerUrl = env.DATABASE_URL, apiUrl = env.DATABASE_URL;
  const override = process.env.BE09_DIAGNOSTIC_DATABASE_URL;
  const report = { format: 'dao-budget-be09-readiness-diagnostic-v1', runId: runtime.runId ?? null,
    databaseSource: 'validated private runtime databases', conditions: {}, responses: {} };
  report.conditions.configuredDatabase = check(!!workerUrl && workerUrl === apiUrl,
    { workerConfigured: !!workerUrl, apiConfigured: !!apiUrl, equal: !!workerUrl && workerUrl === apiUrl }, 'same configured database URL');
  let apiOwned = true;
  for (const route of ['health', 'summary']) {
    // Static URL/provenance equality cannot authenticate the current listener.
    // Recheck before EACH request; after a mismatch do not continue probing.
    if (apiOwned) {
      try { await assertOwnedProcess({ runDir: dir, label: 'api', port: Number(new URL(runtime.urls.api).port) }); }
      catch { apiOwned = false; }
    }
    if (!apiOwned) {
      report.responses[route] = { status: null, skipped: 'exact-run API process/listener ownership unavailable' };
      continue;
    }
    try {
      const url = new URL(`/api/${route}`, runtime.urls.api);
      url.searchParams.set('chainId', runtime.chainId); url.searchParams.set('deploymentId', runtime.deploymentName);
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      report.responses[route] = { status: response.status, body };
    } catch { report.responses[route] = { status: null, error: 'request failed or timed out' }; }
  }
  let api, worker;
  const databaseOwned = async () => {
    try {
      if (override !== undefined && override !== apiUrl) throw new Error('Database override differs from validated private allocation');
      await assertOwnedProcess({ runDir: dir, label: 'postgres', port: 55432 });
    } catch (error) {
      report.databaseDiagnostic = { status: 'SKIP', reason: 'private PostgreSQL ownership unavailable or database override differs from validated allocation' };
      throw error;
    }
  };
  try {
    await databaseOwned();
    report.databaseDiagnostic = { status: 'ATTEMPTED' };
    api = new pg.Client({ connectionString: apiUrl, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
    worker = new pg.Client({ connectionString: workerUrl, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
    await Promise.all([api, worker].map(async client => {
      await databaseOwned();
      await client.connect();
    }));
    const [apiIdentity, workerIdentity] = await Promise.all([identity(api), identity(worker)]);
    report.conditions.databaseIdentity = check(JSON.stringify(apiIdentity) === JSON.stringify(workerIdentity),
      { api: apiIdentity, worker: workerIdentity }, 'same PostgreSQL cluster and database');
    await api.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await api.query(`SELECT d.deployment_id::text,d.chain_id::text,d.deployment_name,d.deployment_block::text,
      d.snapshot_revision::text AS deployment_revision,d.governance_config,to_jsonb(d)->'indexer_state' AS recovery_state,
      p.block_number::text AS projection_h,p.block_hash AS projection_hash,p.source_scope AS projection_scope,
      p.snapshot_revision::text AS projection_revision,b.block_timestamp::text AS projection_timestamp,
      c.block_number::text AS raw_h,c.observed_head_block::text AS raw_head,c.confirmation_depth,c.sync_status,c.source_scope AS raw_scope,
      (SELECT count(*)::text FROM indexed_blocks i WHERE i.deployment_id=d.deployment_id AND i.block_number BETWEEN d.deployment_block AND p.block_number) AS projection_header_count,
      (SELECT count(*)::text FROM indexed_blocks i WHERE i.deployment_id=d.deployment_id AND i.block_number BETWEEN d.deployment_block AND c.block_number) AS raw_header_count
      FROM deployments d LEFT JOIN projection_checkpoints p ON p.deployment_id=d.deployment_id
      LEFT JOIN indexed_blocks b ON b.deployment_id=p.deployment_id AND b.block_number=p.block_number AND b.block_hash=p.block_hash
      LEFT JOIN checkpoints c ON c.deployment_id=d.deployment_id WHERE d.chain_id=$1::numeric AND d.deployment_name=$2`, [runtime.chainId, runtime.deploymentName]);
    const contractRows = result.rows.length ? (await api.query(`SELECT contract_role,abi_version,deployment_block::text FROM deployment_contracts
      WHERE deployment_id=$1 AND chain_id=$2`, [result.rows[0].deployment_id, runtime.chainId])).rows : [];
    Object.assign(report.conditions, assess(result.rows[0], contractRows, config, runtime));
    await api.query('COMMIT');
  } catch (error) {
    report.databaseError = { message: 'database connection or diagnostic query failed; conditions may be incomplete',
      code: typeof error?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null };
  } finally { await Promise.allSettled([api?.end(), worker?.end()]); }
  for (const name of ['databaseIdentity', 'scope', 'rawCheckpoint', 'projectionCheckpoint', 'recovery', 'syncStatus',
    'sourceScope', 'revision', 'heights', 'publicationHeader', 'projectionPrefix', 'rawPrefix', 'governance', 'roleCount', 'roles']) {
    report.conditions[name] ??= { status: 'UNKNOWN', actual: null, expected: 'database diagnostic completed' };
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(() => { console.error('BE09 readiness diagnostic failed; check runtime files and output path.'); process.exitCode = 1; });
