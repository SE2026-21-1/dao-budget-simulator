import assert from 'node:assert/strict';
import { id, ZeroAddress, ZeroHash } from 'ethers';

const DESCRIPTION = '{"version":1,"title":"Chi ngan sach DAO","body":"Khoan chi mo phong cho nghiem thu TV4."}';
const T0 = 1800000000n;

async function funded(ctx) {
  const { U, accounts: a, address: c } = ctx;
  const bud = await Promise.all([c.Treasury, a.recipient, a.funding, a.recipient2].map(x => ctx.one('BUD', 'balanceOf', [x])));
  assert.deepEqual(bud, [10000n * U, 0n, 10000n * U, 0n]);
  const otherBalances = await Promise.all(Object.entries(a).filter(([name]) => name !== 'funding').map(async ([name, who]) => [name, await ctx.one('BUD', 'balanceOf', [who])]));
  for (const [name, value] of otherBalances) assert.equal(value, 0n, `${name} has no BUD payout`);
  return bud;
}

async function checkpoint(ctx, label, proposals, states) {
  await funded(ctx);
  for (const p of proposals) assert.equal(await ctx.one('Treasury', 'paidRequests', [p.requestId]), false);
  const account = ctx.row.uiAccount ?? ctx.accounts.A;
  const creator = proposals.length ? await ctx.one('Governor', 'proposalProposer', [proposals[0].id]) : null;
  const cancelEnabled = states.length === 1 && states[0] === 'Pending' && creator.toLowerCase() === account.toLowerCase();
  await ctx.checkpoint({ label, proposals, expectedStates: states, expectedTreasury: 10000n * ctx.U, expectedPayouts: 0, ui: { account, cancelEnabled } });
}

async function governanceConfiguration(ctx) {
  const holders = Object.values(ctx.accounts);
  const roles = [ZeroHash, id('PROPOSER_ROLE'), id('EXECUTOR_ROLE'), id('CANCELLER_ROLE')];
  return {
    roles: await Promise.all(roles.flatMap(role => [ZeroAddress, ...Object.values(ctx.address), ...holders].map(who => ctx.one('Timelock', 'hasRole', [role, who])))),
    treasuryRoles: await Promise.all([ZeroHash, id('SPENDER_ROLE')].flatMap(role => [ZeroAddress, ...Object.values(ctx.address), ...holders].map(who => ctx.one('Treasury', 'hasRole', [role, who])))),
    settings: await Promise.all(['votingDelay', 'votingPeriod', 'proposalThreshold'].map(method => ctx.one('Governor', method))),
    delay: await ctx.one('Timelock', 'getMinDelay'),
    treasury: await ctx.one('Governor', 'treasury'),
    funds: await funded(ctx),
  };
}

async function vote(ctx, p, who, weight, at) {
  const before = Array.from(await ctx.call('Governor', 'proposalVotes', [p.id]));
  const receipt = await ctx.tx({ label: `${who} For snapshot ${weight}`, from: ctx.accounts[who], method: 'castVote', args: [p.id, 1], at });
  const events = receipt.logs.filter(log => log.address.toLowerCase() === ctx.address.Governor.toLowerCase()).map(log => ctx.abi.Governor.parseLog(log)).filter(log => log?.name === 'VoteCast');
  assert.equal(events.length, 1);
  assert.equal(events[0].args.voter.toLowerCase(), ctx.accounts[who].toLowerCase());
  assert.equal(events[0].args.proposalId, p.id);
  assert.equal(events[0].args.weight, weight);
  assert.deepEqual(Array.from(await ctx.call('Governor', 'proposalVotes', [p.id])), [before[0], before[1] + weight, before[2]]);
  assert.equal(await ctx.one('Governor', 'hasVoted', [p.id, ctx.accounts[who]]), true);
}

