#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertOwnedProcess } from './be09-safety.mjs';
import { validateRpcUrl } from './be09-rpc.mjs';

export async function waitOwnedRpc({ runDir, url, timeoutMs = 60000, fetcher = fetch }) {
  validateRpcUrl(url);
  const port = Number(new URL(url).port);
  const until = Date.now() + timeoutMs;
  let last = 'listener absent';
  while (Date.now() < until) {
    // Dead/bind-failed child is terminal, not a reason to probe someone else's chain.
    await assertOwnedProcess({ runDir, label: 'anvil' });
    try { await assertOwnedProcess({ runDir, label: 'anvil', port }); }
    catch (error) { last = error.message; await sleep(50); continue; }
    const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    assert.ok(response.ok && body.result === '0x7a69', 'Owned Anvil chain mismatch');
    return;
  }
  throw new Error(`Owned Anvil listener not ready: ${last}`);
}
export async function waitOwnedHttp({ runDir, url, label, deployment, timeoutMs = 90000, fetcher = fetch }) {
  const target = new URL(url);
  assert.ok((label === 'api' && target.origin === 'http://127.0.0.1:3300') || (label === 'frontend' && target.origin === 'http://127.0.0.1:5173'), 'Unexpected HTTP allocation');
  if (label === 'api') {
    target.pathname = '/api/health';
    target.searchParams.set('chainId', '31337');
    target.searchParams.set('deploymentId', deployment);
  }
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await assertOwnedProcess({ runDir, label });
    try { await assertOwnedProcess({ runDir, label, port: Number(target.port) }); }
    catch { await sleep(50); continue; }
    const response = await fetcher(target, { signal: AbortSignal.timeout(2500) });
    if (response.status === 200) {
      if (label === 'frontend') return;
      const body = await response.json();
      if (body.data?.publication === 'ready' && body.data?.indexer === 'synced') return;
    }
    await sleep(100);
  }
  throw new Error(`Owned ${label} did not become ready`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'http') await waitOwnedHttp({ runDir: process.argv[3], url: process.argv[4], label: process.argv[5], deployment: process.argv[6] });
    else await waitOwnedRpc({ runDir: process.argv[2], url: process.argv[3] });
    console.log('Owned service ready');
  } catch (error) { console.error(`BE09 readiness: ${error.message}`); process.exitCode = 1; }
}
