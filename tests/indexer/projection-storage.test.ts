import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Interface } from 'ethers';
import pg from 'pg';
import { project } from '../../indexer/projection/projector.js';
import { blockTag, type RpcTransport } from '../../indexer/rpc.js';
import { PostgresStorage } from '../../indexer/storage.js';
import { sync } from '../../indexer/syncer.js';
import { Scenario, actor, addresses, projectionConfig } from './projection-fixture.js';
import { hash, serveRpc } from './helpers.js';

const abi = new Interface([
  'function clock() view returns(uint48)',
  'function CLOCK_MODE() view returns(string)',
  'function state(uint256) view returns(uint8)',
  'function quorum(uint256) view returns(uint256)',
  'function proposalVotes(uint256) view returns(uint256,uint256,uint256)',
  'function timelock() view returns(address)',
  'function treasury() view returns(address)',
  'function budgetToken() view returns(address)',
  'function balanceOf(address) view returns(uint256)',
  'function getTimestamp(bytes32) view returns(uint256)',
]);

class ProjectionRpc implements RpcTransport {
  head = 4n;
  clock = 1000n;
  state = 0n;
  balance = 10000n;
  weights = [0n, 0n, 0n];
  operationTimestamp = 0n;
  calls: { method: string; params: unknown[] }[] = [];
  fail?: string;
  constructor(
    readonly scenario: Scenario,
    readonly chainId: bigint,
  ) {}
  async call(method: string, params: unknown[]): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === this.fail) throw new Error('sensitive provider details');
    if (method === 'eth_chainId') return blockTag(this.chainId);
    if (method === 'eth_blockNumber') return blockTag(this.head);
    if (method === 'eth_getBlockByNumber') {
      const n = BigInt(params[0] as string);
      const prior =
        [...this.scenario.timestamps.entries()]
          .filter(([block]) => block <= n)
          .sort(([a], [b]) => (a < b ? 1 : -1))[0]?.[1] ?? 999n;
      return {
        number: blockTag(n),
        hash: hash(n),
        parentHash: hash(n - 1n),
        timestamp: blockTag(this.scenario.timestamps.get(n) ?? prior),
        transactions: this.scenario.logs.some((l) => l.blockNumber === n) ? [hash(10000n + n)] : [],
      };
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address: string; fromBlock: string; toBlock: string };
      return this.scenario.logs
        .filter(
          (l) =>
            l.contract.address === f.address &&
            l.blockNumber >= BigInt(f.fromBlock) &&
            l.blockNumber <= BigInt(f.toBlock),
        )
        .map((l) => l.rawLog);
    }
    if (method === 'eth_call') {
      const request = params[0] as { to: string; data: string };
      assert.deepEqual(params[1], { blockHash: hash(this.head - 2n), requireCanonical: true });
      const parsed = abi.parseTransaction({ data: request.data })!;
      const result: Record<string, unknown[]> = {
        clock: [this.clock],
        CLOCK_MODE: ['mode=timestamp'],
        state: [this.state],
        quorum: [200n],
        proposalVotes: this.weights,
        timelock: [addresses.timelock],
        treasury: [addresses.treasury],
        budgetToken: [addresses.budget_token],
        balanceOf: [this.balance],
        getTimestamp: [this.operationTimestamp],
      };
      return abi.encodeFunctionResult(parsed.fragment, result[parsed.name]!);
    }
    throw new Error(`unexpected ${method}`);
  }
}

