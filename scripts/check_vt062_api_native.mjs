#!/usr/bin/env node
// One fresh owned PostgreSQL cluster and database per invocation; no caller DB is read.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const runFile = promisify(execFile);
const args = process.argv.slice(2);
assert.equal(args.length, 4, 'Usage: node scripts/check_vt062_api_native.mjs --postgres-bin <bin> --output <new-dir>');
assert.equal(args[0], '--postgres-bin');
assert.equal(args[2], '--output');
assert.notEqual(process.getuid(), 0, 'Run as an unprivileged user');
const bin = await realpath(args[1]);
const output = resolve(args[3]);
await mkdir(output, { mode: 0o700 }); // Must not overwrite an existing evidence directory.
const ownedCluster = await mkdtemp(join(tmpdir(), 'dao-vt062-api-'));
const data = join(ownedCluster, 'data');
const nodeTest = join('tests', 'api', 'vt062-request-id.test.mjs');
let started = false;
let testExit = 1;
const source = await readFile(join('indexer', 'api', 'server.ts'));
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const { stdout: sourceCommit } = await runFile('git', ['rev-parse', 'HEAD']);
const { stdout: postgresVersion } = await runFile(join(bin, 'postgres'), ['--version']);
const reservation = createServer();
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:PG|BE0[1-9]_.*|TV4_.*|VT062_.*|DATABASE_URL$|RPC_URL$|NODE_OPTIONS$|NODE_PATH$)/.test(key)));
const env = { ...cleanEnv, VT062_TEST_ISOLATED: '1',
  VT062_TEST_DATABASE_URL: `postgresql://vt062_test@127.0.0.1:${port}/tv4_be05_vt062` };

try {
  const init = await runFile(join(bin, 'initdb'), ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'vt062_test']);
  await writeFile(join(output, 'initdb.txt'), init.stdout);
  const start = await runFile(join(bin, 'pg_ctl'), ['-D', data, '-l', join(ownedCluster, 'postgres.log'),
    '-o', `-h 127.0.0.1 -p ${port} -k ${ownedCluster}`, 'start', '-w', '-t', '30']);
  started = true;
  await writeFile(join(output, 'pg-start.txt'), start.stdout);
  await runFile(join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'vt062_test', 'tv4_be05_vt062']);
  await writeFile(join(output, 'runtime.json'), JSON.stringify({ sourceCommit: sourceCommit.trim(), sourceSha256,
    node: process.version, postgres: postgresVersion.trim(), database: 'fresh owned tv4_be05_vt062',
    snapshot: 'empty before first request', test: nodeTest }, null, 2) + '\n');

  const child = spawn(process.execPath, ['--import', 'tsx', '--test', nodeTest], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let outputText = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { outputText += chunk.toString(); });
  testExit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); });
  outputText += `\nEXIT_CODE=${testExit}\n`;
  await writeFile(join(output, 'test.txt'), outputText);
  process.stdout.write(outputText);
} finally {
  if (started) {
    const stop = await runFile(join(bin, 'pg_ctl'), ['-D', data, 'stop', '-w', '-t', '30', '-m', 'fast']);
    await writeFile(join(output, 'pg-stop.txt'), stop.stdout);
  }
  await rm(ownedCluster, { recursive: true });
  await writeFile(join(output, 'cleanup.txt'), `cluster_stopped=${started}\ncluster_removed=true\n`);
}
process.exitCode = testExit;
