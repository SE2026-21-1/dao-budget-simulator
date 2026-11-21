import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { IndexerError, publicError } from '../../indexer/errors.js';
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
  let requests = 0;
  const { url, server } = await serveRpc(() => { requests++; throw new Error('secret body'); });
  t.after(() => server.close());
  await assert.rejects(scan(config(), new HttpRpc(url, 30_000, { maxAttempts: 3, sleep: async () => {} }), new RecordingStorage()), (error: unknown) => {
    assert.ok(error instanceof ScanError);
    assert.equal(error.report.error?.code, 'RPC_HTTP_ERROR');
    assert.equal(error.report.error && 'retryable' in error.report.error && error.report.error.retryable, true);
    assert.doesNotMatch(JSON.stringify(error.report), /rpc-secret|secret body/);
    return true;
  });
  assert.equal(requests, 3);
});

for (const status of [408, 429, 500, 501, 502, 503, 504, 505]) test(`RPC retries HTTP ${status}, releasing the body before recovering`, async (t) => {
  let requests = 0;
  let cancelled = false;
  const delays: number[] = [];
  const transport: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.id, 1);
    assert.equal(request.method, 'eth_chainId');
    if (++requests === 1) {
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
    }
    assert.equal(cancelled, true);
    return Response.json({ jsonrpc: '2.0', id: request.id, result: '0x7a69' });
  };
  t.mock.method(globalThis, 'fetch', transport);
  const rpc = new HttpRpc('https://provider.invalid/rpc-secret', 100, { random: () => 1, sleep: async (delay) => { delays.push(delay); } });
  assert.equal(await rpc.call('eth_chainId', []), '0x7a69');
  assert.equal(requests, 2);
  assert.deepEqual(delays, [250]);
});

test('RPC transport exhaustion is bounded and never exposes URL, params or provider errors', async (t) => {
  let requests = 0;
  const delays: number[] = [];
  const transport: typeof fetch = async () => { requests++; throw new TypeError('provider-secret https://user:password@provider.invalid/rpc-secret'); };
  t.mock.method(globalThis, 'fetch', transport);
  const rpc = new HttpRpc('https://user:password@provider.invalid/rpc-secret', 100, { maxAttempts: 3, random: () => 1, sleep: async (delay) => { delays.push(delay); } });
  await assert.rejects(rpc.call('eth_call', ['params-secret']), (error: unknown) => {
    assert.ok(error instanceof IndexerError);
    assert.equal(error.code, 'RPC_UNAVAILABLE');
    assert.deepEqual(publicError(error), { code: error.code, message: error.message, retryable: true });
    assert.doesNotMatch(String(error), /provider-secret|password|rpc-secret|params-secret/);
    return true;
  });
  assert.equal(requests, 3);
  assert.deepEqual(delays, [250, 500]);
});

for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'evm_increaseTime', 'anvil_mine']) {
  test(`RPC never replays ${method} after a lost response`, async (t) => {
    let applied = 0;
    const transport: typeof fetch = async () => {
      applied++;
      throw new TypeError('connection lost after applying request');
    };
    t.mock.method(globalThis, 'fetch', transport);
    const rpc = new HttpRpc('https://provider.invalid', 100, {
      sleep: async () => { assert.fail('Potentially mutating RPC requests must not back off or replay'); },
    });
    await assert.rejects(rpc.call(method, []), (error: unknown) => {
      assert.ok(error instanceof IndexerError);
      assert.equal(error.code, 'RPC_UNAVAILABLE');
      assert.deepEqual(publicError(error), { code: error.code, message: error.message });
      return true;
    });
    assert.equal(applied, 1);
  });
}

test('RPC recovers from a transport failure', async (t) => {
  let requests = 0;
  const transport: typeof fetch = async () => {
    if (++requests === 1) throw new TypeError('network failed');
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });
  };
  t.mock.method(globalThis, 'fetch', transport);
  assert.equal(await new HttpRpc('https://provider.invalid', 100, { sleep: async () => {} }).call('eth_chainId', []), '0x1');
  assert.equal(requests, 2);
});

