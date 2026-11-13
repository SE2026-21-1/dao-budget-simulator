#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { ContractFactory, getAddress, toQuantity } from 'ethers';
import { createRpc, loadProject } from './governance_local.mjs';
import { SEPOLIA, confirmedHeight, deploySepolia, requireSepolia, validateRoleMap } from './governance_sepolia.mjs';
import { journal, options } from './sepolia_cli.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const args = options(process.argv.slice(2), ['--accounts', '--output']);
const persist = await journal(args['--output']);
const root = fileURLToPath(new URL('../', import.meta.url));
const report = { format: 'dao-budget-sepolia-preflight-v1', status: 'IN_PROGRESS', network: SEPOLIA,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  broadcastTransactions: 0, remoteRequests: [], limitations: [
    'No signer/gas permission or testnet deployment. Fork impersonation and balance overrides are disposable only.',
    'Fork uses pinned Sepolia state with Anvil Osaka execution, not proof of future remote gas accounting.',
    'No real-time Executed/Defeated, extension wallet, backend or UI acceptance.' ] };
let child;
try {
  const remoteTransport = createRpc(SEPOLIA.rpc);
  const remote = async (method, params = []) => {
    assert.ok(!method.startsWith('eth_send') && !method.startsWith('anvil_'), 'Remote transport is read-only');
    const entry = { method, params };
    report.remoteRequests.push(entry);
    try { entry.result = await remoteTransport(method, params); return entry.result; }
    catch (error) { entry.error = error.message; throw error; }
    finally { await persist(report); }
  };
  await requireSepolia(remote);
  const height = await confirmedHeight(remote);
  const block = await remote('eth_getBlockByNumber', [height, false]);
  report.anchor = { height: String(BigInt(height)), hash: block.hash, timestamp: String(BigInt(block.timestamp)) };
  const { artifacts, provenance } = await loadProject(root);
  report.provenance = provenance;
  // '-' means explicitly synthetic public addresses, never owner-approved for broadcast.
  const roleMap = args['--accounts'] === '-' ? { format: 'dao-budget-sepolia-accounts-v1', chainId: SEPOLIA.chainId,
    signerOwner: 'UNAPPROVED_SYNTHETIC_FORK_ONLY', approvedSourceCommit: report.sourceCommit,
    accounts: Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider']
      .map((name, index) => [name, getAddress(`0x${(0x1001 + index).toString(16).padStart(40, '0')}`)])) }
    : JSON.parse(await readFile(args['--accounts'], 'utf8'));
  validateRoleMap(roleMap, report.sourceCommit);
  report.roleMap = roleMap;
  report.ownerApprovedAddresses = args['--accounts'] !== '-';
  // First independent constructor estimated by real remote EVM at the pinned anchor.
  // Explicit state override supplies synthetic gas funds; it never changes chain state.
  const creation = await new ContractFactory(artifacts.GOV.abi, artifacts.GOV.bytecode.object)
    .getDeployTransaction(...['A', 'B', 'C', 'D'].map(name => roleMap.accounts[name]));
  try {
    report.remoteGovCreationGas = await remote('eth_estimateGas', [{ from: roleMap.accounts.deployer,
      data: creation.data }, height, { [roleMap.accounts.deployer]: { balance: toQuantity(10n ** 21n) } }]);
  } catch (error) { report.remoteEstimateUnavailable = error.message; }
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const forkArgs = ['--host', '127.0.0.1', '--port', String(port), '--chain-id', SEPOLIA.chainId,
    '--fork-url', SEPOLIA.rpc, '--fork-block-number', report.anchor.height, '--hardfork', 'osaka', '--silent'];
  report.forkCommand = ['anvil', ...forkArgs];
  report.forkOutput = '';
  child = spawn('anvil', forkArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', error => { report.forkOutput += error.message; });
  child.stdout.on('data', data => { report.forkOutput += data; });
  child.stderr.on('data', data => { report.forkOutput += data; });
  const forkRpc = createRpc(`http://127.0.0.1:${port}`);
  const deadline = Date.now() + 60000;
  while (true) {
    assert.equal(child.exitCode, null, `Fork exited: ${report.forkOutput}`);
    assert.ok(Date.now() < deadline, 'Fork startup timeout');
    try { if (await forkRpc('eth_chainId') === toQuantity(BigInt(SEPOLIA.chainId))) break; } catch { /* bounded startup */ }
    await pause(100);
  }
  await requireSepolia(forkRpc);
  const metadata = await forkRpc('anvil_metadata');
  assert.equal(BigInt(metadata.forkedNetwork?.forkBlockNumber), BigInt(height), 'Wrong fork block');
  const forkAnchor = await forkRpc('eth_getBlockByNumber', [height, false]);
  assert.equal(forkAnchor.hash, block.hash, 'Fork anchor differs from remote');
  report.forkMetadata = metadata;
  for (const address of Object.values(roleMap.accounts)) {
    await forkRpc('anvil_impersonateAccount', [address]);
    await forkRpc('anvil_setBalance', [address, toQuantity(10n ** 21n)]);
  }
  const forkManifestWriter = await journal(`${args['--output']}.fork.json`);
  report.forkManifest = await deploySepolia(forkRpc, { root, roleMap, fork: true,
    maxFeePerGas: '1000000000000', maxTotalCost: String(10n ** 21n), persist: forkManifestWriter,
    transmit: async transaction => {
      const { chainId, gasLimit, type, ...request } = transaction;
      const hash = await forkRpc('eth_sendTransaction', [{ ...request, gas: gasLimit }]);
      await forkRpc('anvil_mine', ['0x2']);
      return hash;
    } });
  const again = await remote('eth_getBlockByNumber', [height, false]);
  assert.equal(again.hash, block.hash, 'Remote fork anchor reorganized');
  report.status = 'DISPOSABLE_FORK_PREPARATION_PASS_NOT_TESTNET';
} catch (error) {
  report.status = 'PREPARATION_BLOCKED_OR_FAILED_NOT_TESTNET';
  report.error = { message: error.message, audit: error.audit ?? null };
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', (code, signal) => { report.forkExit = { code, signal }; resolve(); }));
    child.kill('SIGTERM');
    await exited;
  }
  await persist(report);
}
console.log(JSON.stringify({ status: report.status, output: args['--output'], anchor: report.anchor,
  remoteGovCreationGas: report.remoteGovCreationGas, error: report.error }, null, 2));
