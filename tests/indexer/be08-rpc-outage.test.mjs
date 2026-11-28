import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorkerProbe } from '../../scripts/be08_worker_probe.mjs';
import { HttpRpc } from '../../indexer/rpc.ts';
import { createOutageRpcRecorder, summarizeOutageCalls } from '../../scripts/be08_rpc_outage.mjs';

test('projection failure and recovery check are separate bounded RPC calls', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push(JSON.parse(raw));
    res.writeHead(503); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const rpc = new HttpRpc(`http://127.0.0.1:${server.address().port}`, 1000,
      { baseDelayMs: 0, maxDelayMs: 0 });
    // project() can exhaust an eth_call, then verify eth_chainId in its catch
    // before the outer worker emits its single worker_error.
    await assert.rejects(async () => {
      try { await rpc.call('eth_call', [{ to: '0x1' }, 'latest']); }
      catch { await rpc.call('eth_chainId', []); }
    }, /RPC HTTP status 503/);
    assert.equal(requests.length, 8);
    const groups = Map.groupBy(requests, request => request.id);
    assert.equal(groups.size, 2, 'A retry must retain the logical call ID');
    assert.deepEqual([...groups.values()].map(group => ({
      method: group[0].method, attempts: group.length,
    })), [{ method: 'eth_call', attempts: 4 }, { method: 'eth_chainId', attempts: 4 }]);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

const outageWindow = { startedAtMs: 1000, endedAtMs: 10_000 };

function request(id, monotonicMs, { offline = true, httpStatus = 503, method = 'eth_call',
  params = [{ to: `0x${id}` }, 'latest'] } = {}) {
  return { id, method, params, monotonicMs, httpStatus, offline };
}

function outageTrace(counts = [4, 4, 4], gapMs = 150) {
  let time = outageWindow.startedAtMs;
  return counts.flatMap((count, index) => Array.from({ length: count }, () => ({
    ...request(index + 1, time += gapMs, {
      method: index === 0 ? 'eth_call' : 'eth_chainId',
      params: index === 0 ? [{ to: '0x1' }, 'latest'] : [],
    }),
  })));
}

test('outage accounting groups interleaved retries from bounded projection fan-out', () => {
  const attempts = [];
  let monotonicMs = outageWindow.startedAtMs;
  for (const round of [[1, 2, 3, 4], [3, 1, 4, 2], [2, 4, 1, 3], [3, 2, 1, 4]]) {
    for (const id of round) attempts.push(request(id, monotonicMs += 150));
  }
  const calls = summarizeOutageCalls(attempts, outageWindow);
  assert.deepEqual(calls.map(({ id, attempts: count }) => ({ id, attempts: count })),
    [1, 2, 3, 4].map(id => ({ id, attempts: 4 })));
});

test('outage accounting accepts exhausted calls independently of worker stdout timing', () => {
  const calls = summarizeOutageCalls(outageTrace(), outageWindow);
  assert.deepEqual(calls.map(({ method, attempts }) => ({ method, attempts })), [
    { method: 'eth_call', attempts: 4 }, { method: 'eth_chainId', attempts: 4 },
    { method: 'eth_chainId', attempts: 4 },
  ]);
});

test('outage recorder preserves same-ID attempts before and after the window', () => {
  const recorder = createOutageRpcRecorder();
  recorder.record(request(11, 850, { offline: false }));
  recorder.record(request(11, 1000));
  recorder.record(request(11, 1150));
  recorder.record(request(11, 1300));
  recorder.record(request(12, 9700));
  recorder.record(request(12, 9850));
  recorder.record(request(12, 10_150, { offline: false, httpStatus: 200 }));
  recorder.record(request(99, 900, { offline: false, httpStatus: 200 }));

  assert.deepEqual(recorder.outageIds, new Set([11, 12]));
  assert.deepEqual([...recorder.completedOutageIds], [11, 12]);
  assert.deepEqual(recorder.lifecycleAttempts.map(({ id, monotonicMs }) => [id, monotonicMs]), [
    [11, 850], [11, 1000], [11, 1150], [11, 1300], [12, 9700], [12, 9850], [12, 10_150],
  ]);
  assert.deepEqual(recorder.outageAttempts.map(({ id }) => id), [11, 11, 11, 12, 12]);
  assert.deepEqual(summarizeOutageCalls(recorder.lifecycleAttempts, outageWindow)
    .map(({ id, attempts, clippedAtStart, clippedAtEnd }) => ({ id, attempts, clippedAtStart, clippedAtEnd })),
  [
    { id: 11, attempts: 3, clippedAtStart: true, clippedAtEnd: false },
    { id: 12, attempts: 2, clippedAtStart: false, clippedAtEnd: true },
  ]);
});

test('partial retries require same-ID attempts proving the call crossed an outage boundary', () => {
  const clippedAtStart = [
    request(21, 850, { offline: false }),
    request(21, 1000),
    request(21, 1150),
    request(21, 1300),
  ];
  assert.deepEqual(summarizeOutageCalls(clippedAtStart, { startedAtMs: 1000, endedAtMs: 5000 })
    .map(({ attempts, clippedAtStart: clipped }) => ({ attempts, clipped })), [{ attempts: 3, clipped: true }]);

  const clippedAtEnd = [
    request(22, 9700),
    request(22, 9850),
    request(22, 10_000),
    request(22, 10_150, { offline: false, httpStatus: 200 }),
  ];
  assert.deepEqual(summarizeOutageCalls(clippedAtEnd, outageWindow)
    .map(({ attempts, clippedAtEnd: clipped }) => ({ attempts, clipped })), [{ attempts: 3, clipped: true }]);
});

test('calls fully contained in the outage fail even when fewer retries sit within five seconds of a boundary', () => {
  const nearStart = [1000, 1150, 1300].map(time => request(31, time));
  const nearEnd = [9700, 9850, 10_000].map(time => request(32, time));
  assert.throws(() => summarizeOutageCalls(nearStart, outageWindow), /same-ID evidence outside/);
  assert.throws(() => summarizeOutageCalls(nearEnd, outageWindow), /same-ID evidence outside/);
  assert.throws(() => summarizeOutageCalls([...nearStart, request(99, 900, { offline: false })], outageWindow),
    /same-ID evidence outside/, 'An unrelated request ID cannot establish a boundary crossing');
});

test('outage accounting rejects an over-budget call, missing retries, invalid windows and absent backoff', () => {
  for (const counts of [[5, 4, 4], [4, 5, 4], [4, 4, 5]])
    assert.throws(() => summarizeOutageCalls(outageTrace(counts), outageWindow), /must remain bounded/);
  assert.throws(() => summarizeOutageCalls(outageTrace([4, 3, 4]), outageWindow), /same-ID evidence outside/);
  assert.throws(() => summarizeOutageCalls(outageTrace([4, 4, 4], 0), outageWindow), /positive backoff/);
  assert.throws(() => summarizeOutageCalls(outageTrace(), { startedAtMs: 100, endedAtMs: 99 }),
    /Both outage window timestamps/);
  assert.throws(() => summarizeOutageCalls(outageTrace().map(({ offline: _offline, ...attempt }) => attempt),
    outageWindow), /RPC outage state is required/);
});

test('outage accounting rejects a reused call ID or changed method/params within a retry', () => {
  const reused = outageTrace(); reused.at(-1).id = 1;
  assert.throws(() => summarizeOutageCalls(reused, outageWindow), /reuse a completed RPC call ID/);
  const method = outageTrace(); method[1].method = 'eth_blockNumber';
  assert.throws(() => summarizeOutageCalls(method, outageWindow), /preserve method/);
  const params = outageTrace(); params[1].params = [];
  assert.throws(() => summarizeOutageCalls(params, outageWindow), /preserve params/);
});

test('concurrent identical RPC calls have distinct IDs while each retry keeps its ID', async () => {
  const requests = [];
  const counts = new Map();
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push(body);
    const count = (counts.get(body.id) ?? 0) + 1; counts.set(body.id, count);
    if (count < 2) { res.writeHead(503); res.end(); return; }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x7a69' }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const rpc = new HttpRpc(`http://127.0.0.1:${server.address().port}`, 1000,
      { baseDelayMs: 0, maxDelayMs: 0 });
    assert.deepEqual(await Promise.all([rpc.call('eth_chainId', []), rpc.call('eth_chainId', [])]),
      ['0x7a69', '0x7a69']);
    assert.equal(counts.size, 2); assert.equal(requests.length, 4);
    assert.deepEqual([...counts.values()], [2, 2]);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

// Synthetic worker shutdown, real probe finalization. No retry timers or wall-clock
// races: the fifth request is released only after the initial snapshot was checked.
for (const boundary of [false, true]) {
  for (const lateFifth of [false, true]) {
    test(`final worker trace ${lateFifth ? 'rejects late fifth attempt' : 'accepts bounded interleaving'}${boundary ? ' across outage boundary' : ''}`, async () => {
      const recorder = createOutageRpcRecorder();
      const times = boundary ? [9700, 9850, 10_000, 10_150] : [1000, 1150, 1300, 1450];
      for (const time of times) {
        for (const id of [71, 72, 73, 74, 75])
          recorder.record(request(id, time, { offline: time <= outageWindow.endedAtMs }));
      }
      const snapshot = summarizeOutageCalls(recorder.lifecycleAttempts, outageWindow);
      assert.equal(snapshot.length, 5);
      const directory = await mkdtemp(join(tmpdir(), 'be08-final-trace-test-'));
      const child = new EventEmitter();
      Object.assign(child, { exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
      child.kill = () => {
        if (lateFifth) recorder.record(request(71, 10_300, { offline: false, httpStatus: 200 }));
        // A distinct new request with identical method/params remains legitimate.
        recorder.record(request(76, 10_450, { offline: false, httpStatus: 200, params: [{ to: '0x71' }, 'latest'] }));
        child.exitCode = 0;
        child.emit('close', 0, null);
      };
      const report = {};
      const probe = await startWorkerProbe({
        scope: { temporaryDirectory: async () => directory, spawn: () => child, throwIfInterrupted() {} },
        root: directory, dbUrl: 'unused', rpc: async () => 'unused', config: {}, report,
      });
      const state = report.freshness;
      state.idle = state.load = { count: 10 };
      state.outage = { status: 'AWAITING_FINAL_TRACE', window: outageWindow, retryCycles: snapshot,
        rpcLifecycle: recorder.lifecycleAttempts, httpAttempts: recorder.outageAttempts };
      try {
        if (lateFifth) {
          await assert.rejects(probe.close(), /must remain bounded/);
          assert.equal(state.outage.status, 'FAIL');
          assert.equal(state.status, 'FAIL');
          assert.equal(state.outage.rpcLifecycle.filter(call => call.id === 71).length, 5);
          assert.equal(state.outage.retryCycles, undefined, 'Do not retain a stale passing summary');
          await assert.rejects(probe.close(), /must remain bounded/, 'Repeated close must retain failure');
        } else {
          await probe.close();
          assert.equal(state.outage.status, 'PASS');
          assert.equal(state.status, 'PASS');
          assert.deepEqual(state.outage.retryCycles.map(call => [call.id, call.attempts]),
            [71, 72, 73, 74, 75].map(id => [id, boundary ? 3 : 4]));
          await probe.close();
        }
      } finally {
        await probe.close().catch(() => {});
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
}
