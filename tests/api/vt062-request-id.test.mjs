import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { AbiCoder, Interface, id, keccak256, toUtf8Bytes } from 'ethers';
import { createApiServer } from '../../indexer/api/server.ts';

const { Pool } = pg;
const chainId = '31337';
const deploymentName = 'vt062-mapper';
const treasury = '0x1111111111111111111111111111111111111111';
const governor = '0x2222222222222222222222222222222222222222';
const timelock = '0x3333333333333333333333333333333333333333';
const bud = '0x4444444444444444444444444444444444444444';
const gov = '0x5555555555555555555555555555555555555555';
const proposer = '0x6666666666666666666666666666666666666666';
const recipient = '0x7777777777777777777777777777777777777777';
const expectedRequestId = `0x${'ab'.repeat(32)}`;
const amount = '1250000000000000000';
const description = JSON.stringify({ version: 1, title: 'VT-062 request mapping', body: 'Independent API response mapping oracle.' });
const descriptionHash = keccak256(toUtf8Bytes(description));
const treasuryInterface = new Interface(['function disburse(bytes32,address,uint256)']);
const calldata = treasuryInterface.encodeFunctionData('disburse', [expectedRequestId, recipient, amount]);
const proposalId = BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(
  ['address[]', 'uint256[]', 'bytes[]', 'bytes32'], [[treasury], [0n], [calldata], descriptionHash],
))).toString();
const blockHash = `0x${'01'.repeat(32)}`;
const parentHash = `0x${'00'.repeat(32)}`;
const transactionHash = `0x${'02'.repeat(32)}`;
const sourceScope = `0x${'03'.repeat(32)}`;
const governance = {
  proposalThreshold: '50000000000000000000', govSupply: '1000000000000000000000',
  quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60',
  votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp',
};

assert.match(expectedRequestId, /^0x[0-9a-f]{64}$/);
assert.match(proposalId, /^(0|[1-9][0-9]*)$/);
assert.notEqual(expectedRequestId, proposalId);
assert.deepEqual(treasuryInterface.decodeFunctionData('disburse', calldata).map(String), [expectedRequestId, recipient, amount]);