async function snapshotCase(ctx, kind) {
  const { U, accounts: a } = ctx;
  ctx.row.uiAccount = kind === 'late-D0' ? a.D : a.caller;
  const p = await ctx.propose();
  assert.equal(p.snapshot, T0 + 60n);
  assert.equal(p.deadline, T0 + 360n);
  await checkpoint(ctx, 'Pending before snapshot', [p], ['Pending']);
  await ctx.at(p.snapshot);
  await assert.rejects(() => ctx.one('GOV', 'getPastVotes', [a.caller, p.snapshot]));
  await assert.rejects(() => ctx.one('GOV', 'getPastVotes', [a.caller, p.snapshot + 1n]));
  await ctx.at(p.snapshot + 1n);
  const names = ['A', 'B', 'C', 'D', 'caller'];
  const weights = [400n, 300n, 200n, kind === 'late-D0' ? 0n : 100n, 0n].map(x => x * U);
  const past = async () => Promise.all(names.map(name => ctx.one('GOV', 'getPastVotes', [a[name], p.snapshot])));
  assert.deepEqual(await past(), weights);
  assert.equal(await ctx.one('GOV', 'getPastTotalSupply', [p.snapshot]), 1000n * U);
  await vote(ctx, p, 'A', 400n * U, p.snapshot + 1n);
  const tx = (label, from, method, args) => ctx.tx({ label, contract: 'GOV', from, method, args, at: p.snapshot + 2n });
  if (kind === 'direct-transfer' || kind === 'combined-transfer-redelegate') {
    await tx('A transfers all GOV after snapshot', a.A, 'transfer', [a.caller, 400n * U]);
    await tx('New holder self delegates after snapshot', a.caller, 'delegate', [a.caller]);
  }
  if (kind === 'approved-transferFrom') {
    await tx('A approves exact400 after snapshot', a.A, 'approve', [a.outsider, 400n * U]);
    await tx('Approved spender transfers all400 after snapshot', a.outsider, 'transferFrom', [a.A, a.caller, 400n * U]);
    assert.equal(await ctx.one('GOV', 'allowance', [a.A, a.outsider]), 0n);
    await tx('New holder delegates transferred GOV', a.caller, 'delegate', [a.caller]);
    const balances = await Promise.all([a.A, a.caller].map(x => ctx.one('GOV', 'balanceOf', [x])));
    await ctx.tx({ label: 'Spent allowance rejects a second transfer', contract: 'GOV', from: a.outsider, method: 'transferFrom', args: [a.A, a.caller, 1n], at: p.snapshot + 2n, expectError: { name: 'ERC20InsufficientAllowance', args: [a.outsider, 0n, 1n] } });
    assert.deepEqual(await Promise.all([a.A, a.caller].map(x => ctx.one('GOV', 'balanceOf', [x]))), balances);
  }
  if (kind === 'redelegate' || kind === 'combined-transfer-redelegate') await tx('B redelegates all300 after snapshot', a.B, 'delegate', [a.caller]);
  if (kind === 'undelegate') await tx('B undelegates all300 after snapshot', a.B, 'delegate', [ZeroAddress]);
  if (kind === 'late-D0') await tx('D delegates100 only after snapshot', a.D, 'delegate', [a.D]);
  const currentExpected = {
    'direct-transfer': [0n, 300n, 200n, 100n, 400n],
    'approved-transferFrom': [0n, 300n, 200n, 100n, 400n],
    redelegate: [400n, 0n, 200n, 100n, 300n],
    undelegate: [400n, 0n, 200n, 100n, 0n],
    'late-D0': [400n, 300n, 200n, 100n, 0n],
    'combined-transfer-redelegate': [0n, 0n, 200n, 100n, 700n],
  }[kind].map(x => x * U);
  assert.deepEqual(await past(), weights, 'Every voter retains independently pinned snapshot weight');
  const current = await Promise.all(names.map(name => ctx.one('GOV', 'getVotes', [a[name]])));
  assert.deepEqual(current, currentExpected);
  const govBalances = await Promise.all(names.map(name => ctx.one('GOV', 'balanceOf', [a[name]])));
  const moved = ['direct-transfer', 'approved-transferFrom', 'combined-transfer-redelegate'].includes(kind);
  assert.deepEqual(govBalances, (moved ? [0n, 300n, 200n, 100n, 400n] : [400n, 300n, 200n, 100n, 0n]).map(x => x * U));
  for (const [index, name] of names.entries()) if (name !== 'A') await vote(ctx, p, name, weights[index], p.snapshot + 3n);
  const tally = Array.from(await ctx.call('Governor', 'proposalVotes', [p.id]));
  assert.deepEqual(tally, [0n, (kind === 'late-D0' ? 900n : 1000n) * U, 0n]);
  assert.ok(tally.reduce((sum, x) => sum + x, 0n) <= 1000n * U);
  const before = await ctx.invariants(p);
  await ctx.tx({ label: 'A cannot double-count its original400', from: a.A, method: 'castVote', args: [p.id, 1], at: p.snapshot + 4n, expectError: { name: 'GovernorAlreadyCastVote', args: [a.A] } });
  assert.deepEqual(await ctx.invariants(p), before);
  ctx.row.checks.push({ name: 'Independent snapshot/current oracle and GOV balances', voters: names, snapshot: p.snapshot, past: weights, current, govBalances, totalSupply: 1000n * U, tally });
  await checkpoint(ctx, 'Active immutable snapshot after movement and rejected double vote', [p], ['Active']);
  await ctx.at(p.deadline + 1n);
  await checkpoint(ctx, 'Succeeded without payout or duplicated voting power', [p], ['Succeeded']);
}

