"""Mutation of BEGIN IMMEDIATE -> deferred BEGIN on a temporary SQLite module."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
original = (ROOT / 'sqlite_approval.py').read_text(encoding='utf-8')
needle = "conn.execute('BEGIN IMMEDIATE')"
assert original.count(needle) == 1, 'Unexpected transaction statement'
with tempfile.TemporaryDirectory(prefix='vt063-deferred-mutant-') as temp:
    (Path(temp) / 'sqlite_approval.py').write_text(
        original.replace(needle, "conn.execute('BEGIN')", 1), encoding='utf-8')
    env = dict(os.environ, PYTHONPATH=temp)
    command = [sys.executable, '-m', 'unittest', 'discover', '-s',
               str(ROOT / 'tests'), '-p', 'test_sqlite_approval.py', '-v']
    proc = subprocess.run(command, cwd=temp, env=env, text=True, capture_output=True)
    log = proc.stdout + proc.stderr
    print(log)
    failed = re.findall(r'^(?:ERROR|FAIL): (\w+)\s+\(', log, re.MULTILINE)
    expected = 'test_begin_immediate_serializes_check_then_insert'
    if proc.returncode != 0 and expected in failed:
        print('BEGIN IMMEDIATE MUTATION KILLED by named concurrency test; tracked source unchanged')
    else:
        print(f'MUTATION SURVIVED OR NONSPECIFIC FAILURE: {failed}')
        sys.exit(1)
