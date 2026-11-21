// Fresh native cluster lifecycle. No Docker, sudo, existing DB, testnet or signer.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const bin=process.env.BE07_PG_BIN??execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
const dir=await mkdtemp(join(tmpdir(),'dao-be07-native-'));
const output=resolve(process.env.BE07_EVIDENCE_DIR??join('reports',`be07-${Date.now()}`));await mkdir(output,{recursive:true});
const reserve=createServer();await new Promise((r,j)=>{reserve.once('error',j);reserve.listen(0,'127.0.0.1',r);});
const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const env={...process.env,BE07_TEST_ISOLATED:'1',PG_ADMIN_URL:`postgresql://be04_test@127.0.0.1:${port}/postgres`,BE07_EVIDENCE_DIR:output};
let started=false;
try {
  const init=execFileSync(join(bin,'initdb'),['-D',join(dir,'data'),'--auth=trust','--no-locale','--encoding=UTF8','-U','be04_test'],{encoding:'utf8'});
  await writeFile(join(output,'initdb.txt'),init,{flag:'wx'});
  const start=execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${dir}`,'start'],{encoding:'utf8'});started=true;
  await writeFile(join(output,'pg-start.txt'),start,{flag:'wx'});
  await writeFile(join(output,'runtime.json'),JSON.stringify({node:process.version,
    postgres:execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'}).trim(),
    forge:execFileSync(process.env.FORGE_BIN??'forge',['--version'],{encoding:'utf8'}).trim(),
    anvil:execFileSync(process.env.ANVIL_BIN??'anvil',['--version'],{encoding:'utf8'}).trim(),
    baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cluster:dir,port},null,2)+'\n',{flag:'wx'});
  const child=spawn(process.execPath,['scripts/check_be07_local.mjs'],{env,stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>r(code??1));});
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
} finally {
  if(started){const stopped=execFileSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'stop','-m','fast'],{encoding:'utf8'});await writeFile(join(output,'pg-stop.txt'),stopped,{flag:'wx'});}
}
console.log(`Evidence: ${output}`);
