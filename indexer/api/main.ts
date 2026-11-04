import pg from 'pg';
import { createApiServer } from './server.js';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const cursorSecret = process.env.API_CURSOR_SECRET;
const host = process.env.API_HOST ?? '127.0.0.1';
const portRaw = process.env.API_PORT ?? '3000';
const port = Number(portRaw);
if (!connectionString) throw new Error('Set DATABASE_URL to the BE03/BE04 PostgreSQL database.');
if (!cursorSecret || Buffer.byteLength(cursorSecret) < 32) throw new Error('Set API_CURSOR_SECRET to at least 32 random bytes.');
if (!/^(0|[1-9][0-9]*)$/.test(portRaw) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be an integer in [1,65535].');

const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
  statement_timeout: 5000, query_timeout: 6000, application_name: 'dao-budget-simulator-be05-api' });
const server = createApiServer({ pool, cursorSecret, corsOrigins: process.env.API_CORS_ORIGINS,
  snapshotTtlSeconds: process.env.API_SNAPSHOT_TTL_SECONDS === undefined ? 900 : Number(process.env.API_SNAPSHOT_TTL_SECONDS) });
server.on('error', () => { process.exitCode = 1; void shutdown(); });
server.listen(port, host, () => process.stdout.write(`BE05 read API listening on http://${host}:${port}\n`));

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  server.close(() => { void pool.end().finally(() => { process.exitCode ??= 0; }); });
  const timeout = setTimeout(() => { process.exitCode = 1; process.exit(); }, 8000);
  timeout.unref();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
