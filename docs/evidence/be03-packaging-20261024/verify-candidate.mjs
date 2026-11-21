import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const live = JSON.parse(await readFile('docs/evidence/be03-integration-20261024/integration.json', 'utf8'));
const current = await readFile('indexer/abi-registry.ts', 'utf8');
const newComment = '// Fresh BE03 local raw/checkpoint/WithParams acceptance is recorded in\n// docs/evidence/be03-integration-20261024. The awaiting-sc06 compatibility label\n// tracks pending SC06/TV1/TV4 handoff approval, not the result of that local run.';
const oldComment = '// Dev now contains handed-over compiler ABIs and saved TV4 local receipts.\n// Tests cross-check Governor fragments; the integration label below still means\n// that current-instance end-to-end acceptance has not been established here.';
assert.ok(current.includes(newComment));
const accepted = current.replace(newComment, oldComment);
assert.equal(sha(accepted), live.sourceHashes['indexer/abi-registry.ts']);
const printer = ts.createPrinter({ removeComments: true });
const executable = text => printer.printFile(ts.createSourceFile('registry.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
assert.equal(executable(current), executable(accepted));
const mismatches = [];
for (const [path, expected] of Object.entries(live.sourceHashes)) {
  if (path !== 'indexer/abi-registry.ts' && sha(await readFile(path)) !== expected) mismatches.push(path);
}
assert.deepEqual(mismatches, []);
const prior = JSON.parse(await readFile('docs/evidence/be03-review-20261024/verification.json', 'utf8'));
const finalSource = JSON.parse(await readFile('docs/evidence/be03-integration-20261024/final-source-verification.json', 'utf8'));
const testedSourceHashes = {};
for (const path of ['tests/indexer/decoder.test.ts', 'tests/indexer/syncer.test.ts', 'tests/indexer/crash-worker.ts',
  'tests/indexer/checkpoint-storage.test.ts', 'package.json', 'package-lock.json', 'scripts/check_be03_database.ps1', 'indexer/config/example.json']) {
  const expected = finalSource.sourceChangesThisAcceptance[path]?.afterSha256 ?? prior.sourceHashes[path];
  const actual = sha(await readFile(path)); assert.equal(actual, expected, path); testedSourceHashes[path] = actual;
}
const result = { status: 'PASS', classification: 'Candidate binding to the previously executed real integration, not a new chain run',
  acceptedRegistrySha256: sha(accepted), candidateRegistrySha256: sha(current), registryChange: 'Comment only: distinguish local acceptance from pending handoff approval',
  registryExecutableAstSha256: sha(executable(current)), executableAstIdentical: true, testedSourceHashes, otherAcceptedRuntimeSourceMismatches: mismatches,
  reusedIntegration: 'docs/evidence/be03-integration-20261024/verification.json',
  integrationNotRerunReason: 'Only documentation and a registry comment changed; runtime statements, ABI fragments, CLI exits, storage, deployment helper and tests are unchanged.' };
await writeFile('docs/evidence/be03-packaging-20261024/candidate-binding.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
