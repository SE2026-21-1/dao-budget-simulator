import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { AbiCoder, id, keccak256, toUtf8Bytes } from 'ethers';
import { createApiServer } from '../../indexer/api/server.ts';

const { Pool } = pg;
const secret = 'be05-local-test-secret-012345678901234567890123456789';
const chain = '31337';
const deploymentName = 'be05-http-integration';
const scopeParams = { chainId: chain, deploymentId: deploymentName };
const treasury = '0x1111111111111111111111111111111111111111';
const governor = '0x2222222222222222222222222222222222222222';
const timelock = '0x3333333333333333333333333333333333333333';
const bud = '0x4444444444444444444444444444444444444444';
const gov = '0x5555555555555555555555555555555555555555';
const zeroHash = `0x${'0'.repeat(64)}`;
const hash = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const recipient = (n) => `0x${BigInt(n).toString(16).padStart(40, '0')}`;
const largeWeight = '12345678901234567890123456789012345678901234567890';
const largeAmount = '1000000000000000000000000000000000000000000000000000000000000';
let pool;
let server;
let base;
let deploymentId;
let snapshotRevision;
let oldProposalCursor;
let proposalIds = [];
let businessBefore;
const coder = AbiCoder.defaultAbiCoder();

function databaseUrl() {
  assert.equal(process.env.BE05_TEST_ISOLATED, '1', 'Set BE05_TEST_ISOLATED=1 for a new disposable database only.');
  let url;
  try { url = new URL(process.env.BE05_TEST_DATABASE_URL); } catch { throw new Error('BE05_TEST_DATABASE_URL must be an explicit isolated PostgreSQL URL.'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'PostgreSQL must be loopback.');
  assert.match(url.pathname, /^\/tv4_be05_[a-z0-9_]+$/, 'Database must be a newly created tv4_be05_* database.');
  assert.ok(url.username && !url.search && !url.hash);
  return url.href;
}

async function rawEvent({ role, address, txIndex, logIndex, eventName, payload = {}, status = 'decoded', topics = [zeroHash], data = '0x' }) {
  const result = await pool.query(`INSERT INTO raw_events
      (deployment_id,chain_id,contract_role,contract_address,block_number,block_hash,transaction_hash,transaction_index,log_index,
       topics,data,removed,event_name,decoded_payload,rpc_log,decode_status,decode_error_code)
      VALUES ($1,$2,$3,$4,3,$5,$6,$7,$8,$9::evm_hash32[],$10,false,$11,$12::jsonb,'{}'::jsonb,$13,$14)
    RETURNING raw_event_id::text`, [deploymentId, chain, role, address, hash(3), hash(10_000 + txIndex), String(txIndex), String(logIndex),
    topics, data, status === 'decoded' ? eventName : null, status === 'decoded' ? JSON.stringify(payload) : null,
    status, status === 'unknown_topic' ? 'UNKNOWN_TOPIC' : null]);
  return result.rows[0].raw_event_id;
}

async function seed() {
  const dbName = (await pool.query('SELECT current_database() AS name')).rows[0].name;
  assert.match(dbName, /^tv4_be05_[a-z0-9_]+$/);
  const owner = await pool.query(`SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=current_database()`);
  assert.equal(owner.rows[0].owned, true, 'Test database must be owned by the connecting role.');
  const objects = await pool.query(`SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')::int AS relations,
    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public')::int AS types`);
  assert.deepEqual(objects.rows[0], { relations: 0, types: 0 }, 'Refusing a nonempty database.');
  for (const migration of ['001_initial.sql', '002_be03.sql', '003_be04.sql', '004_be05_api.sql', '005_be07.sql']) {
    await pool.query(await readFile(new URL(`../../database/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  const governance = { proposalThreshold: '50000000000000000000', govSupply: '1000000000000000000000',
    quorumNumerator: '20', quorumDenominator: '100', votingDelay: '60', votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp' };
  const dep = await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
      VALUES ($1,$2,1,'be05-test-v1',$3::jsonb,0) RETURNING deployment_id::text,snapshot_revision::text`,
    [chain, deploymentName, JSON.stringify(governance)]);
  deploymentId = dep.rows[0].deployment_id;
  snapshotRevision = dep.rows[0].snapshot_revision;
  await pool.query(`UPDATE deployments SET indexer_state=jsonb_build_object('phase','ready','lastCheckedAt',clock_timestamp(),'head','3','confirmed','3') WHERE deployment_id=$1`,[deploymentId]);
  const contracts = [
    ['governor', governor, 'oz-5.4.0-governor'], ['timelock', timelock, 'oz-5.4.0-timelock'],
    ['treasury', treasury, 'sc01-itreasury-v1'], ['budget_token', bud, 'oz-5.4.0-erc20'],
    ['governance_token', gov, 'sc02-governance-token-v1'],
  ];
  for (const [role, address, abi] of contracts) await pool.query(`INSERT INTO deployment_contracts
      (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version) VALUES ($1,$2,$3,$4,1,$5)`,
    [deploymentId, chain, role, address, abi]);
  for (let n = 1; n <= 3; n++) await pool.query(`INSERT INTO indexed_blocks
      (deployment_id,block_number,block_hash,parent_hash,block_timestamp) VALUES ($1,$2,$3,$4,$5)`,
    [deploymentId, String(n), hash(n), hash(n - 1), String(1098 + n)]);

  for (let i = 1; i <= 45; i++) {
    const txIndex = i;
    const description = i === 1 ? '  {"version":1,"title":"<script>✓ </script>","body":"body  text"} \n' :
      `{"version":1,"title":"Proposal ${i}","body":"Synthetic proposal body ${i}."}`;
    const descriptionHash = keccak256(toUtf8Bytes(description));
    const proposalId = BigInt(keccak256(coder.encode(['address[]','uint256[]','bytes[]','bytes32'],
      [[treasury], ['0'], ['0x1234'], descriptionHash]))).toString();
    proposalIds.push(proposalId);
    const created = await rawEvent({ role: 'governor', address: governor, txIndex, logIndex: i,
      eventName: 'ProposalCreated', payload: { proposalId: String(i) } });
    await pool.query(`INSERT INTO proposals
        (deployment_id,proposal_id,request_id,proposer,treasury_address,recipient,amount,description_bytes,description,description_hash,
         targets,native_values,calldatas,snapshot,deadline,created_event_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,ARRAY[$5::evm_address],ARRAY[0::numeric]::evm_uint256[],ARRAY['0x1234'::evm_hex_data],$11,$12,$13)`,
    [deploymentId, proposalId, zeroHash, recipient(100 + i), treasury, recipient(500 + i), largeAmount,
      Buffer.from(description), description, descriptionHash, i === 1 ? '1100' : '1101', '1400', created]);
    const state = i === 1 ? 'Active' : 'Pending';
    await pool.query(`INSERT INTO proposal_states(deployment_id,proposal_id,state,against_votes,for_votes,abstain_votes,quorum,operation_status)
      VALUES ($1,$2,$3,0,$4,0,$5,NULL)`, [deploymentId, proposalId, state, i === 1 ? largeWeight : '0', i === 1 ? '100000000000000000' : null]);
  }
  const voteEvent = await rawEvent({ role: 'governor', address: governor, txIndex: 1000, logIndex: 1000,
    eventName: 'VoteCastWithParams', payload: { proposalId: '1', support: '1' } });
  await pool.query(`INSERT INTO votes(deployment_id,proposal_id,voter,support,weight,reason,params,source_event_id)
    VALUES ($1,$2,$3,1,$4,$5,'0x1234',$6)`, [deploymentId, proposalIds[0], recipient(900), largeWeight, 'lý do nguyên văn', voteEvent]);
  for (const [i, support, weight] of [[1, 0, '7'], [2, 2, '13']]) {
    const eventId = await rawEvent({ role: 'governor', address: governor, txIndex: 1000 + i, logIndex: 1000 + i,
      eventName: 'VoteCast', payload: { proposalId: proposalIds[0], support: String(support) } });
    await pool.query(`INSERT INTO votes(deployment_id,proposal_id,voter,support,weight,reason,params,source_event_id)
      VALUES ($1,$2,$3,$4,$5,'','0x',$6)`, [deploymentId, proposalIds[0], recipient(900 + i), support, weight, eventId]);
  }
  await pool.query('UPDATE proposal_states SET against_votes=7,abstain_votes=13 WHERE deployment_id=$1 AND proposal_id=$2',
    [deploymentId, proposalIds[0]]);

  const transfers = [
    { from: recipient(700), to: treasury, amount: '1000000000000000000000' },
    { from: treasury, to: recipient(701), amount: '100000000000000000000' },
    { from: treasury, to: treasury, amount: '200000000000000000000' },
    { from: recipient(702), to: treasury, amount: '0' },
  ];
  for (let i = 0; i < transfers.length; i++) {
    const item = transfers[i];
    const eventId = await rawEvent({ role: 'budget_token', address: bud, txIndex: 3000 + i, logIndex: 3000 + i,
      eventName: 'Transfer', payload: { from: item.from, to: item.to, value: item.amount } });
    await pool.query(`INSERT INTO transfers(transfer_id,deployment_id,token_address,treasury_address,from_address,to_address,amount,source_event_id)
      OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7,$1)`, [eventId, deploymentId, bud, treasury, item.from, item.to, item.amount]);
  }
  const unrelatedEvent = await rawEvent({ role: 'budget_token', address: bud, txIndex: 3999, logIndex: 3999,
    eventName: 'Transfer', payload: { from: recipient(777), to: recipient(778), value: largeAmount } });
  assert.ok(unrelatedEvent, 'Raw ingestion may retain a BUD transfer unrelated to Treasury without projecting it as treasury flow.');
  const roleGranted = id('RoleGranted(bytes32,address,address)');
  await rawEvent({ role: 'treasury', address: treasury, txIndex: 4000, logIndex: 4000, eventName: null,
    status: 'unknown_topic', topics: [roleGranted, hash(77), hash(88), hash(99)], data: '0x' });

  const scopeHash = hash(333);
  await pool.query(`INSERT INTO checkpoints(deployment_id,block_number,block_hash,observed_head_block,confirmation_depth,source_scope,sync_status)
    VALUES ($1,3,$2,3,0,$3,'ready')`, [deploymentId, hash(3), scopeHash]);
  await pool.query(`INSERT INTO projection_checkpoints(deployment_id,block_number,block_hash,source_scope,snapshot_revision,ignored_ancillary_events)
    VALUES ($1,3,$2,$3,$4,1)`, [deploymentId, hash(3), scopeHash, snapshotRevision]);
}

function apiUrl(path, params = {}) {
  const search = new URLSearchParams({ ...scopeParams, ...params });
  return `${base}${path}?${search}`;
}
async function get(path, params = {}) {
  const response = await fetch(apiUrl(path, params));
  return { status: response.status, body: await response.json() };
}

before(async () => {
  pool = new Pool({ connectionString: databaseUrl(), max: 10, connectionTimeoutMillis: 2000,
    statement_timeout: 5000, query_timeout: 6000, application_name: 'be05-http-test' });
  await seed();
  businessBefore = {};
  for (const table of ['deployment_contracts','indexed_blocks','raw_events','proposals','proposal_states','votes','operations','transfers','disbursements','checkpoints','projection_checkpoints'])
    businessBefore[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE deployment_id=$1 ORDER BY to_jsonb(t)::text`, [deploymentId])).rows;
  server = createApiServer({ pool, cursorSecret: secret, snapshotTtlSeconds: 900 });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await pool?.end();
});

test('six endpoints, exact data types, validation, and financial semantics', async () => {
  const health = await get('/health');
  assert.equal(health.status, 200, JSON.stringify(health.body));
  assert.equal(health.body.data.database, 'up');
  assert.equal(health.body.data.publication, 'ready');
  assert.equal(health.body.data.rawDecodeComplete, false);
  assert.equal(health.body.data.rawDecodeIssues.unknownTopics, 1);
  assert.equal(health.body.data.ignoredAncillaryEvents, 1);

  const summary = await get('/summary');
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.context.dataKind, 'chain');
  assert.equal(summary.body.context.asOfBlock, '3');
  assert.ok(BigInt(summary.body.context.sync.lagSeconds) < 30n, 'BE07 reports elapsed time since the canonical RPC check.');
  assert.equal(summary.body.data.treasury.totalIn, '1000000000000000000000');
  assert.equal(summary.body.data.treasury.totalOut, '100000000000000000000');
  assert.equal(summary.body.data.treasury.balance, '900000000000000000000');
  assert.equal(summary.body.data.proposalCounts.total, 45);
  assert.equal(summary.body.data.recentActivity.length, 4);
  assert.equal(summary.body.data.recentActivity.find((x) => x.direction === 'self').amount, '200000000000000000000');

  const detail = await get(`/proposals/${proposalIds[0]}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.amount, largeAmount);
  assert.equal(detail.body.data.description, '  {"version":1,"title":"<script>✓ </script>","body":"body  text"} \n');
  assert.equal(detail.body.data.descriptionHash, keccak256(toUtf8Bytes(detail.body.data.description)));
  assert.equal(detail.body.data.title, '<script>✓ </script>');
  assert.equal(detail.body.data.votes.for, largeWeight);
  assert.equal(detail.body.data.votes.quorum, '100000000000000000');
  assert.equal((await get(`/proposals/${proposalIds[1]}`)).body.data.votes.quorum, null);

  const votePages = [await get(`/proposals/${proposalIds[0]}/votes`, { limit: '1' })];
  while (votePages.at(-1).body.pagination.nextCursor)
    votePages.push(await get(`/proposals/${proposalIds[0]}/votes`, { limit: '1', cursor: votePages.at(-1).body.pagination.nextCursor }));
  assert.ok(votePages.every((x) => x.status === 200));
  const allVotes = votePages.flatMap((x) => x.body.data);
  assert.equal(allVotes.length, 3);
  assert.ok(allVotes.every((x) => x.proposalId === proposalIds[0]));
  assert.equal(new Set(allVotes.map((x) => x.voter)).size, 3);
  assert.ok(votePages.every((x) => x.body.pagination.totalCount === 3));
  const summed = [0n, 0n, 0n];
  for (const vote of allVotes) summed[vote.support] += BigInt(vote.weight);
  assert.deepEqual(summed.map(String), [detail.body.data.votes.against, detail.body.data.votes.for, detail.body.data.votes.abstain]);
  assert.ok(allVotes.some((x) => x.weight === largeWeight && x.reason === 'lý do nguyên văn'));
  assert.ok(allVotes.every((x) => x.params === undefined));
  assert.equal((await get(`/proposals/${proposalIds[1]}/votes`, { limit: '1', cursor: votePages[0].body.pagination.nextCursor })).body.error.code,
    'CURSOR_CONTEXT_MISMATCH');
  const storedParams = await pool.query('SELECT params::text FROM votes WHERE deployment_id=$1 AND proposal_id=$2 AND voter=$3',
    [deploymentId, proposalIds[0], recipient(900)]);
  assert.equal(storedParams.rows[0].params, '0x1234', 'VoteCastWithParams remains available in PostgreSQL.');
  const noVotes = await get(`/proposals/${proposalIds[1]}/votes`);
  assert.equal(noVotes.status, 200);
  assert.deepEqual(noVotes.body.data, []);
  const transfers = await get('/treasury/transfers');
  assert.equal(transfers.status, 200);
  assert.equal(transfers.body.pagination.totalCount, 4);
  assert.ok(transfers.body.data.every((x) => x.from === treasury || x.to === treasury), 'Transfers unrelated to Treasury must not be published.');
  assert.ok(transfers.body.data.some((x) => x.amount === '0'));
  assert.ok(transfers.body.data.every((x) => x.proposalId === null && x.requestId === null));
  const out = await get('/treasury/transfers', { direction: 'out' });
  assert.equal(out.body.pagination.totalCount, 1);
  assert.equal(out.body.data[0].amount, '100000000000000000000');
  const transferPage1 = await get('/treasury/transfers', { limit: '2' });
  const transferPage2 = await get('/treasury/transfers', { limit: '2', cursor: transferPage1.body.pagination.nextCursor });
  assert.equal(transferPage1.body.pagination.totalCount, 4);
  assert.equal(transferPage2.body.pagination.totalCount, 4);
  assert.equal(transferPage1.body.data.length + transferPage2.body.data.length, 4);

  const malformed = await get('/proposals/01');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_PROPOSAL_ID');
  const overflow = await get('/proposals/115792089237316195423570985008687907853269984665640564039457584007913129639936');
  assert.equal(overflow.status, 400);
  const absent = await get('/proposals/999');
  assert.equal(absent.status, 404);
  assert.equal(absent.body.error.code, 'PROPOSAL_NOT_FOUND');
  assert.equal((await get('/proposals/999/votes')).status, 404);
  const emptyList = await get('/proposals', { proposalId: '999' });
  assert.equal(emptyList.status, 200);
  assert.deepEqual(emptyList.body.data, []);
  assert.equal(emptyList.body.pagination.totalCount, 0);
  assert.equal((await get('/proposals?state=Failed')).body.error.code, 'INVALID_ARGUMENT');
  assert.equal((await get('/summary?chainId=31337&chainId=31337&deploymentId=be05-http-integration')).status, 400);
  assert.equal((await get('/summary', { unsupported: '1' })).status, 400);
  await pool.query("UPDATE deployment_contracts SET abi_version='unverified' WHERE deployment_id=$1 AND contract_role='governance_token'", [deploymentId]);
  const metadataHealth = await get('/health');
  assert.equal(metadataHealth.status, 503);
  assert.equal(metadataHealth.body.data.database, 'up');
  assert.equal(metadataHealth.body.data.publication, 'not_ready');
  const metadataSummary = await get('/summary');
  assert.equal(metadataSummary.status, 503);
  assert.equal(metadataSummary.body.error.code, 'DATA_NOT_READY');
  await pool.query("UPDATE deployment_contracts SET abi_version='sc02-governance-token-v1' WHERE deployment_id=$1 AND contract_role='governance_token'", [deploymentId]);
  await pool.query("UPDATE deployment_contracts SET deployment_block=4 WHERE deployment_id=$1 AND contract_role='governance_token'", [deploymentId]);
  const futureMetadataHealth = await get('/health');
  assert.equal(futureMetadataHealth.status, 503);
  assert.equal(futureMetadataHealth.body.data.publication, 'not_ready');
  assert.equal((await get('/summary')).body.error.code, 'DATA_NOT_READY');
  await pool.query("UPDATE deployment_contracts SET deployment_block=1 WHERE deployment_id=$1 AND contract_role='governance_token'", [deploymentId]);
  for (const [table, expected] of Object.entries(businessBefore)) {
    const actual = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE deployment_id=$1 ORDER BY to_jsonb(t)::text`, [deploymentId])).rows;
    assert.deepEqual(actual, expected, `GET requests must not modify BE02–BE04 table ${table}.`);
  }
});

test('numeric keyset pages are complete, filters bind cursors, and old H survives publication progress', async () => {
  const first = await get('/proposals', { limit: '20' });
  assert.equal(first.status, 200);
  assert.equal(first.body.pagination.totalCount, 45);
  assert.equal(first.body.data.length, 20);
  assert.ok(first.body.pagination.nextCursor);
  oldProposalCursor = first.body.pagination.nextCursor;
  const firstIds = first.body.data.map((x) => x.proposalId);
  assert.equal(new Set(firstIds).size, 20);
  assert.deepEqual(firstIds, proposalIds.slice().reverse().slice(0, 20));
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const signed=first.body.pagination.nextCursor;
  const alias=signed.slice(0,-1)+alphabet[alphabet.indexOf(signed.at(-1))+1];
  assert.deepEqual(Buffer.from(alias.split('.')[1],'base64url'),Buffer.from(signed.split('.')[1],'base64url'));
  assert.equal((await get('/proposals',{limit:'20',cursor:alias})).body.error.code,'INVALID_CURSOR','noncanonical signature padding is rejected');
  const tampered = first.body.pagination.nextCursor.slice(0, -1) + (first.body.pagination.nextCursor.endsWith('A') ? 'B' : 'A');
  assert.equal((await get('/proposals', { limit: '20', cursor: tampered })).body.error.code, 'INVALID_CURSOR');
  assert.equal((await get('/proposals', { limit: '10', cursor: first.body.pagination.nextCursor })).body.error.code, 'CURSOR_CONTEXT_MISMATCH');
  assert.equal((await get('/proposals', { state: 'Pending', limit: '20', cursor: first.body.pagination.nextCursor })).body.error.code, 'CURSOR_CONTEXT_MISMATCH');
  assert.equal((await get('/treasury/transfers', { limit: '20', cursor: first.body.pagination.nextCursor })).body.error.code, 'CURSOR_CONTEXT_MISMATCH');
  const wrongScope = await fetch(`${base}/proposals?${new URLSearchParams({ chainId: '31337', deploymentId: 'other', limit: '20', cursor: first.body.pagination.nextCursor })}`);
  assert.equal((await wrongScope.json()).error.code, 'CURSOR_CONTEXT_MISMATCH');

  const pending1 = await get('/proposals', { state: 'Pending', limit: '20' });
  assert.equal(pending1.body.pagination.totalCount, 44);
  assert.equal(pending1.body.data.length, 20);
  const pending2 = await get('/proposals', { state: 'Pending', limit: '20', cursor: pending1.body.pagination.nextCursor });
  assert.equal(pending2.body.data.length, 20);
  assert.equal(pending2.body.pagination.totalCount, 44);

  const h3 = hash(3);
  await pool.query('INSERT INTO indexed_blocks(deployment_id,block_number,block_hash,parent_hash,block_timestamp) VALUES ($1,4,$2,$3,1102)', [deploymentId, hash(4), hash(3)]);
  await pool.query(`UPDATE checkpoints SET block_number=4,block_hash=$2,observed_head_block=4,updated_at=clock_timestamp() WHERE deployment_id=$1`, [deploymentId, hash(4)]);
  const rawAhead = await get('/summary');
  assert.equal(rawAhead.body.context.asOfBlock, '3');
  assert.equal(rawAhead.body.context.asOfBlockHash, h3);
  assert.equal(rawAhead.body.context.sync.indexedBlock, '4');
  const lagging = await get('/health');
  assert.equal(lagging.status, 200);
  assert.equal(lagging.body.data.status, 'degraded');
  assert.equal(lagging.body.data.indexer, 'synced');
  assert.equal(lagging.body.data.projectionStatus, 'lagging');
  assert.equal(lagging.body.data.projectionLagBlocks, '1');

  await pool.query(`UPDATE projection_checkpoints SET block_number=4,block_hash=$2 WHERE deployment_id=$1`, [deploymentId, hash(4)]);

  const secondCursor = first.body.pagination.nextCursor;
  const page2 = await get('/proposals', { limit: '20', cursor: secondCursor });
  assert.equal(page2.status, 200, JSON.stringify(page2.body));
  assert.equal(page2.body.context.asOfBlock, '3');
  assert.equal(page2.body.data.length, 20);
  assert.deepEqual(page2.body.data.map((x) => x.proposalId), proposalIds.slice().reverse().slice(20, 40));
  const page3 = await get('/proposals', { limit: '20', cursor: page2.body.pagination.nextCursor });
  assert.equal(page3.body.data.length, 5);
  assert.equal(page3.body.pagination.nextCursor, null);
  const allIds = [...firstIds, ...page2.body.data.map((x) => x.proposalId), ...page3.body.data.map((x) => x.proposalId)];
  assert.equal(new Set(allIds).size, 45);
  assert.equal(page2.body.pagination.totalCount, 45);

  const writer = await pool.connect();
  await writer.query('BEGIN');
  try {
    await writer.query('INSERT INTO indexed_blocks(deployment_id,block_number,block_hash,parent_hash,block_timestamp) VALUES ($1,5,$2,$3,1103)', [deploymentId, hash(5), hash(4)]);
    await writer.query(`UPDATE checkpoints SET block_number=5,block_hash=$2,observed_head_block=5,updated_at=clock_timestamp() WHERE deployment_id=$1`, [deploymentId, hash(5)]);
    await writer.query(`UPDATE proposal_states SET state='Canceled' WHERE deployment_id=$1 AND proposal_id=$2`, [deploymentId, proposalIds[44]]);
    await writer.query(`UPDATE projection_checkpoints SET block_number=5,block_hash=$2 WHERE deployment_id=$1`, [deploymentId, hash(5)]);
    const concurrentRead = await get('/summary');
    assert.equal(concurrentRead.status, 200);
    assert.equal(concurrentRead.body.context.asOfBlock, '4');
    assert.equal(concurrentRead.body.data.proposalCounts.byState.Pending, 44);
  } finally { await writer.query('COMMIT'); writer.release(); }
  const latest = await get('/summary');
  assert.equal(latest.body.context.asOfBlock, '5');
  assert.equal(latest.body.data.proposalCounts.byState.Canceled, 1);
  const oldPage = await get('/proposals', { limit: '20', cursor: secondCursor });
  assert.equal(oldPage.status, 200);
  assert.equal(oldPage.body.context.asOfBlock, '3');
  assert.equal(oldPage.body.data.length, 20);
  const pinned = await get('/summary', { asOfBlock: '3', asOfBlockHash: h3 });
  assert.equal(pinned.body.context.asOfBlock, '3');

  await pool.query('DELETE FROM api_read_snapshots WHERE deployment_id=$1 AND block_number=5', [deploymentId]);
  const futureEvent = await rawEvent({ role: 'budget_token', address: bud, txIndex: 5000, logIndex: 5000,
    eventName: 'Transfer', payload: { from: recipient(777), to: treasury, value: largeAmount } });
  try {
    await pool.query('INSERT INTO indexed_blocks(deployment_id,block_number,block_hash,parent_hash,block_timestamp) VALUES ($1,6,$2,$3,1104)',
      [deploymentId, hash(6), hash(5)]);
    await pool.query('UPDATE raw_events SET block_number=6,block_hash=$2 WHERE deployment_id=$1 AND raw_event_id=$3',
      [deploymentId, hash(6), futureEvent]);
    await pool.query(`INSERT INTO transfers(transfer_id,deployment_id,token_address,treasury_address,from_address,to_address,amount,source_event_id)
      OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7,$1)`,
      [futureEvent, deploymentId, bud, treasury, recipient(777), treasury, largeAmount]);
    const futureProjectionRow = await get('/summary');
    assert.equal(futureProjectionRow.status, 503);
    assert.equal(futureProjectionRow.body.error.code, 'DATA_NOT_READY');
    assert.equal(futureProjectionRow.body.error.details.reason, 'PROJECTION_AFTER_H');
  } finally {
    await pool.query('DELETE FROM transfers WHERE deployment_id=$1 AND source_event_id=$2', [deploymentId, futureEvent]);
    await pool.query('DELETE FROM raw_events WHERE deployment_id=$1 AND raw_event_id=$2', [deploymentId, futureEvent]);
    await pool.query('DELETE FROM indexed_blocks WHERE deployment_id=$1 AND block_number=6', [deploymentId]);
  }
});

test('BE07 gates every data endpoint and cached cursor in recovering/replaying/rebuild_required phases',async()=>{
  const initial=await get('/proposals',{limit:'1'});assert.equal(initial.status,200);
  const cursor=initial.body.pagination.nextCursor;assert.ok(cursor);
  const saved=(await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[deploymentId])).rows[0].indexer_state;
  try{
    for(const phase of ['recovering','replaying','rebuild_required']){
      await pool.query(`UPDATE deployments SET indexer_state=indexer_state || jsonb_build_object('phase',$2::text) WHERE deployment_id=$1`,[deploymentId,phase]);
      for(const path of ['/summary','/proposals',`/proposals/${proposalIds[0]}`,`/proposals/${proposalIds[0]}/votes`,'/treasury/transfers']){
        const denied=await get(path);assert.equal(denied.status,503,`${phase} ${path}`);assert.equal(denied.body.error.code,'DATA_NOT_READY');
      }
      const cached=await get('/proposals',{limit:'1',cursor});assert.equal(cached.status,409);assert.equal(cached.body.error.code,'SNAPSHOT_INVALIDATED');
      const health=await get('/health');assert.equal(health.status,503);assert.equal(health.body.data.recoveryStatus,phase);
    }
  }finally{await pool.query('UPDATE deployments SET indexer_state=$2::jsonb WHERE deployment_id=$1',[deploymentId,JSON.stringify(saved)]);}
});

test('filter totals, snapshot errors, unavailable publication, rebuild health, and database failure', async () => {
  const active = await get('/proposals', { state: 'Active', proposalId: proposalIds[0] });
  assert.equal(active.status, 200);
  assert.equal(active.body.pagination.totalCount, 1);
  const future = await get('/summary', { asOfBlock: '6', asOfBlockHash: hash(6) });
  assert.equal(future.status, 503);
  assert.equal(future.body.error.code, 'DATA_NOT_READY');
  const wrongCurrentHash = await get('/summary', { asOfBlock: '5', asOfBlockHash: hash(99) });
  assert.equal(wrongCurrentHash.status, 409, JSON.stringify(wrongCurrentHash.body));
  assert.equal(wrongCurrentHash.body.error.code, 'SNAPSHOT_INVALIDATED');
  const missingHistory = await get('/summary', { asOfBlock: '2', asOfBlockHash: hash(2) });
  assert.equal(missingHistory.status, 409);
  assert.equal(missingHistory.body.error.code, 'SNAPSHOT_UNAVAILABLE');
  const reorgedHistory = await get('/summary', { asOfBlock: '2', asOfBlockHash: hash(99) });
  assert.equal(reorgedHistory.status, 409);
  assert.equal(reorgedHistory.body.error.code, 'SNAPSHOT_INVALIDATED');
  const newRevision = (await pool.query('UPDATE deployments SET snapshot_revision=gen_random_uuid() WHERE deployment_id=$1 RETURNING snapshot_revision::text', [deploymentId])).rows[0].snapshot_revision;
  await pool.query('UPDATE projection_checkpoints SET snapshot_revision=$2 WHERE deployment_id=$1', [deploymentId, newRevision]);
  const invalidated = await get('/proposals', { limit: '20', cursor: oldProposalCursor });
  assert.equal(invalidated.status, 409);
  assert.equal(invalidated.body.error.code, 'SNAPSHOT_INVALIDATED');
  const h = await pool.query(`SELECT block_number::text,block_hash,observed_head_block::text FROM checkpoints WHERE deployment_id=$1`, [deploymentId]);
  await pool.query(`UPDATE checkpoints SET sync_status='rebuild_required' WHERE deployment_id=$1`, [deploymentId]);
  const rebuild = await get('/health');
  assert.equal(rebuild.status, 503);
  assert.equal(rebuild.body.data.publication, 'not_ready');
  await pool.query(`UPDATE checkpoints SET sync_status='ready' WHERE deployment_id=$1`, [deploymentId]);
  assert.equal((await get('/health')).status, 200);

  const unavailablePool = new Pool({ host: '127.0.0.1', port: 1, user: 'be05', database: 'missing', connectionTimeoutMillis: 300, max: 1 });
  const unavailableServer = createApiServer({ pool: unavailablePool, cursorSecret: secret });
  await new Promise((resolve, reject) => { unavailableServer.once('error', reject); unavailableServer.listen(0, '127.0.0.1', resolve); });
  const down = await fetch(`http://127.0.0.1:${unavailableServer.address().port}/api/health?${new URLSearchParams(scopeParams)}`);
  assert.equal(down.status, 503);
  assert.equal((await down.json()).data.database, 'down');
  await new Promise((resolve) => unavailableServer.close(resolve));
  await unavailablePool.end();

  const canonicalCursor = await get('/proposals', { limit: '20' });
  assert.equal(canonicalCursor.status, 200);
  const rawRows = await pool.connect();
  try {
    await rawRows.query('BEGIN');
    await rawRows.query('UPDATE projection_checkpoints SET block_number=4,block_hash=$2 WHERE deployment_id=$1', [deploymentId, hash(4)]);
    await rawRows.query('UPDATE checkpoints SET block_number=4,block_hash=$2,observed_head_block=4 WHERE deployment_id=$1', [deploymentId, hash(4)]);
    await rawRows.query('DELETE FROM indexed_blocks WHERE deployment_id=$1 AND block_number=5', [deploymentId]);
    await rawRows.query('COMMIT');
  } catch (error) { await rawRows.query('ROLLBACK'); throw error; }
  finally { rawRows.release(); }
  const reorgedCursor = await get('/proposals', { limit: '20', cursor: canonicalCursor.body.pagination.nextCursor });
  assert.equal(reorgedCursor.status, 409);
  assert.equal(reorgedCursor.body.error.code, 'SNAPSHOT_INVALIDATED');

  await pool.query('DELETE FROM projection_checkpoints WHERE deployment_id=$1', [deploymentId]);
  const noPublication = await get('/summary');
  assert.equal(noPublication.status, 503);
  assert.equal(noPublication.body.error.code, 'DATA_NOT_READY');
  assert.equal((await get('/health')).status, 503);
  assert.equal(h.rows[0].block_number, '5');
});
