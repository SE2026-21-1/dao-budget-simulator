import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApiServer } from '../../indexer/api/server.ts';
import { responseValidator } from './contract.mjs';

test('serves a valid six-operation contract and local Swagger UI without PostgreSQL', async (t) => {
  const server = createApiServer({
    pool: { connect: () => { throw new Error('Database offline'); } },
    cursorSecret: 'x'.repeat(32),
    corsOrigins: 'http://localhost:5173',
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const redirect = await fetch(base + '/docs', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/docs/');
  const docs = await fetch(base + '/docs');
  assert.equal(docs.status, 200);
  const html = await docs.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => new URL(match[1], docs.url));
  assert.equal(assets.length, 3);
  for (const url of assets) {
    assert.equal(url.origin, base);
    const asset = await fetch(url);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), url.pathname.endsWith('.css') ? /^text\/css/ : /^text\/javascript/);
    const source = await asset.text();
    assert.ok(source.length > 50);
    if (url.pathname.endsWith('/init.js')) assert.match(source, /validatorUrl: null/);
  }

  const response = await fetch(base + '/openapi.json');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const spec = await response.json();
  const paths = ['/api/health', '/api/summary', '/api/proposals', '/api/proposals/{id}', '/api/proposals/{id}/votes', '/api/treasury/transfers'];
  assert.deepEqual(Object.keys(spec.paths).sort(), paths.sort());
  assert.deepEqual(spec.servers, [{ url: '/' }]);
  assert.equal(new Set(Object.values(spec.paths).map(path => path.get.operationId)).size, 6);
  assert.equal(spec.paths['/api/health'].get.responses['409'], undefined);
  const deploymentName = new RegExp(spec.components.parameters.DeploymentId.schema.pattern, 'u');
  assert.ok(deploymentName.test('qa07-e2e'));
  for (const name of [' qa07-e2e', 'qa07-e2e ', 'qa07\u0001e2e']) {
    assert.equal(deploymentName.test(name), false);
    const response = await fetch(base + '/api/health?' + new URLSearchParams({ chainId: '31337', deploymentId: name }));
    assert.equal(response.status, 400);
  }
  const validate = await responseValidator(spec);
  for (const [path, { get }] of Object.entries(spec.paths)) {
    for (const [status, value] of Object.entries(get.responses)) {
      const resolved = value.$ref ? spec.components.responses[value.$ref.split('/').at(-1)] : value;
      const example = resolved.content['application/json'].example;
      if (example !== undefined) validate(path, status, example);
    }
  }
  const queries = '?chainId=31337&deploymentId=qa07-e2e';
  for (const [path, expected] of [['/api/health', 503], ['/api/summary', 503], ['/api/proposals', 503]]) {
    const response = await fetch(base + path + queries);
    assert.equal(response.status, expected);
    const body = await response.json();
    validate(path, expected, body);
    if (path === '/api/health') {
      assert.throws(() => validate('/api/summary', 503, body), /error/);
    } else {
      assert.throws(() => validate('/api/health', 503, body), /data/);
      assert.throws(() => validate(path, 503, { ...body, error: { ...body.error, code: 'INVALID_ARGUMENT' } }), /code/);
      assert.throws(() => validate(path, 503, { ...body, error: { ...body.error, retryable: false } }), /retryable/);
    }
  }
  const denied = await fetch(base + '/api/health' + queries, { headers: { origin: 'http://localhost:5174' } });
  assert.equal(denied.status, 403);
  validate('/api/health', 403, await denied.json());
});
