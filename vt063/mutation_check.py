"""Deliberately remove approve lock in a temporary copy and check a precise failed test."""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
original = (ROOT / 'approval_harness.py').read_text(encoding='utf-8')
needle = """        with self._lock:
            if request_id in self._approvals:
                return 'approved' if self._approvals[request_id] == key else 'already-approved'"""
assert original.count(needle) == 1, 'Unexpected source version: refusing mutation'
mutant = original.replace(needle, needle.replace('with self._lock:', 'with __import__("contextlib").nullcontext():'), 1)
with tempfile.TemporaryDirectory(prefix='vt063-mutant-') as temp:
    (Path(temp) / 'approval_harness.py').write_text(mutant, encoding='utf-8')
    env = dict(os.environ, PYTHONPATH=temp)
    cmd = [sys.executable, '-m', 'unittest', 'discover', '-s', str(ROOT / 'tests'), '-v']
    proc = subprocess.run(cmd, cwd=temp, env=env, text=True, capture_output=True)
    output = proc.stdout + proc.stderr
    print(output)
    failures = re.findall(r'^FAIL: (\w+)\s+\(', output, re.MULTILINE)
    if proc.returncode == 0:
        print('MUTATION SURVIVED')
        sys.exit(1)
    if 'test_forced_interleaving_exposes_missing_guard' not in failures:
        print(f'NON-SPECIFIC FAILURE: expected coordinated concurrency failure; got {failures!r}')
        sys.exit(2)
    print(f'MUTATION KILLED; specific failed tests: {failures}; original source unchanged')
