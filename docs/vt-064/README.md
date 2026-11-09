# VT-064 - individual bulk import of offline BUD drafts

Phan Thanh Dũng, 23001850, SE2026-T16. No merge before group review.
Feature baseline: `1bb182144d516c13d6bb32fc30d2778af71a8169`.
Submission branch: `personal/23001850-vt-064-submission`.
Production feature commits: `b61cec8`, `69ca712`; extra property/plan commit
`aca614da8c4842eadecd87434ddc98f9f41813ec`; runner patch
`969acb370f1a10ebd1f75728afa6d91b035a453d`.

## Run (from repository root)

Node 24 (repository pins 24.15.0; fresh verification used 24.22.1), npm:

```bash
npm ci
npm run test:vt064
npm run typecheck
npm run build
npm run test:be07
node --import tsx --experimental-test-coverage --test-coverage-include='indexer/import/*.ts' --test tests/indexer/import.test.ts
node --import tsx scripts/benchmark_vt064.mjs
npm run import:drafts -- /absolute/path/input.json /absolute/path/output-directory
```

No DB, RPC, wallet or secret is needed for this slice. The Node loader avoids
the tsx CLI's IPC server, which failed EPERM in the verification environment.
Input: JSON array of 1-1000 rows, <=1 MiB, for example:

```json
[{"id":"q1","recipient":"0x1111111111111111111111111111111111111111","amount":"1000000000000000000","description":"Draft request for 1 BUD"}]
```

A valid row persists to `<id>.json`. Duplicate IDs never overwrite. Invalid rows
are rejected independently; completion can have both imported and rejected rows.
An infrastructure failure stops the rest, exits 1, prints PERSISTENCE_FAILED to
stderr and lists prior committed indexes/IDs. Earlier files remain usable.
The destination is an operator-controlled directory on a filesystem supporting
hardlinks. This is offline staging, not an on-chain proposal or DB projection.
Do not copy drafts into canonical read-model tables.

## Evidence and replay

`verification/` contains new execution logs, three 80-task measurements, isolated
agent plan/review and the exact deliberate mutation patch. Older logs in this
directory are historical. The new report distinguishes replay from original
chronology. The original unresolvable mutant hash is not used as new proof.

Behavioral red replay (expects exit 1, accepted-index assertion failure):

```bash
git worktree add --detach ../vt064-red b61cec8
cp tests/indexer/import.test.ts ../vt064-red/tests/indexer/import.test.ts
npm ci --prefix ../vt064-red
(cd ../vt064-red && node --import tsx --test --test-name-pattern='mixed import retains' tests/indexer/import.test.ts)
```

Mutation replay in an isolated worktree (expects exit 1, Missing expected rejection):

```bash
git worktree add --detach ../vt064-mutant HEAD
(cd ../vt064-mutant && git apply docs/vt-064/verification/mutation.patch)
npm ci --prefix ../vt064-mutant
(cd ../vt064-mutant && node --import tsx --test --test-name-pattern='persistence failure cannot' tests/indexer/import.test.ts)
```

The submission source remains clean. Remove only these disposable worktrees
when finished. The temporary mutant local commit `12c53e2` is not needed to
reproduce the experiment; the committed patch is sufficient. It is not an
ancestor of the submission branch. Do not merge the mutant.

Property testing uses deterministic generators (40 mixed batches + 16 pairs of
orders) and an independent filesystem oracle, plus 15 canonical-suffix cases;
there is no automatic shrinking. Nine executable test functions implement the
14 logical cases in report.md. BE07 independently passes 15 cases. The 80-task
benchmark measures local process/filesystem queueing and read-back, not 80 HTTP
users or a production SLA.

Rebuild PDF: Python 3, reportlab 4.4.9, DejaVu fonts, then
`python3 docs/vt-064/build_pdf.py`. Main content must remain <=8 pages; appendices
are additional. Review the draft reflection and declaration before Classroom
submission. No Classroom upload or group approval is implied.
