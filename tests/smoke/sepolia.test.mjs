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
  submitSignedTransaction, validateRoleMap, waitConfirmed } from '../../scripts/governance_sepolia.mjs';
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
  await transport('anvil_mine', ['0x2', '0x1']);
  const unlocked = await transport('eth_accounts');
  const accounts = Object.fromEntries(names.map((name, index) => [name, unlocked[index]]));
  const state = { rpc, transport, accounts, records: [], snapshots: [] };
  state.transmit = async (transaction, persistSigned) => {
    const { gasLimit, ...request } = transaction;
    const raw = await rpc('eth_signTransaction', [{ ...request, gas: gasLimit }]);
    return submitSignedTransaction(async (method, params) => {
      const hash = await rpc(method, params);
      state.records.push({ transaction, hash });
      await waitForReceipt(rpc, hash, { timeoutMs: 10000 });
      await rpc('anvil_mine', ['0x2', '0x1']);
      return hash;
    }, raw, persistSigned);
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
  const hash = `0x${'11'.repeat(32)}`, blockHash = `0x${'33'.repeat(32)}`;
  const receipt = { status: '0x1', blockNumber: '0x8', blockHash, transactionHash: hash, transactionIndex: '0x0' };
  const block = { number: '0x8', hash: blockHash, transactions: [hash] };
  const rpc = async method => ({ eth_getTransactionReceipt: receipt, eth_blockNumber: '0xa',
    eth_getBlockByNumber: block })[method];
  await assert.rejects(waitConfirmed(async method => method === 'eth_getBlockByNumber'
    ? { ...block, hash: `0x${'44'.repeat(32)}` } : rpc(method), hash), /reorganized/);
  assert.equal(gasLimit(100001n), 120002n);
});

for (const [scenario, expected] of [
  ['wrong initial transaction', /Sepolia receipt transaction hash mismatch/],
  ['wrong final transaction', /K=2 receipt transaction hash mismatch/],
  ['changed final block number', /Receipt block number changed/],
  ['changed final transaction index', /Receipt transaction index changed/],
  ['wrong canonical block number', /Canonical block number mismatch/],
  ['wrong canonical transaction', /Canonical transaction membership mismatch/],
  ['initial transaction index outside block', /Receipt transaction index outside canonical block/],
]) {
  test(`K2 rejects inconsistent receipt binding: ${scenario}`, async () => {
    const hash = `0x${'11'.repeat(32)}`, wrong = `0x${'22'.repeat(32)}`, blockHash = `0x${'33'.repeat(32)}`;
    let first = { status: '0x1', blockNumber: '0x8', blockHash, transactionHash: hash, transactionIndex: '0x0' };
    let again = { ...first };
    const block = { number: '0x8', hash: blockHash, transactions: [hash] };
    if (scenario === 'wrong initial transaction') first = { ...first, transactionHash: wrong };
    if (scenario === 'wrong final transaction') again = { ...again, transactionHash: wrong };
    if (scenario === 'changed final block number') again = { ...again, blockNumber: '0x7' };
    if (scenario === 'changed final transaction index') again = { ...again, transactionIndex: '0x1' };
    if (scenario === 'wrong canonical block number') block.number = '0x7';
    if (scenario === 'wrong canonical transaction') block.transactions = [wrong];
    if (scenario === 'initial transaction index outside block') first = { ...first, transactionIndex: '0x1' };
    let reads = 0;
    const rpc = async method => {
      if (method === 'eth_getTransactionReceipt') return ++reads === 1 ? first : again;
      return { eth_blockNumber: '0xa', eth_getBlockByNumber: block }[method];
    };
    await assert.rejects(waitConfirmed(rpc, hash), expected);
  });
}

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

