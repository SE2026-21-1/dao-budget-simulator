import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { measureJson, metrics } from '../../scripts/be08_measurement.mjs';

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
