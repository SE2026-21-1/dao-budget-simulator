import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { sync } from '../../indexer/syncer.ts';
import { PostgresStorage } from '../../indexer/storage.ts';
import { FixtureRpc, config, hash, rpcLog } from './helpers.ts';
import { readBatch } from '../../indexer/reader.ts';
const url=new URL(process.env.BE07_TEST_DATABASE_URL);
assert.equal(process.env.BE07_TEST_ISOLATED,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/be07_test');
const pool=new pg.Pool({connectionString:url.href,max:8});let seq=0;
before(async()=>{
  assert.equal((await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount,0);
  for(const file of ['001_initial','002_be03','003_be04','004_be05_api','005_be07'])
    await pool.query(await readFile(new URL(`../../database/migrations/${file}.sql`,import.meta.url),'utf8'));
});
after(()=>pool.end());
async function fixture(window=128){
  const chain=50000+seq++;
  const id=(await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,confirmation_depth,governance_config)
    VALUES($1,$2,100,'test',2,'{}'::jsonb) RETURNING deployment_id::text`,[chain,`be07-${chain}`])).rows[0].deployment_id;
  const c={...config(),chainId:BigInt(chain),deploymentId:id,fromBlock:100n,toBlock:'latest',reorgWindow:window};
  for(const x of c.contracts) await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
    VALUES($1,$2,$3,$4,$5,$6)`,[id,chain,x.role,x.address,String(x.deploymentBlock),x.abiVersion]);
  const rpc=new FixtureRpc();rpc.chainId='0x'+BigInt(chain).toString(16);
  let fork=1000n,changed=false;
  rpc.override=(m,p)=>{
    if(m==='eth_blockNumber')return '0x69';
    if(m==='eth_getBlockByNumber'&&changed){const n=BigInt(p[0]);return {number:p[0],hash:hash(n>=fork?n+1000n:n),parentHash:hash(n-1n>=fork?n-1n+1000n:n-1n),timestamp:'0x'+(1700000000n+n).toString(16),transactions:[0n,1n,2n].map(t=>hash(10000n+n*10n+t))};}
  };
  rpc.logs=[rpcLog(103n)];
  const storage=new PostgresStorage(pool);await sync(c,rpc,storage);
  const branch=(at=102n)=>{fork=at;changed=true;rpc.logs=[{...rpcLog(102n),blockHash:hash(1102)}];};
  return {c,rpc,storage,branch};
}
async function rows(c){return (await pool.query('SELECT block_number::text,block_hash FROM raw_events WHERE deployment_id=$1 ORDER BY block_number',[c.deploymentId])).rows;}
async function phase(c){return (await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[c.deploymentId])).rows[0].indexer_state.phase;}
test('same-height shallow reorg rolls back orphan raw suffix; replay is idempotent and scope stays isolated',async()=>{
  const f=await fixture(),other=await fixture();const otherRows=await rows(other.c);f.branch();
  await sync(f.c,f.rpc,f.storage);
  assert.deepEqual(await rows(f.c),[{block_number:'102',block_hash:hash(1102)}]);
  assert.equal((await f.storage.loadCheckpoint(f.c)).hash,hash(1103));
  assert.equal(await phase(f.c),'replaying');
  for(let n=0;n<3;n++)await sync(f.c,f.rpc,f.storage);
  assert.equal((await rows(f.c)).length,1);assert.deepEqual(await rows(other.c),otherRows);
});
test('deep reorg outside window requires BE06; does not destroy diagnosis data or metadata',async()=>{
  const f=await fixture(1),old=await rows(f.c);f.branch(101n);
  await assert.rejects(sync(f.c,f.rpc,f.storage),e=>e.report.error.code==='REBUILD_REQUIRED');
  assert.equal(await phase(f.c),'rebuild_required');assert.deepEqual(await rows(f.c),old);
  await assert.rejects(sync(f.c,f.rpc,f.storage),e=>e.report.error.code==='REBUILD_REQUIRED');
});
for(const boundary of ['recoveryMarked','beforeRollbackCommit','afterRollbackCommit'])test(`recovery crash boundary ${boundary} resumes with a fresh storage instance`,async()=>{
  const f=await fixture();f.branch();let fired=false;
  const broken=new PostgresStorage(pool,{[boundary]:async()=>{fired=true;throw new Error('simulated process interruption');}});
  await assert.rejects(sync(f.c,f.rpc,broken));assert.equal(fired,true);
  assert.equal(await phase(f.c),boundary==='afterRollbackCommit'?'replaying':'recovering');
  await sync(f.c,f.rpc,new PostgresStorage(pool));
  assert.deepEqual(await rows(f.c),[{block_number:'102',block_hash:hash(1102)}]);
});
test('RPC failure is not evidence of a fork; RPC loss during search preserves closed gate and restart resumes',async()=>{
  const f=await fixture();const old=await rows(f.c);const saved=f.rpc.override;
  f.rpc.override=(m,p)=>{if(m==='eth_getBlockByNumber')throw new Error('offline');return saved(m,p);};
  await assert.rejects(sync(f.c,f.rpc,f.storage));assert.deepEqual(await rows(f.c),old);assert.equal(await phase(f.c),'unverified');
  f.rpc.override=saved;f.branch();let down=true;
  const storage=new PostgresStorage(pool,{recoveryMarked:async()=>{if(down){down=false;throw new Error('offline after gate');}}});
  await assert.rejects(sync(f.c,f.rpc,storage));assert.equal(await phase(f.c),'recovering');assert.deepEqual(await rows(f.c),old);
  await sync(f.c,f.rpc,f.storage);assert.equal((await rows(f.c)).length,1);
});
test('recovery gate fences a stale ingestion writer; concurrent recoveries cannot delete replayed data',async()=>{
  const f=await fixture();const oldCp=await f.storage.loadCheckpoint(f.c);
  const stale=(await readBatch(f.c,f.rpc,104n,104n)).batch;
  let release;const gate=new Promise(r=>release=r);let marked;const seen=new Promise(r=>marked=r);
  const first=new PostgresStorage(pool,{recoveryMarked:async()=>{marked();await gate;}});f.branch();
  const running=sync(f.c,f.rpc,first);await seen;
  await assert.rejects(f.storage.writeCheckpointBatch(f.c,stale,oldCp,106n),e=>e.code==='CHECKPOINT_CONFLICT');
  await sync(f.c,f.rpc,f.storage);release();await assert.rejects(running);
  assert.equal((await rows(f.c)).length,1);
});
test('a fork between committed catch-up batches persists recovery and replays on the next invocation',async()=>{
  const f=await fixture();const saved=f.rpc.override;let fired=false;
  f.rpc.override=(m,p)=>m==='eth_blockNumber'?(fired?'0x69':'0x6b'):saved(m,p);
  await assert.rejects(sync(f.c,f.rpc,f.storage,()=>{if(!fired){fired=true;f.branch();}}));
  await sync(f.c,f.rpc,f.storage);
  assert.equal((await f.storage.loadCheckpoint(f.c)).hash,hash(1103));
});

