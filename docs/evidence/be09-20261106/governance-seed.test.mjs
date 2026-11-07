import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { promisify } from 'node:util';
import { AbiCoder, Interface, id, keccak256, toUtf8Bytes } from 'ethers';
import { createRpc } from '../../../scripts/governance_local.mjs';
import { createSmokeLifecycle } from '../../../scripts/smoke_lifecycle.mjs';

const exec = promisify(execFile);
const expectedDescription = '{"version":1,"title":"Demo chi 1000 BUD","body":"Khoan chi mo phong cho nghiem thu QA02."}';

test('BE09 seed executes the exact proposed description hash on a fresh chain', { timeout: 120_000 }, async t => {
  const lifecycle = createSmokeLifecycle();
  t.after(async () => { try { await lifecycle.cleanup(); } finally { lifecycle.dispose(); } });
  const directory = await lifecycle.temporaryDirectory(join(tmpdir(), 'be09-seed-test-'));
  const reserve = createServer();
  await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
  const port = reserve.address().port;
  await new Promise((resolve, reject) => reserve.close(error => error ? reject(error) : resolve()));
  const child = lifecycle.spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
    '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  const rpc = createRpc(url);
  let ready = false;
  for (let i = 0; i < 200; i++) {
    assert.ok(child.pid && child.exitCode === null, 'Anvil failed to start');
    try { ready = BigInt(await rpc('eth_chainId', [])) === 31337n; } catch { /* wait for startup */ }
    if (ready) break;
    await pause(50);
  }
  assert.ok(ready, 'Anvil did not become ready');
  await pause(100);
  assert.equal(child.exitCode, null, 'Anvil lost the port');

  const manifest = join(directory, 'manifest.json');
  const output = join(directory, 'seed.json');
  await exec(process.execPath, ['scripts/deploy_local.mjs', '--rpc', url, '--output', manifest], { timeout: 60_000 });
  await exec(process.execPath, ['--import', 'tsx', 'scripts/be09-seed.mjs', '--rpc', url, '--manifest', manifest, '--output', output], { timeout: 60_000 });
  const report = JSON.parse(await readFile(output, 'utf8'));
  const artifact = JSON.parse(await readFile('out/BudgetGovernor.sol/BudgetGovernor.json', 'utf8'));
  const governor = new Interface(artifact.abi);
  assert.equal(report.status, 'PASS');
  assert.equal(report.proposal.description, expectedDescription);
  const descriptionHash = keccak256(toUtf8Bytes(expectedDescription));
  assert.equal(descriptionHash, id(expectedDescription));
  assert.equal(report.proposal.descriptionHash, descriptionHash);
  const { targets, values, calldatas } = report.proposal;
  const proposalId = BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(
    ['address[]', 'uint256[]', 'bytes[]', 'bytes32'], [targets, values, calldatas, descriptionHash]))).toString();
  assert.equal(report.proposalId, proposalId);
  for (const [label, method] of [['QA02 caller queues through Governor', 'queue'],
    ['QA02 outsider executes 1000 BUD through Governor at ETA', 'execute']]) {
    const receipt = report.receipts.find(item => item.label === label);
    assert.ok(receipt, `missing ${method} receipt`);
    const transaction = await rpc('eth_getTransactionByHash', [receipt.transactionHash]);
    const parsed = governor.parseTransaction({ data: transaction.input });
    assert.equal(parsed.name, method);
    assert.deepEqual(Array.from(parsed.args[0], value => value.toLowerCase()), targets.map(value => value.toLowerCase()));
    assert.deepEqual(Array.from(parsed.args[1], String), values);
    assert.deepEqual(Array.from(parsed.args[2]), calldatas);
    assert.equal(parsed.args[3], descriptionHash);
  }
  assert.equal(report.proposal.state, 'Executed');
  assert.ok(report.execution.eventNames.includes('BudgetDisbursed'));
});
