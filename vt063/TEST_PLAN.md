# VT-063 individual test plan, evidence and traceability

Scope: executable in-memory characterization harness because the actual baseline only has documentation and no executable contract/API. Change request: reviewer can read and approve without changing source request. **Never give reviewer Treasury SPENDER_ROLE**. This harness does not implement the real application.

## Acceptance criteria and invariants

- AC1 Read access to request without mutation (reviewer and guest).
- AC2 Reviewer can approve existing request and cannot edit original.
- AC3 Other roles cannot approve; invalid request/key has no side effect.
- AC4 At most one successful approval transition per request, including retries with same/different keys and simultaneous calls.
- AC5 Owner may edit before approval, but cannot edit an already approved request.
- Invariant: every request has no more than one approval transition; the source request remains immutable after approval. Approval is **not** Treasury disbursement. BR03 and INV01 remain separate on-chain obligations.

Assumptions: string roles are supplied by trusted caller (NOT authenticated); read is public; an owner can edit until approved; rejected approve returns exception and no write. Atomicity is guaranteed only by one-process Python Lock.

## Decision table (– = don't care)

| Rule | reviewer | exists | key valid | approved | simultaneous | expected |
|---|---|---|---|---|---|---|
| D1 | no | – | – | – | – | PermissionError |
| D2 | yes | no | yes | – | – | KeyError; no write |
| D3 | yes | yes | no | – | – | ValueError; no write |
| D4 | yes | yes | yes | no | no | approved |
| D5a | yes | yes | same | yes | no | approved (replay original result) |
| D5b | yes | yes | different | yes | no | already-approved (new request rejected) |
| D6 | yes | yes | yes | no | yes | one approved; rest already-approved |
| D7 | yes | yes | same/different | yes | yes | same-key replay / different-key duplicate response |

Input classes: reviewer/owner/guest, existing r1=(100,alice) and absent ID, empty/nonempty keys, approved/unapproved, distinct r2=(200,bob). T17 uses a test-only injected synchronization hook to force the check/write gap when the approval lock is removed. Validation order: role, key, request existence, then approved state.

## Risk traceability

All unit cases are in `vt063/tests/test_review_approval.py`, with test-first commit `54be81fe`, behavioral RED `1d0a2b0`, fix `b25e47c`, interleaving `2122da0`. Priority P0 = integrity/authorization, P1 = boundary, P2 = read.

| ID | requirement/risk | input / precondition | expected | priority | test method |
|---|---|---|---|---|---|
| T01 | AC1 | reviewer read r1 | amount 100 | P1 | test_reviewer_can_read |
| T02 | AC1 | guest read r1 | amount 100 | P2 | test_anonymous_can_read |
| T03 | AC2, negative | reviewer edit r1 | denied; 100 unchanged | P0 | test_reviewer_cannot_modify_original |
| T04 | AC3, negative | owner approve r1 | denied | P0 | test_owner_cannot_approve |
| T05 | AC3, negative | guest approve r1 | denied | P0 | test_guest_cannot_approve |
| T06 | AC2 | reviewer approves r1 | approved; source unchanged | P0 | test_approval_keeps_original_unchanged |
| T07 | AC4 | same idempotency key retry | same original approved reply, count 1 | P0 | test_repeat_same_key_is_idempotent |
| T08 | AC4 | new key after approval | duplicate, count 1 | P0 | test_different_key_same_request_does_not_duplicate |
| T09 | AC3, failure path | missing request | KeyError; no write | P0 | test_missing_request_does_not_write |
| T10 | AC3, negative | empty key | ValueError; no write | P1 | test_empty_key_fails_without_write |
| T11 | AC4, race | 2 concurrent approvals | one success | P0 | test_concurrent_same_request_one_approval |
| T12 | AC4, contention | 150 worker tasks | one success; original unchanged | P0 | test_150_concurrent_one_approval |
| T13 | AC5, behavioral RED | owner edits after approve | PermissionError; 100 unchanged | P0 | test_approved_request_cannot_be_edited_by_owner |
| T14 | AC5 | owner edit before approve | permitted, new 120 | P1 | test_owner_can_edit_before_approval |
| T15 | AC4, independence | approve r1 and r2 with same key | two distinct requests succeed | P1 | test_distinct_requests_approve_independently |
| T16 | AC2, negative | guest edits r1 | denied | P1 | test_guest_cannot_edit |
| T17 | AC4, deterministic race | forced interleaving of two requests to r1 | one success; mutant fails | P0 | test_forced_interleaving_exposes_missing_guard |

## Test levels

- Unit/characterization: executed in Python; tests above.
- Integration/API: **not executable yet** (no API/DB); planned authenticated role mapping, atomic DB transaction/unique constraint, multi-process duplicate POST and rollback/error paths.
- E2E: **not executable yet** (no app, wallet, contract); planned reviewer approval + Governor/timelock/treasury authorization sequence.
- Not needed for THIS harness: UI screenshots, contract gas measurements, browser snapshot tests. This is not an assertion that the real application can omit them.

## Evidence and risk assessment

