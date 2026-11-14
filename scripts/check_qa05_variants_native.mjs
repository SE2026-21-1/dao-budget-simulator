#!/usr/bin/env node
// Parent owns PostgreSQL; interrupted child lifecycle cannot bypass its shutdown.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

assert.ok(process.argv.length === 4 || process.argv.length === 6, 'Usage: node scripts/check_qa05_variants_native.mjs --output <NEW-directory> [--family all|tc10]'); assert.equal(process.argv[2], '--output');
if (process.argv.length === 6) { assert.equal(process.argv[4], '--family'); assert.ok(['all', 'tc10'].includes(process.argv[5])); }
const output = resolve(process.argv[3]); await mkdir(output);
const bin = process.env.TV4_VARIANTS_PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const cluster = await mkdtemp(join(tmpdir(), 'dao-qa05-variants-'));
const reserve = createServer(); await new Promise(done => reserve.listen(0, '127.0.0.1', done)); const port = reserve.address().port; await new Promise(done => reserve.close(done));
const command = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8' });
const record = (name, value) => writeFile(join(output, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
let started = false;
try {
  await record('initdb.log', command('initdb', ['-D', join(cluster, 'data'), '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'variants_test']));
  await record('pg-start.log', command('pg_ctl', ['-D', join(cluster, 'data'), '-l', join(cluster, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${cluster}`, 'start'])); started = true;
  const args = ['--import', 'tsx', 'scripts/check_qa05_variants.mjs', '--output', output, ...process.argv.slice(4)];
  const env = { ...process.env, TV4_VARIANTS_ISOLATED: '1', TV4_VARIANTS_ADMIN_URL: `postgresql://variants_test@127.0.0.1:${port}/postgres` }; delete env.DATABASE_URL; delete env.RPC_URL;
  await record('command.json', { command: [process.execPath, ...args], sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version, postgres: command('postgres', ['--version']), cluster: { path: cluster, port }, environment: { TV4_VARIANTS_ISOLATED: '1', TV4_VARIANTS_ADMIN_URL: env.TV4_VARIANTS_ADMIN_URL, TV4_VARIANTS_PG_BIN: bin } });
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
  child.stdout.on('data', value => { stdout += value; process.stdout.write(value); }); child.stderr.on('data', value => { stderr += value; process.stderr.write(value); });
  const stop = () => child.kill('SIGTERM'); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const result = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code: code ?? 1, signal })); });
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  await record('stdout.log', stdout); await record('stderr.log', stderr); await record('exit.json', result); process.exitCode = result.code;
} finally {
  if (started) { await record('pg-stop.log', command('pg_ctl', ['-D', join(cluster, 'data'), 'stop', '-m', 'fast'])); await record('postgres.log', await readFile(join(cluster, 'postgres.log'), 'utf8')); await record('shutdown.json', { postgresStopExit: 0, ownedCluster: cluster, removedAfterLogs: true }); await rm(cluster, { recursive: true }); }
}
