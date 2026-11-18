#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispositionCounts, readySinglePreconditions, READY_SINGLE_DISPOSITION } from './qa05_actor_transition_cases.mjs';

assert.equal(process.argv.length, 4, 'Usage: node scripts/check_qa05_disposition.mjs --output <NEW-file>');
assert.equal(process.argv[2], '--output');
const root = fileURLToPath(new URL('../', import.meta.url));
const indexPath = 'docs/evidence/tv4-20261113-qa05-live.json';
const rawPath = 'docs/evidence/tv4-20261113-qa05-live-raw.tar.gz';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const indexBytes = await readFile(resolve(root, indexPath));
const index = JSON.parse(indexBytes);
assert.equal(hash(await readFile(resolve(root, rawPath))), index.rawSha256, 'Immutable raw checksum');
const preconditions = readySinglePreconditions();
assert.equal(preconditions.length, index.blockedPreconditions.count);
assert.equal(new Set(preconditions.map(row => row.label)).size, 10);
assert.equal(new Set(index.cases.map(row => row.label)).size, index.cases.length);
for (const row of preconditions) {
  assert.ok(index.cases.some(control => control.label === row.reachableControl && control.result === 'PASS'), row.label);
  assert.ok(!index.cases.some(control => control.label === row.label), 'N/A is not a reachable execution case');
}
const matrix = index.cases.filter(row => !row.label.startsWith('TC10/'));
const tc10 = index.cases.filter(row => row.label.startsWith('TC10/'));
assert.equal(matrix.length, index.matrix.cases);
assert.equal(tc10.length, index.tc10Ui.cases);
const sourceHashes = {};
for (const path of ['scripts/check_qa05_disposition.mjs', 'scripts/qa05_actor_transition_cases.mjs', 'scripts/check_qa05_variants.mjs']) {
  sourceHashes[path] = hash(await readFile(resolve(root, path)));
}
const report = {
  schemaVersion: 1, kind: 'qa05-disposition', generatedAt: new Date().toISOString(),
  generatorCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes,
  scope: 'Review-based disposition only; no new chain, browser, extension-wallet or testnet execution. Original campaign attribution and historical failures remain unchanged.',
  sourceIndex: { path: indexPath, sha256: hash(indexBytes) }, rawArchive: { path: rawPath, sha256: index.rawSha256 },
  review: { url: READY_SINGLE_DISPOSITION.review, reviewedCommit: READY_SINGLE_DISPOSITION.reviewedCommit, scope: 'TV1 SC10, SC06 v3 and Ready(single) only; not whole-PR approval' },
  assumptions: READY_SINGLE_DISPOSITION.assumptions,
  campaigns: [
    { sourceCommit: index.matrix.sourceCommit, cases: matrix.length, counts: dispositionCounts(matrix, []), scenarioReceipts: index.matrix.scenarioReceipts, browserCheckpoints: index.matrix.browserCheckpoints },
    { sourceCommit: index.tc10Ui.sourceCommit, cases: tc10.length, counts: dispositionCounts(tc10, []), scenarioReceipts: index.tc10Ui.scenarioReceipts, browserCheckpoints: index.tc10Ui.browserCheckpoints },
  ],
  preconditions: preconditions.map(row => ({ ...row, previousStatus: 'BLOCKED' })),
  counts: { reachableCases: dispositionCounts(index.cases, []), preconditions: dispositionCounts([], preconditions), total: dispositionCounts(index.cases, preconditions) },
  note: 'Cross-campaign disposition inventory, not one combined campaign or ledger. N/A does not count as PASS. Historical earlierFailedRuns are retained in sourceIndex and are not included in successful-campaign counts. Ready(batch), ETA, replay, mutation, rollback, single-Unset receipts and bootstrap negative controls remain required and unchanged.',
};
await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ kind: report.kind, counts: report.counts, output: resolve(process.argv[3]) }));
