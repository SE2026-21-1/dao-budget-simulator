import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assess } from '../../../scripts/be09-diagnose.mjs';
import { firstIndexedDeploymentBlock } from '../../../scripts/be09-register.mjs';

const manifest = { contracts: {
  GOV: { deploymentBlock: '1' }, BUD: { deploymentBlock: '2' }, Treasury: { deploymentBlock: '3' },
  Timelock: { deploymentBlock: '4' }, Governor: { deploymentBlock: '5' },
} };
const indexed = [['Governor', 'governor'], ['Timelock', 'timelock'], ['Treasury', 'treasury'], ['BUD', 'budget_token']];
const contracts = [
  { contract_role: 'governor', abi_version: 'oz-5.4.0-governor', deployment_block: '5' },
  { contract_role: 'timelock', abi_version: 'oz-5.4.0-timelock', deployment_block: '4' },
  { contract_role: 'treasury', abi_version: 'sc01-itreasury-v1', deployment_block: '3' },
  { contract_role: 'budget_token', abi_version: 'oz-5.4.0-erc20', deployment_block: '2' },
  { contract_role: 'governance_token', abi_version: 'sc02-governance-token-v1', deployment_block: '1' },
];
const runtime = { chainId: '31337', deploymentId: '1', deploymentName: 'demo' };
const config = { chainId: '31337', deploymentId: '1' };
const row = { deployment_id: '1', chain_id: '31337', deployment_name: 'demo', deployment_block: '1',
  deployment_revision: 'revision', projection_revision: 'revision', recovery_state: { phase: 'ready' },
  raw_h: '24', projection_h: '24', raw_head: '26', confirmation_depth: 2, sync_status: 'ready',
  raw_scope: 'scope', projection_scope: 'scope', projection_hash: 'hash', projection_timestamp: '1800000486',
  projection_header_count: '23', raw_header_count: '23', governance_config: { govSupply: '1000', proposalThreshold: '50',
    quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60', votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp' } };

test('registration uses first indexed source while retaining earlier governance-token metadata', () => {
  assert.equal(firstIndexedDeploymentBlock(manifest, indexed), '2');
  assert.equal(firstIndexedDeploymentBlock(manifest, [...indexed].reverse()), '2');
  const old = assess(row, contracts, config, runtime);
  assert.equal(old.projectionPrefix.status, 'FAIL');
  assert.equal(old.rawPrefix.status, 'FAIL');
  const fixed = assess({ ...row, deployment_block: firstIndexedDeploymentBlock(manifest, indexed) }, contracts, config, runtime);
  for (const [name, condition] of Object.entries(fixed)) {
    if (name === 'roles') for (const role of Object.values(condition)) assert.equal(role.status, 'PASS');
    else assert.equal(condition.status, 'PASS', name);
  }
  assert.equal(fixed.roles.governance_token.actual.deploymentBlock, '1');
});

test('diagnostic reports distinct metadata, source and header failures', () => {
  const bad = assess({ ...row, deployment_block: '2', projection_scope: 'wrong', projection_timestamp: null,
    governance_config: { ...row.governance_config, quorumDenominator: '0' } },
  contracts.map(item => item.contract_role === 'governor' ? { ...item, abi_version: 'wrong' } : item), config, runtime);
  assert.equal(bad.sourceScope.status, 'FAIL');
  assert.equal(bad.publicationHeader.status, 'FAIL');
  assert.equal(bad.governance.status, 'FAIL');
  assert.equal(bad.roles.governor.status, 'FAIL');
  assert.equal(bad.projectionPrefix.status, 'PASS');
});

test('registration CLI persists first indexed block and all five role records', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'be09-register-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const fakeContracts = Object.fromEntries(Object.entries(manifest.contracts).map(([name, item], i) => [name, {
    ...item, address: `0x${String(i + 1).padStart(40, '0')}`, abiVersion: 'version-1',
  }]));
  const m = { format: 'dao-budget-local-governance-v1', sourceCommit: commit, chainId: '31337', confirmations: '2',
    scanFromBlock: '1', contracts: fakeContracts, config: row.governance_config };
  const manifestPath = join(dir, 'manifest.json'), seedPath = join(dir, 'seed.json'), callsPath = join(dir, 'calls.jsonl');
  await writeFile(manifestPath, JSON.stringify(m));
  await writeFile(seedPath, JSON.stringify({ status: 'PASS', sourceCommit: commit, chainId: '31337', proposalId: '42' }));
  const shim = join(dir, 'loader.mjs');
  const pgModule = `import {appendFileSync} from 'node:fs';
    class Pool { async query(sql, params) { appendFileSync(process.env.BE09_TEST_CALLS, JSON.stringify({sql, params}) + '\\n');
      if (sql.startsWith('SELECT count')) return {rows:[{count:'0'}]};
      if (sql.includes('RETURNING deployment_id')) return {rows:[{deployment_id:'1'}]};
      return {rows:[]}; } async end() {} }
    export default {Pool};`;
  await writeFile(shim, `import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier, context, next) { if (specifier === 'pg') return {url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(pgModule)}), shortCircuit: true}; return next(specifier, context); }});`);
  const env = { ...process.env, BE09_DATABASE_URL: 'postgresql://example.invalid/test', BE09_TEST_CALLS: callsPath };
  delete env.NODE_TEST_CONTEXT;
  await promisify(execFile)(process.execPath, ['--import', shim, 'scripts/be09-register.mjs', '--manifest', manifestPath,
    '--runtime', dir, '--deployment-name', 'be09-local-20261106T103724Z-123456789abc', '--seed-report', seedPath], { env });
  const calls = (await readFile(callsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.find(call => call.sql.includes('INSERT INTO deployments')).params[2], '2');
  const roleCalls = calls.filter(call => call.sql.includes('INSERT INTO deployment_contracts'));
  assert.equal(roleCalls.length, 5);
  assert.equal(roleCalls.find(call => call.params[2] === 'governance_token').params[4], '1');
  const saved = JSON.parse(await readFile(join(dir, 'indexer-config.json'), 'utf8'));
  assert.equal(saved.fromBlock, '2');
  assert.deepEqual(saved.contracts.map(item => item.role).sort(), indexed.map(([, role]) => role).sort());
});
