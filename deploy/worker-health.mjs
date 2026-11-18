import { loadConfig } from '../dist/indexer/config.js';
import { connect, requireThat, safeFailure } from './common.mjs';

// Read-only readiness: a recent canonical check plus a published raw checkpoint.
// This proves neither future RPC availability nor business/event completeness.
let client;
try {
  const config = await loadConfig('/run/dao/indexer.json');
  client = await connect();
  const result = await client.query(`SELECT d.indexer_state,
    c.block_number::text AS raw_height, p.block_number::text AS published_height
    FROM deployments d
    LEFT JOIN checkpoints c USING (deployment_id)
    LEFT JOIN projection_checkpoints p USING (deployment_id)
    WHERE d.deployment_id=$1 AND d.chain_id=$2`, [config.deploymentId, config.chainId.toString()]);
  const row = result.rows[0];
  const checked = Date.parse(row?.indexer_state?.lastCheckedAt);
  const age = Date.now() - checked;
  requireThat(row?.indexer_state?.phase === 'ready' && Number.isFinite(age) && age >= -5000 && age <= 30000,
    'Worker has no recent ready canonical heartbeat (30 seconds).');
  requireThat(row.raw_height != null && row.published_height === row.raw_height,
    'Worker raw checkpoint has not been published.');
} catch (error) { safeFailure('Worker readiness')(error); }
finally { await client?.end(); }
