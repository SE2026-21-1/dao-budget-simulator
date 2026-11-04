import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ZeroHash } from 'ethers';
import { buildModel, classify, evaluate } from '../../indexer/projection/model.js';
import { Scenario, addresses, actor, recipient } from './projection-fixture.js';
import { hash } from './helpers.js';
import type { NormalizedLog } from '../../indexer/types.js';

const build = (s: Scenario) => buildModel(s.events, addresses.treasury, addresses.governor);
test('raw description, ID/calldata, zero/repeated requestId, WithParams and exact uint256 survive replay', () => {
  const s = new Scenario();
  const p = s.propose();
  s.propose(ZeroHash, 'Different description');
  s.vote(p, 1, 1n << 255n);
  const m = build(s);
  assert.equal(m.proposals.length, 2);
  assert.equal(m.proposals[0]!.requestId, ZeroHash);
  assert.equal(m.proposals[0]!.description, '  {"version":1,"title":"Ngân sách 🗳️","body":"Giữ nguyên mô tả"}  ');
  assert.equal(m.proposals[0]!.id, p.id);
  assert.equal(m.proposals[0]!.amount, '1000');
  assert.equal(m.votes[0]!.params, '0x0001ff00');
  assert.equal(m.votes[0]!.weight, (1n << 255n).toString());
});
test('successful lifecycle links same-tx operation/request/Transfer and counts one payment', () => {
  const s = new Scenario();
  s.fund();
  const p = s.propose();
  s.vote(p);
  s.queue(p);
  s.execute(p);
  const m = build(s);
  assert.equal(m.totalIn, 10000n);
  assert.equal(m.totalOut, 1000n);
  assert.equal(m.balance, 9000n);
  assert.equal(m.disbursements[0]!.transfer.source.name, 'Transfer');
  assert.equal(m.disbursements[0]!.proposal.id, p.id);
  assert.notEqual(m.operations[0]!.salt, p.descriptionHash);
  assert.deepEqual(evaluate(m.proposals[0]!, 1481n, 200n), {
    state: 'Executed',
    quorum: 200n,
    operationStatus: 'Done',
  });
});
test('unrelated BUD, self and zero transfers do not change treasury totals', () => {
  const s = new Scenario();
  s.fund();
  s.add('budget_token', 'Transfer', [actor, recipient, 99n], 2n, 1000n);
  s.add('budget_token', 'Transfer', [addresses.treasury, addresses.treasury, 500n], 3n, 1001n);
  s.add('budget_token', 'Transfer', [actor, addresses.treasury, 0n], 4n, 1002n);
  s.add('budget_token', 'Transfer', [addresses.treasury, recipient, 0n], 5n, 1003n);
  const m = build(s);
  assert.equal(m.transfers.length, 4);
  assert.equal(m.totalIn, 10000n);
  assert.equal(m.totalOut, 0n);
});
test('timestamp boundaries and empty-block transitions: snapshot inclusive Pending, deadline inclusive Active', () => {
  const s = new Scenario();
  s.propose();
  const p = build(s).proposals[0]!;
  for (const clock of [1000n, 1060n]) assert.equal(evaluate(p, clock, null).state, 'Pending');
  for (const clock of [1061n, 1360n]) assert.equal(evaluate(p, clock, 200n).state, 'Active');
  assert.equal(evaluate(p, 1361n, 200n).state, 'Defeated');
  assert.throws(() => evaluate(p, 1060n, 200n));
  assert.throws(() => evaluate(p, 1061n, null));
});
for (const [against, yes, abstain, expected] of [
  [0n, 100n, 0n, 'Defeated'],
  [0n, 100n, 100n, 'Succeeded'],
  [200n, 200n, 0n, 'Defeated'],
  [300n, 200n, 100n, 'Defeated'],
] as const) {
  test(`quorum/result ${against}/${yes}/${abstain} -> ${expected}`, () => {
    const s = new Scenario();
    s.propose();
    const p = build(s).proposals[0]!;
    p.votes = [against, yes, abstain];
    assert.equal(evaluate(p, 1361n, 200n).state, expected);
  });
}
test('ETA inclusive Ready remains Queued; absent success receipt leaves failed execute retryable', () => {
  const s = new Scenario();
  const p = s.propose();
  s.vote(p);
  s.queue(p);
  const proposal = build(s).proposals[0]!;
  assert.deepEqual(evaluate(proposal, 1480n, 200n), { state: 'Queued', quorum: 200n, operationStatus: 'Waiting' });
  assert.deepEqual(evaluate(proposal, 1481n, 200n), { state: 'Queued', quorum: 200n, operationStatus: 'Ready' });
});
test('Pending cancellation and direct Timelock cancellation are represented', () => {
  const s = new Scenario();
  const p = s.propose();
  s.add('governor', 'ProposalCanceled', [p.id], 3n, 1001n);
  assert.equal(evaluate(build(s).proposals[0]!, 1001n, null).state, 'Canceled');
  const q = new Scenario();
  const qp = q.propose();
  q.vote(qp);
  const id = q.queue(qp);
  q.add('timelock', 'Cancelled', [id], 9n, 1400n);
  assert.deepEqual(evaluate(build(q).proposals[0]!, 1400n, 200n), {
    state: 'Canceled',
    quorum: 200n,
    operationStatus: 'Canceled',
  });
});
for (const mutation of [
  'wrong ID',
  'wrong description',
  'wrong salt',
  'wrong ETA',
  'wrong executed calldata',
  'missing transfer',
  'missing payment',
  'wrong transaction',
  'ambiguous transfer',
  'duplicate vote',
  'unlinked outflow',
] as const) {
  test(`reject inconsistent projection: ${mutation}`, () => {
    const s = new Scenario();
    s.fund();
    const p = s.propose();
    s.vote(p);
    s.queue(p);
    s.execute(p);
    const event = (name: string) => s.events.find((e) => e.name === name)!;
    if (mutation === 'wrong ID') event('ProposalCreated').payload.proposalId = '1';
    if (mutation === 'wrong description') event('ProposalCreated').payload.description = 'changed';
    if (mutation === 'wrong salt') event('CallSalt').payload.salt = ZeroHash;
    if (mutation === 'wrong ETA') event('ProposalQueued').payload.etaSeconds = '1480';
    if (mutation === 'wrong executed calldata') event('CallExecuted').payload.data = '0x';
    if (mutation === 'missing transfer') s.events = s.events.filter((e) => e.name !== 'Transfer' || e.block !== '10');
    if (mutation === 'missing payment') s.events = s.events.filter((e) => e.name !== 'BudgetDisbursed');
    if (mutation === 'wrong transaction') event('BudgetDisbursed').tx = hash(99999);
    if (mutation === 'ambiguous transfer') {
      const e = {
        ...event('Transfer'),
        ...s.events.find((e) => e.name === 'Transfer' && e.block === '10')!,
        id: '999',
      };
      s.events.splice(-3, 0, e);
    }
    if (mutation === 'duplicate vote') s.events.splice(3, 0, { ...event('VoteCastWithParams'), id: '999' });
    if (mutation === 'unlinked outflow')
      s.add('budget_token', 'Transfer', [addresses.treasury, recipient, 1n], 11n, 1500n);
    assert.throws(() => build(s), { code: 'PROJECTION_INCOMPLETE' });
  });
}
test('malformed/unknown business log cannot be silently skipped', () => {
  const s = new Scenario();
  s.fund();
  const log = s.logs[0]!;
  assert.equal(classify({ ...log, topics: [hash(999)] })?.status, 'unknown_topic');
  assert.equal(classify({ ...log, data: '0x' })?.status, 'decode_error');
});
test('replay original BE03 real receipt bytes offline: 16 explicitly recognized ancillary, 14 business events', async () => {
  const data = JSON.parse(
    await readFile(new URL('../../docs/evidence/be03-integration-20261024/sql-final.json', import.meta.url), 'utf8'),
  );
  const manifest = JSON.parse(
    await readFile(new URL('../../docs/evidence/be03-integration-20261024/manifest.json', import.meta.url), 'utf8'),
  );
  const roles = { governor: 'Governor', treasury: 'Treasury', timelock: 'Timelock', budget_token: 'BUD' } as const;
  const events = [];
  let ignored = 0;
  for (const [i, r] of data.events.entries()) {
    const role = r.contract_role as keyof typeof roles;
    const c = manifest.contracts[roles[role]];
    const log: NormalizedLog = {
      contract: {
        role,
        address: c.address.toLowerCase(),
        deploymentBlock: BigInt(c.deploymentBlock),
        abiVersion: c.abiVersion,
      },
      blockNumber: BigInt(r.block_number),
      blockHash: r.block_hash,
      transactionHash: r.transaction_hash,
      transactionIndex: BigInt(r.transaction_index),
      logIndex: BigInt(r.log_index),
      topics: r.topics,
      data: r.data,
      rawLog: r.rpc_log,
    };
    const decoded = classify(log);
    if (!decoded) {
      ignored++;
      continue;
    }
    assert.equal(decoded.status, 'decoded');
    if (decoded.status !== 'decoded') throw new Error('decode failed');
    events.push({
      id: String(i + 1),
      role,
      address: log.contract.address,
      block: r.block_number,
      blockHash: r.block_hash,
      timestamp: data.headers.find((h: { block_number: string }) => h.block_number === r.block_number).block_timestamp,
      tx: r.transaction_hash,
      txIndex: r.transaction_index,
      logIndex: r.log_index,
      name: decoded.eventName,
      payload: decoded.payload,
    });
  }
  assert.equal(ignored, 16);
  assert.equal(events.length, 14);
  const m = buildModel(
    events,
    manifest.contracts.Treasury.address.toLowerCase(),
    manifest.contracts.Governor.address.toLowerCase(),
  );
  assert.equal(m.balance, 9000n * 10n ** 18n);
  assert.equal(m.totalOut, 1000n * 10n ** 18n);
  assert.equal(m.votes.length, 2);
  assert.equal(m.operations[0]!.id, '0xfa24ed8ec99ae3f79805209615f15e6e30398d317f7d73dc1f2bb6e37885e482');
});
