import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ContractFactory, Interface, Wallet, ZeroHash, getAddress, id, toQuantity } from 'ethers';
import { CONFIG, SPECS, auditGovernanceRoles, constructorArgs, loadProject, validateAccounts } from './governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from './receipt.mjs';

export const SEPOLIA = Object.freeze({ chainId: '11155111', confirmations: '2',
  rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
  genesisHash: '0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
  format: 'dao-budget-sepolia-governance-v1' });
const sha = value => createHash('sha256').update(value).digest('hex');
const lower = value => getAddress(value).toLowerCase();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const signingNames = ['deployer', 'funding', 'A', 'B', 'C', 'D'];

export function validateRoleMap(map, sourceCommit) {
  assert.deepEqual(Object.keys(map).sort(),
    ['format', 'chainId', 'approvedSourceCommit', 'signerOwner', 'accounts'].sort(), 'Only the public role-map schema is allowed');
  assert.equal(map.format, 'dao-budget-sepolia-accounts-v1', 'Unsupported public role map');
  assert.equal(map.chainId, SEPOLIA.chainId, 'Wrong role-map chain');
  assert.equal(map.approvedSourceCommit, sourceCommit, 'Role map must approve exact current source commit');
  assert.equal(typeof map.signerOwner, 'string', 'Named signer owner required');
  assert.ok(map.signerOwner.trim(), 'Named signer owner required');
  validateAccounts(map.accounts);
  return Object.fromEntries(Object.entries(map.accounts).map(([name, address]) => [name, getAddress(address)]));
}

export async function requireSepolia(rpc) {
  assert.equal(BigInt(await rpc('eth_chainId')), BigInt(SEPOLIA.chainId), 'Wrong Sepolia chain');
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  assert.equal(genesis?.hash, SEPOLIA.genesisHash, 'Wrong Sepolia genesis');
}

export async function confirmedHeight(rpc) {
  const head = BigInt(await rpc('eth_blockNumber'));
  assert.ok(head >= 2n, 'Insufficient chain history for K=2');
  return toQuantity(head - 2n);
}

export async function waitConfirmed(rpc, transactionHash, { timeoutMs = 300000, pollMs = 4000 } = {}) {
  const receipt = await waitForReceipt(rpc, transactionHash, { timeoutMs, pollIntervalMs: pollMs });
  assertReceiptStatus(receipt, transactionHash, 'Sepolia transaction');
  const deadline = Date.now() + timeoutMs;
  while (BigInt(await rpc('eth_blockNumber')) < BigInt(receipt.blockNumber) + 2n) {
    assert.ok(Date.now() < deadline, `K=2 timeout for ${transactionHash}; do not resend automatically`);
    await pause(pollMs);
  }
  const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const again = await rpc('eth_getTransactionReceipt', [transactionHash]);
  assert.equal(canonical?.hash, receipt.blockHash, 'Transaction was reorganized before K=2');
  assert.equal(again?.blockHash, receipt.blockHash, 'Receipt changed before K=2');
  assertReceiptStatus(again, transactionHash, 'K=2 transaction');
  return again;
}

async function project(root) {
  const loaded = await loadProject(root);
  const hashes = {};
  for (const name of ['governance_sepolia.mjs', 'deploy_sepolia.mjs', 'check_roles_sepolia.mjs', 'preflight_sepolia.mjs', 'sepolia_cli.mjs', 'smoke_lifecycle.mjs']) {
    hashes[`scripts/${name}`] = sha(await readFile(new URL(name, import.meta.url)));
  }
  return { ...loaded, testnetScripts: hashes };
}

