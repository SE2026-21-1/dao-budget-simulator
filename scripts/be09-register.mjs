#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
export function firstIndexedDeploymentBlock(manifest, indexedContracts) {
  return indexedContracts.reduce((first, [key]) => {
    const block = BigInt(manifest.contracts[key].deploymentBlock);
    return block < first ? block : first;
  }, BigInt(manifest.contracts[indexedContracts[0][0]].deploymentBlock)).toString();
}
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args.indexOf(name, index + 1) >= 0) throw new Error(`Missing or duplicate ${name}`);
  return args[index + 1];
}

async function main() {
  assert.equal(args.length, 8, 'Usage: be09-register.mjs --manifest <path> --runtime <path> --deployment-name <name> --seed-report <path>');
  const manifestPath = resolve(option('--manifest'));
  const runtimeDir = resolve(option('--runtime'));
  const deploymentName = option('--deployment-name');
  const seedPath = resolve(option('--seed-report'));
  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  assert.match(deploymentName, /^be09-local-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/, 'Deployment name must be generated for this local run');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const commit = (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(manifest.format, 'dao-budget-local-governance-v1');
  assert.equal(manifest.sourceCommit, commit);
  assert.equal(commit, '681289bb1f11db87bdfcb15c6b28d1d995229835');
  assert.equal(manifest.chainId, '31337');
  assert.equal(manifest.confirmations, '2', 'Manifest confirmation policy must be K=2');
  assert.equal(seed.status, 'PASS', 'Only a successful real-chain governance seed may be registered');
  assert.equal(seed.sourceCommit, commit);
  assert.equal(seed.chainId, manifest.chainId);
  assert.match(seed.proposalId ?? '', /^(0|[1-9][0-9]*)$/);
  assert.ok(/^(0|[1-9][0-9]*)$/.test(manifest.scanFromBlock));
  const contracts = [
    ['Governor', 'governor'], ['Timelock', 'timelock'], ['Treasury', 'treasury'], ['BUD', 'budget_token'], ['GOV', 'governance_token'],
  ];
  for (const [key] of contracts) {
    assert.match(manifest.contracts?.[key]?.address ?? '', /^0x[0-9a-fA-F]{40}$/);
    assert.match(manifest.contracts[key].abiVersion ?? '', /^[a-z0-9.-]+$/);
    assert.ok(BigInt(manifest.contracts[key].deploymentBlock) >= 0n);
  }
  // GOV metadata is required by the API, but GOV is not an indexed source.
  // The read model's retained header prefix starts at the earliest indexed source.
  const indexedContracts = contracts.filter(([, role]) => role !== 'governance_token');
  const firstIndexedBlock = firstIndexedDeploymentBlock(manifest, indexedContracts);
  for (const field of ['govSupply', 'proposalThreshold', 'quorumNumerator', 'quorumDenominator', 'votingDelay', 'votingPeriod', 'minDelay']) {
    assert.match(manifest.config?.[field] ?? '', /^(0|[1-9][0-9]*)$/);
  }
  assert.equal(manifest.config.clockMode, 'mode=timestamp');
  const connectionString = process.env.BE09_DATABASE_URL;
  if (!connectionString) throw new Error('BE09_DATABASE_URL is required from the isolated local setup.');
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  let deploymentId;
  try {
    const count = await pool.query('SELECT count(*)::text AS count FROM deployments');
    assert.equal(count.rows[0].count, '0', 'Refusing to register into a database that already contains a deployment');
    await pool.query('BEGIN');
    const inserted = await pool.query(`INSERT INTO deployments
      (chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
      VALUES ($1,$2,$3,$4,$5::jsonb,2) RETURNING deployment_id::text`,
    ['31337', deploymentName, firstIndexedBlock, 'dao-budget-local-governance-v1', JSON.stringify(manifest.config)]);
    deploymentId = inserted.rows[0].deployment_id;
    for (const [key, role] of contracts) {
      const item = manifest.contracts[key];
      await pool.query(`INSERT INTO deployment_contracts
        (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
        VALUES ($1,$2,$3,$4,$5,$6)`, [deploymentId, '31337', role, item.address.toLowerCase(), item.deploymentBlock, item.abiVersion]);
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await pool.end(); }

  const runtime = {
    format: 'dao-budget-be09-runtime-v1', sourceCommit: commit, chainId: '31337', deploymentName,
    deploymentId: String(deploymentId), manifest: manifestPath, runtimeDir,
    urls: { rpc: 'http://127.0.0.1:18545', api: 'http://127.0.0.1:3300', frontend: 'http://127.0.0.1:5173' },
    proposalId: seed.proposalId, seedReport: seedPath,
    indexerConfig: resolve(runtimeDir, 'indexer-config.json'), workerEnv: resolve(runtimeDir, 'worker.env'),
  };
  await writeFile(resolve(runtimeDir, 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const secret = randomBytes(32).toString('hex');
  const runtimeEnv = [
    `DATABASE_URL=postgresql://be09@127.0.0.1:55432/dao_budget_be09`,
    `API_CURSOR_SECRET=${secret}`, `API_HOST=127.0.0.1`, `API_PORT=3300`,
    `API_CORS_ORIGINS=http://127.0.0.1:5173`, `API_SNAPSHOT_TTL_SECONDS=900`,
    `RPC_URL=http://127.0.0.1:18545`, `DEPLOYMENT_NAME=${deploymentName}`,
    `BE05_LIVE_API_URL=http://127.0.0.1:3300`, `BE05_LIVE_CHAIN_ID=31337`,
    `BE05_LIVE_DEPLOYMENT_ID=${deploymentName}`, `BE05_LIVE_RPC_URL=http://127.0.0.1:18545`,
  ].join('\n') + '\n';
  await writeFile(resolve(runtimeDir, 'runtime.env'), runtimeEnv, { flag: 'wx', mode: 0o600 });
  await chmod(resolve(runtimeDir, 'runtime.env'), 0o600);
  await writeFile(resolve(runtimeDir, 'worker.env'), [
    'DATABASE_URL=postgresql://be09@127.0.0.1:55432/dao_budget_be09',
    'RPC_URL=http://127.0.0.1:18545',
  ].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  const indexerConfig = {
    rpcUrl: 'http://127.0.0.1:18545', chainId: '31337', deploymentId: String(deploymentId),
    fromBlock: firstIndexedBlock, toBlock: 'latest', batchSize: '100', confirmations: 2,
    contracts: indexedContracts.map(([key, role]) => ({
      role, address: manifest.contracts[key].address, deploymentBlock: manifest.contracts[key].deploymentBlock,
      abiVersion: manifest.contracts[key].abiVersion,
    })),
    reorgWindow: 128, pollIntervalMs: 1000,
  };
  await writeFile(resolve(runtimeDir, 'indexer-config.json'), `${JSON.stringify(indexerConfig, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const frontendEnv = [
    `VITE_API_BASE_URL=http://127.0.0.1:3300`, `VITE_DEPLOYMENT_ID=${deploymentName}`,
    'VITE_CHAIN_ID=31337', 'VITE_CHAIN_NAME=Local Anvil', 'VITE_RPC_URL=http://127.0.0.1:18545',
    `VITE_GOVERNOR_ADDRESS=${manifest.contracts.Governor.address}`,
    `VITE_TIMELOCK_ADDRESS=${manifest.contracts.Timelock.address}`,
    `VITE_TREASURY_ADDRESS=${manifest.contracts.Treasury.address}`,
    `VITE_GOV_TOKEN_ADDRESS=${manifest.contracts.GOV.address}`,
    `VITE_BUD_TOKEN_ADDRESS=${manifest.contracts.BUD.address}`,
    `DAO_VITE_CACHE_DIR=${resolve(runtimeDir, 'cache/vite')}`,
  ].join('\n') + '\n';
  await mkdir(resolve(runtimeDir, 'cache/vite'), { recursive: true, mode: 0o700 });
  await writeFile(resolve(runtimeDir, 'frontend.env'), frontendEnv, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'PASS', deploymentName, deploymentId: String(deploymentId), sourceCommit: commit }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(`BE09 registration failed: ${error.message}`); process.exitCode = 1; });
