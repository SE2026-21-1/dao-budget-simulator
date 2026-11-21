import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
