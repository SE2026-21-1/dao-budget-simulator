#!/usr/bin/env node
import { lstat, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const labels = new Set(['anvil', 'worker', 'api', 'frontend', 'postgres']);

function requireLinux() {
  if (process.platform !== 'linux') throw new Error('BE09 process ownership requires Linux /proc');
}

// Walk rather than realpath alone: realpath would silently accept a symlink.
async function canonicalPath(value, mustExist = false) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error('Path must be absolute');
  }
  const path = normalize(value);
  if (value.split(sep).some(part => part === '.' || part === '..')) {
    throw new Error(`Path must not contain traversal components: ${value}`);
  }
  let current = sep;
  let missing = false;
  for (const component of path.split(sep).filter(Boolean)) {
    current = join(current, component);
    if (missing) continue;
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink path component: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Not a directory: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      missing = true;
    }
  }
  if (missing && mustExist) throw new Error(`Directory does not exist: ${path}`);
  if (!missing && await realpath(path) !== path) throw new Error(`Noncanonical path: ${path}`);
  return path;
}

function inside(parent, child) {
  const part = relative(parent, child);
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part));
}

export async function canonicalRun({ root, stateRoot, runDir }) {
  requireLinux();
  root = await canonicalPath(root, true);
  stateRoot = await canonicalPath(stateRoot);
  runDir = await canonicalPath(runDir);
  if (inside(root, stateRoot) || inside(root, runDir)) throw new Error('State and run directories must be outside checkout');
  const runs = join(stateRoot, 'runs');
  if (dirname(runDir) !== runs || runDir === runs) {
    throw new Error('Run must be an exact immediate child of stateRoot/runs');
  }
  const runId = runDir.slice(runs.length + 1);
  if (!runId || runId === '.' || runId === '..') throw new Error('Invalid run ID');
  const pgdata = await canonicalPath(join(runDir, 'postgres/data'));
  return { root, stateRoot, runDir, runId, pgdata };
}

async function runPaths(runDir) {
  const canonical = await canonicalPath(runDir, true);
  return canonicalRun({ root: checkout, stateRoot: dirname(dirname(canonical)), runDir: canonical });
}

function validPid(value) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new Error(`Invalid PID: ${text}`);
  }
  return Number(text);
}

function checkLabel(label) {
  if (!labels.has(label)) throw new Error(`Unknown process label: ${label}`);
}

async function regularFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${path}`);
  return readFile(path, 'utf8');
}

async function processStat(pid, allowExited = false) {
  const text = await readFile(`/proc/${pid}/stat`, 'utf8');
  const close = text.lastIndexOf(')');
  if (close < 0 || text.slice(0, text.indexOf(' ')) !== String(pid)) throw new Error('Invalid proc stat');
  const fields = text.slice(close + 2).trim().split(/\s+/);
  const exited = fields[0] === 'Z' || fields[0] === 'X';
  if (exited && !allowExited) throw new Error(`Process ${pid} has exited`);
  if (!/^[0-9]+$/.test(fields[1])) throw new Error('Invalid parent PID in proc stat');
  return { parentPid: Number(fields[1]), startTicks: fields[19], exited };
}

async function snapshot(pid) {
  const before = await processStat(pid);
  const executable = await readlink(`/proc/${pid}/exe`);
  const raw = await readFile(`/proc/${pid}/cmdline`);
  if (!raw.length || raw.at(-1) !== 0) throw new Error(`Process ${pid} has no stable argv`);
  const argv = raw.subarray(0, -1).toString('utf8').split('\0');
  const bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  const after = await processStat(pid);
  if (before.parentPid !== after.parentPid || before.startTicks !== after.startTicks) {
    throw new Error(`Process ${pid} changed while inspecting`);
  }
  return { pid, parentPid: after.parentPid, startTicks: after.startTicks, executable, argv, argvBytes: raw.toString('base64'), bootId };
}

async function expectedMarker(paths, label) {
  if (label === 'anvil') return `be09-anvil-${paths.runId}`;
  const file = label === 'worker' ? 'indexer-config.json'
    : label === 'api' ? 'runtime.env' : label === 'frontend' ? 'frontend.env' : 'postgres/data';
  const marker = join(paths.runDir, file);
  if (label === 'postgres') return marker;
  await canonicalPath(dirname(marker), true);
  try {
    const stat = await lstat(marker);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(marker) !== marker) {
      throw new Error(`Noncanonical process marker: ${marker}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return marker;
}

