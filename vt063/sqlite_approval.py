"""SQLite integration slice for reviewer approval; not real HTTP authentication or EVM."""
import sqlite3

def initialize(path, requests=(("r1", 100, "alice"),)):
    with sqlite3.connect(str(path)) as conn:
        conn.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY, amount INTEGER NOT NULL, creator TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS approvals(request_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS approval_audit(request_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL);
        """)
        conn.executemany('INSERT OR IGNORE INTO requests VALUES(?,?,?)', requests)

def approve(path, role, request_id, key, fail_audit=False, before_insert=None):
    """Approve exactly once via a durable transaction, including audit in the same commit."""
    if role != 'reviewer':
        raise PermissionError('reviewer required')
    if not key:
        raise ValueError('key required')
    conn = sqlite3.connect(str(path), timeout=15, isolation_level=None)
    try:
        conn.execute('PRAGMA busy_timeout = 15000')
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute('SELECT 1 FROM requests WHERE request_id=?', (request_id,)).fetchone() is None:
            raise KeyError(request_id)
        old = conn.execute('SELECT idempotency_key FROM approvals WHERE request_id=?', (request_id,)).fetchone()
        if old is not None:
            result = 'approved' if old[0] == key else 'already-approved'
        else:
            if before_insert is not None:  # test-only synchronization hook
                before_insert()
            conn.execute('INSERT INTO approvals VALUES(?,?)', (request_id, key))
            if fail_audit:
                raise RuntimeError('injected audit write failure')
            conn.execute('INSERT INTO approval_audit VALUES(?,?)', (request_id, key))
            result = 'approved'
        conn.commit()
        return result
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()

def count(path, table='approvals'):
    assert table in ('approvals','approval_audit')
    with sqlite3.connect(str(path)) as conn:
        return conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
