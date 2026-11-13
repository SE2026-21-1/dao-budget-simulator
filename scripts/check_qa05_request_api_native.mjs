#!/usr/bin/env node
// Owns a newly initialized cluster and four new databases, never a serving DB.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
assert.equal(process.argv.length,4,'Usage: node scripts/check_qa05_request_api_native.mjs --output <new-directory>');
assert.equal(process.argv[2],'--output');
const output=resolve(process.argv[3]);
await mkdir(output); // Existing evidence must never be overwritten.
const bin=process.env.TV4_TC10_PG_BIN??execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const dir=await mkdtemp(join(tmpdir(),'dao-tc10-native-'));
const reserve=createServer();
await new Promise((done,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',done);});
const port=reserve.address().port;
await new Promise(done=>reserve.close(done));
let started=false;
const record=async(name,value)=>writeFile(join(output,name),value,{flag:'wx'});
try {
  await record('initdb.txt',execFileSync(join(bin,'initdb'),['-D',join(dir,'data'),'--auth=trust','--no-locale','--encoding=UTF8','-U','tc10_test'],{encoding:'utf8'}));
  const start=execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'start'],{encoding:'utf8'});started=true;
  await record('pg-start.txt',start);
  const urls=[];
  for(let i=0;i<4;i++) {
    const name=`tv4_tc10_case_${i}`;
    execFileSync(join(bin,'createdb'),['-h','127.0.0.1','-p',String(port),'-U','tc10_test',name]);
    urls.push(`postgresql://tc10_test@127.0.0.1:${port}/${name}`);
  }
  const args=['--import','tsx','scripts/check_qa05_request_orders.mjs','--output',join(output,'report.json'),'--api'];
  await record('command.json',JSON.stringify({command:[process.execPath,...args],sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cluster:dir,node:process.version,postgres:execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'}).trim(),environment:{TV4_TC10_ISOLATED:'1',TV4_TC10_DATABASE_URLS:urls}},null,2)+'\n');
  const env={...process.env,TV4_TC10_ISOLATED:'1',TV4_TC10_DATABASE_URLS:JSON.stringify(urls)};
  delete env.DATABASE_URL;delete env.RPC_URL;
  const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',data=>{stdout+=data;process.stdout.write(data);});
  child.stderr.on('data',data=>{stderr+=data;process.stderr.write(data);});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',value=>done(value??1));});
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  await record('stdout.txt',stdout);await record('stderr.txt',stderr);await record('exit.json',JSON.stringify({code})+'\n');
  process.exitCode=code;
} finally {
  if(started) await record('pg-stop.txt',execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'stop','-m','fast'],{encoding:'utf8'}));
}