for (const scenario of ['valid uppercase hash', 'different transaction', 'changed signed payload', 'malformed hash', 'response lost', 'journal failure']) {
  test(`signed submission retains local identity and never resends: ${scenario}`, async () => {
    const wallet = Wallet.createRandom();
    const transaction = { to: synthetic.A, chainId: 11155111, nonce: 0, gasLimit: 21000, gasPrice: 1, type: 0 };
    const original = await wallet.signTransaction(transaction);
    const raw = scenario === 'changed signed payload'
      ? await wallet.signTransaction({ ...transaction, value: 1 }) : original;
    const expectedHash = Transaction.from(raw).hash;
    let persistedHash, sends = 0;
    const persistSigned = async hash => {
      if (scenario === 'journal failure') throw new Error('journal unavailable');
      persistedHash = hash;
    };
    const rpc = async (method, params) => {
      assert.equal(persistedHash, expectedHash, 'Identity must be durable before any broadcast');
      assert.equal(method, 'eth_sendRawTransaction');
      assert.deepEqual(params, [raw]);
      sends++;
      if (scenario === 'response lost') throw new Error('response lost after possible acceptance');
      if (scenario === 'malformed hash') return null;
      if (scenario === 'changed signed payload') return Transaction.from(original).hash;
      if (scenario === 'different transaction') return ZeroHash;
      return `0x${expectedHash.slice(2).toUpperCase()}`;
    };
    const send = () => submitSignedTransaction(rpc, raw, persistSigned);
    if (scenario === 'valid uppercase hash') assert.equal(await send(), expectedHash);
    else await assert.rejects(send(), scenario === 'journal failure' ? /journal unavailable/
      : scenario === 'response lost' ? /response lost/ : /Submission transaction hash mismatch/);
    assert.equal(sends, scenario === 'journal failure' ? 0 : 1);
    assert.equal(persistedHash, scenario === 'journal failure' ? undefined : expectedHash);
  });
}

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

test('unconfirmed final funding cannot borrow a confirmed receipt or journal false K2 success', async t => {
  await withChain(t, async state => {
    const cleanRpc = state.rpc, production = state.transmit;
    let fundingHash, fundingReceipt, borrowedReceipt, substitutions = 0;
    state.transmit = async (transaction, persistSigned) => {
      if (transaction.from.toLowerCase() !== state.accounts.funding.toLowerCase()) return production(transaction, persistSigned);
      borrowedReceipt = await cleanRpc('eth_getTransactionReceipt', [state.records.at(-1).hash]);
      assert.equal(borrowedReceipt.status, '0x1');
      const { chainId, gasLimit, type, ...request } = transaction;
      fundingHash = await cleanRpc('eth_sendTransaction', [{ ...request, gas: gasLimit }]);
      state.records.push({ transaction, hash: fundingHash });
      fundingReceipt = await waitForReceipt(cleanRpc, fundingHash, { timeoutMs: 10000 });
      // Deliberately mine no descendants: the prior delegation, not funding, has K2.
      return fundingHash;
    };
    state.rpc = async (method, params = []) => {
      if (method === 'eth_getTransactionReceipt' && params[0] === fundingHash && substitutions < 2) {
        substitutions += 1;
        return borrowedReceipt;
      }
      return cleanRpc(method, params);
    };
    await assert.rejects(state.deploy(), /Sepolia receipt transaction hash mismatch/);
    const head = BigInt(await cleanRpc('eth_blockNumber'));
    assert.equal(BigInt(fundingReceipt.blockNumber), head, 'Funding must have zero descendants');
    assert.ok(BigInt(borrowedReceipt.blockNumber) + 2n <= head, 'Borrowed receipt control must genuinely have K2');
    const last = state.snapshots.at(-1), funding = last.transactions.find(tx => tx.label === 'BUD.transfer');
    assert.equal(last.status, 'FAIL_STOP_NO_AUTOMATIC_RETRY');
    assert.equal(funding.transactionHash, fundingHash);
    assert.equal(funding.status, 'SUBMITTED');
    assert.equal(last.receipts.some(receipt => receipt.label === 'BUD.transfer'), false);
    assert.equal(state.records.filter(record => record.transaction.from.toLowerCase() === state.accounts.funding.toLowerCase()).length, 1);
  });
});

