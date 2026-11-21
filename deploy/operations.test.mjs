import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { migrationFiles, readManifest, sha256 } from './common.mjs';
import { transactionBody } from './migrate.mjs';

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dao-deployment-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function manifest(sha = 'a'.repeat(40)) {
  return { schemaVersion: 1, repository: 'SE2026-21-1/dao-budget-simulator', sha, runId: '123', images: Object.fromEntries(['frontend', 'api', 'indexer'].map((service) => [service, `ghcr.io/se2026-21-1/dao-budget-simulator/${service}@sha256:${'b'.repeat(64)}`])), migrationSet: 'c'.repeat(64) };
}

test('all existing SQL migrations retain their bodies without nested transaction wrappers', async () => {
  const { files } = await migrationFiles();
  for (const file of files) {
    const body = transactionBody(file.sql);
    assert.ok(body.trim().length > 0, file.name);
    assert.doesNotMatch(body, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
  }
  assert.equal(transactionBody('-- reviewed migration\nBEGIN;\nCREATE TABLE sample(id integer);\nCOMMIT;\n'), '\nCREATE TABLE sample(id integer);\n');
  assert.equal(transactionBody('BEGIN; COMMIT;'), ' ');
  for (const sql of ['CREATE TABLE sample(id integer);', 'BEGIN;\nROLLBACK;\nCOMMIT;', 'BEGIN; SELECT 1; COMMIT; SELECT 2; COMMIT;', 'BEGIN; SELECT 1; /* note */ START TRANSACTION; COMMIT;']) {
    assert.throws(() => transactionBody(sql), /transaction/);
  }
  const quoted = "BEGIN; SELECT 'COMMIT;', $$ROLLBACK;$$, E'it\\'s; COMMIT;'; /* COMMIT; /* nested */ */ COMMIT;";
  assert.ok(transactionBody(quoted).includes('COMMIT;'));
});

test('migration set hashes exact contents in sorted filename order', async (t) => {
  const directory = await temporary(t);
  await writeFile(join(directory, '002.sql'), 'BEGIN; SELECT 2; COMMIT;\n');
  await writeFile(join(directory, '001.sql'), 'BEGIN; SELECT 1; COMMIT;\n');
  await writeFile(join(directory, 'ignore.txt'), 'not a migration');
  const result = await migrationFiles(directory);
  assert.deepEqual(result.files.map((f) => f.name), ['001.sql', '002.sql']);
  assert.equal(result.fingerprint, sha256(`001.sql:${sha256('BEGIN; SELECT 1; COMMIT;\n')}\n002.sql:${sha256('BEGIN; SELECT 2; COMMIT;\n')}\n`));
  await writeFile(join(directory, '001.sql'), 'BEGIN; SELECT 10; COMMIT;\n');
  assert.notEqual((await migrationFiles(directory)).fingerprint, result.fingerprint);
});

test('manifest rejects tags, cross-service digests, foreign registries and numeric run IDs', async (t) => {
  const directory = await temporary(t);
  const path = join(directory, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest()));
  assert.deepEqual(await readManifest(path), manifest());
  for (const mutation of [
    (m) => { m.images.api = 'ghcr.io/se2026-21-1/dao-budget-simulator/api:latest'; },
    (m) => { m.images.api = m.images.indexer; },
    (m) => { m.images.frontend = m.images.frontend.replace('ghcr.io', 'example.com'); },
    (m) => { m.runId = 123; },
    (m) => { m.sha = 'A'.repeat(40); },
  ]) {
    const invalid = manifest(); mutation(invalid);
    await writeFile(path, JSON.stringify(invalid));
    await assert.rejects(readManifest(path), /Invalid/);
  }
});

