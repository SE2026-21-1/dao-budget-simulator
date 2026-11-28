#!/usr/bin/env node
// Observer-only harness. The wallet remains a real extension; no provider adapter is injected.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installProviderObserver } from './qa07_provider_observer.mjs';

const [endpoint, handoffPath, outputPath, extensionId] = process.argv.slice(2);
assert.ok(/^ws:\/\/127\.0\.0\.1:\d+\//.test(endpoint ?? ''), 'Owned numeric-loopback CDP endpoint required');
assert.match(extensionId ?? '', /^[a-p]{32}$/);
assert.ok(process.env.QA07_PUPPETEER_MODULE, 'Set external QA07_PUPPETEER_MODULE; no project dependency changes');
const { default: puppeteer } = await import(pathToFileURL(resolve(process.env.QA07_PUPPETEER_MODULE)).href);
const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
assert.equal(handoff.chainId, '31337');
for (const key of ['frontendUrl', 'apiUrl', 'rpcUrl']) assert.equal(new URL(handoff[key]).hostname, '127.0.0.1');
const output = resolve(outputPath);
await mkdir(output, { mode: 0o700 });
const runId = `TV3-MM-boundary-${new Date().toISOString().replaceAll(/[-:.]/g, '')}`;
const sourceCommit = handoff.sourceCommit;
const header = { runId, sourceCommit, startedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], observerSha256: createHash('sha256').update(await readFile(new URL('./qa07_provider_observer.mjs', import.meta.url))).digest('hex'), handoff };
await copyFile(handoffPath, join(output, 'handoff.json'));
const manifest = await readFile(join(dirname(handoffPath), 'manifest.json'));
assert.equal(createHash('sha256').update(manifest).digest('hex'), handoff.manifestSha256);
await writeFile(join(output, 'manifest.json'), manifest);
await writeFile(join(output, 'run.json'), JSON.stringify(header, null, 2) + '\n');
const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
const writes = new Set();
const pending = new Set();
const saveLine = (name, data) => {
  const job = appendFile(join(output, name), JSON.stringify(data) + '\n');
  writes.add(job);
  job.catch(error => { console.error(`EVIDENCE_WRITE_FAILURE ${error.message}`); process.exitCode = 1; }).finally(() => writes.delete(job));
  return job;
};
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
await page.exposeFunction('__qa07Record', entry => saveLine('provider-trace.jsonl', entry));
await page.evaluateOnNewDocument(installProviderObserver, { runId, sourceCommit, origin: new URL(handoff.frontendUrl).origin });
const safeHeaders = headers => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, /^(authorization|proxy-authorization|cookie|set-cookie)$/i.test(name) ? '[REDACTED]' : value]));
let requestSequence = 0;
const requestIds = new WeakMap();
page.on('request', request => {
  if (!request.url().startsWith(`${handoff.apiUrl}/api/`)) return;
  const requestId = ++requestSequence;
  requestIds.set(request, requestId);
  saveLine('http.jsonl', { kind: 'request', requestId, at: new Date().toISOString(), url: request.url(), method: request.method(), headers: safeHeaders(request.headers()), body: request.postData() ?? null });
});
page.on('response', response => {
  const requestId = requestIds.get(response.request());
  if (!requestId) return;
  const at = new Date().toISOString();
  const job = response.text().then(body => saveLine('http.jsonl', { kind: 'response', requestId, at, url: response.url(), status: response.status(), statusText: response.statusText(), headers: safeHeaders(response.headers()), body }), error => saveLine('http.jsonl', { kind: 'response-body-unavailable', requestId, at, url: response.url(), status: response.status(), error: String(error) }));
  pending.add(job); job.finally(() => pending.delete(job));
});
page.on('requestfailed', request => {
  const requestId = requestIds.get(request);
  if (requestId) saveLine('http.jsonl', { kind: 'request-failed', requestId, at: new Date().toISOString(), url: request.url(), failure: request.failure() });
});
await page.goto(`${handoff.frontendUrl}/proposals/new`, { waitUntil: 'networkidle0' });
const identity = await browser.newPage();
await identity.goto(`chrome://extensions/?id=${extensionId}`);
await identity.waitForFunction(id => {
  const manager = document.querySelector('extensions-manager')?.shadowRoot;
  const detail = manager?.querySelector('extensions-detail-view');
  return detail?.data?.id === id;
}, {}, extensionId);
const installed = await identity.evaluate(() => {
  const detail = document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-detail-view');
  return { id: detail.data.id, name: detail.data.name, version: detail.data.version, path: detail.data.path, state: detail.data.state, location: detail.data.location, visibleText: detail.shadowRoot.innerText };
});
await identity.screenshot({ path: join(output, 'installed-extension.png'), fullPage: true });
await identity.goto('chrome://version/');
const browserVersion = await identity.evaluate(() => Object.fromEntries(['version', 'useragent', 'profile_path', 'executable_path', 'command_line'].map(id => [id, document.getElementById(id)?.innerText ?? null])));
await writeFile(join(output, 'identity.json'), JSON.stringify({ runId, sourceCommit, at: new Date().toISOString(), extension: installed, browserVersion, browser: await browser.version(), transport: 'owned isolated Chromium, official stable unpacked MetaMask; not a user/CWS profile' }, null, 2) + '\n');
console.log(JSON.stringify({ type: 'QA07_CAPTURE_READY', runId, sourceCommit, output, frontendUrl: `${handoff.frontendUrl}/proposals/new`, extensionId, extensionVersion: installed.version }));
const stopSignal = await new Promise(done => {
  const stop = signal => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); done(signal); };
  const interrupt = () => stop('SIGINT'); const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
});
await page.evaluate(() => window.__qa07Observer.mark('capture-service-stop'));
await writeFile(join(output, 'provider-final.json'), JSON.stringify(await page.evaluate(() => window.__qa07Observer.snapshot()), null, 2) + '\n');
await Promise.all([...pending]);
await Promise.all([...writes]);
await writeFile(join(output, 'capture-finished.json'), JSON.stringify({ runId, sourceCommit, stopSignal, finishedAt: new Date().toISOString(), exitCode: process.exitCode ?? 0, note: 'Capture stopped; acceptance must be derived from observed markers, coverage and workflow artifacts, not service startup.' }, null, 2) + '\n');
await browser.disconnect();
