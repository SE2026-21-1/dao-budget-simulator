"""Mutate ONLY the approve concurrency guard in a temp directory; leave repository intact."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
original = (ROOT / 'approval_harness.py').read_text(encoding='utf-8')
needle = """        with self._lock:
            if request_id in self._approvals:
                return 'already-approved'"""
assert original.count(needle) == 1, 'Unexpected source; refuse mutation'
mutant = original.replace(needle, needle.replace(
    'with self._lock:', 'with __import__("contextlib").nullcontext():'), 1)
with tempfile.TemporaryDirectory(prefix='vt063-mutation-') as tmp:
    (Path(tmp) / 'approval_harness.py').write_text(mutant, encoding='utf-8')
    env = dict(os.environ, PYTHONPATH=tmp)
    proc = subprocess.run(
        [sys.executable, '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-v'],
        env=env, cwd=tmp, capture_output=True, text=True)
    print(proc.stdout + proc.stderr)
    print('Mutant test exit code:', proc.returncode)
    if proc.returncode == 0:
        print('MUTATION SURVIVED')
        sys.exit(1)
    if 'test_forced_interleaving_exposes_missing_guard' not in proc.stderr or 'FAIL:' not in proc.stderr:
        print('NON-SPECIFIC FAILURE; review the trace')
        sys.exit(2)
    print('MUTATION KILLED by concurrent tests; tracked source unchanged.')
