import pg from 'pg';
import { parseConfig } from '../../indexer/config.js';
import { HttpRpc } from '../../indexer/rpc.js';
import { PostgresStorage, type TransactionHooks } from '../../indexer/storage.js';
import { sync } from '../../indexer/syncer.js';
const config=parseConfig(JSON.parse(process.env.BE07_CRASH_CONFIG!),{});
const pool=new pg.Pool({connectionString:process.env.BE07_TEST_DATABASE_URL,max:1});
const boundary=process.env.BE07_CRASH_BOUNDARY as keyof TransactionHooks;
try {
  await sync(config,new HttpRpc(config.rpcUrl),new PostgresStorage(pool,{[boundary]:async()=>{
    process.send?.({boundary});await new Promise(()=>{});
  }}));
} finally {await pool.end();}
