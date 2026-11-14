"""Local in-process 150-task burst, not HTTP/user/RPC load testing."""
from approval_harness import ApprovalService, Request
from concurrent.futures import ThreadPoolExecutor
import math, time, json, platform

def one(service, n):
    start = time.perf_counter()
    result = service.approve('reviewer', 'r1', f'load-{n}')
    return (time.perf_counter() - start) * 1000, result

def run():
    service = ApprovalService([Request('r1', 100, 'alice')])
    with ThreadPoolExecutor(max_workers=150) as executor:
        values = list(executor.map(lambda i: one(service, i), range(150)))
    latencies = sorted(x[0] for x in values)
    index = math.ceil(.95 * len(latencies)) - 1
    print(json.dumps({'mode':'in-process thread burst', 'tasks':len(values),
       'max_workers':150, 'p95_ms':round(latencies[index],3),
       'p95_target_ms':4000, 'successful_first_approvals':sum(r == 'approved' for _, r in values),
       'approval_count':service.approval_count('r1'),
       'python':platform.python_version()}, indent=2))
if __name__ == '__main__':
    run()