function payloadVectors(ctx, requestId) {
  const { accounts: a, address: c, abi, U } = ctx;
  const data = abi.Treasury.encodeFunctionData('disburse', [requestId, a.recipient, 1000n * U]);
  const good = [[c.Treasury], [0n], [data]];
  const error = (name, args = []) => ({ name, args });
  const count = (targets, values, calldatas) => ({ action: [targets, values, calldatas], error: error('InvalidActionCount', [BigInt(targets.length), BigInt(values.length), BigInt(calldatas.length)]) });
  const vector = (action, name, args) => ({ action, error: error(name, args) });
  return {
    'zero-actions': count([], [], []),
    'two-actions': count([c.Treasury, c.Treasury], [0n, 0n], [data, data]),
    'missing-values': count([c.Treasury], [], [data]),
    'missing-calldata': count([c.Treasury], [0n], []),
    'missing-targets': count([], [0n], [data]),
    'extra-values': count([c.Treasury], [0n, 0n], [data]),
    'extra-calldata': count([c.Treasury], [0n], [data, data]),
    'target-BUD': vector([[c.BUD], [0n], [data]], 'InvalidTarget', [c.BUD]),
    'target-EOA': vector([[a.outsider], [0n], [data]], 'InvalidTarget', [a.outsider]),
    'target-Timelock': vector([[c.Timelock], [0n], [data]], 'InvalidTarget', [c.Timelock]),
    'selector-transfer': vector([[c.Treasury], [0n], [abi.BUD.encodeFunctionData('transfer', [a.recipient, U])]], 'InvalidCalldata'),
    'selector-grantRole': vector([[c.Treasury], [0n], [abi.Timelock.encodeFunctionData('grantRole', [id('PROPOSER_ROLE'), a.outsider])]], 'InvalidCalldata'),
    'selector-updateDelay': vector([[c.Treasury], [0n], [abi.Timelock.encodeFunctionData('updateDelay', [0n])]], 'InvalidCalldata'),
    'selector-setVotingDelay': vector([[c.Treasury], [0n], [abi.Governor.encodeFunctionData('setVotingDelay', [0n])]], 'InvalidCalldata'),
    'native-value-one': vector([[c.Treasury], [1n], [data]], 'InvalidNativeValue', [1n]),
    'empty-calldata': vector([[c.Treasury], [0n], ['0x']], 'InvalidCalldata'),
    'short-selector': vector([[c.Treasury], [0n], [data.slice(0, 8)]], 'InvalidCalldata'),
    'truncated-ABI': vector([[c.Treasury], [0n], [data.slice(0, -2)]], 'InvalidCalldata'),
    'trailing-ABI': vector([[c.Treasury], [0n], [data + '00']], 'InvalidCalldata'),
    'wrong-selector-canonical-length': vector([[c.Treasury], [0n], ['0xdeadbeef' + data.slice(10)]], 'InvalidCalldata'),
    'dirty-recipient-ABI': { action: [[c.Treasury], [0n], [data.slice(0, 74) + '01' + data.slice(76)]], error: { name: null, data: '0x' } },
    'recipient-zero': vector([[c.Treasury], [0n], [abi.Treasury.encodeFunctionData('disburse', [requestId, ZeroAddress, 1000n * U])]], 'InvalidRecipient', [ZeroAddress]),
    'recipient-Treasury': vector([[c.Treasury], [0n], [abi.Treasury.encodeFunctionData('disburse', [requestId, c.Treasury, 1000n * U])]], 'InvalidRecipient', [c.Treasury]),
    'amount-zero': vector([[c.Treasury], [0n], [abi.Treasury.encodeFunctionData('disburse', [requestId, a.recipient, 0n])]], 'InvalidAmount', [0n]),
    good,
  };
}

