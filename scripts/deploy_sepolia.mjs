#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRpc } from './governance_local.mjs';
import { SEPOLIA, deploySepolia, keystoreSigners, requireSepolia, validateRoleMap } from './governance_sepolia.mjs';
import { journal, options } from './sepolia_cli.mjs';

try {
  const args = options(process.argv.slice(2), ['--accounts', '--keystores', '--output', '--approve-chain',
    '--approve-source', '--max-fee-wei', '--max-total-cost-wei']);
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(args['--approve-chain'], SEPOLIA.chainId, 'Explicit Sepolia broadcast permission required');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(args['--approve-source'], source, 'Approve exact source HEAD');
  execFileSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root });
  const roleMap = JSON.parse(await readFile(args['--accounts'], 'utf8'));
  const accounts = validateRoleMap(roleMap, source);
  const rpc = createRpc(SEPOLIA.rpc);
  await requireSepolia(rpc);
  const persist = await journal(args['--output']);
  await persist({ status: 'PREPARING_SIGNERS_NO_BROADCAST', sourceCommit: source, network: SEPOLIA });
  const sign = await keystoreSigners(JSON.parse(await readFile(args['--keystores'], 'utf8')), accounts);
  const manifest = await deploySepolia(rpc, { root, roleMap, persist,
    maxFeePerGas: args['--max-fee-wei'], maxTotalCost: args['--max-total-cost-wei'],
    transmit: async transaction => rpc('eth_sendRawTransaction', [await sign(transaction)]) });
  console.log(JSON.stringify({ status: manifest.status, sourceCommit: source, manifest: args['--output'],
    notice: 'Deployment only; no Executed/Defeated or wallet/API/UI acceptance claimed' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL_STOP', error: error.message,
    recovery: 'Preserve journal and chain. Never rerun blindly: pending/successful transactions may exist. Review with signer owner.' }));
  process.exitCode = 1;
}
