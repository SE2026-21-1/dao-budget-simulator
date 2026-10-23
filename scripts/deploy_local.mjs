#!/usr/bin/env node
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRpc, deployGovernance, requireLoopbackRpc } from './governance_local.mjs';

const usage = 'Usage: node scripts/deploy_local.mjs --rpc http://127.0.0.1:8545 --output <manifest.json>\nRequires forge build, npm ci, and a NEW caller-owned, unforked Anvil chain 31337 with unlocked demo accounts.';
let outputHandle;
let output;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !['--rpc', '--output'].includes(args[0]) || !['--rpc', '--output'].includes(args[2]) || args[0] === args[2]) throw new Error(usage);
  const options = { [args[0]]: args[1], [args[2]]: args[3] };
  requireLoopbackRpc(options['--rpc']);
  output = resolve(options['--output']);
  // Refuse overwrites and missing output directories before making any chain changes.
  outputHandle = await open(output, 'wx', 0o600);
  const rpc = createRpc(options['--rpc']);
  const wallets = await rpc('eth_accounts');
  if (!Array.isArray(wallets) || wallets.length < 9) throw new Error('Anvil must expose at least nine unlocked demo accounts');
  const [A, B, C, D, funding, deployer, caller, recipient, outsider] = wallets;
  const { manifest } = await deployGovernance(rpc, {
    root: fileURLToPath(new URL('../', import.meta.url)), accounts: { A, B, C, D, funding, deployer, caller, recipient, outsider },
  });
  await outputHandle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`);
  await outputHandle.close();
  outputHandle = undefined;
  console.log(`Deployment manifest, receipts, source/compiler/ABI hashes and role evidence: ${output}`);
  console.log(`Validated chain 31337 at block ${manifest.roleCheck.height}; bootstrap roles removed before Treasury funding.`);
} catch (error) {
  if (outputHandle) {
    await outputHandle.close().catch(() => {});
    await unlink(output).catch(() => {});
  }
  console.error(`Local deployment failed: ${error.message}`);
  process.exitCode = 1;
}