describe('BE04 atomic projection on isolated real PostgreSQL (RPC oracle is synthetic)', () => {
  let pool: pg.Pool;
  let sequence = 0;
  before(async () => {
    assert.equal(process.env.BE04_TEST_ISOLATED, '1', 'Run the isolated BE04 runner.');
    const url = new URL(process.env.BE04_TEST_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, 'be04_test');
    assert.equal(url.pathname, '/be04_test');
    pool = new pg.Pool({ connectionString: url.href, max: 4 });
    assert.equal(
      (await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,
      0,
      'Refuse an existing database.',
    );
    for (const migration of ['001_initial', '002_be03', '003_be04'])
      await pool.query(await readFile(new URL(`../../database/migrations/${migration}.sql`, import.meta.url), 'utf8'));
  });
  after(async () => {
    await pool?.end();
  });
  async function fixture(s: Scenario) {
    const chainId = String(60000 + ++sequence);
    const d = (
      await pool.query(
        `INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config)
      VALUES ($1,$2,1,'be04-synthetic','{}') RETURNING deployment_id::text`,
        [chainId, `be04-${sequence}`],
      )
    ).rows[0].deployment_id;
    const config = projectionConfig(chainId, d);
    for (const c of config.contracts)
      await pool.query(
        `INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
      VALUES($1,$2,$3,$4,1,$5)`,
        [d, chainId, c.role, c.address, c.abiVersion],
      );
    const rpc = new ProjectionRpc(s, config.chainId),
      storage = new PostgresStorage(pool);
    return { config, rpc, storage };
  }
  async function snapshot(d: string) {
    const out: Record<string, unknown> = {};
    for (const t of ['proposals', 'votes', 'operations', 'transfers', 'disbursements', 'proposal_states']) {
      out[t] = (
        await pool.query(`SELECT to_jsonb(t) AS row FROM ${t} t WHERE deployment_id=$1 ORDER BY to_jsonb(t)::text`, [d])
      ).rows;
    }
    out.checkpoint = (
      await pool.query(
        'SELECT block_number::text,block_hash,snapshot_revision::text FROM projection_checkpoints WHERE deployment_id=$1',
        [d],
      )
    ).rows;
    return out;
  }
  test('no raw checkpoint cannot publish a fake empty snapshot', async () => {
    const { config, rpc } = await fixture(new Scenario());
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_INCOMPLETE' });
  });
  test('empty blocks update Pending -> Active -> Succeeded; quorum is null through exact snapshot', async () => {
    const s = new Scenario();
    s.fund();
    const p = s.propose();
    s.vote(p);
    const { config, rpc, storage } = await fixture(s);
    const publish = async (h: bigint, clock: bigint, state: bigint, weights: bigint[]) => {
      rpc.head = h + 2n;
      rpc.clock = clock;
      rpc.state = state;
      rpc.weights = weights;
      s.timestamps.set(h, clock);
      await sync(config, rpc, storage);
      await project(config, rpc, pool);
      return (
        await pool.query('SELECT state,quorum::text FROM proposal_states WHERE deployment_id=$1', [config.deploymentId])
      ).rows[0];
    };
    assert.deepEqual(await publish(2n, 1000n, 0n, [0n, 0n, 0n]), { state: 'Pending', quorum: null });
    assert.deepEqual(await publish(3n, 1060n, 0n, [0n, 0n, 0n]), { state: 'Pending', quorum: null });
    assert.equal(
      rpc.calls.filter(
        (c) =>
          c.method === 'eth_call' &&
          (c.params[0] as { data: string }).data.startsWith(abi.getFunction('quorum')!.selector),
      ).length,
      0,
    );
    assert.deepEqual(await publish(4n, 1100n, 1n, [0n, 700n, 0n]), { state: 'Active', quorum: '200' });
    assert.deepEqual(await publish(5n, 1360n, 1n, [0n, 700n, 0n]), { state: 'Active', quorum: '200' });
    assert.deepEqual(await publish(6n, 1361n, 4n, [0n, 700n, 0n]), { state: 'Succeeded', quorum: '200' });
    assert.equal(
      (await pool.query('SELECT count(*)::int AS n FROM raw_events WHERE deployment_id=$1', [config.deploymentId]))
        .rows[0].n,
      3,
    );
  });
  test('full lifecycle and replay produce stable rows, exact ledger and WithParams', async () => {
    const s = new Scenario();
    s.fund();
    const p = s.propose();
    s.vote(p);
    s.queue(p);
    s.execute(p);
    const { config, rpc, storage } = await fixture(s);
    rpc.head = 12n;
    rpc.clock = 1481n;
    rpc.state = 7n;
    rpc.balance = 9000n;
    rpc.weights = [0n, 700n, 0n];
    rpc.operationTimestamp = 1n;
    await sync(config, rpc, storage);
    const report = await project(config, rpc, pool);
    assert.deepEqual(report.counts, { proposals: 1, votes: 1, operations: 1, transfers: 2, disbursements: 1 });
    assert.deepEqual(report.treasury, { totalIn: '10000', totalOut: '1000', balance: '9000' });
    assert.equal(report.context.asOfBlock, '10');
    assert.equal(report.context.asOfBlockHash, hash(10));
    const before = await snapshot(config.deploymentId);
    await project(config, rpc, pool);
    assert.deepEqual(await snapshot(config.deploymentId), before);
    assert.equal(
      (await pool.query('SELECT params FROM votes WHERE deployment_id=$1', [config.deploymentId])).rows[0].params,
      '0x0001ff00',
    );
    const totals = (
      await pool.query(
        'SELECT total_in::text,total_out::text,balance::text FROM treasury_totals WHERE deployment_id=$1',
        [config.deploymentId],
      )
    ).rows[0];
    assert.deepEqual(totals, { total_in: '10000', total_out: '1000', balance: '9000' });
    assert.ok(
      rpc.calls
        .filter((c) => c.method === 'eth_call')
        .every((c) => (c.params[1] as { blockHash: string }).blockHash === hash(10)),
    );
  });
  test('RPC state/balance mismatch preserves old publication while raw checkpoint advances', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    const { config, rpc, storage } = await fixture(s);
    await sync(config, rpc, storage);
    await project(config, rpc, pool);
    const before = await snapshot(config.deploymentId);
    rpc.head = 5n;
    rpc.clock = 1061n;
    rpc.state = 0n;
    s.timestamps.set(3n, 1061n);
    await sync(config, rpc, storage);
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_INCOMPLETE' });
    assert.deepEqual(await snapshot(config.deploymentId), before);
    rpc.state = 1n;
    rpc.balance = 9999n;
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_INCOMPLETE' });
    assert.deepEqual(await snapshot(config.deploymentId), before);
    rpc.balance = 10000n;
    await project(config, rpc, pool);
    assert.equal(
      (await pool.query('SELECT block_number::text FROM checkpoints WHERE deployment_id=$1', [config.deploymentId]))
        .rows[0].block_number,
      '3',
    );
  });
  test('SQL failure after replacement begins rolls back all tables and projection checkpoint', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    const { config, rpc, storage } = await fixture(s);
    await sync(config, rpc, storage);
    await project(config, rpc, pool);
    const before = await snapshot(config.deploymentId);
    await pool.query(`CREATE FUNCTION be04_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test only'; END $$;
      CREATE TRIGGER be04_test_fail BEFORE INSERT ON proposals FOR EACH ROW EXECUTE FUNCTION be04_test_fail()`);
    try {
      await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_DATABASE_ERROR' });
      assert.deepEqual(await snapshot(config.deploymentId), before);
    } finally {
      await pool.query('DROP TRIGGER be04_test_fail ON proposals; DROP FUNCTION be04_test_fail()');
    }
  });
  test('unknown log and raw decode tampering block publication without changing raw identity', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    const { config, rpc, storage } = await fixture(s);
    await sync(config, rpc, storage);
    await project(config, rpc, pool);
    const before = await snapshot(config.deploymentId);
    await pool.query(
      `UPDATE raw_events SET decoded_payload=decoded_payload||'{"value":"999"}'::jsonb WHERE deployment_id=$1 AND event_name='Transfer'`,
      [config.deploymentId],
    );
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_INCOMPLETE' });
    assert.deepEqual(await snapshot(config.deploymentId), before);
    await storage.redecode(config);
    s.add('budget_token', 'Transfer', [addresses.budget_token, addresses.treasury, 0n], 3n, 1001n);
    s.logs.at(-1)!.topics = [hash(999)];
    s.logs.at(-1)!.rawLog.topics = [hash(999)];
    rpc.head = 5n;
    rpc.clock = 1001n;
    await sync(config, rpc, storage);
    const raw = (
      await pool.query('SELECT raw_event_id,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id', [
        config.deploymentId,
      ])
    ).rows;
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_INCOMPLETE' });
    assert.deepEqual(await snapshot(config.deploymentId), before);
    assert.deepEqual(
      (
        await pool.query('SELECT raw_event_id,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id', [
          config.deploymentId,
        ])
      ).rows,
      raw,
    );
  });
  test('BE04 recovery: --redecode repairs a payload tampered after a successful decode', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    s.add('budget_token', 'Transfer', [actor, addresses.treasury, 3n], 3n, 1001n);
    const { config, rpc, storage } = await fixture(s);
    await sync(config, rpc, storage);
    const futureLog = s.logs.at(-1)!;
    await pool.query(`INSERT INTO indexed_blocks (deployment_id,block_number,block_hash,parent_hash,block_timestamp)
      VALUES ($1,3,$2,$3,1001)`, [config.deploymentId, futureLog.blockHash, hash(2)]);
    const futurePayload = { from: actor, to: addresses.treasury, value: '999' };
    const futureRowId = (await pool.query(`INSERT INTO raw_events (deployment_id,chain_id,contract_role,
      contract_address,block_number,block_hash,transaction_hash,transaction_index,log_index,topics,data,removed,
      event_name,decoded_payload,rpc_log,decode_status,decode_error_code)
      VALUES ($1,$2,$3,$4,3,$5,$6,0,0,$7::evm_hash32[],$8,FALSE,'Transfer',$9::jsonb,$10::jsonb,'decoded',NULL)
      RETURNING raw_event_id::text`, [config.deploymentId, config.chainId.toString(), futureLog.contract.role,
      futureLog.contract.address, futureLog.blockHash, futureLog.transactionHash, futureLog.topics, futureLog.data,
      JSON.stringify(futurePayload), JSON.stringify(futureLog.rawLog)])).rows[0].raw_event_id;
    const originalRow = (
      await pool.query(
        `SELECT raw_event_id,decoded_payload,event_name,decode_status,decode_error_code
         FROM raw_events WHERE deployment_id=$1 AND event_name='Transfer' ORDER BY block_number LIMIT 1`,
        [config.deploymentId],
      )
    ).rows[0];
    const original = originalRow.decoded_payload;
    const beforeRaw = (
      await pool.query(`SELECT raw_event_id,chain_id,contract_role,contract_address,block_number::text AS block_number,
        block_hash,transaction_hash,transaction_index::text AS transaction_index,log_index::text AS log_index,
        topics::text[] AS topics,data,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`,
      [config.deploymentId])
    ).rows;
    const beforeCheckpoint = (
      await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text,confirmation_depth,
        sync_status,source_scope,last_error_code FROM checkpoints WHERE deployment_id=$1`, [config.deploymentId])
    ).rows;
    await pool.query(
      `UPDATE raw_events SET event_name='Approval',decoded_payload=decoded_payload||'{"value":"999"}'::jsonb
       WHERE raw_event_id=$1`,
      [originalRow.raw_event_id],
    );

    const processed = await storage.redecode(config);
    const restored = (await pool.query(`SELECT raw_event_id,decoded_payload,event_name,decode_status,decode_error_code
      FROM raw_events WHERE raw_event_id=$1`, [originalRow.raw_event_id])).rows[0];
    assert.equal(processed, 2, 'processed counts every raw event re-decoded through H');
    assert.equal(restored.event_name, 'Transfer');
    assert.deepEqual(restored.decoded_payload, original);
    assert.equal(restored.decode_status, 'decoded');
    assert.equal(restored.decode_error_code, null);
    const future = (await pool.query(`SELECT event_name,decoded_payload,decode_status FROM raw_events WHERE raw_event_id=$1`,
      [futureRowId])).rows[0];
    assert.deepEqual(future, { event_name: 'Transfer', decoded_payload: futurePayload, decode_status: 'decoded' },
      'redecode must leave rows beyond the raw checkpoint untouched');
    assert.deepEqual(
      (await pool.query(`SELECT raw_event_id,chain_id,contract_role,contract_address,block_number::text AS block_number,
        block_hash,transaction_hash,transaction_index::text AS transaction_index,log_index::text AS log_index,
        topics::text[] AS topics,data,rpc_log FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`,
      [config.deploymentId])).rows,
      beforeRaw,
      'redecode must preserve raw identity, coordinates, bytes and RPC log',
    );
    assert.deepEqual((await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text,confirmation_depth,
      sync_status,source_scope,last_error_code FROM checkpoints WHERE deployment_id=$1`, [config.deploymentId])).rows,
    beforeCheckpoint, 'redecode must not move or relabel the raw checkpoint');
    const stableDecoded = (await pool.query(`SELECT raw_event_id,event_name,decoded_payload,decode_status,decode_error_code
      FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows;
    assert.equal(await storage.redecode(config), 2);
    assert.deepEqual((await pool.query(`SELECT raw_event_id,event_name,decoded_payload,decode_status,decode_error_code
      FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows, stableDecoded);
    assert.deepEqual((await storage.decodeIssues(config)).issues, []);
  });
  test('BE03 recovery: redecode restores unknown and malformed classifications from raw bytes', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    s.add('budget_token', 'Transfer', [actor, addresses.treasury, 1n], 3n, 1001n);
    const unknown = s.logs.at(-1)!;
    unknown.topics = [hash(999)];
    unknown.rawLog.topics = unknown.topics;
    s.add('budget_token', 'Transfer', [actor, addresses.treasury, 2n], 4n, 1002n);
    const malformed = s.logs.at(-1)!;
    malformed.data = '0x';
    malformed.rawLog.data = malformed.data;
    const { config, rpc, storage } = await fixture(s);
    rpc.head = 6n;
    await sync(config, rpc, storage);
    const initial = (await pool.query(`SELECT raw_event_id,decode_status,decode_error_code FROM raw_events
      WHERE deployment_id=$1 ORDER BY block_number`, [config.deploymentId])).rows;
    assert.deepEqual(initial.map((row) => row.decode_status), ['decoded', 'decoded', 'unknown_topic', 'decode_error']);
    const beforeRaw = (await pool.query(`SELECT raw_event_id,chain_id,contract_role,contract_address,
      block_number::text AS block_number,block_hash,transaction_hash,transaction_index::text AS transaction_index,
      log_index::text AS log_index,topics::text[] AS topics,data,rpc_log FROM raw_events
      WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows;
    const beforeCheckpoint = (await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text,
      confirmation_depth,sync_status,source_scope,last_error_code FROM checkpoints WHERE deployment_id=$1`,
    [config.deploymentId])).rows;
    await pool.query(`UPDATE raw_events SET event_name='Transfer',decoded_payload='{"value":"999"}'::jsonb,
      decode_status='decoded',decode_error_code=NULL WHERE deployment_id=$1 AND decode_status <> 'decoded'`,
    [config.deploymentId]);

    await pool.query(`CREATE FUNCTION be04_test_fail_redecode() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.block_number=4 THEN RAISE EXCEPTION 'redecode test only'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER be04_test_fail_redecode BEFORE UPDATE ON raw_events
      FOR EACH ROW EXECUTE FUNCTION be04_test_fail_redecode()`);
    try {
      await assert.rejects(storage.redecode(config), /redecode test only/);
      const rolledBack = (await pool.query(`SELECT block_number::text,decode_status,event_name,decoded_payload
        FROM raw_events WHERE deployment_id=$1 AND block_number IN (3,4) ORDER BY block_number`,
      [config.deploymentId])).rows;
      assert.equal(rolledBack.every((row) => row.decode_status === 'decoded' && row.event_name === 'Transfer'
        && row.decoded_payload.value === '999'), true,
      'an error after the first repair must roll every decode update back');
      assert.deepEqual((await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text,
        confirmation_depth,sync_status,source_scope,last_error_code FROM checkpoints WHERE deployment_id=$1`,
      [config.deploymentId])).rows, beforeCheckpoint);
    } finally {
      await pool.query('DROP TRIGGER be04_test_fail_redecode ON raw_events; DROP FUNCTION be04_test_fail_redecode()');
    }

    assert.equal(await storage.redecode(config), 4);
    const decoded = (await pool.query(`SELECT block_number::text,decode_status,decode_error_code,event_name,decoded_payload
      FROM raw_events WHERE deployment_id=$1 ORDER BY block_number`, [config.deploymentId])).rows;
    assert.equal(decoded[0].event_name, 'Transfer');
    assert.deepEqual(decoded[0].decoded_payload, { from: actor, to: addresses.treasury, value: '10000' });
    assert.equal(decoded[1].event_name, 'ProposalCreated');
    assert.equal(decoded[2].decode_status, 'unknown_topic');
    assert.equal(decoded[2].decode_error_code, 'UNKNOWN_TOPIC');
    assert.equal(decoded[2].event_name, null);
    assert.equal(decoded[2].decoded_payload, null);
    assert.equal(decoded[3].decode_status, 'decode_error');
    assert.equal(decoded[3].decode_error_code, 'DECODE_ERROR');
    assert.equal(decoded[3].event_name, null);
    assert.equal(decoded[3].decoded_payload, null);
    assert.deepEqual(await storage.decodeIssues(config), {
      unknownTopics: 1,
      decodeErrors: 1,
      issues: [
        { blockNumber: '3', transactionHash: unknown.transactionHash, logIndex: '0', code: 'UNKNOWN_TOPIC', abiVersion: 'oz-5.4.0-erc20' },
        { blockNumber: '4', transactionHash: malformed.transactionHash, logIndex: '0', code: 'DECODE_ERROR', abiVersion: 'oz-5.4.0-erc20' },
      ],
    });
    assert.equal((await pool.query('SELECT last_error_code FROM checkpoints WHERE deployment_id=$1', [config.deploymentId])).rows[0].last_error_code,
      'DECODE_INCOMPLETE');
    assert.deepEqual((await pool.query(`SELECT raw_event_id,chain_id,contract_role,contract_address,
      block_number::text AS block_number,block_hash,transaction_hash,transaction_index::text AS transaction_index,
      log_index::text AS log_index,topics::text[] AS topics,data,rpc_log FROM raw_events
      WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows, beforeRaw);
    assert.deepEqual((await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text,
      confirmation_depth,sync_status,source_scope,last_error_code FROM checkpoints WHERE deployment_id=$1`,
    [config.deploymentId])).rows, beforeCheckpoint);
    const stableDecoded = (await pool.query(`SELECT raw_event_id,event_name,decoded_payload,decode_status,decode_error_code
      FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows;
    assert.equal(await storage.redecode(config), 4);
    assert.deepEqual((await pool.query(`SELECT raw_event_id,event_name,decoded_payload,decode_status,decode_error_code
      FROM raw_events WHERE deployment_id=$1 ORDER BY raw_event_id`, [config.deploymentId])).rows, stableDecoded);
  });
  test('RPC unavailable, wrong chain and changed canonical hash cannot overwrite a publication', async () => {
    const s = new Scenario();
    s.fund();
    s.propose();
    const { config, rpc, storage } = await fixture(s);
    await sync(config, rpc, storage);
    await project(config, rpc, pool);
    const before = await snapshot(config.deploymentId);
    rpc.fail = 'eth_call';
    await assert.rejects(project(config, rpc, pool), { code: 'PROJECTION_RPC_ERROR' });
    rpc.fail = undefined;
    const bad: RpcTransport = { call: async (m, p) => (m === 'eth_chainId' ? '0x1' : rpc.call(m, p)) };
    await assert.rejects(project(config, bad, pool), { code: 'PROJECTION_INCOMPLETE' });
    const reorg: RpcTransport = {
      call: async (m, p) =>
        m === 'eth_getBlockByNumber' ? { ...((await rpc.call(m, p)) as object), hash: hash(999) } : rpc.call(m, p),
    };
    await assert.rejects(project(config, reorg, pool), { code: 'PROJECTION_REORG' });
    assert.deepEqual(await snapshot(config.deploymentId), before);
    const barrier = (await pool.query(`SELECT c.sync_status,d.snapshot_revision::text
      FROM checkpoints c JOIN deployments d USING(deployment_id) WHERE deployment_id=$1`, [config.deploymentId])).rows[0];
    assert.equal(barrier.sync_status, 'rebuild_required');
    assert.notEqual(barrier.snapshot_revision, (before.checkpoint as { snapshot_revision: string }[])[0]!.snapshot_revision);
  });
  test('real child CLI --sync-project and idle --project publish the same H/hash/revision', async (t) => {
    const s = new Scenario();
    s.fund();
    s.propose();
    const { config, rpc } = await fixture(s);
    const adminAbi = new Interface([
      'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
    ]);
    const encoded = adminAbi.encodeEventLog('RoleGranted', [hash(1), addresses.timelock, addresses.governor]);
    const source = s.logs[0]!;
    s.logs.push({
      ...source,
      contract: config.contracts.find((c) => c.role === 'treasury')!,
      logIndex: 1n,
      topics: encoded.topics,
      data: encoded.data,
      rawLog: {
        ...source.rawLog,
        address: addresses.treasury,
        logIndex: '0x1',
        topics: encoded.topics,
        data: encoded.data,
      },
    });
    const { url, server } = await serveRpc(({ method, params }) => rpc.call(method, params));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const dir = await mkdtemp(join(tmpdir(), 'be04-cli-'));
    t.after(() => rm(dir, { recursive: true }));
    const file = join(dir, 'config.json');
    await writeFile(
      file,
      JSON.stringify({ ...config, rpcUrl: url }, (_k, v) => (typeof v === 'bigint' ? String(v) : v)),
    );
    const run = async (flag: string, expectedExit: number) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', file, flag], {
        env: { ...process.env, DATABASE_URL: process.env.BE04_TEST_DATABASE_URL, RPC_URL: url },
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.stderr.on('data', (d) => {
        stderr += d;
      });
      const [exit] = await once(child, 'close');
      assert.equal(exit, expectedExit, stderr);
      return stdout
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
    };
    const first = await run('--sync-project', 2);
    assert.equal(first.at(-2).type, 'sync_result');
    assert.equal(first.at(-1).type, 'projection_result');
    assert.equal(first.at(-2).decodeComplete, false);
    assert.equal(first.at(-1).ignoredAncillaryEvents, 1);
    const second = await run('--project', 0);
    assert.deepEqual(second[0].context, first.at(-1).context);
    assert.equal(second[0].rawDecodeIssues, 1);
    assert.equal(
      (await pool.query('SELECT last_error_code FROM checkpoints WHERE deployment_id=$1', [config.deploymentId]))
        .rows[0].last_error_code,
      'DECODE_INCOMPLETE',
    );
    assert.deepEqual(second[0].treasury, { totalIn: '10000', totalOut: '0', balance: '10000' });
    const redecode = await run('--redecode', 2);
    assert.equal(redecode[0].type, 'redecode_result');
    assert.equal(redecode[0].processedMeaning,
      'raw events re-decoded in this deployment (through H when a raw checkpoint exists), including unchanged rows');
    assert.equal(redecode[0].processed, Number((await pool.query(
      'SELECT count(*)::int AS count FROM raw_events WHERE deployment_id=$1', [config.deploymentId],
    )).rows[0].count));
    assert.equal(redecode[0].unknownTopics, 1);
  });
});
