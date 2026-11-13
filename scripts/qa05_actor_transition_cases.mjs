import assert from 'node:assert/strict';
import { id, ZeroAddress, ZeroHash } from 'ethers';

const ACTORS = ['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider', 'recipient2'];
const CANCEL_ACTORS = ['A', 'outsider', 'deployer'];
const CANCEL = 'cancel(address[],uint256[],bytes[],bytes32)';
const bitmap = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const equalAddress = (a, b) => a.toLowerCase() === b.toLowerCase();
const saltFor = (ctx, hash) => bitmap(BigInt(`${ctx.address.Governor}${'0'.repeat(24)}`) ^ BigInt(hash));
const stateNames = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];

async function policy(ctx, actor) {
  const roles = [
    ['Treasury', ZeroHash, ctx.address.Timelock],
    ['Treasury', id('SPENDER_ROLE'), ctx.address.Timelock],
    ['Timelock', ZeroHash, ctx.address.Timelock],
    ...['PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'].map(role => ['Timelock', id(role), ctx.address.Governor]),
  ];
  const result = [];
  for (const [contract, role, holder] of roles) {
    const values = await Promise.all([holder, actor, ZeroAddress].map(account => ctx.one(contract, 'hasRole', [role, account])));
    assert.deepEqual(values, [true, false, false], `${contract}/${role}: final-role holder, EOA and zero/open-role policy`);
    result.push({ contract, role, holder, values });
  }
  const config = await Promise.all([
    ctx.one('Timelock', 'getMinDelay'), ctx.one('Governor', 'votingDelay'),
    ctx.one('Governor', 'votingPeriod'), ctx.one('Governor', 'proposalThreshold'),
    ctx.one('Governor', 'quorumNumerator()'),
  ]);
  assert.deepEqual(config, [120n, 60n, 300n, 50n * ctx.U, 20n]);
  return { roles: result, config };
}

async function unchanged(ctx, p, options) {
  const before = await ctx.invariants(p);
  const beforePolicy = await policy(ctx, options.from);
  const receipt = await ctx.tx(options);
  const after = await ctx.invariants(p);
  assert.deepEqual(after, before, `${options.label}: no balance/paid/state/tally/voter/ETA/operation mutation`);
  assert.deepEqual(await policy(ctx, options.from), beforePolicy, `${options.label}: no role/config mutation`);
  ctx.row.checks.push({ name: options.label, before, after, policy: beforePolicy, receipt: receipt.transactionHash });
  return receipt;
}

async function checkpoint(ctx, p, label, state, { payouts = state === 'Executed' ? 1 : 0, operation, ...ui } = {}) {
  assert.equal(await ctx.one('Governor', 'state', [p.id]), BigInt(stateNames.indexOf(state)));
  await ctx.checkpoint({ label, proposals: [p], expectedStates: [state],
    expectedTreasury: BigInt(payouts ? 9000 : 10000) * ctx.U, expectedPayouts: payouts,
    ui: { account: ctx.row.actor ?? ctx.accounts.A, cancelEnabled: state === 'Pending' && equalAddress(ctx.row.actor ?? ctx.accounts.A, ctx.accounts.A),
      proposalId: String(p.id), creator: ctx.accounts.A, description: p.description,
      expectedState: state, ...(operation ? { expectedOperation: operation } : {}), ...ui } });
}

async function queueBy(ctx, p, from = ctx.accounts.caller) {
  await ctx.tx({ label: 'Unprivileged EOA queues through Governor', from, method: 'queue', args: p.action, at: p.deadline + 1n });
  p.eta = await ctx.one('Governor', 'proposalEta', [p.id]);
  assert.equal(p.eta, p.deadline + 121n);
  p.operationId = await ctx.one('Timelock', 'hashOperationBatch', [...p.action.slice(0, 3), ZeroHash, saltFor(ctx, p.action[3])]);
  assert.equal(await ctx.one('Timelock', 'getTimestamp', [p.operationId]), p.eta);
  assert.equal(await ctx.one('Timelock', 'isOperationPending', [p.operationId]), true);
}

function events(ctx, receipt, contract, name) {
  return receipt.logs.filter(log => equalAddress(log.address, ctx.address[contract]))
    .map(log => ctx.abi[contract].parseLog(log)).filter(event => event?.name === name);
}

