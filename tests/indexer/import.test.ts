import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ImportFailure, importDrafts, saveDraft, type Draft } from '../../indexer/import/drafts.js';

const exec = promisify(execFile);
const recipient = `0x${'1'.repeat(40)}`;
const draft = (id: string, amount = '1000000000000000000') => ({ id, recipient, amount, description: `Spend ${id}` });
async function temporary(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vt064-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function stored(dir: string, id: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) as unknown;
}

// T01: the failure in the middle must not poison the valid row after it.
test('mixed import retains both valid neighbors and exact values', async (t) => {
  const dir = await temporary(t);
  const a = draft('a', '1'), b = draft('b', ((1n << 256n) - 1n).toString());
  const result = await importDrafts([a, { ...draft('bad'), amount: '0' }, b], dir);
  assert.deepEqual(result.imported, ['a', 'b']);
  assert.deepEqual(result.rejected, [{ index: 1, reason: 'INVALID_AMOUNT' }]);
  assert.deepEqual(await stored(dir, 'a'), a);
  assert.deepEqual(await stored(dir, 'b'), b);
});

// T02, T04: path traversal and malformed amounts are not persisted.
test('invalid records and empty input cannot create a draft or escape the directory', async (t) => {
  const dir = await temporary(t);
  const rows = [draft('../escape'), { ...draft('zero'), amount: '0' },
    { ...draft('leading'), amount: '01' }, { ...draft('overflow'), amount: (1n << 256n).toString() },
    { ...draft('address'), recipient: '0xabc' }, { ...draft('empty'), description: '' }];
  const result = await importDrafts(rows, dir);
  assert.deepEqual(result.imported, []);
  assert.deepEqual(result.rejected.map((x) => x.reason), [
    'INVALID_ID', 'INVALID_AMOUNT', 'INVALID_AMOUNT', 'INVALID_AMOUNT', 'INVALID_RECIPIENT', 'INVALID_DESCRIPTION',
  ]);
  assert.deepEqual(await readdir(dir), []);
  await assert.rejects(importDrafts([], dir), /1 to 1000/);
  await assert.rejects(importDrafts(Array.from({ length: 1001 }, (_, i) => draft(`x${i}`)), dir), /1 to 1000/);
});

// T03: seeded property over generated mixed rows, verifying files, not mocks.
test('seeded generated batches persist exactly their valid records', async (t) => {
  const dir = await temporary(t);
  let seed = 0x23001850;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const expected = new Map<string, Draft>();
  for (let batch = 0; batch < 40; batch++) {
    const rows: Draft[] = [];
    const valid: string[] = [];
    for (let index = 0, length = 1 + next() % 24; index < length; index++) {
      const id = `p${batch}_${index}`;
      const row = draft(id, [ '1', '1000000000000000000', ((1n << 256n) - 1n).toString() ][next() % 3]!);
      const kind = next() % 5;
      if (kind === 0) row.id = '../outside';
      else if (kind === 1) row.amount = '00';
      else if (kind === 2) row.recipient = 'broken';
      else { expected.set(id, row); valid.push(id); }
      rows.push(row);
    }
    const result = await importDrafts(rows, dir);
    assert.deepEqual(result.imported, valid, `seed=0x23001850 batch=${batch}`);
    assert.deepEqual(result.rejected.map((x) => x.index), rows.flatMap((x, i) => x.id.startsWith('p') && x.recipient === recipient && x.amount !== '00' ? [] : [i]));
  }
  const names = (await readdir(dir)).sort();
  assert.deepEqual(names, [...expected.keys()].map((id) => `${id}.json`).sort());
  for (const [id, row] of expected) assert.deepEqual(await stored(dir, id), row);
});

