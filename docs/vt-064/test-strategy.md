# VT-064 — Risk-based test strategy (designed before implementation)

Unit: seeded generative batches (mixed valid/invalid) check exact persisted-set equality, retained values and indexed error results; malformed IDs/amounts/addresses and duplicate IDs. Integration: real temporary filesystem creates, atomic no-overwrite and simulated persistence failure (directory missing/not writable), then repeat/inspect files. CLI/E2E for this slice: execute real Node process on JSON file, assert exit code/report and disk; unrelated regression: existing BE07 and frontend behavior tests. Full wallet/chain E2E and API POST tests are **not needed for this offline draft slice**: no transaction, migration, API route or UI is added. They become necessary before converting drafts to proposals. No private keys, network or persistent serving database in tests.

| ID | Risk / criterion | Level | Precondition/input | Expected result | P |
|---|---|---|---|---|---|
| T01 | AC1, AC2 valid around bad | integration | [valid A, malformed amount, valid B] in temp dir | A and B present unchanged; index 1 rejected | P0 |
| T02 | AC1 syntax | unit | invalid ID `../escape`, wrong address, zero/noncanonical/overflow amount | indexed validation rejects; no outside file | P0 |
| T03 | AC2 generative isolation | property/integration | seeded generator, 40 batches of mixed unique IDs, varied positions and large positive amounts | persisted ID/data set equals exactly valid generated rows; failures do not erase neighbors | P0 |
| T04 | AC2 all invalid | integration | all-invalid and empty arrays | zero imports, no success claim of persisted rows | P1 |
| T05 | AC3 duplicate | integration | existing ID, then duplicate with different amount plus new ID | existing bytes unchanged; duplicate rejected; new ID persisted | P0 |
| T06 | AC3 concurrency | integration | two concurrent tasks same ID | one persisted, one conflict; no overwrite/partial file | P0 |
| T07 | AC4 write failure / mutation | integration | destination path a regular file (mkdir fails) or injected failing store | nonzero/failure, no success, zero falsely counted | P0 |
| T08 | AC4 mid-batch failure | integration | first write succeeds, second store rejects | first remains, later not claimed; failure identified | P0 |
| T09 | AC1 input format | CLI/E2E | malformed JSON or non-array, >1 MiB / >1000 | nonzero; no drafts written | P1 |
| T10 | AC1/AC4 CLI result | CLI/E2E | temp JSON mixed batch | exit 0 with per-index rejections, imported IDs match files; failure exits nonzero | P0 |
| T11 | AC5 regression | regression | pre-existing BE07 unit suite; prior API GET contract | suite unchanged/pass; importer never calls API/RPC | P1 |
| T12 | NFR1 load | executable benchmark | 80 independent import tasks, distinct IDs/dirs, after warmup | report every completion, error count and wall-time p95 vs 2500 ms | P1 |

Generator: fixed seed xorshift32, no external faker; choose batch sizes 1–32, each row valid with approximately 2/3 probability; invalid variants distributed over ID/path, zero/noncanonical amount, malformed address, empty description. Valid amounts sampled near 1, 10^18 and uint256 maximum; unique ID includes seed/batch/position. Report seed and counterexample; deterministic replay and fresh temp directories prevent shared-state flakiness. Fail injection is at persistence boundary (not a mock echo): assert actual committed files and rejected write result. Time-based test uses monotonic clock, only performance report uses threshold, no sleep for correctness. Concurrency test uses unique temp dir and same-ID race; assert one winner independent of scheduling order.

## Execution deviations after review

The pre-code matrix is preserved above. Actual T01 also inserts `null` before B (two rejects, indexes 1/2). T09 checks malformed JSON and >1 MiB through CLI, >1000 through `importDrafts`, and `/dev/zero` through CLI only on Linux; it does not separately assert non-array JSON. T12 runs 80 tasks with distinct IDs in one **shared** disposable directory, not distinct directories. Generator length is 1–24, with ~2/5 valid rows in each generated batch; empty description is tested in T02, not generated. T11 ran the existing BE07 unit suite (15/15); no API suite was run. Reviewer feedback added accepted input indexes, preservation of earlier rejections, hard-bounded stream input, and a stored-winner race oracle. Unrun table variants remain proposed, not PASS.