function isolatedDatabaseUrl() {
  assert.equal(process.env.VT062_TEST_ISOLATED, '1');
  const url = new URL(process.env.VT062_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/tv4_be05_vt062');
  assert.equal(url.username, 'vt062_test');
  assert.equal(url.password, '');
  assert.equal(url.search, '');
  return url.href;
}

let pool;
let server;
let base;
let deploymentId;

before(async () => {
  pool = new Pool({ connectionString: isolatedDatabaseUrl(), max: 4, connectionTimeoutMillis: 3000,
    statement_timeout: 8000, query_timeout: 10000, application_name: 'vt062-request-id-test' });
  const db = (await pool.query('SELECT current_database() AS name, pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=current_database()')).rows[0];
  assert.deepEqual(db, { name: 'tv4_be05_vt062', owned: true });
  const objects = (await pool.query(`SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS relations,
    (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS types`)).rows[0];
  assert.deepEqual(objects, { relations: 0, types: 0 }, 'Refuse a nonempty database');
  for (const name of ['001_initial.sql', '002_be03.sql', '003_be04.sql', '004_be05_api.sql', '005_be07.sql']) {
    await pool.query(await readFile(new URL(`../../database/migrations/${name}`, import.meta.url), 'utf8'));
  }

  const dep = await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
    VALUES ($1,$2,1,'vt062-test-v1',$3::jsonb,0) RETURNING deployment_id::text,snapshot_revision::text`,
  [chainId, deploymentName, JSON.stringify(governance)]);
  deploymentId = dep.rows[0].deployment_id;
  const revision = dep.rows[0].snapshot_revision;
  await pool.query(`UPDATE deployments SET indexer_state=jsonb_build_object('phase','ready','lastCheckedAt',clock_timestamp(),'head','1','confirmed','1') WHERE deployment_id=$1`, [deploymentId]);
  for (const [role, address, abi] of [
    ['governor', governor, 'oz-5.4.0-governor'], ['timelock', timelock, 'oz-5.4.0-timelock'],
    ['treasury', treasury, 'sc01-itreasury-v1'], ['budget_token', bud, 'oz-5.4.0-erc20'],
    ['governance_token', gov, 'sc02-governance-token-v1'],
  ]) {
    await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
      VALUES ($1,$2,$3,$4,1,$5)`, [deploymentId, chainId, role, address, abi]);
  }
  await pool.query(`INSERT INTO indexed_blocks(deployment_id,block_number,block_hash,parent_hash,block_timestamp)
    VALUES ($1,1,$2,$3,1000)`, [deploymentId, blockHash, parentHash]);
  const event = await pool.query(`INSERT INTO raw_events
    (deployment_id,chain_id,contract_role,contract_address,block_number,block_hash,transaction_hash,
     transaction_index,log_index,topics,data,removed,event_name,decoded_payload,rpc_log,decode_status)
    VALUES ($1,$2,'governor',$3,1,$4,$5,0,0,ARRAY[$6::evm_hash32],'0x',false,'ProposalCreated',$7::jsonb,'{}'::jsonb,'decoded')
    RETURNING raw_event_id::text`, [deploymentId, chainId, governor, blockHash, transactionHash,
    id('ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)'), JSON.stringify({ proposalId })]);
  await pool.query(`INSERT INTO proposals
    (deployment_id,proposal_id,request_id,proposer,treasury_address,recipient,amount,description_bytes,
     description,description_hash,targets,native_values,calldatas,snapshot,deadline,created_event_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ARRAY[$5::evm_address],ARRAY[0::numeric]::evm_uint256[],
            ARRAY[$11::evm_hex_data],1100,1400,$12)`,
  [deploymentId, proposalId, expectedRequestId, proposer, treasury, recipient, amount,
    Buffer.from(description), description, descriptionHash, calldata, event.rows[0].raw_event_id]);
  await pool.query(`INSERT INTO proposal_states
    (deployment_id,proposal_id,state,against_votes,for_votes,abstain_votes,quorum)
    VALUES ($1,$2,'Pending',0,0,0,NULL)`, [deploymentId, proposalId]);
  await pool.query(`INSERT INTO checkpoints
    (deployment_id,block_number,block_hash,observed_head_block,confirmation_depth,source_scope,sync_status)
    VALUES ($1,1,$2,1,0,$3,'ready')`, [deploymentId, blockHash, sourceScope]);
  await pool.query(`INSERT INTO projection_checkpoints
    (deployment_id,block_number,block_hash,source_scope,snapshot_revision,ignored_ancillary_events)
    VALUES ($1,1,$2,$3,$4,0)`, [deploymentId, blockHash, sourceScope, revision]);
  server = createApiServer({ pool, cursorSecret: 'vt062-local-test-secret-01234567890123456789', snapshotTtlSeconds: 900 });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await pool?.end();
});

test('VT-062 API response maps requestId from request_id in a fresh published PostgreSQL snapshot', async () => {
  const beforeSnapshot = await pool.query('SELECT count(*)::int AS n FROM api_read_snapshots');
  assert.equal(beforeSnapshot.rows[0].n, 0, 'Each run must materialize through the current source mapper');
  const scope = new URLSearchParams({ chainId, deploymentId: deploymentName });
  const listResponse = await fetch(`${base}/proposals?${scope}`);
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200, JSON.stringify(list.error));
  assert.equal(list.context.dataKind, 'chain');
  assert.equal(list.context.asOfBlock, '1');
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].proposalId, proposalId);
  assert.equal(list.data[0].requestId, expectedRequestId, 'list requestId must come from fixture request_id');

  const detailResponse = await fetch(`${base}/proposals/${proposalId}?${scope}`);
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200, JSON.stringify(detail.error));
  assert.equal(detail.data.proposalId, proposalId);
  assert.equal(detail.data.requestId, expectedRequestId, 'detail requestId must come from fixture request_id');
  assert.equal(detail.data.calldatas[0], calldata.toLowerCase());
  assert.equal(detail.data.descriptionHash, descriptionHash.toLowerCase());

  const afterSnapshot = await pool.query(`SELECT count(*)::int AS n FROM api_read_snapshots WHERE deployment_id=$1`, [deploymentId]);
  assert.equal(afterSnapshot.rows[0].n, 1, 'The list request must create exactly one fresh serving snapshot');
});
