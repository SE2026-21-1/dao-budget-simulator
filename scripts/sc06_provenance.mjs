import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ContractFactory, ZeroHash } from 'ethers';

const root = fileURLToPath(new URL('../', import.meta.url));
export const generationFiles = [
  'scripts/generate_sc06_chain.mjs', 'scripts/check_sc06_chain.mjs', 'scripts/sc06_provenance.mjs',
  'tests/sc06-chain.test.mjs', 'indexer/decoder.ts', 'indexer/abi-registry.ts',
  'scripts/receipt.mjs', 'scripts/smoke_lifecycle.mjs',
  ...execFileSync('git', ['ls-files', 'indexer'], { cwd: root, encoding: 'utf8' }).trim().split('\n'),
].filter((v, i, a) => a.indexOf(v) === i).sort();
const git = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifySources(revision, hashes) {
  assert.match(revision, /^[0-9a-f]{40}$/, 'source revision must be full commit ID');
  assert.equal(git(['rev-parse', '--verify', `${revision}^{commit}`]).toString().trim(), revision);
  git(['merge-base', '--is-ancestor', revision, 'HEAD']);
  for (const [path, expected] of Object.entries(hashes)) {
    assert.ok(!path.startsWith('/') && !path.split('/').includes('..'), 'unsafe provenance path');
    let committed;
    const sub = ['lib/forge-std', 'lib/openzeppelin-contracts'].find(p => path.startsWith(p + '/'));
    if (sub) {
      const commit = git(['rev-parse', `${revision}:${sub}`]).toString().trim();
      committed = git(['-C', sub, 'show', `${commit}:${path.slice(sub.length + 1)}`]);
    } else committed = git(['show', `${revision}:${path}`]);
    assert.equal(sha(committed), expected, `source absent/different at commit: ${path}`);
    assert.equal(sha(await readFile(root + path)), expected, `working source differs: ${path}`);
  }
}

