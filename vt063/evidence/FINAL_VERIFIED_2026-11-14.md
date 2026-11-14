# Final verification — VT-063, 2026-11-14

These are **local execution outputs**, not GitHub CI. All commands from repository root, Python 3.13.5 unless specified otherwise. Updated code: same idempotency key replays first response, different key returns `already-approved`; approval count remains at most 1.

## RED / GREEN evidence with commits

**Behavioral RED #1:** `1d0a2b0` test `test_approved_request_cannot_be_edited_by_owner` failed because PermissionError not raised. Fix `b25e47c` succeeded.

**Behavioral RED #2 (idempotency):** test-only `04f28b24b68eb8bd186c6271d024e42cbed917f6` changed retry expectation to original `approved` reply. Before patch, rerunning suite showed:

```text
FAIL: test_repeat_same_key_is_idempotent
AssertionError: 'already-approved' != 'approved'
Ran 17 tests in 0.241s
FAILED (failures=1)
```

After `d4a258ab51dace0f525078e6f24b86431bc5f280`, repeated key returns `approved`, distinct key returns `already-approved`, and production `time.sleep` is removed. Concurrency test uses a test-only injected synchronization hook.

**Final GREEN:** `PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v`

```text
Ran 19 tests in 0.162s
OK
```

Ten independent additional full test-suite launches also passed.

## Mutation: remove approval lock (not committed)

```sh
PYTHONPATH=vt063 python vt063/mutation_check.py
```

Corrected verifier loads mutant inside a temporary directory and matches the **exact** failed test method:

```text
FAIL: test_forced_interleaving_exposes_missing_guard
AssertionError: Element counts were not equal:
First has 2, Second has 1: 'approved'
First has 0, Second has 1: 'already-approved'
Ran 19 tests in 0.012s
FAILED (failures=1)
MUTATION KILLED, confirmed failed methods: ['test_forced_interleaving_exposes_missing_guard']; source unchanged
```

Five independent mutation runs: 5/5 killed, verifier exit=0 every time; mutant sub-test exit !=0. The earlier claim of 3 mutation failures applies to **historical older code only**.

## Coverage: harness only

```sh
PYTHONPATH=vt063 python -m coverage run --branch --source=approval_harness -m unittest discover -s vt063/tests -q
PYTHONPATH=vt063 python -m coverage report -m
```

```text
Name                  Stmts   Miss Branch BrPart  Cover   Missing
approval_harness.py      41      0     14      0   100%
TOTAL                    41      0     14      0   100%
```

Scope excludes HTTP, authentication, DB atomic commit, process boundaries, audit event persistence, wallet and blockchain.

## Load — synchronized in-process 150-task burst, five independent runs

```sh
PYTHONPATH=vt063 python vt063/load_150.py
```

| Run | p95 ms | Throughput tasks/s | first approved | duplicate transition |
|---|---:|---:|---:|---:|
| 1 | 0.0013 | 50791.98 | 1 | 0 |
| 2 | 0.0012 | 53003.16 | 1 | 0 |
| 3 | 0.0022 | 48728.91 | 1 | 0 |
| 4 | 0.0015 | 49324.11 | 1 | 0 |
| 5 | 0.0013 | 53731.01 | 1 | 0 |

Median of per-run p95 values: 0.0013 ms. The start gate synchronizes the *start of measurement* across 150 Python threads; the Python GIL and scheduler mean this is **not 150 truly parallel CPU operations**, not 150 independent HTTP users, and these tiny timings exclude network, auth, database, RPC, transaction submission, and most task scheduling overhead. Only compare the numeric sample to 4,000 ms as a **harness-only** observation; it is not evidence of production SLA compliance. Older p95=1.898 ms and 7.436 ms are historical and cannot be compared directly due to code/methodology changes.

## Unproven

No trustworthy auth principal, DB transaction+unique constraint, audit event atomic persistence, cross-process race, EVM contracts, actual 150 users, or real production latency. Peer review and CI must be checked on GitHub before claiming they passed.
