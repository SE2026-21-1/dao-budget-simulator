import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyPostgresConnection } from '../../scripts/be08_postgres_identity.mjs';

const server = { version: 'PostgreSQL 18.4 (Debian)', directory: '/owned/data', binding: '127.0.0.1:55432' };
const native = { peer: { address: '127.0.0.1', port: 55432 }, server, expectedPort: 55432, nativeDirectory: '/owned/data' };

test('BE08 forwarded CI service validates client loopback while PostgreSQL reports a container address and internal port', () => {
  verifyPostgresConnection({ peer: native.peer, expectedPort: 55432,
    server: { ...server, directory: '/var/lib/postgresql/18/docker', binding: '172.18.0.2:5432' } });
});

test('BE08 rejects non-loopback or unexpected client ports even when server metadata looks local', () => {
  assert.throws(() => verifyPostgresConnection({ ...native, peer: { address: '172.18.0.2', port: 55432 } }), /numeric loopback/);
  assert.throws(() => verifyPostgresConnection({ ...native, peer: { address: '127.0.0.1', port: 5432 } }), /configured port/);
  assert.throws(() => verifyPostgresConnection({ ...native, server: { ...server, version: 'PostgreSQL 18.3' } }), /18.4/);
});

test('BE08 owned native cluster retains exact directory and server binding checks', () => {
  verifyPostgresConnection(native);
  assert.throws(() => verifyPostgresConnection({ ...native, server: { ...server, directory: '/other/data' } }), /newly owned cluster/);
  assert.throws(() => verifyPostgresConnection({ ...native, server: { ...server, binding: '172.18.0.2:5432' } }), /reserved loopback binding/);
});
