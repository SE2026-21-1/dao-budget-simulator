import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const migrationsDirectory = fileURLToPath(new URL('../database/migrations/', import.meta.url));
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export function requireThat(value, message) { if (!value) { const error = new Error(message); error.operatorSafe = true; throw error; } }
export function option(name, fallback) { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; }
export async function readManifest(path) {
  const m = JSON.parse(await readFile(path, 'utf8'));
  requireThat(m.schemaVersion === 1 && m.repository === 'SE2026-21-1/dao-budget-simulator' && typeof m.sha === 'string' && /^[a-f0-9]{40}$/.test(m.sha) && typeof m.runId === 'string' && /^[0-9]+$/.test(m.runId) && typeof m.migrationSet === 'string' && /^[a-f0-9]{64}$/.test(m.migrationSet), 'Invalid release manifest.');
  for (const service of ['frontend', 'api', 'indexer']) requireThat(new RegExp(`^ghcr\\.io/se2026-21-1/dao-budget-simulator/${service}@sha256:[a-f0-9]{64}$`).test(m.images?.[service]), `Invalid ${service} digest reference.`);
  return m;
}
export async function migrationFiles(directory = migrationsDirectory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  requireThat(names.length > 0, 'No SQL migrations found in image.');
  const files = await Promise.all(names.map(async (name) => { const sql = await readFile(`${directory}/${name}`, 'utf8'); return { name, sql, checksum: sha256(sql) }; }));
  return { files, fingerprint: sha256(files.map((f) => `${f.name}:${f.checksum}\n`).join('')) };
}
export async function connect() {
  requireThat(process.env.DATABASE_URL, 'DATABASE_URL is required.');
  const database = new URL(process.env.DATABASE_URL);
  const placeholder = /REPLACE_WITH|CHANGE_ME|CHANGEME/i;
  requireThat(database.password.length > 0 && !placeholder.test(decodeURIComponent(database.password)), 'Database password is empty or still an example placeholder.');
  requireThat(!placeholder.test(process.env.API_CURSOR_SECRET ?? '') && !placeholder.test(process.env.RPC_URL ?? ''), 'Replace example cursor-secret/RPC placeholders before any server operation.');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 15000, query_timeout: 20000, application_name: 'dao-deployment-operations' });
  client.on('error', () => { console.error('Database operation connection lost; retry only after operator inspection.'); process.exitCode = 1; });
  await client.connect();
  return client;
}
export async function lock(client) {
  const result = await client.query("SELECT pg_try_advisory_lock(hashtextextended('dao-deployment-operations-v1', 0)) AS locked");
  requireThat(result.rows[0].locked, 'Another deployment or migration holds the database operation lock.');
}
// Catalog definitions, not database data or sequence current values. The tracking
// table is deliberately excluded so recording a migration cannot change its hash.
export async function schemaFingerprint(client) {
  const result = await client.query(`
    SELECT kind, name, definition FROM (
      SELECT 'relation' AS kind, c.relname AS name, jsonb_build_array(c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.reloptions)::text AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') AND c.relname <> 'dao_schema_migrations'
      UNION ALL
      SELECT 'column', c.relname||'.'||a.attname, jsonb_build_array(a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),co.collname)::text
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped AND c.relname <> 'dao_schema_migrations'
      UNION ALL
      SELECT 'constraint', co.conname||':'||COALESCE(c.relname,t.typname), pg_get_constraintdef(co.oid,true)
      FROM pg_constraint co JOIN pg_namespace n ON n.oid=co.connamespace LEFT JOIN pg_class c ON c.oid=co.conrelid LEFT JOIN pg_type t ON t.oid=co.contypid WHERE n.nspname='public' AND COALESCE(c.relname,'') <> 'dao_schema_migrations'
      UNION ALL
      SELECT 'index', ci.relname, pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname <> 'dao_schema_migrations'
      UNION ALL
      SELECT 'type', t.typname, jsonb_build_array(t.typtype,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('d','e')
      UNION ALL
      SELECT 'function', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
      UNION ALL
      SELECT 'trigger', c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid,true) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname <> 'dao_schema_migrations'
      UNION ALL
      SELECT 'view', c.relname, pg_get_viewdef(c.oid,true) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')
      UNION ALL
      SELECT 'sequence', c.relname, jsonb_build_array(s.seqtypid::regtype::text,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    ) definitions ORDER BY kind COLLATE "C", name COLLATE "C", definition COLLATE "C"`);
  return sha256(JSON.stringify(result.rows));
}
export async function trackedSchema(client, files, complete = true) {
  const exists = (await client.query("SELECT to_regclass('public.dao_schema_migrations') AS name")).rows[0].name;
  requireThat(exists, 'Database migrations are untracked. Run the explicit migration/baseline operation first.');
  const rows = (await client.query('SELECT name, checksum, schema_fingerprint FROM public.dao_schema_migrations ORDER BY name COLLATE "C"')).rows;
  requireThat(!complete || rows.length === files.length, 'Database migration set is not current; deployment never runs migrations.');
  requireThat(rows.length <= files.length, 'Database contains newer migrations than this release.');
  rows.forEach((row, i) => requireThat(row.name === files[i].name && row.checksum === files[i].checksum, 'Applied migration checksum/order differs from this release.'));
  const fingerprint = await schemaFingerprint(client);
  requireThat(rows.length === 0 || rows.at(-1).schema_fingerprint === fingerprint, 'Database schema drift detected against the recorded migration fingerprint.');
  return { rows, fingerprint };
}
export function safeFailure(scope) { return (error) => { console.error(`${scope} failed: ${error?.operatorSafe ? error.message : 'check configuration, credentials, RPC and database availability (secret-bearing details suppressed).'}`); process.exitCode = 1; }; }
export const isMain = (url) => process.argv[1] && fileURLToPath(url) === process.argv[1];
