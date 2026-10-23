import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ContractFactory, Interface, ZeroAddress, ZeroHash, getAddress, id, keccak256, toQuantity } from 'ethers';

// This is the agreed local project configuration, not an input supplied by a manifest.
const UNIT = 10n ** 18n;
const CONFIG = Object.freeze({
  proposalThreshold: String(50n * UNIT), quorumNumerator: '20', quorumDenominator: '100',
  votingDelay: '60', votingPeriod: '300', minDelay: '120', clockMode: 'mode=timestamp',
  govSupply: String(1000n * UNIT), budSupply: String(20000n * UNIT), treasurySeed: String(10000n * UNIT),
});
const SPECS = Object.freeze({
  GOV: { source: 'contracts/GovernanceToken.sol', name: 'GovernanceToken', abiVersion: 'sc02-governance-token-v1' },
  BUD: { source: 'contracts/BudgetToken.sol', name: 'BudgetToken', abiVersion: 'oz-5.4.0-erc20' },
  Treasury: { source: 'contracts/Treasury.sol', name: 'Treasury', abiVersion: 'sc01-itreasury-v1' },
  Timelock: { source: 'lib/openzeppelin-contracts/contracts/governance/TimelockController.sol', name: 'TimelockController', abiVersion: 'oz-5.4.0-timelock' },
  Governor: { source: 'contracts/BudgetGovernor.sol', name: 'BudgetGovernor', abiVersion: 'oz-5.4.0-governor' },
});
const ACCOUNT_NAMES = ['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'];
const SPENDER = id('SPENDER_ROLE');
const PROPOSER = id('PROPOSER_ROLE');
const EXECUTOR = id('EXECUTOR_ROLE');
const CANCELLER = id('CANCELLER_ROLE');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const lower = (address) => getAddress(address).toLowerCase();
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const decimal = (value, label) => {
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${label}: expected decimal string`);
  return BigInt(value);
};

export function createRpc(url) {
  const parsed = new URL(url);
  assert.ok(['http:', 'https:'].includes(parsed.protocol), 'RPC must use HTTP(S)');
  assert.ok(!parsed.username && !parsed.password, 'RPC URL must not contain credentials');
  let nextId = 0;
  return async (method, params = []) => {
    const requestId = ++nextId;
    const response = await fetch(parsed, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `${method}: HTTP ${response.status}`);
    const payload = await response.json();
    assert.equal(payload.jsonrpc, '2.0', `${method}: invalid JSON-RPC response`);
    assert.equal(payload.id, requestId, `${method}: mismatched JSON-RPC id`);
    if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error)}`);
    assert.ok(Object.hasOwn(payload, 'result'), `${method}: missing RPC result`);
    return payload.result;
  };
}

export function requireLoopbackRpc(url) {
  const parsed = new URL(url);
  assert.ok(parsed.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(parsed.hostname),
    'Deployment requires an explicit numeric loopback HTTP RPC (127.0.0.1 or [::1])');
  assert.ok(!parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash,
    'Deployment RPC must not contain credentials, path, query or fragment');
}

function validateAccounts(accounts) {
  assert.deepEqual(Object.keys(accounts).sort(), [...ACCOUNT_NAMES].sort(), 'Unexpected/missing account mapping');
  for (const name of ACCOUNT_NAMES) {
    assert.notEqual(lower(accounts[name]), lower(ZeroAddress), `${name}: zero account`);
  }
  assert.equal(new Set(Object.values(accounts).map(lower)).size, ACCOUNT_NAMES.length, 'Demo accounts must be distinct');
}

