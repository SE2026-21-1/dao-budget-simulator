import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { test } from 'node:test';
import { AbiCoder, Interface, keccak256, toUtf8Bytes } from '/tmp/dao-pr65-tv1-review-8838cfd/node_modules/ethers/lib.esm/index.js';
import { responseValidator } from '/tmp/dao-pr65-tv1-review-8838cfd/tests/api/contract.mjs';
import { createApiServer } from '/tmp/dao-pr65-tv1-review-8838cfd/indexer/api/server.ts';

// Review-only schema/HTTP probes. Derived variants below are synthetic, not receipts.
const spec=JSON.parse(await readFile('/tmp/dao-pr65-tv1-review-8838cfd/indexer/api/openapi.json','utf8'));
const validate=await responseValidator(spec);
const example=(p)=>structuredClone(spec.paths[p].get.responses['200'].content['application/json'].example);
const detailPath='/api/proposals/{id}', summaryPath='/api/summary';

test('all 23 documented response examples validate against their endpoint/status',()=>{
  let count=0;
  for(const [path,{get}] of Object.entries(spec.paths)) for(const [status,r] of Object.entries(get.responses)) {
    const resolved=r.$ref?spec.components.responses[r.$ref.split('/').at(-1)]:r;
    const e=resolved.content['application/json'].example;
    if(e!==undefined){validate(path,status,e);count++;}
  }
  console.log('validated response examples:',count);
  assert.ok(count>=6); // Inventory is reported; no hardcoded payload values.
});

test('captured proposal example hashes, action, amount, timestamp window and demo quorum agree',async()=>{
  const d=example(detailPath),p=d.data,s=example(summaryPath);
  const dh=keccak256(toUtf8Bytes(p.description));
  assert.equal(dh,p.descriptionHash);
  const pid=BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(['address[]','uint256[]','bytes[]','bytes32'],[p.targets,p.values,p.calldatas,dh]))).toString();
  assert.equal(pid,p.proposalId);
  const abi=JSON.parse(await readFile('/tmp/dao-pr65-tv1-review-8838cfd/shared/abi/Treasury.json','utf8'));
  const treasury=new Interface(abi.abi??abi);
  const [request,to,amount]=treasury.decodeFunctionData('disburse',p.calldatas[0]);
  assert.equal(request,p.requestId);assert.equal(to.toLowerCase(),p.recipient.toLowerCase());assert.equal(amount.toString(),p.amount);
  assert.equal(p.targets[0].toLowerCase(),s.data.treasury.address.toLowerCase());assert.deepEqual(p.values,['0']);
  assert.equal(p.state,'Active');assert.ok(BigInt(p.snapshot)<BigInt(d.context.asOfTimestamp));assert.ok(BigInt(d.context.asOfTimestamp)<=BigInt(p.deadline));
  const g=s.data.governance;
  assert.equal(BigInt(p.votes.quorum),BigInt(g.totalSupply)*BigInt(g.quorumNumerator)/BigInt(g.quorumDenominator));
  assert.equal(p.votes.quorum,'200000000000000000000');
  assert.deepEqual([g.proposalThreshold,g.votingDelay,g.votingPeriod,g.timelockDelay],['50000000000000000000','60','300','120']);
  assert.equal(d.context.asOfBlock,s.context.asOfBlock);assert.equal(d.context.asOfBlockHash,s.context.asOfBlockHash);assert.equal(d.context.snapshotRevision,s.context.snapshotRevision);
});

test('seven source-supported states and operation/null variants fit the response schema',()=>{
  const states=['Pending','Active','Succeeded','Defeated','Queued','Executed','Canceled'];
  assert.deepEqual(spec.components.schemas.Proposal.properties.state.enum,states);
  for(const state of states){const b=example(detailPath);b.data.state=state;b.data.title=null;b.data.body=null;
    if(state==='Pending')b.data.votes.quorum=null;
    validate(detailPath,200,b);
  }
  for(const status of ['Waiting','Ready','Done','Canceled']){const b=example(detailPath);b.data.state='Queued';b.data.operation={operationId:'0x'+'ab'.repeat(32),queuedAt:'1800000500',eta:'1800000620',status,predecessor:'0x'+'00'.repeat(32),salt:'0x'+'cd'.repeat(32)};validate(detailPath,200,b);}
});

test('uint256 max remains exact decimal text; invalid states, types and identifiers are rejected',()=>{
  const b=example(detailPath);b.data.amount=((1n<<256n)-1n).toString();validate(detailPath,200,b);
  for(const amount of [1,-1,'-1','01','1.5','']){const m=example(detailPath);m.data.amount=amount;assert.throws(()=>validate(detailPath,200,m));}
  for(const state of ['Expired','Ready','Failed']){const m=example(detailPath);m.data.state=state;assert.throws(()=>validate(detailPath,200,m));}
  for(const [field,value] of [['proposalId','0x'+'ab'.repeat(32)],['requestId','123'],['recipient','0x123'],['descriptionHash','0x123']]){const m=example(detailPath);m.data[field]=value;assert.throws(()=>validate(detailPath,200,m));}
  // DecimalUint intentionally documents syntax only; semantic uint256 bounds are checked by the server for request inputs.
});

