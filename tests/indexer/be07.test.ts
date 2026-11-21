import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { HttpRpc, RpcError } from '../../indexer/rpc.js';
import { freshness } from '../../indexer/api/server.js';
import { parseConfig } from '../../indexer/config.js';
import { configInput } from './helpers.js';

for (const failure of [429, 500, 503, 'network', 'timeout', -32005] as const) {
  test(`RPC retries ${failure}, then recovers (real HTTP)`, async () => {
    let attempts = 0;
    const server = createServer(async (req, res) => {
      let bytes = ''; for await (const c of req) bytes += c;
      const { id } = JSON.parse(bytes); attempts++;
      if (attempts < 3) {
        if (failure === 'network') { req.socket.destroy(); return; }
        if (failure === 'timeout') return;
        if (failure < 0) { res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: failure } })); return; }
        res.writeHead(failure); res.end('secret provider body'); return;
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result: '0x7a69' }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const rpc = new HttpRpc(`http://127.0.0.1:${address.port}`, 1000,
        { baseDelayMs: 2, maxDelayMs: 8, random: () => 0 });
      assert.equal(await rpc.call('eth_chainId', []), '0x7a69'); assert.equal(attempts, 3);
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
  });
}
for (const code of [-32601, -32602, -32000, 401, 403]) {
  test(`RPC permanent ${code} is attempted once`, async () => {
    let attempts = 0;
    const server = createServer(async (req, res) => {
      let bytes = ''; for await (const c of req) bytes += c;
      const { id } = JSON.parse(bytes); attempts++;
      if (code > 0) res.writeHead(code);
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message: 'secret' } }));
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    try { await assert.rejects(new HttpRpc(`http://127.0.0.1:${(server.address() as {port:number}).port}`).call('eth_call', []),
      e => e instanceof RpcError && !e.retryable && !e.message.includes('secret')); assert.equal(attempts,1);
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
  });
}
test('RPC retries are bounded, exponential, jittered and interruptible', async () => {
  let attempts=0, randomCalls=0;
  const server=createServer((_q,res)=>{ attempts++;res.writeHead(503);res.end(); });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    const start=Date.now();
    await assert.rejects(new HttpRpc(url,1000,{maxAttempts:3,baseDelayMs:20,maxDelayMs:100,random:()=>{randomCalls++;return 1;}}).call('eth_chainId',[]));
    assert.equal(attempts,3);assert.equal(randomCalls,2);assert.ok(Date.now()-start>=55);
    const c=new AbortController(); setTimeout(()=>c.abort(),30);
    await assert.rejects(new HttpRpc(url,1000,{signal:c.signal,baseDelayMs:2000}).call('eth_chainId',[]), /stopped/);
    assert.equal(attempts,4);
  } finally { server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r())); }
});
test('freshness changes after 30 seconds with zero new events; recovery gates are explicit',()=>{
  const now=Date.now();
  const raw={h:'10',hash:'x',head:'12',confirmations:2,status:'ready',sourceScope:'s',updatedAt:new Date(now).toISOString()};
  const state={phase:'ready',lastCheckedAt:new Date(now).toISOString(),head:'12',confirmed:'10'};
  assert.equal(freshness(raw,'10',state,now+30000).status,'synced');
  assert.equal(freshness(raw,'10',state,now+30001).status,'lagging');
  assert.equal(freshness(raw,'10',state,now+31000).lagSeconds,'31');
  for(const phase of ['recovering','replaying','rebuild_required'])
    assert.equal(freshness(raw,'10',{...state,phase}).status,'not_ready');
  assert.equal(freshness(raw,'10',null).status,'lagging');
});
test('recovery config validates bounded window and polling interval',()=>{
  for(const reorgWindow of [0,-1,0.5,'128',10001]) assert.throws(()=>parseConfig({...configInput(),reorgWindow},{}));
  for(const pollIntervalMs of [0,-1,10,10001,'1000']) assert.throws(()=>parseConfig({...configInput(),pollIntervalMs},{}));
  assert.equal(parseConfig(configInput(),{}).reorgWindow,128);
});

test('invalid RPC JSON/ID is permanent; shutdown aborts an in-flight response',async()=>{
  let requests=0,mode='json';
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);requests++;
    if(mode==='stall')return;
    res.end(mode==='json'?'invalid-json':JSON.stringify({jsonrpc:'2.0',id:b.id+1,result:'0x0'}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{
    for(mode of ['json','id'])await assert.rejects(new HttpRpc(url).call('eth_chainId',[]),e=>e instanceof RpcError&&!e.retryable);
    assert.equal(requests,2);mode='stall';const c=new AbortController();setTimeout(()=>c.abort(),30);
    await assert.rejects(new HttpRpc(url,5000,{signal:c.signal}).call('eth_chainId',[]),/stopped/);assert.equal(requests,3);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