function token(argv, option, value) {
  return argv.some((arg, index) => arg === `${option}=${value}` ||
    (arg === option && argv[index + 1] === value));
}

function hasMarker(argv, label, marker) {
  if (label === 'anvil') return argv.includes(marker);
  if (label === 'postgres') return argv.some((arg, index) => arg === '-D' && argv[index + 1] === marker);
  return token(argv, label === 'worker' ? '--config' : '--env-file', marker);
}

async function postgresPid(paths, pid) {
  const lines = (await regularFile(join(paths.pgdata, 'postmaster.pid'))).split('\n');
  if (validPid(lines[0]) !== pid || lines[1] !== paths.pgdata) {
    throw new Error('PostgreSQL postmaster PID or data directory does not match this run');
  }
}

export async function captureProcess({ runDir, label, pid, executable, marker, parentPid }) {
  requireLinux();
  checkLabel(label);
  const paths = await runPaths(runDir);
  await canonicalPath(join(paths.runDir, 'pids'), true);
  pid = validPid(pid);
  if (validPid((await regularFile(join(paths.runDir, 'pids', `${label}.pid`))).trim()) !== pid) {
    throw new Error('PID file does not match capture PID');
  }
  if (!isAbsolute(executable)) throw new Error('Expected executable must be absolute');
  executable = await realpath(executable);
  const live = await snapshot(pid);
  if (live.executable !== executable) throw new Error('Unexpected process executable');
  const expected = await expectedMarker(paths, label);
  const option = label === 'worker' ? '--config' : '--env-file';
  if (marker !== expected && marker !== `${option}=${expected}`) throw new Error('Unexpected run marker');
  if (!hasMarker(live.argv, label, expected)) throw new Error('Process lacks exact canonical run marker');
  if (parentPid !== undefined && live.parentPid !== validPid(parentPid)) throw new Error('Unexpected process parent');
  const parent = await processStat(live.parentPid);
  if (label === 'postgres') await postgresPid(paths, pid);
  const identity = { version: 1, ...paths, label, ...live, marker: expected, parentStartTicks: parent.startTicks };
  // A second snapshot closes the capture race before persisting an authority record.
  const final = await snapshot(pid);
  if (JSON.stringify(final) !== JSON.stringify(live)) throw new Error('Process changed during capture');
  await writeFile(join(paths.runDir, 'pids', `${label}.identity.json`), `${JSON.stringify(identity, null, 2)}\n`, {
    flag: 'wx', mode: 0o600,
  });
  return identity;
}

function loopback(address, ipv6) {
  const bytes = [];
  for (let index = 0; index < address.length; index += 8) {
    const word = address.slice(index, index + 8).match(/../g).reverse();
    bytes.push(...word.map(byte => Number.parseInt(byte, 16)));
  }
  if (!ipv6) return bytes.length === 4 && bytes[0] === 127;
  return (bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1) ||
    (bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 255 && bytes[11] === 255 && bytes[12] === 127);
}

