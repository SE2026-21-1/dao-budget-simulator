# VT-063 reviewer approval harness — BT3 23001849

**Independent characterization harness**, not an implementation of DAO smart contracts, wallet authentication, or an HTTP API. The baseline `main` contains requirements but no runnable application/contracts. No code is merged.

Baseline: `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4`.
Test-first commit: `54be81fe2f1fc42f72bc91f8adc1b3e2857f9524` (tests only; import fails before patch).

## Run (Python 3.10+; no packages)

From repository root:

```sh
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python vt063/load_150.py
```

Expected 12 passing tests. The load script submits 150 in-process threaded tasks to the same request. This is **not** 150 HTTP users and its p95 cannot establish production performance.

## Mutation (temporary local copy only)

In `vt063/approval_harness.py`, temporarily replace `with self._lock:` with `with __import__("contextlib").nullcontext():`, rerun the test command, confirm simultaneous approval tests fail, then restore the lock. Do not commit the mutation.

## Scope / assumptions

Read is public; reviewer can read and approve, but cannot edit source request. Only `owner` may edit. Only one successful approval per request, regardless of idempotency key. Authorization here is a trusted role argument and NOT a security boundary. In-memory lock only works inside one Python process. Production design needs server-authenticated roles and an atomic database uniqueness/transaction guard (and on-chain design review before influencing Treasury). Proposal authorization, token transfers, and timelock are out of scope.

## Evidence

Report: `BT3_23001849_VT-063.pdf` (submitted separately).
The report appendix contains literal local execution excerpts and AI review conclusions; results were run in a local sandbox, not GitHub CI.
