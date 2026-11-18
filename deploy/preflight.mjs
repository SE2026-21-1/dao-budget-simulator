import { readFile } from 'node:fs/promises';
import { loadConfig } from '../dist/indexer/config.js';
import { verifyMetadata } from '../dist/indexer/storage.js';
import { connect, isMain, lock, migrationFiles, option, readManifest, requireThat, safeFailure, trackedSchema } from './common.mjs';

export async function runtimeConfig(client) {
  const config = await loadConfig(process.env.INDEXER_CONFIG ?? '/run/dao/indexer.json');
  requireThat(!/REPLACE_WITH|CHANGE_ME|CHANGEME/i.test(config.rpcUrl), 'Replace the example RPC endpoint before deployment.');
  requireThat(config.toBlock === 'latest', 'Continuous worker requires toBlock=latest.');
  requireThat(config.contracts.length === 4, 'Deployment requires all four supported contract roles.');
  const deployment = (await client.query('SELECT deployment_name FROM deployments WHERE deployment_id=$1', [config.deploymentId])).rows[0];
  requireThat(deployment && process.env.CHAIN_ID === config.chainId.toString() && process.env.DEPLOYMENT_ID === deployment.deployment_name, 'Public CHAIN_ID/DEPLOYMENT_ID must match the verified deployment chain/name (not its numeric SQL ID).');
  requireThat(Buffer.byteLength(process.env.API_CURSOR_SECRET ?? '') >= 32, 'API_CURSOR_SECRET must contain at least 32 bytes.');
  const frontend = JSON.parse(await readFile(process.env.FRONTEND_CONFIG ?? '/run/dao/frontend.json', 'utf8'));
  requireThat(typeof frontend.VITE_CHAIN_ID === 'string' && frontend.VITE_CHAIN_ID === config.chainId.toString() && config.chainId <= BigInt(Number.MAX_SAFE_INTEGER) && frontend.VITE_DEPLOYMENT_ID === deployment.deployment_name, 'Frontend chain/deployment name must match verified database metadata.');
  requireThat(Object.values(frontend).every((value) => typeof value === 'string'), 'Frontend public configuration values must all be strings.');
  requireThat(frontend.VITE_DATA_SOURCE !== 'fixture' && typeof frontend.VITE_API_BASE_URL === 'string', 'Frontend must use a live API, never fixtures.');
  for (const key of ['VITE_API_BASE_URL', 'VITE_RPC_URL', 'VITE_EXPLORER_URL']) {
    const value = frontend[key];
    if (!value || (key === 'VITE_API_BASE_URL' && value === '/backend')) continue;
    let url;
    try { url = new URL(value); } catch { requireThat(false, 'Frontend public URL is invalid.'); }
    requireThat(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Frontend public URLs must be HTTP(S) and contain no credentials.');
  }
  requireThat(frontend.VITE_API_BASE_URL.length > 0, 'Frontend API base URL cannot be empty.');
  for (const [key, role] of [['VITE_GOVERNOR_ADDRESS', 'governor'], ['VITE_TREASURY_ADDRESS', 'treasury'], ['VITE_BUD_TOKEN_ADDRESS', 'budget_token'], ['VITE_TIMELOCK_ADDRESS', 'timelock']]) {
    if (frontend[key]) requireThat(frontend[key].toLowerCase() === config.contracts.find((c) => c.role === role).address, 'Frontend contract address differs from verified indexer metadata.');
  }
  if (frontend.VITE_GOV_TOKEN_ADDRESS) {
    const token = (await client.query("SELECT contract_address FROM deployment_contracts WHERE deployment_id=$1 AND contract_role='governance_token'", [config.deploymentId])).rows[0];
    requireThat(token?.contract_address === frontend.VITE_GOV_TOKEN_ADDRESS.toLowerCase(), 'Frontend governance token differs from verified database metadata.');
  }
  await client.query('BEGIN READ ONLY');
  try { await verifyMetadata(client, config, true); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  const rpc = async (method, params) => {
    const response = await fetch(config.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000) });
    requireThat(response.ok, 'RPC preflight returned a non-success HTTP status.');
    const body = await response.json();
    requireThat(!body.error && body.result !== undefined, 'RPC preflight returned a JSON-RPC error.');
    return body.result;
  };
  const chain = await rpc('eth_chainId', []);
  requireThat(typeof chain === 'string' && /^0x[0-9a-fA-F]+$/.test(chain) && BigInt(chain) === config.chainId, 'RPC chainId does not match verified configuration.');
  const addresses = new Set(config.contracts.map((c) => c.address));
  if (frontend.VITE_GOV_TOKEN_ADDRESS) addresses.add(frontend.VITE_GOV_TOKEN_ADDRESS.toLowerCase());
  for (const address of addresses) {
    const code = await rpc('eth_getCode', [address, 'latest']);
    requireThat(typeof code === 'string' && /^0x(?:[a-fA-F0-9]{2})+$/.test(code) && !/^0x(?:00)+$/.test(code), 'A configured contract has no deployed RPC bytecode.');
  }
  return config;
}
export async function preflight(client, manifestPath) {
  const manifest = await readManifest(manifestPath);
  const migrations = await migrationFiles();
  requireThat(migrations.fingerprint === manifest.migrationSet, 'Image migration fingerprint does not match the release manifest.');
  const schema = await trackedSchema(client, migrations.files);
  const config = await runtimeConfig(client);
  return { manifest, schema: schema.fingerprint, config };
}
if (isMain(import.meta.url)) {
  const client = await connect().catch(safeFailure('Database connection'));
  if (client) try {
    await lock(client);
    if (process.argv.includes('--metadata-only')) { await runtimeConfig(client); console.log('Metadata, configuration and RPC preflight passed (not a deployment schema approval).'); }
    else { const checked = await preflight(client, option('--manifest', '/run/release/manifest.json')); console.log(`Preflight passed: schema ${checked.schema}`); }
  } catch (error) { safeFailure('Preflight')(error); }
  finally { await client.end(); }
}
