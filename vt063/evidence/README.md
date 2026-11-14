# VT-063 execution archive — historical runs vs current runs

This document preserves the **initial historical experiment** (2026-11-14), not current acceptance results. For the verified final revision, see `FINAL_VERIFIED_2026-11-14.md`. Data changes between revisions because tests, mutation script and benchmark methodology changed. Never combine old p95 with the new code version.

| Evidence version | Suite | Mutation | p95 | Interpretation |
|---|---:|---|---|---|
| Initial experiment, older code `3649144` | 12/12 pass | 2 failures in a manual mutation | 1.898 ms | Non-synchronized Python threads, artificial 2 ms sleep inside approval |
| Intermediate revision, `2122da0`–`3a0e569` | 17/17 pass | 3 failures, 5/5 repeats after fixing import cwd | 7.436 ms | One local thread-burst run with artificial sleep |
| **Final corrected revision** | **19/19 pass** | **specific coordinated concurrency test fails on mutant, 5/5** | **See final file (five synchronized runs)** | Same-key result replay; no artificial sleep; validation tests added |

### Earlier RED/GREEN history

- First test-only commit `54be81fe`: `ModuleNotFoundError`; this is only collection failure, **not** behavioral RED.
- Behavioral RED `1d0a2b0`: owner could edit already-approved request; one failing assertion. Patch `b25e47c` corrected it.
- Same-key idempotency behavioral RED `04f28b2`: retry unexpectedly returned `already-approved` instead of original `approved`. Patch `d4a258a` corrected replay semantics.

### Audit disclosure

A prior mutation script accidentally loaded the original module from the repository working directory instead of the mutant. It was fixed and the test was repeated. The final mutation script additionally verifies the **specific failing test method**, not merely the presence of `FAIL:`.

All runs were in a local Python process, not GitHub CI, API, DB or EVM. No production performance assertion follows from this archive.
