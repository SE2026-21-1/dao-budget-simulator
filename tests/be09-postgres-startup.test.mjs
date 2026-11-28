import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { initializeRun } from '../scripts/be09-metadata.mjs';
import { captureProcess, signalOwnedProcess } from '../scripts/be09-safety.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'scripts/be09-local.sh');
// Source-flow fixtures only: no socket, PostgreSQL server, network or lifecycle.
async function exercise(t, { status = 1, kind = 'owned' } = {}) {
  const stateRoot = await mkdtemp(join(tmpdir(), 'dao-budget-issue40-lifecycle-f402-unit-'));
  t.after(() => rm(stateRoot, { recursive: true, force: true }));
  const runDir = join(stateRoot, 'runs/unit');
  const pgdata = join(runDir, 'postgres/data');
  const tools = join(stateRoot, 'tools');
  for (const name of ['pids', 'logs', 'postgres/data', 'postgres/socket']) await mkdir(join(runDir, name), { recursive: true });
  await mkdir(tools);
  await writeFile(join(runDir, 'run-id'), 'unit\n');
  await initializeRun({ root, stateRoot, runDir, scope: 'issue40', rpcUrl: 'http://127.0.0.1:28545' });
  const pgCtl = join(tools, 'pg_ctl');
  await writeFile(pgCtl, `#!/bin/sh\nprintf '%s\\n' 'fixture: postmaster exists; pg_ctl wait result ${status}' >&2\nexit ${status}\n`);
  await chmod(pgCtl, 0o700);
  await symlink(await realpath(process.execPath), join(tools, 'postgres'));
  const source = `
    const fs=require('node:fs');
    const data=process.env.F402_DATA;
    if(${JSON.stringify(kind)}!=='missing-pid')fs.writeFileSync(data+'/postmaster.pid',process.pid+'\\n'+(${JSON.stringify(kind)}==='wrong-data'?data+'/different':data)+'\\n');
    setTimeout(()=>process.exit(98),15000);
    process.send({ready:true});
  `;
  const args = ['-e', source, '--', ...(kind === 'unrelated-argv' ? ['unrelated-fixture'] : ['-D', pgdata])];
  const child = spawn(process.execPath, args, { env: { ...process.env, F402_DATA: pgdata }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exit = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exit; }
  });
  await Promise.race([once(child, 'message'), exit.then(() => { throw new Error('Postmaster fixture exited before ready'); })]);
  const text = await readFile(runner, 'utf8');
  // Include locals introduced before pg_ctl while preserving the original block.
  const anchor = text.indexOf('  "$PG_CTL_BIN" -D "$pgdata" -l "$RUN_DIR/logs/postgres.log"');
  const preceding = text.lastIndexOf('\n', anchor - 2);
  const declaration = text.slice(preceding + 1, anchor);
  const begin = /^  local pg_start_status=0\n$/.test(declaration) ? preceding + 1 : anchor;
  const end = text.indexOf('  owned postgres 55432', anchor);
  assert.ok(anchor >= 0 && end > anchor, 'actual startup/capture block must exist');
  const startup = text.slice(begin, end);
  const trap = text.split('\n').find(line => line.startsWith("  trap 'status=$?; if [[ \"$UP_OK\" != 1 ]]"));
  assert.ok(trap, 'actual setup EXIT trap must exist');
  const env = { PATH: process.env.PATH, HOME: stateRoot, BE09_STATE_ROOT: stateRoot, BE09_SCOPE: 'issue40', BE09_NODE_DIR: dirname(process.execPath) };
  const shell = `source "$1" help >/dev/null
    STATE_ROOT="$2"; RUN_DIR="$3"; PG_CTL_BIN="$4"
    pgdata="$RUN_DIR/postgres/data"; socket_dir="$RUN_DIR/postgres/socket"
${trap}
    startup_fixture(){
${startup}
      printf '%s\\n' 'FIXTURE_STARTUP_CONTINUED'
      UP_OK=1
    }
    startup_fixture
  `;
  const result = spawnSync('bash', ['-c', shell, 'unit', runner, stateRoot, runDir, pgCtl], { cwd: root, env, encoding: 'utf8', timeout: 12000 });
  assert.ifError(result.error);
  await new Promise(done => setImmediate(done));
  const identityPath = join(runDir, 'pids/postgres.identity.json');
  const identity = await readFile(identityPath, 'utf8').then(JSON.parse).catch(() => null);
  const stoppedByStartup = child.signalCode === 'SIGINT';
  const continued = result.stdout.includes('FIXTURE_STARTUP_CONTINUED');
  let explicitHarnessRecovery = false;
  // Before-fix proof: show the surviving process WAS safely capturable, then
  // recover only this fixture. Never credit that recovery to the production trap.
  if (kind === 'owned' && status !== 0 && !identity && child.exitCode === null && child.signalCode === null) {
    await writeFile(join(runDir, 'pids/postgres.pid'), `${child.pid}\n`);
    await captureProcess({ runDir, label: 'postgres', pid: child.pid, executable: process.execPath, marker: pgdata, parentPid: process.pid });
    await signalOwnedProcess({ runDir, label: 'postgres', signal: 'INT' });
    await exit;
    explicitHarnessRecovery = true;
  }
  console.log(JSON.stringify({ kind, pgCtlStatus: status, startupStatus: result.status, capturedBeforeExitCleanup: !!identity, stoppedByStartup, continued, explicitHarnessRecovery, stdout: result.stdout, stderr: result.stderr, networkConnections: 0, databaseConnections: 0 }));
  assert.equal(result.status, status !== 0 ? status : kind === 'owned' ? 0 : 1, 'preserve original pg_ctl failure, or fail closed on unauthenticated success');
  if (kind === 'owned') {
    assert.ok(identity, 'startup must capture the legitimately owned postmaster even after pg_ctl timeout');
    assert.equal(identity.pid, child.pid);
    assert.equal(identity.pgdata, pgdata);
    if (status !== 0) {
      assert.equal(stoppedByStartup, true, 'actual setup EXIT cleanup must deliver guarded SIGINT');
      assert.equal(continued, false, 'failed startup must not continue to readiness/DB work');
      assert.equal(explicitHarnessRecovery, false);
    } else {
      assert.equal(continued, true);
      assert.equal(child.signalCode, null);
      await signalOwnedProcess({ runDir, label: 'postgres', signal: 'INT' });
      await exit;
    }
  } else {
    assert.equal(identity, null, 'never authenticate unrelated argv, mismatched PGDATA or missing PID');
    assert.equal(child.exitCode, null, 'unverified process must be left alive');
    assert.equal(child.signalCode, null);
    assert.equal(continued, false);
  }
}

test('F40-2 timeout with capturable postmaster uses actual EXIT cleanup', async t => exercise(t));
test('F40-2 nonstandard pg_ctl failure status survives authenticated cleanup', async t => exercise(t, { status: 37 }));
for (const kind of ['unrelated-argv', 'wrong-data', 'missing-pid']) {
  test(`F40-2 failure leaves ${kind} process untouched and preserves exit37`, async t => exercise(t, { status: 37, kind }));
}
test('F40-2 successful startup still captures the owned postmaster', async t => exercise(t, { status: 0 }));
test('F40-2 successful pg_ctl cannot authorize an unrelated postmaster', async t => exercise(t, { status: 0, kind: 'unrelated-argv' }));
