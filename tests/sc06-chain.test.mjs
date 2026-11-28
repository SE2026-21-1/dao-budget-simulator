import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkFixture, projectFixture, interfaces } from '../scripts/check_sc06_chain.mjs';
import { createSmokeLifecycle } from '../scripts/smoke_lifecycle.mjs';

let fixturePath = process.env.SC06_FIXTURE;
if (!fixturePath) {
  const life = createSmokeLifecycle();
  try {
    const temp = await life.temporaryDirectory(join(tmpdir(), 'sc06-tests-'));
    const output = join(temp, 'current');
    await new Promise((done, reject) => {
      const child = life.spawn(process.execPath, ['--import', 'tsx', 'scripts/generate_sc06_chain.mjs', output],
        { cwd: new URL('../', import.meta.url), stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? done() : reject(new Error(`SC06 generation failed (${code}); commit source before testing`)));
    });
    fixturePath = join(output, 'chain.json');
    test.after(async () => { try { await life.cleanup(); } finally { life.dispose(); } });
  } catch (error) {
    try { await life.cleanup(); } finally { life.dispose(); }
    throw error;
  }
}
const original = JSON.parse(await readFile(fixturePath));
const archived = JSON.parse(await readFile(new URL('../fixtures/chain/sc06-v1/chain.json', import.meta.url)));
const abi = await interfaces();
const mutateQuorum = f => {
  const snapshot = f.receipts.flatMap(r => r.logs)
    .filter(l => l.address.toLowerCase() === f.manifest.contracts.Governor.address.toLowerCase())
    .map(l => abi.Governor.parseLog(l)).find(e => e?.name === 'ProposalCreated').args.voteStart;
  const data = abi.Governor.encodeFunctionData('quorum', [snapshot]);
  const call = f.calls.find(c => c.to.toLowerCase() === f.manifest.contracts.Governor.address.toLowerCase() && c.data === data);
  assert.ok(call);
  call.result = abi.Governor.encodeFunctionResult('quorum', [1001n * 10n ** 18n]);
};
test('canonical receipts decode with TV2 and link calldata/IDs, ledger and Pending cancel', async () => {
  const result = await checkFixture(original);
  assert.equal(result.disbursements, 1);
  assert.equal(result.outgoingBaseUnits, '1000000000000000000000');
});
test('SC06 raw logs replay through TV2 classify/buildModel/evaluate at canonical H', async () => {
  const p = await projectFixture(original);
  assert.equal(p.asOfBlock, BigInt(original.head.number).toString()); assert.equal(p.blockHash, original.head.hash);
  assert.deepEqual(p.states, ['Executed', 'Canceled']); assert.equal(p.votes, 2);
  assert.equal(p.forBaseUnits, '700000000000000000000'); assert.equal(p.operations, 1);
  assert.equal(p.disbursements, 1); assert.equal(p.totalOut, '1000000000000000000000');
  assert.equal(p.balance, '9000000000000000000000');
});
test('historical v1 logs derive quorum without relabeling archive provenance', async () => {
  assert.deepEqual((await projectFixture(archived)).states, ['Executed', 'Canceled']);
});
test('historical v1 projection rejects isolated 200 → 1001 GOV quorum mutation', async () => {
  const f = structuredClone(archived); mutateQuorum(f);
  await assert.rejects(projectFixture(f), /historical quorum mismatch/);
});
test('full current canonical checker rejects isolated 200 → 1001 GOV quorum mutation', async () => {
  const f = structuredClone(original); mutateQuorum(f);
  await assert.rejects(checkFixture(f), /historical quorum mismatch/);
});
test('current historical supply call must agree with mint/burn replay', async () => {
  const f = structuredClone(original);
  const call = f.calls.find(c => c.to.toLowerCase() === f.manifest.contracts.GOV.address.toLowerCase()
    && c.data.startsWith(abi.GOV.getFunction('getPastTotalSupply').selector));
  assert.ok(call);
  call.result = abi.GOV.encodeFunctionResult('getPastTotalSupply', [5000n * 10n ** 18n]);
  await assert.rejects(checkFixture(f), /historical GOV supply mismatch/);
});
test('current historical quorum numerator must agree with update logs', async () => {
  const f = structuredClone(original);
  const call = f.calls.find(c => c.to.toLowerCase() === f.manifest.contracts.Governor.address.toLowerCase()
    && c.data.startsWith(abi.Governor.getFunction('quorumNumerator(uint256)').selector));
  assert.ok(call);
  call.result = abi.Governor.encodeFunctionResult('quorumNumerator(uint256)', [21n]);
  await assert.rejects(checkFixture(f), /historical quorum numerator mismatch/);
});
const changes = {
  generationHash: f => { f.generation.sourceHashes['scripts/generate_sc06_chain.mjs'] = '0'.repeat(64); },
  missingGenerationHash: f => { delete f.generation.sourceHashes['scripts/generate_sc06_chain.mjs']; },
  invalidCommit: f => { f.generation.sourceCommit = '0'.repeat(40); },
  wrongCommit: f => { f.generation.sourceCommit = f.blocks[0].hash.slice(2, 42); },
  manifestHash: f => { f.manifest.provenance.sourceHashes['contracts/BudgetGovernor.sol'] = '0'.repeat(64); },
  auditHead: f => { f.roleAudit.blockHash = '0x' + '0'.repeat(64); },
  abiVersion: f => { f.manifest.contracts.Governor.abiVersion = 'not-this-deployment'; },
  contractAddress: f => { f.manifest.contracts.Treasury.address = f.manifest.accounts.A; },
  wrongLogBlock: f => { f.receipts.find(r => r.logs.length).logs[0].blockHash = f.blocks.at(-1).hash; },
  wrongTransactionBlock: f => { f.transactions[0].blockHash = f.blocks.at(-1).hash; },
  auditHolder: f => { f.roleAudit.roles.Timelock.roles[0].holders = []; },
  runtime: f => { f.runtimeCode.Treasury = '0x00'; },
  amount: f => { f.proposals[0].amount = '1000'; },
  descriptionWhitespace: f => { f.proposals[0].description = f.proposals[0].description.trim(); },
  unicodeNormalization: f => { f.proposals[0].description = f.proposals[0].description.normalize('NFC'); },
  descriptionHash: f => { f.proposals[0].descriptionHash = '0x' + '00'.repeat(32); },
  proposalId: f => { f.proposals[0].proposalId = '1'; },
  operationId: f => { f.proposals[0].operationId = '0x' + '00'.repeat(32); },
  salt: f => { f.proposals[0].salt = f.proposals[0].descriptionHash; },
  blockHash: f => { f.blocks.at(-1).hash = '0x' + '11'.repeat(32); },
  missingReceipt: f => { f.receipts.pop(); },
  rawLogData: f => { f.receipts.find(r => r.logs.length).logs[0].data = '0x00'; },
  logIndex: f => { f.receipts.find(r => r.logs.length).logs[0].logIndex = '0x3'; },
  doubleCountedOutflow: f => { f.balances.treasury = '8000000000000000000000'; },
  canceledOperation: f => {
    const c = f.calls.find(c => c.data.endsWith(f.proposals[1].operationId.slice(2)));
    c.result = '0x' + '0'.repeat(63) + '1';
  },
};
for (const [name, mutate] of Object.entries(changes)) test(`reject changed fixture: ${name}`, async () => {
  const f = structuredClone(original); mutate(f);
  await assert.rejects(checkFixture(f));
});
