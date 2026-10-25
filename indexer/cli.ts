import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { loadConfig } from './config.js';
import { IndexerError, publicError } from './errors.js';
import { HttpRpc } from './rpc.js';
import { scan, ScanError } from './scanner.js';
import { PostgresStorage } from './storage.js';
import { sync, SyncError } from './syncer.js';
import { project } from './projection/projector.js';
import type { IndexerConfig } from './types.js';

const USAGE = '--config <file.json> [--sync|--redecode|--project|--sync-project|--watch [--poll-interval-ms <100..60000>]]';

function writeError(error: unknown): void {
  process.stderr.write(JSON.stringify(error instanceof SyncError ? { type: 'sync_result', ...error.report }
    : error instanceof ScanError ? { type: 'scan_result', ...error.report } : { type: 'error', ...publicError(error) }) + '\n');
}

async function watch(config: IndexerConfig, pool: pg.Pool, intervalMs: number): Promise<number> {
  let stopCode = 0;
  let waiting: AbortController | undefined;
  const interrupt = () => { stopCode = 130; waiting?.abort(); };
  const terminate = () => { stopCode = 143; waiting?.abort(); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  const rpc = new HttpRpc(config.rpcUrl);
  const storage = new PostgresStorage(pool);
  try {
    while (!stopCode) {
      try {
        const report = await sync(config, rpc, storage, (batch) => process.stdout.write(JSON.stringify(batch) + '\n'));
        process.stdout.write(JSON.stringify({ type: 'sync_result', ...report }) + '\n');
        const projection = await project(config, rpc, pool);
        process.stdout.write(JSON.stringify({ type: 'projection_result', ...projection }) + '\n');
      } catch (error) {
        writeError(error);
        const detail = error instanceof SyncError ? error.report.error : error instanceof IndexerError ? error : undefined;
        const resumableReorg = detail && ['REORG_UNSTABLE', 'BLOCK_MISMATCH', 'LOG_BLOCK_MISMATCH', 'REMOVED_LOG', 'PROJECTION_REORG'].includes(detail.code);
        if (detail?.retryable !== true && !resumableReorg) return stopCode || 1;
      }
      if (stopCode) break;
      waiting = new AbortController();
      try { await sleep(intervalMs, undefined, { signal: waiting.signal }); }
      catch (error) { if (!stopCode) throw error; }
      finally { waiting = undefined; }
    }
    return stopCode;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    process.stdout.write(`Usage: npm run indexer -- ${USAGE}\nSet RPC_URL and DATABASE_URL in the environment. Exit: 0 complete, 1 failure, 2 raw logs saved with decode issues. --project reconciles BE04 at the BE03 checkpoint. --watch repeats sync + projection for toBlock=latest, default every 5000ms (INDEXER_POLL_INTERVAL_MS); SIGINT/SIGTERM drain the active cycle and exit 130/143.\n`);
    return 0;
  }
  let pool: pg.Pool | undefined;
  try {
    const watchMode = args[2] === '--watch';
    const validWatch = watchMode && (args.length === 3 || (args.length === 5 && args[3] === '--poll-interval-ms'));
    if ((args.length !== 2 && !(args.length === 3 && ['--sync', '--redecode', '--project', '--sync-project'].includes(args[2]!)) && !validWatch)
        || args[0] !== '--config' || !args[1]) throw new IndexerError('INVALID_ARGUMENT', `Use ${USAGE} (or --help).`);
    const config = await loadConfig(args[1]);
    let intervalMs = 5000;
    if (watchMode) {
      if (config.toBlock !== 'latest') throw new IndexerError('INVALID_CONFIG', '--watch requires toBlock="latest".');
      const interval = args[4] ?? process.env.INDEXER_POLL_INTERVAL_MS ?? '5000';
      if (!/^[1-9][0-9]*$/.test(interval) || Number(interval) < 100 || Number(interval) > 60_000)
        throw new IndexerError('INVALID_CONFIG', 'INDEXER_POLL_INTERVAL_MS / --poll-interval-ms must be an integer in [100,60000].');
      intervalMs = Number(interval);
    }
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new IndexerError('INVALID_CONFIG', 'Set DATABASE_URL to the intended migrated PostgreSQL database.');
    pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000,
      ...(watchMode ? { statement_timeout: 10_000, query_timeout: 15_000, lock_timeout: 10_000 } : {}) });
    if (watchMode) return await watch(config, pool, intervalMs);
    if (args[2] === '--project') {
      const report = await project(config,new HttpRpc(config.rpcUrl),pool);
      process.stdout.write(JSON.stringify({ type: 'projection_result', ...report }) + '\n');
      return 0;
    }
    if (args[2]) {
      const storage = new PostgresStorage(pool);
      if (args[2] === '--redecode') {
        const processed = await storage.redecode(config);
        const issues = await storage.decodeIssues(config);
        process.stdout.write(JSON.stringify({ type: 'redecode_result', processed,
          processedMeaning: 'raw events re-decoded in this deployment (through H when a raw checkpoint exists), including unchanged rows', ...issues }) + '\n');
        return issues.decodeErrors + issues.unknownTopics ? 2 : 0;
      }
      const report = await sync(config, new HttpRpc(config.rpcUrl), storage,
        (batch) => process.stdout.write(JSON.stringify(batch) + '\n'));
      process.stdout.write(JSON.stringify({ type: 'sync_result', ...report }) + '\n');
      if (args[2] === '--sync-project') {
        const projection = await project(config,new HttpRpc(config.rpcUrl),pool);
        process.stdout.write(JSON.stringify({ type: 'projection_result', ...projection }) + '\n');
      }
      return report.decodeComplete ? 0 : 2;
    }
    const report = await scan(config, new HttpRpc(config.rpcUrl), new PostgresStorage(pool), (batch) => {
      process.stdout.write(JSON.stringify({ type: 'batch_committed', ...batch }) + '\n');
    });
    process.stdout.write(JSON.stringify({ type: 'scan_result', ...report }) + '\n');
    return report.status === 'completed' ? 0 : 2;
  } catch (error) {
    writeError(error);
    return 1;
  } finally { await pool?.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
