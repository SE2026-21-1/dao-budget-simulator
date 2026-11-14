"""Isolated in-memory characterization harness; NOT a blockchain implementation."""
from dataclasses import dataclass
import threading
import time

@dataclass(frozen=True)
class Request:
    request_id: str
    amount: int
    creator: str

class ApprovalService:
    def __init__(self, requests):
        self._requests = {r.request_id: r for r in requests}
        self._approvals = {}
        self._lock = threading.Lock()

    def read(self, role, request_id):
        return self._requests[request_id]

    def edit(self, role, request_id, amount):
        if role != 'owner':
            raise PermissionError('only owner can edit source data')
        with self._lock:
            if request_id in self._approvals:
                raise PermissionError('approved request is immutable')
            original = self._requests[request_id]
            self._requests[request_id] = Request(request_id, amount, original.creator)

    def approve(self, role, request_id, key):
        if role != 'reviewer':
            raise PermissionError('reviewer role required')
        if not key:
            raise ValueError('idempotency key required')
        if request_id not in self._requests:
            raise KeyError(request_id)
        with self._lock:
            if request_id in self._approvals:
                return 'already-approved'
            # Increase scheduling overlap for a local concurrency test.
            time.sleep(0.002)
            self._approvals[request_id] = key
            return 'approved'

    def approval_count(self, request_id):
        return int(request_id in self._approvals) if isinstance(self._approvals.get(request_id), str) else 0

    def total_approvals(self):
        return len(self._approvals)
