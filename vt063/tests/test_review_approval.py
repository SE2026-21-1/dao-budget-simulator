import concurrent.futures
import threading
import unittest
from approval_harness import ApprovalService, Request

class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.svc = ApprovalService([Request('r1', 100, 'alice')])

    def test_reviewer_can_read(self):
        self.assertEqual(self.svc.read('reviewer', 'r1').amount, 100)

    def test_anonymous_can_read(self):
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)

    def test_reviewer_cannot_modify_original(self):
        with self.assertRaises(PermissionError):
            self.svc.edit('reviewer', 'r1', 999)
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)

    def test_owner_cannot_approve(self):
        with self.assertRaises(PermissionError):
            self.svc.approve('owner', 'r1', 'a')

    def test_guest_cannot_approve(self):
        with self.assertRaises(PermissionError):
            self.svc.approve('guest', 'r1', 'a')

    def test_approval_keeps_original_unchanged(self):
        self.assertEqual(self.svc.approve('reviewer', 'r1', 'a'), 'approved')
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)
        self.assertEqual(self.svc.approval_count('r1'), 1)

    def test_repeat_same_key_is_idempotent(self):
        self.svc.approve('reviewer', 'r1', 'a')
        self.assertEqual(self.svc.approve('reviewer', 'r1', 'a'), 'already-approved')
        self.assertEqual(self.svc.approval_count('r1'), 1)

    def test_different_key_same_request_does_not_duplicate(self):
        self.svc.approve('reviewer', 'r1', 'a')
        self.assertEqual(self.svc.approve('reviewer', 'r1', 'b'), 'already-approved')
        self.assertEqual(self.svc.approval_count('r1'), 1)

    def test_missing_request_does_not_write(self):
        with self.assertRaises(KeyError):
            self.svc.approve('reviewer', 'missing', 'k')
        self.assertEqual(self.svc.total_approvals(), 0)

    def test_empty_key_fails_without_write(self):
        with self.assertRaises(ValueError):
            self.svc.approve('reviewer', 'r1', '')
        self.assertEqual(self.svc.total_approvals(), 0)

    def test_approved_request_cannot_be_edited_by_owner(self):
        """Approved decision must not silently become approval of different source data."""
        self.svc.approve('reviewer', 'r1', 'k-accepted')
        with self.assertRaises(PermissionError):
            self.svc.edit('owner', 'r1', 999)
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)

    def test_owner_can_edit_before_approval(self):
        self.svc.edit('owner', 'r1', 120)
        self.assertEqual(self.svc.read('reviewer', 'r1').amount, 120)
        self.assertEqual(self.svc.total_approvals(), 0)

    def test_distinct_requests_approve_independently(self):
        service = ApprovalService([Request('r1', 100, 'alice'), Request('r2', 200, 'bob')])
        self.assertEqual(service.approve('reviewer', 'r1', 'key'), 'approved')
        self.assertEqual(service.approve('reviewer', 'r2', 'key'), 'approved')
        self.assertEqual(service.total_approvals(), 2)

    def test_guest_cannot_edit(self):
        with self.assertRaises(PermissionError):
            self.svc.edit('guest', 'r1', 333)
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)

    def test_concurrent_same_request_one_approval(self):
        barrier = threading.Barrier(2)
        def work(key):
            barrier.wait()
            return self.svc.approve('reviewer', 'r1', key)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(work, ('k1', 'k2')))
        self.assertCountEqual(results, ['approved', 'already-approved'])
        self.assertEqual(self.svc.approval_count('r1'), 1)

    def test_forced_interleaving_exposes_missing_guard(self):
        """Make both unguarded threads observe missing approval before either write."""
        class CoordinatedApprovals(dict):
            def __init__(self):
                super().__init__()
                self.barrier = threading.Barrier(2)
                self.calls = 0
                self.counter_lock = threading.Lock()

            def __contains__(self, key):
                with self.counter_lock:
                    self.calls += 1
                    call_number = self.calls
                if call_number <= 2:
                    try:
                        # Protected version times out once; mutant permits two threads.
                        self.barrier.wait(timeout=0.2)
                    except threading.BrokenBarrierError:
                        pass
                return super().__contains__(key)

        self.svc._approvals = CoordinatedApprovals()
        start = threading.Barrier(2)
        def work(key):
            start.wait(timeout=2)
            return self.svc.approve('reviewer', 'r1', key)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(work, ('x', 'y')))
        self.assertCountEqual(results, ['approved', 'already-approved'])
        self.assertEqual(self.svc.approval_count('r1'), 1)

    def test_150_concurrent_one_approval(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=150) as pool:
            results = list(pool.map(lambda i: self.svc.approve('reviewer', 'r1', f'k{i}'), range(150)))
        self.assertEqual(results.count('approved'), 1)
        self.assertEqual(self.svc.approval_count('r1'), 1)
        self.assertEqual(self.svc.read('guest', 'r1').amount, 100)

if __name__ == '__main__':
    unittest.main()
