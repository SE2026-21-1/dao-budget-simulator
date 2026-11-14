# BT3 VT-063 — reviewer approval characterization harness

**Individual assignment** 23001849 / SE2026-T16 / BC-03. Baseline `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` contains only docs, no app or smart contracts. Therefore this is an **isolated in-memory Python harness**, not production DAO functionality. PR remains Draft and unmerged.

## Run (Python 3.11+)

From repository root:

```sh
PYTHONPATH=vt063 python -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python vt063/mutation_check.py
PYTHONPATH=vt063 python vt063/load_150.py
```

19 tests should pass; the mutation script should return code 0 **only if the specific forced-interleaving test fails on the mutant**. It uses a temporary source copy; no mutation is committed. Coverage requires optional `coverage` (`pip install coverage==7.10.7`):

```sh
PYTHONPATH=vt063 python -m coverage run --branch --source=approval_harness -m unittest discover -s vt063/tests -v
PYTHONPATH=vt063 python -m coverage report -m
```

A GitHub Actions workflow is defined in `.github/workflows/vt063-tests.yml` for Python 3.11/3.13. Its presence **does not imply a successful CI run**.

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
- Local final: 19/19 tests pass; temporary mutation detected by coordinated T17, 5/5 runs; line/branch harness coverage 100% (41 statements, 14 branches).
- New synchronized Python 150-thread test: five p95 values 0.0012–0.0022 ms; this excludes startup queuing and external systems, **not** a 150-user HTTP SLA.
- Full decision table, 19 test cases, priority and traceability: `vt063/TEST_PLAN.md`.
- Historical runs vs final results: `vt063/evidence/README.md` and `vt063/evidence/FINAL_VERIFIED_2026-11-14.md`. Execution evidence is **local**, not CI.
- PDF to submit separately: `BT3_23001849_VT-063.pdf`; do not submit screenshots instead of source.

Peer review is necessary before any merge.
