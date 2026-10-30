import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import pg from '/home/cuongdz/projects/dao-be04-audit/node_modules/pg/lib/index.js';
const root='/mnt/c/Users/Cuongdz/Downloads/cv3/dao-budget-simulator-be07';
const out=resolve(root,process.env.BE07_AUDIT_OUTPUT||'docs/evidence/be07-packaging-20261025/before-fix');await mkdir(out,{recursive:true});
const bin='/tmp/dao-be07-pg184/usr/lib/postgresql/18/bin',dir=await mkdtemp('/tmp/dao-be07-packaging-');
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const env={...process.env,BE07_TEST_ISOLATED:'1',BE07_TEST_DATABASE_URL:`postgresql://be04_test@127.0.0.1:${port}/be07_test`,BE05_TEST_ISOLATED:'1',BE05_TEST_DATABASE_URL:`postgresql://be04_test@127.0.0.1:${port}/tv4_be05_audit`,BE04_LIVE_ISOLATED:'1',BE04_LIVE_DATABASE_URL:`postgresql://be04_test@127.0.0.1:${port}/be04_live`,BE07_COMPARE_DATABASE_URL:`postgresql://be04_test@127.0.0.1:${port}/be07_compare`};
let started=false;const results=[];
async function run(label,args){let log='';const start=new Date().toISOString();const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>log+=c);child.stderr.on('data',c=>log+=c);const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});await writeFile(join(out,label+'.txt'),log);results.push({label,argv:['node',...args],start,end:new Date().toISOString(),exitCode});await writeFile(join(out,'commands.json'),JSON.stringify(results,null,2)+'\n');console.log(label,exitCode);}
try{
 execFileSync(join(bin,'initdb'),['-D',join(dir,'data'),'--auth=trust','--no-locale','--encoding=UTF8','-U','be04_test'],{stdio:'ignore'});
 execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'start'],{stdio:'ignore'});started=true;
 const c=new pg.Client({connectionString:`postgresql://be04_test@127.0.0.1:${port}/postgres`});await c.connect();for(const name of ['be07_test','tv4_be05_audit','be04_live','be07_compare'])await c.query(`CREATE DATABASE ${name} OWNER be04_test`);await c.end();
 if(process.env.BE07_AUDIT_API_ONLY!=='1') await run('be07-db',['--import','tsx','--test','tests/indexer/be07-db.test.mjs']);
 if(process.env.BE07_AUDIT_API_ONLY==='1'){
  await run('api-db',['--import','tsx','--test','tests/api/server.test.mjs']);
  await run('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
  await run('build',['node_modules/typescript/bin/tsc','-p','tsconfig.build.json']);
 }
 if(process.env.BE07_AUDIT_FULL==='1'){
  await run('api-db',['--import','tsx','--test','tests/api/server.test.mjs']);
  await run('affected-unit',['--import','tsx','--test','tests/indexer/syncer.test.ts','tests/indexer/be07.test.ts']);
  await run('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
  await run('build',['node_modules/typescript/bin/tsc','-p','tsconfig.build.json']);
  await run('live',['--import','tsx','scripts/check_be04_live.mjs','--output',join(out,'live.json'),'--be07']);
 }
 await writeFile(join(out,'runtime.json'),JSON.stringify({node:process.version,postgres:execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'}).trim(),cluster:dir,port},null,2)+'\n');
 process.exitCode=results.every(r=>r.exitCode===0)?0:1;
}finally{if(started)await writeFile(join(out,'pg-stop.txt'),execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'stop','-m','fast'],{encoding:'utf8'}));}
