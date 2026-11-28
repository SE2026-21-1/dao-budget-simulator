// Environment evidence only: an owned empty Anvil, repository deploy preflight,
// and guaranteed shutdown. This does not exercise BE03 ingestion.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRpc } from '../../../scripts/governance_local.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = fileURLToPath(new URL('./', import.meta.url));
const executable = join(root, 'dist/be03-tools/package/bin/anvil.exe');
const cast = join(root, 'dist/be03-tools/cast-1.7.1/package/bin/cast.exe');
const report = { recordedAt: new Date().toISOString(), classification: 'environment preflight, no ingestion', executable };
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const url = `http://127.0.0.1:${port}`;
const args = ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'osaka', '--silent'];
Object.assign(report, { command: [executable, ...args], rpcUrl: url });
const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = ''; let stderr = ''; let launchError;
child.stdout.on('data', (d) => { stdout += d; });
child.stderr.on('data', (d) => { stderr += d; });
child.on('error', (error) => { launchError = error.message; });
const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));

async function run(exe, arguments_) {
  const process = spawn(exe, arguments_, { cwd: root, windowsHide: true, timeout: 15000 });
  let out = ''; let err = '';
  process.stdout.on('data', (d) => { out += d; });
  process.stderr.on('data', (d) => { err += d; });
  let error;
  process.on('error', (e) => { error = e.message; });
  const [exitCode, signal] = await once(process, 'close');
  return { command: [exe, ...arguments_], exitCode, signal, stdout: out.trim(), stderr: err.trim(), ...(error ? { error } : {}) };
}

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (launchError || child.exitCode !== null) throw new Error(launchError ?? `Anvil exited: ${child.exitCode}; ${stderr}`);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(500) });
      if ((await response.json()).result === '0x7a69') { ready = true; break; }
    } catch { /* Wait for this owned process to bind its port. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Owned Anvil did not become ready');
  const rpc = createRpc(url);
  Object.assign(report, { pid: child.pid, clientVersion: await rpc('web3_clientVersion'), chainId: String(BigInt(await rpc('eth_chainId'))),
    metadata: await rpc('anvil_metadata'), genesis: await rpc('eth_getBlockByNumber', ['0x0', false]) });
  assert.equal(report.metadata.forkedNetwork, null);
  assert.equal(await rpc('eth_blockNumber'), '0x0');
  report.castRpc = await run(cast, ['chain-id', '--rpc-url', url]);
  assert.equal(report.castRpc.exitCode, 0);
  assert.equal(report.castRpc.stdout, '31337');
  const artifacts = ['GovernanceToken', 'BudgetToken', 'Treasury', 'TimelockController', 'BudgetGovernor'];
  report.artifacts = [];
  for (const name of artifacts) {
    const path = `out/${name}.sol/${name}.json`;
    let exists = true;
    try { await access(join(root, path)); } catch { exists = false; }
    report.artifacts.push({ path, exists, provenanceVerified: false });
  }
  assert.ok(report.artifacts.every((a) => !a.exists), 'This probe expects missing compiler artifacts; reassess before deploying');
  report.deploymentAttempt = await run(process.execPath, ['scripts/deploy_local.mjs', '--rpc', url, '--output', join(evidence, 'new-instance-manifest.json')]);
  assert.equal(report.deploymentAttempt.exitCode, 1);
  assert.match(report.deploymentAttempt.stderr, /ENOENT.*GovernanceToken\.json/);
  report.headAfterDeployAttempt = String(BigInt(await rpc('eth_blockNumber')));
  assert.equal(report.headAfterDeployAttempt, '0');
  report.deploymentManifestExists = await readFile(join(evidence, 'new-instance-manifest.json')).then(() => true, () => false);
  assert.equal(report.deploymentManifestExists, false);
  report.newTransactionsSent = false;
  report.deploymentAddresses = null;
  report.transactionHashes = [];
  report.status = 'PREFLIGHT_PASS_INTEGRATION_BLOCKED';
} catch (error) {
  report.error = error.message;
  report.status = 'PREFLIGHT_FAILED';
  process.exitCode = 1;
} finally {
  child.kill();
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  report.shutdown = await closed;
  clearTimeout(timeout);
  report.processStopped = true;
  report.anvilStdout = stdout.trim(); report.anvilStderr = stderr.trim();
  report.rpcUnavailableAfterStop = await fetch(url, { signal: AbortSignal.timeout(1000) }).then(() => false, () => true);
  if (!report.rpcUnavailableAfterStop) { report.status = 'CLEANUP_FAILED'; process.exitCode = 1; }
  await writeFile(join(evidence, 'anvil-preflight.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, chainId: report.chainId, head: report.headAfterDeployAttempt, cast: report.castRpc?.exitCode,
    deploy: report.deploymentAttempt?.exitCode, processStopped: report.processStopped, rpcUnavailableAfterStop: report.rpcUnavailableAfterStop, error: report.error }));
}
