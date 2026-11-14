"""Five synchronized local SQLite contention trials, not HTTP/user traffic."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import math
import statistics
import tempfile
import threading
import time
from sqlite_approval import approve, initialize, count

def run_trial(trial):
    with tempfile.TemporaryDirectory(prefix='vt063-load-') as folder:
        path = str(Path(folder) / 'test.sqlite3')
        initialize(path)
        gate = threading.Barrier(151)
        def worker(i):
            gate.wait(timeout=20)
            start = time.perf_counter()
            try:
                result = approve(path, 'reviewer', 'r1', f'k-{i}')
            except Exception as exc:
                result = 'error:' + type(exc).__name__
            return (time.perf_counter() - start) * 1000, result
        with ThreadPoolExecutor(max_workers=150) as pool:
            futures = [pool.submit(worker, i) for i in range(150)]
            start = time.perf_counter()
            gate.wait(timeout=20)
            results = [f.result(timeout=30) for f in futures]
        wall_ms = (time.perf_counter() - start) * 1000
        latencies = sorted(t for t, _ in results)
        first = sum(r == 'approved' for _, r in results)
        duplicate = sum(r == 'already-approved' for _, r in results)
        errors = sum(r.startswith('error:') for _, r in results)
        assert (first, duplicate, errors) == (1, 149, 0)
        assert count(path) == count(path, 'approval_audit') == 1
        return {'trial': trial, 'tasks': 150, 'p95_ms': round(latencies[142],3),
                'p99_ms': round(latencies[math.ceil(.99*150)-1],3),
                'max_ms': round(latencies[-1],3),
                'wall_ms': round(wall_ms,3), 'throughput_per_s':round(150000/wall_ms,2),
                'approved':first,'already_approved':duplicate,'errors':errors,
                'busy_timeout_ms':15000,'approval_rows':1,'audit_rows':1}

if __name__ == '__main__':
    trials = [run_trial(i) for i in range(1,6)]
    print(json.dumps({'mode':'local SQLite threads, not 150 HTTP users','runs':trials,
                      'median_run_p95_ms':round(statistics.median(t['p95_ms'] for t in trials),3),
                      'p95_target_ms':4000},indent=2))
