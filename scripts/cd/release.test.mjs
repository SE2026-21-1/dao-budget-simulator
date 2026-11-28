import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateManifest, validateRun, migrationFingerprint, repository, imageEnvironment } from './release.mjs';
const sha = 'a'.repeat(40);
const release = () => ({ schemaVersion: 1, repository, sha, runId: '123', migrationSet: 'b'.repeat(64), images: Object.fromEntries(['frontend', 'api', 'indexer'].map((s) => [s, `ghcr.io/${repository.toLowerCase()}/${s}@sha256:${'c'.repeat(64)}`])) });
const run = () => ({ id: 123, head_sha: sha, head_branch: 'Dev', event: 'push', path: '.github/workflows/ci.yml', name: 'TV4 CI', head_repository: { full_name: repository }, status: 'completed', conclusion: 'success' });
test('complete release produces only digest-pinned image environment', () => {
  const manifest = release();
  validateManifest(manifest, sha);
  assert.equal(imageEnvironment(manifest), ['frontend', 'api', 'indexer'].map((s) => `${s.toUpperCase()}_IMAGE=${manifest.images[s]}\n`).join(''));
  validateRun(run(), manifest);
});
test('rejects wrong SHA, partial release, tag references and environment injection', () => {
  assert.throws(() => validateManifest(release(), 'd'.repeat(40)), /SHA mismatch/);
  for (const invalid of ['latest', `ghcr.io/${repository.toLowerCase()}/api:sha-${sha}`, release().images.api + '\nRPC_URL=evil', release().images.api.replace('/api@', '/frontend@')]) {
    const manifest = release(); manifest.images.api = invalid;
    assert.throws(() => validateManifest(manifest, sha), /digest reference/);
  }
  const manifest = release(); delete manifest.images.indexer;
  assert.throws(() => validateManifest(manifest, sha), /three images/);
});
test('rejects untrusted, unfinished and failed CI provenance even for matching SHA', () => {
  for (const change of [{ head_branch: 'feature/untrusted' }, { event: 'pull_request' }, { conclusion: 'failure' }, { status: 'in_progress' }, { head_sha: 'd'.repeat(40) }, { path: '.github/workflows/other.yml' }, { head_repository: { full_name: 'attacker/fork' } }, { id: 456 }]) {
    assert.throws(() => validateRun({ ...run(), ...change }, release()));
  }
});
test('migration fingerprint ignores creation order but changes with SQL or filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dao-migrations-'));
  try {
    const a = join(root, 'a'); const b = join(root, 'b'); await mkdir(a); await mkdir(b);
    await writeFile(join(a, '002.sql'), 'SELECT 2;'); await writeFile(join(a, '001.sql'), 'SELECT 1;');
    await writeFile(join(b, '001.sql'), 'SELECT 1;'); await writeFile(join(b, '002.sql'), 'SELECT 2;');
    const before = await migrationFingerprint(a);
    assert.equal(before, await migrationFingerprint(b));
    await writeFile(join(b, '002.sql'), 'SELECT 3;');
    assert.notEqual(before, await migrationFingerprint(b));
  } finally { await rm(root, { recursive: true, force: true }); }
});
