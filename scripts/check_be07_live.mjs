// Invoked by check_be04_live.mjs after its real eight-proposal governance history.
import assert from 'node:assert/strict';
import pg from 'pg';
import { id, toQuantity } from 'ethers';
import { parseBe06Manifest } from '../indexer/be06/manifest.ts';
import { rebuildDatabase } from '../indexer/be06/rebuild.ts';
import { compareDatabases } from '../indexer/be06/compare.ts';
import { worker } from '../indexer/worker.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

export async function checkBe07Live(x) {
  const {pool,config,rpc,transport,storage,project,sync,tx,accounts,address,manifest,reorgSnapshot,reorgAncestor,apiGet,baselineRoot,stable,call,abi}=x;
  const beforeHead=BigInt(await rpc('eth_blockNumber'));
  const before=(await pool.query('SELECT block_number::text AS h,block_hash AS hash FROM checkpoints WHERE deployment_id=$1',[config.deploymentId])).rows[0];
  const first=await apiGet('/proposals',new URLSearchParams({chainId:'31337',deploymentId:'be04-live',limit:'1'}));
  assert.equal(first.status,200);const cursor=first.body.pagination.nextCursor;assert.ok(cursor);
  const oldModel=await stable();
  assert.equal(await rpc('evm_revert',[reorgSnapshot]),true);
  const shallowSnapshot=await rpc('evm_snapshot',[]);
  // Alternate branch replaces ALL proposal/vote/operation/payment events, at the same head.
  await tx('BE07 alternate canonical deposit',accounts.funding,'BUD','transfer',[address.Treasury,7n*10n**18n]);
  let canonicalProposal;
  if (!baselineRoot) {
    const description='BE07 canonical proposal replacement';
    const args=[[address.Treasury],['0'],[abi.Treasury.encodeFunctionData('disburse',[id('be07:new-request'),accounts.recipient,11n*10n**18n])],description];
    canonicalProposal=String((await call('Governor','hashProposal',[...args.slice(0,3),id(description)]))[0]);
    await tx('BE07 canonical propose',accounts.A,'Governor','propose',args);
    const snapshot=BigInt((await call('Governor','proposalSnapshot',[canonicalProposal]))[0]);
    const deadline=BigInt((await call('Governor','proposalDeadline',[canonicalProposal]))[0]);
    await tx('BE07 canonical vote',accounts.A,'Governor','castVote',[canonicalProposal,1],snapshot+1n);
    await tx('BE07 canonical queue',accounts.caller,'Governor','queue',[...args.slice(0,3),id(description)],deadline+1n);
    const queuedAt=BigInt((await rpc('eth_getBlockByNumber',['latest',false])).timestamp);
    await tx('BE07 canonical execute',accounts.caller,'Governor','execute',[...args.slice(0,3),id(description)],queuedAt+120n);
  }
  const branchHead=BigInt(await rpc('eth_blockNumber'));
  await rpc('anvil_mine',[toQuantity(beforeHead-branchHead),'0x1']);
  assert.equal(BigInt(await rpc('eth_blockNumber')),beforeHead);
  const newHeader=await rpc('eth_getBlockByNumber',[toQuantity(BigInt(before.h)),false]);
  assert.notEqual(newHeader.hash,before.hash);
  config.toBlock=BigInt(before.h);
  const result={before:{...before,head:String(beforeHead)},ancestor:{h:String(BigInt(reorgAncestor.number)),hash:reorgAncestor.hash},
    canonical:{h:before.h,hash:newHeader.hash,head:String(beforeHead)},mode:baselineRoot?'baseline':'BE07'};
  if(baselineRoot){
    let failure;try{await sync(config,transport,storage);}catch(e){failure=e.report;}
    assert.equal(failure.error.code,'CHECKPOINT_HASH_MISMATCH');
    const orphanApi=await apiGet('/summary');
    assert.equal(orphanApi.status,200);assert.equal(orphanApi.body.context.asOfBlockHash,before.hash);
    assert.equal(orphanApi.body.context.sync.status,'synced');assert.deepEqual(await stable(),oldModel);
    return {...result,status:'REPRODUCED_OLD_BUG',failure,orphanApi};
  }
  await sync(config,transport,storage);
  const gateHealth=await apiGet('/health'),gateData=await apiGet('/summary');
  assert.equal(gateHealth.status,503);assert.equal(gateHealth.body.data.recoveryStatus,'replaying');
  assert.equal(gateData.status,503);
  const cursorQuery=new URLSearchParams({chainId:'31337',deploymentId:'be04-live',limit:'1',cursor});
  const duringCursor=await apiGet('/proposals',cursorQuery);assert.equal(duringCursor.status,409);assert.equal(duringCursor.body.error.code,'SNAPSHOT_INVALIDATED');
  result.publicationCrashes=[];
  for(const boundary of ['beforePublicationCommit','afterPublicationCommit']){
    const child=spawn(process.execPath,['--import','tsx','tests/indexer/be07-publication-worker.mjs'],{
      env:{...process.env,BE07_TEST_DATABASE_URL:pool.options.connectionString,
        BE07_CRASH_CONFIG:JSON.stringify(config,(_k,v)=>typeof v==='bigint'?String(v):v),BE07_CRASH_BOUNDARY:boundary},
      stdio:['ignore','pipe','pipe','ipc']});
    let stderr='';child.stderr.on('data',c=>stderr+=c);const exited=once(child,'exit');let timer;
    try{
      const message=await Promise.race([once(child,'message'),exited.then(()=>{throw new Error(stderr||'publication child exited before boundary');}),
        new Promise((_r,reject)=>{timer=setTimeout(()=>reject(new Error('publication boundary timeout')),15000);})]);
      assert.equal(message[0].boundary,boundary);
      const visible=(await pool.query("SELECT indexer_state->>'phase' AS phase FROM deployments WHERE deployment_id=$1",[config.deploymentId])).rows[0].phase;
      const published=(await pool.query('SELECT block_hash FROM projection_checkpoints WHERE deployment_id=$1',[config.deploymentId])).rows;
      assert.equal(visible,boundary==='beforePublicationCommit'?'replaying':'ready');
      assert.equal(published.length,boundary==='beforePublicationCommit'?0:1);
      child.kill('SIGKILL');await exited;
      assert.equal((await apiGet('/summary')).status,boundary==='beforePublicationCommit'?503:200);
      result.publicationCrashes.push({boundary,signal:'SIGKILL',visiblePhase:visible,publication:published});
    }finally{
      clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}
    }
  }
  const projection=await project(config,transport,pool);assert.equal(projection.context.asOfBlockHash,newHeader.hash);
  assert.deepEqual(projection.counts,{proposals:1,votes:1,operations:1,transfers:3,disbursements:1});
  assert.equal(projection.treasury.balance,String(9996n*10n**18n));
  const canonicalIds=(await pool.query('SELECT proposal_id::text AS id FROM proposals WHERE deployment_id=$1',[config.deploymentId])).rows.map(r=>r.id);
  assert.deepEqual(canonicalIds,[canonicalProposal]);
  const recovered=await apiGet('/summary');assert.equal(recovered.status,200);assert.equal(recovered.body.context.asOfBlockHash,newHeader.hash);
  const oldCursor=await apiGet('/proposals',cursorQuery);assert.equal(oldCursor.status,409);assert.equal(oldCursor.body.error.code,'SNAPSHOT_INVALIDATED');
  const restored=await stable();for(let i=0;i<3;i++){await sync(config,transport,storage);await project(config,transport,pool);assert.deepEqual(await stable(),restored);}
  const state=(await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1',[config.deploymentId])).rows[0].indexer_state;
  assert.equal(state.ancestorNumber,result.ancestor.h);assert.equal(state.ancestorHash,result.ancestor.hash);
  const targetUrl=new URL(process.env.BE07_COMPARE_DATABASE_URL);assert.equal(process.env.BE07_TEST_ISOLATED,'1');
  assert.equal(targetUrl.hostname,'127.0.0.1');assert.equal(targetUrl.pathname,'/be07_compare');
  const target=new pg.Pool({connectionString:targetUrl.href,max:4});
  try {
    const input={format:manifest.format,sourceCommit:manifest.sourceCommit,chainId:manifest.chainId,
      scanFromBlock:manifest.scanFromBlock,confirmations:2,batchSize:'7',contracts:{
        ...Object.fromEntries([['governor','Governor'],['timelock','Timelock'],['treasury','Treasury'],['budget_token','BUD']].map(([role,k])=>[role,manifest.contracts[k]])),
        GOV:manifest.contracts.GOV}};
    const loaded=parseBe06Manifest(input,config.rpcUrl,before.h,config.deploymentId);
    result.rebuild=await rebuildDatabase({manifest:loaded,atBlock:before.h,rpc:transport,referencePool:pool,targetPool:target});
    result.compare=await compareDatabases({config:loaded.config,atBlock:before.h,rpc:transport,referencePool:pool,rebuildPool:target});
    assert.equal(result.compare.result,'equal');
  } finally {await target.end();}
  // Real >30 s RPC outage: keep API and worker running, including the no-event case.
  let offline=false,requests=0;
  const proxy=createServer(async(req,res)=>{
    let raw='';for await(const c of req)raw+=c;requests++;
    if(offline){res.writeHead(503);res.end();return;}
    const b=JSON.parse(raw);
    try{res.end(JSON.stringify({jsonrpc:'2.0',id:b.id,result:await rpc(b.method,b.params)}));}
    catch{res.writeHead(503);res.end();}
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  const controller=new AbortController(),events=[];config.toBlock='latest';config.pollIntervalMs=200;
  const proxyRpc=new HttpRpc(`http://127.0.0.1:${proxy.address().port}`,100,{signal:controller.signal,maxAttempts:2,baseDelayMs:10});
  const running=worker(config,pool,controller.signal,e=>events.push({type:e.type,...(e.code?{code:e.code}:{})}),proxyRpc);
  try{
    for(let i=0;i<100&&!events.some(e=>e.type==='worker_publication');i++)await new Promise(r=>setTimeout(r,50));
    assert.ok(events.some(e=>e.type==='worker_publication'));
    const receipt=await tx('BE07 worker eligible deposit',accounts.funding,'BUD','transfer',[address.Treasury,2n*10n**18n]);
    await rpc('anvil_mine',['0x2','0x0']);const eligibleAt=Date.now();let eventVisible;
    for(let i=0;i<200;i++){
      eventVisible=await apiGet('/summary');
      if(eventVisible.body.context && BigInt(eventVisible.body.context.asOfBlock)>=BigInt(receipt.blockNumber) && eventVisible.body.context.sync.status==='synced')break;
      await new Promise(r=>setTimeout(r,50));
    }
    const elapsedMs=Date.now()-eligibleAt;
    assert.equal(eventVisible.body.context.sync.status,'synced');assert.ok(BigInt(eventVisible.body.context.asOfBlock)>=BigInt(receipt.blockNumber));assert.ok(elapsedMs<30000);
    assert.equal(eventVisible.body.data.treasury.balance,String(9998n*10n**18n));
    result.normalRpcFreshness={eligibleBlock:String(BigInt(receipt.blockNumber)),elapsedMs,eventVisible};
    offline=true;
    const start=Date.now();await new Promise(r=>setTimeout(r,31050));
    const staleHealth=await apiGet('/health'),staleSummary=await apiGet('/summary');
    assert.equal(staleHealth.status,200);assert.equal(staleHealth.body.data.indexer,'lagging');
    assert.equal(staleSummary.body.context.sync.status,'lagging');assert.ok(BigInt(staleSummary.body.context.sync.lagSeconds)>=30n);
    offline=false;
    let fresh;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));fresh=await apiGet('/health');if(fresh.body.context?.sync.status==='synced')break;}
    assert.equal(fresh.body.context.sync.status,'synced');
    result.outage={durationMs:Date.now()-start,requests,staleHealth,staleSummary,fresh,events};
  }finally{controller.abort();await running;proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  // Deep fork: retain diagnosis data, close API publication, require BE06.
  assert.equal(await rpc('evm_revert',[shallowSnapshot]),true);
  await tx('BE07 deep alternate deposit',accounts.funding,'BUD','transfer',[address.Treasury,9n*10n**18n]);
  await rpc('anvil_mine',[toQuantity(beforeHead-BigInt(await rpc('eth_blockNumber'))),'0x2']);
  config.reorgWindow=1;
  await assert.rejects(sync(config,transport,storage),e=>e.report.error.code==='REBUILD_REQUIRED');
  const deepHealth=await apiGet('/health'),deepData=await apiGet('/summary');
  assert.equal(deepHealth.status,503);assert.equal(deepHealth.body.data.recoveryStatus,'rebuild_required');assert.equal(deepData.status,503);
  return {...result,status:'PASS',recoveryState:state,projection,gateHealth,gateData,duringCursor,recovered,oldCursor,deepHealth,deepData,
    checks:['same height real reorg removed proposal/vote/operation/transfer/disbursement orphan history','three replay cycles preserve exact model',
      'fresh BE06 database equals recovered database at H/hash','real 31 second RPC outage and idle worker freshness recovery','deep fork requires rebuild; API rejects orphan publication']};
}
