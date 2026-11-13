import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStorage, StorageError } from '../../indexer/storage.js';
import type { ContractRole, DecodedLog, IndexerConfig, LogBatch } from '../../indexer/types.js';
import { FixtureRpc, rpcLog, serveRpc } from './helpers.js';
import { readBatch } from '../../indexer/reader.js';

const connectionString = process.env.BE02_TEST_DATABASE_URL;
const hash = (number: bigint | number): string => `0x${BigInt(number).toString(16).padStart(64, '0')}`;
const address = (number: number): string => `0x${number.toString(16).padStart(40, '0')}`;
const roles: ContractRole[] = ['governor', 'timelock', 'treasury', 'budget_token'];
const maxUint256 = (2n ** 256n - 1n).toString();

describe('PostgreSQL storage (real isolated PostgreSQL)', { skip: !connectionString }, () => {
  let pool: Pool;
  let storage: PostgresStorage;
  let sequence = 0;

  before(async () => {
    assert.equal(process.env.BE02_TEST_ISOLATED, '1', 'Use the isolated cluster runner; existing databases are forbidden.');
    const url = new URL(connectionString!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, 'be02_test');
    assert.equal(url.pathname, '/be02_test');
    pool = new Pool({ connectionString, max: 4 });
    storage = new PostgresStorage(pool);
    const existing = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(existing.rowCount, 0, 'Migration is allowed only on this new empty test database.');
    await pool.query(await readFile(new URL('../../database/migrations/001_initial.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../../database/tests/001_initial_checks.sql', import.meta.url), 'utf8'));
  });

  after(async () => { await pool?.end(); });

  async function fixture(chainId?: bigint): Promise<{ config: IndexerConfig; batch: LogBatch }> {
    sequence += 1;
    chainId ??= 31337n + BigInt(sequence);
    const deployment = await pool.query<{ deployment_id: string }>(`
      INSERT INTO deployments (chain_id, deployment_name, deployment_block, abi_version, governance_config)
      VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING deployment_id::text`,
    [chainId.toString(), `be02-storage-${sequence}`, '100', 'synthetic-be02', '{}']);
    const config: IndexerConfig = {
      rpcUrl: 'http://127.0.0.1:8545', chainId, deploymentId: deployment.rows[0]!.deployment_id,
      fromBlock: 100n, toBlock: 200n, batchSize: 2n,
      contracts: roles.map((role, index) => ({
        role, address: address(sequence * 10 + index + 1), deploymentBlock: 100n, abiVersion: `synthetic-${role}-v1`,
      })),
    };
    for (const contract of config.contracts) {
      await pool.query(`INSERT INTO deployment_contracts
        (deployment_id, chain_id, contract_role, contract_address, deployment_block, abi_version)
        VALUES ($1, $2, $3, $4, $5, $6)`, [config.deploymentId, chainId.toString(), contract.role,
        contract.address, contract.deploymentBlock.toString(), contract.abiVersion]);
    }
    const transactionHash = hash(sequence * 1000 + 10);
    const contract = config.contracts[2]!;
    const event: DecodedLog = {
      log: {
        contract, blockNumber: 100n, blockHash: hash(100), transactionHash,
        transactionIndex: 0n, logIndex: 0n, topics: [hash(7), hash(8)], data: '0x1234',
        rawLog: {
          address: contract.address, blockNumber: '0x64', blockHash: hash(100), transactionHash,
          transactionIndex: '0x0', logIndex: '0x0', topics: [hash(7), hash(8)], data: '0x1234', removed: false,
          original: { exactUint256: maxUint256, unicode: 'Giữ nguyên dữ liệu', source: 'synthetic BE02 storage fixture' },
        },
      },
      decode: { status: 'decoded', eventName: 'BudgetDisbursed', payload: { amount: maxUint256, requestId: hash(8) }, abiVersion: contract.abiVersion },
    };
    const batch: LogBatch = {
      fromBlock: 100n, toBlock: 101n,
      blocks: [
        { number: 100n, hash: hash(100), parentHash: hash(99), timestamp: 1_800_000_000n, transactions: [transactionHash] },
        { number: 101n, hash: hash(101), parentHash: hash(100), timestamp: 1_800_000_012n, transactions: [] },
      ],
      logs: [event],
    };
    return { config, batch };
  }

  async function counts(deploymentId: string): Promise<{ blocks: number; events: number }> {
    const result = await pool.query<{ blocks: number; events: number }>(`
      SELECT (SELECT count(*)::int FROM indexed_blocks WHERE deployment_id = $1) AS blocks,
             (SELECT count(*)::int FROM raw_events WHERE deployment_id = $1) AS events`, [deploymentId]);
    return result.rows[0]!;
  }

  const hasCode = (code: string) => (error: unknown): boolean => error instanceof StorageError && error.code === code;

  async function cliFixture(): Promise<{ config: IndexerConfig; rpc: FixtureRpc }> {
    const { config } = await fixture();
    const token = config.contracts[3]!;
    token.abiVersion = 'oz-5.4.0-erc20';
    config.contracts = [token];
    config.toBlock = 101n;
    await pool.query(`UPDATE deployment_contracts SET abi_version = $1
      WHERE deployment_id = $2 AND contract_role = $3`, [token.abiVersion, config.deploymentId, token.role]);
    const rpc = new FixtureRpc();
    rpc.chainId = `0x${config.chainId.toString(16)}`;
    return { config, rpc };
  }

  async function runCli(config: IndexerConfig, rpcUrl: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const temp = await mkdtemp(join(tmpdir(), 'dao-be02-pg-cli-'));
    const path = join(temp, 'config.json');
    await writeFile(path, JSON.stringify({ ...config, rpcUrl }, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value));
    const child = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', path], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: connectionString, RPC_URL: rpcUrl }, windowsHide: true, timeout: 30_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += String(data); });
    child.stderr.on('data', (data) => { stderr += String(data); });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    return { code, stdout, stderr };
  }

  test('writes complete headers including empty block, exact uint256, original JSON and scoped raw columns', async () => {
    const { config, batch } = await fixture();
    const original = structuredClone(batch.logs[0]!.log.rawLog);
    assert.deepEqual(await storage.writeBatch(config, batch), { insertedBlocks: 2, insertedEvents: 1, duplicateEvents: 0 });
    const rows = await pool.query(`SELECT e.*, e.topics::text[] AS topics, b.block_timestamp::text AS block_timestamp
      FROM raw_events e JOIN indexed_blocks b USING (deployment_id, block_number, block_hash)
      WHERE e.deployment_id = $1`, [config.deploymentId]);
    const event = rows.rows[0]!;
    assert.equal(event.deployment_id, config.deploymentId);
    assert.equal(event.chain_id, config.chainId.toString());
    assert.equal(event.contract_role, 'treasury');
    assert.equal(event.contract_address, config.contracts[2]!.address);
    assert.equal(event.block_number, '100');
    assert.equal(event.block_timestamp, '1800000000');
    assert.equal(event.block_hash, batch.logs[0]!.log.blockHash);
    assert.equal(event.transaction_hash, batch.logs[0]!.log.transactionHash);
    assert.equal(event.transaction_index, '0');
    assert.equal(event.log_index, '0');
    assert.deepEqual(event.topics, batch.logs[0]!.log.topics);
    assert.equal(event.data, '0x1234');
    assert.equal(event.removed, false);
    assert.equal(event.event_name, 'BudgetDisbursed');
    assert.equal(event.decoded_payload.amount, maxUint256);
    assert.deepEqual(event.rpc_log, original);
    assert.deepEqual(batch.logs[0]!.log.rawLog, original);
    assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
  });

  test('identical and concurrent retries do not duplicate events or blocks', async () => {
    const { config, batch } = await fixture();
    const results = await Promise.all([storage.writeBatch(config, batch), storage.writeBatch(config, structuredClone(batch))]);
    assert.equal(results.reduce((sum, item) => sum + item.insertedEvents, 0), 1);
    assert.equal(results.reduce((sum, item) => sum + item.duplicateEvents, 0), 1);
    assert.equal(results.reduce((sum, item) => sum + item.insertedBlocks, 0), 2);
    assert.deepEqual(await storage.writeBatch(config, batch), { insertedBlocks: 0, insertedEvents: 0, duplicateEvents: 1 });
    assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
  });

  test('detects changed block hash, parent hash and timestamp with the same block key', async () => {
    for (const field of ['hash', 'parentHash', 'timestamp'] as const) {
      const { config, batch } = await fixture();
      await storage.writeBatch(config, batch);
      const changed = structuredClone(batch);
      changed.logs = [];
      if (field === 'timestamp') changed.blocks[0]!.timestamp += 1n;
      else if (field === 'hash') {
        changed.blocks[0]!.hash = hash(999);
        changed.blocks[1]!.parentHash = hash(999);
      } else changed.blocks[0]!.parentHash = hash(888);
      await assert.rejects(storage.writeBatch(config, changed), hasCode('STORAGE_CONFLICT'));
      assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    }
  });

  test('detects raw/decode content conflicts rather than suppressing the chain dedup key', async () => {
    for (const field of ['topics', 'data', 'rpc_log', 'event_name', 'decoded_payload', 'transaction_index', 'contract'] as const) {
      const { config, batch } = await fixture();
      await storage.writeBatch(config, batch);
      const changed = structuredClone(batch);
      const event = changed.logs[0]!;
      if (field === 'topics') event.log.topics = [hash(999)];
      if (field === 'data') event.log.data = '0xabcd';
      if (field === 'rpc_log') event.log.rawLog.extraProviderField = true;
      if (field === 'event_name' && event.decode.status === 'decoded') event.decode.eventName = 'DifferentEvent';
      if (field === 'decoded_payload' && event.decode.status === 'decoded') event.decode.payload.amount = '1';
      if (field === 'transaction_index') {
        changed.blocks[0]!.transactions.unshift(hash(555));
        event.log.transactionIndex = 1n;
      }
      if (field === 'contract') {
        event.log.contract = config.contracts[0]!;
        event.decode.abiVersion = config.contracts[0]!.abiVersion;
      }
      await assert.rejects(storage.writeBatch(config, changed), hasCode('STORAGE_CONFLICT'), field);
    }
  });

  test('same chain dedup key cannot be silently copied to another deployment', async () => {
    const first = await fixture();
    const second = await fixture(first.config.chainId);
    await storage.writeBatch(first.config, first.batch);
    second.batch.logs[0]!.log.transactionHash = first.batch.logs[0]!.log.transactionHash;
    second.batch.blocks[0]!.transactions = [first.batch.logs[0]!.log.transactionHash];
    await assert.rejects(storage.writeBatch(second.config, second.batch), hasCode('STORAGE_CONFLICT'));
    assert.deepEqual(await counts(second.config.deploymentId), { blocks: 0, events: 0 });
  });

  test('unknown topics and decoder errors retain raw data and NULL decode columns', async () => {
    for (const status of ['unknown_topic', 'decode_error'] as const) {
      const { config, batch } = await fixture();
      batch.logs[0]!.decode = status === 'unknown_topic'
        ? { status, code: 'UNKNOWN_TOPIC', message: 'Unsupported signature', abiVersion: config.contracts[2]!.abiVersion }
        : { status, code: 'DECODE_ERROR', message: 'Malformed ABI data', abiVersion: config.contracts[2]!.abiVersion };
      await storage.writeBatch(config, batch);
      const rows = await pool.query('SELECT event_name, decoded_payload, rpc_log FROM raw_events WHERE deployment_id = $1', [config.deploymentId]);
      assert.equal(rows.rows[0]!.event_name, null);
      assert.equal(rows.rows[0]!.decoded_payload, null);
      assert.deepEqual(rows.rows[0]!.rpc_log, batch.logs[0]!.log.rawLog);
    }
  });

  test('missing deployment or chain mismatch fails before inserting any data', async () => {
    const { config, batch } = await fixture();
    await assert.rejects(storage.writeBatch({ ...config, deploymentId: '9223372036854775807' }, batch), hasCode('STORAGE_METADATA_MISMATCH'));
    await assert.rejects(storage.writeBatch({ ...config, chainId: 1n }, batch), hasCode('STORAGE_METADATA_MISMATCH'));
    assert.deepEqual(await counts(config.deploymentId), { blocks: 0, events: 0 });
  });

  test('numeric metadata with an explicit zero scale still matches its exact integer configuration', async () => {
    const { config, batch } = await fixture();
    await pool.query(`UPDATE deployments SET chain_id = (chain_id::text || '.0')::numeric,
      deployment_block = 100.000 WHERE deployment_id = $1`, [config.deploymentId]);
    await pool.query(`UPDATE deployment_contracts SET chain_id = (chain_id::text || '.00')::numeric,
      deployment_block = 100.00 WHERE deployment_id = $1`, [config.deploymentId]);
    assert.deepEqual(await storage.writeBatch(config, batch), { insertedBlocks: 2, insertedEvents: 1, duplicateEvents: 0 });
  });

  test('detects disconnected stored neighbors on either boundary across separate runs', async () => {
    for (const boundary of ['previous', 'next']) {
      const { config, batch } = await fixture();
      await storage.writeBatch(config, batch);
      const changedConfig = { ...config, fromBlock: 99n };
      const next: LogBatch = boundary === 'previous'
        ? { fromBlock: 102n, toBlock: 102n, logs: [], blocks: [
          { number: 102n, hash: hash(102), parentHash: hash(99999), timestamp: 1_800_000_024n, transactions: [] },
        ] }
        : { fromBlock: 99n, toBlock: 99n, logs: [], blocks: [
          { number: 99n, hash: hash(99999), parentHash: hash(98), timestamp: 1_799_999_988n, transactions: [] },
        ] };
      await assert.rejects(storage.writeBatch(changedConfig, next), hasCode('STORAGE_CONFLICT'), boundary);
      assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    }
  });

  test('detects conflicting canonical coordinates even when the transaction dedup key differs', async () => {
    for (const coordinate of ['log_index', 'transaction_index']) {
      const { config, batch } = await fixture();
      await storage.writeBatch(config, batch);
      const changed = structuredClone(batch);
      const event = changed.logs[0]!;
      event.log.transactionHash = hash(sequence * 1000 + 77);
      if (coordinate === 'log_index') {
        event.log.transactionIndex = 1n;
        changed.blocks[0]!.transactions.push(event.log.transactionHash);
      } else {
        event.log.logIndex = 1n;
        changed.blocks[0]!.transactions = [event.log.transactionHash];
      }
      await assert.rejects(storage.writeBatch(config, changed), hasCode('STORAGE_CONFLICT'), coordinate);
      assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    }
  });

  test('detects inverse transaction/log ordering against logs saved by a previous run', async () => {
    for (const order of ['higher_tx_lower_log', 'lower_tx_higher_log']) {
      const { config, batch } = await fixture();
      const transactionHashes = [hash(sequence * 1000 + 10), hash(sequence * 1000 + 11)];
      batch.blocks[0]!.transactions = transactionHashes;
      if (order === 'lower_tx_higher_log') {
        batch.logs[0]!.log.transactionHash = transactionHashes[1]!;
        batch.logs[0]!.log.transactionIndex = 1n;
      }
      batch.logs[0]!.log.logIndex = 5n;
      await storage.writeBatch(config, batch);
      const changed = structuredClone(batch);
      changed.logs[0]!.log.transactionIndex = order === 'higher_tx_lower_log' ? 1n : 0n;
      changed.logs[0]!.log.transactionHash = transactionHashes[Number(changed.logs[0]!.log.transactionIndex)]!;
      changed.logs[0]!.log.logIndex = order === 'higher_tx_lower_log' ? 4n : 6n;
      await assert.rejects(storage.writeBatch(config, changed), hasCode('STORAGE_CONFLICT'), order);
      assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    }
  });

  test('rejects a stored transaction appearing in a different connected block with a new log index', async () => {
    const { config, batch } = await fixture();
    await storage.writeBatch(config, batch);
    const repeated = structuredClone(batch.logs[0]!);
    repeated.log.blockNumber = 102n;
    repeated.log.blockHash = hash(102);
    repeated.log.logIndex = 1n;
    const next: LogBatch = {
      fromBlock: 102n, toBlock: 102n, logs: [repeated],
      blocks: [{ number: 102n, hash: hash(102), parentHash: hash(101), timestamp: 1_800_000_024n,
        transactions: [repeated.log.transactionHash] }],
    };
    await assert.rejects(storage.writeBatch(config, next), hasCode('STORAGE_CONFLICT'));
    assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    assert.equal((await pool.query('SELECT 1 FROM indexed_blocks WHERE deployment_id = $1 AND block_number = 102', [config.deploymentId])).rowCount, 0);
  });

  test('every requested contract role/address/deploymentBlock/ABI must match existing metadata', async () => {
    for (const field of ['role', 'address', 'deploymentBlock', 'abiVersion'] as const) {
      const { config, batch } = await fixture();
      const changed = structuredClone(config);
      const contract = changed.contracts[0]!;
      if (field === 'role') {
        await pool.query('DELETE FROM deployment_contracts WHERE deployment_id = $1 AND contract_role = $2', [config.deploymentId, contract.role]);
      }
      if (field === 'address') contract.address = address(99999);
      if (field === 'deploymentBlock') contract.deploymentBlock += 1n;
      if (field === 'abiVersion') contract.abiVersion = 'unconfirmed-wrong-v2';
      await assert.rejects(storage.writeBatch(changed, batch), hasCode('STORAGE_METADATA_MISMATCH'), field);
      assert.deepEqual(await counts(config.deploymentId), { blocks: 0, events: 0 });
    }
  });

  test('later event conflict rolls back newly inserted headers and earlier events, preserving prior batch', async () => {
    const { config, batch } = await fixture();
    await storage.writeBatch(config, batch);
    const next = structuredClone(batch);
    next.fromBlock = 102n;
    next.toBlock = 102n;
    const newEvent = structuredClone(next.logs[0]!);
    newEvent.log.transactionHash = hash(sequence * 1000 + 11);
    newEvent.log.blockNumber = 102n;
    newEvent.log.blockHash = hash(102);
    const conflict = structuredClone(next.logs[0]!);
    conflict.log.blockNumber = 102n;
    conflict.log.blockHash = hash(102);
    conflict.log.transactionIndex = 1n;
    next.blocks = [{ number: 102n, hash: hash(102), parentHash: hash(101), timestamp: 1_800_000_024n,
      transactions: [newEvent.log.transactionHash, conflict.log.transactionHash] }];
    next.logs = [newEvent, conflict];
    await assert.rejects(storage.writeBatch(config, next), hasCode('STORAGE_CONFLICT'));
    assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    const existing = await pool.query('SELECT block_hash FROM raw_events WHERE deployment_id = $1', [config.deploymentId]);
    assert.equal(existing.rows[0]!.block_hash, hash(100));
  });

  test('database errors roll back inserted headers and raw events', async () => {
    const { config, batch } = await fixture();
    const invalidEvent = structuredClone(batch.logs[0]!);
    invalidEvent.log.logIndex = 1n;
    invalidEvent.log.data = 'not-hex';
    batch.logs.push(invalidEvent);
    await assert.rejects(storage.writeBatch(config, batch), (error: unknown) =>
      error instanceof StorageError && error.code === 'STORAGE_DATABASE_ERROR' && error.details.sqlState === '23514');
    assert.deepEqual(await counts(config.deploymentId), { blocks: 0, events: 0 });
  });

  test('rejects removed logs, bad coordinates, out-of-scope contracts and incomplete batches', async () => {
    for (const field of ['removed', 'blockHash', 'transactionHash', 'deploymentBlock', 'address', 'missingHeader'] as const) {
      const { config, batch } = await fixture();
      if (field === 'removed') batch.logs[0]!.log.rawLog.removed = true;
      if (field === 'blockHash') batch.logs[0]!.log.blockHash = hash(999);
      if (field === 'transactionHash') batch.logs[0]!.log.transactionHash = hash(999);
      if (field === 'deploymentBlock') batch.logs[0]!.log.contract = { ...config.contracts[2]!, deploymentBlock: 101n };
      if (field === 'address') batch.logs[0]!.log.contract = { ...config.contracts[2]!, address: address(99999) };
      if (field === 'missingHeader') batch.blocks.pop();
      await assert.rejects(storage.writeBatch(config, batch), hasCode('STORAGE_INVALID_BATCH'), field);
      assert.deepEqual(await counts(config.deploymentId), { blocks: 0, events: 0 });
    }
  });

  test('BE01 foreign keys reject a log linked to another deployment contract or block hash', async () => {
    const first = await fixture();
    const second = await fixture(first.config.chainId);
    await storage.writeBatch(first.config, first.batch);
    await storage.writeBatch(second.config, { ...second.batch, logs: [] });
    for (const field of ['contract_address', 'block_hash'] as const) {
      const contractAddress = field === 'contract_address' ? first.config.contracts[2]!.address : second.config.contracts[2]!.address;
      const blockHash = field === 'block_hash' ? hash(99999) : hash(100);
      await assert.rejects(pool.query(`INSERT INTO raw_events (
        deployment_id, chain_id, contract_role, contract_address, block_number, block_hash,
        transaction_hash, transaction_index, log_index, topics, data, rpc_log)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, ARRAY[]::evm_hash32[], '0x', '{}'::jsonb)`,
      [second.config.deploymentId, second.config.chainId.toString(), 'treasury', contractAddress, '100', blockHash, hash(sequence * 1000 + 99)]),
      (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23503');
    }
    assert.deepEqual(await counts(second.config.deploymentId), { blocks: 2, events: 0 });
  });

  test('does not advance checkpoints or create projections or overwrite deployment metadata', async () => {
    const { config, batch } = await fixture();
    const before = await pool.query('SELECT * FROM deployments WHERE deployment_id = $1', [config.deploymentId]);
    const contractsBefore = await pool.query('SELECT * FROM deployment_contracts WHERE deployment_id = $1 ORDER BY contract_role', [config.deploymentId]);
    await storage.writeBatch(config, batch);
    assert.deepEqual((await pool.query('SELECT * FROM deployments WHERE deployment_id = $1', [config.deploymentId])).rows, before.rows);
    assert.deepEqual((await pool.query('SELECT * FROM deployment_contracts WHERE deployment_id = $1 ORDER BY contract_role', [config.deploymentId])).rows, contractsBefore.rows);
    for (const table of ['checkpoints', 'proposals', 'votes', 'operations', 'transfers', 'disbursements']) {
      // Table names are a fixed test-owned allowlist; all user values use parameters.
      const rows = await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE deployment_id = $1`, [config.deploymentId]);
      assert.equal(rows.rows[0]!.count, 0, table);
    }
  });

  test('actual CLI over HTTP RPC and PostgreSQL exits 0, preserves raw JSON, and reruns without duplicates', async (t) => {
    const { config, rpc } = await cliFixture();
    rpc.logs = [{ ...rpcLog(), address: config.contracts[0]!.address }];
    const { server, url } = await serveRpc(({ method, params }) => rpc.call(method, params));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const first = await runCli(config, url);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stderr, '');
    const firstReport = JSON.parse(first.stdout.trim().split('\n').at(-1)!);
    assert.equal(firstReport.status, 'completed');
    assert.equal(firstReport.committedBatches[0].insertedBlocks, 2);
    assert.equal(firstReport.committedBatches[0].insertedEvents, 1);
    const rows = await pool.query('SELECT raw_event_id, event_name, decoded_payload, rpc_log FROM raw_events WHERE deployment_id = $1', [config.deploymentId]);
    assert.equal(rows.rows[0]!.event_name, 'Transfer');
    assert.equal(rows.rows[0]!.decoded_payload.value, ((1n << 255n) + 1n).toString());
    assert.deepEqual(rows.rows[0]!.rpc_log, rpc.logs[0]);
    const rerun = await runCli(config, url);
    assert.equal(rerun.code, 0, rerun.stderr);
    const rerunReport = JSON.parse(rerun.stdout.trim().split('\n').at(-1)!);
    assert.equal(rerunReport.committedBatches[0].insertedEvents, 0);
    assert.equal(rerunReport.committedBatches[0].insertedBlocks, 0);
    assert.equal(rerunReport.committedBatches[0].duplicateEvents, 1);
    assert.deepEqual(await counts(config.deploymentId), { blocks: 2, events: 1 });
    assert.deepEqual((await pool.query('SELECT raw_event_id, event_name, decoded_payload, rpc_log FROM raw_events WHERE deployment_id = $1', [config.deploymentId])).rows, rows.rows);
  });

  test('actual CLI exits 2 for unknown topic plus decode error while SQL retains both raw logs with NULL decoded fields', async (t) => {
    const { config, rpc } = await cliFixture();
    rpc.logs = [
      { ...rpcLog(), address: config.contracts[0]!.address, topics: [hash(999)] },
      { ...rpcLog(100n, 1n, 1n), address: config.contracts[0]!.address, data: '0x' },
    ];
    const { server, url } = await serveRpc(({ method, params }) => rpc.call(method, params));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const result = await runCli(config, url);
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
    assert.equal(report.status, 'completed_with_decode_issues');
    assert.equal(report.committedBatches[0].unknownTopics, 1);
    assert.equal(report.committedBatches[0].decodeErrors, 1);
    assert.deepEqual(report.committedBatches[0].issues.map((issue: { code: string }) => issue.code), ['UNKNOWN_TOPIC', 'DECODE_ERROR']);
    const saved = await pool.query('SELECT event_name, decoded_payload, rpc_log FROM raw_events WHERE deployment_id = $1 ORDER BY log_index', [config.deploymentId]);
    assert.equal(saved.rowCount, 2);
    for (const [index, row] of saved.rows.entries()) {
      assert.equal(row.event_name, null);
      assert.equal(row.decoded_payload, null);
      assert.deepEqual(row.rpc_log, rpc.logs[index]);
    }
  });

  test('actual CLI exits 1 on later SQL conflict, reports prior commit, and SQL proves failed-batch inserts rolled back', async (t) => {
    const { config, rpc } = await cliFixture();
    config.toBlock = 103n;
    rpc.logs = [{ ...rpcLog(103n), address: config.contracts[0]!.address, data: hash(7) }];
    await storage.writeBatch(config, (await readBatch(config, rpc, 103n, 103n)).batch);
    const preexistingRaw = structuredClone(rpc.logs[0]);
    rpc.logs = [100n, 102n, 103n].map((block) => ({ ...rpcLog(block), address: config.contracts[0]!.address }));
    const { server, url } = await serveRpc(({ method, params }) => rpc.call(method, params));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const result = await runCli(config, url);
    assert.equal(result.code, 1, result.stdout + result.stderr);
    const report = JSON.parse(result.stderr);
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'STORAGE_CONFLICT');
    assert.equal(report.committedBatches.length, 1);
    assert.equal(report.committedBatches[0].fromBlock, '100');
    assert.equal(report.committedBatches[0].toBlock, '101');
    assert.deepEqual(report.failedBatch, { fromBlock: '102', toBlock: '103' });
    const committedOutput = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(committedOutput.length, 1);
    assert.equal(committedOutput[0].type, 'batch_committed');
    assert.deepEqual(await counts(config.deploymentId), { blocks: 3, events: 2 });
    assert.equal((await pool.query('SELECT 1 FROM indexed_blocks WHERE deployment_id = $1 AND block_number = 102', [config.deploymentId])).rowCount, 0);
    assert.equal((await pool.query('SELECT 1 FROM raw_events WHERE deployment_id = $1 AND block_number = 102', [config.deploymentId])).rowCount, 0);
    const saved = await pool.query('SELECT block_number::text, rpc_log FROM raw_events WHERE deployment_id = $1 ORDER BY block_number', [config.deploymentId]);
    assert.deepEqual(saved.rows.map((row) => row.block_number), ['100', '103']);
    assert.deepEqual(saved.rows[1]!.rpc_log, preexistingRaw);
    assert.doesNotMatch(result.stdout + result.stderr, /rpc-secret|postgresql:\/\//);
  });
});
