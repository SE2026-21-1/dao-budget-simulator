import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, ScanError } from '../../indexer/scanner.js';
import { blockRanges } from '../../indexer/reader.js';
import { HttpRpc } from '../../indexer/rpc.js';
import { config, FixtureRpc, hash, RecordingStorage, rpcLog, serveRpc, treasury } from './helpers.js';

test('range boundaries work above Number.MAX_SAFE_INTEGER without gaps', () => {
  const start = 9007199254740993n;
  assert.deepEqual([...blockRanges(start, start + 4n, 2n)], [[start, start + 1n], [start + 2n, start + 3n], [start + 4n, start + 4n]]);
});

test('scan includes every boundary/empty block and sorts tx/log indices; preserves raw input', async () => {
  const rpc = new FixtureRpc();
  rpc.logs = [rpcLog(103n), rpcLog(100n, 1n, 5n), rpcLog(100n, 0n, 2n), rpcLog(100n, 1n, 4n), rpcLog(105n)];
  const original = structuredClone(rpc.logs);
  const storage = new RecordingStorage();
  const report = await scan(config(), rpc, storage);
  assert.equal(report.status, 'completed');
  assert.deepEqual(storage.batches.map((batch) => batch.blocks.map((block) => block.number)), [[100n, 101n], [102n, 103n], [104n, 105n]]);
  assert.deepEqual(storage.batches[0]!.logs.map(({ log }) => log.logIndex), [2n, 4n, 5n]);
  assert.deepEqual(storage.batches.flatMap((batch) => batch.logs).map(({ log }) => log.rawLog.syntheticExtra), Array(5).fill({ retained: true }));
  assert.deepEqual(rpc.logs, original);
  const decoded = storage.batches[0]!.logs[0]!.decode;
  assert.equal(decoded.status, 'decoded');
  if (decoded.status === 'decoded') assert.equal(decoded.payload.value, ((1n << 255n) + 1n).toString());
});

test('different deployment blocks retain early contract logs and clamp each RPC filter', async () => {
  const input = config();
  input.fromBlock = 0n;
  input.batchSize = 4n;
  input.contracts.push({ role: 'treasury', address: treasury, deploymentBlock: 103n, abiVersion: 'sc01-itreasury-v1' });
  const rpc = new FixtureRpc();
  rpc.logs = [rpcLog(100n), { ...rpcLog(103n, 0n, 1n), address: treasury }];
  const storage = new RecordingStorage();
  await scan(input, rpc, storage);
  assert.deepEqual(storage.batches.flatMap((batch) => batch.logs).map(({ log }) => log.blockNumber), [100n, 103n]);
  assert.equal(storage.batches[0]!.fromBlock, 100n);
  const filters = rpc.calls.filter(({ method }) => method === 'eth_getLogs').map(({ params }) => params[0]);
  assert.deepEqual(filters, [
    { address: input.contracts[0]!.address, fromBlock: '0x64', toBlock: '0x67' },
    { address: treasury, fromBlock: '0x67', toBlock: '0x67' },
    { address: input.contracts[0]!.address, fromBlock: '0x68', toBlock: '0x69' },
    { address: treasury, fromBlock: '0x68', toBlock: '0x69' },
  ]);
});

test('RPC cannot return a known contract log before its deployment block', async () => {
  const input = config();
  input.contracts[0]!.deploymentBlock = 101n;
  const rpc = new FixtureRpc();
  rpc.override = (method) => method === 'eth_getLogs' ? [rpcLog(100n)] : undefined;
  await assert.rejects(scan(input, rpc, new RecordingStorage()), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'LOG_BLOCK_MISMATCH');
});

test('RPC cannot substitute another configured contract in a filter response', async () => {
  const input = config();
  input.contracts.push({ role: 'treasury', address: treasury, deploymentBlock: 100n, abiVersion: 'sc01-itreasury-v1' });
  const rpc = new FixtureRpc();
  rpc.override = (method) => method === 'eth_getLogs' ? [{ ...rpcLog(), address: treasury }] : undefined;
  await assert.rejects(scan(input, rpc, new RecordingStorage()), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'RPC_FILTER_MISMATCH');
});

test('duplicate transaction hashes in a header are contradictory', async () => {
  const rpc = new FixtureRpc();
  rpc.override = (method, params) => method === 'eth_getBlockByNumber' ? {
    number: params[0], hash: hash(100), parentHash: hash(99), timestamp: '0x1', transactions: [hash(1000), hash(1000)],
  } : undefined;
  await assert.rejects(scan(config(), rpc, new RecordingStorage()), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'RPC_INVALID_DATA');
});

test('wrong chain stops before any storage write or block request', async () => {
  const rpc = new FixtureRpc(); rpc.chainId = '0x1';
  const storage = new RecordingStorage();
  await assert.rejects(scan(config(), rpc, storage), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'CHAIN_ID_MISMATCH');
  assert.equal(storage.batches.length, 0);
  assert.deepEqual(rpc.calls.map(({ method }) => method), ['eth_chainId']);
});

test('latest is pinned once for the finite scan', async () => {
  const input = config(); input.toBlock = 'latest';
  const rpc = new FixtureRpc();
  const storage = new RecordingStorage();
  const report = await scan(input, rpc, storage);
  assert.equal(report.toBlock, '105');
  assert.equal(rpc.calls.filter(({ method }) => method === 'eth_blockNumber').length, 1);
  assert.equal(storage.batches.at(-1)!.toBlock, 105n);
});

