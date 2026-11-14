"""SQLite integration slice for reviewer approval; no HTTP authentication or EVM integration."""
from pathlib import Path
import sqlite3

def initialize(path, requests=(("r1", 100, "alice"),)):
    path = str(path)
    with sqlite3.connect(path) as conn:
        conn.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY, amount INTEGER NOT NULL, creator TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS approvals(request_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS approval_audit(request_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL);
        """)
        conn.executemany('INSERT OR IGNORE INTO requests VALUES(?,?,?)', requests)

def approve(path, role, request_id, key, fail_audit=False):
    """RED scaffold: intentionally does not persist the decision or audit entry."""
    if role != 'reviewer':
        raise PermissionError('reviewer required')
    if not key:
        raise ValueError('key required')
    return 'approved'

def count(path, table='approvals'):
    assert table in ('approvals','approval_audit')
    with sqlite3.connect(path) as conn:
        return conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
