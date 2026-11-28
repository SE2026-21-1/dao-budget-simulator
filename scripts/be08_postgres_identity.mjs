import assert from 'node:assert/strict';

// inet_server_addr/port describe the PostgreSQL side of a forwarded connection.
// Verify the actual client socket destination for caller-owned CI services.
// An owned native cluster must also match its private directory and binding.
export function verifyPostgresConnection({ peer, server, expectedPort, nativeDirectory }) {
  assert.ok(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer?.address),
    'Connected PostgreSQL peer must be numeric loopback');
  assert.equal(peer.port, expectedPort, 'Connected PostgreSQL peer must use the configured port');
  assert.match(server.version, /PostgreSQL 18\.4(?:\s|$)/, 'PostgreSQL 18.4 server required');
  if (nativeDirectory !== undefined) {
    assert.equal(server.directory, nativeDirectory, 'Connected server must be the newly owned cluster');
    assert.equal(server.binding, `127.0.0.1:${expectedPort}`, 'Owned native server must use reserved loopback binding');
  }
}