test('funding submission cannot borrow a delegation hash while its genuine receipt has zero descendants', async t => {
  await withChain(t, async state => {
    const production = state.transmit, cleanRpc = state.rpc;
    const dir = await mkdtemp(join(tmpdir(), 'sepolia-submission-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'manifest.json'), persist = await journal(path);
    let fundingHash, fundingReceipt, borrowedHash, borrowedReceipt, sends = 0;
    state.transmit = async (transaction, persistSigned) => {
      if (transaction.from.toLowerCase() !== state.accounts.funding.toLowerCase()) return production(transaction, persistSigned);
      borrowedHash = state.records.at(-1).hash;
      borrowedReceipt = await cleanRpc('eth_getTransactionReceipt', [borrowedHash]);
      const { gasLimit, ...request } = transaction;
      const raw = await cleanRpc('eth_signTransaction', [{ ...request, gas: gasLimit }]);
      fundingHash = Transaction.from(raw).hash;
      const rpc = async (method, params) => {
        assert.equal(method, 'eth_sendRawTransaction');
        const before = JSON.parse(await readFile(path, 'utf8')).transactions.at(-1);
        assert.equal(before.transactionHash, fundingHash, 'Signed identity must reach disk before submission');
        assert.equal(before.status, 'SIGNED');
        assert.equal(await cleanRpc(method, params), fundingHash);
        sends++;
        state.records.push({ transaction, hash: fundingHash });
        fundingReceipt = await waitForReceipt(cleanRpc, fundingHash, { timeoutMs: 10000 });
        return borrowedHash; // Only submission is misrouted; receipt/header/audit responses remain genuine.
      };
      return submitSignedTransaction(rpc, raw, persistSigned);
    };
    await assert.rejects(state.deploy({ persist: async manifest => {
      state.snapshots.push(structuredClone(manifest));
      await persist(manifest);
    } }), /Submission transaction hash mismatch/);
    const head = BigInt(await state.rpc('eth_blockNumber'));
    assert.equal(BigInt(fundingReceipt.blockNumber), head, 'Actual funding must have zero descendants');
    assert.ok(BigInt(borrowedReceipt.blockNumber) + 2n <= head, 'Delegation control must genuinely have K2');
    const last = state.snapshots.at(-1), funding = last.transactions.find(tx => tx.label === 'BUD.transfer');
    assert.equal(last.status, 'FAIL_STOP_NO_AUTOMATIC_RETRY');
    assert.equal(funding.transactionHash, fundingHash);
    assert.notEqual(funding.transactionHash, borrowedHash);
    assert.equal(funding.status, 'SIGNED');
    assert.equal(sends, 1);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), last);
    assert.equal(last.receipts.some(receipt => receipt.label === 'BUD.transfer'), false);
    assert.equal(state.records.filter(record => record.transaction.from.toLowerCase() === state.accounts.funding.toLowerCase()).length, 1);
  });
});

for (const scenario of ['unknownHistoricalHolder', 'omittedRoleLogs', 'missingExecutor', 'wrongRuntime', 'nonceRace']) {
  test(`pre-renounce fails closed: ${scenario}; no renounce/funding`, async t => {
    await withChain(t, async state => {
      const treasury = new Interface(JSON.parse(await readFile(join(root, 'out/Treasury.sol/Treasury.json'), 'utf8')).abi);
      let injected = false;
      let addresses;
      const production = state.transmit;
      state.transmit = async (transaction, persistSigned) => {
        const hash = await production(transaction, persistSigned);
        if (state.records.length === 10 && !injected) {
          injected = true;
          const receipts = await Promise.all(state.records.slice(0, 5).map(record => state.rpc('eth_getTransactionReceipt', [record.hash])));
          addresses = { treasury: receipts[2].contractAddress, timelock: receipts[3].contractAddress, governor: receipts[4].contractAddress };
          const send = async (to, data) => {
            const hash = await state.rpc('eth_sendTransaction', [{ from: state.accounts.deployer, to, data }]);
            await waitForReceipt(state.rpc, hash, { timeoutMs: 10000 });
            await state.rpc('anvil_mine', ['0x2', '0x1']);
          };
          if (scenario === 'unknownHistoricalHolder') {
            for (const method of ['grantRole', 'revokeRole']) await send(addresses.treasury,
              treasury.encodeFunctionData(method, [id('SPENDER_ROLE'), state.accounts.outsider]));
          }
          if (scenario === 'missingExecutor') await send(addresses.timelock,
            treasury.encodeFunctionData('revokeRole', [id('EXECUTOR_ROLE'), addresses.governor]));
          if (scenario === 'wrongRuntime') {
            const runtime = await state.rpc('eth_getCode', [addresses.treasury, 'latest']);
            const changed = `${runtime.slice(0, -2)}${runtime.endsWith('00') ? '01' : '00'}`;
            await state.rpc('anvil_setCode', [addresses.treasury, changed]);
            await state.rpc('anvil_mine', ['0x3', '0x1']);
          }
          if (scenario === 'nonceRace') await send(state.accounts.outsider, '0x');
        }
        return hash;
      };
      const cleanRpc = state.rpc;
      state.rpc = async (method, params = []) => {
        if (scenario === 'omittedRoleLogs' && injected && method === 'eth_getLogs'
          && params[0].address.toLowerCase() === addresses.treasury.toLowerCase()) {
          const logs = await cleanRpc(method, params);
          assert.ok(logs.length > 0, 'Omission control must hide real canonical role logs');
          return [];
        }
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