- Behavioral red (16 tests, one failure): `1d0a2b0`.
- Patch green: `b25e47c`; full 17 tests pass after `2122da0`.
- Mutation script `mutation_check.py`: tested after `f09984b` fix to isolate imported mutant; 3 tests killed it; 5/5 repeated runs. Mutation is never committed.
- Coverage: 40/40 statement lines, 12/12 branches **only in approval_harness.py**; coverage score alone does not prove persistence or external safety.
- Flaky risks: thread scheduling (forced barrier + 5 mutation repeats); test order and state (new service per unit test; 20 fresh test suite runs passed); no clock-based assertions or network in harness.
- Local load: ThreadPoolExecutor(150) on same request; sample p95=7.436 ms vs target 4000 ms; 1 first approval. Not 150 HTTP users, not an SLA or EVM result.
- AI review: valid claim — lock makes approval check/write atomic in one process. Unsupported claim — that Lock makes distributed / DB / blockchain execution safe. Other risky AI suggestions: raw role string is spoofable, and a sleep-only race test may miss the mutation.
- Logs and commands: `vt063/evidence/VERIFIED_2026-11-14.md`; separate PDF BT3_23001849_VT-063.pdf contains the formal report and AI Usage Log.


## Post-review corrections (2026-11-14)

- **T18** (`test_validation_precedence_role_first`, P1): guest, missing request and empty key → `PermissionError`; no write. **T19** (`test_validation_precedence_key_before_lookup`, P1): reviewer, empty key and missing request → `ValueError`; no write. Decision table rules D1/D3 have explicit precedence over lookup.
- **Idempotency semantics**: first approval with key K returns `approved`; retry of the same request with K replays `approved` without a second transition; different K returns `already-approved`. This is a local characterization choice, not a specified HTTP status or full distributed exactly-once guarantee. Behavioral RED `04f28b2`, fix `d4a258a`.
- **Artificial delay removed** from business logic. A test-only hook permits deterministic mutation detection; the verifier now parses the specific failed test name. Mutation currently kills one specific coordinated test, 5/5 runs (historically three failures in older code).
- **New five-run synchronized 150-thread benchmark**: each p95 is 0.0012–0.0022 ms, median of run p95 values 0.0013 ms; excludes network, DB, HTTP and task scheduling overhead. No 150-user claim.
- **Coverage**: 41 statements, 14 branches, 100% only for the in-memory service; full-suite 19/19 locally.
- **CI workflow added** at `.github/workflows/vt063-tests.yml`; addition does not imply CI has already passed. Use the GitHub checks page to establish status.
- **Risk not proven**: cross-process DB uniqueness, authenticated reviewer identity, atomic approval+audit record, original request policies and real on-chain invariants.
- **Global lock** serializes independent requests; not presented as throughput-optimal. Refactor only after integrating a production datastore that supports atomic uniqueness.


## Second vertical slice — SQLite integration (T20–T25)

The original 19 in-memory tests remain; **six additional integration tests** use real temporary SQLite files. This is independent of the API and does not claim end-to-end DAO functionality. The transactional invariant is: for a requestId, `count(approvals) <= 1`, and every successful first approval has exactly one matching committed `approval_audit` row. Failure before audit insertion must roll back both inserts. `BEGIN IMMEDIATE` provides a single SQLite write transaction; `PRIMARY KEY(request_id)` adds a persistent uniqueness constraint.

| ID | Risk/criterion | Level | Precondition / input | Expected result | Priority | Executable test method |
|---|---|---|---|---|---|---|
| T20 | AC2, audit atomicity | SQLite integration | First approval of existing r1 with key k1 | 1 approval, 1 audit | P0 | test_insert_approval_and_audit_atomically |
| T21 | AC4, idempotency | SQLite integration | Retry k1 then distinct k2 | original approved replay, then already-approved; 1 row each | P0 | test_retry_replays_original_response_and_preserves_audit |
| T22 | AC4, failure-path | SQLite integration | fail_audit=True between two inserts | RuntimeError; both tables empty; successful subsequent retry | P0 | test_failure_during_audit_rolls_back_approval |
| T23 | AC3, negatives | SQLite integration | guest role, unknown request, empty key | PermissionError, KeyError, ValueError; no writes | P0 | test_unknown_request_and_wrong_role_are_negative |
| T24 | AC4, race across processes | SQLite integration | Two spawned processes with distinct keys approve same r1 | [approved, already-approved]; count 1+1 | P0 | test_two_independent_processes_serialize_same_request |
| T25 | AC4, contention | SQLite integration | 30 threads, distinct connections and keys to same r1 | One approved, approval/audit 1 each | P0 | test_30_simultaneous_db_connections_never_duplicate |

Test file: `vt063/tests/test_sqlite_approval.py`. Recorded RED: scaffold `c0e2d22` + tests-only commit `bfb6d02`, **6/6 behavioral tests fail**. GREEN: `77c751d`, portable `spawn` update `e79cfe8`, **25/25 whole suite pass** locally. SQLite idempotency-guard mutant in `sqlite_mutation_check.py` causes the exact retry test to error (`UNIQUE constraint failed`), while the tracked production adapter remains unchanged. CI run `43610380757` passed on Python 3.11 and 3.13. Run the latest GitHub Actions checks for subsequent documentation commits.

**150-task SQLite performance:** `sqlite_load_150.py` executes five 150-thread bursts, one new SQLite DB per burst; p95 values (ms) 113.538 / 72.898 / 59.291 / 47.324 / 66.316, median run p95 66.316. This is local database contention, not HTTP/real-user traffic; the 4,000-ms SLA is therefore *not* verified. Evidence: `vt063/evidence/SQLITE_VERIFIED_2026-11-14.md`.

**Risk residuals:** authenticated reviewer mapping, approval→on-chain governance coupling, durable audit events outside this table, multi-node SQLite limits, replica behavior, full HTTP/E2E testing, testnet and 150 independently generated user requests. The SQLite test strengthens evidence beyond the earlier one-process Lock but does not address those unproven risks.