for(const boundary of ['recoveryMarked','beforeRollbackCommit','afterRollbackCommit'])test(`SIGKILL at ${boundary}: PostgreSQL reconnect and recovery restart`,{timeout:15000},async()=>{
  const {spawn}=await import('node:child_process');const {once}=await import('node:events');
  const {serveRpc}=await import('./helpers.ts');
  const f=await fixture();f.branch();
  const served=await serveRpc(b=>f.rpc.call(b.method,b.params));
  const cfg={...f.c,rpcUrl:served.url};
  const child=spawn(process.execPath,['--import','tsx','tests/indexer/be07-crash-worker.ts'],{env:{...process.env,
    BE07_CRASH_CONFIG:JSON.stringify(cfg,(_k,v)=>typeof v==='bigint'?String(v):v),BE07_CRASH_BOUNDARY:boundary},stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.on('data',c=>stderr+=c);const exited=once(child,'exit');
  try {
    const message=await Promise.race([once(child,'message'),exited.then(()=>{throw new Error(stderr||'worker exited before hook');})]);
    assert.equal(message[0].boundary,boundary);child.kill('SIGKILL');await exited;
    await sync(f.c,f.rpc,new PostgresStorage(pool));
    assert.equal((await rows(f.c)).length,1);assert.equal((await f.storage.loadCheckpoint(f.c)).hash,hash(1103));
  } finally {if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');served.server.closeAllConnections();await new Promise(r=>served.server.close(r));}
});

test('worker exits on wrong chain and rebuild_required instead of retrying forever',async()=>{
  const {worker}=await import('../../indexer/worker.ts');
  const f=await fixture();f.rpc.chainId='0x1';const events=[];f.rpc.calls=[];
  await assert.rejects(worker(f.c,pool,new AbortController().signal,e=>events.push(e),f.rpc));
  assert.equal(events[0].code,'CHAIN_ID_MISMATCH');assert.equal(f.rpc.calls.filter(x=>x.method==='eth_chainId').length,1);
  f.rpc.chainId='0x'+f.c.chainId.toString(16);await pool.query(`UPDATE deployments SET indexer_state='{"phase":"rebuild_required"}'::jsonb WHERE deployment_id=$1`,[f.c.deploymentId]);
  events.length=0;await assert.rejects(worker(f.c,pool,new AbortController().signal,e=>events.push(e),f.rpc));assert.equal(events[0].code,'REBUILD_REQUIRED');
});

test('shorter canonical branch recovers only with a lower-height hash mismatch; behind RPC alone preserves data',async()=>{
  const f=await fixture();const saved=f.rpc.override;let head=102n;
  f.rpc.override=(m,p)=>m==='eth_blockNumber'?'0x'+head.toString(16):m==='eth_getBlockByNumber'&&BigInt(p[0])>head?null:saved(m,p);
  const old=await rows(f.c);
  await assert.rejects(sync(f.c,f.rpc,f.storage),e=>e.report.error.code==='CHECKPOINT_HEAD_BEHIND');
  assert.deepEqual(await rows(f.c),old);assert.equal(await phase(f.c),'unverified');
  f.branch(101n);await sync(f.c,f.rpc,f.storage);
  assert.equal((await f.storage.loadCheckpoint(f.c)).number,100n);assert.equal((await rows(f.c)).length,0);
  head=104n;await sync(f.c,f.rpc,f.storage);assert.deepEqual(await rows(f.c),[{block_number:'102',block_hash:hash(1102)}]);
});

test('wrong RPC chain during recovery never rolls back data',async()=>{
  const f=await fixture();const cp=await f.storage.loadCheckpoint(f.c);const old=await rows(f.c);f.branch();f.rpc.chainId='0x1';
  await assert.rejects(f.storage.recoverCheckpoint(f.c,f.rpc,cp),e=>e.code==='CHAIN_ID_MISMATCH');
  assert.deepEqual(await rows(f.c),old);assert.equal(await phase(f.c),'recovering');
  f.rpc.chainId='0x'+f.c.chainId.toString(16);
  const storage=new PostgresStorage(pool,{recoveryMarked:async()=>{f.rpc.chainId='0x1';}});
  await assert.rejects(sync(f.c,f.rpc,storage),e=>e.report.error.code==='CHAIN_ID_MISMATCH');
  assert.deepEqual(await rows(f.c),old);assert.equal(await phase(f.c),'recovering');
});

test('confirmed mismatch closes recovery gate even when the next chain RPC fails',async()=>{
  const {IndexerError}=await import('../../indexer/errors.ts');
  const f=await fixture();f.branch();const original=f.rpc.override;let chainReads=0;
  f.rpc.override=(m,p)=>{
    if(m==='eth_chainId'&&++chainReads>1)throw new IndexerError('RPC_UNAVAILABLE','offline after mismatch');
    return original(m,p);
  };
  const old=await rows(f.c);
  await assert.rejects(sync(f.c,f.rpc,f.storage),e=>e.report.error.code==='RPC_UNAVAILABLE');
  assert.equal(await phase(f.c),'recovering');assert.deepEqual(await rows(f.c),old);
});

test('heartbeat keeps RPC observation time when waiting for the chain writer lock',async()=>{
  const f=await fixture(),cp=await f.storage.loadCheckpoint(f.c);const blocker=await pool.connect();let observed;
  try{
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`be02-chain:${f.c.chainId}`]);
    observed=f.storage.observe(f.c,105n,cp);
    await new Promise(r=>setTimeout(r,100));const releasedAt=Date.now();
    await blocker.query('COMMIT');await observed;
    const state=(await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[f.c.deploymentId])).rows[0].indexer_state;
    assert.ok(Date.parse(state.lastCheckedAt)<releasedAt,'waiting for SQL lock must not manufacture a fresh RPC check');
  }finally{await blocker.query('ROLLBACK');blocker.release();await observed;}
});

