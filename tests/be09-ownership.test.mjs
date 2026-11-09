import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'scripts/be09-local.sh');

// Retained run metadata may outlive its processes. Stale PID files must not
// signal a newer deployment in the same checkout after the OS reuses a PID.
test('down on an old run leaves a different run API and Vite alive', async () => {
  const state = await mkdtemp(join(tmpdir(), 'be09-ownership-'));
  const oldRun = join(state, 'runs/old');
  const newRun = join(state, 'runs/new');
  const pgBin = join(state, 'pg-bin');
  const children = [];
  try {
    await mkdir(join(oldRun, 'pids'), { recursive: true });
    await mkdir(join(newRun, 'pids'), { recursive: true });
    await mkdir(pgBin);
    const pgCtl = join(pgBin, 'pg_ctl');
    await writeFile(pgCtl, '#!/bin/sh\nexit 1\n');
    await chmod(pgCtl, 0o700);
    for (const [label, script, envName] of [
      ['api', 'indexer/api/main.ts', 'runtime.env'],
      ['frontend', 'frontend/node_modules/vite/bin/vite.js', 'frontend.env'],
    ]) {
      const envFile = join(newRun, envName);
      await writeFile(envFile, 'BE09_TEST=1\n');
      const child = spawn(process.execPath, [
        `--env-file=${envFile}`, '-e', 'setInterval(() => {}, 1000)', join(root, script),
      ], { stdio: 'ignore' });
      children.push(child);
      await writeFile(join(oldRun, 'pids', `${label}.pid`), `${child.pid}\n`);
      await writeFile(join(newRun, 'pids', `${label}.pid`), `${child.pid}\n`);
    }
    async function runCommand(action, run) {
      return await new Promise((resolveRun, rejectRun) => {
        const runnerProcess = spawn('bash', [runner, action], {
          env: { ...process.env, BE09_STATE_ROOT: state, BE09_RUN_DIR: run,
            BE09_PG_DIR: pgBin, BE09_NODE_DIR: dirname(process.execPath) },
        });
        let stdout = '';
        let stderr = '';
        runnerProcess.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
        runnerProcess.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
        runnerProcess.on('error', rejectRun);
        runnerProcess.on('close', status => resolveRun({ status, stdout, stderr }));
      });
    }
    const oldStatus = await runCommand('status', oldRun);
    assert.match(oldStatus.stdout, /HTTP API: DOWN/);
    assert.match(oldStatus.stdout, /Frontend Vite: DOWN/);
    const newStatus = await runCommand('status', newRun);
    assert.match(newStatus.stdout, /HTTP API: LIVE/);
    assert.match(newStatus.stdout, /Frontend Vite: LIVE/);
    const down = await runCommand('down', oldRun);
    assert.equal(down.status, 0, down.stderr);
    for (const child of children) {
      assert.equal(child.exitCode, null, `down killed a newer run process ${child.pid}: ${down.stdout}`);
      process.kill(child.pid, 0);
    }
    assert.match(down.stdout, /not a live process owned by this run/g);
    const ownDown = await runCommand('down', newRun);
    assert.equal(ownDown.status, 0, ownDown.stderr);
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
      assert.equal(child.signalCode, 'SIGTERM', ownDown.stdout);
    }
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
    await rm(state, { recursive: true, force: true });
  }
});
