"""In-process 150-thread contention experiment; NOT an HTTP load test."""
from approval_harness import ApprovalService, Request
from concurrent.futures import ThreadPoolExecutor
import math
import platform
import statistics
import threading
import time
import json

TASKS = 150

def run():
    service = ApprovalService([Request('r1', 100, 'alice')])
    gate = threading.Barrier(TASKS + 1)
    def one(n):
        gate.wait(timeout=15)
        start = time.perf_counter()
        result = service.approve('reviewer', 'r1', f'load-{n}')
        return ((time.perf_counter() - start) * 1000, result)

    with ThreadPoolExecutor(max_workers=TASKS) as executor:
        futures = [executor.submit(one, i) for i in range(TASKS)]
        start_burst = time.perf_counter()
        gate.wait(timeout=15)
        values = [f.result() for f in futures]
        elapsed = time.perf_counter() - start_burst
    times = sorted(x for x, _ in values)
    output = {
        'mode': 'synchronized in-process Python thread burst',
        'tasks': TASKS,
        'max_workers': TASKS,
        'p95_ms': round(times[math.ceil(.95 * TASKS)-1], 4),
        'max_ms': round(max(times), 4),
        'median_ms': round(statistics.median(times), 4),
        'burst_elapsed_ms': round(elapsed * 1000, 4),
        'throughput_tasks_per_s': round(TASKS / elapsed, 2),
        'target_p95_ms': 4000,
        'successful_first_approvals': sum(r == 'approved' for _, r in values),
        'approval_count': service.approval_count('r1'),
        'python': platform.python_version()
    }
    print(json.dumps(output, indent=2))
    assert output['successful_first_approvals'] == 1
    assert output['approval_count'] == 1

if __name__ == '__main__':
    run()
