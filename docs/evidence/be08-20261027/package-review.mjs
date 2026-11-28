import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
const directory = 'docs/evidence/be08-20261027';
const git = args => execFileSync('git', ['-c','core.autocrlf=true',...args], { maxBuffer:64*1024*1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(git(['diff','--cached','--name-only']).toString(), '');
const changed = git(['ls-files','--modified','--others','--exclude-standard','-z']).toString().split('\0')
  .filter(p=>p&&!p.startsWith('docs/evidence/')&&!p.startsWith('reports/')).sort();
const files = {};
for (const path of changed) files[path] = hash(await readFile(path));
const parts = [git(['diff','--binary','--','.',':(exclude)docs/evidence/**',':(exclude)reports/**'])];
for (const path of git(['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(p=>p&&changed.includes(p))) {
  try { parts.push(git(['diff','--no-index','--binary','--','/dev/null',path])); }
  catch(error) { assert.equal(error.status,1); parts.push(error.stdout); }
}
const patch = Buffer.concat(parts);
const tested = JSON.parse(await readFile(join(directory,'run-6-service-final/report.json')));
assert.equal(hash(patch), tested.provenance.patchSha256, 'Current review patch must equal the final functional patch');
const review = { baseCommit:git(['rev-parse','HEAD']).toString().trim(), branch:git(['branch','--show-current']).toString().trim(),
  worktree:'D:/dao-budget-simulator-be08', files, patchSha256:hash(patch), patch:'run-6-service-final/source.patch',
  stagedDiffEmpty:true, remoteWrites:false, remoteBe08CI:'NOT_RUN',
  finalPerformance:'run-4-final/benchmark.json', finalFunctional:'run-6-service-final/report.json', independentAudit:'final-audit.json' };
await writeFile(join(directory,'final-review.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx'});
const sums=[];
async function walk(path) {
  for(const item of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=join(path,item.name);
    if(item.isDirectory())await walk(file);
    else if(item.isFile()&&item.name!=='SHA256SUMS')sums.push(hash(await readFile(file))+'  '+relative(directory,file).replaceAll('\\','/'));
  }
}
await walk(directory);
await writeFile(join(directory,'SHA256SUMS'),sums.join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PASS',changedFiles:Object.keys(files),sealedEvidenceFiles:sums.length,patchSha256:review.patchSha256}));