export async function checkProvenance(f, abi, rpc) {
  const rev = f.generation.sourceCommit, m = f.manifest, audit = f.roleAudit;
  assert.deepEqual(Object.keys(f.generation.sourceHashes).sort(), generationFiles);
  await verifySources(rev, f.generation.sourceHashes);
  assert.equal(m.sourceCommit, rev); assert.equal(m.provenance.sourceCommit, rev);
  for (const required of ['foundry.toml', 'foundry.lock', 'package-lock.json', 'scripts/governance_local.mjs', 'scripts/deploy_local.mjs', 'scripts/check_roles.mjs'])
    assert.ok(Object.hasOwn(m.provenance.sourceHashes, required), `missing manifest source: ${required}`);
  await verifySources(rev, m.provenance.sourceHashes);
  assert.equal(audit.sourceCommit, rev); assert.equal(audit.chainId, m.chainId);
  assert.equal(audit.height, BigInt(f.head.number).toString());
  assert.equal(audit.blockHash, f.head.hash);
  assert.equal(audit.timestamp, BigInt(f.blocks.at(-1).timestamp).toString());
  assert.deepEqual(audit.config, m.config);
  const specs = { GOV: ['GovernanceToken', 'sc02-governance-token-v1'], BUD: ['BudgetToken', 'oz-5.4.0-erc20'],
    Treasury: ['Treasury', 'sc01-itreasury-v1'], Governor: ['BudgetGovernor', 'oz-5.4.0-governor'], Timelock: ['TimelockController', 'oz-5.4.0-timelock'] };
  assert.deepEqual(Object.keys(m.contracts).sort(), Object.keys(specs).sort());
  assert.equal(new Set(Object.values(m.contracts).map(c => c.address.toLowerCase())).size, 5);
  const rawLogs = f.receipts.flatMap(r => r.logs);
  for (const [key, [name, version]] of Object.entries(specs)) {
    const c = m.contracts[key], p = m.provenance.artifacts[key], identity = audit.identities[key];
    assert.equal(c.abiVersion, version);
    assert.equal(p.path, `out/${name}.sol/${name}.json`);
    const bytes = await readFile(root + p.path), artifact = JSON.parse(bytes);
    assert.equal(sha(bytes), p.sha256, `${key}: compiler artifact differs`);
    assert.equal(sha(JSON.stringify(artifact.abi)), p.abiSha256);
    assert.deepEqual(p.compiler, artifact.metadata.compiler); assert.deepEqual(p.settings, artifact.metadata.settings);
    for (const [source, metadata] of Object.entries(artifact.metadata.sources)) {
      assert.ok(Object.hasOwn(m.provenance.sourceHashes, source), `missing compiler source ${source}`);
      const content = await readFile(root + source);
      const { keccak256 } = await import('ethers');
      assert.ok(keccak256(content) === metadata.keccak256 ||
        keccak256(Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'))) === metadata.keccak256,
      `stale compiler source ${source}`);
    }
    assert.equal(identity.address.toLowerCase(), c.address.toLowerCase());
    assert.equal(identity.deploymentBlock, c.deploymentBlock); assert.equal(identity.transactionHash, c.transactionHash);
    assert.equal(identity.abiSha256, p.abiSha256);
    const runtime = f.runtimeCode[key]; assert.equal(sha(runtime), identity.runtimeSha256);
    const normalize = code => {
      let hex = code.slice(2).toLowerCase();
      for (const ranges of Object.values(artifact.deployedBytecode.immutableReferences ?? {}))
        for (const { start, length } of ranges) hex = hex.slice(0, start * 2) + '0'.repeat(length * 2) + hex.slice((start + length) * 2);
      return '0x' + hex;
    };
    assert.equal(normalize(runtime), normalize(artifact.deployedBytecode.object));
    const tx = f.transactions.find(t => t.hash === c.transactionHash); assert.ok(tx);
    assert.equal(tx.to, null); assert.equal(tx.from.toLowerCase(), m.accounts.deployer.toLowerCase());
    const address = n => m.contracts[n].address;
    const args = { GOV: [m.accounts.A, m.accounts.B, m.accounts.C, m.accounts.D], BUD: [m.accounts.funding],
      Treasury: [address('BUD'), m.accounts.deployer], Timelock: [m.config.minDelay, [], [], m.accounts.deployer],
      Governor: [address('GOV'), address('Treasury'), address('Timelock')] }[key];
    assert.equal(tx.input, (await new ContractFactory(artifact.abi, artifact.bytecode.object).getDeployTransaction(...args)).data);
    if (rpc) assert.equal(await rpc('eth_getCode', [c.address, f.head.number]), runtime);
  }
  // Independently replay role holders from the archived canonical logs; compare
  // both saved audit report and pinned raw eth_call responses, not audit labels alone.
  const expectedRoles = { Treasury: { [ZeroHash]: ['Timelock'], [await roleId('SPENDER_ROLE')]: ['Timelock'] },
    Timelock: { [ZeroHash]: ['Timelock'], [await roleId('PROPOSER_ROLE')]: ['Governor'],
      [await roleId('EXECUTOR_ROLE')]: ['Governor'], [await roleId('CANCELLER_ROLE')]: ['Governor'] } };
  for (const [key, expected] of Object.entries(expectedRoles)) {
    const report = audit.roles[key], c = m.contracts[key];
    assert.equal(report.fromBlock, c.deploymentBlock); assert.equal(report.toBlock, audit.height);
    const roleLogs = rawLogs.filter(l => l.address.toLowerCase() === c.address.toLowerCase())
      .map(l => abi[key].parseLog(l)).filter(e => ['RoleGranted', 'RoleRevoked', 'RoleAdminChanged'].includes(e.name));
    assert.equal(report.eventCount, roleLogs.length);
    assert.deepEqual(report.roles.map(r => r.role).sort(), Object.keys(expected).sort());
    for (const [role, holders] of Object.entries(expected)) {
      const active = new Set(), candidates = new Set();
      for (const e of roleLogs) {
        assert.ok(Object.hasOwn(expected, e.args.role), 'unexpected role');
        if (e.name === 'RoleAdminChanged') { assert.equal(e.args.newAdminRole, ZeroHash); continue; }
        if (e.args.role !== role) continue;
        const account = e.args.account.toLowerCase(); candidates.add(account);
        if (e.name === 'RoleGranted') active.add(account); else active.delete(account);
      }
      const row = report.roles.find(r => r.role === role);
      assert.deepEqual([...active].sort(), holders.map(k => m.contracts[k].address.toLowerCase()).sort());
      assert.deepEqual(row.holders, [...active].sort()); assert.equal(row.adminRole, ZeroHash);
      const read = (method, args) => {
        const data = abi[key].encodeFunctionData(method, args);
        const call = f.calls.find(x => x.to.toLowerCase() === c.address.toLowerCase() && x.data === data);
        assert.ok(call, `missing audit call ${key}.${method}`); assert.equal(call.block, f.head.number);
        return abi[key].decodeFunctionResult(method, call.result)[0];
      };
      assert.equal(read('getRoleAdmin', [role]), ZeroHash);
      assert.ok([...candidates].every(a => row.checkedCandidates.includes(a)));
      for (const candidate of row.checkedCandidates) assert.equal(read('hasRole', [role, candidate]), active.has(candidate));
    }
  }
}
async function roleId(name) { const { id } = await import('ethers'); return id(name); }
