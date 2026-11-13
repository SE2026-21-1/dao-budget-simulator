import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, Transaction, Wallet, ZeroAddress, ZeroHash, id, toQuantity } from 'ethers';
import { createRpc, deployGovernance, requireLoopbackRpc } from '../../scripts/governance_local.mjs';
import { SEPOLIA, confirmedHeight, deploySepolia, gasLimit, keystoreSigners, requireSepolia,
  validateRoleMap, waitConfirmed } from '../../scripts/governance_sepolia.mjs';
import { journal, options } from '../../scripts/sepolia_cli.mjs';
import { waitForReceipt } from '../../scripts/receipt.mjs';
import { createSmokeLifecycle } from '../../scripts/smoke_lifecycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const names = ['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'];
const roleMap = accounts => ({ format: 'dao-budget-sepolia-accounts-v1', chainId: SEPOLIA.chainId,
  approvedSourceCommit: source, signerOwner: 'Synthetic unit-test owner only', accounts });
const synthetic = Object.fromEntries(names.map((name, index) => [name, `0x${(index + 1).toString(16).padStart(40, '0')}`]));

async function withChain(t, run) {
  const lifecycle = createSmokeLifecycle();
  t.after(async () => { try { await lifecycle.cleanup(); } finally { lifecycle.dispose(); } });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  let output = '';
  const child = lifecycle.spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', SEPOLIA.chainId,
    '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', error => { output += error.message; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; });
  const transport = createRpc(`http://127.0.0.1:${port}`);
  const deadline = Date.now() + 10000;
  while (true) {
    assert.equal(child.exitCode, null, output);
    assert.equal(child.signalCode, null, output);
    assert.ok(Date.now() < deadline, output);
    try { await transport('eth_chainId'); break; } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
  }
  // Explicit unit-test identity adapter. This chain is NOT a Sepolia fork or acceptance.
  const rpc = async (method, params = []) => {
    const value = await transport(method, params);
    if (method === 'eth_getBlockByNumber' && params[0] === '0x0') return { ...value, hash: SEPOLIA.genesisHash };
    return value;
  };
  await transport('anvil_mine', ['0x2']);
  const unlocked = await transport('eth_accounts');
  const accounts = Object.fromEntries(names.map((name, index) => [name, unlocked[index]]));
  const state = { rpc, transport, accounts, records: [], snapshots: [] };
  state.transmit = async transaction => {
    const { chainId, gasLimit, type, ...request } = transaction;
    const hash = await rpc('eth_sendTransaction', [{ ...request, gas: gasLimit }]);
    state.records.push({ transaction, hash });
    await waitForReceipt(rpc, hash, { timeoutMs: 10000 });
    await rpc('anvil_mine', ['0x2']);
    return hash;
  };
  state.deploy = overrides => deploySepolia(state.rpc, { root, roleMap: roleMap(accounts), transmit: state.transmit,
    persist: async manifest => state.snapshots.push(structuredClone(manifest)), maxFeePerGas: '1000000000000',
    maxTotalCost: '100000000000000000000', fork: true, ...overrides });
  await run(state);
}

test('public role map locks chain, source, owner and distinct nonzero accounts', () => {
  assert.equal(validateRoleMap(roleMap(synthetic), source).A.toLowerCase(), synthetic.A);
  for (const changed of [
    { chainId: '31337' }, { approvedSourceCommit: '0'.repeat(40) }, { signerOwner: '' },
    { accounts: { ...synthetic, A: ZeroAddress } }, { accounts: { ...synthetic, B: synthetic.A } },
    { accounts: { ...synthetic, extra: synthetic.A } },
  ]) assert.throws(() => validateRoleMap({ ...roleMap(synthetic), ...changed }, source));
});

test('network identity rejects wrong chain and wrong genesis', async () => {
  await assert.rejects(requireSepolia(async () => '0x7a69'), /Wrong Sepolia chain/);
  await assert.rejects(requireSepolia(async method => method === 'eth_chainId' ? '0xaa36a7' : { hash: ZeroHash }), /genesis/);
});