async function assertListener(pid, port) {
  if (!/^[0-9]+$/.test(String(port)) || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid listener port');
  }
  port = Number(port);
  const owned = new Set();
  for (const fd of await readdir(`/proc/${pid}/fd`)) {
    try {
      const target = await readlink(`/proc/${pid}/fd/${fd}`);
      const match = /^socket:\[([0-9]+)\]$/.exec(target);
      if (match) owned.add(match[1]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let found = false;
  for (const table of ['tcp', 'tcp6']) {
    let text;
    try {
      text = await readFile(`/proc/net/${table}`, 'utf8');
    } catch (error) {
      if (table === 'tcp6' && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const line of text.trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/);
      const [address, rawPort] = fields[1].split(':');
      if (fields[3] !== '0A' || Number.parseInt(rawPort, 16) !== port) continue;
      if (!loopback(address, table === 'tcp6') || !owned.has(fields[9])) {
        throw new Error(`Port ${port} has a wildcard, non-loopback, or unrelated listener`);
      }
      if (table === 'tcp' && address === '0100007F') found = true;
    }
  }
  if (!found) throw new Error(`Process ${pid} has no owned loopback listener at 127.0.0.1 on port ${port}`);
}

export async function assertOwnedProcess({ runDir, label, port }) {
  requireLinux();
  checkLabel(label);
  const paths = await runPaths(runDir);
  await canonicalPath(join(paths.runDir, 'pids'), true);
  const identity = JSON.parse(await regularFile(join(paths.runDir, 'pids', `${label}.identity.json`)));
  for (const key of ['root', 'stateRoot', 'runDir', 'runId', 'pgdata']) {
    if (identity[key] !== paths[key]) throw new Error(`Identity ${key} does not match canonical run`);
  }
  if (identity.version !== 1 || identity.label !== label) throw new Error('Invalid process identity');
  const pid = validPid((await regularFile(join(paths.runDir, 'pids', `${label}.pid`))).trim());
  if (pid !== identity.pid) throw new Error('PID file does not match recorded identity');
  const live = await snapshot(pid);
  for (const key of ['pid', 'startTicks', 'bootId', 'executable', 'argvBytes']) {
    if (identity[key] !== live[key]) throw new Error(`Process ${key} does not match recorded identity`);
  }
  if (JSON.stringify(identity.argv) !== JSON.stringify(live.argv)) throw new Error('Process argv does not match recorded identity');
  if (live.parentPid !== identity.parentPid) {
    if (live.parentPid !== 1) throw new Error('Process parent changed to a non-init process');
    try {
      const originalParent = await processStat(validPid(identity.parentPid), true);
      if (!originalParent.exited && originalParent.startTicks === identity.parentStartTicks) throw new Error('Recorded parent is still alive');
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  } else {
    const parent = await processStat(live.parentPid);
    if (parent.startTicks !== identity.parentStartTicks) throw new Error('Process parent identity changed');
  }
  const marker = await expectedMarker(paths, label);
  if (identity.marker !== marker || !hasMarker(live.argv, label, marker)) throw new Error('Process lacks exact canonical run marker');
  if (label === 'postgres') await postgresPid(paths, pid);
  if (port !== undefined) await assertListener(pid, port);
  // Listener and parent checks can take time; reject reuse during those checks too.
  const final = await snapshot(pid);
  if (JSON.stringify(final) !== JSON.stringify(live)) throw new Error('Process changed during ownership validation');
  return identity;
}

export async function signalOwnedProcess({ runDir, label, signal }) {
  if (!['TERM', 'KILL', 'SIGTERM', 'SIGKILL'].includes(signal) && !(label === 'postgres' && ['INT', 'SIGINT'].includes(signal))) throw new Error('Only TERM/KILL, or postgres fast-shutdown INT, are allowed');
  const identity = await assertOwnedProcess({ runDir, label });
  process.kill(identity.pid, signal.startsWith('SIG') ? signal : `SIG${signal}`);
  return identity;
}

async function main(args) {
  const [command, ...values] = args;
  let result;
  if (command === 'paths' && values.length === 3) {
    result = await canonicalRun({ root: values[0], stateRoot: values[1], runDir: values[2] });
  } else if (command === 'capture' && (values.length === 5 || values.length === 6)) {
    result = await captureProcess({ runDir: values[0], label: values[1], pid: values[2], executable: values[3], marker: values[4], parentPid: values[5] });
  } else if (command === 'owned' && (values.length === 2 || values.length === 3)) {
    result = await assertOwnedProcess({ runDir: values[0], label: values[1], port: values[2] });
  } else if (command === 'signal' && values.length === 3) {
    result = await signalOwnedProcess({ runDir: values[0], label: values[1], signal: values[2] });
  } else {
    throw new Error('Usage: be09-safety.mjs paths ROOT STATE RUN | capture RUN LABEL PID EXE MARKER [PARENT] | owned RUN LABEL [PORT] | signal RUN LABEL TERM|KILL|INT(postgres)');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`BE09 ownership: ${error.message}\n`);
    process.exitCode = 1;
  });
}
