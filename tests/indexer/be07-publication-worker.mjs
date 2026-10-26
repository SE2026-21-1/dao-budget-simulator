// Real PostgreSQL/RPC publication with a pause at COMMIT, solely for SIGKILL tests.
import pg from 'pg';
import { parseConfig } from '../../indexer/config.ts';
import { HttpRpc } from '../../indexer/rpc.ts';
import { project } from '../../indexer/projection/projector.ts';
const config=parseConfig(JSON.parse(process.env.BE07_CRASH_CONFIG),{});
const pool=new pg.Pool({connectionString:process.env.BE07_TEST_DATABASE_URL,max:1});
const boundary=process.env.BE07_CRASH_BOUNDARY;
const pause=async()=>{process.send({boundary});await new Promise(()=>{});};
// Every query reaches the actual client. No SQL result or RPC response is mocked.
const facade={
  query:(...args)=>pool.query(...args),
  connect:async()=>{
    const c=await pool.connect();let publishing=false;
    return {release:()=>c.release(),query:async(...args)=>{
      if(typeof args[0]==='string'&&args[0].includes('INSERT INTO projection_checkpoints'))publishing=true;
      const commit=publishing&&args[0]==='COMMIT';
      if(commit&&boundary==='beforePublicationCommit')await pause();
      const result=await c.query(...args);
      if(commit&&boundary==='afterPublicationCommit')await pause();
      return result;
    }};
  },
};
try{await project(config,new HttpRpc(config.rpcUrl),facade);}finally{await pool.end();}
