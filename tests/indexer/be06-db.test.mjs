import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { Interface } from 'ethers';
import { parseBe06Manifest } from '../../indexer/be06/manifest.ts';
import { compareDatabases, exportNormalizedDatabase } from '../../indexer/be06/compare.ts';
import { assertEmptyDatabase, rebuildDatabase } from '../../indexer/be06/rebuild.ts';
import { readFile } from 'node:fs/promises';
import { scopeHash } from '../../indexer/scope.ts';

const { Pool } = pg;
const H = 10n;
const BASE_TIME = 1_800_000_000n;
const blockHash = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const addresses = {
  treasury: '0x1111111111111111111111111111111111111111',
  governor: '0x2222222222222222222222222222222222222222',
  timelock: '0x3333333333333333333333333333333333333333',
  budget_token: '0x4444444444444444444444444444444444444444',
  gov: '0x5555555555555555555555555555555555555555',
};
const abi = new Interface([
  'function CLOCK_MODE() view returns (string)', 'function clock() view returns (uint48)',
  'function token() view returns (address)', 'function treasury() view returns (address)', 'function timelock() view returns (address)',
  'function proposalThreshold() view returns (uint256)', 'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)', 'function quorumNumerator() view returns (uint256)',
  'function quorumDenominator() view returns (uint256)', 'function budgetToken() view returns (address)',
  'function getMinDelay() view returns (uint256)', 'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)', 'function state(uint256) view returns (uint8)',
  'function quorum(uint256) view returns (uint256)',
  'function proposalVotes(uint256) view returns (uint256,uint256,uint256)',
  'function getTimestamp(bytes32) view returns (uint256)',
]);

function sourceManifest() {
  return {
    format: 'dao-budget-be06-manifest-v1', sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    chainId: '31337', scanFromBlock: '1', confirmations: 2, batchSize: '5',
    contracts: [
      { role: 'governor', address: addresses.governor, deploymentBlock: '1', abiVersion: 'oz-5.4.0-governor' },
      { role: 'timelock', address: addresses.timelock, deploymentBlock: '1', abiVersion: 'oz-5.4.0-timelock' },
      { role: 'treasury', address: addresses.treasury, deploymentBlock: '1', abiVersion: 'sc01-itreasury-v1' },
      { role: 'budget_token', address: addresses.budget_token, deploymentBlock: '1', abiVersion: 'oz-5.4.0-erc20' },
    { role: 'governance_token', address: addresses.gov, deploymentBlock: '1', abiVersion: 'sc02-governance-token-v1' },
    ],
  };
}

class ChainRpc {
  head = 12n;
  governanceToken = addresses.gov;
  calls = [];
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_blockNumber') return `0x${this.head.toString(16)}`;
    if (method === 'eth_getBlockByNumber') {
      const number = BigInt(params[0]);
      return { number: `0x${number.toString(16)}`, hash: blockHash(number), parentHash: blockHash(number - 1n),
        timestamp: `0x${(BASE_TIME + number).toString(16)}`, transactions: [] };
    }
    if (method === 'eth_getLogs') return [];
    if (method === 'eth_getCode') return '0x60006000';
    if (method === 'eth_call') {
      const tx = params[0];
      const parsed = abi.parseTransaction({ data: tx.data });
      assert.ok(parsed, `unexpected calldata ${tx.data}`);
      const result = {
        CLOCK_MODE: ['mode=timestamp'], clock: [BASE_TIME + H], token: [this.governanceToken],
        treasury: [addresses.treasury], timelock: [addresses.timelock],
        proposalThreshold: [50n], votingDelay: [60n], votingPeriod: [300n],
        quorumNumerator: [20n], quorumDenominator: [100n], budgetToken: [addresses.budget_token],
        getMinDelay: [120n], totalSupply: [2_000n], balanceOf: [0n], state: [0n], quorum: [200n],
        proposalVotes: [0n, 0n, 0n], getTimestamp: [0n],
      }[parsed.name];
      return abi.encodeFunctionResult(parsed.fragment, result);
    }
    throw new Error(`unexpected RPC method ${method}`);
  }
}

let referencePool;
let targetPool;
let manifest;
let rpc;
let refDeploymentId;

