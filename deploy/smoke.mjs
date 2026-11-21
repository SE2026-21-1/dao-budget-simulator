import { setTimeout as pause } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { connect, isMain, option, requireThat, safeFailure } from './common.mjs';
import { loadConfig } from '../dist/indexer/config.js';

export async function smoke(client, { timeoutMs = 120000, since = new Date().toISOString() } = {}) {
  requireThat(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 300000, 'Smoke timeout must be 1000..300000 milliseconds.');
  const config = await loadConfig(process.env.INDEXER_CONFIG ?? '/run/dao/indexer.json');
  requireThat(typeof process.env.DEPLOYMENT_ID === 'string' && process.env.DEPLOYMENT_ID.length > 0, 'Public DEPLOYMENT_ID deployment name is required for API smoke.');
  const query = new URLSearchParams({ chainId: config.chainId.toString(), deploymentId: process.env.DEPLOYMENT_ID });
  const api = `http://api:3000/api/health?${query}`;
  const frontend = 'http://frontend:8080';
  const publicConfig = JSON.parse(await readFile(process.env.FRONTEND_CONFIG ?? '/run/dao/frontend.json', 'utf8'));
  const publicApi = publicConfig.VITE_API_BASE_URL === '/backend' ? `${frontend}/backend` : publicConfig.VITE_API_BASE_URL.replace(/\/$/, '');
  const deadline = Date.now() + timeoutMs;
  let stage = 'database/worker';
  while (Date.now() < deadline) {
    try {
      stage = 'database/worker';
      const worker = (await client.query(`SELECT indexer_state->>'phase' AS phase,
        (indexer_state->>'lastCheckedAt')::timestamptz >= $2::timestamptz AS fresh
        FROM deployments WHERE deployment_id=$1`, [config.deploymentId, since])).rows[0];
      requireThat(worker?.phase === 'ready' && worker.fresh, 'Worker has not completed a fresh canonical RPC check.');
      stage = 'API publication';
      const response = await fetch(api, { signal: AbortSignal.timeout(3000) });
      requireThat(response.ok, 'API health is not ready.');
      const body = await response.json();
      // The API serves canonical publications with HTTP 200 even when retained
      // ancillary logs make decoding "degraded". Readiness is not decode completeness.
      requireThat(['ok', 'degraded'].includes(body.data?.status) && body.data?.database === 'up' && body.data?.indexer === 'synced' && body.data?.publication === 'ready' && typeof body.data?.rawDecodeComplete === 'boolean', 'API canonical publication is not ready.');
      requireThat(body.context?.chainId === config.chainId.toString() && body.context?.deploymentId === process.env.DEPLOYMENT_ID, 'API health scope does not match the configured release.');
      stage = 'frontend';
      const health = await fetch(`${frontend}/healthz`, { signal: AbortSignal.timeout(3000) });
      requireThat(health.ok, 'Frontend health is not ready.');
      const page = await fetch(frontend, { signal: AbortSignal.timeout(3000) });
      requireThat(page.ok && /<html[\s>]/i.test(await page.text()), 'Frontend is not serving application HTML.');
      const proxy = await fetch(`${publicApi}/api/health?${query}`, { signal: AbortSignal.timeout(3000) });
      requireThat(proxy.ok, 'Configured frontend API route is not ready.');
      const publicBody = await proxy.json();
      requireThat(['ok', 'degraded'].includes(publicBody.data?.status) && publicBody.data?.indexer === 'synced' && publicBody.data?.publication === 'ready' && publicBody.data?.rawDecodeComplete === body.data.rawDecodeComplete && publicBody.context?.chainId === config.chainId.toString() && publicBody.context?.deploymentId === process.env.DEPLOYMENT_ID, 'Configured frontend API scope/publication is not ready.');
      if (!body.data.rawDecodeComplete) console.error(`SMOKE_RAW_DECODE_INCOMPLETE ${JSON.stringify(body.data.rawDecodeIssues)}; application readiness only, not complete event decoding.`);
      return;
    } catch { if (Date.now() < deadline) await pause(1000); }
  }
  requireThat(false, `Smoke timed out waiting for ${stage}; inspect service health without exposing credentials.`);
}
if (isMain(import.meta.url)) {
  const client = await connect().catch(safeFailure('Database connection'));
  if (client) try { await smoke(client, { timeoutMs: Number(option('--timeout-ms', '120000')), since: option('--since', new Date().toISOString()) }); console.log('Frontend, API publication, fresh worker and database smoke passed.'); }
  catch (error) { safeFailure('Smoke')(error); }
  finally { await client.end(); }
}