function uiForms(ctx) {
  const base = { title: 'Valid title', body: 'Valid body containing at least twenty code points.', recipient: ctx.accounts.recipient, amount: '1000' };
  const vectors = [];
  for (const n of [4, 5, 120, 121]) vectors.push({ label: `title-${n}`, input: { ...base, title: 't'.repeat(n) }, expected: { valid: n >= 5 && n <= 120, error: n >= 5 && n <= 120 ? null : 'Tiêu đề cần 5–120 ký tự.' } });
  for (const n of [19, 20, 2000, 2001]) vectors.push({ label: `body-${n}`, input: { ...base, body: 'b'.repeat(n) }, expected: { valid: n >= 20 && n <= 2000, error: n >= 20 && n <= 2000 ? null : 'Mô tả cần 20–2.000 ký tự.' } });
  for (const n of [4, 5, 120, 121]) vectors.push({ label: `astral-title-${n}-codepoints`, input: { ...base, title: '🗳'.repeat(n) }, expected: { valid: n >= 5 && n <= 120, error: n >= 5 && n <= 120 ? null : 'Tiêu đề cần 5–120 ký tự.' } });
  vectors.push({ label: 'Vietnamese-combining-preserve-bytes', input: { ...base, title: 'Đề xuất ngân sách 🗳', body: 'Nội dung e\u0301 và é giữ nguyên Unicode, không chuẩn hóa bytes.' }, expected: { valid: true, error: null, normalize: false } });
  return vectors.map(v => ({ ...v, expected: { ...v.expected, description: JSON.stringify({ version: 1, title: v.input.title, body: v.input.body }), codePointCounting: true, scope: 'Frontend form only; contract does not enforce title/body lengths' } }));
}

