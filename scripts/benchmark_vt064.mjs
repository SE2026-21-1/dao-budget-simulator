import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { importDrafts } from '../indexer/import/drafts.js';

const directory = await mkdtemp(join(tmpdir(), 'vt064-load-'));
const recipient = `0x${'1'.repeat(40)}`;
const tasks = 80;
try {
  // Warm-up is deliberately excluded from the measurement and stored in the same temporary directory.
  for (let i = 0; i < 8; i++)
    await importDrafts([{ id: `warm${i}`, recipient, amount: '1', description: 'Warm up' }], directory);
  const started = performance.now();
  const samples = await Promise.all(Array.from({ length: tasks }, async (_, i) => {
    const id = `task${i}`;
    const result = await importDrafts([{ id, recipient, amount: String(i + 1), description: `Draft ${i}` }], directory);
    assert.deepEqual(result.imported, [id]);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')),
      { id, recipient, amount: String(i + 1), description: `Draft ${i}` });
    return performance.now() - started;
  }));
  samples.sort((a, b) => a - b);
  const p95Ms = samples[Math.ceil(tasks * .95) - 1];
  const report = { tasks, completed: samples.length, errors: 0, p95Ms, maxMs: samples.at(-1), targetMs: 2500,
    meetsTarget: p95Ms <= 2500, method: '80 concurrent in-process importer tasks; one real file persisted and read back per task',
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    limits: 'Local filesystem and Node task scheduling only; no HTTP, PostgreSQL, RPC, wallet or 80 external users.' };
  console.log(JSON.stringify(report, null, 2));
  if (!report.meetsTarget) process.exitCode = 2;
} finally {
  await rm(directory, { recursive: true, force: true });
}
