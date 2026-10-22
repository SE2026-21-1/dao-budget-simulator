import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { Interface, ZeroAddress } from 'ethers';
import { parseConfig } from '../indexer/config.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { scan, ScanError } from '../indexer/scanner.ts';
import { PostgresStorage } from '../indexer/storage.ts';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const HEADERS_SQL = `SELECT block_number::text, block_hash, parent_hash, block_timestamp::text
  FROM indexed_blocks WHERE deployment_id = $1 ORDER BY indexed_blocks.block_number`;
const EVENTS_SQL = `SELECT chain_id::text, contract_role, contract_address, block_number::text, block_hash,
  transaction_hash, transaction_index::text, log_index::text, topics::text[] AS topics, data, removed,
  event_name, decoded_payload, rpc_log
  FROM raw_events WHERE deployment_id = $1 ORDER BY raw_events.block_number, raw_events.transaction_index, raw_events.log_index`;
const TOTALS_SQL = `SELECT
  COALESCE(sum((decoded_payload->>'value')::numeric) FILTER (WHERE contract_role = 'budget_token' AND event_name = 'Transfer' AND decoded_payload->>'to' = $2), 0)::text AS total_in,
  COALESCE(sum((decoded_payload->>'value')::numeric) FILTER (WHERE contract_role = 'budget_token' AND event_name = 'Transfer' AND decoded_payload->>'from' = $2), 0)::text AS total_out,
  COALESCE(sum((decoded_payload->>'amount')::numeric) FILTER (WHERE contract_role = 'treasury' AND event_name = 'BudgetDisbursed'), 0)::text AS payout_total
  FROM raw_events WHERE deployment_id = $1`;
const BALANCES_SQL = `WITH transfers AS (
  SELECT decoded_payload FROM raw_events WHERE deployment_id = $1 AND contract_role = 'budget_token' AND event_name = 'Transfer'
), changes AS (
  SELECT decoded_payload->>'to' AS address, (decoded_payload->>'value')::numeric AS amount FROM transfers
  UNION ALL
  SELECT decoded_payload->>'from', -(decoded_payload->>'value')::numeric FROM transfers
) SELECT address, sum(amount)::text AS balance FROM changes GROUP BY address ORDER BY address`;