export async function checkSepoliaRoles(rpc, manifest, { root, stage = 'final' }) {
  const context = { stage, height: null, blockHash: null, manifestSourceCommit: manifest?.sourceCommit ?? null };
  try {
    await requireSepolia(rpc);
    assert.equal(manifest.confirmations, SEPOLIA.confirmations, 'K=2 is mandatory');
    assert.deepEqual(manifest.network, SEPOLIA, 'Wrong network policy');
    const loaded = await project(root);
    assert.deepEqual(manifest.testnetScripts, loaded.testnetScripts, 'Testnet scripts differ from manifest');
    assert.deepEqual(manifest.accounts, validateRoleMap(manifest.roleMap, loaded.provenance.sourceCommit), 'Role map differs');
    const auditHeight = await confirmedHeight(rpc);
    const result = await auditGovernanceRoles(rpc, manifest, { root, stage, context,
      policy: { ...SEPOLIA, auditHeight } });
    // K=2 is the handoff observation; also audit the unconfirmed tip so a new
    // unauthorized role/operation cannot hide in the two-block confirmation gap.
    const tip = await rpc('eth_blockNumber');
    const tipCheck = await auditGovernanceRoles(rpc, manifest, { root, stage, context: {},
      policy: { ...SEPOLIA, auditHeight: tip } });
    const anchor = await rpc('eth_getBlockByNumber', [auditHeight, false]);
    assert.equal(anchor?.hash, result.blockHash, 'Confirmed audit anchor changed');
    const tipAnchor = await rpc('eth_getBlockByNumber', [tip, false]);
    assert.equal(tipAnchor?.hash, tipCheck.blockHash, 'Tip audit anchor changed');
    return { ...result, confirmations: '2', finality: 'K=2 descendants, not consensus finality',
      tipCheck: { height: tipCheck.height, blockHash: tipCheck.blockHash } };
  } catch (error) { error.audit = context; throw error; }
}

/** Only encrypted JSON keystores; passwords arrive through inherited descriptors, never argv/env. */
export async function keystoreSigners(config, accounts) {
  assert.deepEqual(Object.keys(config).sort(), [...signingNames].sort(), 'Six signer configurations required');
  const wallets = {};
  const passwords = new Map();
  try {
    for (const name of signingNames) {
      const { path, passwordFd } = config[name];
      assert.ok(typeof path === 'string' && Number.isInteger(passwordFd) && passwordFd >= 3, 'Use encrypted keystore and inherited password FD >=3');
      if (!passwords.has(passwordFd)) passwords.set(passwordFd, (await readFile(`/proc/self/fd/${passwordFd}`, 'utf8')).replace(/\r?\n$/, ''));
      const wallet = await Wallet.fromEncryptedJson(await readFile(path, 'utf8'), passwords.get(passwordFd));
      assert.equal(lower(wallet.address), lower(accounts[name]), `${name}: keystore does not match approved address`);
      wallets[lower(wallet.address)] = wallet;
    }
  } finally { passwords.clear(); }
  return async transaction => {
    const wallet = wallets[lower(transaction.from)];
    assert.ok(wallet, 'No approved signer for transaction');
    const { from, ...unsigned } = transaction;
    return wallet.signTransaction(unsigned);
  };
}

export function gasLimit(estimate) { return (BigInt(estimate) * 120n + 99n) / 100n; }

