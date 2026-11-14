import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import type { Draft } from '../../indexer/import/drafts.js';

const exec = promisify(execFile);
const recipient = `0x${'1'.repeat(40)}`;
const draft = (id: string, description: string): Draft => ({ id, recipient, amount: '1', description });

async function temporary(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  // Only the isolation suffix varies; fixture names, child paths, IDs and generated data do not.
  const dir = await mkdtemp(join(tmpdir(), 'vt064-encoding-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function run(input: string, output: string) {
  return exec(process.execPath,
    ['--import', 'tsx', 'indexer/import/cli.ts', input, output], { cwd: process.cwd() });
}

async function rejectsInput(dir: string, bytes: Buffer, context: string): Promise<void> {
  const input = join(dir, 'input.json');
  const output = join(dir, 'drafts');
  await writeFile(input, bytes);
  await assert.rejects(run(input, output), (error: unknown) => {
    assert.ok(error instanceof Error && 'code' in error, context);
    assert.equal(error.code, 1, context);
    assert.ok('stdout' in error && typeof error.stdout === 'string', context);
    assert.ok('stderr' in error && typeof error.stderr === 'string', context);
    assert.equal(error.stdout, '', `${context}: must not report success`);
    assert.deepEqual(JSON.parse(error.stderr), { code: 'INVALID_INPUT' }, context);
    return true;
  }, context);
  // The CLI must validate the complete file before committing even its valid first row.
  assert.deepEqual(await readdir(dir), ['input.json'], `${context}: no output or temporary files`);
}

async function assertStored(output: string, row: Draft, context: string): Promise<void> {
  const bytes = await readFile(join(output, `${row.id}.json`));
  const stored = JSON.parse(bytes.toString('utf8')) as Draft;
  assert.deepEqual(stored, row, `${context}: exact field values`);
  assert.equal(stored.description, row.description, `${context}: exact Unicode description`);
}

test('CLI rejects malformed UTF-8 inside otherwise valid JSON without persisting valid neighbors', async (t) => {
  const marker = 'ENCODING_BYTES';
  const source = Buffer.from(JSON.stringify([
    draft('valid_before', 'Valid before corruption'),
    draft('corrupt', `Before ${marker} after`),
    draft('valid_after', 'Valid after corruption'),
  ]));
  const offset = source.indexOf(marker);
  assert.ok(offset >= 0);
  const cases = [
    { name: 'invalid_leading_byte', bytes: [0xff] },
    { name: 'stray_continuation', bytes: [0x80] },
    { name: 'overlong_slash', bytes: [0xc0, 0xaf] },
    { name: 'encoded_surrogate', bytes: [0xed, 0xa0, 0x80] },
    { name: 'above_unicode_max', bytes: [0xf4, 0x90, 0x80, 0x80] },
    { name: 'incomplete_before_ascii', bytes: [0xe2, 0x82] },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (child) => {
      const dir = await temporary(child);
      const bytes = Buffer.concat([
        source.subarray(0, offset), Buffer.from(fixture.bytes), source.subarray(offset + marker.length),
      ]);
      // This proves the counterexample is not merely malformed JSON after replacement decoding.
      const lossy = JSON.parse(bytes.toString('utf8')) as { description: string }[];
      assert.ok(lossy[1]!.description.includes('\ufffd'), fixture.name);
      await rejectsInput(dir, bytes, `${fixture.name}: bytes=${Buffer.from(fixture.bytes).toString('hex')}`);
    });
  }
});

test('CLI rejects a UTF-8 sequence truncated at EOF without committing the preceding JSON array', async (t) => {
  const dir = await temporary(t);
  const bytes = Buffer.concat([
    Buffer.from(JSON.stringify([draft('before_truncated_eof', 'Complete JSON precedes incomplete UTF-8')])),
    Buffer.from([0xf0, 0x9f, 0x92]),
  ]);
  await rejectsInput(dir, bytes, 'EOF sequence=f09f92 (missing fourth byte)');
});

test('CLI retains the existing rejection of a leading UTF-8 BOM', async (t) => {
  const dir = await temporary(t);
  const bytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify([draft('leading_bom', 'Otherwise valid JSON')])),
  ]);
  await rejectsInput(dir, bytes, 'leading UTF-8 BOM must not be silently stripped');
});

test('CLI preserves Unicode whose UTF-8 bytes span the 64 KiB read boundary', async (t) => {
  for (const [name, scalar] of [['two_byte', 'é'], ['three_byte', '漢'], ['four_byte', '😀']] as const) {
    await t.test(name, async (child) => {
      const dir = await temporary(child);
      const row = draft(`boundary_${name}`, `Boundary ${scalar} / e\u0301 / \ufffd / \ufeff / end`);
      const json = Buffer.from(JSON.stringify([row]));
      const scalarBytes = Buffer.from(scalar);
      const scalarOffset = json.indexOf(scalarBytes);
      assert.ok(scalarOffset >= 0);
      // JSON whitespace permits padding without exceeding the 1024-unit description limit.
      // The first scalar byte is the last byte of the current default 64 KiB file chunk.
      const bytes = Buffer.concat([Buffer.alloc(65535 - scalarOffset, 0x20), json]);
      assert.deepEqual(bytes.subarray(65535, 65535 + scalarBytes.length), scalarBytes);
      assert.ok(bytes.length > 65536 && bytes.length <= 1024 * 1024);
      const input = join(dir, 'input.json');
      const output = join(dir, 'drafts');
      await writeFile(input, bytes);
      const result = await run(input, output);
      assert.equal(result.stderr, '', name);
      assert.deepEqual(JSON.parse(result.stdout), {
        status: 'completed', imported: [{ index: 0, id: row.id }], rejected: [],
      }, name);
      assert.deepEqual(await readdir(output), [`${row.id}.json`], name);
      await assertStored(output, row, `${name}: scalar=${scalarBytes.toString('hex')} offset=65535`);
    });
  }
});

test('CLI persists a seeded generated valid-Unicode batch without replacement or normalization', async (t) => {
  const dir = await temporary(t);
  const initialSeed = 0x23001850;
  let seed = initialSeed;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const examples = ['ASCII', 'Tiếng Việt', '漢字', '😀🚀', 'é e\u0301', '\ufffd', '\ufeff', '\u0000\n\t', '👩‍💻'];
  const rows = Array.from({ length: 48 }, (_, index) => {
    let description = `Generated ${index}: ${examples[index % examples.length]} `;
    for (let scalar = 0; scalar < 24; scalar++) {
      // Sample all Unicode scalar ranges while excluding surrogate code points.
      const point = next() % (0x110000 - 0x800);
      description += String.fromCodePoint(point < 0xd800 ? point : point + 0x800);
    }
    return draft(`unicode_${index.toString().padStart(2, '0')}`, description);
  });
  const input = join(dir, 'input.json');
  const output = join(dir, 'drafts');
  const bytes = Buffer.from(JSON.stringify(rows));
  assert.ok(bytes.length <= 1024 * 1024);
  await writeFile(input, bytes);
  const result = await run(input, output);
  const context = `seed=0x${initialSeed.toString(16)}`;
  assert.equal(result.stderr, '', context);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'completed', imported: rows.map((row, index) => ({ index, id: row.id })), rejected: [],
  }, context);
  assert.deepEqual((await readdir(output)).sort(), rows.map((row) => `${row.id}.json`).sort(), context);
  for (const [index, row] of rows.entries()) {
    await assertStored(output, row, `${context} row=${index} id=${row.id} description=${JSON.stringify(row.description)}`);
  }
});
