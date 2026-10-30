// Independent review calculation. Run at repository root after the final runs:
// node docs/evidence/be08-20261027/verify.mjs FUNCTIONAL_DIR PERFORMANCE_DIR NEW_OUTPUT_JSON
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const [functionalDir, performanceDir, output] = process.argv.slice(2);
assert.ok(functionalDir && performanceDir && output);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const functional = await read(join(functionalDir, 'report.json'));
const performance = await read(join(performanceDir, 'report.json'));
const bench = await read(join(performanceDir, 'benchmark.json'));
assert.equal(functional.status, 'PASS');
assert.equal(performance.status, 'PASS');
assert.equal(bench.status, 'PASS');
assert.ok(Object.values(functional.suites).every(s => s.status === 'PASS'));
assert.equal(functional.provenance.sourceUnchangedThroughRun, true);
assert.equal(bench.baseCommit, functional.provenance.baseCommit);
for (const dir of [functionalDir, performanceDir]) {
  const report = await read(join(dir, 'report.json'));
  assert.equal(await digest(join(dir, 'source.patch')), report.provenance.patchSha256);
}
// The final functional run must bind all current inputs. Performance dependencies
// must still match the independently recorded benchmark hashes after metadata edits.
for (const [path, hash] of Object.entries(functional.provenance.sourceHashes))
  assert.equal(await digest(resolve(path)), hash, 'Final source differs: ' + path);
for (const [path, hash] of Object.entries(bench.sourceHashes))
  assert.equal(await digest(resolve(path)), hash, 'Measured source differs: ' + path);

const rank95 = xs => {
  assert.ok(xs.length); const sorted = xs.slice().sort((a, b) => a - b);
  const rank = Math.floor((95 * sorted.length + 99) / 100);
  return { count: sorted.length, rank, p95Ms: sorted[rank - 1], maxMs: sorted.at(-1) };
};
const samples = bench.load.rawSamples;
assert.equal(bench.load.concurrency, 10);
assert.equal(bench.load.workers.length, 10);
assert.ok(bench.load.elapsedIncludingDrainMs >= 60_000);
assert.equal(bench.load.errors.length, 0);
assert.ok(samples.every(s => s[6] === 200 && s[7] === true));
for (let client = 0; client < 10; client++) {
  const worker = bench.load.workers.find(w => w.worker === client);
  assert.ok(worker && worker.finishedOffsetMs >= 60_000 && worker.startOffsetMs < 1000);
  const rows = samples.filter(s => s[0] === client).sort((a, b) => a[1] - b[1]);
  assert.equal(rows.length, worker.requests);
  rows.forEach((row, i) => { assert.equal(row[1], i); assert.equal(row[2], bench.method.timedCycle[i % bench.method.timedCycle.length]); });
}
const calculated = { global: rank95(samples.map(s => s[5])) };
assert.equal(calculated.global.p95Ms, bench.load.global.p95Ms);
assert.ok(calculated.global.p95Ms < 1000);
for (const [endpoint, recorded] of Object.entries(bench.load.endpoints)) {
  const rows = samples.filter(s => s[2] === endpoint);
  calculated[endpoint] = { ...rank95(rows.map(s => s[5])), percentOfRequests: rows.length / samples.length * 100 };
  assert.equal(calculated[endpoint].p95Ms, recorded.p95Ms);
  assert.ok(calculated[endpoint].p95Ms < 1000);
}
const freshness = {};
for (const phase of ['idle', 'load']) {
  const events = bench.freshness.samples.filter(s => s.phase === phase);
  assert.equal(events.length, 10); assert.ok(events.every(e => e.status === 'PASS' && e.elapsedMs < 30_000));
  if (phase === 'load') assert.ok(events.every(e => e.activeClients === 10));
  for (const event of events) {
    assert.equal(event.api.transfer.transactionHash, event.transactionHash);
    assert.ok(BigInt(event.publication.h) >= BigInt(event.eventBlock));
    assert.equal(event.publication.h, event.api.context.asOfBlock);
    assert.equal(event.publication.hash, event.api.context.asOfBlockHash);
  }
  freshness[phase] = rank95(events.map(e => e.elapsedMs));
  assert.equal(freshness[phase].p95Ms, bench.freshness[phase].p95Ms);
}
freshness.normal = rank95(bench.freshness.samples.map(e => e.elapsedMs));
assert.equal(bench.freshness.normalWorkerErrors.length, 0);
assert.equal(bench.freshness.workerExit.code, 0);
const outage = bench.freshness.outage;
assert.equal(outage.status, 'PASS'); assert.ok(outage.offlineDurationMs > 30_000);
assert.equal(outage.staleHealth.data.indexer, 'lagging');
assert.equal(outage.staleSummary.context.sync.status, 'lagging');
assert.equal(outage.recoveredHealth.context.sync.status, 'synced');
assert.ok(outage.retryCycles.every(c => c.attempts > 0 && c.attempts <= 4));
for (const key of ['dataset','datasetBeforeMeasurement','datasetAfterMeasurement','datasetAfterOutage']) {
  assert.equal(bench[key].counts.proposals, '100'); assert.equal(bench[key].counts.votes, '1000');
  assert.equal(bench[key].proposalIds.length, 100); assert.equal(bench[key].votes.length, 1000);
}
assert.equal(bench.dataset.counts.transfers, '1');
assert.equal(bench.datasetAfterMeasurement.counts.transfers, '21');
assert.equal(bench.datasetAfterMeasurement.treasury.balance, String(10000n * 10n ** 18n + 20n));
const live = await read(join(functionalDir, 'live.json'));
assert.match(live.scope, /BE07 reorg rollback\/replay/);
assert.equal(live.be07.status, 'PASS'); assert.equal(live.be07.compare.result, 'equal');
assert.equal(live.be07.gateData.status, 503); assert.equal(live.be07.duringCursor.status, 409);
assert.equal(live.be07.oldCursor.status, 409); assert.equal(live.be07.deepHealth.body.data.recoveryStatus, 'rebuild_required');
const result = { status: 'PASS', baseCommit: bench.baseCommit, functionalDir, performanceDir,
  calculated, freshness, health: rank95(bench.health.rawSamples.map(s => s.latencyMs)),
  inputsMatchCurrentFiles: true, patchesMatchRecordedHashes: true, allDataRequestsValid: true,
  functionalPatchSha256: functional.provenance.patchSha256, performancePatchSha256: performance.provenance.patchSha256 };
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
