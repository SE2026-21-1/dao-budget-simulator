import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { parseConfig } from '../indexer/config.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { PostgresStorage } from '../indexer/storage.ts';
import { sync } from '../indexer/syncer.ts';
import { project } from '../indexer/projection/projector.ts';
import { createApiServer } from '../indexer/api/server.ts';
import { assertEmptyDatabase } from '../indexer/be06/rebuild.ts';

// One caller-owned, empty database per branch; never delete or reset a schema.
export async function checkRequestApi({ row, rpcUrl, rpc, root }) {
  assert.equal(process.env.TV4_TC10_ISOLATED, '1');
  const urls = JSON.parse(process.env.TV4_TC10_DATABASE_URLS ?? '[]');
  assert.equal(urls.length, 4);
  assert.equal(new Set(urls).size, 4);
  const index = (row.requestKind === 'zero' ? 2 : 0) + row.winner - 1;
  for (const value of urls) {
    const url = new URL(value);
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(/^\/tv4_tc10_[a-z0-9_]+$/.test(url.pathname));
    assert.ok(!url.search && !url.hash);
  }
  const pool = new pg.Pool({ connectionString: urls[index], max: 3 });
  let api;
  try {
    await assertEmptyDatabase(pool);
    const identity = (await pool.query(`SELECT current_database() AS database,current_user AS role,pg_get_userbyid(datdba) AS owner,version() FROM pg_database WHERE datname=current_database()`)).rows[0];
    assert.equal(identity.role, identity.owner, 'Database must be owned by the selected role');
    for (const migration of ['001_initial', '002_be03', '003_be04', '004_be05_api', '005_be07'])
      await pool.query(await readFile(`${root}/database/migrations/${migration}.sql`, 'utf8'));
    const keys = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
    const start = Object.values(keys).map(k => BigInt(row.manifest.contracts[k].deploymentBlock)).reduce((a,b) => a < b ? a : b);
    const name = `tc10-${row.requestKind}-p${row.winner}`;
    const d = (await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config) VALUES(31337,$1,$2,'tc10-live',$3::jsonb) RETURNING deployment_id::text`, [name, String(start), JSON.stringify(row.manifest.config)])).rows[0].deployment_id;
    const contracts = Object.entries(keys).map(([role,key]) => ({ role, address: row.manifest.contracts[key].address.toLowerCase(), deploymentBlock: row.manifest.contracts[key].deploymentBlock, abiVersion: row.manifest.contracts[key].abiVersion }));
    for (const [role,key] of Object.entries({ ...keys, governance_token: 'GOV' })) {
      const c = row.manifest.contracts[key];
      await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version) VALUES($1,31337,$2,$3,$4,$5)`, [d,role,c.address.toLowerCase(),c.deploymentBlock,c.abiVersion]);
    }
    const config = parseConfig({ rpcUrl, chainId: '31337', deploymentId: d, fromBlock: String(start), toBlock: row.head.number, batchSize: '7', confirmations: 2, contracts }, {});
    await rpc('anvil_mine', ['0x2', '0x0']);
    const transport = new HttpRpc(rpcUrl);
    const raw = await sync(config, transport, new PostgresStorage(pool));
    assert.equal(raw.checkpoint.hash, row.head.hash);
    const projection = await project(config, transport, pool);
    api = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 900 });
    await new Promise((done,reject) => { api.once('error',reject); api.listen(0,'127.0.0.1',done); });
    const responses = {};
    const get = async (label,path,extra={}) => {
      const query = new URLSearchParams({ chainId: '31337', deploymentId: name, asOfBlock: row.head.number, asOfBlockHash: row.head.hash, ...extra });
      const response = await fetch(`http://127.0.0.1:${api.address().port}/api${path}?${query}`);
      const body = await response.json();
      responses[label] = { status: response.status, body };
      assert.equal(response.status,200,JSON.stringify(body));
      for (const key of ['asOfBlock','asOfBlockHash','snapshotRevision']) assert.equal(body.context[key],projection.context[key]);
      return body;
    };
    const summary = await get('summary','/summary');
    assert.equal(summary.data.treasury.balance,String(row.expectedBalances[0]));
    assert.equal(String(summary.data.proposalCounts.total),'2');
    for (let i=0;i<2;i++) {
      const proposal = row.proposals[i];
      const detail = await get(`P${i+1}detail`,`/proposals/${proposal.id}`);
      const votes = await get(`P${i+1}votes`,`/proposals/${proposal.id}/votes`);
      assert.equal(votes.data.length,2);
      assert.equal(detail.data.votes.for,String(700n*10n**18n));
      assert.equal(detail.data.requestId,row.requestId);
      assert.equal(detail.data.state,i===row.winner-1?'Executed':'Queued');
      assert.equal(detail.data.operation.status,i===row.winner-1?'Done':'Ready');
      assert.equal(detail.data.operation.eta,String(proposal.eta));
      assert.equal(detail.data.transactions.executed,i===row.winner-1?row.receipts.find(r=>r.label.startsWith('Winner')).transactionHash:null);
    }
    const transfers = await get('outgoing','/treasury/transfers',{direction:'out'});
    assert.equal(transfers.pagination.totalCount,1);
    assert.equal(transfers.data.length,1);
    const payout = transfers.data[0];
    assert.equal(payout.proposalId,String(row.proposals[row.winner-1].id));
    assert.equal(payout.requestId,row.requestId);
    assert.equal(payout.transactionHash,row.receipts.find(r=>r.label.startsWith('Winner')).transactionHash);
    assert.equal(payout.to,row.expectedPayout.recipient.toLowerCase());
    assert.equal(payout.amount,row.expectedPayout.amount);
    return { status:'PASS', scope:'NEW transactions; actual shared sync/project ingestion and loopback HTTP API, not CLI-worker or browser proof', identity, raw, projection, responses };
  } finally {
    if (api) await new Promise(done=>api.close(done));
    await pool.end();
  }
}
