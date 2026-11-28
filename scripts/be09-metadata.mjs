#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalRun, assertOwnedProcess } from './be09-safety.mjs';
import { validateRpcAllocation } from './be09-rpc.mjs';
import { sourceProvenance } from './be09-provenance.mjs';

const databaseUrl = 'postgresql://be09@127.0.0.1:55432/dao_budget_be09';
const fixedUrls = { api: 'http://127.0.0.1:3300', frontend: 'http://127.0.0.1:5173' };
const artifacts = ['run-id', 'runtime.json', 'runtime.env', 'worker.env', 'frontend.env', 'indexer-config.json', 'public/manifest.json', 'reports/governance-seed.json', 'reports/source-provenance.json'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ref) => execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
const sourcePaths = ['scripts', 'indexer', 'database', 'frontend/src', 'frontend/vite.config.ts', 'package.json', 'package-lock.json', 'frontend/package.json', 'frontend/package-lock.json'];
function workingSource(root) {
  const options = { cwd: root };
  return {
    diffSha256: digest(execFileSync('git', ['diff', '--binary', 'HEAD', '--', ...sourcePaths], options)),
    status: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', ...sourcePaths], { ...options, encoding: 'utf8' }),
  };
}
export function runScope(stateRoot, requested = 'ordinary') {
  assert.ok(['ordinary', 'issue40'].includes(requested), 'Unknown BE09_SCOPE');
  return basename(stateRoot).startsWith('dao-budget-issue40-lifecycle-') ? 'issue40' : requested;
}
async function checkedFile(runDir, relative) {
  const file = join(runDir, relative);
  // Every component must remain inside this exact run, not merely share a prefix.
  let current = runDir;
  for (const part of relative.split('/')) {
    current = join(current, part);
    assert.equal((await lstat(current)).isSymbolicLink(), false, `Symlink artifact: ${relative}`);
    assert.equal(await realpath(current), current, `Noncanonical artifact: ${relative}`);
  }
  assert.equal((await lstat(file)).isFile(), true, `Not a regular artifact: ${relative}`);
  return readFile(file);
}
export function parseRunEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    assert.ok(at > 0, 'Malformed run environment');
    const key = line.slice(0, at);
    assert.match(key, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(!Object.hasOwn(env, key), `Duplicate environment key: ${key}`);
    env[key] = line.slice(at + 1);
  }
  return env;
}
export async function initializeRun({ root, stateRoot, runDir, rpcUrl, scope = 'ordinary' }) {
  const paths = await canonicalRun({ root, stateRoot, runDir });
  scope = runScope(paths.stateRoot, scope);
  validateRpcAllocation(rpcUrl, scope);
  if (scope === 'issue40') assert.match(paths.stateRoot, /\/dao-budget-issue40-lifecycle-[A-Za-z0-9-]+$/, 'Issue40 requires a private per-attempt root');
  assert.equal(await realpath(join(paths.root, 'scripts/be09-register.mjs')), join(paths.root, 'scripts/be09-register.mjs'), 'Registration must belong to the canonical checkout');
  const sourceCommit = git(paths.root, 'HEAD');
  const identity = { format: 'dao-budget-be09-identity-v1', ...paths, scope, rpcUrl, urls: { rpc: rpcUrl, ...fixedUrls }, databaseUrl, sourceCommit, sourceTree: git(paths.root, 'HEAD^{tree}'), source: await sourceProvenance(paths.root, sourceCommit) };
  identity.workingSource = workingSource(paths.root);
  assert.equal((await checkedFile(runDir, 'run-id')).toString().trim(), paths.runId);
  await writeFile(join(runDir, 'run-identity.json'), JSON.stringify(identity, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return identity;
}
async function baseIdentity(options) {
  const paths = await canonicalRun(options);
  const identity = JSON.parse(await checkedFile(paths.runDir, 'run-identity.json'));
  assert.equal(identity.format, 'dao-budget-be09-identity-v1');
  for (const [key, value] of Object.entries(paths)) assert.equal(identity[key], value, `Cross-run ${key}`);
  assert.equal(identity.scope, runScope(paths.stateRoot, identity.scope));
  if (identity.scope === 'issue40') assert.match(paths.stateRoot, /\/dao-budget-issue40-lifecycle-[A-Za-z0-9-]+$/);
  if (options.scope !== undefined) assert.ok(['ordinary', 'issue40'].includes(options.scope), 'Unknown requested scope');
  if (options.scope === 'issue40') assert.equal(identity.scope, 'issue40', 'Requested Issue40 scope differs from persisted allocation');
  assert.deepEqual(identity.workingSource, workingSource(paths.root), 'Working source changed since bootstrap');
  validateRpcAllocation(identity.rpcUrl, identity.scope);
  assert.deepEqual(identity.urls, { rpc: identity.rpcUrl, ...fixedUrls }, 'Endpoint allocation mismatch');
  assert.equal(identity.databaseUrl, databaseUrl);
  assert.equal(identity.sourceCommit, git(paths.root, 'HEAD'), 'Source revision mismatch');
  assert.equal(identity.sourceTree, git(paths.root, 'HEAD^{tree}'), 'Source tree mismatch');
  assert.deepEqual(identity.source, await sourceProvenance(paths.root, identity.sourceCommit), 'Source artifact mismatch');
  assert.equal((await checkedFile(paths.runDir, 'run-id')).toString().trim(), paths.runId);
  return identity;
}
async function runtimeArtifacts(identity) {
  const bytes = {};
  for (const name of artifacts) bytes[name] = await checkedFile(identity.runDir, name);
  const json = name => JSON.parse(bytes[name]);
  const runtime = json('runtime.json');
  const manifest = json('public/manifest.json');
  const seed = json('reports/governance-seed.json');
  const config = json('indexer-config.json');
  const env = parseRunEnv(bytes['runtime.env'].toString());
  const workerEnv = parseRunEnv(bytes['worker.env'].toString());
  const frontendEnv = parseRunEnv(bytes['frontend.env'].toString());
  assert.equal(runtime.format, 'dao-budget-be09-runtime-v1');
  assert.equal(runtime.runtimeDir, identity.runDir);
  assert.equal(runtime.runId, identity.runId);
  assert.equal(runtime.sourceCommit, identity.sourceCommit);
  assert.deepEqual(runtime.urls, identity.urls);
  assert.equal(runtime.chainId, '31337');
  assert.match(runtime.deploymentName, /^be09-local-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/);
  assert.match(runtime.deploymentId, /^[1-9][0-9]*$/);
  assert.match(runtime.proposalId, /^(0|[1-9][0-9]*)$/);
  for (const [key, relative] of Object.entries({ manifest: 'public/manifest.json', seedReport: 'reports/governance-seed.json', indexerConfig: 'indexer-config.json', workerEnv: 'worker.env' })) assert.equal(runtime[key], join(identity.runDir, relative), `Cross-run runtime.${key}`);
  assert.equal(manifest.sourceCommit, identity.sourceCommit);
  assert.equal(manifest.format, 'dao-budget-local-governance-v1');
  assert.equal(manifest.chainId, runtime.chainId);
  assert.equal(manifest.confirmations, '2');
  assert.equal(seed.sourceCommit, identity.sourceCommit);
  assert.equal(seed.status, 'PASS');
  assert.equal(seed.chainId, runtime.chainId);
  assert.equal(seed.proposalId, runtime.proposalId);
  assert.equal(config.rpcUrl, identity.rpcUrl);
  assert.equal(config.chainId, runtime.chainId);
  assert.equal(config.deploymentId, runtime.deploymentId);
  assert.equal(env.RPC_URL, identity.rpcUrl);
  assert.equal(env.BE05_LIVE_RPC_URL, identity.rpcUrl);
  assert.equal(workerEnv.RPC_URL, identity.rpcUrl);
  assert.equal(env.DATABASE_URL, databaseUrl);
  assert.equal(workerEnv.DATABASE_URL, databaseUrl);
  assert.equal(env.API_HOST, '127.0.0.1');
  assert.equal(env.API_PORT, '3300');
  assert.equal(env.API_CORS_ORIGINS, fixedUrls.frontend);
  assert.equal(env.DEPLOYMENT_NAME, runtime.deploymentName);
  assert.equal(env.BE05_LIVE_API_URL, fixedUrls.api);
  assert.equal(env.BE05_LIVE_CHAIN_ID, runtime.chainId);
  assert.equal(env.BE05_LIVE_DEPLOYMENT_ID, runtime.deploymentName);
  assert.equal(frontendEnv.VITE_RPC_URL, identity.rpcUrl);
  assert.equal(frontendEnv.VITE_API_BASE_URL, fixedUrls.api);
  assert.equal(frontendEnv.VITE_CHAIN_ID, runtime.chainId);
  assert.equal(frontendEnv.VITE_DEPLOYMENT_ID, runtime.deploymentName);
  assert.equal(frontendEnv.DAO_VITE_CACHE_DIR, join(identity.runDir, 'cache/vite'));
  assert.deepEqual(json('reports/source-provenance.json'), identity.source);
  return { runtime, env, config, manifest, seed, sha256: Object.fromEntries(Object.entries(bytes).map(([name, value]) => [name, digest(value)])) };
}
export async function sealRun(options) {
  const identity = await baseIdentity(options);
  const { sha256 } = await runtimeArtifacts(identity);
  const seal = { runId: identity.runId, sourceCommit: identity.sourceCommit, identitySha256: digest(await checkedFile(identity.runDir, 'run-identity.json')), sha256 };
  await writeFile(join(identity.runDir, 'artifact-seal.json'), JSON.stringify(seal, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export async function validateRun(options) {
  const identity = await baseIdentity(options);
  const data = await runtimeArtifacts(identity);
  const seal = JSON.parse(await checkedFile(identity.runDir, 'artifact-seal.json'));
  assert.equal(seal.runId, identity.runId);
  assert.equal(seal.sourceCommit, identity.sourceCommit);
  assert.equal(seal.identitySha256, digest(await checkedFile(identity.runDir, 'run-identity.json')));
  assert.deepEqual(seal.sha256, data.sha256, 'Run artifact integrity mismatch');
  return { identity, ...data };
}
export async function assertRunLive({ identity }) {
  for (const [label, port] of [['anvil', Number(new URL(identity.rpcUrl).port)], ['postgres', 55432], ['worker', undefined], ['api', 3300], ['frontend', 5173]]) await assertOwnedProcess({ runDir: identity.runDir, label, port });
}
export async function probeRun(options, fetcher = fetch, liveGuard = assertRunLive) {
  const data = await validateRun(options);
  // Recheck the whole tuple before each network call; never use a terminal override.
  await liveGuard(data);
  const response = await fetcher(data.runtime.urls.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(2000) });
  assert.equal((await response.json()).result, '0x7a69', 'RPC chain mismatch');
  await liveGuard(data);
  const health = new URL('/api/health', data.runtime.urls.api);
  health.searchParams.set('chainId', data.runtime.chainId);
  health.searchParams.set('deploymentId', data.runtime.deploymentName);
  const api = await fetcher(health, { signal: AbortSignal.timeout(2500) });
  const body = await api.json();
  assert.equal(api.status, 200);
  assert.equal(body.data?.publication, 'ready');
  assert.equal(body.data?.indexer, 'synced');
  await liveGuard(data);
  assert.equal((await fetcher(`${data.runtime.urls.frontend}/`, { signal: AbortSignal.timeout(2500) })).status, 200);
  return data.runtime;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, root, stateRoot, runDir, rpcUrl, scope] = process.argv.slice(2);
  const options = { root, stateRoot, runDir, rpcUrl, scope };
  try {
    if (action === 'init') await initializeRun(options);
    else if (action === 'seal') await sealRun(options);
    else if (action === 'cleanup') await baseIdentity(options);
    else if (action === 'validate' || action === 'live') {
      const data = await validateRun(options);
      if (action === 'live') await assertRunLive(data);
      console.log(JSON.stringify(data.runtime));
    } else if (action === 'rpc-url') console.log((await validateRun(options)).runtime.urls.rpc);
    else if (action === 'probe') { await probeRun(options); console.log('RPC chain=31337; API HTTP=200 publication=ready; frontend HTTP=200'); }
    else throw new Error('Unknown metadata operation');
  } catch (error) { console.error(`BE09 metadata: ${error.message}`); process.exitCode = 1; }
}
