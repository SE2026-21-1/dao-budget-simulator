import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const repository = 'SE2026-21-1/dao-budget-simulator';
const services = ['frontend', 'api', 'indexer'];
const hash = (data) => createHash('sha256').update(data).digest('hex');
export async function migrationFingerprint(directory = 'database/migrations') {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  assert(names.length > 0, 'No migrations found');
  return hash((await Promise.all(names.map(async (name) => `${name}:${hash(await readFile(join(directory, name)))}\n`))).join(''));
}
export function validateManifest(manifest, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/, 'Expected full lowercase commit SHA');
  assert.deepEqual(Object.keys(manifest).sort(), ['schemaVersion', 'repository', 'sha', 'runId', 'images', 'migrationSet'].sort(), 'Unexpected manifest fields');
  assert.equal(manifest.schemaVersion, 1, 'Unsupported release manifest');
  assert.equal(manifest.repository, repository, 'Wrong release repository');
  assert.equal(manifest.sha, sha, 'Release SHA mismatch');
  assert.match(manifest.runId, /^[1-9][0-9]*$/, 'Invalid CI run ID');
  assert.match(manifest.migrationSet, /^[a-f0-9]{64}$/, 'Invalid migration fingerprint');
  assert.deepEqual(Object.keys(manifest.images).sort(), [...services].sort(), 'Release must contain exactly three images');
  for (const service of services) {
    assert.match(manifest.images[service], new RegExp(`^ghcr\\.io/${repository.toLowerCase()}/${service}@sha256:[a-f0-9]{64}$`), `Invalid ${service} digest reference`);
  }
  return manifest;
}
export function validateRun(run, manifest) {
  assert.equal(String(run.id), manifest.runId, 'CI run ID mismatch');
  assert.equal(run.head_sha, manifest.sha, 'CI SHA mismatch');
  assert.equal(run.head_branch, 'Dev', 'Only the integration branch Dev can release');
  assert.equal(run.event, 'push', 'Only trusted push runs can release');
  assert.equal(run.path, '.github/workflows/ci.yml', 'Wrong release workflow');
  assert.equal(run.name, 'TV4 CI', 'Wrong release workflow name');
  assert.equal(run.head_repository?.full_name, repository, 'Wrong source repository');
  assert.equal(run.status, 'completed', 'CI has not completed');
  assert.equal(run.conclusion, 'success', 'CI did not succeed');
}
async function api(path, token, binary = false) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(60000),
  });
  assert(response.ok, `GitHub API request failed (${response.status}); check actions:read permission`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}
export async function verifyOnline(manifest, token = process.env.GH_TOKEN) {
  validateManifest(manifest, manifest.sha);
  const run = await api(`actions/runs/${manifest.runId}`, token);
  validateRun(run, manifest);
  const artifacts = await api(`actions/runs/${manifest.runId}/artifacts?per_page=100`, token);
  const matches = artifacts.artifacts.filter((entry) => entry.name === `release-${manifest.sha}` && !entry.expired);
  assert.equal(matches.length, 1, 'Exactly one unexpired complete release artifact is required');
  const directory = await mkdtemp(join(tmpdir(), 'dao-release-'));
  try {
    const archive = join(directory, 'release.zip');
    await writeFile(archive, await api(`actions/artifacts/${matches[0].id}/zip`, token, true));
    const published = JSON.parse(execFileSync('unzip', ['-p', archive, 'manifest.json'], { maxBuffer: 65536, encoding: 'utf8' }));
    assert.deepEqual(published, manifest, 'Manifest differs from the successful CI artifact');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export function imageEnvironment(manifest) {
  return services.map((service) => `${service.toUpperCase()}_IMAGE=${manifest.images[service]}\n`).join('');
}
async function downloadRelease(sha, manifestPath, token = process.env.GH_TOKEN) {
  const runs = await api(`actions/workflows/ci.yml/runs?branch=Dev&event=push&status=success&head_sha=${sha}&per_page=100`, token);
  const candidates = runs.workflow_runs.filter((run) => run.head_sha === sha && run.head_branch === 'Dev' && run.event === 'push');
  assert(candidates.length > 0, 'No successful trusted release workflow for requested SHA');
  const run = candidates[0];
  const artifacts = await api(`actions/runs/${run.id}/artifacts?per_page=100`, token);
  const matches = artifacts.artifacts.filter((entry) => entry.name === `release-${sha}` && !entry.expired);
  assert.equal(matches.length, 1, 'No complete unexpired release manifest for requested SHA');
  const directory = await mkdtemp(join(tmpdir(), 'dao-release-'));
  try {
    const archive = join(directory, 'release.zip');
    await writeFile(archive, await api(`actions/artifacts/${matches[0].id}/zip`, token, true));
    const manifest = validateManifest(JSON.parse(execFileSync('unzip', ['-p', archive, 'manifest.json'], { maxBuffer: 65536, encoding: 'utf8' })), sha);
    validateRun(run, manifest);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(dirname(manifestPath), 'release.env'), imageEnvironment(manifest), { mode: 0o600 });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function main(args) {
  const command = args.shift();
  const options = {};
  while (args.length) {
    const key = args.shift();
    assert(['--sha', '--manifest', '--run-id', '--migrations'].includes(key) && args.length, 'Invalid release arguments');
    assert(!(key in options), 'Duplicate argument');
    options[key] = args.shift();
  }
  const sha = options['--sha'];
  assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'Expected --sha with full lowercase commit SHA');
  const manifestPath = resolve(options['--manifest'] ?? 'manifest.json');
  if (command === 'download') {
    await downloadRelease(sha, manifestPath);
  } else if (command === 'create') {
    const manifest = { schemaVersion: 1, repository, sha, runId: options['--run-id'], images: {}, migrationSet: await migrationFingerprint(options['--migrations']) };
    for (const service of services) manifest.images[service] = process.env[`${service.toUpperCase()}_IMAGE`];
    validateManifest(manifest, sha);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  } else {
    assert(['verify', 'verify-local'].includes(command), 'Use create, download, verify or verify-local');
    const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')), sha);
    if (options['--migrations']) assert.equal(await migrationFingerprint(options['--migrations']), manifest.migrationSet, 'Release migration set differs from source');
    if (command === 'verify') await verifyOnline(manifest);
    // Local validation is deliberately not proof of publication or successful CI.
    if (command === 'verify') await writeFile(join(dirname(manifestPath), 'release.env'), imageEnvironment(manifest), { mode: 0o600 });
  }
  process.stdout.write(`${command}: ${sha}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`Release verification failed: ${error.message}\n`); process.exitCode = 1; }
}