test('local loopback and empty-unforked chain31337 guards remain intact', async () => {
  assert.throws(() => requireLoopbackRpc(SEPOLIA.rpc), /loopback/);
  await assert.rejects(deployGovernance(async () => '0xaa36a7', { root, accounts: synthetic }), /31337/);
  await assert.rejects(deployGovernance(async method => ({ eth_chainId: '0x7a69', web3_clientVersion: 'anvil/test',
    anvil_metadata: { forkedNetwork: {} } })[method], { root, accounts: synthetic }), /Forked Anvil/);
});

test('K2 uses two descendants and rejects reorganized receipt', async () => {
  assert.equal(await confirmedHeight(async () => '0xa'), '0x8');
  const receipt = { status: '0x1', blockNumber: '0x8', blockHash: '0xabc', transactionHash: '0xtx' };
  const rpc = async method => ({ eth_getTransactionReceipt: receipt, eth_blockNumber: '0xa',
    eth_getBlockByNumber: { hash: '0xabc' } })[method];
  assert.deepEqual(await waitConfirmed(rpc, '0xtx'), receipt);
  await assert.rejects(waitConfirmed(async method => method === 'eth_getBlockByNumber' ? { hash: '0xbad' } : rpc(method), '0xtx'), /reorganized/);
  assert.equal(gasLimit(100001n), 120002n);
});

test('journal refuses overwrite and CLI rejects unknown or duplicate flags', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sepolia-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'manifest.json');
  const persist = await journal(path);
  await persist({ status: 'IN_PROGRESS' });
  await persist({ status: 'FAIL_STOP' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { status: 'FAIL_STOP' });
  await assert.rejects(journal(path), /EEXIST/);
  assert.throws(() => options(['--rpc', 'remote'], ['--manifest']));
  assert.throws(() => options(['--a', '1', '--a', '2'], ['--a', '--b']));
});

