#!/usr/bin/env node
// Public, read-only capability probe. This command cannot sign or broadcast.
import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONFIG, createRpc, loadProject } from './governance_local.mjs';
import { SEPOLIA, requireSepolia } from './governance_sepolia.mjs';

const RPC = SEPOLIA.rpc;
const CHAIN_ID = BigInt(SEPOLIA.chainId);
const CONFIRMATIONS = BigInt(SEPOLIA.confirmations);
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--output',
  'Usage: node scripts/check_sepolia_readonly.mjs --output <new-report.json> (requires forge build)');
const output = await open(args[1], 'wx', 0o600);
const report = { format: 'dao-budget-sepolia-readonly-v1', status: 'FAIL',
  startedAt: new Date().toISOString(), rpc: RPC, chainId: String(CHAIN_ID),
  confirmations: Number(CONFIRMATIONS), broadcasts: 0, broadcastAuthorized: false,
  scope: 'Public Sepolia RPC capability and local compiler provenance only; not deployment, role audit, gas-budget or testnet acceptance.' };
try {
  assert.equal(process.versions.node, '24.15.0', 'Use the pinned Node 24.15.0');
  const project = await loadProject(fileURLToPath(new URL('../', import.meta.url)));
  report.provenance = project.provenance;
  report.governance = CONFIG;
  const rpc = createRpc(RPC);
  await requireSepolia(rpc);
  const head = BigInt(await rpc('eth_blockNumber'));
  assert.ok(head >= CONFIRMATIONS, 'Insufficient chain height');
  const height = `0x${(head - CONFIRMATIONS).toString(16)}`;
  const block = await rpc('eth_getBlockByNumber', [height, false]);
  assert.equal(BigInt(block.number), head - CONFIRMATIONS);
  assert.match(block.hash, /^0x[0-9a-f]{64}$/i);
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  // CLZ(1)=255 exercises the Osaka opcode in a read-only creation eth_call.
  const clz = await rpc('eth_call', [{ data: '0x60011e60005260206000f3' }, height]);
  assert.equal(BigInt(clz), 255n, 'RPC does not execute the Osaka CLZ probe');
  assert.equal((await rpc('eth_getBlockByNumber', [height, false])).hash, block.hash,
    'Pinned block changed during probe');
  await requireSepolia(rpc);
  report.chain = { observedHead: String(head), height: String(BigInt(height)), hash: block.hash,
    timestamp: String(BigInt(block.timestamp)), genesisHash: genesis.hash, clzResult: '255' };
  report.status = 'READ_ONLY_PREFLIGHT_PASS';
  report.remainingGates = [
    'Owner-approved exact deployment revision and nine distinct public role addresses',
    'Six dedicated secure signer custodians, exclusive use, signer path and explicit broadcast authorization',
    'Actual-address gas estimates, native balances, per-transaction fee caps and total gas budget',
    'Independent delta review of the recreated clean shared remote deployment and role-audit helpers',
    'Canonical deployment manifest, runtime/roles/history audit and real-time Executed/Defeated receipts',
  ];
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await output.writeFile(`${JSON.stringify(report, null, 2)}\n`);
  await output.close();
}
console.log(JSON.stringify({ status: report.status, broadcasts: report.broadcasts, output: args[1] }));
