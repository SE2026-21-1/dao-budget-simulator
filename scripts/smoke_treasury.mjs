#!/usr/bin/env node
// Local Treasury-only evidence. Owns its Anvil process; never accepts RPC URLs or keys.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, Interface, id, toQuantity, ZeroAddress } from 'ethers';
import { decodeLog } from '../indexer/decoder.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  console.error('Usage: node --import tsx scripts/smoke_treasury.mjs --output <evidence.json>\nRun forge build and npm ci first. Local Anvil only; no existing chain or database is used.');
  process.exit(1);
}
const output = resolve(args[1]);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const temp = await mkdtemp(join(tmpdir(), 'dao-tv4-treasury-'));
let anvil;
let anvilOutput = '';
let rpcId = 0;
const report = {
  scope: 'SC03 Treasury-only local transactions and BE02 receipt decoding; not Governor/Timelock, API, testnet or full TC/INV acceptance',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: {},
  runtime: {},
  receipts: [],
  assertions: [],
};

try {
  for (const path of ['contracts/BudgetToken.sol', 'contracts/Treasury.sol', 'contracts/interfaces/ITreasury.sol', 'scripts/smoke_treasury.mjs', 'indexer/decoder.ts', 'indexer/abi-registry.ts']) {
    report.sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
  report.runtime = {
    node: process.version,
    anvil: execFileSync('anvil', ['--version'], { encoding: 'utf8' }).trim(),
    forge: execFileSync('forge', ['--version'], { encoding: 'utf8' }).trim(),
    chainId: '31337', evm: 'osaka', isolation: 'owned throwaway Anvil bound to 127.0.0.1; unlocked local accounts, no private keys',
  };
  const reserve = createServer();
  await new Promise((done, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', done); });
  const port = reserve.address().port;
  await new Promise((done, reject) => reserve.close((error) => error ? reject(error) : done()));
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'osaka', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  anvil.on('error', (error) => { anvilOutput += error.message; });
  for (const stream of [anvil.stdout, anvil.stderr]) stream.on('data', (data) => { anvilOutput += data; });
  const rpc = async (method, params = []) => {
    assert.equal(anvil.exitCode, null, `Owned Anvil exited: ${anvilOutput}`);
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }), signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    if (result.error) throw new Error(`${method}: ${JSON.stringify(result.error)}`);
    return result.result;
  };
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (anvil.exitCode !== null || anvil.pid === undefined) throw new Error(`Anvil could not start: ${anvilOutput}`);
    try { ready = await rpc('eth_chainId') === '0x7a69'; } catch { /* startup only */ }
    if (ready) break;
    await pause(50);
  }
  assert.ok(ready, 'Owned Anvil did not become ready');
  // Confirm the child is still alive before any state-changing operation.
  await pause(100);
  assert.equal(anvil.exitCode, null, `Anvil port collision: ${anvilOutput}`);
  const accounts = await rpc('eth_accounts');
  const [admin, spender, outsider, recipient, funding, alternate] = accounts;
  report.accounts = { admin, spender, outsider, recipient, funding, alternate };
  const budArtifact = JSON.parse(await readFile(join(root, 'out/BudgetToken.sol/BudgetToken.json'), 'utf8'));
  const treasuryArtifact = JSON.parse(await readFile(join(root, 'out/Treasury.sol/Treasury.json'), 'utf8'));
  const budAbi = new Interface(budArtifact.abi);
  const treasuryAbi = new Interface(treasuryArtifact.abi);
  const unit = 10n ** 18n;
  const spenderRole = id('SPENDER_ROLE');
  const adminRole = '0x' + '00'.repeat(32);
  let bud;
  let treasury;
  const call = async (abi, to, name, values = []) => abi.decodeFunctionResult(name,
    await rpc('eth_call', [{ to, data: abi.encodeFunctionData(name, values) }, 'latest']))[0];
  const tx = async (label, from, to, data, expectedStatus = '0x1', expectedError) => {
    const transactionHash = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: toQuantity(6_000_000) }]);
    let receipt;
    for (let attempt = 0; attempt < 100; attempt++) {
      receipt = await rpc('eth_getTransactionReceipt', [transactionHash]);
      if (receipt) break;
      await pause(50);
    }
    assert.ok(receipt, `${label}: missing receipt`);
    assert.equal(receipt.status, expectedStatus, `${label}: unexpected receipt status`);
    const record = { label, transactionHash, blockNumber: BigInt(receipt.blockNumber).toString(), blockHash: receipt.blockHash, status: receipt.status, gasUsed: BigInt(receipt.gasUsed).toString(), logs: receipt.logs };
    if (expectedStatus === '0x0') {
      assert.deepEqual(receipt.logs, [], `${label}: reverted transaction emitted committed logs`);
      const trace = await rpc('debug_traceTransaction', [transactionHash, { disableStorage: true, disableStack: true, enableMemory: false }]);
      const data = trace.returnValue.startsWith('0x') ? trace.returnValue : `0x${trace.returnValue}`;
      const error = treasuryAbi.parseError(data);
      assert.equal(error?.name, expectedError?.name, `${label}: unexpected revert`);
      assert.deepEqual(Array.from(error.args).map((value) => String(value).toLowerCase()), expectedError.args.map((value) => String(value).toLowerCase()), `${label}: unexpected revert arguments`);
      record.error = { name: error.name, args: Array.from(error.args).map(String), data };
    }
    report.receipts.push(record);
    return receipt;
  };
  const budDeploy = await new ContractFactory(budArtifact.abi, budArtifact.bytecode.object).getDeployTransaction(funding);
  bud = (await tx('deploy BUD', admin, null, budDeploy.data)).contractAddress;
  const treasuryDeploy = await new ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode.object).getDeployTransaction(bud, admin);
  treasury = (await tx('deploy Treasury', admin, null, treasuryDeploy.data)).contractAddress;
  report.contracts = { BUD: bud, Treasury: treasury };
  report.artifactHashes = {
    BUD: createHash('sha256').update(JSON.stringify(budArtifact)).digest('hex'),
    Treasury: createHash('sha256').update(JSON.stringify(treasuryArtifact)).digest('hex'),
  };
  assert.equal((await rpc('eth_getCode', [bud, 'latest'])).toLowerCase(), budArtifact.deployedBytecode.object.toLowerCase());
  assert.notEqual(await rpc('eth_getCode', [treasury, 'latest']), '0x');
  assert.equal((await call(treasuryAbi, treasury, 'budgetToken')).toLowerCase(), bud.toLowerCase());
  assert.equal(await call(budAbi, bud, 'totalSupply'), 20_000n * unit);
  assert.equal(await call(treasuryAbi, treasury, 'hasRole', [adminRole, admin]), true);
  assert.equal(await call(treasuryAbi, treasury, 'hasRole', [spenderRole, admin]), false);
  assert.equal(await call(treasuryAbi, treasury, 'hasRole', [spenderRole, ZeroAddress]), false);
  const balances = async () => Object.fromEntries(await Promise.all(Object.entries({ treasury, funding, recipient, alternate, outsider }).map(async ([name, account]) => [name, String(await call(budAbi, bud, 'balanceOf', [account]))])));
  const pay = (request, to, amount) => treasuryAbi.encodeFunctionData('disburse', [request, to, amount]);
  const transfer = (amount) => budAbi.encodeFunctionData('transfer', [treasury, amount]);
  const failed = async (label, caller, request, to, amount, name, args) => {
    const before = await balances();
    const paidBefore = await call(treasuryAbi, treasury, 'paidRequests', [request]);
    await tx(label, caller, treasury, pay(request, to, amount), '0x0', { name, args });
    assert.deepEqual(await balances(), before, `${label}: balances changed`);
    assert.equal(await call(treasuryAbi, treasury, 'paidRequests', [request]), paidBefore, `${label}: paid flag changed`);
  };
  await tx('fund Treasury 10000 BUD', funding, bud, transfer(10_000n * unit));
  assert.equal(await call(budAbi, bud, 'balanceOf', [treasury]), 10_000n * unit);
  const paidRequest = id('tv4:sc03:payment');
  const retryRequest = id('tv4:sc03:retry');
  const revokedRequest = id('tv4:sc03:revoked');
  await failed('outsider direct payment denied', outsider, paidRequest, recipient, unit, 'AccessControlUnauthorizedAccount', [outsider, spenderRole]);
  await failed('bootstrap admin cannot spend without role', admin, paidRequest, recipient, unit, 'AccessControlUnauthorizedAccount', [admin, spenderRole]);
  await tx('grant local test spender (not a Timelock)', admin, treasury, treasuryAbi.encodeFunctionData('grantRole', [spenderRole, spender]));
  await tx('pay request once: 1000 BUD', spender, treasury, pay(paidRequest, recipient, 1_000n * unit));
  assert.equal(await call(treasuryAbi, treasury, 'paidRequests', [paidRequest]), true);
  assert.equal(await call(budAbi, bud, 'balanceOf', [treasury]), 9_000n * unit);
  assert.equal(await call(budAbi, bud, 'balanceOf', [recipient]), 1_000n * unit);
  await failed('duplicate request with changed recipient and amount denied', spender, paidRequest, alternate, 2_000n * unit, 'RequestAlreadyPaid', [paidRequest]);
  await failed('insufficient budget leaves request retryable', spender, retryRequest, recipient, 10_000n * unit, 'InsufficientBudget', [9_000n * unit, 10_000n * unit]);
  await tx('top up 1000 BUD', funding, bud, transfer(1_000n * unit));
  await tx('retry same request: 10000 BUD', spender, treasury, pay(retryRequest, recipient, 10_000n * unit));
  assert.equal(await call(treasuryAbi, treasury, 'paidRequests', [retryRequest]), true);
  assert.equal(await call(budAbi, bud, 'balanceOf', [recipient]), 11_000n * unit);
  await tx('revoke local test spender', admin, treasury, treasuryAbi.encodeFunctionData('revokeRole', [spenderRole, spender]));
  await tx('fund 1000 BUD for revoked-caller probe', funding, bud, transfer(1_000n * unit));
  await failed('revoked spender cannot consume funded request', spender, revokedRequest, alternate, 1_000n * unit, 'AccessControlUnauthorizedAccount', [spender, spenderRole]);
  await tx('restore local test spender', admin, treasury, treasuryAbi.encodeFunctionData('grantRole', [spenderRole, spender]));
  await tx('previously denied request succeeds after explicit role restore', spender, treasury, pay(revokedRequest, alternate, 1_000n * unit));
  await tx('remove test spending authority', admin, treasury, treasuryAbi.encodeFunctionData('revokeRole', [spenderRole, spender]));
  await tx('bootstrap admin renounces in throwaway environment only', admin, treasury, treasuryAbi.encodeFunctionData('renounceRole', [adminRole, admin]));
  const beforeRoleProbe = await balances();
  await tx('former admin cannot regain spender', admin, treasury, treasuryAbi.encodeFunctionData('grantRole', [spenderRole, admin]), '0x0', { name: 'AccessControlUnauthorizedAccount', args: [admin, adminRole] });
  assert.deepEqual(await balances(), beforeRoleProbe);

  let totalIn = 0n;
  let totalOut = 0n;
  let payoutTotal = 0n;
  const paidIds = new Set();
  let decodedTransfers = 0;
  let decodedPayouts = 0;
  const allLogs = await rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: 'latest', address: [bud, treasury] }]);
  for (const log of allLogs) {
    const isBud = log.address.toLowerCase() === bud.toLowerCase();
    const abi = isBud ? budAbi : treasuryAbi;
    const event = abi.parseLog(log);
    if (isBud && event.name === 'Transfer') {
      if (event.args.to.toLowerCase() === treasury.toLowerCase()) totalIn += event.args.value;
      if (event.args.from.toLowerCase() === treasury.toLowerCase()) totalOut += event.args.value;
    }
    if (!isBud && event.name === 'BudgetDisbursed') {
      assert.ok(!paidIds.has(event.args.requestId), 'A request was paid twice');
      paidIds.add(event.args.requestId);
      payoutTotal += event.args.amount;
    }
    if (event.name === 'Transfer' || event.name === 'BudgetDisbursed') {
      const contract = { role: isBud ? 'budget_token' : 'treasury', address: log.address, deploymentBlock: 0n, abiVersion: isBud ? 'oz-5.4.0-erc20' : 'sc01-itreasury-v1' };
      const decoded = decodeLog({ contract, blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash, transactionHash: log.transactionHash, transactionIndex: BigInt(log.transactionIndex), logIndex: BigInt(log.logIndex), topics: log.topics, data: log.data, rawLog: log });
      assert.equal(decoded.status, 'decoded', `BE02 failed to decode live ${event.name}`);
      assert.equal(decoded.eventName, event.name);
      if (isBud) { assert.equal(decoded.payload.value, String(event.args.value)); decodedTransfers++; }
      else { assert.equal(decoded.payload.amount, String(event.args.amount)); assert.equal(decoded.payload.requestId, event.args.requestId); decodedPayouts++; }
    }
  }
  assert.equal(totalIn, 12_000n * unit);
  assert.equal(totalOut, 12_000n * unit);
  assert.equal(payoutTotal, totalOut, 'Transfer is the ledger; do not add BudgetDisbursed a second time');
  assert.equal(paidIds.size, 3);
  const finalBalances = await balances();
  assert.equal(BigInt(finalBalances.treasury), totalIn - totalOut);
  assert.equal(BigInt(finalBalances.recipient), 11_000n * unit);
  assert.equal(BigInt(finalBalances.alternate), 1_000n * unit);
  assert.equal(BigInt(finalBalances.funding), 8_000n * unit);
  assert.equal(await call(budAbi, bud, 'totalSupply'), 20_000n * unit);
  for (const account of [...accounts, ZeroAddress, bud, treasury]) {
    assert.equal(await call(treasuryAbi, treasury, 'hasRole', [adminRole, account]), false);
    assert.equal(await call(treasuryAbi, treasury, 'hasRole', [spenderRole, account]), false);
  }
  const finalBlock = await rpc('eth_getBlockByNumber', ['latest', false]);
  report.assertions = ['real BUD bytecode and Treasury token link', 'funding and fixed supply', 'outsider/admin/revoked caller denied with exact error and unchanged balances/paid flag', 'successful disbursement balances and events', 'same request cannot pay changed amount/recipient', 'insufficient budget rollback and same-request retry after funding', 'revoked request remains usable after explicit role restore', 'former admin cannot regain role', 'Transfer ledger reconciles with payouts without double counting', 'BE02 decodes real mined Transfer/BudgetDisbursed logs preserving integer amounts'];
  report.ledger = { totalIn: String(totalIn), totalOut: String(totalOut), payoutTotal: String(payoutTotal), paidRequestIds: [...paidIds], finalBalances };
  report.be02 = { decodedTransfers, decodedPayouts, scope: 'real receipt decoding only; no DB projection/API/checkpoint/reorg acceptance' };
  report.finalBlock = { number: BigInt(finalBlock.number).toString(), hash: finalBlock.hash };
  report.result = 'passed';
  await writeFile(join(temp, 'completed.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  if (anvil && anvil.exitCode === null) {
    const exited = new Promise((done) => anvil.once('exit', done));
    anvil.kill('SIGTERM');
    const timer = setTimeout(() => anvil.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(timer);
  }
  try {
    const completed = await readFile(join(temp, 'completed.json'), 'utf8');
    await writeFile(output, completed);
    console.log(`PASS: Treasury local transactions and live BE02 receipt decoding. Evidence: ${output}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
