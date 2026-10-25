import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ContractFactory, Interface, ZeroAddress, ZeroHash, id, toQuantity } from 'ethers';
import { createRpc, deployGovernance } from '../../scripts/governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from '../../scripts/receipt.mjs';
import { createSmokeLifecycle } from '../../scripts/smoke_lifecycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const UNIT = 10n ** 18n;
const PROPOSER = id('PROPOSER_ROLE');
const EXECUTOR = id('EXECUTOR_ROLE');
const CANCELLER = id('CANCELLER_ROLE');
const SPENDER = id('SPENDER_ROLE');
const keys = ['GOV', 'BUD', 'Treasury', 'Timelock', 'Governor'];
const names = ['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'];
const contractNames = ['GovernanceToken', 'BudgetToken', 'Treasury', 'TimelockController', 'BudgetGovernor'];
const sameAddress = (left, right) => left.toLowerCase() === right.toLowerCase();

async function withAnvil(t, run, chainId = 31337) {
  const lifecycle = createSmokeLifecycle();
  t.after(async () => {
    try { await lifecycle.cleanup(); } finally { lifecycle.dispose(); }
  });
  const reserve = createServer();
  await new Promise((done, reject) => {
    reserve.once('error', reject);
    reserve.listen(0, '127.0.0.1', done);
  });
  const port = reserve.address().port;
  await new Promise((done, reject) => reserve.close(error => error ? reject(error) : done()));
  let output = '';
  const child = lifecycle.spawn('anvil', ['--host', '127.0.0.1', '--port', String(port),
    '--chain-id', String(chainId), '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', error => { output += error.message; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; });
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Owned Anvil exited: ${output}`);
    assert.ok(child.pid, `Owned Anvil could not start: ${output}`);
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        signal: AbortSignal.timeout(500) });
      ready = (await response.json()).result === toQuantity(chainId);
    } catch { /* Only startup readiness is retried, within the bounded deadline. */ }
    if (ready) break;
    await pause(25);
  }
  assert.ok(ready, `Owned Anvil did not become ready: ${output}`);
  // Detect a losing bind before any transactions are sent to this reserved port.
  await pause(100);
  assert.equal(child.exitCode, null, `Owned Anvil port collision: ${output}`);
  const rpc = createRpc(url);
  const unlocked = await rpc('eth_accounts');
  const accounts = Object.fromEntries(names.map((name, index) => [name, unlocked[index]]));
  const artifacts = Object.fromEntries(await Promise.all(keys.map(async (key, index) => [key,
    JSON.parse(await readFile(join(root, 'out', `${contractNames[index]}.sol`, `${contractNames[index]}.json`), 'utf8'))])));
  const interfaces = Object.fromEntries(keys.map(key => [key, new Interface(artifacts[key].abi)]));
  await run({ rpc, url, lifecycle, accounts, artifacts, interfaces });
}

function instrument(context, scenario = {}) {
  const { rpc, accounts, interfaces, artifacts } = context;
  const addresses = {};
  const production = [];
  const injections = [];
  const byHash = new Map();
  let creationCount = 0;
  let gateReached = false;
  let outageCount = 0;
  const call = async (key, method, values = [], block = 'latest') => interfaces[key].decodeFunctionResult(method,
    await rpc('eth_call', [{ to: addresses[key], data: interfaces[key].encodeFunctionData(method, values) }, block]))[0];
  const send = async (key, method, values = [], from = accounts.deployer) => {
    const hash = await rpc('eth_sendTransaction', [{ from, to: addresses[key],
      data: interfaces[key].encodeFunctionData(method, values), gas: toQuantity(15_000_000) }]);
    const receipt = await waitForReceipt(rpc, hash, { step: `inject ${key}.${method}`, timeoutMs: 10_000 });
    assertReceiptStatus(receipt, hash, `inject ${key}.${method}`);
    injections.push({ key, method, values, hash, receipt });
    return receipt;
  };
  const state = { ...context, addresses, production, injections, call, send,
    get gateReached() { return gateReached; }, get outageCount() { return outageCount; } };
  state.wrapped = async (method, params = []) => {
    // This is the first production audit boundary, not a source-level test hook:
    // all five creates and all five final-role grants have successful receipts.
    if (!gateReached && method === 'eth_chainId' && production.length === 10
        && production.every(record => record.receipt)) {
      assert.deepEqual(production.slice(0, 5).map(record => record.key), keys);
      assert.deepEqual(production.slice(5).map(record => record.method), Array(5).fill('grantRole'));
      gateReached = true;
      if (scenario.inject) await scenario.inject(state);
    }
    if (gateReached && scenario.outage === method) {
      outageCount++;
      throw new Error(`Injected RPC transport outage: ${method} ECONNRESET`);
    }
    if (method === 'eth_sendTransaction') {
      let transaction = { ...params[0] };
      let record;
      if (!transaction.to) {
        const key = keys[creationCount++];
        if (key === 'Treasury' && scenario.badConstructor) {
          // Submit a real, successful Treasury deployment linked to GOV rather
          // than BUD. The production helper receives its unmodified real receipt.
          transaction = { ...transaction, ...(await new ContractFactory(artifacts.Treasury.abi,
            artifacts.Treasury.bytecode.object).getDeployTransaction(addresses.GOV, accounts.deployer)) };
        }
        if (key === 'Treasury' && scenario.badCode) {
          // The compiler metadata is part of deployed runtime identity. Change a
          // byte in its IPFS digest, not executable instructions or constructor ABI.
          const bytecode = artifacts.Treasury.bytecode.object;
          const marker = 'a2646970667358221220';
          const offset = bytecode.lastIndexOf(marker);
          assert.ok(offset > 0, 'Expected pinned Solidity IPFS metadata');
          const position = offset + marker.length;
          const changed = bytecode[position] === '0' ? '1' : '0';
          transaction.data = transaction.data.slice(0, position) + changed + transaction.data.slice(position + 1);
        }
        record = { key, method: 'create', transaction };
      } else {
        const key = keys.find(candidate => sameAddress(addresses[candidate], transaction.to));
        assert.ok(key, 'Production transaction must target a captured real deployment');
        const parsed = interfaces[key].parseTransaction({ data: transaction.data });
        record = { key, method: parsed.name, values: [...parsed.args], transaction };
      }
      const hash = await rpc(method, [transaction]);
      record.hash = hash;
      production.push(record);
      byHash.set(hash, record);
      return hash;
    }
    const result = await rpc(method, params);
    if (gateReached && scenario.omitOperationLogs && method === 'eth_getLogs'
        && params[0]?.topics?.[0]?.includes(interfaces.Timelock.getEvent('CallScheduled').topicHash)) {
      assert.ok(result.length > 0, 'Truncation control must omit real, mined operation logs');
      return [];
    }
    if (method === 'eth_getTransactionReceipt' && result && byHash.has(params[0])) {
      const record = byHash.get(params[0]);
      assertReceiptStatus(result, params[0], `production ${record.key}.${record.method}`);
      record.receipt = result;
      if (record.method === 'create') addresses[record.key] = result.contractAddress;
    }
    return result;
  };
  return state;
}

async function assertUnfunded(state, block = 'latest') {
  assert.equal(await state.call('BUD', 'balanceOf', [state.addresses.Treasury], block), 0n);
  assert.equal(await state.call('BUD', 'balanceOf', [state.accounts.funding], block), 20_000n * UNIT);
}

async function assertRejectedBeforeHandoff(state) {
  assert.ok(state.gateReached, 'Fault must reach the real pre-renounce audit boundary');
  assert.equal(state.production.length, 10, 'No production transaction may follow the failed gate');
  assert.ok(state.production.every(record => record.receipt?.status === '0x1'));
  assert.equal(state.production.filter(record => record.method === 'renounceRole').length, 0);
  assert.equal(state.production.filter(record => record.method === 'transfer').length, 0);
  for (const key of ['Treasury', 'Timelock']) {
    assert.equal(await state.call(key, 'hasRole', [ZeroHash, state.accounts.deployer]), true,
      `${key}: bootstrap admin must survive gate rejection`);
  }
  await assertUnfunded(state);
  assert.equal(BigInt(await state.rpc('eth_getTransactionCount', [state.accounts.funding, 'latest'])), 0n,
    'Funding wallet must not have sent any transaction');
  // Re-read every mined block rather than trusting only the wrapper's send list.
  const receipts = [...state.production, ...state.injections].map(record => record.receipt);
  const expected = new Set(receipts.map(receipt => receipt.transactionHash));
  const height = Number(BigInt(await state.rpc('eth_blockNumber')));
  assert.ok(height <= 40, 'Fault setup must remain bounded');
  const actual = [];
  for (let heightIndex = 1; heightIndex <= height; heightIndex++) {
    const block = await state.rpc('eth_getBlockByNumber', [toQuantity(heightIndex), false]);
    actual.push(...block.transactions);
  }
  assert.equal(actual.length, expected.size, 'No unobserved transaction may escape the failed gate');
  assert.deepEqual(new Set(actual), expected);
}

async function operationHistory(state, outcome) {
  const { accounts, addresses, interfaces, send, call, rpc } = state;
  await send('Timelock', 'grantRole', [PROPOSER, accounts.deployer]);
  if (outcome === 'canceled') await send('Timelock', 'grantRole', [CANCELLER, accounts.deployer]);
  if (outcome === 'done' || outcome === 'wrongDelay') await send('Timelock', 'grantRole', [EXECUTOR, accounts.deployer]);
  const targets = outcome === 'stale' ? [addresses.Treasury, addresses.Timelock] : [addresses.Timelock];
  const values = targets.map(() => 0n);
  const payloads = outcome === 'stale'
    ? [interfaces.Treasury.encodeFunctionData('grantRole', [SPENDER, accounts.outsider]),
      interfaces.Timelock.encodeFunctionData('updateDelay', [1n])]
    : [interfaces.Timelock.encodeFunctionData('updateDelay', [outcome === 'wrongDelay' ? 121n : 120n])];
  const salt = id(`bootstrap-regression-${outcome}`);
  const operationId = await call('Timelock', 'hashOperationBatch', [targets, values, payloads, ZeroHash, salt]);
  const scheduled = await send('Timelock', 'scheduleBatch', [targets, values, payloads, ZeroHash, salt, 120n]);
  const scheduledEvents = scheduled.logs.filter(log => sameAddress(log.address, addresses.Timelock))
    .map(log => interfaces.Timelock.parseLog(log)).filter(event => event?.name === 'CallScheduled');
  assert.equal(scheduledEvents.length, targets.length, 'Use actual on-chain batch scheduling events');
  assert.ok(scheduledEvents.every(event => event.args.id === operationId));
  if (outcome === 'canceled') {
    await send('Timelock', 'cancel', [operationId]);
    await send('Timelock', 'revokeRole', [CANCELLER, accounts.deployer]);
    assert.equal(await call('Timelock', 'getOperationState', [operationId]), 0n);
  } else {
    const block = await rpc('eth_getBlockByNumber', ['latest', false]);
    await rpc('evm_setNextBlockTimestamp', [toQuantity(BigInt(block.timestamp) + 121n)]);
    await rpc('evm_mine');
    if (outcome === 'done' || outcome === 'wrongDelay') {
      await send('Timelock', 'executeBatch', [targets, values, payloads, ZeroHash, salt]);
      await send('Timelock', 'revokeRole', [EXECUTOR, accounts.deployer]);
      assert.equal(await call('Timelock', 'getOperationState', [operationId]), 3n);
    } else {
      assert.equal(await call('Timelock', 'getOperationState', [operationId]), 2n);
    }
  }
  await send('Timelock', 'revokeRole', [PROPOSER, accounts.deployer]);
  for (const role of [PROPOSER, EXECUTOR, CANCELLER]) {
    assert.equal(await call('Timelock', 'hasRole', [role, accounts.deployer]), false,
      'Operation-history rejection must not merely detect a leftover temporary role');
  }
}

test('clean production deployment audits bootstrap before renouncing and final roles before funding', { timeout: 120_000 }, async t => {
  await withAnvil(t, async context => {
    const state = instrument(context);
    const { manifest } = await deployGovernance(state.wrapped, { root, accounts: state.accounts });
    assert.ok(state.gateReached);
    const grants = state.production.filter(record => record.method === 'grantRole');
    const renounces = state.production.filter(record => record.method === 'renounceRole');
    const transfers = state.production.filter(record => record.method === 'transfer');
    assert.equal(grants.length, 5);
    assert.equal(renounces.length, 2);
    assert.equal(transfers.length, 1);
    assert.equal(state.production.length, 17);
    const bootstrap = manifest.preRenounceRoleCheck;
    const preFunding = manifest.preFundingRoleCheck;
    assert.ok(bootstrap, 'Production must export the successful bootstrap gate');
    assert.ok(preFunding, 'Production must export the successful pre-funding gate');
    const H = toQuantity(BigInt(bootstrap.height));
    const F = toQuantity(BigInt(preFunding.height));
    assert.ok(grants.every(record => BigInt(record.receipt.blockNumber) <= BigInt(H)));
    assert.ok(renounces.every(record => BigInt(record.receipt.blockNumber) > BigInt(H)));
    assert.ok(renounces.every(record => BigInt(record.receipt.blockNumber) <= BigInt(F)));
    assert.ok(transfers.every(record => BigInt(record.receipt.blockNumber) > BigInt(F)));
    assert.equal((await state.rpc('eth_getBlockByNumber', [H, false])).hash, bootstrap.blockHash);
    assert.equal((await state.rpc('eth_getBlockByNumber', [F, false])).hash, preFunding.blockHash);
    for (const key of ['Treasury', 'Timelock']) {
      assert.equal(await state.call(key, 'hasRole', [ZeroHash, state.accounts.deployer], H), true);
      assert.equal(await state.call(key, 'hasRole', [ZeroHash, state.accounts.deployer], F), false);
    }
    await assertUnfunded(state, H);
    await assertUnfunded(state, F);
    assert.equal(await state.call('BUD', 'balanceOf', [state.addresses.Treasury]), 10_000n * UNIT);
    assert.equal(await state.call('BUD', 'balanceOf', [state.accounts.funding]), 10_000n * UNIT);
    assert.ok(BigInt(manifest.roleCheck.height) >= BigInt(transfers[0].receipt.blockNumber));
  });
});

const scenarios = [
  { name: 'missing Governor executor', error: /holder set|EXECUTOR|executor/i,
    inject: state => state.send('Timelock', 'revokeRole', [EXECUTOR, state.addresses.Governor]) },
  { name: 'extra holder discovered outside the demo account list', error: /holder set|holder/i,
    inject: state => state.send('Treasury', 'grantRole', [SPENDER, '0x000000000000000000000000000000000000beef']) },
  { name: 'public zero-address executor', error: /holder set|executor/i,
    inject: state => state.send('Timelock', 'grantRole', [EXECUTOR, ZeroAddress]) },
  { name: 'wrong real constructor link', badConstructor: true, error: /constructor|contract link/i },
  { name: 'wrong deployed compiler code', badCode: true, error: /constructor|runtime|source/i },
  { name: 'M-01 stale scheduleBatch survives revoked bootstrap proposer', error: /bootstrap|operation|history/i,
    inject: state => operationHistory(state, 'stale') },
  { name: 'canceled bootstrap operation history remains forbidden', error: /bootstrap|operation|history/i,
    inject: state => operationHistory(state, 'canceled') },
  { name: 'Done bootstrap operation history remains forbidden', error: /bootstrap|operation|history/i,
    inject: state => operationHistory(state, 'done') },
  { name: 'silently truncated operation logs cannot hide canceled bootstrap history', error: /incomplete|contradictory|evidence/i,
    omitOperationLogs: true, inject: state => operationHistory(state, 'canceled') },
  { name: 'wrong minDelay after legitimate scheduled self-update', error: /getMinDelay|configuration/i,
    inject: state => operationHistory(state, 'wrongDelay') },
  { name: 'missing runtime RPC evidence fails closed', outage: 'eth_getCode', error: /RPC transport outage/ },
  { name: 'missing complete log evidence fails closed', outage: 'eth_getLogs', error: /RPC transport outage/ },
];
for (const scenario of scenarios) {
  test(`bootstrap gate rejects ${scenario.name} before renounce or funding`, { timeout: 120_000 }, async t => {
    await withAnvil(t, async context => {
      const state = instrument(context, scenario);
      let failure;
      await assert.rejects(deployGovernance(state.wrapped, { root, accounts: state.accounts }), error => {
        failure = error;
        assert.match(error.message, scenario.error);
        return true;
      });
      assert.equal(failure.audit.stage, 'bootstrap');
      const gateBlock = await state.rpc('eth_getBlockByNumber', [toQuantity(BigInt(failure.audit.height)), false]);
      assert.equal(failure.audit.blockHash, gateBlock.hash, 'Failure evidence must retain the actual canonical gate H/hash');
      if (scenario.outage) assert.equal(state.outageCount, 1, 'Exercise the actual evidence request failure');
      await assertRejectedBeforeHandoff(state);
    });
  });
}

test('wrong actual chain rejects before deployment', { timeout: 30_000 }, async t => {
  await withAnvil(t, async context => {
    const directory = await context.lifecycle.temporaryDirectory(join(tmpdir(), 'tv4-bootstrap-cli-'));
    const output = join(directory, 'failed-deployment.json');
    const result = await new Promise(resolve => execFile(process.execPath,
      ['scripts/deploy_local.mjs', '--rpc', context.url, '--output', output], { cwd: root, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })));
    assert.equal(result.code, 1);
    const failure = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(failure.format, 'dao-budget-local-deployment-failure-v1');
    assert.equal(failure.status, 'FAIL');
    assert.match(failure.error.message, /31337/);
    assert.match(result.stderr, /Failure evidence retained/);
    assert.equal(BigInt(await context.rpc('eth_blockNumber')), 0n);
    for (const account of Object.values(context.accounts)) {
      assert.equal(BigInt(await context.rpc('eth_getTransactionCount', [account, 'latest'])), 0n);
    }
  }, 31338);
});
