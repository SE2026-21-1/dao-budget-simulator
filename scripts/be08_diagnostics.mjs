// Observational BE08 evidence only: a separate read-only connection, never the
// worker/API transaction pool. Sampling cannot change acceptance thresholds.
import pg from 'pg';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

export function startDiagnostics(dbUrl, deploymentId, workerPid, state) {
  const pool = new pg.Pool({ connectionString: String(dbUrl), max: 1,
    application_name: 'be08-diagnostics', connectionTimeoutMillis: 2000, statement_timeout: 2000 });
  state.diagnostics = { intervalMs: 1000, samples: [], errors: [],
    scope: 'Read-only sampled own-database activity/locks/publication and Linux host/process counters; absence of sampled waits does not prove absence of all contention.' };
  let pending, stopped = false;
  pool.on('error', error => state.diagnostics.errors.push(error.message));
  async function sample() {
    const started = performance.now();
    const result = { at: new Date().toISOString(), monotonicMs: started,
      loadAverage: os.loadavg(), freeMemoryBytes: os.freemem(), processCpu: process.cpuUsage(), processResource: process.resourceUsage() };
    try {
      [result.hostCpu, result.hostMemory, result.workerStat] = await Promise.all([
        readFile('/proc/stat', 'utf8'), readFile('/proc/meminfo', 'utf8'), readFile(`/proc/${workerPid}/stat`, 'utf8')]);
      result.database = (await pool.query(`SELECT
        (SELECT row_to_json(p) FROM (SELECT block_number::text AS h, block_hash AS hash FROM projection_checkpoints WHERE deployment_id=$1) p) AS publication,
        (SELECT json_agg(a) FROM (SELECT pid, application_name, state, wait_event_type, wait_event,
          extract(epoch FROM (clock_timestamp()-query_start))*1000 AS query_age_ms,
          extract(epoch FROM (clock_timestamp()-xact_start))*1000 AS transaction_age_ms,
          pg_blocking_pids(pid) AS blockers, left(query,1000) AS query
          FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) a) AS activity,
        (SELECT json_agg(l) FROM (SELECT pid,locktype,mode,granted,relation::regclass::text AS relation
          FROM pg_locks WHERE pid IN (SELECT pid FROM pg_stat_activity WHERE datname=current_database()) AND NOT granted) l) AS waiting_locks`, [deploymentId])).rows[0];
    } catch (error) { result.error = error.message; state.diagnostics.errors.push(error.message); }
    result.durationMs = performance.now() - started;
    state.diagnostics.samples.push(result);
  }
  function tick() { if (!stopped && !pending) pending = sample().finally(() => { pending = null; }); }
  const timer = setInterval(tick, 1000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await pending; await pool.end(); };
}
