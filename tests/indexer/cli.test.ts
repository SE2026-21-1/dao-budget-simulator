import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { configInput, serveRpc } from './helpers.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', ...args], { env: { ...process.env, RPC_URL: '', DATABASE_URL: '', ...env }, windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (data) => { stdout += String(data); });
  child.stderr.on('data', (data) => { stderr += String(data); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  return { code, stdout, stderr };
}

test('CLI help and invalid arguments have appropriate exit codes', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0); assert.match(help.stdout, /--config/);
  const invalid = await run([]);
  assert.equal(invalid.code, 1); assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_ARGUMENT');
});

test('CLI reports unsupported ABI as an actionable config error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dao-be02-cli-'));
  const path = join(dir, 'config.json');
  const input = configInput(); input.contracts[0]!.abiVersion = 'unsupported';
  await writeFile(path, JSON.stringify(input));
  const result = await run(['--config', path], { RPC_URL: 'http://127.0.0.1:1/rpc-secret', DATABASE_URL: 'postgresql://unused' });
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).code, 'INVALID_CONFIG');
  assert.match(JSON.parse(result.stderr).message, /ABI/);
});

test('CLI rejects wrong chain before attempting PostgreSQL and never prints secrets', async (t) => {
  const { url, server } = await serveRpc(() => '0x1');
  t.after(() => server.close());
  const dir = await mkdtemp(join(tmpdir(), 'dao-be02-cli-'));
  const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(configInput()));
  const result = await run(['--config', path], { RPC_URL: url, DATABASE_URL: 'postgresql://user:db-password-secret@127.0.0.1:1/unused' });
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.error.code, 'CHAIN_ID_MISMATCH');
  assert.deepEqual(report.committedBatches, []);
  assert.doesNotMatch(result.stdout + result.stderr, /rpc-secret|db-password-secret/);
});

test('watch rejects finite ranges and invalid polling bounds before connecting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dao-watch-cli-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify(configInput()));
  const env = { RPC_URL: 'http://127.0.0.1:1', DATABASE_URL: 'postgresql://unused' };
  const finite = await run(['--config', path, '--watch'], env);
  assert.equal(finite.code, 1);
  assert.equal(JSON.parse(finite.stderr).code, 'INVALID_CONFIG');
  assert.match(JSON.parse(finite.stderr).message, /latest/);
  await writeFile(path, JSON.stringify({ ...configInput(), toBlock: 'latest' }));
  for (const interval of ['0', '99', '60001', '1.5', 'invalid']) {
    const result = await run(['--config', path, '--watch'], { ...env, INDEXER_POLL_INTERVAL_MS: interval });
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stderr).code, 'INVALID_CONFIG');
  }
});

test('watch retries transient RPC failures sequentially and drains an active cycle on SIGTERM', { timeout: 10_000 }, async (t) => {
  const gate = new EventEmitter();
  const reached = once(gate, 'active');
  const release = once(gate, 'release');
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const { url, server } = await serveRpc(async ({ method }) => {
    assert.equal(method, 'eth_chainId');
    calls++;
    maxActive = Math.max(maxActive, ++active);
    try {
      if (calls === 4) { gate.emit('active'); await release; }
      throw new Error('Transient provider failure');
    } finally { active--; }
  });
  t.after(() => { gate.emit('release'); server.closeAllConnections(); server.close(); });
  const dir = await mkdtemp(join(tmpdir(), 'dao-watch-cli-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ ...configInput(), toBlock: 'latest' }));
  const child = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', path, '--watch', '--poll-interval-ms', '100'],
    { env: { ...process.env, RPC_URL: url, DATABASE_URL: 'postgresql://unused' }, windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stderr = '';
  child.stdout.resume();
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const closed = once(child, 'close');
  await reached;
  assert.equal(child.exitCode, null);
  child.kill('SIGTERM');
  await sleep(20);
  assert.equal(child.exitCode, null, 'The active RPC must settle before shutdown.');
  gate.emit('release');
  const [code, signal] = await closed;
  assert.equal(code, 143);
  assert.equal(signal, null);
  assert.equal(calls, 6, 'The second cycle drains its bounded retries, with no third cycle after termination.');
  assert.equal(maxActive, 1);
  const reports = stderr.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(reports.length, 2);
  assert.ok(reports.every((report) => report.type === 'sync_result' && report.error.code === 'RPC_HTTP_ERROR' && report.error.retryable === true));
});

test('watch SIGINT interrupts the idle timer and permanent chain mismatch stops without retrying', { timeout: 10_000 }, async (t) => {
  let calls = 0;
  let permanent = false;
  const { url, server } = await serveRpc(() => {
    calls++;
    if (permanent) return '0x1';
    throw new Error('Transient provider failure');
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const dir = await mkdtemp(join(tmpdir(), 'dao-watch-cli-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ ...configInput(), toBlock: 'latest' }));
  const env = { ...process.env, RPC_URL: url, DATABASE_URL: 'postgresql://unused', INDEXER_POLL_INTERVAL_MS: '60000' };
  const child = spawn(process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', path, '--watch'], { env, windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  child.stdout.resume();
  const closed = once(child, 'close');
  await once(child.stderr, 'data');
  child.kill('SIGINT');
  assert.equal((await closed)[0], 130);
  assert.equal(calls, 3);
  permanent = true;
  const result = await run(['--config', path, '--watch'], env);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).error.code, 'CHAIN_ID_MISMATCH');
  assert.equal(calls, 4);
});

test('watch stops on permanent HTTP, malformed response, and JSON-RPC errors', { timeout: 10_000 }, async (t) => {
  let mode: 'http' | 'malformed' | 'jsonrpc' = 'http';
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    const request = JSON.parse(raw);
    if (mode === 'http') { res.writeHead(404); res.end('not found'); }
    else if (mode === 'malformed') { res.end('not-json'); }
    else res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }));
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const dir = await mkdtemp(join(tmpdir(), 'dao-watch-cli-'));
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify({ ...configInput(), toBlock: 'latest' }));
  const env = { RPC_URL: `http://127.0.0.1:${address.port}`, DATABASE_URL: 'postgresql://unused', INDEXER_POLL_INTERVAL_MS: '100' };
  for (const [failure, code] of [['http', 'RPC_HTTP_ERROR'], ['malformed', 'RPC_INVALID_RESPONSE'], ['jsonrpc', 'RPC_ERROR']] as const) {
    mode = failure;
    calls = 0;
    const result = await run(['--config', path, '--watch'], env);
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.error.code, code);
    assert.notEqual(report.error.retryable, true);
    assert.equal(calls, 1, 'Permanent provider failures must not retry within or across cycles.');
  }
});
