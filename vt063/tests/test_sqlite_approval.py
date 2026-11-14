"""SQLite integration and process-isolation behavioral tests."""
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path
import tempfile
import multiprocessing
import unittest
from sqlite_approval import approve, count, initialize

def worker(job):
    path, key = job
    return approve(path, 'reviewer', 'r1', key)

class SQLiteApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vt063-db-')
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / 'approval.sqlite3')
        initialize(self.path)

    def test_insert_approval_and_audit_atomically(self):
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'k1'), 'approved')
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))

    def test_retry_replays_original_response_and_preserves_audit(self):
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'k1'), 'approved')
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'k1'), 'approved')
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'k2'), 'already-approved')
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))

    def test_failure_during_audit_rolls_back_approval(self):
        with self.assertRaises(RuntimeError):
            approve(self.path, 'reviewer', 'r1', 'k1', fail_audit=True)
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (0, 0))
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'k1'), 'approved')

    def test_real_sqlite_audit_insert_failure_rolls_back(self):
        import sqlite3
        with sqlite3.connect(self.path) as db:
            db.execute("""CREATE TRIGGER audit_denied BEFORE INSERT ON approval_audit
                BEGIN SELECT RAISE(ABORT, 'audit-write-rejected'); END;""")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'audit-write-rejected'):
            approve(self.path, 'reviewer', 'r1', 'audit-key')
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (0, 0))
        with sqlite3.connect(self.path) as db:
            db.execute('DROP TRIGGER audit_denied')
        self.assertEqual(approve(self.path, 'reviewer', 'r1', 'audit-key'), 'approved')
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))

    def test_begin_immediate_serializes_check_then_insert(self):
        import threading
        barrier = threading.Barrier(2)
        def overlap_hook():
            try:
                barrier.wait(timeout=0.35)
            except threading.BrokenBarrierError:
                pass
        def one(key):
            return approve(self.path, 'reviewer', 'r1', key, before_insert=overlap_hook)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(one, key) for key in ('thread-1', 'thread-2')]
            result = [f.result(timeout=10) for f in futures]
        self.assertCountEqual(result, ['approved', 'already-approved'])
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))

    def test_unknown_request_and_wrong_role_are_negative(self):
        with self.assertRaises(PermissionError):
            approve(self.path, 'guest', 'r1', 'k')
        with self.assertRaises(KeyError):
            approve(self.path, 'reviewer', 'missing', 'k')
        with self.assertRaises(ValueError):
            approve(self.path, 'reviewer', 'r1', '')
        self.assertEqual(count(self.path), 0)

    def test_two_independent_processes_serialize_same_request(self):
        with ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context("spawn")) as pool:
            result = list(pool.map(worker, [(self.path, 'key-a'), (self.path, 'key-b')]))
        self.assertCountEqual(result, ['approved', 'already-approved'])
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))

    def test_30_simultaneous_db_connections_never_duplicate(self):
        with ThreadPoolExecutor(max_workers=30) as pool:
            result = list(pool.map(lambda i: approve(self.path, 'reviewer', 'r1', f'key-{i}'), range(30)))
        self.assertEqual(result.count('approved'), 1)
        self.assertEqual((count(self.path), count(self.path, 'approval_audit')), (1, 1))
