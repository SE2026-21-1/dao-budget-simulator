"""SQLite mutation in a TEMP copy: deliberately bypass idempotency lookup guard."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
src = (ROOT / 'sqlite_approval.py').read_text(encoding='utf-8')
needle = 'if old is not None:'
assert src.count(needle) == 1
mutant = src.replace(needle, 'if False and old is not None:', 1)
with tempfile.TemporaryDirectory(prefix='vt063-sqlite-mutant-') as temp:
    (Path(temp) / 'sqlite_approval.py').write_text(mutant, encoding='utf-8')
    env = dict(os.environ, PYTHONPATH=temp)
    command = [sys.executable, '-m', 'unittest', 'discover', '-s',
               str(ROOT / 'tests'), '-p', 'test_sqlite_approval.py', '-v']
    proc = subprocess.run(command, env=env, cwd=temp, text=True, capture_output=True)
    output = proc.stdout + proc.stderr
    print(output)
    failures = re.findall(r'^(?:FAIL|ERROR): (\w+)\s+\(', output, re.MULTILINE)
    expected = 'test_retry_replays_original_response_and_preserves_audit'
    if proc.returncode == 0 or expected not in failures:
        print(f'SQLITE MUTATION NOT SPECIFICALLY DETECTED; failed={failures}')
        sys.exit(1)
    print(f'SQLITE MUTATION KILLED by {expected}; original source unchanged')
