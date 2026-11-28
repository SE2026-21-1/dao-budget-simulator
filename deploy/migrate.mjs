import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { connect, isMain, lock, migrationFiles, option, readManifest, requireThat, safeFailure, schemaFingerprint, trackedSchema } from './common.mjs';

export function transactionBody(sql) {
  // Existing migrations own an outer BEGIN/COMMIT. Move only those wrappers
  // into this runner so SQL changes and the checksum record commit together.
  const start = /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*BEGIN\s*;/i.exec(sql);
  const end = /COMMIT\s*;\s*$/i.exec(sql);
  requireThat(start && end && end.index >= start[0].length, 'Migration must have exactly an outer BEGIN/COMMIT transaction.');
  const body = sql.slice(start[0].length, end.index);
  // Ignore transaction words inside comments, strings and dollar-quoted
  // function bodies, but reject control statements even on the same line.
  let visible = '';
  for (let i = 0; i < body.length;) {
    if (body.startsWith('--', i)) {
      const end = body.indexOf('\n', i + 2); i = end < 0 ? body.length : end; visible += ' '; continue;
    }
    if (body.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < body.length && depth) {
        if (body.startsWith('/*', i)) { depth++; i += 2; }
        else if (body.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      requireThat(depth === 0, 'Unterminated migration SQL comment.'); visible += ' '; continue;
    }
    const quote = body[i];
    if (quote === "'" || quote === '"') {
      const escapes = quote === "'" && /[eE]/.test(body[i - 1] ?? '') && !/[a-zA-Z0-9_$]/.test(body[i - 2] ?? '');
      let closed = false; i++;
      while (i < body.length) {
        if (escapes && body[i] === '\\') { i += 2; continue; }
        if (body[i] === quote) {
          if (body[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      requireThat(closed, 'Unterminated migration SQL quote.'); visible += ' '; continue;
    }
    const dollar = body[i] === '$' && !/[a-zA-Z0-9_$]/.test(body[i - 1] ?? '') ? /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(body.slice(i)) : null;
    if (dollar) {
      const end = body.indexOf(dollar[0], i + dollar[0].length);
      requireThat(end >= 0, 'Unterminated migration SQL dollar quote.');
      i = end + dollar[0].length; visible += ' '; continue;
    }
    visible += body[i++];
  }
  requireThat(!visible.split(';').some((statement) => /^\s*(?:BEGIN|COMMIT|ROLLBACK|ABORT|END|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/i.test(statement)), 'Nested transaction control is not supported in migrations.');
  return body;
}
async function backupProof(path, expected) {
  requireThat(path && /^[a-f0-9]{64}$/.test(expected ?? ''), 'Migration requires --backup FILE and --backup-sha256 HASH.');
  const info = await stat(path);
  requireThat(info.isFile() && info.size > 0, 'Backup must be an existing nonempty regular file.');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  requireThat(digest.digest('hex') === expected, 'Backup checksum does not match operator-supplied SHA256.');
}
export async function migrate(client, args) {
  requireThat(args.approve === true, 'Migration requires explicit --approve after reviewing a verified database backup.');
  await backupProof(args.backup, args.backupHash);
  const manifest = await readManifest(args.manifest);
  const { files, fingerprint } = await migrationFiles();
  requireThat(manifest.migrationSet === fingerprint, 'Release manifest and migration files do not match.');
  files.forEach((file) => transactionBody(file.sql));
  const exists = (await client.query("SELECT to_regclass('public.dao_schema_migrations') AS name")).rows[0].name;
  let count = 0;
  if (!exists) {
    const populated = (await client.query("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) AS populated")).rows[0].populated;
    requireThat(!populated || (args.baseline && /^[a-f0-9]{64}$/.test(args.schema ?? '')), 'Existing database adoption requires --baseline LAST_FILENAME and --schema-fingerprint HASH from an independently reviewed schema.');
    if (populated) {
      count = files.findIndex((f) => f.name === args.baseline) + 1;
      requireThat(count > 0, 'Baseline filename must identify an exact migration in this release.');
      requireThat(await schemaFingerprint(client) === args.schema, 'Baseline schema differs from the explicitly approved fingerprint.');
    } else requireThat(!args.baseline, 'Cannot baseline an empty database.');
    await client.query('BEGIN');
    try {
      await client.query(`CREATE TABLE public.dao_schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
        schema_fingerprint text NOT NULL CHECK(schema_fingerprint ~ '^[a-f0-9]{64}$'),
        backup_sha256 text NOT NULL CHECK(backup_sha256 ~ '^[a-f0-9]{64}$'),
        baseline boolean NOT NULL DEFAULT false, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
      for (const file of files.slice(0, count)) await client.query('INSERT INTO public.dao_schema_migrations(name,checksum,schema_fingerprint,backup_sha256,baseline) VALUES($1,$2,$3,$4,true)', [file.name, file.checksum, args.schema, args.backupHash]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } else {
    requireThat(!args.baseline, 'Database is already tracked; baseline cannot overwrite existing migration records.');
    count = (await trackedSchema(client, files, false)).rows.length;
  }
  for (const file of files.slice(count)) {
    console.log(`Applying reviewed migration ${file.name}`);
    await client.query('BEGIN');
    try {
      await client.query(transactionBody(file.sql));
      const schema = await schemaFingerprint(client);
      await client.query('INSERT INTO public.dao_schema_migrations(name,checksum,schema_fingerprint,backup_sha256) VALUES($1,$2,$3,$4)', [file.name, file.checksum, schema, args.backupHash]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  const checked = await trackedSchema(client, files);
  console.log(`Migration operation complete: schema ${checked.fingerprint}. Deployment metadata/contracts were not created or modified.`);
}
if (isMain(import.meta.url)) {
  const client = await connect().catch(safeFailure('Database connection'));
  if (client) try {
    await lock(client);
    if (process.argv.includes('--inspect-schema')) console.log(`Schema fingerprint: ${await schemaFingerprint(client)}`);
    else await migrate(client, { approve: process.argv.includes('--approve'), manifest: option('--manifest', '/run/release/manifest.json'), backup: option('--backup'), backupHash: option('--backup-sha256'), baseline: option('--baseline'), schema: option('--schema-fingerprint') });
  } catch (error) { safeFailure('Migration')(error); }
  finally { await client.end(); }
}
