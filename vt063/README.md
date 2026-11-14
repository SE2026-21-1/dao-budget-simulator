# BT3 VT-063 — reviewer approval characterization harness

**Individual assignment** 23001849 / SE2026-T16 / BC-03. Baseline `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` contains only docs, no app or smart contracts. Therefore this is an **isolated in-memory Python harness**, not production DAO functionality. PR remains Draft and unmerged.

## Run (Python 3.11+)

From repository root:

```sh
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python vt063/mutation_check.py
PYTHONPATH=vt063 python vt063/load_150.py
```

27 tests should pass (19 in-memory unit + 8 SQLite integration); the mutation script should return code 0 **only if the specific forced-interleaving test fails on the mutant**. It uses a temporary source copy; no mutation is committed. Coverage requires optional `coverage` (`pip install coverage==7.10.7`):

```sh
PYTHONPATH=vt063 python -m coverage run --branch --source=approval_harness -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python -m coverage report -m
```

The same commands are checked in GitHub Actions with Python 3.11 and 3.13. A workflow is defined in `.github/workflows/vt063-tests.yml` for Python 3.11/3.13. Its presence **does not imply a successful CI run**.

## Functional semantics and limitations

- Reviewer can read and approve, never edit source. Guest read is permitted under an **unconfirmed assumption**. Owner can edit before but not after approval, also an **unconfirmed business rule**.
- Approve with a nonempty idempotency key K: first call returns `approved`; retry with same K returns original `approved` without another transition; other K returns `already-approved`. Both keep total approved transitions for request at most one. This is a characterization choice, not complete HTTP/idempotency-key storage semantics.
- Validation precedence: role → key → request existence → approval state.
- Lock serializes every request in the one Python process (not throughput-optimal). A **test-only hook** synchronizes threads between checking and writing so the missing-lock mutation is reproducibly detected. No artificial sleep remains in production logic.
- Role is an untrusted string in a real service: this harness has **no authentication or security boundary**. No database uniqueness, cross-process atomicity, transactional audit event, wallet, EVM, or on-chain Treasury permission checks exist here.

## Evidence and traceability

- Test-only initial collection RED `54be81f` (import error; not a behavioral RED).
- Behavioral RED `1d0a2b0` (edit-after-approve) → patch `b25e47c`.
- Behavioral RED `04f28b2` (same-key retry semantics) → patch `d4a258a`.
- Local final: 27/27 tests pass (19 in-memory + 6 SQLite); temporary mutation detected by coordinated T17, 5/5 runs; line/branch harness coverage 100% (41 statements, 14 branches).
- New synchronized Python 150-thread test: five p95 values 0.0012–0.0022 ms; this excludes startup queuing and external systems, **not** a 150-user HTTP SLA.
- Full decision table, 19 test cases, priority and traceability: `vt063/TEST_PLAN.md`.
- Historical runs vs final results: `vt063/evidence/README.md` and `vt063/evidence/FINAL_VERIFIED_2026-11-14.md`. Execution evidence is **local**, not CI.
- PDF to submit separately: `BT3_23001849_VT-063.pdf`; do not submit screenshots instead of source.

Peer review is necessary before any merge.

## SQLite RED → GREEN integration slice (added after first harness)

Unlike the earlier in-memory Lock, the `sqlite_approval.py` adapter uses SQLite transactions with `BEGIN IMMEDIATE` and a persistent unique `request_id`. Approval and audit record are committed together; a deliberately injected failure before audit insert rolls back both. There is a real multi-**process** test using a shared temporary database and `spawn` (not a fake shared object).

Test-first evidence:
- RED scaffold commit `c0e2d22`; tests-only commit `bfb6d02`: six SQLite behavioral assertions failed.
- GREEN transaction patch `77c751d`, process-spawn portability fix `e79cfe8`: entire test suite 27/27 pass.
- Deliberate bypass of SQLite idempotency check: `sqlite_mutation_check.py` operates on a temporary copy and kills the mutant on the exact same-key retry test.
- SQLite-only coverage: 38 statements, 12 branches, 100% (no claim about server auth or DAO).
- Five local synchronized bursts with 150 SQLite connections each, p95 values 47.324–113.538 ms, median run p95 66.316 ms; **no HTTP or 150 users**.

Run from repository root:

```sh
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python vt063/sqlite_mutation_check.py
PYTHONPATH=vt063 python vt063/sqlite_load_150.py
PYTHONPATH=vt063 python -m coverage run --branch --source=sqlite_approval -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python -m coverage report -m
```

Full traceability T01–T27 is in `TEST_PLAN.md`; SQLite local evidence and CI link are in `evidence/SQLITE_VERIFIED_2026-11-14.md`. CI run that passed on the new integration workflow: https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/43610380757. Neither local performance nor CI establishes an HTTP, on-chain or production guarantee.


## Post-review verification: transaction lock and actual SQLite audit failure

Two additional tests in `tests/test_sqlite_approval.py`:

- **T26** uses a SQLite `BEFORE INSERT` trigger with `RAISE(ABORT, ...)` to force a *real database error* during audit insertion. It checks both tables are empty after rollback and a retry succeeds after removing the trigger.
- **T27** uses an optional test-only `before_insert` synchronization hook to coordinate two connections between checking approval state and inserting. The normal `BEGIN IMMEDIATE` code returns `approved` and `already-approved`; when mutated to deferred `BEGIN`, the named T27 test encounters `sqlite3.OperationalError: database is locked`. The mutant is created in a temporary copy and 3/3 local repetitions killed it.

```sh
PYTHONPATH=vt063 python vt063/sqlite_transaction_mutation_check.py
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
```

The updated 150-task SQLite benchmark reports, per run, p95/p99/max, throughput, busy_timeout 15000 ms, **1 approved, 149 already-approved, 0 errors**, and 1 approval + audit row. Five local p95 samples (ms): **347.719, 58.006, 111.734, 66.694, 88.120**. Median of run p95 is 88.120 ms. Do not infer 150 HTTP-user SLA, and do not mix these values with older code versions.

Documentation and actual local outputs: `evidence/REVIEW_FIX_VERIFIED_2026-11-14.md`. **AI disclosure:** local testing/document generation was executed by ChatGPT-operated Linux tools; no claim of direct student workstation execution. GitHub Actions is independently repeatable. Earlier `54be81f` is a test-import RED only; initial implementation `3649144` predates the behavioral REDs, and `cbeaf23` was the first load script. Do not rewrite commit history.

All code here is a standalone Python/SQLite harness, **not an implemented role in EVM DAO governance**. Do not merge without team review.
