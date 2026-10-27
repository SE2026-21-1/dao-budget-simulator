#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGovernanceRoles, createRpc } from './governance_local.mjs';

const usage = 'Usage: node scripts/check_roles.mjs --rpc <HTTP-RPC-URL> --manifest <manifest.json>\nRead-only verification against the current locked source/build; exits nonzero on any mismatch.';
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !['--rpc', '--manifest'].includes(args[0]) || !['--rpc', '--manifest'].includes(args[2]) || args[0] === args[2]) throw new Error(usage);
  const options = { [args[0]]: args[1], [args[2]]: args[3] };
  const manifestPath = resolve(options['--manifest']);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const report = await checkGovernanceRoles(createRpc(options['--rpc']), manifest, { root: fileURLToPath(new URL('../', import.meta.url)) });
  console.log(JSON.stringify({ manifest: manifestPath, ...report }, null, 2));
} catch (error) {
  console.error(`Role check failed: ${error.message}`);
  process.exitCode = 1;
}
