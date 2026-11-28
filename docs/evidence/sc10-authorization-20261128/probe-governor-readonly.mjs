#!/usr/bin/env node
// Evidence runner only. No wallets, signing, send methods, or persistent chain writes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [rootArg, output, heightArg] = process.argv.slice(2);
assert.ok(rootArg && output, 'Usage: node probe-governor-readonly.mjs PROJECT_ROOT NEW_OUTPUT_JSON [HEIGHT]');
const root = resolve(rootArg);
const expectedSource = 'e17ef61a8a51518005c38b0808cdc06fe7a68bbf';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
assert.equal(git('diff', expectedSource, '--', 'contracts', 'scripts', 'shared/abi', 'lib', 'foundry.toml', 'foundry.lock', 'package-lock.json', '.gitmodules'), '', 'Deployment inputs differ from proposed revision');
const { createRpc, loadProject, constructorArgs } = await import(pathToFileURL(resolve(root, 'scripts/governance_local.mjs')));
const { SEPOLIA, requireSepolia, gasLimit } = await import(pathToFileURL(resolve(root, 'scripts/governance_sepolia.mjs')));
const { ContractFactory, getAddress, getCreateAddress, keccak256, toQuantity } = createRequire(resolve(root, 'package.json'))('ethers');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { format: 'sc10-governor-readonly-gas-v1', proposedDeploymentSource: expectedSource,
  runnerCheckoutRevision: git('rev-parse', 'HEAD'), runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  startedAt: new Date().toISOString(), rpc: SEPOLIA.rpc, status: 'IN_PROGRESS', remoteBroadcasts: 0,
  ownerApprovedAddresses: false, requests: [], checks: [], limitations: [
    'All account and dependency addresses are synthetic; overrides exist only for RPC simulation.',
    'Dependency runtime templates have compiler placeholder immutables and no historical storage. They are adequate for Governor constructor calls clock/CLOCK_MODE only; this is not full bootstrap simulation.',
    'eth_call/estimate success is not txpool admission, builder inclusion, signing, or an actual deployment receipt.',
    'Total-gas success does not measure execution/state gas separately. Protocol interpretation also relies on cited fork specifications.',
    'No actual account-map estimates, native balances, owner acceptance or broadcast authorization.' ] };
