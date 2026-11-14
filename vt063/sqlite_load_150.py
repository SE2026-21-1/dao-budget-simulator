"""Five 150-thread SQLite contention trials; not HTTP, API, wallet or EVM benchmarking."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import statistics
import tempfile
import threading
import time
from sqlite_approval import approve, initialize, count

def run_trial(trial):
    with tempfile.TemporaryDirectory(prefix='vt063-load-') as folder:
        path = str(Path(folder) / 'test.sqlite3')
        initialize(path)
        barrier = threading.Barrier(151)
        def worker(i):
            barrier.wait(timeout=20)
            start = time.perf_counter()
            response = approve(path, 'reviewer', 'r1', f'k-{i}')
            return (time.perf_counter() - start) * 1000, response
        with ThreadPoolExecutor(max_workers=150) as pool:
            futures = [pool.submit(worker, j) for j in range(150)]
            start = time.perf_counter()
            barrier.wait(timeout=20)
            result = [f.result(timeout=30) for f in futures]
        wall_ms = (time.perf_counter() - start) * 1000
        samples = sorted(ms for ms, _ in result)
        first = sum(value == 'approved' for _, value in result)
        assert first == 1 and count(path) == count(path, 'approval_audit') == 1
        return {'trial':trial,'requests':150,'p95_ms':round(samples[142],3),
                'wall_ms':round(wall_ms,3),'throughput_per_s':round(150000/wall_ms,2),
                'approved':first,'approval_rows':1,'audit_rows':1}

if __name__ == '__main__':
    values = [run_trial(n) for n in range(1,6)]
    print(json.dumps({'mode':'local SQLite/threads, not HTTP','runs':values,
        'median_run_p95_ms':round(statistics.median(row['p95_ms'] for row in values),3),
        'p95_target_ms':4000},indent=2))
