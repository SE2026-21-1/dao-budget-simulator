// Source verification guard checks through the real deploy helper, with RPC preflight
// synthetic and eth_sendTransaction intercepted. This sends no real transactions.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployGovernance } from '../../../scripts/governance_local.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = fileURLToPath(new URL('./provenance-guards.json', import.meta.url));
const temp = await mkdtemp(join(root, 'dist/be03-source-guards-'));
const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider']
  .map((name, index) => [name, '0x' + (index + 1).toString(16).padStart(40, '0')]));
const files = new Set(['foundry.toml', 'foundry.lock', 'package-lock.json', 'scripts/governance_local.mjs', 'scripts/deploy_local.mjs', 'scripts/check_roles.mjs']);
for (const name of ['GovernanceToken', 'BudgetToken', 'Treasury', 'TimelockController', 'BudgetGovernor']) {
  const path = `out/${name}.sol/${name}.json`; files.add(path);
  for (const source of Object.keys(JSON.parse(await readFile(join(root, path), 'utf8')).metadata.sources)) files.add(source);
}
const report = { classification: 'Synthetic RPC preflight, real repository deployment source verification; zero real transactions', cases: [] };
let sends = 0;
const rpc = async (method) => {
  if (method === 'eth_sendTransaction') { sends++; throw new Error('VERIFIED_PROJECT_NO_REAL_SEND'); }
  if (method === 'eth_chainId') return '0x7a69';
  if (method === 'web3_clientVersion') return 'anvil/source-guard';
  if (method === 'anvil_metadata') return { forkedNetwork: null, instanceId: 'source-guard' };
  if (method === 'eth_blockNumber' || method === 'eth_getTransactionCount') return '0x0';
  if (method === 'eth_getBlockByNumber') return { transactions: [], hash: '0x' + '00'.repeat(32) };
  if (method === 'eth_accounts') return Object.values(accounts);
  if (method === 'eth_getCode') return '0x';
  throw new Error(`Unexpected preflight method ${method}`);
};
try {
  for (const file of files) { await mkdir(dirname(join(temp, file)), { recursive: true }); await writeFile(join(temp, file), await readFile(join(root, file))); }
  const path = 'contracts/GovernanceToken.sol', original = await readFile(join(temp, path));
  const cases = [
    ['original CRLF checkout accepted', original, true],
    ['same source LF accepted', Buffer.from(original.toString().replaceAll('\r\n', '\n')), true],
    ['changed Solidity identifier rejected', Buffer.from(original.toString().replace('contract GovernanceToken', 'contract GovernanceTokenChanged')), false],
    ['extra source comment rejected', Buffer.concat([original, Buffer.from('\n// provenance mutation\n')]), false],
  ];
  for (const [label, bytes, valid] of cases) {
    sends = 0; await writeFile(join(temp, path), bytes);
    let error;
    try { await deployGovernance(rpc, { root: temp, accounts }); } catch (e) { error = e; }
    assert.ok(error);
    if (valid) { assert.equal(error.message, 'VERIFIED_PROJECT_NO_REAL_SEND'); assert.equal(sends, 1); }
    else { assert.match(error.message, /GOV: stale artifact or changed source contracts\/GovernanceToken.sol/); assert.equal(sends, 0); }
    report.cases.push({ label, status: 'PASS', interceptedSendAttempts: sends, error: error.message });
  }
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await rm(temp, { recursive: true, force: true }); report.temporaryCopyRemoved = true; await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