async function executeControl(ctx, p, from = ctx.accounts.outsider, at = p.eta) {
  const receipt = await ctx.tx({ label: 'Same-proposal funded Governor execution control', from, method: 'execute', args: p.action, at });
  assert.equal(await ctx.one('Governor', 'state', [p.id]), 7n);
  assert.equal(await ctx.one('Treasury', 'paidRequests', [p.requestId]), true);
  assert.equal(await ctx.one('Timelock', 'isOperationDone', [p.operationId]), true);
  assert.equal(await ctx.one('Timelock', 'getTimestamp', [p.operationId]), 1n);
  assert.equal(await ctx.one('BUD', 'balanceOf', [ctx.address.Treasury]), 9000n * ctx.U);
  assert.equal(await ctx.one('BUD', 'balanceOf', [ctx.accounts.recipient]), 1000n * ctx.U);
  const transfers = events(ctx, receipt, 'BUD', 'Transfer');
  const payments = events(ctx, receipt, 'Treasury', 'BudgetDisbursed');
  assert.equal(transfers.length, 1);
  assert.equal(payments.length, 1);
  assert.deepEqual(Array.from(transfers[0].args).map(String).map(s => s.toLowerCase()),
    [ctx.address.Treasury, ctx.accounts.recipient, String(1000n * ctx.U)].map(s => s.toLowerCase()));
  assert.deepEqual(Array.from(payments[0].args).map(String).map(s => s.toLowerCase()),
    [p.requestId, ctx.accounts.recipient, String(1000n * ctx.U)].map(s => s.toLowerCase()));
  assert.equal(events(ctx, receipt, 'Timelock', 'CallExecuted').length, 1);
  assert.equal(events(ctx, receipt, 'Governor', 'ProposalExecuted').length, 1);
  return receipt;
}

async function cancelControl(ctx, p, at) {
  const before = await ctx.invariants(p);
  const receipt = await ctx.tx({ label: 'Same-proposal creator cancels while Pending', from: ctx.accounts.A, method: CANCEL, args: p.action, at });
  const canceled = events(ctx, receipt, 'Governor', 'ProposalCanceled');
  assert.equal(canceled.length, 1);
  assert.equal(canceled[0].args[0], p.id);
  assert.equal(await ctx.one('Governor', 'proposalProposer', [p.id]).then(a => a.toLowerCase()), ctx.accounts.A.toLowerCase());
  const after = await ctx.invariants(p);
  assert.equal(after.state, '2');
  assert.deepEqual({ ...after, state: before.state }, before, 'Cancellation only changes proposal state; original payload/history remains');
  ctx.row.checks.push({ name: 'Canceled is not Failed/Defeated; ProposalCanceled carries ID, creator comes from ProposalCreated/proposalProposer', proposalId: p.id,
    creator: ctx.accounts.A, description: p.description, cancellationTransaction: receipt.transactionHash, before, after });
  await checkpoint(ctx, p, 'Canceled original description and creator history', 'Canceled', { historyState: 'Canceled', notHistoryState: 'Failed', cancelEnabled: false });
}

