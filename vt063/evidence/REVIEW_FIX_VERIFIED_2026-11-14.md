# Additional independent review fixes — VT-063, 2026-11-14

All local commands below were executed by **ChatGPT-controlled tools inside an isolated Linux/Python environment**, not the student's personal Windows computer. This disclosure is part of the AI usage evidence. GitHub Actions is the reproducible independent check; local outputs are environment-specific.

## T26 — real SQLite failure *during INSERT* into audit

In test `test_real_sqlite_audit_insert_failure_rolls_back`, setup creates:

```sql
CREATE TRIGGER audit_denied BEFORE INSERT ON approval_audit
BEGIN SELECT RAISE(ABORT, 'audit-write-rejected'); END;
```

The approval's first INSERT is executed, and the audit INSERT triggers a **genuine SQLite `IntegrityError`**, not the pre-existing `fail_audit=True` Python-injected exception. The test verifies `count(approvals)=0` and `count(approval_audit)=0` after rollback; removes the trigger; retries successfully and gets one row in each table. The earlier T22 Python fault-injection test remains as a distinct failure-path.

## T27 — deletion of transaction concurrency guard

`sqlite_transaction_mutation_check.py` writes a **temporary copy** where `BEGIN IMMEDIATE` is replaced with deferred `BEGIN`. `test_begin_immediate_serializes_check_then_insert` uses an optional test-only `before_insert` callback; two connections can meet at the barrier only when the initial write reservation is removed.

Original module: full suite `Ran 27 tests ... OK`.

Mutant: `ERROR: test_begin_immediate_serializes_check_then_insert`, with `sqlite3.OperationalError: database is locked`; mutation runner identifies the exact failing test. **Three of three** local repetitions killed this transaction mutation. This is distinct from `sqlite_mutation_check.py`, which bypasses the idempotency lookup and is detected by UNIQUE constraint `IntegrityError`. `PRIMARY KEY` alone prevents duplicate rows but does not guarantee that both concurrent callers receive the correct application-level response.

Test hook coupling is a residual weakness: `before_insert=None` for ordinary callers, and the hook exists solely for deterministic interleaving in tests. It is not an authentication or production callback.

## Latest local suite, coverage and flaky checks

- Three complete independent local suite runs: 27/27 tests pass each.
- SQLite adapter: 38 statements / 12 branches, all covered under local tests. This is not API/EVM coverage.
- Tests T01–T27 and decision-table rule mapping are in `vt063/TEST_PLAN.md`.
- The first implementation commit of the old in-memory slice was `36491441` and its benchmark commit `cbeaf235`; its initial RED at `54be81f` was only import/collection failure. Later behavioral REDs were AC5, same-key retry, and the six SQLite integration RED tests. None of this has been rewritten as historical TDD proof.

## Latest 150 local SQLite connection burst results

Command: `PYTHONPATH=vt063 python vt063/sqlite_load_150.py`. Five independent trials; each one 150 Python threads and SQLite connections to the same request, with fresh local database, busy_timeout=15000 ms. The measured interval starts after the 151-way barrier, not including pre-barrier scheduling.

| Run | p95 ms | p99 ms | max ms | throughput tasks/s | approved | already-approved | errors | audit rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 347.719 | 648.306 | 649.983 | 227.38 | 1 | 149 | 0 | 1 |
| 2 | 58.006 | 71.571 | 82.037 | 1616.43 | 1 | 149 | 0 | 1 |
| 3 | 111.734 | 118.016 | 145.763 | 925.71 | 1 | 149 | 0 | 1 |
| 4 | 66.694 | 78.755 | 90.521 | 1398.48 | 1 | 149 | 0 | 1 |
| 5 | 88.120 | 114.824 | 140.815 | 953.63 | 1 | 149 | 0 | 1 |

Median of the five **per-run p95s** is **88.120 ms**; comparison against 4000 ms is valid only for local SQLite calls, not 150 real HTTP users. Large variation may reflect thread scheduling, SQLite contention, filesystem cache and absent controlled warmup. These measurements are **not directly comparable** with historical runs (older code/harness/methodology).

## Independent CI

GitHub Actions workflow `.github/workflows/vt063-tests.yml` includes unittest, both former mutation scripts, **new `sqlite_transaction_mutation_check.py`**, and the latest local SQLite benchmark, on Python 3.11 and 3.13. Use the PR Checks tab and match its head SHA to the branch when verifying. At the time of this report, run `43612273017` was confirmed successful on transaction-mutation workflow commit `b1dce0fe`; later documentation-only commits can cause additional runs.

No real reviewer authentication, authenticated HTTP API, distributed DB, smart contract, on-chain approval, or production user load has been tested.
