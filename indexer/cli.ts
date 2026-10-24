import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';
import { IndexerError, publicError } from './errors.js';
import { HttpRpc } from './rpc.js';
import { scan, ScanError } from './scanner.js';
import { PostgresStorage } from './storage.js';
import { sync, SyncError } from './syncer.js';

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    process.stdout.write('Usage: npm run indexer -- --config <file.json> [--sync|--redecode]\nSet RPC_URL and DATABASE_URL in the environment. Exit: 0 complete, 1 failure, 2 raw logs saved with decode issues.\n');
    return 0;
  }
  let pool: pg.Pool | undefined;
  try {
    if ((args.length !== 2 && !(args.length === 3 && ['--sync', '--redecode'].includes(args[2]!))) || args[0] !== '--config' || !args[1]) throw new IndexerError('INVALID_ARGUMENT', 'Use --config <file.json> [--sync|--redecode] (or --help).');
    const config = await loadConfig(args[1]);
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new IndexerError('INVALID_CONFIG', 'Set DATABASE_URL to the intended migrated PostgreSQL database.');
    pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
    if (args[2]) {
      const storage = new PostgresStorage(pool);
      if (args[2] === '--redecode') {
        const processed = await storage.redecode(config);
        const issues = await storage.decodeIssues(config);
        process.stdout.write(JSON.stringify({ type: 'redecode_result', processed, ...issues }) + '\n');
        return issues.decodeErrors + issues.unknownTopics ? 2 : 0;
      }
      const report = await sync(config, new HttpRpc(config.rpcUrl), storage,
        (batch) => process.stdout.write(JSON.stringify(batch) + '\n'));
      process.stdout.write(JSON.stringify({ type: 'sync_result', ...report }) + '\n');
      return report.decodeComplete ? 0 : 2;
    }
    const report = await scan(config, new HttpRpc(config.rpcUrl), new PostgresStorage(pool), (batch) => {
      process.stdout.write(JSON.stringify({ type: 'batch_committed', ...batch }) + '\n');
    });
    process.stdout.write(JSON.stringify({ type: 'scan_result', ...report }) + '\n');
    return report.status === 'completed' ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify(error instanceof SyncError ? { type: 'sync_result', ...error.report }
      : error instanceof ScanError ? { type: 'scan_result', ...error.report } : { type: 'error', ...publicError(error) }) + '\n');
    return 1;
  } finally { await pool?.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
