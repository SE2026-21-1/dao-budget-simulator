#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGovernanceRoles, createRpc, requireLoopbackRpc } from './governance_local.mjs';

const usage = 'Usage: node scripts/export_local_handoff.mjs --rpc http://127.0.0.1:8545 --manifest <manifest.json> --output <NEW-directory>\nRead-only local chain audit plus manifest/full compiler ABI export. Never overwrites an existing directory.';
let output;
let owned = false;
try {
  const args = process.argv.slice(2);
  const names = ['--rpc', '--manifest', '--output'];
  assert.ok(args.length === 6 && names.every(name => [args[0], args[2], args[4]].includes(name)), usage);
  const options = { [args[0]]: args[1], [args[2]]: args[3], [args[4]]: args[5] };
  requireLoopbackRpc(options['--rpc']);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const manifest = JSON.parse(await readFile(resolve(options['--manifest']), 'utf8'));
  const rpc = createRpc(options['--rpc']);
  const audit = await checkGovernanceRoles(rpc, manifest, { root });
  const abis = {};
  const abiHashes = {};
  for (const [name, provenance] of Object.entries(manifest.provenance.artifacts)) {
    const bytes = await readFile(join(root, provenance.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256, `${name}: artifact changed during export`);
    const artifact = JSON.parse(bytes);
    const abiHash = createHash('sha256').update(JSON.stringify(artifact.abi)).digest('hex');
    assert.equal(abiHash, provenance.abiSha256, `${name}: ABI differs from audited manifest`);
    abis[name] = artifact.abi;
    abiHashes[name] = abiHash;
  }
  const roles = { BUD: 'budget_token', Treasury: 'treasury', Timelock: 'timelock', Governor: 'governor' };
  const contracts = Object.entries(roles).map(([name, role]) => ({
    role, address: manifest.contracts[name].address.toLowerCase(),
    deploymentBlock: manifest.contracts[name].deploymentBlock, abiVersion: manifest.contracts[name].abiVersion,
  }));
  const finalBlock = await rpc('eth_getBlockByNumber', [`0x${BigInt(audit.height).toString(16)}`, false]);
  assert.equal(finalBlock.hash, audit.blockHash, 'Audited handoff block changed during export');
  const handoff = {
    format: 'dao-budget-local-handoff-v1', sourceCommit: manifest.sourceCommit,
    scope: 'Local audited deployment and full compiler ABI handoff, not testnet or UI/API acceptance. Receiver must use this running chain or redeploy and regenerate the bundle.',
    rpcUrl: options['--rpc'], chainId: manifest.chainId, instanceId: manifest.localChain.instanceId,
    asOfBlock: audit.height, asOfBlockHash: audit.blockHash, scanFromBlock: manifest.scanFromBlock,
    confirmationPolicy: { depth: manifest.confirmations, enforcedByBE02: false },
    accounts: manifest.accounts, config: manifest.config, contracts: manifest.contracts, abiHashes,
    be02: { contractsFile: 'be02-contracts.json', metadataOwner: 'TV2',
      scope: 'Four supported raw-log roles. TV2 must insert metadata into its chosen migrated database and use the actual returned deployment_id; this export does not invent one. GOV ABI is supplied but GOV events are not supported by the BE02 registry.' },
  };
  output = resolve(options['--output']);
  await mkdir(output, { mode: 0o700 });
  owned = true;
  await mkdir(join(output, 'abi'));
  for (const [name, abi] of Object.entries(abis)) {
    await writeFile(join(output, 'abi', `${name}.json`), JSON.stringify(abi, null, 2) + '\n', { flag: 'wx' });
  }
  for (const [name, value] of Object.entries({ 'manifest.json': manifest, 'role-audit.json': audit,
    'handoff.json': handoff, 'be02-contracts.json': contracts })) {
    await writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(`Audited local manifest, five compiler ABIs and four BE02 contract descriptors: ${output}`);
  console.log(`Chain 31337 at H=${audit.height}; keep the caller-owned Anvil running for consumers.`);
} catch (error) {
  if (owned) await rm(output, { recursive: true, force: true });
  console.error(`Local handoff export failed: ${error.message}`);
  process.exitCode = 1;
}
