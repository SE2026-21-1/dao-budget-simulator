import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { installProviderObserver } from '../../scripts/qa07_provider_observer.mjs';

// Mock-only regression evidence; never a replacement for accepted live evidence.
function setup(request, sink = () => {}) {
  const provider = new EventEmitter();
  provider.request = request;
  const window = new EventTarget();
  Object.assign(window, { ethereum: provider, location: { origin: 'http://unit.invalid' }, __qa07Record: sink });
  const context = vm.createContext({ window, document: { readyState: 'loading' }, performance });
  vm.runInContext(`(${installProviderObserver.toString()})(${JSON.stringify({ runId: 'mock-p2', sourceCommit: 'unit', origin: window.location.origin })})`, context);
  return { provider, snapshot: () => window.__qa07Observer.snapshot(), window };
}
function incomplete(capture, stage) {
  const snapshot = capture.snapshot();
  assert.equal(snapshot.observation.complete, false);
  assert.ok(snapshot.observation.failures.some(f => f.stage === stage));
  return snapshot;
}

test('P2 BigInt request reaches original once and preserves provider rejection', async () => {
  const args = { method: 'eth_call', params: [1n] };
  const refusal = Object.assign(new Error('provider-owned refusal'), { code: -32602, data: { reason: 'invalid params' } });
  let calls = 0;
  const capture = setup(function (received) {
    calls++;
    assert.equal(this, capture.provider);
    assert.equal(received, args);
    assert.equal(received.params[0], 1n);
    return Promise.reject(refusal);
  });
  let observed;
  try { await capture.provider.request(args); } catch (error) { observed = error; }
  console.log(JSON.stringify({ originalProviderCalls: calls, sameProviderError: observed === refusal, errorName: observed?.name, message: observed?.message }));
  assert.equal(calls, 1);
  assert.equal(observed, refusal);
  const snapshot = incomplete(capture, 'request');
  assert.ok(snapshot.entries.some(e => e.kind === 'observation-failure'));
  assert.ok(!snapshot.entries.some(e => e.kind === 'request'));
});

test('BigInt request preserves success identity and exact payload without retry', async () => {
  const args = { method: 'eth_call', params: [1n] };
  const result = { answer: 42 };
  let calls = 0;
  const capture = setup(function (received) { calls++; assert.equal(this, capture.provider); assert.equal(received, args); return result; });
  assert.equal(await capture.provider.request(args), result);
  assert.equal(calls, 1);
  assert.equal(args.params[0], 1n);
  incomplete(capture, 'request');
});

for (const kind of ['BigInt', 'circular', 'throwing toJSON']) {
  test(`non-serializable ${kind} result retains exact identity`, async () => {
    const result = kind === 'BigInt' ? { value: 1n } : kind === 'circular' ? {} : { toJSON() { throw new Error('serialization failed'); } };
    if (kind === 'circular') result.self = result;
    let calls = 0;
    const capture = setup(async () => { calls++; return result; });
    assert.equal(await capture.provider.request({ method: 'eth_accounts' }), result);
    assert.equal(calls, 1);
    incomplete(capture, 'response');
  });
}

for (const synchronous of [true, false]) {
  test(`provider-owned error survives ${synchronous ? 'synchronous throw' : 'asynchronous rejection'} and non-serializable data`, async () => {
    const data = { value: 1n }; data.self = data;
    const error = Object.assign(new Error('owned'), { code: 4001, data });
    let calls = 0;
    const capture = setup(() => { calls++; if (synchronous) throw error; return Promise.reject(error); });
    const invoke = () => capture.provider.request({ method: 'eth_accounts' });
    if (synchronous) assert.throws(invoke, actual => actual === error);
    else await assert.rejects(invoke(), actual => actual === error);
    assert.equal(calls, 1);
    assert.equal(error.code, 4001);
    assert.equal(error.message, 'owned');
    assert.equal(error.data, data);
    incomplete(capture, 'error');
  });
}