test('activation advances previous only with the new current manifest and schema', async (t) => {
  const directory = await temporary(t);
  const root = join(directory, 'server');
  const releases = await Promise.all(['a', 'b', 'c'].map(async (letter) => {
    const release = join(directory, letter);
    await mkdir(release);
    await writeFile(join(release, 'manifest.json'), JSON.stringify(manifest(letter.repeat(40))));
    return release;
  }));
  const state = fileURLToPath(new URL('./state.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [state, ...args], { encoding: 'utf8' });
  assert.equal(run('activate', root, releases[0], 'e'.repeat(64)).status, 0);
  const first = await realpath(join(root, 'current'));
  assert.equal(run('activate', root, releases[1], 'e'.repeat(64)).status, 0);
  const second = await realpath(join(root, 'current'));
  assert.equal(await realpath(join(root, 'previous')), first);
  // A failed activation must not expose new state or consume the rollback target.
  assert.equal(run('activate', root, releases[2], 'invalid-schema').status, 1);
  assert.equal(await realpath(join(root, 'current')), second);
  assert.equal(await realpath(join(root, 'previous')), first);
  assert.equal(run('activate', root, releases[2], 'f'.repeat(64)).status, 0);
  assert.equal(JSON.parse(await readFile(join(root, 'current', 'manifest.json'), 'utf8')).sha, 'c'.repeat(40));
  assert.equal(JSON.parse(await readFile(join(root, 'current', 'state.json'), 'utf8')).schemaFingerprint, 'f'.repeat(64));
  assert.equal(await realpath(join(root, 'previous')), second);
  // A real filesystem rename failure after staging previous must restore it too.
  await rename(join(root, 'current'), join(root, 'saved-current'));
  await mkdir(join(root, 'current'));
  for (const file of ['manifest.json', 'state.json']) {
    await writeFile(join(root, 'current', file), await readFile(join(root, 'saved-current', file)));
  }
  const failedCutover = run('activate', root, releases[0], 'e'.repeat(64));
  assert.equal(failedCutover.status, 1, failedCutover.stderr);
  assert.equal(await realpath(join(root, 'previous')), second);
  assert.equal(JSON.parse(await readFile(join(root, 'current', 'manifest.json'), 'utf8')).sha, 'c'.repeat(40));
  assert.equal(JSON.parse(await readFile(join(root, 'current', 'state.json'), 'utf8')).schemaFingerprint, 'f'.repeat(64));
});

async function shellDeployment(t) {
  const directory = await temporary(t);
  const root = join(directory, 'server');
  const shared = join(root, 'shared');
  const bin = join(directory, 'bin');
  await mkdir(shared, { recursive: true });
  await mkdir(bin);
  await writeFile(join(bin, 'docker'), await readFile(new URL('./docker-fixture.mjs', import.meta.url)), { mode: 0o700 });
  for (const file of ['runtime.env', 'indexer.json', 'frontend.json', 'github.env']) {
    await writeFile(join(shared, file), file === 'github.env' ? 'GH_TOKEN=offline-test-token\n' : '{}\n', { mode: 0o600 });
  }
  const schema = 'e'.repeat(64);
  await writeFile(join(root, 'schema'), schema);
  await writeFile(join(root, 'failure.json'), '{}');
  const releases = {};
  for (const letter of ['a', 'b', 'c']) {
    const release = join(directory, letter);
    await mkdir(join(release, 'scripts', 'cd'), { recursive: true });
    await mkdir(join(release, 'deploy'));
    const data = manifest(letter.repeat(40));
    // Distinct digests make shell identity checks distinguish A, B and C.
    for (const service of Object.keys(data.images)) data.images[service] = data.images[service].replace('b'.repeat(64), letter.repeat(64));
    await writeFile(join(release, 'manifest.json'), JSON.stringify(data));
    await writeFile(join(release, 'deploy', 'compose.yml'), await readFile(new URL('./compose.yml', import.meta.url)));
    // Replace only online GitHub provenance with local manifest validation.
    // deploy.sh and its state helper are the actual unmodified subjects.
    await writeFile(join(release, 'scripts', 'cd', 'release.mjs'), `
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { validateManifest, imageEnvironment } from ${JSON.stringify(new URL('../scripts/cd/release.mjs', import.meta.url).href)};
const [command, shaFlag, sha, manifestFlag, path] = process.argv.slice(2);
if (command !== 'verify' || shaFlag !== '--sha' || manifestFlag !== '--manifest') throw new Error('Unexpected verification arguments');
const manifest = validateManifest(JSON.parse(await readFile(path, 'utf8')), sha);
await writeFile(join(dirname(path), 'release.env'), imageEnvironment(manifest));
`);
    releases[letter] = { path: release, manifest: data };
  }
  const state = fileURLToPath(new URL('./state.mjs', import.meta.url));
  for (const letter of ['a', 'b']) {
    const result = spawnSync(process.execPath, [state, 'activate', root, releases[letter].path, schema], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  await writeFile(join(root, 'running.json'), JSON.stringify({ sha: releases.b.manifest.sha, images: releases.b.manifest.images, running: true }));
  const snapshots = {
    current: await realpath(join(root, 'current')),
    previous: await realpath(join(root, 'previous')),
  };
  const script = fileURLToPath(new URL('./deploy.sh', import.meta.url));
  const run = (...args) => spawnSync('bash', [script, ...args], {
    env: { ...process.env, DAO_ROOT: root, DEPLOY_SHARED_DIR: shared, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
    timeout: 30000,
  });
  const assertPreserved = async () => {
    for (const [name, snapshot] of Object.entries(snapshots)) {
      assert.equal(await realpath(join(root, name)), snapshot, `${name} snapshot must not change on failure`);
    }
    const running = JSON.parse(await readFile(join(root, 'running.json'), 'utf8'));
    assert.equal(running.sha, releases.b.manifest.sha, 'recovery must actually restore running B');
    assert.equal(running.running, true);
  };
  return { root, releases, run, assertPreserved };
}

for (const phase of ['up', 'smoke']) {
  test(`failed rollout and failed rollback during ${phase} preserve B/A and permit retry to A`, async (t) => {
    const { root, releases, run, assertPreserved } = await shellDeployment(t);
    await writeFile(join(root, 'failure.json'), JSON.stringify({ sha: releases.c.manifest.sha, phase }));
    const deploy = run('deploy', releases.c.path, releases.c.manifest.sha);
    assert.equal(deploy.error, undefined, `${deploy.stderr}\n${await readFile(join(root, 'docker.log'), 'utf8')}`);
    assert.equal(deploy.status, 1, deploy.stderr);
    assert.match(deploy.stderr, /Previous application images restored and smoke passed/);
    await assertPreserved();

    await writeFile(join(root, 'failure.json'), JSON.stringify({ sha: releases.a.manifest.sha, phase }));
    const rollback = run('rollback');
    assert.equal(rollback.error, undefined, `${rollback.stderr}\n${await readFile(join(root, 'docker.log'), 'utf8')}`);
    assert.equal(rollback.status, 1, rollback.stderr);
    assert.match(rollback.stderr, /Previous application images restored and smoke passed/);
    await assertPreserved();

    await writeFile(join(root, 'failure.json'), '{}');
    const retry = run('rollback');
    assert.equal(retry.error, undefined, `${retry.stderr}\n${await readFile(join(root, 'docker.log'), 'utf8')}`);
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(JSON.parse(await readFile(join(root, 'current', 'manifest.json'), 'utf8')).sha, releases.a.manifest.sha);
    assert.equal(JSON.parse(await readFile(join(root, 'previous', 'manifest.json'), 'utf8')).sha, releases.b.manifest.sha);
    const running = JSON.parse(await readFile(join(root, 'running.json'), 'utf8'));
    assert.equal(running.sha, releases.a.manifest.sha);
    assert.equal(running.running, true);
    const updates = (await readFile(join(root, 'docker.log'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)).filter((entry) => entry.operation === 'up');
    assert.deepEqual(updates.map((entry) => entry.sha), ['c', 'b', 'a', 'b', 'a'].map((letter) => letter.repeat(40)));
  });
}