test('outside-deployment log is dropped before ABI or canonical-log validation', async () => {
  const rpc = new FixtureRpc();
  rpc.override = (method) => method === 'eth_getLogs' ? [{ address: '0x' + '9'.repeat(40), removed: true, data: 'broken' }] : undefined;
  const storage = new RecordingStorage();
  const report = await scan(config(), rpc, storage);
  assert.equal(report.committedBatches[0]!.discardedOutsideDeployment, 1);
  assert.equal(storage.batches.flatMap((batch) => batch.logs).length, 0);
});

test('unknown topic and invalid ABI payload survive as raw and produce distinct diagnostics', async () => {
  const rpc = new FixtureRpc();
  rpc.logs = [{ ...rpcLog(100n), topics: [hash(999)] }, { ...rpcLog(101n), data: '0x' }];
  const storage = new RecordingStorage();
  const report = await scan(config(), rpc, storage);
  assert.equal(report.status, 'completed_with_decode_issues');
  assert.deepEqual(storage.batches[0]!.logs.map(({ decode }) => decode.status), ['unknown_topic', 'decode_error']);
  assert.deepEqual(report.committedBatches[0]!.issues.map(({ code }) => code), ['UNKNOWN_TOPIC', 'DECODE_ERROR']);
  assert.deepEqual(storage.batches[0]!.logs.map(({ log }) => log.rawLog), rpc.logs);
});

for (const [name, change, code] of [
  ['removed', { removed: true }, 'REMOVED_LOG'], ['pending', { blockNumber: null }, 'RPC_INVALID_DATA'],
  ['blockHash', { blockHash: hash(999) }, 'LOG_BLOCK_MISMATCH'], ['block number', { blockNumber: '0x66' }, 'LOG_BLOCK_MISMATCH'],
  ['txHash', { transactionHash: hash(888) }, 'LOG_TRANSACTION_MISMATCH'], ['txIndex', { transactionIndex: '0x4' }, 'LOG_TRANSACTION_MISMATCH'],
  ['invalid hex', { data: '0xz1' }, 'RPC_INVALID_DATA'], ['unsafe index', { logIndex: '0x8000000000000000' }, 'RPC_INVALID_DATA'],
] as const) test(`reject contradictory/invalid log: ${name}`, async () => {
  const rpc = new FixtureRpc();
  rpc.override = (method) => method === 'eth_getLogs' ? [{ ...rpcLog(), ...change }] : undefined;
  const storage = new RecordingStorage();
  await assert.rejects(scan(config(), rpc, storage), (error: unknown) => error instanceof ScanError && error.report.error?.code === code);
  assert.equal(storage.batches.length, 0);
});

test('detect colliding log positions and transaction order disagreement', async () => {
  for (const logs of [[rpcLog(100n, 0n, 1n), rpcLog(100n, 1n, 1n)], [rpcLog(100n, 0n, 2n), rpcLog(100n, 1n, 1n)]]) {
    const rpc = new FixtureRpc(); rpc.logs = logs;
    await assert.rejects(scan(config(), rpc, new RecordingStorage()), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'LOG_POSITION_CONFLICT');
  }
});

test('reports previous committed batch separately when a later header chain disagrees', async () => {
  const rpc = new FixtureRpc();
  rpc.override = (method, params) => method === 'eth_getBlockByNumber' && params[0] === '0x66'
    ? { number: '0x66', hash: hash(102), parentHash: hash(999), timestamp: '0x1', transactions: [] } : undefined;
  const storage = new RecordingStorage();
  await assert.rejects(scan(config(), rpc, storage), (error: unknown) => {
    assert.ok(error instanceof ScanError);
    assert.equal(error.report.error?.code, 'BLOCK_MISMATCH');
    assert.equal(error.report.committedBatches.length, 1);
    assert.deepEqual(error.report.failedBatch, { fromBlock: '102', toBlock: '103' });
    return true;
  });
  assert.equal(storage.batches.length, 1);
});

test('changing final header prevents write', async () => {
  const rpc = new FixtureRpc(); let reads = 0;
  rpc.override = (method, params) => {
    if (method === 'eth_getBlockByNumber' && params[0] === '0x65' && ++reads === 2) {
      return { number: '0x65', hash: hash(999), parentHash: hash(100), timestamp: '0x1', transactions: [] };
    }
    return undefined;
  };
  const storage = new RecordingStorage();
  await assert.rejects(scan(config(), rpc, storage), (error: unknown) => error instanceof ScanError && error.report.error?.code === 'BLOCK_CHANGED');
  assert.equal(storage.batches.length, 0);
});

test('HTTP JSON-RPC transport reads synthetic logs through scanner', async (t) => {
  const fixture = new FixtureRpc(); fixture.logs = [rpcLog()];
  const { url, server } = await serveRpc(({ method, params }) => fixture.call(method, params));
  t.after(() => server.close());
  const storage = new RecordingStorage();
  const report = await scan(config(), new HttpRpc(url), storage);
  assert.equal(report.status, 'completed');
  assert.equal(storage.batches[0]!.logs[0]!.decode.status, 'decoded');
});

test('RPC HTTP failures redact URL paths and body; prior batches remain explicit', async (t) => {
  const { url, server } = await serveRpc(() => { throw new Error('secret body'); });
  t.after(() => server.close());
  await assert.rejects(scan(config(), new HttpRpc(url), new RecordingStorage()), (error: unknown) => {
    assert.ok(error instanceof ScanError);
    assert.equal(error.report.error?.code, 'RPC_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(error.report), /rpc-secret|secret body/);
    return true;
  });
});