// No caller DATABASE_URL/PG* settings can select the destination of this opt-in path.
export function storageSmokeEnvironment(env = process.env) {
  assert.equal(env.TV4_SMOKE_ISOLATED, '1', 'Database mode requires TV4_SMOKE_ISOLATED=1');
  return ['TV4_SMOKE_DATABASE_URL', 'TV4_SMOKE_REBUILD_DATABASE_URL'].map(name => {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} must be an explicit isolated PostgreSQL URL`); }
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), `${name}: PostgreSQL protocol required`);
    assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), `${name}: numeric loopback host required`);
    assert.ok(/^\/tv4_[a-z0-9_]+$/.test(url.pathname), `${name}: fresh database name must start with tv4_`);
    assert.ok(url.username && !url.search && !url.hash, `${name}: explicit user and no URL query/fragment required`);
    return url.href;
  });
}

async function requireEmptyOwned(pool) {
  const { rows: [identity] } = await pool.query(`SELECT current_database() AS database,
    host(inet_server_addr()) AS address, inet_server_port() AS port,
    current_setting('server_version') AS version,
    (SELECT pg_get_userbyid(datdba) = current_user FROM pg_database WHERE datname = current_database()) AS owned`);
  assert.equal(identity.owned, true, 'Disposable database must be owned by the connecting role');
  assert.match(identity.database, /^tv4_[a-z0-9_]+$/, 'Unexpected database destination');
  assert.ok(['127.0.0.1', '::1'].includes(identity.address), 'Actual PostgreSQL server must be loopback');
  const { rows: [lock] } = await pool.query('SELECT pg_try_advisory_lock(747004, 1) AS acquired');
  assert.equal(lock.acquired, true, 'Another smoke owns this database');
  const { rows: [objects] } = await pool.query(`SELECT
    (SELECT count(*) FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname !~ '^pg_')::int AS schemas,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public')::int AS relations,
    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public')::int AS types,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')::int AS functions,
    (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')::int AS extensions,
    (SELECT count(*) FROM pg_largeobject_metadata)::int AS large_objects`);
  assert.deepEqual(objects, { schemas: 0, relations: 0, types: 0, functions: 0, extensions: 0, large_objects: 0 },
    'Refusing nonempty database; no tables/schemas are dropped');
  return identity;
}

async function migrateAndSeed(pool, migration, manifest, contracts, fromBlock) {
  await pool.query(migration);
  const { rows: [deployment] } = await pool.query(`INSERT INTO deployments
    (chain_id, deployment_name, deployment_block, abi_version, governance_config, confirmation_depth)
    VALUES ($1, 'tv4-live-governance', $2, 'tv4-manifest-four-role-raw-v1', $3::jsonb, 0) RETURNING deployment_id::text`,
  [manifest.chainId, String(fromBlock), JSON.stringify(manifest.config ?? {})]);
  for (const contract of contracts) {
    await pool.query(`INSERT INTO deployment_contracts
      (deployment_id, chain_id, contract_role, contract_address, deployment_block, abi_version)
      VALUES ($1, $2, $3, $4, $5, $6)`,
    [deployment.deployment_id, manifest.chainId, contract.role, contract.address, String(contract.deploymentBlock), contract.abiVersion]);
  }
  return deployment.deployment_id;
}

async function snapshot(pool, deploymentId) {
  const headers = (await pool.query(HEADERS_SQL, [deploymentId])).rows;
  const events = (await pool.query(EVENTS_SQL, [deploymentId])).rows;
  return { headers, events, digest: sha(canonical({ headers, events })) };
}

function expectedSnapshot(batch) {
  const headers = batch.blocks.map(block => ({ block_number: String(block.number), block_hash: block.hash,
    parent_hash: block.parentHash, block_timestamp: String(block.timestamp) }));
  const events = batch.logs.map(({ log, decode }) => ({ chain_id: '31337', contract_role: log.contract.role,
    contract_address: log.contract.address, block_number: String(log.blockNumber), block_hash: log.blockHash,
    transaction_hash: log.transactionHash, transaction_index: String(log.transactionIndex), log_index: String(log.logIndex),
    topics: log.topics, data: log.data, removed: false, event_name: decode.status === 'decoded' ? decode.eventName : null,
    decoded_payload: decode.status === 'decoded' ? decode.payload : null, rpc_log: log.rawLog }));
  return { headers, events, digest: sha(canonical({ headers, events })) };
}

function checkScan(result, expectedLogs) {
  const unknown = expectedLogs.filter(item => item.decode.status === 'unknown_topic').length;
  assert.equal(expectedLogs.filter(item => item.decode.status === 'decode_error').length, 0, 'Live decode errors are not expected');
  assert.equal(result.status, unknown ? 'completed_with_decode_issues' : 'completed');
  assert.equal(result.committedBatches.reduce((sum, batch) => sum + batch.unknownTopics, 0), unknown);
  for (const batch of result.committedBatches) {
    assert.equal(batch.decodeErrors, 0);
    assert.equal(batch.discardedOutsideDeployment, 0);
    assert.ok(batch.issues.every(issue => issue.code === 'UNKNOWN_TOPIC'), 'Only known unsupported initialization topics may produce exit 2');
  }
}

async function cliScan({ root, directory, connectionString, input, expectedLogs, label }) {
  const path = join(directory, `${label}.json`);
  await writeFile(path, JSON.stringify(input));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') &&
    !['DATABASE_URL', 'RPC_URL', 'TV4_SMOKE_DATABASE_URL', 'TV4_SMOKE_REBUILD_DATABASE_URL', 'NODE_OPTIONS'].includes(key)));
  env.DATABASE_URL = connectionString;
  env.PGOPTIONS = '-c search_path=public';
  let stdout = '', stderr = '';
  const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'indexer/cli.ts'), '--config', path],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
  let code;
  try {
    code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
  } finally { clearTimeout(timer); }
  // Never forward child stderr: it is not a credential-safe evidence boundary.
  assert.equal(stderr, '', `${label}: CLI wrote stderr`);
  const records = stdout.trim().split('\n').map(line => JSON.parse(line));
  const result = records.at(-1);
  assert.equal(result.type, 'scan_result', `${label}: CLI did not report its final state`);
  checkScan(result, expectedLogs);
  const expectedExit = result.status === 'completed' ? 0 : 2;
  assert.equal(code, expectedExit, `${label}: wrong CLI exit status`);
  assert.equal(records.filter(item => item.type === 'batch_committed').length, result.committedBatches.length);
  return { exitCode: code, report: result };
}

async function ledger(pool, deploymentId, treasury, expected, readBalance, readSupply) {
  const { rows: [totals] } = await pool.query(TOTALS_SQL, [deploymentId, treasury]);
  assert.deepEqual(totals, { total_in: expected.totalIn, total_out: expected.totalOut, payout_total: expected.payoutTotal });
  const payments = (await pool.query(`SELECT decoded_payload->>'requestId' AS request_id FROM raw_events
    WHERE deployment_id = $1 AND contract_role = 'treasury' AND event_name = 'BudgetDisbursed' ORDER BY request_id`, [deploymentId])).rows.map(row => row.request_id);
  assert.deepEqual(payments, [...expected.paidRequestIds].sort());
  assert.equal(new Set(payments).size, payments.length);
  const balances = (await pool.query(BALANCES_SQL, [deploymentId])).rows;
  for (const item of balances.filter(item => item.address !== ZeroAddress)) {
    assert.equal(item.balance, String(await readBalance(item.address)), 'SQL replay balance differs from chain at H');
  }
  const supply = -BigInt(balances.find(item => item.address === ZeroAddress)?.balance ?? '0');
  assert.equal(String(supply), String(await readSupply()), 'SQL replay supply differs from chain at H');
  return { ...totals, paidRequestIds: payments, balances: balances.filter(item => item.address !== ZeroAddress), totalSupply: String(supply) };
}

export async function governanceStorageSmoke({ root, urls, manifest, abis, config, batch, head, chainLedger, readBalance, readSupply }) {
  const pools = urls.map(connectionString => new pg.Pool({ connectionString, max: 1,
    options: '-c search_path=public', connectionTimeoutMillis: 10_000, idleTimeoutMillis: 0 }));
  let directory;
  let phase = 'isolated_empty_database_guards';
  try {
    const identities = [];
    for (const pool of pools) identities.push(await requireEmptyOwned(pool));
    assert.notEqual(`${identities[0].address}:${identities[0].port}/${identities[0].database}`,
      `${identities[1].address}:${identities[1].port}/${identities[1].database}`, 'Source and rebuild must be different fresh databases');
    // Also reject IPv4/IPv6 aliases of the same local instance/database.
    assert.notEqual(`${identities[0].port}/${identities[0].database}`, `${identities[1].port}/${identities[1].database}`,
      'Source and rebuild database names must differ on the same local port');
    directory = await mkdtemp(join(tmpdir(), 'tv4-governance-storage-'));
    const sourceHashes = {};
    for (const path of ['scripts/governance_storage.mjs', 'scripts/smoke_governance.mjs', 'indexer/config.ts', 'indexer/rpc.ts', 'indexer/reader.ts',
      'indexer/scanner.ts', 'indexer/storage.ts', 'indexer/cli.ts', 'indexer/decoder.ts', 'indexer/abi-registry.ts', 'database/migrations/001_initial.sql', 'package-lock.json']) {
      sourceHashes[path] = sha(await readFile(join(root, path)));
    }
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    const result = {
      scope: 'Actual HttpRpc -> BE02 scanner -> PostgresStorage -> SQL, CLI process restart and second fresh database raw replay at canonical H. No FR15 full projection/state reconstruction, TC11 checkpoints/resume/reorg, production API or frontend E2E acceptance.',
      isolation: 'Explicit --database and TV4_SMOKE_ISOLATED=1; two owned empty numeric-loopback databases; no existing schema/data dropped; caller DATABASE_URL/RPC_URL ignored.',
      versions: { node: process.version, postgres: identities.map(item => item.version), pg: lock.packages['node_modules/pg'].version, tsx: lock.packages['node_modules/tsx'].version },
      sourceHashes, fromBlock: String(config.fromBlock), toBlock: String(config.toBlock), blockHash: head.hash,
      semanticDigest: { algorithm: 'sha256', canonicalization: 'Sorted SQL numeric chain order, recursively sorted JSON object keys. Excludes generated IDs, deployment IDs and wall-clock timestamps.',
        queryHashes: { headers: sha(HEADERS_SQL), events: sha(EVENTS_SQL), totals: sha(TOTALS_SQL), balances: sha(BALANCES_SQL) } }, phases: [],
    };
    const migration = await readFile(join(root, 'database/migrations/001_initial.sql'), 'utf8');
    phase = 'real_migration_and_manifest_metadata';
    const deploymentIds = [];
    for (const pool of pools) deploymentIds.push(await migrateAndSeed(pool, migration, manifest, config.contracts, config.fromBlock));
    result.phases.push({ phase, state: 'passed', deploymentIds, metadataRoles: config.contracts.map(item => item.role) });
    const midpoint = config.fromBlock + (config.toBlock - config.fromBlock) / 2n;
    assert.ok(config.toBlock - midpoint >= 2n, 'Rollback needs two remaining headers');
    const input = (id, from, to) => ({ rpcUrl: config.rpcUrl, chainId: String(config.chainId), deploymentId: id,
      fromBlock: String(from), toBlock: String(to), batchSize: '20', contracts: config.contracts.map(item => ({ ...item, deploymentBlock: String(item.deploymentBlock) })) });
    const first = parseConfig(input(deploymentIds[0], config.fromBlock, midpoint), {});
    const full = parseConfig(input(deploymentIds[0], config.fromBlock, config.toBlock), {});
    const rpc = new HttpRpc(config.rpcUrl);
    const storage = new PostgresStorage(pools[0]);
    phase = 'scanner_first_finite_half';
    const firstReport = await scan(first, rpc, storage);
    checkScan(firstReport, batch.logs.filter(item => item.log.blockNumber <= midpoint));
    const prior = await snapshot(pools[0], deploymentIds[0]);
    result.phases.push({ phase, state: 'passed', report: firstReport, digest: prior.digest });

    phase = 'forced_mid_batch_sql_failure_rollback';
    // Fail the SECOND new header, after the first header INSERT has executed.
    // Only our just-created disposable DB receives this temporary trigger.
    const failAt = midpoint + 2n;
    await pools[0].query(`CREATE FUNCTION tv4_smoke_fail_header() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.block_number = ${failAt} THEN RAISE EXCEPTION 'TV4 intentional batch failure' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER tv4_smoke_fail_header BEFORE INSERT ON indexed_blocks FOR EACH ROW EXECUTE FUNCTION tv4_smoke_fail_header()`);
    let failure;
    try {
      try { await scan(parseConfig(input(deploymentIds[0], midpoint + 1n, config.toBlock), {}), rpc, storage); }
      catch (error) { failure = error; }
      assert.ok(failure instanceof ScanError, 'Expected real scanner/storage failure');
      assert.equal(failure.report.error.code, 'STORAGE_DATABASE_ERROR');
      assert.equal(failure.report.committedBatches.length, 0);
      assert.deepEqual(await snapshot(pools[0], deploymentIds[0]), prior, 'Failed batch changed prior semantic data');
    } finally {
      await pools[0].query('DROP TRIGGER tv4_smoke_fail_header ON indexed_blocks; DROP FUNCTION tv4_smoke_fail_header()');
    }
    result.phases.push({ phase, state: 'passed', failureCode: failure.report.error.code,
      failedAtBlock: String(failAt), committedPriorBatches: firstReport.committedBatches.length, priorDigest: prior.digest,
      scope: 'Real PostgreSQL trigger raises on second header INSERT; failed batch rolls back, prior finite batches unchanged.' });

    phase = 'cli_remaining_fixed_range';
    const continuation = await cliScan({ root, directory, connectionString: urls[0],
      input: input(deploymentIds[0], midpoint + 1n, config.toBlock), expectedLogs: batch.logs.filter(item => item.log.blockNumber > midpoint), label: 'remaining' });
    result.phases.push({ phase, state: 'passed', ...continuation,
      scope: 'Explicit finite range across process boundary, not checkpoint discovery/resume.' });
    phase = 'sql_exact_headers_and_raw_payloads';
    const expected = expectedSnapshot(batch);
    const stored = await snapshot(pools[0], deploymentIds[0]);
    assert.deepEqual(stored, expected, 'SQL semantic data must exactly equal live canonical reader output');
    const unknown = batch.logs.filter(item => item.decode.status === 'unknown_topic');
    assert.ok(unknown.length > 0, 'Expected actual unsupported initialization topics retained raw');
    result.phases.push({ phase, state: 'passed', digest: stored.digest });
    phase = 'sql_same_h_ledger';
    const sqlLedger = await ledger(pools[0], deploymentIds[0], manifest.contracts.Treasury.address.toLowerCase(), chainLedger, readBalance, readSupply);
    result.phases.push({ phase, state: 'passed' });
    result.counts = { headers: stored.headers.length, rawLogs: stored.events.length,
      decoded: stored.events.filter(item => item.event_name !== null).length, unknownTopics: unknown.length, decodeErrors: 0 };
    result.unknownTopicCounts = Object.fromEntries([...new Set(unknown.map(item => item.log.topics[0]))].sort().map(topic =>
      [topic, unknown.filter(item => item.log.topics[0] === topic).length]));
    phase = 'known_unknown_topic_full_abi_provenance';
    const roleNames = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
    result.knownUnsupportedEvents = [...new Set(unknown.map(({ log }) => {
      const name = roleNames[log.contract.role];
      const event = new Interface(abis[name]).parseLog(log.rawLog);
      assert.ok(event, 'Unsupported topic must still be known in the deployed full contract ABI');
      return `${name}.${event.name}`;
    }))].sort();
    result.ledger = sqlLedger;
    result.semanticDigest.canonical = stored.digest;
    result.phases.push({ phase, state: 'passed', digest: stored.digest });

    phase = 'scanner_full_rerun_idempotent';
    const rerun = await scan(full, rpc, storage);
    checkScan(rerun, batch.logs);
    assert.ok(rerun.committedBatches.every(item => item.insertedBlocks === 0 && item.insertedEvents === 0));
    assert.deepEqual(await snapshot(pools[0], deploymentIds[0]), stored);
    result.phases.push({ phase, state: 'passed', report: rerun, digest: stored.digest });
    phase = 'cli_new_process_full_rerun_idempotent';
    const restart = await cliScan({ root, directory, connectionString: urls[0], input: input(deploymentIds[0], config.fromBlock, config.toBlock), expectedLogs: batch.logs, label: 'restart' });
    assert.equal(restart.exitCode, 2, 'Unknown initialization topics must produce CLI exit 2');
    assert.ok(restart.report.committedBatches.every(item => item.insertedBlocks === 0 && item.insertedEvents === 0));
    assert.deepEqual(await snapshot(pools[0], deploymentIds[0]), stored);
    result.phases.push({ phase, state: 'passed', ...restart, digest: stored.digest });

    phase = 'second_fresh_database_raw_replay';
    const replay = await cliScan({ root, directory, connectionString: urls[1], input: input(deploymentIds[1], config.fromBlock, config.toBlock), expectedLogs: batch.logs, label: 'rebuild' });
    const rebuilt = await snapshot(pools[1], deploymentIds[1]);
    assert.deepEqual(rebuilt, stored, 'Second fresh database raw replay differs');
    assert.deepEqual(await ledger(pools[1], deploymentIds[1], manifest.contracts.Treasury.address.toLowerCase(), chainLedger, readBalance, readSupply), sqlLedger);
    const finalHead = await rpc.call('eth_getBlockByNumber', [head.number, false]);
    assert.equal(finalHead.hash, head.hash, 'Canonical H changed during database verification');
    result.semanticDigest.rebuild = rebuilt.digest;
    result.phases.push({ phase, state: 'passed', ...replay, digest: rebuilt.digest,
      scope: 'Raw headers/events replay into a second fresh database only; production projections remain unimplemented.' });
    result.state = 'passed';
    return result;
  } catch (error) {
    // PostgreSQL and child errors can contain connection strings. Keep failures
    // actionable by phase/classification without echoing messages or URL inputs.
    const code = error instanceof ScanError ? error.report.error?.code
      : typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERROR';
    const safeGuardMessages = new Set([
      'Disposable database must be owned by the connecting role', 'Unexpected database destination',
      'Actual PostgreSQL server must be loopback', 'Another smoke owns this database',
      'Refusing nonempty database; no tables/schemas are dropped',
      'Source and rebuild must be different fresh databases',
      'Source and rebuild database names must differ on the same local port',
    ]);
    const assertionMessage = code === 'ERR_ASSERTION' ? error.message.split('\n', 1)[0] : '';
    const detail = safeGuardMessages.has(assertionMessage) ? `: ${assertionMessage}` : '';
    throw new Error(`TV4 storage smoke failed in ${phase} (${code})${detail}; no database credentials are included.`);
  } finally {
    const cleanup = await Promise.allSettled(pools.map(pool => pool.end()));
    if (directory) await rm(directory, { recursive: true, force: true });
    if (cleanup.some(item => item.status === 'rejected')) throw new Error('TV4 storage smoke pool cleanup failed');
  }
}