const allowed = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getTransactionCount', 'eth_getCode', 'eth_estimateGas', 'eth_call', 'eth_gasPrice']);
const transport = createRpc(SEPOLIA.rpc);
async function rpc(method, params = []) {
  assert.ok(allowed.has(method), 'Only read-only RPC methods are allowed');
  // Large public bytecode is represented by hashes in evidence; source and runner reconstruct it.
  const row = { method, calledAt: new Date().toISOString(), paramsSha256: sha(JSON.stringify(params)) };
  if (['eth_call', 'eth_estimateGas'].includes(method)) row.request = {
    transaction: { ...params[0], data: { bytes: (params[0].data.length - 2) / 2, keccak256: keccak256(params[0].data) } },
    block: params[1], overrides: Object.fromEntries(Object.entries(params[2] ?? {}).map(([address, state]) => [address, {
      ...state, ...(state.code ? { code: { bytes: (state.code.length - 2) / 2, keccak256: keccak256(state.code) } } : {}) }])) };
  else row.params = params;
  report.requests.push(row);
  try { const result = await transport(method, params);
    row.result = method === 'eth_call' ? { bytes: (result.length - 2) / 2, keccak256: keccak256(result) } : result;
    return result;
  } catch (error) { row.error = error.message; throw error; }
}
try {
  await requireSepolia(rpc);
  const head = BigInt(await rpc('eth_blockNumber'));
  const height = heightArg ? BigInt(heightArg) : head - 2n;
  assert.ok(height <= head - 2n, 'Anchor must have K=2 descendants');
  const tag = toQuantity(height);
  const block = await rpc('eth_getBlockByNumber', [tag, false]);
  report.anchor = { height: String(height), hash: block.hash, timestamp: String(BigInt(block.timestamp)),
    gasLimit: String(BigInt(block.gasLimit)), observedHead: String(head) };
  const { artifacts, provenance } = await loadProject(root);
  report.artifactProvenance = provenance.artifacts;
  report.sourceHashes = provenance.sourceHashes;
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider']
    .map((name, index) => [name, getAddress(`0x${(0x1001 + index).toString(16).padStart(40, '0')}`)]));
  report.syntheticAccounts = accounts;
  const nonce = BigInt(await rpc('eth_getTransactionCount', [accounts.deployer, tag]));
  const names = Object.keys(artifacts);
  const contracts = Object.fromEntries(names.map((key, i) => [key, { address: getCreateAddress({ from: accounts.deployer, nonce: nonce + BigInt(i) }) }]));
  const index = names.indexOf('Governor');
  assert.ok(index >= 0);
  assert.equal(await rpc('eth_getCode', [contracts.Governor.address, tag]), '0x');
  const overrides = { [accounts.deployer]: { balance: toQuantity(10n ** 21n), nonce: toQuantity(nonce + BigInt(index)) } };
  for (const previous of names.slice(0, index)) overrides[contracts[previous].address] = { code: artifacts[previous].deployedBytecode.object };
  const deployment = await new ContractFactory(artifacts.Governor.abi, artifacts.Governor.bytecode.object)
    .getDeployTransaction(...constructorArgs('Governor', { accounts, contracts }));
  const transaction = { from: accounts.deployer, data: deployment.data, value: '0x0', nonce: toQuantity(nonce + BigInt(index)) };
  const estimate = BigInt(await rpc('eth_estimateGas', [transaction, tag, overrides]));
  const padded = gasLimit(estimate);
  report.governor = { predictedAddress: contracts.Governor.address, creationBytes: (deployment.data.length - 2) / 2,
    initcodeKeccak256: keccak256(deployment.data), estimate: String(estimate), gasLimitWith20Percent: String(padded),
    runtimeTemplateBytes: (artifacts.Governor.deployedBytecode.object.length - 2) / 2 };
  assert.ok(padded <= BigInt(block.gasLimit), 'Padded total gas exceeds observed block limit');
  assert.ok(padded <= 4294967295n, 'Padded total gas exceeds EIP-8037 total limit');
  report.checks.push({ name: 'governor_total_gas_limits', result: 'PASS' });
  for (const [name, gas, expectedSuccess] of [['old_total_cap', 16777216n, false], ['estimate_plus_headroom', padded, true]]) {
    const check = { name, gas: String(gas), expectedSuccess };
    report.checks.push(check);
    let returned, failure;
    try { returned = await rpc('eth_call', [{ ...transaction, gas: toQuantity(gas) }, tag, overrides]); }
    catch (error) { failure = error.message; }
    check.observedSuccess = !failure;
    if (failure) check.error = failure;
    assert.equal(!failure, expectedSuccess, `${name}: unexpected RPC outcome`);
    if (expectedSuccess) {
      const template = artifacts.Governor.deployedBytecode.object;
      assert.equal(returned.length, template.length, 'Unexpected constructor return length');
      const normalized = Buffer.from(returned.slice(2), 'hex');
      const expected = Buffer.from(template.slice(2), 'hex');
      for (const refs of Object.values(artifacts.Governor.deployedBytecode.immutableReferences ?? {}))
        for (const { start, length } of refs) { normalized.fill(0, start, start + length); expected.fill(0, start, start + length); }
      assert.deepEqual(normalized, expected, 'Constructor runtime differs outside compiler-declared immutable ranges');
      check.runtimeBytes = (returned.length - 2) / 2;
      check.runtimeKeccak256 = keccak256(returned);
      check.runtimeMatchesCompilerOutsideImmutables = true;
    } else assert.match(failure, /gas|out of gas|allowance/i, 'Failure does not support a gas-limit observation');
    check.result = 'PASS';
  }
  report.feeQuote = { observedAt: new Date().toISOString(), gasPriceWei: String(BigInt(await rpc('eth_gasPrice'))) };
  assert.equal((await rpc('eth_getBlockByNumber', [tag, false])).hash, block.hash, 'Anchor changed');
  await requireSepolia(rpc);
  report.checks.push({ name: 'canonical_anchor_and_network_rechecked', result: 'PASS' });
  report.status = 'READ_ONLY_SYNTHETIC_CONSTRUCTOR_PASS_NOT_DEPLOYMENT';
} catch (error) { report.status = 'READ_ONLY_VERIFICATION_INCOMPLETE'; report.error = error.message; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
console.log(JSON.stringify({ status: report.status, anchor: report.anchor, governor: report.governor, checks: report.checks, error: report.error }, null, 2));