for (const mode of ['throw', 'reject', 'missing', 'getter', 'one-record']) {
  test(`sink ${mode} cannot reject, retry or mutate a successful provider request`, async () => {
    let calls = 0;
    const result = ['0xabc'];
    const sink = entry => {
      if (mode === 'throw' || (mode === 'one-record' && entry.kind === 'request')) throw new Error('sink unavailable');
      if (mode === 'reject') return Promise.reject(new Error('sink rejected'));
      entry.kind = 'sink-mutated';
    };
    const capture = setup(async () => { calls++; return result; }, mode === 'missing' ? null : sink);
    if (mode === 'getter') Object.defineProperty(capture.window, '__qa07Record', { get() { throw new Error('sink getter'); } });
    assert.equal(await capture.provider.request({ method: 'eth_accounts' }), result);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    const snapshot = incomplete(capture, 'sink');
    assert.ok(snapshot.entries.some(e => e.kind === 'request'));
    assert.ok(snapshot.entries.some(e => e.kind === 'response'));
    assert.equal(snapshot.observation.pendingSinkWrites, 0);
  });
}

for (const event of ['accountsChanged', 'chainChanged', 'connect', 'disconnect']) {
  test(`${event} serialization and sink failures preserve application listeners and payload`, () => {
    const capture = setup(async () => [], () => { throw new Error('sink'); });
    const payload = { value: 1n }; payload.self = payload;
    const received = [];
    const listener = value => received.push(value);

    capture.provider.on(event, listener);
    assert.equal(capture.provider.emit(event, payload), true);
    assert.equal(received[0], payload);
    capture.provider.removeListener(event, listener);
    capture.provider.emit(event, payload);
    assert.equal(received.length, 1);
    incomplete(capture, 'event');
  });
}

test('throwing request metadata getter cannot prevent original invocation', async () => {
  const args = { get method() { throw new Error('metadata inaccessible'); } };
  let calls = 0;
  const capture = setup(async received => { calls++; assert.equal(received, args); return 'ok'; });
  assert.equal(await capture.provider.request(args), 'ok');
  assert.equal(calls, 1);
  incomplete(capture, 'request');
});

test('pending sink delivery is not reported complete; a later rejection remains explicit', async () => {
  let reject;
  const capture = setup(async () => 'ok', () => new Promise((_, fail) => { reject = fail; }));
  const pending = capture.snapshot();
  assert.equal(pending.observation.complete, false);
  assert.ok(pending.observation.pendingSinkWrites > 0);
  reject(new Error('late sink failure'));
  await new Promise(resolve => setImmediate(resolve));
  incomplete(capture, 'sink');
});

test('JSON-safe request/response sequence and successful delivery remain complete', async () => {
  const delivered = [];
  const result = ['0xabc'];
  const capture = setup(async () => result, entry => delivered.push(entry));
  assert.equal(await capture.provider.request({ method: 'eth_accounts', params: [] }), result);
  await new Promise(resolve => setImmediate(resolve));
  const snapshot = capture.snapshot();
  assert.equal(snapshot.observation.complete, true);
  assert.equal(snapshot.observation.failures.length, 0);
  assert.deepEqual(Array.from(snapshot.entries, e => e.sequence), [1, 2, 3, 4]);
  assert.equal(snapshot.entries[3].requestSequence, 3);
  assert.equal(JSON.stringify(snapshot.entries), JSON.stringify(delivered));
});
test('rejected sink preserves the original provider rejection', async () => {
  const refusal = Object.assign(new Error('provider refusal'), { code: 4001, data: { reason: 'denied' } });
  let calls = 0;
  const capture = setup(async () => { calls++; throw refusal; }, () => Promise.reject(new Error('sink')));
  await assert.rejects(capture.provider.request({ method: 'eth_accounts' }), error => error === refusal);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  incomplete(capture, 'sink');
});