export async function runCases(harness) {
  const labels = [];
  const run = async (label, body) => {
    labels.push(label);
    await harness.case(label, async ctx => {
      const actor = label.split('/')[1];
      ctx.row.actor = ACTORS.includes(actor) ? ctx.accounts[actor] : label.startsWith('TC07/') ? ctx.accounts.outsider : ctx.accounts.A;
      await body(ctx);
    });
  };

  // Every EOA, method and delay has a separate empty-chain F0. Delay zero is an
  // explicit role-first row: its valid payment payload does not waive minDelay.
  for (const actor of ACTORS) for (const method of ['schedule', 'scheduleBatch']) for (const delay of [0n, 120n]) {
    await run(`TC06/${actor}/${method}/delay${delay}`, async ctx => {
      const p = await ctx.propose();
      const salt = id(`unauthorized:${ctx.label}`);
      const operationArgs = method === 'schedule' ? [p.action[0][0], p.action[1][0], p.action[2][0], ZeroHash, salt]
        : [...p.action.slice(0, 3), ZeroHash, salt];
      const hashMethod = method === 'schedule' ? 'hashOperation' : 'hashOperationBatch';
      const operationId = await ctx.one('Timelock', hashMethod, operationArgs);
      assert.equal(await ctx.one('Timelock', 'getTimestamp', [operationId]), 0n);
      await unchanged(ctx, p, { label: 'Unauthorized valid-payment scheduling', contract: 'Timelock', from: ctx.accounts[actor], method,
        args: [...operationArgs, delay], expectError: { name: 'AccessControlUnauthorizedAccount', args: [ctx.accounts[actor], id('PROPOSER_ROLE')] } });
      assert.equal(await ctx.one('Timelock', 'getTimestamp', [operationId]), 0n);
      ctx.row.checks.push({ name: 'Attempted operation remains Unset', operationId, delay,
        authorizedDelayOutcome: delay === 0n ? 'TimelockInsufficientDelay(0,120); this row proves role-first denial, not delay validity' : 'Delay meets minDelay' });
      await checkpoint(ctx, p, 'Schedule denied without operation or payout', 'Pending');
      await ctx.pass(p); await queueBy(ctx, p, ctx.accounts[actor]);
      await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'Same actor succeeds by Governor route', 'Executed', { operation: 'Done' });
    });
  }

  for (const actor of ACTORS) for (const method of ['execute', 'executeBatch']) {
    await run(`TC06/${actor}/${method}/${method === 'executeBatch' ? 'Ready' : 'role-first-single-Unset'}`, async ctx => {
      const p = await ctx.propose(); await ctx.pass(p); await queueBy(ctx, p, ctx.accounts[actor]);
      await ctx.at(p.eta);
      assert.equal(await ctx.one('Timelock', 'isOperationReady', [p.operationId]), true);
      const salt = saltFor(ctx, p.action[3]);
      const args = method === 'execute' ? [p.action[0][0], p.action[1][0], p.action[2][0], ZeroHash, salt]
        : [...p.action.slice(0, 3), ZeroHash, salt];
      if (method === 'execute') {
        const singleId = await ctx.one('Timelock', 'hashOperation', args);
        assert.notEqual(singleId, p.operationId);
        assert.equal(await ctx.one('Timelock', 'getTimestamp', [singleId]), 0n);
        ctx.row.checks.push({ name: 'Genuine Ready(single) precondition', status: 'BLOCKED', scope: 'Ready(single) authorization proof only; role-first receipt below is reachable',
          singleId, singleTimestamp: '0', batchId: p.operationId, batchTimestamp: String(p.eta),
          reason: 'GovernorTimelockControl._queueOperations calls scheduleBatch only; final PROPOSER_ROLE is Governor only. No EOA or zero/open proposer. No impersonation, role grant or storage injection permitted.',
          sources: ['lib/openzeppelin-contracts/contracts/governance/extensions/GovernorTimelockControl.sol:_queueOperations', 'lib/openzeppelin-contracts/contracts/governance/TimelockController.sol:hashOperation/hashOperationBatch'],
          authorizedOpenExecutor: 'EXECUTOR_ROLE(0) is false in final graph. Were it open, execute(single) would reach TimelockUnexpectedOperationState(singleId,Ready bitmap 0x04), not execute the distinct Ready batch. Not exercised or claimed as Ready(single) proof.' });
      }
      await checkpoint(ctx, p, 'Actual Governor operation is Queued and Ready', 'Queued', { operation: 'Ready' });
      await unchanged(ctx, p, { label: 'Direct Timelock execution lacks executor role', contract: 'Timelock', from: ctx.accounts[actor], method, args, at: p.eta,
        expectError: { name: 'AccessControlUnauthorizedAccount', args: [ctx.accounts[actor], id('EXECUTOR_ROLE')] } });
      await checkpoint(ctx, p, 'Denied direct execution preserves Ready operation', 'Queued', { operation: 'Ready' });
      await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'Same operation paid once through Governor', 'Executed', { operation: 'Done' });
    });
  }

  for (const actor of ACTORS) {
    await run(`TC06/${actor}/Treasury-disburse`, async ctx => {
      const p = await ctx.propose();
      await unchanged(ctx, p, { label: 'Direct valid Treasury payment denied', contract: 'Treasury', from: ctx.accounts[actor], method: 'disburse',
        args: [p.requestId, ctx.accounts.recipient, 1000n * ctx.U], expectError: { name: 'AccessControlUnauthorizedAccount', args: [ctx.accounts[actor], id('SPENDER_ROLE')] } });
      await checkpoint(ctx, p, 'Direct Treasury denial preserves unpaid request', 'Pending');
      await ctx.pass(p); await queueBy(ctx, p, ctx.accounts[actor]); await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'Funded valid-payment Governor control', 'Executed', { operation: 'Done' });
    });
    await run(`TC06/${actor}/Timelock-cancel-Waiting`, async ctx => {
      const p = await ctx.propose(); await ctx.pass(p); await queueBy(ctx, p);
      assert.equal(await ctx.one('Timelock', 'isOperationPending', [p.operationId]), true);
      assert.equal(await ctx.one('Timelock', 'isOperationReady', [p.operationId]), false);
      await unchanged(ctx, p, { label: 'Valid Waiting operation cannot be canceled directly', contract: 'Timelock', from: ctx.accounts[actor], method: 'cancel', args: [p.operationId],
        expectError: { name: 'AccessControlUnauthorizedAccount', args: [ctx.accounts[actor], id('CANCELLER_ROLE')] } });
      await checkpoint(ctx, p, 'Pending operation intact after unauthorized cancel', 'Queued', { operation: 'Waiting' });
      await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'Uncanceled same operation executes via Governor', 'Executed', { operation: 'Done' });
    });
  }

  for (const actor of ['outsider', 'deployer']) {
    const grants = [
      ['Treasury', ZeroHash, actor], ['Treasury', id('SPENDER_ROLE'), actor],
      ...[ZeroHash, id('PROPOSER_ROLE'), id('EXECUTOR_ROLE'), id('CANCELLER_ROLE')].map(role => ['Timelock', role, actor]),
      ['Timelock', id('EXECUTOR_ROLE'), 'zero'],
    ];
    for (const [contract, role, target] of grants) await run(`TC14/${actor}/${contract}/grant-${role}-${target}`, async ctx => {
      const p = await ctx.propose();
      await unchanged(ctx, p, { label: 'Former authority cannot regain/grant/open role', contract, from: ctx.accounts[actor], method: 'grantRole',
        args: [role, target === 'zero' ? ZeroAddress : ctx.accounts[target]], expectError: { name: 'AccessControlUnauthorizedAccount', args: [ctx.accounts[actor], ZeroHash] } });
      await checkpoint(ctx, p, 'Final roles remain closed after denied grant', 'Pending');
      await ctx.pass(p); await queueBy(ctx, p); await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'No extra role needed for Governor route', 'Executed');
    });
    const parameters = [
      ['Timelock', 'updateDelay', [0n], 'TimelockUnauthorizedCaller'],
      ['Governor', 'setVotingDelay', [0n], 'GovernorOnlyExecutor'],
      ['Governor', 'setVotingPeriod', [1n], 'GovernorOnlyExecutor'],
      ['Governor', 'setProposalThreshold', [0n], 'GovernorOnlyExecutor'],
      ['Governor', 'updateQuorumNumerator', [0n], 'GovernorOnlyExecutor'],
    ];
    for (const [contract, method, args, error] of parameters) await run(`TC14/${actor}/${method}`, async ctx => {
      const p = await ctx.propose();
      await unchanged(ctx, p, { label: 'Unprivileged actor cannot alter governance configuration', contract, from: ctx.accounts[actor], method, args,
        expectError: { name: error, args: [ctx.accounts[actor]] } });
      await checkpoint(ctx, p, 'Configuration unchanged after denied mutation', 'Pending');
      await ctx.pass(p); await queueBy(ctx, p); await executeControl(ctx, p, ctx.accounts[actor]);
      await checkpoint(ctx, p, 'Unchanged governance remains usable', 'Executed');
    });
  }

  for (const method of ['queue', 'execute']) for (const variant of ['trailing-space', 'pretty-json', 'reordered-json']) {
    await run(`TC07/wrong-description/${method}/${variant}`, async ctx => {
      const p = await ctx.propose(); await ctx.pass(p);
      const parsed = JSON.parse(p.description);
      const wrongDescription = variant === 'trailing-space' ? `${p.description} ` : variant === 'pretty-json' ? JSON.stringify(parsed, null, 2)
        : JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()));
      assert.notEqual(wrongDescription, p.description);
      const wrongAction = [...p.action.slice(0, 3), id(wrongDescription)];
      const wrongId = await ctx.one('Governor', 'hashProposal', wrongAction);
      assert.notEqual(wrongId, p.id);
      if (method === 'execute') { await queueBy(ctx, p); await ctx.at(p.eta); }
      else await ctx.at(p.deadline + 1n);
      const wrongOperationId = await ctx.one('Timelock', 'hashOperationBatch', [...wrongAction.slice(0, 3), ZeroHash, saltFor(ctx, wrongAction[3])]);
      assert.equal(await ctx.one('Timelock', 'getTimestamp', [wrongOperationId]), 0n);
      await unchanged(ctx, p, { label: 'Changed description bytes cannot address original proposal', from: ctx.accounts.outsider, method, args: wrongAction,
        expectError: { name: 'GovernorNonexistentProposal', args: [wrongId] } });
      assert.equal(await ctx.one('Timelock', 'getTimestamp', [wrongOperationId]), 0n);
      ctx.row.checks.push({ name: 'Description hash binding', variant, originalDescription: p.description, wrongDescription, originalId: p.id, wrongId, wrongOperationId });
      await checkpoint(ctx, p, 'Original bytes remain retryable after tampering', method === 'queue' ? 'Succeeded' : 'Queued',
        method === 'execute' ? { operation: 'Ready' } : {});
      if (method === 'queue') await queueBy(ctx, p);
      await executeControl(ctx, p);
      await checkpoint(ctx, p, 'Original description successfully executes same proposal', 'Executed', { operation: 'Done' });
    });
  }

  await run('TC07/exact-ETA-minus1-ETA-replay', async ctx => {
    const p = await ctx.propose(); await ctx.pass(p); await queueBy(ctx, p);
    await checkpoint(ctx, p, 'q equals D+1, E equals q+120', 'Queued', { operation: 'Waiting' });
    await ctx.at(p.eta - 1n);
    await unchanged(ctx, p, { label: 'Exact E-1 Governor execute denies Waiting operation', from: ctx.accounts.outsider, method: 'execute', args: p.action, at: p.eta - 1n,
      expectError: { name: 'TimelockUnexpectedOperationState', args: [p.operationId, bitmap(4)] } });
    assert.equal(await ctx.one('Timelock', 'isOperationReady', [p.operationId]), false);
    await checkpoint(ctx, p, 'E-1 denial is Queued/Waiting/unpaid', 'Queued', { operation: 'Waiting' });
    await ctx.at(p.eta);
    await checkpoint(ctx, p, 'Exact E Ready is operation status, not proposal state', 'Queued', { operation: 'Ready' });
    await executeControl(ctx, p, ctx.accounts.outsider, p.eta);
    await checkpoint(ctx, p, 'Exact E payment commits once', 'Executed', { operation: 'Done' });
    await ctx.at(p.eta + 1n);
    await unchanged(ctx, p, { label: 'E+1 replay denies already Executed proposal', from: ctx.accounts.outsider, method: 'execute', args: p.action, at: p.eta + 1n,
      expectError: { name: 'GovernorUnexpectedProposalState', args: [p.id, 7n, bitmap(48)] } });
    await checkpoint(ctx, p, 'Replay leaves one payout and Done operation', 'Executed', { operation: 'Done' });
  });

  const boundaries = ['Pending-created', 'S-minus1', 'S', 'S-plus1', 'deadline', 'Succeeded', 'Queued-Waiting', 'ETA-minus1', 'Ready', 'Defeated', 'Executed', 'Canceled'];
  for (const actor of CANCEL_ACTORS) for (const boundary of boundaries) {
    await run(`TC14/${actor}/cancel/${boundary}`, async ctx => {
      const cancelEntrypoints = ctx.abi.Governor.fragments.filter(f => f.type === 'function' && f.name === 'cancel').map(f => f.format('sighash')).sort();
      assert.deepEqual(cancelEntrypoints, [CANCEL], 'Cover every actual public cancel overload; ABI changes must add vectors');
      ctx.row.checks.push({ name: 'Actual cancel ABI entrypoint coverage', cancelEntrypoints });
      const p = await ctx.propose();
      let expected = 'Pending';
      let at;
      if (boundary === 'S-minus1') at = p.snapshot - 1n;
      if (boundary === 'S') at = p.snapshot;
      if (boundary === 'S-plus1') { at = p.snapshot + 1n; expected = 'Active'; }
      if (!['Pending-created', 'S-minus1', 'S', 'S-plus1', 'Defeated', 'Canceled'].includes(boundary)) {
        await ctx.pass(p); expected = 'Active';
        if (boundary === 'deadline') at = p.deadline;
        else { at = p.deadline + 1n; expected = 'Succeeded'; }
        if (['Queued-Waiting', 'ETA-minus1', 'Ready', 'Executed'].includes(boundary)) {
          await queueBy(ctx, p); expected = 'Queued'; at = p.deadline + 1n;
          if (boundary === 'ETA-minus1') at = p.eta - 1n;
          if (boundary === 'Ready') at = p.eta;
          if (boundary === 'Executed') { await executeControl(ctx, p); expected = 'Executed'; at = p.eta + 1n; }
        }
      }
      if (boundary === 'Defeated') {
        await ctx.tx({ label: 'Funded creator votes Against to establish genuine Defeated state', from: ctx.accounts.A, method: 'castVote', args: [p.id, 0], at: p.snapshot + 1n });
        expected = 'Defeated'; at = p.deadline + 1n;
      }
      if (boundary === 'Canceled') { await cancelControl(ctx, p, p.snapshot); expected = 'Canceled'; at = p.snapshot + 1n; }
      if (at !== undefined) await ctx.at(at);
      const operation = expected === 'Queued' ? (boundary === 'Ready' ? 'Ready' : 'Waiting') : expected === 'Executed' ? 'Done' : undefined;
      await checkpoint(ctx, p, `Before ${actor} cancellation at ${boundary}`, expected, { operation, cancelEnabled: actor === 'A' && expected === 'Pending', account: ctx.accounts[actor] });
      if (actor === 'A' && expected === 'Pending') { await cancelControl(ctx, p, at); return; }
      await unchanged(ctx, p, { label: `${actor} cannot cancel ${boundary}`, from: ctx.accounts[actor], method: CANCEL, args: p.action, ...(at !== undefined ? { at } : {}),
        expectError: { name: 'GovernorUnableToCancel', args: [p.id, ctx.accounts[actor]] } });
      await checkpoint(ctx, p, 'Cancellation denial preserves original state/history', expected, { operation, account: ctx.accounts[actor], cancelEnabled: false });
      if (expected === 'Pending') { await cancelControl(ctx, p, at); return; }
      if (['Canceled', 'Executed', 'Defeated'].includes(expected)) return;
      if (boundary === 'S-plus1') await ctx.pass(p);
      if (expected !== 'Queued') await queueBy(ctx, p);
      await executeControl(ctx, p);
      await checkpoint(ctx, p, 'Same proposal executes after denied late cancellation', 'Executed', { operation: 'Done' });
    });
  }

  for (const method of ['castVote', 'queue', 'execute']) await run(`TC14/canceled-history/${method}`, async ctx => {
    const p = await ctx.propose(); await cancelControl(ctx, p, p.snapshot);
    const at = method === 'castVote' ? p.snapshot + 1n : p.deadline + (method === 'execute' ? 121n : 1n);
    await ctx.at(at);
    await unchanged(ctx, p, { label: `Canceled proposal rejects ${method} without history loss`, from: method === 'castVote' ? ctx.accounts.A : ctx.accounts.outsider,
      method, args: method === 'castVote' ? [p.id, 1] : p.action, at,
      expectError: { name: 'GovernorUnexpectedProposalState', args: [p.id, 2n, bitmap(method === 'castVote' ? 2 : method === 'queue' ? 16 : 48)] } });
    await checkpoint(ctx, p, `Canceled remains Canceled after denied ${method}`, 'Canceled', { historyState: 'Canceled', notHistoryState: 'Failed', cancelEnabled: false });
  });

  return { labels, count: labels.length,
    familyCounts: Object.fromEntries(['TC06', 'TC07', 'TC14'].map(family => [family, labels.filter(label => label.startsWith(`${family}/`)).length])),
    preconditionMismatches: [{ label: 'TC06/*/execute/Ready(single)', count: ACTORS.length,
      status: 'BLOCKED', reason: 'No production-reachable Ready single operation: only Governor is proposer and Governor schedules batches exclusively. Separate role-first single-Unset receipts are not substitutes for that proof.' }] };
}
