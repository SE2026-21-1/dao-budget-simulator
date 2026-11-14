# VT-063 reviewer approval harness — BT3 23001849

**Independent characterization harness**, not an implementation of DAO smart contracts, wallet authentication, or an HTTP API. The baseline `main` contains requirements but no runnable application/contracts. No code is merged.

Baseline: `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4`.
Test-first commit: `54be81fe2f1fc42f72bc91f8adc1b3e2857f9524` (tests only; import fails before patch).

## Run (Python 3.10+; no packages)

From repository root:

```sh
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python vt063/load_150.py
PYTHONPATH=vt063 python vt063/mutation_check.py
PYTHONPATH=vt063 python -m coverage run --branch --source=approval_harness -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python -m coverage report -m
```

Expected 17 passing tests. The load script submits 150 in-process threaded tasks to the same request. This is **not** 150 HTTP users and its p95 cannot establish production performance.

## Mutation (temporary local copy only)

Run `PYTHONPATH=vt063 python vt063/mutation_check.py`. This mutates only the approval guard inside a temporary directory and expects at least the coordinated concurrency test to fail. A return code of 0 from the script signifies mutation detected; code 1 means it survived. Tracked source is not modified.

## Scope / assumptions

Read is public; reviewer can read and approve, but cannot edit source request. Only `owner` may edit. Only one successful approval per request, regardless of idempotency key. Authorization here is a trusted role argument and NOT a security boundary. In-memory lock only works inside one Python process. Production design needs server-authenticated roles and an atomic database uniqueness/transaction guard (and on-chain design review before influencing Treasury). Proposal authorization, token transfers, and timelock are out of scope.

## Evidence

Report: `BT3_23001849_VT-063.pdf` (submitted separately).
The report appendix contains literal local execution excerpts and AI review conclusions; results were run in a local sandbox, not GitHub CI.

## Verified local evidence (2026-11-14)

- Behavioral RED: test-only commit `1d0a2b0` produced `AssertionError: PermissionError not raised` in `test_approved_request_cannot_be_edited_by_owner` (16 tests, 1 fail).
- Behavioral GREEN: after fix `b25e47c`, 16/16 pass; after adding coordinated test, 17/17 pass.
- Mutation: an initial reproduction incorrectly imported the original module, so it appeared to survive. Corrected script runs with cwd set to the mutant temporary directory: 3 failing concurrency tests in one run, and 5/5 repeated mutant runs killed.
- Coverage: `approval_harness.py`, 40 statements, 0 missed, 12 branches, 0 partially covered (100% within the harness only). No API/DB/EVM coverage.
- In-process 150-task burst (Python 3.13.5): p95 7.436 ms, 1 successful first approval, not 150 HTTP clients. Timings vary between runs.
- Evidence details are in `vt063/evidence/` and the separately submitted PDF. Tests were run locally, not in GitHub CI.

Approved requests cannot be edited even by `owner`. This policy is an assumption for characterization, to be confirmed by the team before any production integration.
