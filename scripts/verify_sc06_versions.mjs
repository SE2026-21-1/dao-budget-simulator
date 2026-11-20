import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';
import { generationFiles, sha, verifySources } from './sc06_provenance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const archivePath = 'fixtures/chain/sc06-v1/chain.json';
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A private local clone leaves the caller's branch, index, worktrees and submodule
// configuration untouched. No source/checksum is rewritten to fit an old archive.
export async function verifyVersions() {
  const revision = git(['rev-parse', 'HEAD']);
  await verifySources(revision, Object.fromEntries(await Promise.all(generationFiles.map(async path =>
    [path, sha(await readFile(resolve(root, path)))]))));
  const archive = await readFile(resolve(root, archivePath));
  const original = JSON.parse(archive);
  assert.match(original.generation.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(sha(archive), sha(execFileSync('git', ['show', `HEAD:${archivePath}`], { cwd: root })), 'historical archive differs from committed bytes');
  try { git(['cat-file', '-e', `${original.generation.sourceCommit}^{commit}`]); }
  catch (cause) { throw new Error(`SC06 historical source ${original.generation.sourceCommit} unavailable; fetch full Git history before verification`, { cause }); }

  const life = createSmokeLifecycle();
  const run = (command, args, cwd = root, env = process.env, expectedFailure) => new Promise((done, reject) => {
    const child = life.spawn(command, args, { cwd, env, stdio: expectedFailure ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let diagnostic = '';
    if (expectedFailure) for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostic += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (expectedFailure ? code !== null && code !== 0 && expectedFailure.test(diagnostic) : code === 0) done();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})${expectedFailure ? `; expected rejection ${expectedFailure}, received: ${diagnostic}` : ''}`));
    });
  });
  try {
    const temp = await life.temporaryDirectory(join(tmpdir(), 'sc06-versions-'));
    const historical = join(temp, 'historical');
    const savedArchive = join(temp, 'historical-chain.json');
    await writeFile(savedArchive, archive, { flag: 'wx' });
    await run('git', ['clone', '--shared', '--no-checkout', root, historical]);
    await run('git', ['checkout', '--detach', original.generation.sourceCommit], historical);
    const modules = git(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'], historical);
    for (const line of modules.split('\n')) {
      const [key, path] = line.split(/\s+/);
      assert.ok(path && !path.startsWith('/') && !path.split('/').includes('..'), 'unsafe submodule path');
      await run('git', ['config', key.replace(/\.path$/, '.url'), resolve(root, path)], historical);
    }
    await run('git', ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive'], historical);
    await run('npm', ['ci', '--ignore-scripts'], historical);
    await run('forge', ['build'], historical);
    await run(process.execPath, ['--import', 'tsx', 'scripts/check_sc06_chain.mjs', savedArchive], historical);
    // The original review failure must remain a rejection, not become a waiver.
    // Only this owned clone is tampered with; archive and recorded hashes stay intact.
    const source = join(historical, 'indexer/api/server.ts');
    const sourceBytes = await readFile(source);
    try {
      await writeFile(source, Buffer.concat([sourceBytes, Buffer.from('\n// SC06 negative working-source mutation\n')]));
      await run(process.execPath, ['--import', 'tsx', 'scripts/check_sc06_chain.mjs', savedArchive], historical,
        process.env, /working source differs: indexer\/api\/server\.ts/);
    } finally {
      await writeFile(source, sourceBytes);
    }

    // Current integration gets its own real-chain fixture, never a relabeled v1.
    await run('forge', ['build']);
    const current = join(temp, 'current');
    await run(process.execPath, ['--import', 'tsx', 'scripts/generate_sc06_chain.mjs', current]);
    const fixture = join(current, 'chain.json');
    await run(process.execPath, ['--import', 'tsx', 'scripts/check_sc06_chain.mjs', fixture]);
    await run(process.execPath, ['--import', 'tsx', '--test', 'tests/sc06-chain.test.mjs'], root,
      { ...process.env, SC06_FIXTURE: fixture });
    console.log(`SC06 verified: historical ${original.generation.sourceCommit}; current ${revision} (live generation, strict offline check and mutations)`);
  } finally {
    try { await life.cleanup(); } finally { life.dispose(); }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await verifyVersions();
