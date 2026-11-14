#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVariantHarness, json } from './qa05_variant_harness.mjs';
import { runCases as snapshotPayload } from './qa05_snapshot_payload_cases.mjs';
import { runCases as actorTransition, dispositionCounts } from './qa05_actor_transition_cases.mjs';
import { runCases as requestUi } from './qa05_request_ui_cases.mjs';

assert.ok(process.argv.length === 4 || process.argv.length === 6, 'Use the owned native wrapper; --output <NEW-directory> [--family all|tc10]'); assert.equal(process.argv[2], '--output');
const family = process.argv.length === 6 ? (assert.equal(process.argv[4], '--family'), process.argv[5]) : 'all';
assert.ok(['all', 'tc10'].includes(family));
assert.equal(process.env.TV4_VARIANTS_ISOLATED, '1');
const admin = new URL(process.env.TV4_VARIANTS_ADMIN_URL);
assert.equal(admin.protocol, 'postgresql:'); assert.equal(admin.hostname, '127.0.0.1'); assert.equal(admin.pathname, '/postgres'); assert.equal(admin.username, 'variants_test'); assert.ok(!admin.password && !admin.search && !admin.hash);
const output = resolve(process.argv[3]); const root = fileURLToPath(new URL('../', import.meta.url));
const record = (name, value) => writeFile(join(output, name), json(value) + '\n', { flag: 'wx' });
const report = {
  scope: 'NEW independent empty-chain/F0 cases with real mined success/failure receipts, distinct owned PostgreSQL snapshots and HTTP API, then actual browser/adapter acknowledgement per checkpoint. Shared sync/project, not CLI-worker proof. No extension or testnet acceptance. Ten production-unreachable Ready(single) preconditions are N/A under the cited TV1 review and audited assumptions, never PASS or replacements for role-first proof.',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes: {},
  toolchain: { node: process.version, forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }) }, cases: [], status: 'RUNNING',
  family,
};
for (const file of ['scripts/check_qa05_variants.mjs', 'scripts/check_qa05_variants_native.mjs', 'scripts/qa05_variant_harness.mjs', 'scripts/qa05_snapshot_payload_cases.mjs', 'scripts/qa05_actor_transition_cases.mjs', 'scripts/governance_local.mjs', 'scripts/governance_operations.mjs', 'scripts/smoke_lifecycle.mjs', 'contracts/BudgetGovernor.sol', 'contracts/GovernanceToken.sol', 'contracts/Treasury.sol', 'indexer/config.ts', 'indexer/syncer.ts', 'indexer/projection/projector.ts', 'indexer/api/server.ts', 'package-lock.json', 'frontend/package-lock.json']) report.sourceHashes[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
report.sourceHashes['scripts/qa05_request_ui_cases.mjs'] = createHash('sha256').update(await readFile(join(root, 'scripts/qa05_request_ui_cases.mjs'))).digest('hex');
await record('tested-source.json', report);
let harness; let exit = 0;
try {
  harness = await createVariantHarness({ root, output, report, adminUrl: String(admin) });
  if (family === 'all') { report.snapshotPayload = await snapshotPayload(harness); report.actorTransition = await actorTransition(harness); }
  report.requestUi = await requestUi(harness);
  assert.equal(report.cases.length, (report.snapshotPayload?.count ?? 0) + (report.actorTransition?.count ?? 0) + report.requestUi.count);
  assert.ok(report.cases.every(row => row.result === 'PASS'));
  assert.ok(report.cases.every(row => row.checkpoints.length > 0 && row.checkpoints.every(s => s.browser.status === 'PASS')));
  report.status = 'PASS_REACHABLE';
} catch (error) { exit = 1; report.status = 'FAIL'; report.error = { name: error.name, message: error.message, stack: error.stack }; console.error(error); }
finally {
  report.preconditions = report.actorTransition?.preconditions ?? [];
  report.counts = {
    reachableCases: dispositionCounts(report.cases, []),
    preconditions: dispositionCounts([], report.preconditions),
    total: dispositionCounts(report.cases, report.preconditions),
  };
  if (harness) await harness.close();
  await record('report.json', report);
}
console.log(`QA05_VARIANTS_DONE ${report.status} ${report.cases.length} cases exit${exit}`); process.exitCode = exit;