/** Every transaction is estimated against current state; only the explicit transport signs/sends. */
export async function deploySepolia(rpc, { root, roleMap, transmit, persist, maxFeePerGas, maxTotalCost,
  fork = false }) {
  await requireSepolia(rpc);
  const { artifacts, provenance, testnetScripts } = await project(root);
  const accounts = validateRoleMap(roleMap, provenance.sourceCommit);
  assert.ok(typeof transmit === 'function' && typeof persist === 'function', 'Explicit transport and durable journal required');
  const fee = BigInt(maxFeePerGas), budget = BigInt(maxTotalCost);
  assert.ok(fee > 0n && budget > 0n, 'Positive fee/campaign budget required');
  const manifest = { format: SEPOLIA.format, chainId: SEPOLIA.chainId, network: { ...SEPOLIA },
    sourceCommit: provenance.sourceCommit, provenance, testnetScripts, roleMap, accounts,
    confirmations: '2', config: { ...CONFIG }, contracts: {}, receipts: [], transactions: [],
    mode: fork ? 'DISPOSABLE_FORK_NOT_TESTNET' : 'SEPOLIA', status: 'IN_PROGRESS' };
  await persist(manifest);
  let committedCost = 0n;
  const expectedNonces = new Map();
  for (const name of signingNames) {
    expectedNonces.set(lower(accounts[name]), await rpc('eth_getTransactionCount', [accounts[name], 'pending']));
  }
  const interfaces = Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, new Interface(artifact.abi)]));
  const send = async (label, from, to, data) => {
    await requireSepolia(rpc);
    const price = BigInt(await rpc('eth_gasPrice'));
    assert.ok(price <= fee, 'Current gas price exceeds approved cap');
    const estimateRequest = { from, ...(to ? { to } : {}), data, value: '0x0' };
    const estimate = BigInt(await rpc('eth_estimateGas', [estimateRequest, 'pending']));
    const gas = gasLimit(estimate);
    const pending = await rpc('eth_getBlockByNumber', ['pending', false]);
    assert.ok(gas <= BigInt(pending.gasLimit), 'Estimated gas exceeds block limit');
    committedCost += gas * price;
    assert.ok(committedCost <= budget, 'Campaign gas budget exceeded');
    assert.ok(BigInt(await rpc('eth_getBalance', [from, 'pending'])) >= gas * price, `${label}: insufficient native gas`);
    const nonce = await rpc('eth_getTransactionCount', [from, 'pending']);
    assert.equal(nonce, await rpc('eth_getTransactionCount', [from, 'latest']), 'Outstanding signer transactions; refuse nonce race');
    assert.equal(nonce, expectedNonces.get(lower(from)), 'Signer nonce changed outside this campaign; audit invalidated');
    const transaction = { ...estimateRequest, chainId: SEPOLIA.chainId, nonce, gasLimit: toQuantity(gas), gasPrice: toQuantity(price), type: 0 };
    const record = { label, estimate: String(estimate), gasLimit: String(gas), gasPrice: String(price), transaction, status: 'AWAITING_SIGNER' };
    manifest.transactions.push(record);
    await persist(manifest);
    const transactionHash = await transmit(transaction);
    record.transactionHash = transactionHash;
    expectedNonces.set(lower(from), toQuantity(BigInt(nonce) + 1n));
    record.status = 'SUBMITTED';
    await persist(manifest);
    const receipt = await waitConfirmed(rpc, transactionHash, fork ? { pollMs: 20, timeoutMs: 30000 } : {});
    record.status = 'CONFIRMED_K2';
    manifest.receipts.push({ ...receipt, label });
    await persist(manifest);
    return receipt;
  };
  const tx = (key, method, args, from = accounts.deployer) => send(`${key}.${method}`, from,
    manifest.contracts[key].address, interfaces[key].encodeFunctionData(method, args));
  try {
    for (const [key, artifact] of Object.entries(artifacts)) {
      const deployment = await new ContractFactory(artifact.abi, artifact.bytecode.object).getDeployTransaction(...constructorArgs(key, manifest));
      const receipt = await send(`deploy ${key}`, accounts.deployer, null, deployment.data);
      assert.ok(receipt.contractAddress, 'Creation receipt missing contract address');
      manifest.contracts[key] = { address: getAddress(receipt.contractAddress), deploymentBlock: String(BigInt(receipt.blockNumber)),
        transactionHash: receipt.transactionHash, abiVersion: SPECS[key].abiVersion };
      await persist(manifest);
    }
    manifest.scanFromBlock = manifest.contracts.GOV.deploymentBlock;
    const timelock = manifest.contracts.Timelock.address, governor = manifest.contracts.Governor.address;
    await tx('Treasury', 'grantRole', [id('SPENDER_ROLE'), timelock]);
    await tx('Treasury', 'grantRole', [ZeroHash, timelock]);
    for (const role of ['PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE']) await tx('Timelock', 'grantRole', [id(role), governor]);
    manifest.preRenounceRoleCheck = await checkSepoliaRoles(rpc, manifest, { root, stage: 'bootstrap' });
    await persist(manifest);
    // Repeat the entire gate immediately before the first irreversible renounce.
    await checkSepoliaRoles(rpc, manifest, { root, stage: 'bootstrap' });
    await tx('Treasury', 'renounceRole', [ZeroHash, accounts.deployer]);
    await tx('Timelock', 'renounceRole', [ZeroHash, accounts.deployer]);
    manifest.preFundingRoleCheck = await checkSepoliaRoles(rpc, manifest, { root });
    await persist(manifest);
    for (const name of ['A', 'B', 'C', 'D']) await tx('GOV', 'delegate', [accounts[name]], accounts[name]);
    // No custody or funding change may intervene without another full confirmed-state audit.
    await checkSepoliaRoles(rpc, manifest, { root });
    await tx('BUD', 'transfer', [manifest.contracts.Treasury.address, CONFIG.treasurySeed], accounts.funding);
    manifest.roleCheck = await checkSepoliaRoles(rpc, manifest, { root });
    manifest.status = 'DEPLOYED_K2';
    manifest.gas = { approvedMaxFeePerGas: String(fee), approvedMaxTotalCost: String(budget), conservativeCommittedCost: String(committedCost),
      totalGasUsed: String(manifest.receipts.reduce((sum, receipt) => sum + BigInt(receipt.gasUsed), 0n)) };
    await persist(manifest);
    return manifest;
  } catch (error) {
    manifest.status = 'FAIL_STOP_NO_AUTOMATIC_RETRY';
    manifest.failure = { message: error.message, audit: error.audit ?? null };
    await persist(manifest);
    throw error;
  }
}
