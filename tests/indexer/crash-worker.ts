// Only test harness imports this worker; production has no environment failpoints.
import pg from 'pg';
import { loadConfig } from '../../indexer/config.js';
import { HttpRpc } from '../../indexer/rpc.js';
import { PostgresStorage } from '../../indexer/storage.js';
import { sync } from '../../indexer/syncer.js';

const pool = new pg.Pool({ connectionString: process.env.BE03_TEST_DATABASE_URL });
// If the supervising test disappears, never leave an IPC barrier holding a DB lock.
process.on('disconnect', () => process.exit(1));
const point = process.argv[3]!;
const block = async () => {
  process.send?.({ point });
  await new Promise<void>((resolve) => process.once('message', () => resolve()));
};
try {
  const config = await loadConfig(process.argv[2]!);
  const storage = new PostgresStorage(pool, point === 'beforeCommit' ? { beforeCommit: block } : { afterCommit: block });
  const result = await sync(config, new HttpRpc(config.rpcUrl), storage,
    (b) => process.stdout.write(JSON.stringify(b) + '\n'));
  process.stdout.write(JSON.stringify(result) + '\n');
} finally { await pool.end(); process.disconnect?.(); }
