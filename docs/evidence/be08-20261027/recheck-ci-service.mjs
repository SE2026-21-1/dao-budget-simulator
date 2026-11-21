// Local proof of the same explicit-service mode used by be08.yml.
// Provisions its own new PostgreSQL18.4 service; never reads DATABASE_URL.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const [bin, driverOutput, suiteOutput] = process.argv.slice(2);
assert.ok(bin && driverOutput && suiteOutput);
const output = resolve(driverOutput); await mkdir(output);
const directory = await mkdtemp(join(tmpdir(), 'dao-be08-ci-service-'));
const data = join(directory, 'data'); const password = randomBytes(32).toString('hex');
const commands = []; let started = false, child;
const clean = value => String(value).replaceAll(password, '[REDACTED]');
function run(label, command, args) {
  const entry = { label, command, args, startedAt: new Date().toISOString() }; commands.push(entry);
  try {
    const text = execFileSync(command, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    entry.exitCode = 0; return writeFile(join(output, label + '.log'), clean(text), { flag: 'wx' });
  } catch (error) {
    entry.exitCode = error.status; throw error;
  }
}
try {
  const reserve = createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  const pwfile = join(directory, 'password'); await writeFile(pwfile, password + '\n', { mode: 0o600 });
  await run('initdb', join(bin, 'initdb'), ['-D', data, '-U', 'be08_admin', '--auth-local=trust', '--auth-host=scram-sha-256', '--pwfile', pwfile, '--encoding=UTF8', '--locale=C']);
  await writeFile(join(data, 'postgresql.auto.conf'), `listen_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories='${directory}'\n`);
  await new Promise(r => reserve.close(r));
  started = true;
  await run('start', join(bin, 'pg_ctl'), ['-D', data, '-l', join(directory, 'postgres.log'), '-w', '-t', '30', 'start']);
  const args = ['scripts/check_be08_native.mjs', '--admin-env', 'BE08_ADMIN_URL', '--output', suiteOutput];
  const entry = { label: 'ci-service-mode', command: 'node', args, startedAt: new Date().toISOString() }; commands.push(entry);
  child = spawn(process.execPath, args, { env: { ...process.env, BE08_TEST_ISOLATED: '1',
    BE08_ADMIN_URL: `postgresql://be08_admin:${password}@127.0.0.1:${port}/postgres` }, stdio: 'inherit' });
  const interrupt = () => child.kill('SIGTERM'); process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  entry.exitCode = await new Promise((r, j) => { child.once('error', j); child.once('exit', r); });
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  assert.equal(entry.exitCode, 0);
} finally {
  if (started) await run('stop', join(bin, 'pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop']);
  await writeFile(join(output, 'commands.json'), JSON.stringify(commands, null, 2) + '\n', { flag: 'wx' });
  try { await writeFile(join(output, 'postgres.log'), clean(await readFile(join(directory, 'postgres.log'), 'utf8')), { flag: 'wx' }); } catch {}
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '/dao-be08-ci-service-'));
  await rm(directory, { recursive: true });
}
