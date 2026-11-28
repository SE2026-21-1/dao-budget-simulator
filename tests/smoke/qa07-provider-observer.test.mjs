import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installProviderObserver } from '../../scripts/qa07_provider_observer.mjs';

// Mock providers validate the observer only; these tests are NOT live extension evidence.
function setup(provider) {
  const window = new EventTarget();
  window.location = { origin: 'http://127.0.0.1:12345' };
  window.ethereum = provider;
  const delivered = [];
  window.__qa07Record = entry => { delivered.push(entry); };
  const context = vm.createContext({ window, document: { readyState: 'loading' }, performance });
  vm.runInContext(`(${installProviderObserver.toString()})(${JSON.stringify({ runId: 'unit-not-live', sourceCommit: 'unit', origin: window.location.origin })})`, context);
  return { window, delivered, snapshot: () => window.__qa07Observer.snapshot() };
}
function announce(window, provider) {
  const event = new Event('eip6963:announceProvider');
  event.detail = { provider, info: { uuid: 'metamask-unit', name: 'Mock, NOT MetaMask', rdns: 'test.invalid' } };
  window.dispatchEvent(event);
}

test('records requests through the function cached after discovery, including sender after account switch', async () => {
  let current = ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const listeners = new Map();
  const requests = [];
  const provider = { on: (event, listener) => listeners.set(event, listener), async request(args) { requests.push(args); return args.method === 'eth_accounts' ? current : '0xtransaction'; } };
  const capture = setup(undefined);
  announce(capture.window, provider);
  const appCachedRequest = provider.request.bind(provider);
  await appCachedRequest({ method: 'eth_accounts' });
  current = ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];
  listeners.get('accountsChanged')(current);
  const args = { method: 'eth_sendTransaction', params: [{ from: current[0], to: current[0], data: '0x' }] };
  assert.equal(await appCachedRequest(args), '0xtransaction');
  assert.equal(requests.at(-1), args);
  const trace = capture.snapshot();
  const send = trace.entries.find(e => e.kind === 'request' && e.method === 'eth_sendTransaction');
  assert.equal(send.from, current[0]);
  assert.deepEqual(Array.from(send.params, x => x.from), current);
  assert.ok(trace.entries.find(e => e.event === 'accountsChanged').sequence < send.sequence);
  assert.equal(trace.providers[0].stillWrapped, true);
  assert.equal(capture.delivered.filter(e => e.kind === 'request').length, 2);
});

test('preserves exact real result and thrown error while redacting signing payloads', async () => {
  const reply = ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
  const refusal = Object.assign(new Error('signature request refused'), { code: 4001 });
  const provider = { async request(args) { if (args.method === 'personal_sign') throw refusal; return reply; } };
  const capture = setup(provider);
  assert.equal(await provider.request({ method: 'eth_accounts' }), reply);
  await assert.rejects(provider.request({ method: 'personal_sign', params: ['sensitive-message'] }), error => error === refusal);
  const entries = capture.snapshot().entries;
  assert.equal(entries.find(e => e.method === 'personal_sign' && e.kind === 'request').paramsRedacted, true);
  assert.ok(!JSON.stringify(entries).includes('sensitive-message'));
  assert.equal(entries.find(e => e.kind === 'error').code, 4001);
});

test('reports immutable provider as uncovered instead of treating its empty trace as no-send', async () => {
  let sends = 0;
  const provider = Object.freeze({ async request() { sends++; return 'sent'; } });
  const capture = setup(provider);
  assert.equal(await provider.request({ method: 'eth_sendTransaction' }), 'sent');
  const trace = capture.snapshot();
  assert.equal(sends, 1);
  assert.equal(trace.providers[0].installed, false);
  assert.ok(trace.entries.some(e => e.kind === 'observer-unavailable'));
  assert.ok(!trace.entries.some(e => e.kind === 'request'));
});

test('detects wrapper replacement so later zero entries cannot claim continuous coverage', () => {
  const provider = { async request() { return []; } };
  const capture = setup(provider);
  provider.request = async () => [];
  assert.equal(capture.snapshot().providers[0].stillWrapped, false);
});
