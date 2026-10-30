import { spawn } from 'node:child_process';
import { renameSync, rmdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };
const STOP_TIMEOUT = 5_000;

// Install before acquiring resources. Only children/directories created through
// this scope are owned; an existing evidence file is untouched until commit.
export function createSmokeLifecycle() {
  const controller = new AbortController();
  const children = new Set();
  const directories = new Map();
  const pending = new Set();
  let interrupted;
  let closing = false;
  let cleanupPromise;

  function throwIfInterrupted() {
    if (interrupted) throw controller.signal.reason;
    if (closing) throw new Error('Smoke resource scope is closed');
  }

  function track(operation) {
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }

  async function temporaryDirectory(prefix) {
    throwIfInterrupted();
    const directory = await track(mkdtemp(prefix).then(path => {
      directories.set(path, undefined);
      return path;
    }));
    throwIfInterrupted();
    return directory;
  }

  function removeDirectory(directory) {
    if (!directories.has(directory)) return Promise.resolve();
    let removing = directories.get(directory);
    if (!removing) {
      removing = rm(directory, { recursive: true, force: true }).then(() => { directories.delete(directory); });
      directories.set(directory, removing);
    }
    return removing;
  }

  function spawnOwned(command, args, options) {
    throwIfInterrupted();
    const child = spawn(command, args, options);
    const record = { child, stopped: undefined };
    record.closed = new Promise(done => child.once('close', done));
    // Callers retain their own diagnostics; avoid an unhandled spawn error even
    // if interruption reaches cleanup before the caller attaches a listener.
    child.on('error', () => {});
    children.add(record);
    return child;
  }

  function stop(record) {
    if (record.stopped) return record.stopped;
    record.stopped = (async () => {
      const { child } = record;
      let timer;
      const wait = () => Promise.race([
        record.closed.then(() => true),
        new Promise(done => { timer = setTimeout(() => done(false), STOP_TIMEOUT); }),
      ]).finally(() => clearTimeout(timer));
      if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      if (!await wait()) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        if (!await wait()) throw new Error('Owned smoke child did not close after SIGKILL');
      }
    })();
    return record.stopped;
  }

  async function stopChildren() {
    const results = await Promise.allSettled([...children].map(stop));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }

  function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    closing = true;
    cleanupPromise = (async () => {
      // An interrupted mkdtemp/write must settle before removing its directory.
      await Promise.allSettled([...pending]);
      const results = await Promise.allSettled([
        stopChildren(),
        ...[...directories.keys()].map(removeDirectory),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    })();
    return cleanupPromise;
  }

  function dispose() {
    for (const signal of Object.keys(EXIT_CODES)) process.removeListener(signal, handlers[signal]);
  }

  const handlers = Object.fromEntries(Object.entries(EXIT_CODES).map(([signal, code]) => [signal, () => {
    if (interrupted) return;
    interrupted = signal;
    controller.abort(new Error(`Smoke interrupted by ${signal}`));
    // Do not wait for arbitrary RPC/SQL work to unwind. Cleanup owns its bounded
    // child reap and waits only for owned filesystem operations; exit closes the
    // process's database connections without changing caller-owned databases.
    void cleanup().catch(() => {
      console.error('Interrupted smoke could not clean all owned resources');
    }).finally(() => process.exit(code));
  }]));
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);

  async function complete(output, report, message) {
    throwIfInterrupted();
    const directory = await temporaryDirectory(join(dirname(output), `.${basename(output)}-`));
    const staged = join(directory, 'completed.json');
    throwIfInterrupted();
    await track(writeFile(staged, JSON.stringify(report, null, 2) + '\n'));
    await stopChildren();
    await Promise.all([...directories.keys()].filter(path => path !== directory).map(removeDirectory));
    throwIfInterrupted();
    // There is no asynchronous interruption window between committing evidence,
    // removing the empty staging directory and declaring the run completed.
    renameSync(staged, output);
    rmdirSync(directory);
    directories.delete(directory);
    dispose();
    console.log(message);
  }

  return { signal: controller.signal, throwIfInterrupted, temporaryDirectory, removeDirectory,
    spawn: spawnOwned, stopChildren, cleanup, complete, dispose };
}