export async function runCases(harness) {
  for (const kind of ['direct-transfer', 'redelegate', 'undelegate', 'approved-transferFrom', 'late-D0', 'combined-transfer-redelegate']) {
    await harness.case(`TC05-${kind}`, ctx => snapshotCase(ctx, kind), kind === 'late-D0' ? { undelegated: ['D'] } : undefined);
  }
  const labels = ['zero-actions', 'two-actions', 'missing-values', 'missing-calldata', 'missing-targets', 'extra-values', 'extra-calldata', 'target-BUD', 'target-EOA', 'target-Timelock', 'selector-transfer', 'selector-grantRole', 'selector-updateDelay', 'selector-setVotingDelay', 'native-value-one', 'empty-calldata', 'short-selector', 'truncated-ABI', 'trailing-ABI', 'wrong-selector-canonical-length', 'dirty-recipient-ABI', 'recipient-zero', 'recipient-Treasury', 'amount-zero'];
  for (const label of labels) await harness.case(`TC08-${label}`, async ctx => {
    const requestId = id(`tv4:${ctx.label}`);
    const { action, error } = payloadVectors(ctx, requestId)[label];
    const attemptedId = await ctx.one('Governor', 'hashProposal', [...action, id(DESCRIPTION)]);
    const before = await governanceConfiguration(ctx);
    await ctx.tx({ label: `Independent malformed payload ${label}`, from: ctx.accounts.A, method: 'propose', args: [...action, DESCRIPTION], at: T0, expectError: error });
    const after = await governanceConfiguration(ctx);
    assert.deepEqual(after, before, 'Rejected payload cannot alter roles, configuration or funds');
    assert.equal(await ctx.one('Governor', 'proposalSnapshot', [attemptedId]), 0n);
    assert.equal(await ctx.one('Governor', 'proposalDeadline', [attemptedId]), 0n);
    assert.equal(await ctx.one('Treasury', 'paidRequests', [requestId]), false);
    ctx.row.checks.push({ name: 'Rejected original bytes; no proposal or state mutation', attemptedId, action, description: DESCRIPTION, requestId, expectedError: error, before, after });
    await checkpoint(ctx, 'Rejected payload has no indexed proposal or transfer', [], []);
    const p = await ctx.propose({ requestId, description: DESCRIPTION });
    await checkpoint(ctx, 'Same request positive canonical control Pending', [p], ['Pending']);
  });
  for (const amount of [49n, 50n]) await harness.case(`TC08-threshold-${amount}-past`, async ctx => {
    const { U, accounts: a } = ctx;
    await ctx.tx({ label: `Seed threshold${amount} before t0`, contract: 'GOV', from: a.A, method: 'transfer', args: [a.caller, amount * U], at: T0 - 2n });
    await ctx.tx({ label: 'Finalize delegated checkpoint at t0-2', contract: 'GOV', from: a.caller, method: 'delegate', args: [a.caller], at: T0 - 2n });
    await ctx.at(T0 - 1n);
    assert.equal(await ctx.one('GOV', 'getPastVotes', [a.caller, T0 - 2n]), amount * U);
    assert.equal(await ctx.one('GOV', 'getPastVotes', [a.A, T0 - 2n]), (400n - amount) * U);
    const requestId = id(`tv4:${ctx.label}`);
    if (amount === 49n) {
      const before = await governanceConfiguration(ctx);
      const action = payloadVectors(ctx, requestId).good;
      await ctx.tx({ label: 'Past49 strictly below threshold50', from: a.caller, method: 'propose', args: [...action, DESCRIPTION], at: T0, expectError: { name: 'GovernorInsufficientProposerVotes', args: [a.caller, 49n * U, 50n * U] } });
      assert.deepEqual(await governanceConfiguration(ctx), before);
      const attemptedId = await ctx.one('Governor', 'hashProposal', [...action, id(DESCRIPTION)]);
      assert.equal(await ctx.one('Governor', 'proposalSnapshot', [attemptedId]), 0n);
      assert.equal(await ctx.one('Treasury', 'paidRequests', [requestId]), false);
      await checkpoint(ctx, 'Past49 denial', [], []);
      const p = await ctx.propose({ requestId });
      await checkpoint(ctx, 'Otherwise valid A positive control', [p], ['Pending']);
    } else {
      ctx.row.uiAccount = a.caller;
      const p = await ctx.propose({ creator: a.caller, requestId });
      await checkpoint(ctx, 'Exact past50 creates Pending', [p], ['Pending']);
    }
    ctx.row.checks.push({ name: 'Final-past threshold checkpoint', timestamp: T0 - 2n, past: amount * U, threshold: 50n * U });
  });
  await harness.case('TC08-threshold-current-only-not-past', async ctx => {
    const { U, accounts: a } = ctx;
    ctx.row.uiAccount = a.caller;
    await ctx.tx({ label: 'Transfer50 at current t0', contract: 'GOV', from: a.A, method: 'transfer', args: [a.caller, 50n * U], at: T0 });
    await ctx.tx({ label: 'Delegate50 at same current t0', contract: 'GOV', from: a.caller, method: 'delegate', args: [a.caller], at: T0 });
    assert.equal(await ctx.one('GOV', 'getVotes', [a.caller]), 50n * U);
    assert.equal(await ctx.one('GOV', 'getPastVotes', [a.caller, T0 - 1n]), 0n);
    await assert.rejects(() => ctx.one('GOV', 'getPastVotes', [a.caller, T0]));
    await assert.rejects(() => ctx.one('GOV', 'getPastVotes', [a.caller, T0 + 1n]));
    const requestId = id(`tv4:${ctx.label}`), action = payloadVectors(ctx, requestId).good;
    const before = await governanceConfiguration(ctx);
    await ctx.tx({ label: 'Current50 is not eligible past50', from: a.caller, method: 'propose', args: [...action, DESCRIPTION], at: T0, expectError: { name: 'GovernorInsufficientProposerVotes', args: [a.caller, 0n, 50n * U] } });
    assert.deepEqual(await governanceConfiguration(ctx), before);
    const attemptedId = await ctx.one('Governor', 'hashProposal', [...action, id(DESCRIPTION)]);
    assert.equal(await ctx.one('Governor', 'proposalSnapshot', [attemptedId]), 0n);
    assert.equal(await ctx.one('Treasury', 'paidRequests', [requestId]), false);
    ctx.row.checks.push({ name: 'Current50 does not qualify until past', checkpoint: T0, current: 50n * U, pastAtT0MinusOne: 0n, threshold: 50n * U, attemptedId });
    await checkpoint(ctx, 'Same timestamp checkpoint excluded', [], []);
    await ctx.at(T0 + 1n);
    const p = await ctx.propose({ creator: a.caller, requestId, at: T0 + 1n });
    await checkpoint(ctx, 'Identical payload succeeds when checkpoint becomes past', [p], ['Pending']);
  });
  await harness.case('TC08-frontend-title-body-Unicode', async ctx => {
    ctx.row.uiForms = uiForms(ctx);
    await checkpoint(ctx, 'Frontend-only input vectors on pristine F0', [], []);
  });
  return { count: 34, labels: ['TC05 six snapshot vectors', 'TC08 twenty-four independent invalid payloads', 'TC08 past49/past50/current-only', 'TC08 thirteen frontend-only text vectors'] };
}
