import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Interface } from 'ethers';
import pg from 'pg';
import { parseConfig } from '../../indexer/config.js';
import { readBatch } from '../../indexer/reader.js';
import { PostgresStorage, StorageError } from '../../indexer/storage.js';
import { sync, SyncError } from '../../indexer/syncer.js';
import type { IndexerConfig } from '../../indexer/types.js';
import { FixtureRpc, hash, rpcLog, serveRpc } from './helpers.js';

const databaseUrl = process.env.BE03_TEST_DATABASE_URL;
// Missing setup is a failure, never a green SKIP.
describe('BE03 isolated real PostgreSQL / child process crash and restart', () => {
  let pool: pg.Pool;
  let storage: PostgresStorage;
  let sequence = 0;
  before(async () => {
    assert.equal(process.env.BE03_TEST_ISOLATED, '1', 'Use npm run test:be03:db, never an existing DB.');
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'be03_test'); assert.equal(url.pathname, '/be03_test');
    pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    assert.equal((await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount, 0);
    await pool.query(await readFile(new URL('../../database/migrations/001_initial.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/tests/001_initial_checks.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/migrations/002_be03.sql', import.meta.url), 'utf8'));
    storage = new PostgresStorage(pool);
  });
  after(async () => { await pool?.end(); });

  async function fixture(k = 2) {
    const chainId = String(40_000 + ++sequence);
    const deployment = await pool.query(`INSERT INTO deployments (chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
      VALUES ($1,$2,100,'be03-synthetic','{}',$3) RETURNING deployment_id::text`, [chainId, `test-${sequence}`, k]);
    const c = parseConfig({ rpcUrl: 'http://127.0.0.1:8545', chainId, deploymentId: deployment.rows[0].deployment_id,
      fromBlock: '0', toBlock: 'latest', batchSize: '2', confirmations: k,
      contracts: [{ role: 'budget_token', address: '0x4444444444444444444444444444444444444444', deploymentBlock: '100', abiVersion: 'oz-5.4.0-erc20' },
        { role: 'governor', address: '0x1111111111111111111111111111111111111111', deploymentBlock: '102', abiVersion: 'oz-5.4.0-governor' }] }, {});
    for (const source of c.contracts) {
      await pool.query(`INSERT INTO deployment_contracts (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
        VALUES ($1,$2,$3,$4,$5,$6)`, [c.deploymentId, chainId, source.role, source.address, source.deploymentBlock.toString(), source.abiVersion]);
    }
    const rpc = new FixtureRpc(); rpc.chainId = '0x' + c.chainId.toString(16);
    return { c, rpc };
  }
  async function state(c: IndexerConfig) {
    const rows = await pool.query(`SELECT
      (SELECT count(*)::int FROM indexed_blocks WHERE deployment_id=$1) AS blocks,
      (SELECT count(*)::int FROM raw_events WHERE deployment_id=$1) AS events,
      (SELECT trunc(block_number)::text FROM checkpoints WHERE deployment_id=$1) AS checkpoint`, [c.deploymentId]);
    return rows.rows[0];
  }
  const errorCode = (code: string) => (e: unknown) => (e instanceof StorageError && e.code === code)
    || (e instanceof SyncError && e.report.error?.code === code);

  test('fresh deployment begins at 100; empty raw batches atomically checkpoint head-2; idle restart validates hash', async () => {
    const { c, rpc } = await fixture();
    assert.equal(await storage.loadCheckpoint(c), null);
    await sync(c, rpc, storage);
    assert.deepEqual(await state(c), { blocks: 4, events: 0, checkpoint: '103' });
    const cp = await pool.query('SELECT block_hash,observed_head_block::text,confirmation_depth,source_scope FROM checkpoints WHERE deployment_id=$1', [c.deploymentId]);
    assert.equal(cp.rows[0].block_hash, hash(103)); assert.equal(cp.rows[0].observed_head_block, '105');
    assert.equal(cp.rows[0].confirmation_depth, 2); assert.match(cp.rows[0].source_scope, /^0x[0-9a-f]{64}$/);
    rpc.head = 105n; rpc.calls = [];
    assert.equal((await sync(c, rpc, storage)).committedBatches, 0);
  });
  test('K=0 indexes head; no safe block leaves checkpoint absent', async () => {
    const zero = await fixture(0); await sync(zero.c, zero.rpc, storage);
    assert.equal((await state(zero.c)).checkpoint, '105');
    const none = await fixture(); none.rpc.head = 1n;
    await sync(none.c, none.rpc, storage);
    assert.deepEqual(await state(none.c), { blocks: 0, events: 0, checkpoint: null });
  });
  test('PostgreSQL distinguishes no checkpoint from a committed genesis checkpoint', async () => {
    const { c, rpc } = await fixture(); c.contracts[0]!.deploymentBlock = 0n;
    await pool.query('UPDATE deployments SET deployment_block=0 WHERE deployment_id=$1', [c.deploymentId]);
    await pool.query("UPDATE deployment_contracts SET deployment_block=0 WHERE deployment_id=$1 AND contract_role='budget_token'", [c.deploymentId]);
    rpc.head = 2n;
    rpc.override = (m, p) => m === 'eth_getBlockByNumber' && p[0] === '0x0'
      ? { number: '0x0', hash: hash(0), parentHash: hash(0), timestamp: '0x0', transactions: [] } : undefined;
    assert.equal(await storage.loadCheckpoint(c), null);
    await sync(c, rpc, storage);
    assert.deepEqual(await storage.loadCheckpoint(c), { number: 0n, hash: hash(0) });
    rpc.head = 3n;
    await sync(c, rpc, storage);
    assert.deepEqual(await state(c), { blocks: 2, events: 0, checkpoint: '1' });
  });
  test('missing required source or altered manifest/K refuses checkpoint adoption, including idle start', async () => {
    const { c, rpc } = await fixture(); await sync(c, rpc, storage);
    await assert.rejects(storage.loadCheckpoint({ ...c, contracts: c.contracts.slice(0, 1) }), errorCode('STORAGE_METADATA_MISMATCH'));
    await assert.rejects(storage.loadCheckpoint({ ...c, confirmations: 0 }), errorCode('STORAGE_METADATA_MISMATCH'));
    await pool.query(`UPDATE deployment_contracts SET deployment_block=103 WHERE deployment_id=$1 AND contract_role='governor'`, [c.deploymentId]);
    const changed = structuredClone(c); changed.contracts[1]!.deploymentBlock = 103n;
    await assert.rejects(storage.loadCheckpoint(changed), errorCode('CHECKPOINT_CONFLICT'));
    assert.equal((await state(c)).checkpoint, '103');
  });
  test('legacy unscoped checkpoint is refused', async () => {
    const { c, rpc } = await fixture(); await sync(c, rpc, storage);
    await pool.query('UPDATE checkpoints SET source_scope=NULL WHERE deployment_id=$1', [c.deploymentId]);
    await assert.rejects(storage.loadCheckpoint(c), errorCode('CHECKPOINT_CONFLICT'));
  });
  test('source failure and missing scan evidence never advance checkpoint', async () => {
    const { c, rpc } = await fixture();
    const batch = (await readBatch(c, rpc, 100n, 103n)).batch;
    batch.scannedSources!.pop();
    await assert.rejects(storage.writeCheckpointBatch(c, batch, null, 105n), errorCode('STORAGE_INVALID_BATCH'));
    rpc.override = (m, p) => { if (m === 'eth_getLogs' && (p[0] as { address: string }).address === c.contracts[1]!.address) throw new Error('source down'); };
    c.batchSize = 4n;
    await assert.rejects(sync(c, rpc, storage), SyncError);
    assert.deepEqual(await state(c), { blocks: 0, events: 0, checkpoint: null });
  });
  test('SQL failure after inserting a header and first event rolls back entire batch/checkpoint', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog(), rpcLog(100n, 1n, 1n)];
    const batch = (await readBatch(c, rpc, 100n, 101n)).batch;
    batch.logs[1]!.log.data = 'not-hex';
    await assert.rejects(storage.writeCheckpointBatch(c, batch, null, 105n), errorCode('STORAGE_DATABASE_ERROR'));
    assert.deepEqual(await state(c), { blocks: 0, events: 0, checkpoint: null });
    await sync(c, rpc, storage);
    assert.deepEqual(await state(c), { blocks: 4, events: 2, checkpoint: '103' });
  });
  test('COMMIT itself fails: no successful batch notification and no SQL data/checkpoint', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog()];
    await pool.query(`CREATE FUNCTION be03_test_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test deferred COMMIT failure'; END $$`);
    await pool.query(`CREATE CONSTRAINT TRIGGER be03_test_commit_failure AFTER INSERT OR UPDATE ON checkpoints
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION be03_test_commit_failure()`);
    let notified = false;
    try {
      await assert.rejects(sync(c, rpc, storage, () => { notified = true; }), errorCode('STORAGE_DATABASE_ERROR'));
      assert.equal(notified, false);
      assert.deepEqual(await state(c), { blocks: 0, events: 0, checkpoint: null });
    } finally {
      await pool.query('DROP TRIGGER be03_test_commit_failure ON checkpoints');
      await pool.query('DROP FUNCTION be03_test_commit_failure()');
    }
  });
  test('same event key changed contents is a conflict; prior committed range survives', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog()];
    const batch = (await readBatch(c, rpc, 100n, 101n)).batch;
    await storage.writeBatch(c, batch); // Existing BE02 finite scan, no checkpoint.
    rpc.logs[0]!.data = hash(77);
    await assert.rejects(sync(c, rpc, storage), errorCode('STORAGE_CONFLICT'));
    assert.deepEqual(await state(c), { blocks: 2, events: 1, checkpoint: null });
  });
  test('repeated range, retries and restart preserve event IDs and exact uint256 payload', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog(), rpcLog(103n)];
    const batch = (await readBatch(c, rpc, 100n, 101n)).batch;
    await storage.writeBatch(c, batch); await storage.writeBatch(c, batch);
    await sync(c, rpc, storage);
    const before = await pool.query('SELECT raw_event_id,decoded_payload,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY block_number', [c.deploymentId]);
    rpc.head = 105n; await sync(c, rpc, storage);
    const after = await pool.query('SELECT raw_event_id,decoded_payload,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY block_number', [c.deploymentId]);
    assert.deepEqual(before.rows, after.rows);
    assert.equal(before.rows[0].decoded_payload.value, ((1n << 255n) + 1n).toString());
    assert.deepEqual(await state(c), { blocks: 4, events: 2, checkpoint: '103' });
    await assert.rejects(storage.writeBatch(c, batch), errorCode('CHECKPOINT_CONFLICT'));
  });
  test('unavailable checkpoint RPC preserves committed data and does not refresh heartbeat', async () => {
    const { c, rpc } = await fixture(); await sync(c, rpc, storage); rpc.head = 105n;
    const before = await state(c);
    const heartbeat = (await pool.query('SELECT updated_at FROM checkpoints WHERE deployment_id=$1', [c.deploymentId])).rows[0].updated_at;
    rpc.override = (m) => m === 'eth_getBlockByNumber' ? null : undefined;
    await assert.rejects(sync(c, rpc, storage), SyncError);
    assert.deepEqual(await state(c), before);
    assert.deepEqual((await pool.query('SELECT updated_at FROM checkpoints WHERE deployment_id=$1', [c.deploymentId])).rows[0].updated_at, heartbeat);
  });
  test('reorg preserves prefix identity, replaces orphan logs and changes revision before replay', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog(100n), rpcLog(103n)];
    await sync(c, rpc, storage);
    const prefix = (await pool.query('SELECT raw_event_id FROM raw_events WHERE deployment_id=$1 AND block_number=100', [c.deploymentId])).rows[0].raw_event_id;
    const revision = (await pool.query('SELECT snapshot_revision FROM deployments WHERE deployment_id=$1', [c.deploymentId])).rows[0].snapshot_revision;
    const base = new FixtureRpc(); rpc.head = 105n;
    rpc.logs[1]!.blockHash = hash(1103);
    rpc.logs[1]!.data = hash(123);
    rpc.override = (m, p) => m === 'eth_getBlockByNumber' ? base.call(m, p).then(value => {
      const n = BigInt(p[0] as string);
      return n < 102n ? value : { ...(value as object), hash: hash(n + 1000n), parentHash: hash(n === 102n ? 101n : n + 999n) };
    }) : undefined;
    const result = await sync(c, rpc, storage);
    assert.deepEqual(result.reorg, { from: '103', ancestor: '101', replayFrom: '102' });
    assert.deepEqual(await state(c), { blocks: 4, events: 2, checkpoint: '103' });
    const rows = (await pool.query('SELECT raw_event_id,block_hash,data FROM raw_events WHERE deployment_id=$1 ORDER BY block_number', [c.deploymentId])).rows;
    assert.equal(rows[0].raw_event_id, prefix);
    assert.equal(rows[1].block_hash, hash(1103));
    assert.equal(rows[1].data, hash(123));
    assert.notEqual((await pool.query('SELECT snapshot_revision FROM deployments WHERE deployment_id=$1', [c.deploymentId])).rows[0].snapshot_revision, revision);
  });
  test('a failed rewind rolls back deletions but retains the previously committed serving barrier', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [rpcLog(103n)];
    await sync(c, rpc, storage);
    const cp = (await storage.loadCheckpoint(c))!;
    await storage.invalidate(c, cp, 'REORG_DETECTED');
    const before = await state(c);
    const failing = new PostgresStorage(pool, { beforeCommit: async () => { throw new Error('simulated crash'); } });
    await assert.rejects(failing.rewind(c, cp, { number: 101n, hash: hash(101) }), errorCode('STORAGE_DATABASE_ERROR'));
    assert.deepEqual(await state(c), before);
    assert.equal((await pool.query('SELECT sync_status FROM checkpoints WHERE deployment_id=$1', [c.deploymentId])).rows[0].sync_status, 'rebuild_required');
    await storage.rewind(c, cp, { number: 101n, hash: hash(101) });
    assert.deepEqual(await state(c), { blocks: 2, events: 0, checkpoint: '101' });
    rpc.head = 105n;
    await sync(c, rpc, storage);
    assert.deepEqual(await state(c), before);
  });
  test('competing writers cannot rewind or commit beyond complete coverage; stale writer must restart', { timeout: 10_000 }, async () => {
    const { c, rpc } = await fixture();
    const short = (await readBatch(c, rpc, 100n, 101n)).batch;
    const long = (await readBatch(c, rpc, 100n, 103n)).batch;
    let reached!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => { reached = r; });
    const gate = new Promise<void>((r) => { release = r; });
    const first = new PostgresStorage(pool, { beforeCommit: async () => { reached(); await gate; } });
    const writing = first.writeCheckpointBatch(c, short, null, 105n);
    await ready;
    const competing = storage.writeCheckpointBatch(c, long, null, 105n);
    const assertion = assert.rejects(competing, errorCode('CHECKPOINT_CONFLICT'));
    try {
      let waiting = false;
      const deadline = Date.now() + 5_000;
      // A fixed count of rapid queries can expire before a new PostgreSQL
      // backend is scheduled, especially on Windows. Still require SQL proof
      // of the real blocking lock; a timeout never counts as success.
      while (Date.now() < deadline) {
        const observed = await pool.query(`SELECT pid, pg_blocking_pids(pid) AS blockers
          FROM pg_stat_activity WHERE datname=current_database()
            AND wait_event_type='Lock' AND wait_event='advisory'
            AND query LIKE 'SELECT pg_advisory_xact_lock%'
            AND cardinality(pg_blocking_pids(pid)) > 0`);
        if (observed.rowCount) {
          waiting = true;
          process.stdout.write(JSON.stringify({ concurrencyEvidence: 'advisory lock wait', ...observed.rows[0] }) + '\n');
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.equal(waiting, true, 'SQL must observe the second writer waiting on the first writer advisory lock.');
    } finally { release(); await writing; await assertion; }
    assert.deepEqual(await state(c), { blocks: 2, events: 0, checkpoint: '101' });
    await sync(c, rpc, storage);
    await assert.rejects(storage.writeCheckpointBatch(c, short, null, 105n), errorCode('CHECKPOINT_CONFLICT'));
    assert.equal((await state(c)).checkpoint, '103');
  });
  test('decode error and unknown topic are durable and remain visible after idle restart', async () => {
    const { c, rpc } = await fixture(); rpc.logs = [{ ...rpcLog(), data: '0x' }, { ...rpcLog(101n), topics: [hash(999)] }];
    const first = await sync(c, rpc, storage);
    assert.equal(first.decodeErrors, 1); assert.equal(first.unknownTopics, 1); assert.equal(first.decodeComplete, false);
    assert.deepEqual(first.issues.map((i) => i.code), ['DECODE_ERROR', 'UNKNOWN_TOPIC']);
    assert.equal(first.issues[0]!.transactionHash, rpc.logs[0]!.transactionHash);
    rpc.head = 105n;
    const idle = await sync(c, rpc, storage);
    assert.equal(idle.decodeComplete, false);
    assert.deepEqual(idle.issues, first.issues);
    const rows = await pool.query('SELECT decode_status,decode_error_code,event_name,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY block_number', [c.deploymentId]);
    assert.deepEqual(rows.rows.map((r) => r.decode_status), ['decode_error', 'unknown_topic']);
    assert.deepEqual(rows.rows.map((r) => r.rpc_log), rpc.logs);
    assert.equal((await pool.query('SELECT last_error_code FROM checkpoints WHERE deployment_id=$1', [c.deploymentId])).rows[0].last_error_code, 'DECODE_INCOMPLETE');
  });
  test('legacy raw WithParams can be decoded again without changing raw identity/bytes or losing params', async () => {
    const { c, rpc } = await fixture();
    const abi = new Interface(JSON.parse(await readFile(new URL('../../shared/abi/BudgetGovernor.json', import.meta.url), 'utf8')));
    const encoded = abi.encodeEventLog('VoteCastWithParams', [c.contracts[0]!.address, (1n << 256n) - 1n, 1n, (1n << 255n), ' Lý do 🚀 ', '0x00ff0001']);
    rpc.logs = [{ ...rpcLog(102n), address: c.contracts[1]!.address, ...encoded }];
    const batch = (await readBatch(c, rpc, 102n, 103n)).batch;
    batch.logs[0]!.decode = { status: 'unknown_topic', code: 'UNKNOWN_TOPIC', message: 'Simulated legacy BE02 classification', abiVersion: c.contracts[1]!.abiVersion };
    await storage.writeBatch(c, batch);
    const raw = (await pool.query('SELECT raw_event_id,rpc_log FROM raw_events WHERE deployment_id=$1', [c.deploymentId])).rows;
    assert.equal(await storage.redecode(c), 1);
    assert.equal((await pool.query('SELECT decode_status FROM raw_events WHERE deployment_id=$1', [c.deploymentId])).rows[0].decode_status, 'decoded');
    await sync(c, rpc, storage);
    const rows = await pool.query('SELECT raw_event_id,rpc_log,event_name,decoded_payload FROM raw_events WHERE deployment_id=$1', [c.deploymentId]);
    assert.deepEqual(rows.rows.map(({ raw_event_id, rpc_log }) => ({ raw_event_id, rpc_log })), raw);
    assert.equal(rows.rows[0].event_name, 'VoteCastWithParams');
    assert.deepEqual(rows.rows[0].decoded_payload, { voter: c.contracts[0]!.address, proposalId: ((1n << 256n) - 1n).toString(), support: '1', weight: (1n << 255n).toString(), reason: ' Lý do 🚀 ', params: '0x00ff0001' });
  });

  async function configFile(c: IndexerConfig, rpcUrl: string) {
    const dir = await mkdtemp(join(tmpdir(), 'be03-crash-'));
    const file = join(dir, 'config.json');
    await writeFile(file, JSON.stringify({ ...c, rpcUrl }, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
    return file;
  }
  for (const point of ['beforeCommit', 'afterCommit']) {
    test(`real process crash at ${point}: SQL visibility and restart exactly once`, { timeout: 30_000 }, async (t) => {
      const { c, rpc } = await fixture(); c.toBlock = 101n; rpc.logs = [rpcLog()];
      const { server, url } = await serveRpc(({ method, params }) => rpc.call(method, params));
      t.after(() => { server.closeAllConnections(); server.close(); });
      const file = await configFile(c, url);
      const child = spawn(process.execPath, ['--import', 'tsx', 'tests/indexer/crash-worker.ts', file, point], {
        env: { ...process.env, RPC_URL: url }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
      });
      t.after(() => { if (child.exitCode === null) child.kill(); });
      let stdout = ''; let stderr = '';
      child.stdout!.on('data', (d) => { stdout += d; }); child.stderr!.on('data', (d) => { stderr += d; });
      const reached = await new Promise<unknown>((resolve, reject) => {
        child.once('message', resolve); child.once('error', reject);
        child.once('exit', () => reject(new Error(`Worker exited before barrier: ${stderr}`)));
      });
      assert.deepEqual(reached, { point });
      assert.equal(stdout, '', 'No commit/success report before the deterministic barrier.');
      const expected = point === 'beforeCommit' ? { blocks: 0, events: 0, checkpoint: null } : { blocks: 2, events: 1, checkpoint: '101' };
      assert.deepEqual(await state(c), expected);
      const closed = once(child, 'close'); child.kill(); await closed;
      assert.deepEqual(await state(c), expected);
      const restarted = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', file, '--sync'], {
        env: { ...process.env, DATABASE_URL: databaseUrl, RPC_URL: url }, windowsHide: true,
      });
      t.after(() => { if (restarted.exitCode === null) restarted.kill(); });
      let result = ''; let errors = '';
      restarted.stdout.on('data', (d) => { result += d; }); restarted.stderr.on('data', (d) => { errors += d; });
      const [exit] = await once(restarted, 'close');
      assert.equal(exit, 0, errors);
      assert.deepEqual(await state(c), { blocks: 2, events: 1, checkpoint: '101' });
      const parsed = JSON.parse(result.trim().split('\n').at(-1)!);
      assert.equal(parsed.committedBatches, point === 'afterCommit' ? 0 : 1);
      const sql = await pool.query(`SELECT c.block_number::text,c.block_hash,b.block_hash AS header_hash,
        (SELECT count(*)::int FROM raw_events WHERE deployment_id=c.deployment_id) AS events
        FROM checkpoints c JOIN indexed_blocks b USING (deployment_id,block_number,block_hash) WHERE c.deployment_id=$1`, [c.deploymentId]);
      assert.equal(sql.rows[0].block_hash, hash(101)); assert.equal(sql.rows[0].header_hash, hash(101)); assert.equal(sql.rows[0].events, 1);
      console.log(JSON.stringify({ crashEvidence: point, beforeRestart: expected, afterRestart: await state(c), sql: sql.rows[0] }));
    });
  }
});
