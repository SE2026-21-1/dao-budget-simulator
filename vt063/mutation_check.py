"""Reproduce concurrency mutation without modifying tracked source files."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
original = (ROOT / "approval_harness.py").read_text(encoding="utf-8")
guard = "with self._lock:"
assert original.count(guard) == 1, "Unexpected source version; refuse mutation"
mutated = original.replace(guard, 'with __import__("contextlib").nullcontext():', 1)

with tempfile.TemporaryDirectory(prefix="vt063-mutation-") as tmp:
    folder = Path(tmp)
    (folder / "approval_harness.py").write_text(mutated, encoding="utf-8")
    env = dict(os.environ, PYTHONPATH=str(folder))
    command = [sys.executable, "-m", "unittest", "discover", "-s",
               str(ROOT / "tests"), "-v"]
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    print(result.stdout + result.stderr)
    print(f"Mutation exit status: {result.returncode}")
    if result.returncode == 0:
        print("MUTATION SURVIVED: tests did not catch deleted concurrency guard.")
        sys.exit(1)
    if "test_concurrent_same_request_one_approval" not in result.stderr or "FAIL" not in result.stderr:
        print("Non-specific failure; inspect test evidence rather than treating as mutation kill.")
        sys.exit(2)
    print("Mutation detected by concurrency test. Tracked source unmodified.")
