#!/usr/bin/env node
// Reviewer-only source-flow reproduction. DO NOT mistake this for a PostgreSQL
// lifecycle test: the postmaster is an owned Node fixture and pg_ctl is a timeout
// model. No socket, network request, database, build, or production edit occurs.
// Execute only when the parent reviewer authorizes the focused check:
// node /tmp/tv4-20261128/Issue40OwnershipReview-partial-pg-repro.mjs /tmp/dao-tv4-issue40-source-review
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = await realpath(resolve(process.argv[2] ?? '/tmp/dao-tv4-issue40-source-review'));
const runner = join(root, 'scripts/be09-local.sh');
const text = await readFile(runner, 'utf8');
const begin = text.indexOf('  "$PG_CTL_BIN" -D "$pgdata" -l "$RUN_DIR/logs/postgres.log"');
const end = text.indexOf('  note "Isolated PostgreSQL started', begin);
assert.ok(begin >= 0 && end > begin, 'Expected reviewed PostgreSQL startup block');
// Execute exactly the checked-out startup block, not a handwritten replacement.
const startup = text.slice(begin, end);
const { initializeRun } = await import(pathToFileURL(join(root, 'scripts/be09-metadata.mjs')));
const { captureProcess, signalOwnedProcess } = await import(pathToFileURL(join(root, 'scripts/be09-safety.mjs')));
const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'tv4-pg-partial-repro-')));
const runDir = join(stateRoot, 'runs/partial');
const pgdata = join(runDir, 'postgres/data');
let fixture;
let fixtureExit;
try {
  for (const part of ['pids', 'logs', 'postgres/data', 'postgres/socket']) {
    await mkdir(join(runDir, part), { recursive: true, mode: 0o700 });
  }
  await writeFile(join(runDir, 'run-id'), 'partial\n');
  // High-port metadata only; nothing ever binds or connects to this URL.
  await initializeRun({ root, stateRoot, runDir, scope: 'ordinary', rpcUrl: 'http://127.0.0.1:62371' });
  const fixtureSource = `
    const fs = require('node:fs');
    const data = process.argv[process.argv.indexOf('-D') + 1];
    fs.writeFileSync(data + '/postmaster.pid', process.pid + '\\n' + data + '\\n', {mode: 0o600});
    setTimeout(() => process.exit(0), 15000); // Failsafe, even if supervisor crashes.
    process.send({ready: true});
  `;
  fixture = spawn(process.execPath, ['-e', fixtureSource, '--', '-D', pgdata], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  fixtureExit = once(fixture, 'exit');
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Private fixture readiness timeout')), 3000);
    fixture.once('message', value => { clearTimeout(timer); value.ready ? done() : reject(new Error('Unexpected fixture message')); });
    fixture.once('error', error => { clearTimeout(timer); reject(error); });
    fixture.once('exit', () => { clearTimeout(timer); reject(new Error('Fixture exited before ready')); });
  });
  // Model the documented non-atomic pg_ctl case: its server exists, but the
  // waiting command reports startup failure/timeout rather than success.
  const pgCtl = join(stateRoot, 'pg_ctl');
  await writeFile(pgCtl, '#!/bin/sh\nprintf "%s\\n" "reviewer-model: server already spawned; startup wait timed out" >&2\nexit 1\n');
  await chmod(pgCtl, 0o700);
  const env = { ...process.env, BE09_STATE_ROOT: stateRoot, BE09_SCOPE: 'ordinary', BE09_NODE_DIR: dirname(process.execPath) };
  delete env.NODE_OPTIONS;
  delete env.BE09_RUN_DIR;
  delete env.BE09_RPC_PORT;
  delete env.BE09_PG_DIR;
  delete env.BE09_FOUNDRY_DIR;
  const shell = `
    source "$1" help >/dev/null
    STATE_ROOT="$2"; RUN_DIR="$3"; PG_CTL_BIN="$4"
    pgdata="$RUN_DIR/postgres/data"; socket_dir="$RUN_DIR/postgres/socket"
    trap 'status=$?; stop_owned_services "$RUN_DIR" || true; exit "$status"' EXIT
    ${startup}
  `;
  const result = spawnSync('bash', ['-c', shell, 'reviewer', runner, stateRoot, runDir, pgCtl], {
    cwd: root, env, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /PostgreSQL: no authenticated live cluster; left untouched/);
  for (const name of ['postgres.pid', 'postgres.identity.json']) {
    await assert.rejects(readFile(join(runDir, 'pids', name)), { code: 'ENOENT' });
  }
  assert.equal(fixture.exitCode, null);
  assert.equal(fixture.signalCode, null);
  process.kill(fixture.pid, 0); // Only this script's own directly spawned fixture.
  const observed = { startupStatus: result.status, missingPidAndIdentity: true, fixtureSurvivesAutomaticCleanup: true };

  // Prove this is a legitimately capturable private fixture, not a foreign PID.
  // Recovery is explicit reviewer code, not behavior credited to production.
  await writeFile(join(runDir, 'pids/postgres.pid'), `${fixture.pid}\n`);
  await captureProcess({ runDir, label: 'postgres', pid: fixture.pid,
    executable: process.execPath, marker: pgdata, parentPid: process.pid });
  await signalOwnedProcess({ runDir, label: 'postgres', signal: 'INT' });
  assert.deepEqual(await fixtureExit, [null, 'SIGINT']);
  console.log(JSON.stringify({ ...observed, explicitReviewerRecovery: 'authenticated SIGINT' }));
} finally {
  if (fixture && fixture.exitCode === null && fixture.signalCode === null) {
    fixture.kill('SIGKILL'); // Known direct child only; never a PID-file target.
    await fixtureExit;
  }
  await rm(stateRoot, { recursive: true, force: true });
}