// T05, T06: conflict never overwrites an existing draft, even when racing.
test('duplicate and concurrent same-ID imports preserve exactly one winner', async (t) => {
  const dir = await temporary(t);
  const first = draft('same', '10');
  await importDrafts([first], dir);
  const result = await importDrafts([draft('same', '20'), draft('new')], dir);
  assert.deepEqual(result.imported, ['new']);
  assert.deepEqual(result.rejected, [{ index: 0, reason: 'DUPLICATE_ID' }]);
  assert.deepEqual(await stored(dir, 'same'), first);
  const race = await Promise.all([importDrafts([draft('race', '30')], dir), importDrafts([draft('race', '40')], dir)]);
  assert.equal(race.reduce((n, x) => n + x.imported.length, 0), 1);
  assert.equal(race.reduce((n, x) => n + x.rejected.length, 0), 1);
  const winner = await stored(dir, 'race');
  assert.ok(winner && typeof winner === 'object' && 'amount' in winner && typeof winner.amount === 'string');
  assert.ok(['30', '40'].includes(winner.amount));
  assert.deepEqual((await readdir(dir)).sort(), ['new.json', 'race.json', 'same.json']);
});

// T07: actual disk failure, asserting no false success report.
test('persistence failure cannot be returned as success', async (t) => {
  const dir = await temporary(t);
  const blocked = join(dir, 'not-a-directory');
  await writeFile(blocked, 'occupied');
  await assert.rejects(importDrafts([draft('a')], blocked), (error: unknown) => {
    assert.ok(error instanceof ImportFailure);
    assert.equal(error.code, 'PERSISTENCE_FAILED');
    assert.deepEqual(error.imported, []);
    assert.equal(error.index, 0);
    return true;
  });
  assert.deepEqual(await readdir(dir), ['not-a-directory']);
});

// T08: first real file survives when the next persistence operation fails.
test('mid-batch storage failure preserves prior committed row without claiming later rows', async (t) => {
  const dir = await temporary(t);
  let calls = 0;
  await assert.rejects(importDrafts([draft('first'), draft('second'), draft('third')], dir,
    async (destination, row) => { if (++calls === 2) throw new Error('disk unavailable'); await saveDraft(destination, row); }), (error: unknown) => {
    assert.ok(error instanceof ImportFailure);
    assert.deepEqual(error.imported, ['first']);
    assert.equal(error.index, 1);
    return true;
  });
  assert.deepEqual(await readdir(dir), ['first.json']);
  assert.deepEqual(await stored(dir, 'first'), draft('first'));
});

// T09, T10: actual CLI with local input/output, exit code and disk observable.
test('CLI reports accepted/rejected rows and fails closed on invalid input/persistence', async (t) => {
  const dir = await temporary(t);
  const input = join(dir, 'input.json'), out = join(dir, 'drafts');
  await writeFile(input, JSON.stringify([draft('cli'), { ...draft('bad'), recipient: 'bad' }]));
  const run = async (path: string, output = out) => exec(process.execPath,
    ['--import', 'tsx', 'indexer/import/cli.ts', path, output], { cwd: process.cwd() });
  const passed = await run(input);
  assert.deepEqual(JSON.parse(passed.stdout), { status: 'completed', imported: ['cli'], rejected: [{ index: 1, reason: 'INVALID_RECIPIENT' }] });
  assert.deepEqual(await stored(out, 'cli'), draft('cli'));
  await writeFile(input, '{');
  await assert.rejects(run(input), (error: unknown) => {
    assert.ok(error instanceof Error && 'code' in error && error.code === 1);
    return true;
  });
  await writeFile(input, ' '.repeat(1024 * 1024 + 1));
  await assert.rejects(run(input), (error: unknown) => {
    assert.ok(error instanceof Error && 'code' in error && error.code === 1);
    assert.ok('stderr' in error && typeof error.stderr === 'string');
    assert.equal(JSON.parse(error.stderr).code, 'INVALID_INPUT');
    return true;
  });
  await writeFile(input, JSON.stringify([draft('more')]));
  const failed = join(dir, 'blocked'); await writeFile(failed, 'occupied');
  await assert.rejects(run(input, failed), (error: unknown) => {
    assert.ok(error instanceof Error && 'code' in error && error.code === 1);
    assert.ok('stderr' in error && typeof error.stderr === 'string');
    assert.ok('stdout' in error && typeof error.stdout === 'string');
    assert.equal(error.stdout, '');
    assert.equal(JSON.parse(error.stderr).code, 'PERSISTENCE_FAILED');
    return true;
  });
});
