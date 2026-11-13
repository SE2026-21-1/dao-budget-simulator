#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRpc } from './governance_local.mjs';
import { SEPOLIA, checkSepoliaRoles } from './governance_sepolia.mjs';
import { options } from './sepolia_cli.mjs';

try {
  const args = options(process.argv.slice(2), ['--manifest']);
  const manifest = JSON.parse(await readFile(args['--manifest'], 'utf8'));
  assert.equal(manifest.mode, 'SEPOLIA', 'A fork report is not a Sepolia deployment');
  assert.equal(manifest.status, 'DEPLOYED_K2', 'Incomplete deployment journal is not acceptance');
  const report = await checkSepoliaRoles(createRpc(SEPOLIA.rpc), manifest,
    { root: fileURLToPath(new URL('../', import.meta.url)) });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', error: error.message, audit: error.audit ?? null }));
  process.exitCode = 1;
}