test('lag observation starts after a JSON null heartbeat and survives subsequent observations',async()=>{
  const f=await fixture(),cp=await f.storage.loadCheckpoint(f.c);
  await f.storage.observe(f.c,107n,cp);
  const first=(await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[f.c.deploymentId])).rows[0].indexer_state.lagSince;
  assert.equal(typeof first,'string');
  await f.storage.observe(f.c,108n,cp);
  assert.equal((await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[f.c.deploymentId])).rows[0].indexer_state.lagSince,first);
});

test('shorter fork immediately after a committed batch persists recovery before worker retry',async()=>{
  const f=await fixture();const original=f.rpc.override;let head=107n;
  f.rpc.override=(m,p)=>m==='eth_blockNumber'?'0x'+head.toString(16):m==='eth_getBlockByNumber'&&BigInt(p[0])>head?null:original(m,p);
  await assert.rejects(sync(f.c,f.rpc,f.storage,()=>{f.branch(101n);head=101n;}),e=>e.report.error.code==='REORG_RETRY');
  assert.equal(await phase(f.c),'replaying');assert.equal((await f.storage.loadCheckpoint(f.c)).number,100n);
  head=105n;await sync(f.c,f.rpc,f.storage);assert.deepEqual(await rows(f.c),[{block_number:'102',block_hash:hash(1102)}]);
});
