# VT-063 execution evidence — local sandbox, 2026-11-14

Commands from `vt063/` (Python 3.13.5, no third-party packages):

```sh
PYTHONPATH=. python -m unittest discover -s tests -v
python load_150.py
python mutation_check.py
```

**Test-first RED stage**, commit `54be81fe2f1fc42f72bc91f8adc1b3e2857f9524`:
```text
ERROR: test_review_approval (unittest.loader._FailedTest.test_review_approval)
ModuleNotFoundError: No module named 'approval_harness'
Ran 1 test in 0.000s
FAILED (errors=1)
```
This demonstrates a missing implementation/import, *not* a behavioral assertion red. This is an acknowledged limitation.

**GREEN after patch**, commit `36491441be764badda2e0bd35d8d12d005fb974e`:
```text
Ran 12 tests in 0.021s
OK
```

**Deliberate mutation (temporary local edit replacing Lock with nullcontext)**:
```text
FAIL: test_150_concurrent_one_approval
AssertionError: 13 != 1
FAIL: test_concurrent_same_request_one_approval
Ran 12 tests in 0.021s
FAILED (failures=2)
```
On restoring the original guard:
```text
Ran 12 tests in 0.030s
OK
```
The new `mutation_check.py` reproduces the test without modifying the tracked source. Because thread scheduling is nondeterministic, a particular re-run may occasionally allow the mutant to survive; repeat runs and a deterministic scheduler would be stronger.

**Local benchmark once (not production load)**:
```json
{"mode":"in-process thread burst","tasks":150,"max_workers":150,
 "p95_ms":1.898,"p95_target_ms":4000,
 "successful_first_approvals":1,"approval_count":1,"python":"3.13.5"}
```

No GitHub Actions or HTTP/DB/EVM integrations have been run. Benchmark p95 does not support a production SLA claim. The PDF report is submitted separately.
