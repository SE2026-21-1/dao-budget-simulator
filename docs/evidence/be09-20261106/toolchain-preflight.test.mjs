import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { sourceFiles, sourceProvenance } from '../../../scripts/be09-provenance.mjs';

test('preflight accepts a clean arbitrary HEAD and configurable toolchain, and rejects dirty or invalid inputs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'be09-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), tools = join(root, 'tool binaries'), home = join(root, 'account');
  await mkdir(join(repo, 'scripts'), { recursive: true });
  await mkdir(tools); await mkdir(home);
  const runner = await readFile('scripts/be09-local.sh', 'utf8');
  await writeFile(join(repo, 'scripts', 'be09-local.sh'), runner);
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('add', 'scripts/be09-local.sh');
  git('-c', 'user.name=Preflight Test', '-c', 'user.email=preflight@example.invalid', 'commit', '-qm', 'fixture');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const binaries = { node: 'v24.15.0', npm: '11.12.1', forge: 'forge Version: 1.8.5', anvil: 'anvil Version: 1.8.5',
    initdb: 'initdb (PostgreSQL) 18.4', pg_ctl: 'pg_ctl (PostgreSQL) 18.4', createdb: 'createdb (PostgreSQL) 18.4', psql: 'psql (PostgreSQL) 18.4' };
  for (const [name, version] of Object.entries(binaries)) {
    const path = join(tools, name);
    await writeFile(path, `#!/bin/sh\n[ "$1" = --version ] || exit 1\nprintf '%s\\n' '${version}'\n`);
    await chmod(path, 0o755);
  }
  const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin', BE09_NODE_DIR: tools,
    BE09_FOUNDRY_DIR: tools, BE09_PG_DIR: tools, BE09_LD_LIBRARY_PATH: join(root, 'custom-libs') };
  delete env.BE09_STATE_ROOT; delete env.BE09_RUN_DIR; delete env.XDG_STATE_HOME;
  const call = (command, extra = {}) => spawnSync('bash', ['scripts/be09-local.sh', command],
    { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
  const clean = call('preflight');
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, new RegExp(`Revision: ${commit}`));
  const pathOnly = { ...env, PATH: `${tools}:/usr/bin:/bin` };
  delete pathOnly.BE09_NODE_DIR; delete pathOnly.BE09_FOUNDRY_DIR; delete pathOnly.BE09_PG_DIR;
  const fromPath = spawnSync('bash', ['scripts/be09-local.sh', 'preflight'], { cwd: repo, env: pathOnly, encoding: 'utf8' });
  assert.equal(fromPath.status, 0, fromPath.stderr);
  await writeFile(join(repo, 'unexpected.txt'), 'dirty');
  assert.match(call('preflight').stderr, /Untracked file/);
  assert.notEqual(call('preflight').status, 0);
  await rm(join(repo, 'unexpected.txt'));
  await writeFile(join(repo, 'scripts', 'be09-local.sh'), runner + '\n# changed\n');
  assert.notEqual(call('preflight').status, 0);
  assert.match(call('preflight').stderr, /unstaged changes/);
  await writeFile(join(repo, 'scripts', 'be09-local.sh'), runner);
  const empty = join(root, 'empty'); await mkdir(empty);
  assert.match(call('preflight', { BE09_NODE_DIR: empty }).stderr, /Missing executable node/);
  await writeFile(join(tools, 'pg_ctl'), '#!/bin/sh\nprintf "%s\\n" "pg_ctl (PostgreSQL) 18.40"\n');
  assert.match(call('preflight').stderr, /PostgreSQL must be 18\.4/);

  const run = join(home, '.local', 'state', 'dao-budget-be09', 'runs', 'test-run');
  await mkdir(run, { recursive: true });
  const status = call('status');
  assert.match(status.stdout, /BE09 run directory:/);
  assert.ok(status.stdout.includes(run), 'Default state directory must use the current HOME');
});

test('source provenance captures the actual revision and hashes all runnable BE09 scripts', async t => {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const evidence = await sourceProvenance(resolve('.'), commit);
  assert.equal(evidence.sourceCommit, commit);
  assert.deepEqual(Object.keys(evidence.sha256), sourceFiles);
  for (const file of sourceFiles) {
    assert.equal(evidence.sha256[file], createHash('sha256').update(await readFile(file)).digest('hex'));
  }
  const dir = await mkdtemp(join(tmpdir(), 'be09-provenance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'source-provenance.json');
  execFileSync(process.execPath, ['scripts/be09-provenance.mjs', resolve('.'), output, commit]);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), evidence);
  assert.throws(() => execFileSync(process.execPath, ['scripts/be09-provenance.mjs', resolve('.'), output, commit], { stdio: 'ignore' }));
  await assert.rejects(sourceProvenance(dirname(process.execPath), 'not-a-sha'), /full Git source revision/);
});
