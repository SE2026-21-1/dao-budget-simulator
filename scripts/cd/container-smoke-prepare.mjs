import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseBe06Manifest } from '../../indexer/be06/manifest.ts';
import { migrationFingerprint, repository } from './release.mjs';

const directory = process.argv[2];
assert.ok(directory, 'Owned temporary smoke directory is required');
const manifest = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
assert.equal(manifest.chainId, '31337');
const { config, governanceToken } = parseBe06Manifest(manifest, 'http://anvil:8545', manifest.roleCheck.height, '1');
const serializable = JSON.parse(JSON.stringify({ ...config, toBlock: 'latest', confirmations: 0 },
  (_key, value) => typeof value === 'bigint' ? value.toString() : value));
await writeFile(join(directory, 'indexer.json'), JSON.stringify(serializable), { mode: 0o644 });
const keys = { governor: 'Governor', timelock: 'Timelock', treasury: 'Treasury', budget_token: 'BUD' };
const frontend = { VITE_API_BASE_URL: '/backend', VITE_CHAIN_ID: '31337', VITE_DEPLOYMENT_ID: 'container-smoke',
  VITE_CHAIN_NAME: 'Smoke </script> " \\ \u2028', VITE_DATA_SOURCE: 'live',
  VITE_GOV_TOKEN_ADDRESS: governanceToken.address,
  ...Object.fromEntries(Object.entries(keys).map(([role, key]) => [
    { governor: 'VITE_GOVERNOR_ADDRESS', timelock: 'VITE_TIMELOCK_ADDRESS', treasury: 'VITE_TREASURY_ADDRESS', budget_token: 'VITE_BUD_TOKEN_ADDRESS' }[role],
    manifest.contracts[key].address,
  ])),
};
await writeFile(join(directory, 'frontend.json'), JSON.stringify(frontend), { mode: 0o644 });
// Test-only manifest input for the migration/preflight helpers. No registry
// publication or release provenance is claimed by this disposable smoke.
await writeFile(join(directory, 'manifest.json'), JSON.stringify({
  schemaVersion: 1, repository, sha: '0'.repeat(40), runId: '1',
  migrationSet: await migrationFingerprint(),
  images: Object.fromEntries(['frontend', 'api', 'indexer'].map(service =>
    [service, `ghcr.io/${repository.toLowerCase()}/${service}@sha256:${'0'.repeat(64)}`])),
}), { mode: 0o644 });
const sql = value => "'" + String(value).replaceAll("'", "''") + "'";
const statements = [
  'BEGIN;',
  `INSERT INTO deployments (deployment_id,chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
   VALUES (1,31337,'container-smoke',${sql(config.fromBlock)},'container-smoke-v1',${sql(JSON.stringify(manifest.config))}::jsonb,0);`,
  ...[...config.contracts, { role: 'governance_token', ...governanceToken }].map(contract =>
    `INSERT INTO deployment_contracts (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
     VALUES (1,31337,${sql(contract.role)},${sql(contract.address)},${sql(contract.deploymentBlock)},${sql(contract.abiVersion)});`),
  'COMMIT;',
];
await writeFile(join(directory, 'metadata.sql'), statements.join('\n'), { mode: 0o600 });
