import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLiveTest, liveTestEnvironment } from '../../../scripts/be09-live-test.mjs';

const target = '/work/frontend/src/data/api.live.test.ts';
const runtime = { chainId: '31337', deploymentName: 'deployment-name', deploymentId: '42',
  urls: { api: 'http://127.0.0.1:3300', rpc: 'http://127.0.0.1:18545' } };
const result = statuses => ({ numTotalTests: statuses.length, numPassedTests: statuses.filter(s => s === 'passed').length,
  numFailedTests: statuses.filter(s => s === 'failed').length, numPendingTests: statuses.filter(s => s === 'skipped').length,
  numTodoTests: 0, success: !statuses.includes('failed'), testResults: [{ name: target,
    status: statuses.includes('failed') ? 'failed' : 'passed', assertionResults: statuses.map(status => ({ status })) }] });

test('live environment comes from runtime metadata and deployment name, not inherited env or numeric database id', () => {
  const env = liveTestEnvironment(runtime, { PATH: '/test', BE05_LIVE_DEPLOYMENT_ID: 'wrong' });
  assert.equal(env.BE05_LIVE_API_URL, runtime.urls.api);
  assert.equal(env.BE05_LIVE_CHAIN_ID, runtime.chainId);
  assert.equal(env.BE05_LIVE_DEPLOYMENT_ID, runtime.deploymentName);
  assert.equal(env.BE05_LIVE_RPC_URL, runtime.urls.rpc);
  assert.throws(() => liveTestEnvironment({ ...runtime, urls: { ...runtime.urls, rpc: '' } }), /BE05_LIVE_RPC_URL/);
});

test('Vitest structured results distinguish complete pass, failure and skips', () => {
  const ok = { status: 0, signal: null };
  assert.deepEqual(classifyLiveTest(ok, result(['passed']), target).counts, { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 });
  assert.equal(classifyLiveTest(ok, result(['passed']), target).status, 'PASS');
  assert.equal(classifyLiveTest(ok, result(['skipped']), target).status, 'SKIP');
  assert.equal(classifyLiveTest(ok, result(['passed', 'skipped']), target).status, 'SKIP');
  assert.equal(classifyLiveTest({ status: 1 }, result(['failed']), target).status, 'FAIL');
  assert.equal(classifyLiveTest({ status: 1 }, result(['passed']), target).status, 'FAIL');
  assert.equal(classifyLiveTest({ status: null, error: new Error('spawn failed') }, null, target).status, 'FAIL');
  assert.equal(classifyLiveTest(ok, null, target).status, 'FAIL');
  assert.equal(classifyLiveTest(ok, result([]), target).status, 'FAIL');
  assert.equal(classifyLiveTest(ok, result(['passed']), '/wrong/file').status, 'FAIL');
  assert.equal(classifyLiveTest(ok, { ...result(['passed']), numPassedTests: 0 }, target).status, 'FAIL');
});
