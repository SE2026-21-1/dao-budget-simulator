import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '../../scripts/governance_local.mjs';

test('incomplete and mismatched recursive checkouts fail before compiler artifact access', async t => {
  const base = await mkdtemp(join(tmpdir(), 'tv4-dependency-provenance-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const hooks = join(base, 'empty-hooks');
  await mkdir(hooks);
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'protocol.file.allow=always',
    '-c', `core.hooksPath=${hooks}`, '-c', 'user.name=TV4 isolated test',
    '-c', 'user.email=tv4-test@example.invalid', ...args],
  { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const init = async name => {
    const path = join(base, name);
    await mkdir(path);
    git(path, 'init', '--quiet');
    return path;
  };
  const commit = path => { git(path, 'add', '.'); git(path, 'commit', '--quiet', '-m', 'isolated fixture'); return git(path, 'rev-parse', 'HEAD'); };
  const leaf = await init('leaf');
  await writeFile(join(leaf, 'version'), 'pinned\n');
  const pinned = commit(leaf);
  await writeFile(join(leaf, 'version'), 'other revision\n');
  const other = commit(leaf);
  const top = await init('top');
  git(top, 'submodule', 'add', '--quiet', leaf, 'nested');
  git(join(top, 'nested'), 'checkout', '--quiet', pinned);
  commit(top);
  const root = await init('root');
  git(root, 'submodule', 'add', '--quiet', top, 'dependency');
  commit(root);
  // Top-level initialization alone leaves the nested gitlink uninitialized.
  // Without the guard this reaches missing artifact files instead of rejecting
  // the incomplete build context first.
  await assert.rejects(loadProject(root), { code: 'ERR_ASSERTION' });
  git(root, 'submodule', 'update', '--init', '--recursive');
  git(join(root, 'dependency', 'nested'), 'checkout', '--quiet', other);
  await assert.rejects(loadProject(root), { code: 'ERR_ASSERTION' });
});
