// Local/CI test orchestrator. Caller provisions a NEW disposable PostgreSQL cluster.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
assert.equal(process.env.BE07_TEST_ISOLATED,'1','Explicit disposable cluster opt-in required.');
const output=resolve(process.env.BE07_EVIDENCE_DIR??'reports/be07');await mkdir(output,{recursive:true});
const admin=new URL(process.env.PG_ADMIN_URL);assert.equal(admin.hostname,'127.0.0.1');assert.equal(admin.pathname,'/postgres');
const connect=(name,role='be04_test')=>{const u=new URL(admin);u.username=role;u.pathname='/'+name;return u.href;};
const env={...process.env,BE07_TEST_DATABASE_URL:connect('be07_test'),BE07_COMPARE_DATABASE_URL:connect('be07_compare'),
  BE04_LIVE_ISOLATED:'1',BE04_LIVE_DATABASE_URL:connect('be04_live'),BE02_TEST_ISOLATED:'1',BE02_TEST_DATABASE_URL:connect('be02_test','be02_test'),
  BE03_TEST_ISOLATED:'1',BE03_TEST_DATABASE_URL:connect('be03_test','be03_test'),BE04_TEST_ISOLATED:'1',BE04_TEST_DATABASE_URL:connect('be04_test'),
  BE05_TEST_ISOLATED:'1',BE05_TEST_DATABASE_URL:connect('tv4_be05_be07'),BE06_TEST_ISOLATED:'1',
  BE06_TEST_REFERENCE_DATABASE_URL:connect('be06_test_reference'),BE06_TEST_TARGET_DATABASE_URL:connect('be06_test_target')};
// Bind every run to the actual uncommitted implementation and its new files.
const changed=execFileSync('git',['ls-files','--modified','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
  .filter(p=>!p.startsWith('docs/evidence/')&&!p.startsWith('reports/')).sort();
const files={};
for(const path of changed) files[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const trackedPatch=execFileSync('git',['diff','--binary','--','.',':(exclude)docs/evidence/**',':(exclude)reports/**']);
const patchParts=[trackedPatch];
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&changed.includes(p));
for(const path of untracked){try{patchParts.push(execFileSync('git',['diff','--no-index','--binary','--','/dev/null',path]));}catch(e){if(e.status!==1)throw e;patchParts.push(e.stdout);}}
const patch=Buffer.concat(patchParts);
await writeFile(resolve(output,'source.patch'),patch,{flag:'wx'});
await writeFile(resolve(output,'tested-source.json'),JSON.stringify({baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  files,patchSha256:createHash('sha256').update(patch).digest('hex')},null,2)+'\n',{flag:'wx'});
const c=new pg.Client({connectionString:admin.href});await c.connect();
const databases=[['be07_test','be04_test'],['be07_compare','be04_test'],['be04_live','be04_test'],['be04_live_baseline','be04_test'],['be04_test','be04_test'],['be02_test','be02_test'],['be03_test','be03_test'],['tv4_be05_be07','be04_test'],['be06_test_reference','be04_test'],['be06_test_target','be04_test']];
try{
  for(const [name] of databases)assert.equal((await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0,`Refuse existing database ${name}`);
  for(const name of ['be04_test','be02_test','be03_test'])if(!(await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount){
    const sql=(await c.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text) AS sql",[name,admin.password||null])).rows[0].sql;
    await c.query(sql);
  }
  for(const [name,role]of databases)await c.query(`CREATE DATABASE ${name} OWNER ${role} TEMPLATE template0 ENCODING 'UTF8'`);
}finally{await c.end();}
const commands=[];
async function run(label,command,args,extra={}){
  const start=new Date();let log='';
  const child=spawn(command,args,{env:{...env,...extra},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',s=>log+=s);child.stderr.on('data',s=>log+=s);
  const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});
  await writeFile(resolve(output,label+'.txt'),log,{flag:'wx'});
  commands.push({label,command:command===process.execPath?'node':command,args,exitCode,start:start.toISOString(),end:new Date().toISOString()});
  await writeFile(resolve(output,'commands.json'),JSON.stringify(commands,null,2)+'\n');
  console.log(`${label}: exit ${exitCode}`);return exitCode;
}
await run('typecheck','npm',['run','typecheck']);await run('build','npm',['run','build']);
await run('unit',process.execPath,['--import','tsx','--test','tests/indexer/config.test.ts','tests/indexer/decoder.test.ts','tests/indexer/reader.test.ts','tests/indexer/cli.test.ts','tests/indexer/syncer.test.ts','tests/indexer/projection.test.ts','tests/indexer/be04-live-receipt.test.mjs','tests/indexer/be06.test.ts','tests/indexer/be07.test.ts']);
for(const [label,file]of [['be02-db','tests/indexer/storage.test.ts'],['be03-db','tests/indexer/checkpoint-storage.test.ts'],['be04-db','tests/indexer/projection-storage.test.ts'],['api-db','tests/api/server.test.mjs'],['be06-db','tests/indexer/be06-db.test.mjs'],['be07-db','tests/indexer/be07-db.test.mjs']])
  await run(label,process.execPath,['--import','tsx','--test',file]);
if(process.env.BE07_BASELINE_ROOT)await run('baseline-live',process.execPath,['--import','tsx','scripts/check_be04_live.mjs','--output',resolve(output,'baseline-live.json'),'--be07'],{BE04_LIVE_DATABASE_URL:connect('be04_live_baseline')});
await run('be07-live',process.execPath,['--import','tsx','scripts/check_be04_live.mjs','--output',resolve(output,'be07-live.json'),'--be07'],{BE07_BASELINE_ROOT:''});
process.exitCode=commands.every(c=>c.exitCode===0)?0:1;