async function requireEmptyAnvil(rpc, accounts) {
  assert.equal(BigInt(await rpc('eth_chainId')), 31337n, 'Only local chain 31337 is supported');
  assert.match(await rpc('web3_clientVersion'), /^anvil\//i, 'Deployment requires Anvil');
  const metadata = await rpc('anvil_metadata');
  assert.equal(metadata.forkedNetwork, null, 'Forked Anvil is not an empty local chain');
  assert.equal(BigInt(await rpc('eth_blockNumber')), 0n, 'Start a NEW empty Anvil chain before deployment');
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  const pending = await rpc('eth_getBlockByNumber', ['pending', false]);
  assert.deepEqual(genesis.transactions, [], 'Genesis must contain no transactions');
  assert.deepEqual(pending.transactions, [], 'Pending transactions make this chain nonempty');
  const unlocked = await rpc('eth_accounts');
  for (const account of Object.values(accounts)) {
    assert.ok(unlocked.some((candidate) => lower(candidate) === lower(account)), 'All demo wallets must be unlocked local accounts');
  }
  for (const account of unlocked) {
    assert.equal(BigInt(await rpc('eth_getTransactionCount', [account, 'pending'])), 0n, 'Local account nonce must be zero');
    assert.equal(await rpc('eth_getCode', [account, 'latest']), '0x', 'Local accounts must not have code');
  }
  return { clientVersion: await rpc('web3_clientVersion'), instanceId: metadata.instanceId, genesisHash: genesis.hash };
}

async function loadProject(root) {
  assert.ok(isAbsolute(root), 'root must be an absolute repository path');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const artifacts = {};
  const sourceHashes = {};
  const artifactProvenance = {};
  const hashFile = async (path) => {
    const absolute = resolve(root, path);
    const rel = relative(root, absolute);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Source path escapes repository');
    const contents = await readFile(absolute);
    sourceHashes[path] = sha(contents);
    return contents;
  };
  for (const path of ['foundry.toml', 'foundry.lock', 'package-lock.json', 'scripts/governance_local.mjs', 'scripts/deploy_local.mjs', 'scripts/check_roles.mjs']) await hashFile(path);
  const lock = JSON.parse(await readFile(join(root, 'foundry.lock'), 'utf8'));
  assert.equal(lock['lib/openzeppelin-contracts'].tag.name, 'v5.4.0', 'Unexpected OpenZeppelin lock');
  assert.equal(lock['lib/openzeppelin-contracts'].tag.rev, 'c64a1edb67b6e3f4a15cca8909c9482ad33a02b0', 'Unexpected OpenZeppelin revision');
  for (const [key, spec] of Object.entries(SPECS)) {
    const path = `out/${spec.name}.sol/${spec.name}.json`;
    const bytes = await readFile(join(root, path));
    const artifact = JSON.parse(bytes.toString('utf8'));
    const metadata = artifact.metadata;
    assert.ok(metadata && metadata.sources, `${key}: rebuild artifacts with forge build`);
    assert.equal(metadata.compiler.version, '0.8.37+commit.f401782d', `${key}: wrong compiler`);
    assert.equal(metadata.settings.optimizer.enabled, true, `${key}: optimizer must be enabled`);
    assert.equal(metadata.settings.optimizer.runs, 200, `${key}: wrong optimizer runs`);
    assert.equal(metadata.settings.evmVersion, 'osaka', `${key}: wrong EVM target`);
    assert.deepEqual(metadata.settings.compilationTarget, { [spec.source]: spec.name }, `${key}: wrong compilation target`);
    // Foundry reorders fragments and inserts empty outputs/normalizes receive
    // inputs. Compare the complete ABI semantics, not those JSON representations.
    const canonicalAbi = (abi) => new Interface(abi).fragments.map((fragment) => fragment.format('json')).sort();
    assert.deepEqual(canonicalAbi(artifact.abi), canonicalAbi(metadata.output.abi), `${key}: ABI disagrees with compiler metadata`);
    assert.match(artifact.bytecode.object, /^0x[0-9a-fA-F]+$/, `${key}: missing/unlinked creation bytecode`);
    assert.match(artifact.deployedBytecode.object, /^0x[0-9a-fA-F]+$/, `${key}: missing/unlinked runtime bytecode`);
    for (const [source, info] of Object.entries(metadata.sources)) {
      const contents = await hashFile(source);
      assert.equal(keccak256(contents), info.keccak256, `${key}: stale artifact or changed source ${source}`);
    }
    artifacts[key] = artifact;
    artifactProvenance[key] = {
      path, sha256: sha(bytes), abiSha256: sha(JSON.stringify(artifact.abi)),
      creationBytecodeSha256: sha(artifact.bytecode.object), runtimeBytecodeSha256: sha(artifact.deployedBytecode.object),
      compiler: metadata.compiler, settings: metadata.settings,
      immutableReferences: artifact.deployedBytecode.immutableReferences ?? {},
    };
  }
  return { artifacts, provenance: { sourceCommit, sourceHashes, artifacts: artifactProvenance } };
}

function constructorArgs(key, manifest) {
  const address = (name) => manifest.contracts[name].address;
  const a = manifest.accounts;
  switch (key) {
    case 'GOV': return [a.A, a.B, a.C, a.D];
    case 'BUD': return [a.funding];
    case 'Treasury': return [address('BUD'), a.deployer];
    case 'Timelock': return [CONFIG.minDelay, [], [], a.deployer];
    case 'Governor': return [address('GOV'), address('Treasury'), address('Timelock')];
    default: throw new Error(`Unknown contract ${key}`);
  }
}

function normalizedRuntime(code, references) {
  assert.match(code, /^0x(?:[0-9a-fA-F]{2})+$/, 'Invalid runtime code');
  const bytes = Buffer.from(code.slice(2), 'hex');
  for (const ranges of Object.values(references ?? {})) {
    for (const { start, length } of ranges) {
      assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(length) && start >= 0 && length > 0 && start + length <= bytes.length,
        'Invalid compiler immutable reference');
      bytes.fill(0, start, start + length);
    }
  }
  return `0x${bytes.toString('hex')}`;
}

