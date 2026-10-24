import assert from 'node:assert/strict';
import test from 'node:test';
import { parseConfig } from '../../indexer/config.js';
import { safeBlock, scopeHash } from '../../indexer/scope.js';
import { sync, SyncError } from '../../indexer/syncer.js';
import type { Checkpoint, IndexerConfig, LogBatch, SyncStorage } from '../../indexer/types.js';
import { config, configInput, FixtureRpc, hash, rpcLog, treasury } from './helpers.js';

class MemoryStorage implements SyncStorage {
  cp: Checkpoint | null = null;
  batches: LogBatch[] = [];
  issues = { unknownTopics: 0, decodeErrors: 0 };
  async loadCheckpoint() { return this.cp; }
  async decodeIssues() { return this.issues; }
  async writeCheckpointBatch(_config: IndexerConfig, batch: LogBatch, expected: Checkpoint | null) {
    assert.deepEqual(expected, this.cp);
    this.batches.push(batch);
    this.cp = { number: batch.toBlock, hash: batch.blocks.at(-1)!.hash };
    this.issues.unknownTopics += batch.logs.filter((l) => l.decode.status === 'unknown_topic').length;
    this.issues.decodeErrors += batch.logs.filter((l) => l.decode.status === 'decode_error').length;
    return { insertedBlocks: batch.blocks.length, insertedEvents: batch.logs.length, duplicateEvents: 0 };
  }
}
const input = (): IndexerConfig => ({ ...config(), fromBlock: 0n, toBlock: 'latest' });
const code = (expected: string) => (e: unknown) => e instanceof SyncError && e.report.error?.code === expected;

