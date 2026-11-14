# SQLite vertical slice — independent reproducible evidence (2026-11-14)

This is a **local database integration experiment**, not production DAO code. The SQLite database lives in a temporary directory, and the API accepts a caller-supplied role string rather than verifying an authenticated user. **Do not infer on-chain safety or HTTP p95.**

## Genuine test-first sequence

Baseline: `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` (documentation-only main).

1. Incomplete SQLite scaffold commit `c0e2d22e51945fdf0a89082e79bdf74f53bf4cfe` defines SQLite schema but returns `approved` without writing.
2. Tests-only RED commit `bfb6d0244df43390283a5cd2cea6ceddd4156609`: six integration tests fail for real behavior (missing approval/audit, wrong-key retry, no rollback, absent request validation, duplicate successes across processes, and 30 concurrent connections). Command: `PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -p test_sqlite_approval.py -v`. Output: `Ran 6 tests ... FAILED (failures=6)`.
3. Small GREEN patch `77c751d9186dd8b637762a021112ce9d0879f80f`: `BEGIN IMMEDIATE`, request validation, same-key result replay, unique `approvals.request_id`, and audit insert within one SQLite transaction with rollback on exception. Test process spawn portability `e79cfe8652b42ba02edff8c94b743117705b34c8`.
4. Final `PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v`: `Ran 25 tests in 1.366s; OK` (19 unit/characterization + 6 SQLite integration). This result varies with machine.

## SQLite deliberate mutation: omit idempotency guard

```sh
PYTHONPATH=vt063 python vt063/sqlite_mutation_check.py
```

The script makes **only a temporary copy** of `sqlite_approval.py` and replaces `if old is not None:` with `if False and old is not None:`. Retrying the same key attempts a second insert and violates the database unique key.

Actual test excerpt:

```text
ERROR: test_retry_replays_original_response_and_preserves_audit
sqlite3.IntegrityError: UNIQUE constraint failed: approvals.request_id
Ran 6 tests in 0.921s
FAILED (errors=3)
SQLITE MUTATION KILLED by test_retry_replays_original_response_and_preserves_audit; original source unchanged
```

The mutation runner checks the **exact failing test name**, not just whether any test failed. The original file is never edited. The unique index is an additional backstop; the behavioral idempotency guard matters for correctly replaying the response.

## Rollback/failure-path and multi-process verification

- Two separate Python processes (`ProcessPoolExecutor` with `spawn`) attempt the same request with different keys; exactly one receives `approved`; the other receives `already-approved`.
- Thirty distinct SQLite connections contend for the same request; exactly one approval and one audit row remain.
- Inject failure between approval insertion and audit insertion: transaction rolls back both; retry is then permitted.
- Read-only API/E2E authentication are **not** implemented. This only validates the SQLite storage adapter's concurrent decision and audit persistence within a local file.

## Coverage

```sh
PYTHONPATH=vt063 python -m coverage run --branch --source=sqlite_approval -m unittest discover -s vt063/tests -q
PYTHONPATH=vt063 python -m coverage report -m
```

```text
sqlite_approval.py   Stmts 36   Miss 0   Branch 10   BrPart 0   Cover 100%
```

This coverage is only for `sqlite_approval.py` and is not evidence of production authorization or on-chain security. The earlier in-memory harness separately had 41 statements, 14 branches at 100%.

## 150-thread SQLite contention trial (5 fresh databases)

Command: `PYTHONPATH=vt063 python vt063/sqlite_load_150.py`. Each run uses 150 Python threads with a start barrier and distinct keys for the same request.

| Run | p95 (ms) | Throughput (tasks/s) | Approval rows | Audit rows |
|---|---:|---:|---:|---:|
| 1 | 113.538 | 961.30 | 1 | 1 |
| 2 | 72.898 | 1339.91 | 1 | 1 |
| 3 | 59.291 | 1449.10 | 1 | 1 |
| 4 | 47.324 | 1876.78 | 1 | 1 |
| 5 | 66.316 | 1425.96 | 1 | 1 |

Median of run p95 = **66.316 ms** vs numeric target 4000 ms; only local SQLite calls, including DB connection and transaction, without HTTP, network, authentication, testnet, transaction confirmation or 150 actual users. The arithmetic comparison does **not** establish an end-to-end SLA.

## External CI evidence

GitHub Actions run `https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/43610380757`: success for workflow containing both old and new tests/mutations and SQLite load on Python 3.11/3.13 at commit `d24ff3042c16a6d21c7e28c8d738c5281d092671`. The current PR head can change with documentation commits, so check latest run before attributing CI status to the final head.
