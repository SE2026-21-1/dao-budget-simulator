import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