async function send(rpc, receipts, label, from, to, data) {
  const transactionHash = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: toQuantity(15000000) }]);
  for (let attempt = 0; attempt < 200; attempt++) {
    const receipt = await rpc('eth_getTransactionReceipt', [transactionHash]);
    if (receipt) {
      assert.equal(receipt.status, '0x1', `${label}: transaction reverted (${transactionHash})`);
      receipts.push({ ...receipt, label });
      return receipt;
    }
    await pause(50);
  }
  throw new Error(`${label}: receipt not mined (${transactionHash})`);
}

/** Deploys real contracts to a caller-owned NEW empty unlocked Anvil chain. */
export async function deployGovernance(rpc, { root, accounts }) {
  validateAccounts(accounts);
  const localChain = await requireEmptyAnvil(rpc, accounts);
  const { artifacts, provenance } = await loadProject(root);
  const manifest = {
    format: 'dao-budget-local-governance-v1', chainId: '31337', sourceCommit: provenance.sourceCommit,
    accounts: Object.fromEntries(Object.entries(accounts).map(([key, value]) => [key, getAddress(value)])),
    config: { ...CONFIG }, contracts: {}, receipts: [], provenance, localChain,
  };
  const abis = Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, artifact.abi]));
  const interfaces = Object.fromEntries(Object.entries(abis).map(([key, abi]) => [key, new Interface(abi)]));
  for (const [key, artifact] of Object.entries(artifacts)) {
    const deployment = await new ContractFactory(artifact.abi, artifact.bytecode.object).getDeployTransaction(...constructorArgs(key, manifest));
    const receipt = await send(rpc, manifest.receipts, `deploy ${key}`, accounts.deployer, null, deployment.data);
    assert.ok(receipt.contractAddress, `${key}: deployment did not create a contract`);
    manifest.contracts[key] = {
      address: getAddress(receipt.contractAddress), deploymentBlock: String(BigInt(receipt.blockNumber)),
      transactionHash: receipt.transactionHash, abiVersion: SPECS[key].abiVersion,
    };
  }
  manifest.scanFromBlock = String(Object.values(manifest.contracts).reduce((min, item) =>
    BigInt(item.deploymentBlock) < min ? BigInt(item.deploymentBlock) : min, BigInt(manifest.contracts.GOV.deploymentBlock)));
  // Handoff policy, not a claim that BE02 implements confirmation/checkpoint handling.
  manifest.confirmations = '2';
  const tx = (key, name, values, label, from = accounts.deployer) => send(rpc, manifest.receipts, label, from,
    manifest.contracts[key].address, interfaces[key].encodeFunctionData(name, values));
  const timelock = manifest.contracts.Timelock.address;
  const governor = manifest.contracts.Governor.address;
  await tx('Treasury', 'grantRole', [SPENDER, timelock], 'grant Treasury spender only to Timelock');
  await tx('Treasury', 'grantRole', [ZeroHash, timelock], 'grant Treasury admin only to Timelock');
  for (const [role, label] of [[PROPOSER, 'proposer'], [EXECUTOR, 'executor'], [CANCELLER, 'canceller']]) {
    await tx('Timelock', 'grantRole', [role, governor], `grant Timelock ${label} only to Governor`);
  }
  await tx('Treasury', 'renounceRole', [ZeroHash, accounts.deployer], 'remove Treasury bootstrap admin');
  await tx('Timelock', 'renounceRole', [ZeroHash, accounts.deployer], 'remove Timelock bootstrap admin');
  // Make the fixed-supply checkpoint historical even when Anvil automines within one second.
  const configuredBlock = await rpc('eth_getBlockByNumber', ['latest', false]);
  await rpc('evm_setNextBlockTimestamp', [toQuantity(BigInt(configuredBlock.timestamp) + 1n)]);
  await rpc('evm_mine');
  // A complete event-reconstructed role check gates the very first BUD funding transaction.
  manifest.preFundingRoleCheck = await checkGovernanceRoles(rpc, manifest, { root });
  const call = async (key, name, values = []) => interfaces[key].decodeFunctionResult(name,
    await rpc('eth_call', [{ to: manifest.contracts[key].address, data: interfaces[key].encodeFunctionData(name, values) }, 'latest']))[0];
  assert.equal(await call('BUD', 'balanceOf', [manifest.contracts.Treasury.address]), 0n, 'Treasury must be unfunded before final role validation');
  assert.equal(await call('BUD', 'balanceOf', [accounts.funding]), 20000n * UNIT, 'Funding wallet must hold the full initial BUD supply');
  for (const [name, amount] of [['A', 400n], ['B', 300n], ['C', 200n], ['D', 100n]]) {
    assert.equal(await call('GOV', 'balanceOf', [accounts[name]]), amount * UNIT, `${name}: GOV allocation`);
    await tx('GOV', 'delegate', [accounts[name]], `self-delegate ${name}`, accounts[name]);
  }
  const delegatedBlock = await rpc('eth_getBlockByNumber', ['latest', false]);
  manifest.delegationTimestamp = String(BigInt(delegatedBlock.timestamp));
  await rpc('evm_setNextBlockTimestamp', [toQuantity(BigInt(delegatedBlock.timestamp) + 1n)]);
  await rpc('evm_mine');
  assert.ok(await call('GOV', 'clock') > BigInt(manifest.delegationTimestamp), 'Delegation checkpoint must be in the past');
  for (const [name, amount] of [['A', 400n], ['B', 300n], ['C', 200n], ['D', 100n]]) {
    assert.equal(lower(await call('GOV', 'delegates', [accounts[name]])), lower(accounts[name]), `${name}: delegate`);
    assert.equal(await call('GOV', 'getPastVotes', [accounts[name], manifest.delegationTimestamp]), amount * UNIT, `${name}: past voting weight`);
  }
  await tx('BUD', 'transfer', [manifest.contracts.Treasury.address, CONFIG.treasurySeed], 'fund Treasury with 10000 BUD after role validation', accounts.funding);
  assert.equal(await call('BUD', 'balanceOf', [manifest.contracts.Treasury.address]), 10000n * UNIT, 'Treasury seed balance');
  assert.equal(await call('BUD', 'balanceOf', [accounts.funding]), 10000n * UNIT, 'Funding wallet remaining balance');
  manifest.roleCheck = await checkGovernanceRoles(rpc, manifest, { root });
  return { manifest, abis };
}