for (const [retryAfter, delay] of [
  ['1', 1_000], ['99999999999999999999999999999', 2_000],
  ['Sun, 25 Oct 2026 00:00:01 GMT', 1_000], ['Mon, 26 Oct 2026 00:00:00 GMT', 2_000],
  ['Sat, 24 Oct 2026 00:00:00 GMT', 250], ['invalid-secret', 250],
] as const) test(`RPC Retry-After ${retryAfter} has a bounded delay`, async (t) => {
  let requests = 0;
  const delays: number[] = [];
  const transport: typeof fetch = async () => ++requests === 1
    ? new Response('provider-secret', { status: 429, headers: { 'retry-after': retryAfter } })
    : Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' });
  t.mock.method(globalThis, 'fetch', transport);
  const rpc = new HttpRpc('https://provider.invalid', 100, {
    now: () => Date.UTC(2026, 9, 25), random: () => 1,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  assert.equal(await rpc.call('eth_chainId', []), '0x1');
  assert.equal(requests, 2);
  assert.deepEqual(delays, [delay]);
});

for (const status of [400, 401, 403, 404]) test(`RPC never retries permanent HTTP ${status}`, async (t) => {
  let requests = 0;
  const transport: typeof fetch = async () => { requests++; return new Response('provider-secret', { status }); };
  t.mock.method(globalThis, 'fetch', transport);
  const rpc = new HttpRpc('https://provider.invalid/rpc-secret', 100, {
    sleep: async () => { assert.fail('Permanent HTTP errors must not back off'); },
  });
  await assert.rejects(rpc.call('eth_chainId', []), (error: unknown) => {
    assert.ok(error instanceof IndexerError);
    assert.equal(error.code, 'RPC_HTTP_ERROR');
    assert.deepEqual(publicError(error), { code: error.code, message: error.message });
    assert.doesNotMatch(String(error), /provider-secret|rpc-secret/);
    return true;
  });
  assert.equal(requests, 1);
});

for (const [body, code] of [
  ['not-json provider-secret', 'RPC_INVALID_RESPONSE'],
  ['null', 'RPC_INVALID_RESPONSE'],
  [JSON.stringify({ jsonrpc: '1.0', id: 1, result: 'provider-secret' }), 'RPC_INVALID_RESPONSE'],
  [JSON.stringify({ jsonrpc: '2.0', id: 999, result: 'provider-secret' }), 'RPC_INVALID_RESPONSE'],
  [JSON.stringify({ jsonrpc: '2.0', id: 1 }), 'RPC_INVALID_RESPONSE'],
  [JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'provider-secret' } }), 'RPC_ERROR'],
] as const) test(`RPC never retries malformed envelopes or JSON-RPC errors: ${body}`, async (t) => {
  let requests = 0;
  const transport: typeof fetch = async () => { requests++; return new Response(body); };
  t.mock.method(globalThis, 'fetch', transport);
  const rpc = new HttpRpc('https://provider.invalid/rpc-secret', 100, {
    sleep: async () => { assert.fail('Invalid RPC responses must not back off'); },
  });
  await assert.rejects(rpc.call('eth_chainId', []), (error: unknown) => {
    assert.ok(error instanceof IndexerError);
    assert.equal(error.code, code);
    assert.deepEqual(publicError(error), { code: error.code, message: error.message });
    assert.doesNotMatch(String(error), /provider-secret|rpc-secret/);
    return true;
  });
  assert.equal(requests, 1);
});

for (const phase of ['headers', 'body']) test(`RPC timeout covers stalled response ${phase} and recovers within the attempt bound`, async (t) => {
  let requests = 0;
  const server = createServer((_req, res) => {
    if (++requests < 3) {
      if (phase === 'body') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"jsonrpc":"2.0","id":1,"result":');
      }
      return;
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }));
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const bound = server.address();
  assert.ok(bound && typeof bound !== 'string');
  const delays: number[] = [];
  const rpc = new HttpRpc(`http://127.0.0.1:${bound.port}/rpc-secret`, 200, { random: () => 1, sleep: async (delay) => { delays.push(delay); } });
  assert.equal(await rpc.call('eth_chainId', []), '0x1');
  assert.equal(requests, 3);
  assert.deepEqual(delays, [250, 500]);
});