function databaseUrl(name) {
  const raw = process.env[name];
  assert.ok(raw, `Set ${name} to a disposable PostgreSQL database.`);
  const url = new URL(raw);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  return url;
}

async function migrate(pool) {
  for (const file of ['001_initial.sql', '002_be03.sql', '003_be04.sql']) {
    await pool.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), 'utf8'));
  }
}

async function seedReference() {
  await referencePool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
    VALUES (31338,'internal-id-offset',1,'test','{}',2)`);
  const governance = {
    proposalThreshold: '50', quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60',
    votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp', govSupply: '2000', budSupply: '2000', treasurySeed: 'ignore-me',
  };
  const inserted = await referencePool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth,created_at)
    VALUES (31337,'reference-deployment',1,'test',$1::jsonb,2,'2000-01-01T00:00:00Z') RETURNING deployment_id::text,snapshot_revision::text`,
  [JSON.stringify(governance)]);
  refDeploymentId = inserted.rows[0].deployment_id;
  const config = { ...manifest.config, deploymentId: refDeploymentId };
  for (const contract of config.contracts) {
    await referencePool.query(`INSERT INTO deployment_contracts
      (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
      VALUES ($1,31337,$2,$3,$4,$5)`, [refDeploymentId, contract.role, contract.address, '1', contract.abiVersion]);
  }
  for (let n = 1n; n <= H; n += 1n) {
    await referencePool.query(`INSERT INTO indexed_blocks(deployment_id,block_number,block_hash,parent_hash,block_timestamp)
      VALUES ($1,$2,$3,$4,$5)`, [refDeploymentId, n.toString(), blockHash(n), blockHash(n - 1n), (BASE_TIME + n).toString()]);
  }
  const scope = scopeHash(config);
  await referencePool.query(`INSERT INTO checkpoints(deployment_id,block_number,block_hash,observed_head_block,confirmation_depth,source_scope,sync_status)
    VALUES ($1,$2,$3,12,2,$4,'ready')`, [refDeploymentId, H.toString(), blockHash(H), scope]);
  await referencePool.query(`INSERT INTO projection_checkpoints(deployment_id,block_number,block_hash,source_scope,snapshot_revision,ignored_ancillary_events,published_at)
    VALUES ($1,$2,$3,$4,$5,0,'2000-01-01T00:00:00Z')`,
  [refDeploymentId, H.toString(), blockHash(H), scope, inserted.rows[0].snapshot_revision]);
}

before(async () => {
  assert.equal(process.env.BE06_TEST_ISOLATED, '1', 'Use two newly created BE06 test databases only.');
  referencePool = new Pool({ connectionString: databaseUrl('BE06_TEST_REFERENCE_DATABASE_URL').href, max: 5 });
  targetPool = new Pool({ connectionString: databaseUrl('BE06_TEST_TARGET_DATABASE_URL').href, max: 5 });
  for (const pool of [referencePool, targetPool]) {
    const objects = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'`);
    assert.equal(objects.rows[0].n, 0, 'Both BE06 test databases must start empty.');
  }
  await migrate(referencePool);
  manifest = parseBe06Manifest(sourceManifest(), 'http://127.0.0.1:8545', H.toString());
  rpc = new ChainRpc();
  await seedReference();
});

after(async () => {
  await Promise.all([referencePool?.end(), targetPool?.end()]);
});