/** Read-only: every on-chain observation is pinned to one local height H, not consensus finality. */
export async function checkGovernanceRoles(rpc, manifest, { root }) {
  assert.equal(manifest.format, 'dao-budget-local-governance-v1', 'Unsupported deployment manifest');
  assert.equal(manifest.chainId, '31337', 'Manifest must describe local chain 31337');
  assert.equal(BigInt(await rpc('eth_chainId')), 31337n, 'Wrong RPC chain');
  const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
  assert.equal(genesis.hash, manifest.localChain.genesisHash, 'Manifest belongs to a different local genesis');
  validateAccounts(manifest.accounts);
  assert.deepEqual(manifest.config, CONFIG, 'Manifest weakens or changes the locked project configuration');
  const { artifacts, provenance } = await loadProject(root);
  assert.equal(manifest.sourceCommit, provenance.sourceCommit, 'Manifest source commit is not current HEAD');
  assert.deepEqual(manifest.provenance, provenance, 'Manifest provenance differs from current project/compiler/artifacts');
  assert.deepEqual(Object.keys(manifest.contracts).sort(), Object.keys(SPECS).sort(), 'Unexpected/missing contracts');
  const height = await rpc('eth_blockNumber');
  const block = await rpc('eth_getBlockByNumber', [height, false]);
  assert.ok(block?.hash, 'Missing validation block');
  const H = toQuantity(BigInt(height));
  const interfaces = Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, new Interface(artifact.abi)]));
  const address = (key) => manifest.contracts[key].address;
  assert.equal(new Set(Object.keys(SPECS).map((key) => lower(address(key)))).size, 5, 'Contracts must be distinct');
  assert.equal(manifest.confirmations, '2', 'Manifest must retain the agreed K=2 handoff policy');
  assert.equal(manifest.scanFromBlock, String(Object.values(manifest.contracts).reduce((min, item) =>
    BigInt(item.deploymentBlock) < min ? BigInt(item.deploymentBlock) : min, BigInt(manifest.contracts.GOV.deploymentBlock))), 'Wrong earliest deployment block');
  for (const key of Object.keys(SPECS)) {
    assert.notEqual(lower(address(key)), lower(ZeroAddress), `${key}: zero contract address`);
    assert.ok(!Object.values(manifest.accounts).some((account) => lower(account) === lower(address(key))), `${key}: contract is a demo account`);
  }
  const call = async (key, name, values = []) => interfaces[key].decodeFunctionResult(name,
    await rpc('eth_call', [{ to: address(key), data: interfaces[key].encodeFunctionData(name, values) }, H]))[0];
  const identities = {};
  for (const [key, artifact] of Object.entries(artifacts)) {
    const deployed = manifest.contracts[key];
    assert.equal(deployed.abiVersion, SPECS[key].abiVersion, `${key}: wrong ABI version`);
    const deploymentBlock = decimal(deployed.deploymentBlock, `${key} deploymentBlock`);
    assert.ok(deploymentBlock > 0n && deploymentBlock <= BigInt(H), `${key}: invalid deployment block`);
    const receipt = await rpc('eth_getTransactionReceipt', [deployed.transactionHash]);
    assert.ok(receipt, `${key}: missing deployment receipt`);
    assert.equal(receipt.status, '0x1', `${key}: reverted deployment`);
    assert.equal(lower(receipt.contractAddress), lower(address(key)), `${key}: wrong deployed contract`);
    assert.equal(BigInt(receipt.blockNumber), deploymentBlock, `${key}: wrong deployment block`);
    const canonical = await rpc('eth_getBlockByNumber', [toQuantity(deploymentBlock), false]);
    assert.equal(canonical.hash, receipt.blockHash, `${key}: noncanonical deployment receipt`);
    const transaction = await rpc('eth_getTransactionByHash', [deployed.transactionHash]);
    assert.ok(transaction && transaction.to === null, `${key}: expected a contract creation transaction`);
    assert.equal(lower(transaction.from), lower(manifest.accounts.deployer), `${key}: unexpected deployment sender`);
    assert.equal(BigInt(transaction.value), 0n, `${key}: unexpected deployment value`);
    const expected = await new ContractFactory(artifact.abi, artifact.bytecode.object).getDeployTransaction(...constructorArgs(key, manifest));
    assert.equal(transaction.input.toLowerCase(), expected.data.toLowerCase(), `${key}: deployment source or constructor arguments differ`);
    const runtime = await rpc('eth_getCode', [address(key), H]);
    assert.equal(normalizedRuntime(runtime, artifact.deployedBytecode.immutableReferences),
      normalizedRuntime(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences), `${key}: compiler runtime identity mismatch`);
    identities[key] = { address: getAddress(address(key)), deploymentBlock: String(deploymentBlock), transactionHash: deployed.transactionHash,
      runtimeSha256: sha(runtime), normalizedRuntimeSha256: sha(normalizedRuntime(runtime, artifact.deployedBytecode.immutableReferences)),
      abiSha256: provenance.artifacts[key].abiSha256 };
  }
  for (const [key, getter, expected] of [
    ['Treasury', 'budgetToken', address('BUD')], ['Governor', 'token', address('GOV')],
    ['Governor', 'treasury', address('Treasury')], ['Governor', 'timelock', address('Timelock')],
  ]) assert.equal(lower(await call(key, getter)), lower(expected), `${key}.${getter}: wrong contract link`);
  for (const [key, getter, expected] of [
    ['GOV', 'name', 'Governance Token'], ['GOV', 'symbol', 'GOV'], ['BUD', 'name', 'Budget Token'], ['BUD', 'symbol', 'BUD'],
    ['Governor', 'name', 'BudgetGovernor'], ['GOV', 'CLOCK_MODE', CONFIG.clockMode], ['Governor', 'CLOCK_MODE', CONFIG.clockMode],
  ]) assert.equal(await call(key, getter), expected, `${key}.${getter}: wrong configuration`);
  for (const [key, getter, expected] of [
    ['GOV', 'decimals', '18'], ['BUD', 'decimals', '18'], ['GOV', 'totalSupply', CONFIG.govSupply], ['BUD', 'totalSupply', CONFIG.budSupply],
    ['Governor', 'proposalThreshold', CONFIG.proposalThreshold], ['Governor', 'votingDelay', CONFIG.votingDelay],
    ['Governor', 'votingPeriod', CONFIG.votingPeriod], ['Governor', 'quorumNumerator()', CONFIG.quorumNumerator],
    ['Governor', 'quorumDenominator', CONFIG.quorumDenominator], ['Timelock', 'getMinDelay', CONFIG.minDelay],
  ]) assert.equal(String(await call(key, getter)), expected, `${key}.${getter}: wrong configuration`);
  for (const key of ['GOV', 'Governor']) assert.equal(await call(key, 'clock'), BigInt(block.timestamp), `${key}: clock is not timestamp based`);
  // H-1 in timestamp units is always a valid past lookup, even before demo delegation.
  const past = BigInt(block.timestamp) - 1n;
  assert.equal(await call('Governor', 'quorum', [past]), 200n * UNIT, 'Governor quorum must be 20% of the fixed GOV supply');
  const roleReports = {};
  const expectedRoles = {
    Treasury: { [ZeroHash]: [address('Timelock')], [SPENDER]: [address('Timelock')] },
    Timelock: { [ZeroHash]: [address('Timelock')], [PROPOSER]: [address('Governor')], [EXECUTOR]: [address('Governor')], [CANCELLER]: [address('Governor')] },
  };
  for (const [key, expected] of Object.entries(expectedRoles)) {
    const iface = interfaces[key];
    for (const [getter, value] of [['DEFAULT_ADMIN_ROLE', ZeroHash], ...(key === 'Treasury'
      ? [['SPENDER_ROLE', SPENDER]] : [['PROPOSER_ROLE', PROPOSER], ['EXECUTOR_ROLE', EXECUTOR], ['CANCELLER_ROLE', CANCELLER]])]) {
      assert.equal(await call(key, getter), value, `${key}.${getter}: wrong role identifier`);
    }
    const logs = await rpc('eth_getLogs', [{ address: address(key), fromBlock: toQuantity(BigInt(manifest.contracts[key].deploymentBlock)), toBlock: H,
      topics: [[iface.getEvent('RoleGranted').topicHash, iface.getEvent('RoleRevoked').topicHash, iface.getEvent('RoleAdminChanged').topicHash]] }]);
    logs.sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1
      : BigInt(a.logIndex) < BigInt(b.logIndex) ? -1 : BigInt(a.logIndex) > BigInt(b.logIndex) ? 1 : 0);
    const holders = new Map(Object.keys(expected).map((role) => [role, new Set()]));
    const candidates = new Set([ZeroAddress, ...Object.values(manifest.accounts), ...Object.keys(SPECS).map(address)].map(lower));
    for (const log of logs) {
      assert.ok(!log.removed && lower(log.address) === lower(address(key)) && BigInt(log.blockNumber) <= BigInt(H), `${key}: invalid role log`);
      const event = iface.parseLog(log);
      const role = event.args.role;
      assert.ok(holders.has(role), `${key}: unexpected role discovered in complete event history: ${role}`);
      if (event.name === 'RoleAdminChanged') {
        assert.equal(event.args.newAdminRole, ZeroHash, `${key}: unexpected role admin edge`);
      } else {
        const account = lower(event.args.account);
        candidates.add(account);
        if (event.name === 'RoleGranted') holders.get(role).add(account);
        else holders.get(role).delete(account);
      }
    }
    const rows = [];
    for (const [role, expectedHolders] of Object.entries(expected)) {
      const actual = [...holders.get(role)].sort();
      assert.deepEqual(actual, expectedHolders.map(lower).sort(), `${key}: unexpected/missing complete holder set for ${role}`);
      assert.equal(await call(key, 'getRoleAdmin', [role]), ZeroHash, `${key}: role administrator must be DEFAULT_ADMIN_ROLE`);
      for (const candidate of candidates) {
        assert.equal(await call(key, 'hasRole', [role, candidate]), holders.get(role).has(candidate), `${key}: event history/hasRole mismatch for ${role} ${candidate}`);
      }
      rows.push({ role, adminRole: ZeroHash, holders: actual, checkedCandidates: [...candidates].sort() });
    }
    roleReports[key] = { fromBlock: manifest.contracts[key].deploymentBlock, toBlock: String(BigInt(H)), eventCount: logs.length, roles: rows };
  }
  const finalBlock = await rpc('eth_getBlockByNumber', [H, false]);
  assert.equal(finalBlock.hash, block.hash, 'Validation block changed during role check');
  return { height: String(BigInt(H)), blockHash: block.hash, timestamp: String(BigInt(block.timestamp)), chainId: '31337',
    sourceCommit: provenance.sourceCommit, config: { ...CONFIG }, identities, roles: roleReports };
}
