// BE08 exercises the actual BE07 CLI process, not a sync/project timer in a test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { metrics } from './be08_measurement.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function startWorkerProbe({ scope, root, dbUrl, rpc, config, pool, deploymentId, report }) {
  const state = report.freshness = { status: 'RUNNING', samples: [], errors: [], workerEvents: [],
    config: { confirmations: 2, pollIntervalMs: 1000, reorgWindow: 128, batchSize: '100', toBlock: 'latest',
      rpcTimeoutMs: 5000, maxAttempts: 4, baseDelayMs: 250, maxDelayMs: 2000, jitter: '50–100%', poolMax: 1 },
    timing: 'Conservative upper bound: monotonic clock immediately BEFORE mining the second following block, through a complete HTTP body containing this transaction, with SQL publication H/hash equal to API H/hash. Mining acknowledgement is the eligibility upper bound. 25ms polling adds observation delay.',
    scope: 'Owned Anvil, real CLI worker, 100 proposals/1000 votes; no production/testnet SLA. Outage is excluded from normal-RPC samples.' };
  let offline = false, child, stdout = '', stderr = '', stopping = false, fatal;
  const attempts = [];
  const proxy = createServer(async (req, res) => {
    try {
      let text = ''; for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      if (offline) {
        attempts.push({ at: new Date().toISOString(), monotonicMs: performance.now(), method: body.method, id: body.id, httpStatus: 503 });
        res.writeHead(503); res.end(); return;
      }
      const result = await rpc(body.method, body.params);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    } catch { res.writeHead(503); res.end(); }
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const directory = await scope.temporaryDirectory(join(tmpdir(), 'dao-be08-worker-'));
  const file = join(directory, 'config.json');
  const workerConfig = { ...config, rpcUrl: `http://127.0.0.1:${proxy.address().port}`, toBlock: 'latest',
    confirmations: 2, reorgWindow: 128, pollIntervalMs: 1000 };
  await writeFile(file, JSON.stringify(workerConfig, (_key, value) => typeof value === 'bigint' ? String(value) : value));
  state.command = ['node', '--import', 'tsx', 'indexer/cli.ts', '--config', '<owned-temporary-config>', '--worker'];
  child = scope.spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', file, '--worker'],
    { cwd: root, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  child.on('error', error => { fatal = error; });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  let pending = '';
  child.stdout.on('data', text => {
    stdout += text; pending += text;
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      try { state.workerEvents.push({ at: new Date().toISOString(), monotonicMs: performance.now(), offline, attemptCount: attempts.length, ...JSON.parse(line) }); }
      catch { fatal = new Error('Non-JSON CLI worker output'); }
    }
  });
  child.stderr.on('data', text => { stderr += text; });
  const check = () => {
    scope.throwIfInterrupted();
    if (fatal) throw fatal;
    assert.equal(child.exitCode, null, `Worker exited early: ${stderr}`);
    assert.equal(child.signalCode, null, 'Worker killed early');
    const permanent = state.workerEvents.find(e => e.type === 'worker_error' && !e.retryable && !['RPC_UNAVAILABLE','CHECKPOINT_HEAD_BEHIND','REORG_RETRY','BLOCK_CHANGED'].includes(e.code));
    assert.ok(!permanent, JSON.stringify(permanent));
  };
  async function waitFor(predicate, timeout = 30_000) {
    const deadline = performance.now() + timeout;
    do { check(); if (await predicate()) return; await sleep(25); } while (performance.now() < deadline);
    throw new Error(`Worker/API publication did not become visible within ${timeout}ms`);
  }
  async function get(base, path) {
    check();
    const params = new URLSearchParams({ chainId: '31337', deploymentId: 'tv4-benchmark' });
    if (path === '/treasury/transfers') params.set('limit', '100');
    const response = await fetch(`${base}${path}?${params}`,
      { signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(body)}`);
    return body;
  }
  async function ready(h, hash) {
    await waitFor(async () => {
      const row = (await pool.query(`SELECT p.block_number::text AS h,p.block_hash AS hash,d.indexer_state
        FROM deployments d LEFT JOIN projection_checkpoints p USING(deployment_id) WHERE d.deployment_id=$1`, [deploymentId])).rows[0];
      return row?.h === h && row.hash === hash && row.indexer_state.phase === 'ready';
    }, 120_000);
    state.initial = (await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1', [deploymentId])).rows[0];
    assert.ok(state.initial.indexer_state.lastCheckedAt, 'Migration 005 heartbeat required');
  }
  async function sample({ phase, base, send, activeClients = () => 0 }) {
    check();
    const record = { phase, startedAt: new Date().toISOString(), activeClients: activeClients(), probes: [] };
    state.samples.push(record);
    try {
      const receipt = await send();
      record.transactionHash = receipt.transactionHash;
      record.eventBlock = String(BigInt(receipt.blockNumber));
      await rpc('anvil_mine', ['0x1', '0x0']);
      const started = performance.now(); record.eligibleLowerBoundAt = new Date().toISOString();
      await rpc('anvil_mine', ['0x1', '0x0']);
      record.miningAckMs = performance.now() - started;
      record.eligibleUpperBoundAt = new Date().toISOString();
      assert.ok(BigInt(await rpc('eth_blockNumber')) >= BigInt(receipt.blockNumber) + 2n);
      await waitFor(async () => {
        const body = await get(base, '/treasury/transfers');
        const present = body.data.some(item => item.transactionHash === receipt.transactionHash);
        record.probes.push({ elapsedMs: performance.now() - started, h: body.context.asOfBlock, hash: body.context.asOfBlockHash, present });
        if (!present) return false;
        record.api = { context: body.context, transfer: body.data.find(item => item.transactionHash === receipt.transactionHash) };
        record.elapsedMs = performance.now() - started; // Complete response body contains event.
        record.observedAt = new Date().toISOString();
        return true;
      });
      const publication = (await pool.query('SELECT block_number::text AS h,block_hash AS hash FROM projection_checkpoints WHERE deployment_id=$1', [deploymentId])).rows[0];
      record.publication = publication;
      assert.ok(BigInt(publication.h) >= BigInt(receipt.blockNumber));
      assert.equal(publication.h, record.api.context.asOfBlock); assert.equal(publication.hash, record.api.context.asOfBlockHash);
      assert.equal(record.api.transfer.blockHash, receipt.blockHash);
      assert.equal(record.api.transfer.blockNumber, record.eventBlock);
      assert.equal(record.api.transfer.amount, '1'); assert.ok(record.elapsedMs < 30_000);
      if (phase === 'load') assert.equal(record.activeClients, 10, 'All ten load clients must be active');
      record.status = 'PASS';
    } catch (error) { record.status = 'FAIL'; record.error = error.message; state.errors.push(record.error); throw error; }
  }
  async function samples(options, count) {
    for (let i = 0; i < count; i++) { await sample(options); await sleep(150 + (i * 173) % 850); }
    state[options.phase] = metrics(state.samples.filter(s => s.phase === options.phase && s.status === 'PASS').map(s => s.elapsedMs));
  }
  async function outage(base) {
    const result = state.outage = { status: 'RUNNING', excludedFromNormalRpc: true, httpAttempts: attempts };
    await waitFor(async () => (await get(base, '/health')).context.sync.status === 'synced');
    state.normalWorkerErrors = state.workerEvents.filter(e => e.type === 'worker_error');
    assert.equal(state.normalWorkerErrors.length, 0, 'Normal RPC measurements must not silently include transient RPC failures');
    offline = true; result.startedAt = new Date().toISOString(); const started = performance.now();
    await sleep(31_250);
    result.offlineDurationMs = performance.now() - started;
    result.staleHealth = await get(base, '/health'); result.staleSummary = await get(base, '/summary');
    assert.equal(result.staleHealth.data.indexer, 'lagging');
    assert.equal(result.staleSummary.context.sync.status, 'lagging');
    assert.ok(BigInt(result.staleSummary.context.sync.lagSeconds) >= 30n);
    const failures = state.workerEvents.filter(e => e.offline && e.type === 'worker_error');
    assert.ok(failures.length >= 5, 'Several exhausted RPC attempts must be observable');
    result.retryCycles = failures.map((e, i) => {
      const lower = i ? failures[i - 1].attemptCount : 0;
      const group = attempts.slice(lower, e.attemptCount);
      assert.ok(group.length >= 1 && group.length <= 4, 'RPC attempt count must remain bounded');
      return { code: e.code, attempts: group.length, gapsMs: group.slice(1).map((a, n) => a.monotonicMs - group[n].monotonicMs) };
    });
    assert.ok(result.retryCycles.slice(1).every(c => c.attempts === 4 && c.gapsMs.every(g => g >= 100)), 'Default retries must use finite attempts and positive backoff');
    offline = false; result.restoredAt = new Date().toISOString(); const restored = performance.now();
    await waitFor(async () => {
      result.recoveredHealth = await get(base, '/health');
      return result.recoveredHealth.context.sync.status === 'synced';
    });
    result.recoveryMs = performance.now() - restored; result.status = 'PASS';
    state.normal = metrics(state.samples.filter(s => s.status === 'PASS').map(s => s.elapsedMs));
    state.status = state.errors.length === 0 && state.idle.count >= 10 && state.load.count >= 10 ? 'PASS' : 'FAIL';
    assert.equal(state.status, 'PASS');
  }
  async function close() {
    if (stopping) return; stopping = true; offline = false;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try {
      const [code, signal] = await closed; state.workerExit = { code, signal };
      assert.equal(code, 0, 'Worker must shut down cleanly'); assert.equal(signal, null);
    }
    finally { clearTimeout(timer); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    state.stdout = stdout; state.stderr = stderr;
  }
  return { ready, samples, outage, close, check };
}
