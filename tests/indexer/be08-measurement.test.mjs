import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { measureJson, metrics, finalizeLoad } from '../../scripts/be08_measurement.mjs';

test('BE08 latency includes delayed body; wrong JSON content and timeouts are failed samples', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    const delay = req.url === '/timeout' ? 500 : 100;
    const timer = setTimeout(() => res.end('{"count":100}'), delay);
    res.on('close', () => clearTimeout(timer));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = await measureJson(url, (data, status) => { assert.equal(status, 200); assert.equal(data.count, 100); });
    assert.equal(body.ok, true); assert.ok(body.latencyMs >= 90);
    const wrong = await measureJson(url, data => assert.equal(data.count, 1000));
    assert.equal(wrong.ok, false); assert.equal(wrong.status, 200); assert.ok(wrong.error);
    const timeout = await measureJson(url + '/timeout', () => {}, { timeoutMs: 50 });
    assert.equal(timeout.ok, false); assert.equal(timeout.status, 200); assert.equal(timeout.errorName, 'TimeoutError');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('BE08 exact nearest-rank p95 preserves the 20-sample tail boundary and empty results', () => {
  const samples = Array.from({ length: 20 }, (_, i) => i + 1).reverse();
  assert.deepEqual(metrics(samples), { count: 20, p95Ms: 19, maxMs: 20 });
  assert.deepEqual(metrics([]), { count: 0, p95Ms: null, maxMs: null });
  assert.deepEqual(metrics([7]), { count: 1, p95Ms: 7, maxMs: 7 });
});

test('failed freshness retains HTTP counts/percentiles as diagnostics without accepting the load', () => {
  const load = { rawSamples: [
    [0, 0, 'list', null, 0, 10, 200, true],
    [1, 0, 'summary', null, 0, 20, 200, true],
  ], errors: [], elapsedIncludingDrainMs: 60_000 };
  finalizeLoad(load, ['list', 'summary'], true);
  assert.equal(load.successfulRequests, 2);
  assert.equal(load.errorRequests, 0);
  assert.deepEqual(load.httpStatuses, { 200: 2 });
  assert.deepEqual(load.global, { count: 2, p95Ms: 20, maxMs: 20 });
  assert.equal(load.metricScope, 'diagnostic_failed_http_load');
  assert.equal(load.status, 'FAIL');
  finalizeLoad(load, ['list', 'summary']);
  assert.equal(load.status, 'PASS');
  load.rawSamples.push([2, 0, 'list', null, 0, 1, 503, false]);
  load.errors.push({ endpoint: 'list' });
  finalizeLoad(load, ['list', 'summary']);
  assert.equal(load.errorRequests, 1);
  assert.equal(load.endpoints.list.errors, 1);
  assert.equal(load.status, 'FAIL');
});