test('BE06 rebuilds a fresh DB exactly at H, exports/compares read-only, and rejects unsafe scopes', async () => {
  // K=2 is enforced before the first target write; a failed confirmation check leaves it empty.
  rpc.head = 11n;
  await assert.rejects(rebuildDatabase({ manifest, atBlock: H.toString(), rpc, referencePool, targetPool }),
    (error) => error.code === 'BE06_BLOCK_UNCONFIRMED');
  await assertEmptyDatabase(targetPool);

  rpc.head = 12n;
  rpc.governanceToken = addresses.governor;
  await assert.rejects(rebuildDatabase({ manifest, atBlock: H.toString(), rpc, referencePool, targetPool }),
    (error) => error.code === 'BE06_CONTRACT_LINK_MISMATCH');
  await assertEmptyDatabase(targetPool);
  rpc.governanceToken = addresses.gov;

  rpc.head = 12n;
  const built = await rebuildDatabase({ manifest, atBlock: H.toString(), rpc, referencePool, targetPool });
  assert.equal(built.rawCheckpoint.block, H.toString());
  assert.equal(built.rawCheckpoint.hash, blockHash(H));
  assert.equal(built.projection.context.asOfBlock, H.toString());
  assert.equal(built.projection.context.asOfBlockHash, blockHash(H));
  assert.equal(built.decodeWarnings.complete, true);
  assert.equal((await targetPool.query('SELECT count(*)::int AS n FROM indexed_blocks WHERE block_number>10')).rows[0].n, 0);

  const reference = await exportNormalizedDatabase(referencePool, manifest.config, H.toString());
  const rebuilt = await exportNormalizedDatabase(targetPool, manifest.config, H.toString());
  assert.notEqual(refDeploymentId, built.target.deploymentId);
  assert.deepEqual(reference, rebuilt, 'different deployment IDs, revisions, and ingest/publication times normalize away');
  assert.equal('deploymentId' in reference.context, false);
  assert.equal('snapshotRevision' in reference.context, false);
  assert.deepEqual(reference.governanceConfig, {
    proposalThreshold: '50', quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60',
    votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp', govSupply: '2000', budSupply: '2000',
  });

  const equal = await compareDatabases({ referencePool, rebuildPool: targetPool, config: manifest.config,
    atBlock: H.toString(), rpc });
  assert.equal(equal.result, 'equal');
  assert.deepEqual(equal.mismatches, []);
  assert.equal(equal.chainCrossCheck.reference, 'PASS');
  assert.equal(equal.chainCrossCheck.rebuild, 'PASS');

  // Data corruption is reported with exact normalized field values, not hidden by the rebuild.
  await targetPool.query(`UPDATE deployments SET governance_config=jsonb_set(governance_config,'{govSupply}','"999"') WHERE deployment_id=$1`,
    [built.target.deploymentId]);
  const changed = await compareDatabases({ referencePool, rebuildPool: targetPool, config: manifest.config,
    atBlock: H.toString(), rpc });
  assert.equal(changed.result, 'mismatch');
  assert.ok(changed.mismatches.some((item) => item.path === 'governanceConfig.govSupply'
    && item.reference === '2000' && item.rebuild === '999'));
  await targetPool.query(`UPDATE deployments SET governance_config=jsonb_set(governance_config,'{govSupply}','"2000"') WHERE deployment_id=$1`,
    [built.target.deploymentId]);

  const wrongH = await compareDatabases({ referencePool, rebuildPool: targetPool, config: manifest.config,
    atBlock: '9', rpc });
  assert.equal(wrongH.result, 'mismatch');
  assert.ok(wrongH.mismatches.some((item) => item.path === 'reference'
    && item.rebuild.code === 'BE06_REFERENCE_H_MISMATCH'));

  // A different configured scope cannot be mistaken for the reference deployment.
  await targetPool.query(`UPDATE deployment_contracts SET contract_address=$2 WHERE deployment_id=$1 AND contract_role='treasury'`,
    [built.target.deploymentId, '0x6666666666666666666666666666666666666666']);
  const wrongScope = await compareDatabases({ referencePool, rebuildPool: targetPool, config: manifest.config,
    atBlock: H.toString(), rpc });
  assert.equal(wrongScope.result, 'mismatch');
  assert.ok(wrongScope.mismatches.some((item) => item.path === 'rebuild' && item.rebuild.code === 'BE06_SCOPE_MISMATCH'));

  await assert.rejects(rebuildDatabase({ manifest, atBlock: H.toString(), rpc,
    referencePool: targetPool, targetPool }), (error) => error.code === 'BE06_DATABASE_COLLISION');
  await targetPool.query('CREATE TABLE be06_nonempty_guard(id integer)');
  await assert.rejects(rebuildDatabase({ manifest, atBlock: H.toString(), rpc, referencePool, targetPool }),
    (error) => error.code === 'BE06_TARGET_NOT_EMPTY');
  assert.equal((await targetPool.query("SELECT to_regclass('public.be06_nonempty_guard') IS NOT NULL AS kept")).rows[0].kept, true);
});
