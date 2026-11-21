import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { HttpRpc } from '../../indexer/rpc.ts';
import { summarizeOutageCalls } from '../../scripts/be08_rpc_outage.mjs';

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

function outageTrace(counts = [4, 4, 4], gapMs = 150) {
  let time = 0;
  return counts.flatMap((count, index) => Array.from({ length: count }, () => ({
    id: index + 1, method: index === 0 ? 'eth_call' : 'eth_chainId',
    params: index === 0 ? [{ to: '0x1' }, 'latest'] : [],
    monotonicMs: time += gapMs, httpStatus: 503,
  })));
}

test('outage accounting groups interleaved retries from bounded projection fan-out', () => {
  const attempts = [];
  let monotonicMs = 0;
  for (const round of [[1, 2, 3, 4], [3, 1, 4, 2], [2, 4, 1, 3], [3, 2, 1, 4]]) {
    for (const id of round) attempts.push({
      id, method: 'eth_call', params: [{ to: `0x${id}` }, 'latest'],
      monotonicMs: monotonicMs += 150, httpStatus: 503,
    });
  }
  const calls = summarizeOutageCalls(attempts);
  assert.deepEqual(calls.map(({ id, attempts: count }) => ({ id, attempts: count })),
    [1, 2, 3, 4].map(id => ({ id, attempts: 4 })));
});

test('outage accounting accepts two exhausted calls before one worker error without stdout timing', () => {
  // One worker_error can follow multiple exhausted logical RPC calls; it is not
  // itself a boundary between the requests recorded by the HTTP proxy.
  const calls = summarizeOutageCalls(outageTrace());
  assert.deepEqual(calls.map(({ method, attempts }) => ({ method, attempts })), [
    { method: 'eth_call', attempts: 4 }, { method: 'eth_chainId', attempts: 4 },
    { method: 'eth_chainId', attempts: 4 },
  ]);
  assert.deepEqual(summarizeOutageCalls(outageTrace([2, 4, 1]),
    { startedAtMs: 0, endedAtMs: 1200, boundaryWindowMs: 300 }).map(c => c.attempts), [2, 4, 1]);
});

test('outage accounting still rejects an over-budget call, missing retries and absent backoff', () => {
  for (const counts of [[5, 4, 4], [4, 5, 4], [4, 4, 5]])
    assert.throws(() => summarizeOutageCalls(outageTrace(counts)), /must remain bounded/);
  assert.throws(() => summarizeOutageCalls(outageTrace([4, 3, 4]),
    { startedAtMs: 0, endedAtMs: 4000, boundaryWindowMs: 300 }), /exhaust four attempts/);
  assert.throws(() => summarizeOutageCalls(outageTrace([4, 4, 4], 0)), /positive backoff/);
});

test('outage accounting rejects a reused call ID or changed method/params within a retry', () => {
  const reused = outageTrace(); reused.at(-1).id = 1;
  assert.throws(() => summarizeOutageCalls(reused), /reuse a completed RPC call ID/);
  const method = outageTrace(); method[1].method = 'eth_blockNumber';
  assert.throws(() => summarizeOutageCalls(method), /preserve method/);
  const params = outageTrace(); params[1].params = [];
  assert.throws(() => summarizeOutageCalls(params), /preserve params/);
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