test('already signal-exited owned child cleanup completes and retains failure evidence', { timeout: 10000 }, async t => {
  const lifecycle = createSmokeLifecycle();
  t.after(async () => { try { await lifecycle.cleanup(); } finally { lifecycle.dispose(); } });
  const dir = await mkdtemp(join(tmpdir(), 'sepolia-signal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const persist = await journal(join(dir, 'failure.json'));
  const child = lifecycle.spawn(process.execPath, ['-e', 'process.kill(process.pid, \"SIGTERM\")'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  await new Promise(resolve => child.once('close', resolve));
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, 'SIGTERM');
  await lifecycle.cleanup();
  await persist({ status: 'PREPARATION_BLOCKED_OR_FAILED_NOT_TESTNET',
    forkExit: { code: child.exitCode, signal: child.signalCode } });
  assert.equal(JSON.parse(await readFile(join(dir, 'failure.json'), 'utf8')).forkExit.signal, 'SIGTERM');
});

test('real encrypted JSON keystore signs approved sender and rejects mismatches', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sepolia-keystore-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const wallet = Wallet.createRandom();
  const path = join(dir, 'encrypted.json'), password = join(dir, 'password');
  await writeFile(path, await wallet.encrypt('ephemeral-test-password'), { mode: 0o600 });
  await writeFile(password, 'ephemeral-test-password\n', { mode: 0o600 });
  const fd = await open(password, 'r');
  t.after(() => fd.close());
  const signNames = ['deployer', 'funding', 'A', 'B', 'C', 'D'];
  const config = Object.fromEntries(signNames.map(name => [name, { path, passwordFd: fd.fd }]));
  const accounts = Object.fromEntries(signNames.map(name => [name, wallet.address]));
  const sign = await keystoreSigners(config, accounts);
  const raw = await sign({ from: wallet.address, to: synthetic.A, value: 0, chainId: 11155111,
    nonce: 0, gasLimit: 21000, gasPrice: 1, type: 0 });
  assert.equal(Transaction.from(raw).from, wallet.address);
  assert.equal(Transaction.from(raw).chainId, 11155111n);
  await assert.rejects(keystoreSigners(config, { ...accounts, deployer: synthetic.A }), /does not match/);
});

test('synthetic chain exercises full constructors/runtime/ABI, pre-renounce, final roles and funding', async t => {
  await withChain(t, async state => {
    const manifest = await state.deploy();
    assert.equal(manifest.mode, 'DISPOSABLE_FORK_NOT_TESTNET');
    assert.equal(manifest.status, 'DEPLOYED_K2');
    assert.equal(manifest.receipts.length, 17);
    assert.equal(manifest.preRenounceRoleCheck.stage, 'bootstrap');
    assert.equal(manifest.preFundingRoleCheck.stage, 'final');
    assert.equal(manifest.roleCheck.identities.GOV.abiSha256, manifest.provenance.artifacts.GOV.abiSha256);
    assert.ok(manifest.transactions.every(tx => BigInt(tx.gasLimit) >= BigInt(tx.estimate)));
  });
});

for (const scenario of ['unknownHistoricalHolder', 'omittedRoleLogs', 'missingExecutor', 'wrongRuntime', 'nonceRace']) {
  test(`pre-renounce fails closed: ${scenario}; no renounce/funding`, async t => {
    await withChain(t, async state => {
      const treasury = new Interface(JSON.parse(await readFile(join(root, 'out/Treasury.sol/Treasury.json'), 'utf8')).abi);
      let injected = false;
      let addresses;
      const production = state.transmit;
      state.transmit = async transaction => {
        const hash = await production(transaction);
        if (state.records.length === 10 && !injected) {
          injected = true;
          const receipts = await Promise.all(state.records.slice(0, 5).map(record => state.rpc('eth_getTransactionReceipt', [record.hash])));
          addresses = { treasury: receipts[2].contractAddress, timelock: receipts[3].contractAddress, governor: receipts[4].contractAddress };
          const send = async (to, data) => {
            await state.rpc('eth_sendTransaction', [{ from: state.accounts.deployer, to, data }]);
            await state.rpc('anvil_mine', ['0x2']);
          };
          if (scenario === 'unknownHistoricalHolder') {
            for (const method of ['grantRole', 'revokeRole']) await send(addresses.treasury,
              treasury.encodeFunctionData(method, [id('SPENDER_ROLE'), state.accounts.outsider]));
          }
          if (scenario === 'missingExecutor') await send(addresses.timelock,
            treasury.encodeFunctionData('revokeRole', [id('EXECUTOR_ROLE'), addresses.governor]));
          if (scenario === 'wrongRuntime') await state.rpc('anvil_setCode', [addresses.treasury, '0x60006000f3']);
          if (scenario === 'nonceRace') await send(state.accounts.outsider, '0x');
        }
        return hash;
      };
      const cleanRpc = state.rpc;
      state.rpc = async (method, params = []) => {
        if (scenario === 'omittedRoleLogs' && injected && method === 'eth_getLogs' && params[0].address === addresses.treasury) return [];
        return cleanRpc(method, params);
      };
      await assert.rejects(state.deploy({ transmit: state.transmit }), scenario === 'nonceRace' ? /nonce changed/ : /role|holder|runtime|holder set/i);
      const last = state.snapshots.at(-1);
      assert.equal(last.status, 'FAIL_STOP_NO_AUTOMATIC_RETRY');
      assert.equal(state.records.length, 10);
      const result = await cleanRpc('eth_call', [{ to: addresses.treasury,
        data: treasury.encodeFunctionData('hasRole', [ZeroHash, state.accounts.deployer]) }, 'latest']);
      if (scenario !== 'wrongRuntime') assert.equal(treasury.decodeFunctionResult('hasRole', result)[0], true);
      assert.equal(last.transactions.some(tx => tx.label.includes('renounceRole')), false);
      assert.equal(last.transactions.some(tx => tx.label === 'BUD.transfer'), false);
    });
  });
}