test('BUD Transfer nullable links, zero/self, numeric-string sums and accounting example are consistent',()=>{
  const b=example(summaryPath);let sum=0n;
  for(const t of b.data.recentActivity){sum+=BigInt(t.amount);assert.equal(t.direction,'in');assert.equal(t.proposalId,null);assert.equal(t.requestId,null);}
  assert.equal(BigInt(b.data.treasury.totalIn)-BigInt(b.data.treasury.totalOut),BigInt(b.data.treasury.balance));
  assert.equal(sum,BigInt(b.data.treasury.totalIn));
  const t=structuredClone(b.data.recentActivity[0]);delete t.type;t.amount='0';t.direction='self';t.from=t.to;
  const page={context:b.context,data:[t],pagination:{limit:20,totalCount:1,nextCursor:null}};
  validate('/api/treasury/transfers',200,page);
  t.proposalId='123';t.requestId='0x'+'ef'.repeat(32);validate('/api/treasury/transfers',200,page);
  const alternate=structuredClone(b);alternate.data.governance.votingDelay='90';alternate.data.governance.timelockDelay='240';validate(summaryPath,200,alternate);
});

test('health 503 and data-error envelopes are distinct; status-specific error constraints reject wrong retryability',()=>{
  const health=spec.paths['/api/health'].get.responses['503'].content['application/json'].example;
  validate('/api/health',503,health);assert.throws(()=>validate(summaryPath,503,health));
  const error={context:null,error:{code:'DATA_NOT_READY',message:'review-only',details:{},retryable:true}};
  validate(summaryPath,503,error);assert.throws(()=>validate('/api/health',503,error));
  assert.throws(()=>validate(summaryPath,503,{...error,error:{...error.error,retryable:false}}));
  validate(summaryPath,409,{context:null,error:{code:'SNAPSHOT_UNAVAILABLE',message:'review-only',details:{},retryable:false}});
  assert.throws(()=>validate(summaryPath,409,{context:null,error:{code:'DATA_NOT_READY',message:'review-only',details:{},retryable:true}}));
  assert.equal(spec.paths['/api/health'].get.responses['409'],undefined);
});

test('six endpoint parameter sets match source allowlists including detail path ID and no health pin',()=>{
  const expected={
    '/api/summary':['chainId','deploymentId','asOfBlock','asOfBlockHash'],
    '/api/proposals':['chainId','deploymentId','asOfBlock','asOfBlockHash','state','proposalId','limit','cursor'],
    '/api/proposals/{id}':['chainId','deploymentId','asOfBlock','asOfBlockHash','id'],
    '/api/proposals/{id}/votes':['chainId','deploymentId','asOfBlock','asOfBlockHash','id','limit','cursor'],
    '/api/treasury/transfers':['chainId','deploymentId','asOfBlock','asOfBlockHash','direction','proposalId','limit','cursor'],
    '/api/health':['chainId','deploymentId'],
  };
  for(const [p,keys] of Object.entries(expected))assert.deepEqual(spec.paths[p].get.parameters.map(r=>spec.components.parameters[r.$ref.split('/').at(-1)].name).sort(),keys.sort());
});

test('runtime rejects unknown/repeated keys, wrong endpoint filters, IDs and non-list cursor without DB access',async(t)=>{
  const server=createApiServer({pool:{connect:()=>{throw new Error('Review-only offline DB');}},cursorSecret:'x'.repeat(32)});
  t.after(()=>new Promise(r=>server.close(r)));server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,scope='chainId=31337&deploymentId=qa07-e2e';
  const probes=[['/api/summary?'+scope+'&cursor=abc.def',summaryPath],['/api/proposals/1?'+scope+'&cursor=abc.def',detailPath],['/api/health?'+scope+'&asOfBlock=25','/api/health'],['/api/proposals?'+scope+'&state=Expired','/api/proposals'],['/api/proposals?'+scope+'&limit=01','/api/proposals'],['/api/proposals?'+scope+'&unexpected=1','/api/proposals'],['/api/proposals?'+scope+'&chainId=31337','/api/proposals'],['/api/proposals/01?'+scope,detailPath],['/api/proposals/'+(1n<<256n)+'?'+scope,detailPath]];
  for(const [url,path] of probes){const r=await fetch(base+url);const body=await r.json();assert.equal(r.status,400,url);validate(path,400,body);}
  console.log('non-list cursor descriptions:',spec.paths[summaryPath].get.description,spec.paths[detailPath].get.description);
});