test('K uses following blocks: head-2 included, head-1 excluded; K=0 and no safe block', () => {
  assert.equal(safeBlock(105n, 2), 103n);
  assert.equal(safeBlock(2n, 2), 0n);
  assert.equal(safeBlock(1n, 2), null);
  assert.equal(safeBlock(0n, 0), 0n);
  assert.equal(safeBlock(105n, 0), 105n);
});
for (const k of [-1, 0.5, '2', null, true, 2_147_483_648, NaN, Infinity]) {
  test(`invalid K rejected: ${String(k)}`, () => {
    // null must not silently select default 2.
    assert.throws(() => parseConfig({ ...configInput(), confirmations: k }, {}), /confirmations/);
  });
}
test('K defaults to 2 and numeric 0 is valid', () => {
  assert.equal(parseConfig(configInput(), {}).confirmations, 2);
  assert.equal(parseConfig({ ...configInput(), confirmations: 0 }, {}).confirmations, 0);
});
test('scope is order independent but bound to chain/deployment/address/block/ABI and sources', () => {
  const c = input();
  c.contracts.push({ role: 'treasury', address: treasury, deploymentBlock: 102n, abiVersion: 'sc01-itreasury-v1' });
  assert.equal(scopeHash(c), scopeHash({ ...c, contracts: [...c.contracts].reverse() }));
  for (const changed of [{ ...c, chainId: 1n }, { ...c, deploymentId: '77' }, { ...c, contracts: c.contracts.slice(1) },
    { ...c, contracts: c.contracts.map((x) => ({ ...x, deploymentBlock: x.deploymentBlock + 1n })) }]) {
    assert.notEqual(scopeHash(c), scopeHash(changed));
  }
});
test('new DB starts at earliest deployment block, clamps later sources and empty batches advance', async () => {
  const c = input();
  c.contracts.push({ role: 'treasury', address: treasury, deploymentBlock: 102n, abiVersion: 'sc01-itreasury-v1' });
  const rpc = new FixtureRpc();
  const db = new MemoryStorage();
  const result = await sync(c, rpc, db);
  assert.equal(result.safeBlock, '103');
  assert.equal(result.checkpoint?.number, '103');
  assert.deepEqual(db.batches.map((b) => [b.fromBlock, b.toBlock]), [[100n, 101n], [102n, 103n]]);
  assert.deepEqual(db.batches.map((b) => b.scannedSources?.length), [1, 2]);
  assert.ok(db.batches.every((b) => b.logs.length === 0));
});
test('no safe block and deployment after safe boundary produce no negative RPC range/checkpoint', async () => {
  for (const head of [0n, 1n, 50n, 101n]) {
    const rpc = new FixtureRpc(); rpc.head = head;
    const db = new MemoryStorage();
    const result = await sync(input(), rpc, db);
    assert.equal(result.checkpoint, null);
    assert.equal(db.batches.length, 0);
    assert.equal(rpc.calls.filter((c) => c.method === 'eth_getLogs').length, 0);
  }
});
test('checkpoint block 0 is distinct from absent checkpoint and resumes at 1', async () => {
  const c = input(); c.contracts[0]!.deploymentBlock = 0n;
  const db = new MemoryStorage(); db.cp = { number: 0n, hash: hash(0) };
  const rpc = new FixtureRpc(); rpc.head = 3n;
  rpc.override = (m, p) => m === 'eth_getBlockByNumber' && p[0] === '0x0'
    ? { number: '0x0', hash: hash(0), parentHash: hash(0), timestamp: '0x0', transactions: [] } : undefined;
  await sync(c, rpc, db);
  assert.equal(db.batches[0]!.fromBlock, 1n);
});
test('restart with no new block still verifies hash; then continues from H+1', async () => {
  const c = input(); const db = new MemoryStorage(); const rpc = new FixtureRpc();
  await sync(c, rpc, db);
  rpc.head = 105n; rpc.calls = [];
  const idle = await sync(c, rpc, db);
  assert.equal(idle.committedBatches, 0);
  assert.deepEqual(rpc.calls.map((c) => c.method), ['eth_chainId', 'eth_getBlockByNumber', 'eth_blockNumber']);
  rpc.head = 107n;
  await sync(c, rpc, db);
  assert.equal(db.batches.at(-1)!.fromBlock, 104n);
  assert.equal(db.cp?.number, 105n);
});
test('checkpoint mismatch even when idle leaves stored data unchanged', async () => {
  const db = new MemoryStorage(); db.cp = { number: 103n, hash: hash(999) };
  await assert.rejects(sync(input(), new FixtureRpc(), db), code('CHECKPOINT_HASH_MISMATCH'));
  assert.equal(db.batches.length, 0);
  assert.equal(db.cp.hash, hash(999));
});
for (const failure of ['missing', 'malformed', 'unavailable']) {
  test(`checkpoint RPC cannot verify: ${failure}`, async () => {
    const db = new MemoryStorage(); db.cp = { number: 103n, hash: hash(103) };
    const rpc = new FixtureRpc();
    rpc.override = (method) => {
      if (method !== 'eth_getBlockByNumber') return undefined;
      if (failure === 'unavailable') throw new Error('offline');
      return failure === 'missing' ? null : {};
    };
    await assert.rejects(sync(input(), rpc, db), SyncError);
    assert.equal(db.batches.length, 0);
  });
}
test('one required RPC source fails: entire batch and checkpoint stay unchanged', async () => {
  const c = input(); c.contracts.push({ role: 'treasury', address: treasury, deploymentBlock: 100n, abiVersion: 'sc01-itreasury-v1' });
  const db = new MemoryStorage(); const rpc = new FixtureRpc();
  rpc.override = (method, params) => {
    if (method === 'eth_getLogs' && (params[0] as { address: string }).address === treasury) throw new Error('source failed');
  };
  await assert.rejects(sync(c, rpc, db), SyncError);
  assert.equal(db.cp, null); assert.equal(db.batches.length, 0);
});
test('decode issues remain visible on idle restart after raw checkpoint advances', async () => {
  const db = new MemoryStorage(); const rpc = new FixtureRpc();
  rpc.logs = [{ ...rpcLog(), data: '0x' }, { ...rpcLog(101n), topics: [hash(900)] }];
  const result = await sync(input(), rpc, db);
  assert.equal(result.decodeErrors, 1); assert.equal(result.unknownTopics, 1);
  assert.equal(result.checkpoint?.number, '103'); assert.equal(result.decodeComplete, false);
  rpc.head = 105n;
  const idle = await sync(input(), rpc, db);
  assert.equal(idle.committedBatches, 0); assert.equal(idle.status, 'raw_synced_with_decode_issues');
});
test('explicit toBlock is capped by confirmed head and fromBlock cannot skip deployment', async () => {
  const c = input(); c.toBlock = 101n;
  const db = new MemoryStorage(); await sync(c, new FixtureRpc(), db);
  assert.equal(db.cp?.number, 101n);
  c.fromBlock = 101n;
  await assert.rejects(sync(c, new FixtureRpc(), db), code('INVALID_CONFIG'));
});
