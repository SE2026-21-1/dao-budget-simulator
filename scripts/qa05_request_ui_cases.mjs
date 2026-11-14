import assert from 'node:assert/strict';
import { id, ZeroHash } from 'ethers';

export async function runCases(harness) {
  for (const kind of ['hashed', 'zero']) for (const winner of [0, 1]) {
    await harness.case(`TC10/${kind}/winner${winner + 1}`, async ctx => {
      const requestId = kind === 'zero' ? ZeroHash : id('tv4:TC10-browser');
      const proposals = [];
      for (let i = 0; i < 2; i++) proposals.push(await ctx.propose({ requestId, recipient: i ? ctx.accounts.recipient2 : ctx.accounts.recipient, amount: BigInt(i + 1) * 1000n * ctx.U,
        description: JSON.stringify({ version: 1, title: `TC10 ${kind} independent P${i + 1}`, body: 'Distinct proposal and operation, shared request, no budget reservation.' }), at: ctx.t0 + BigInt(i * 3) }));
      assert.notEqual(proposals[0].id, proposals[1].id);
      for (const p of proposals) await ctx.pass(p);
      for (const p of proposals) await ctx.queue(p);
      assert.notEqual(proposals[0].operationId, proposals[1].operationId);
      const first = proposals[winner], loser = proposals[1 - winner];
      const readyAt = proposals.reduce((max, p) => p.eta > max ? p.eta : max, 0n);
      const paid = await ctx.tx({ label: 'Winner executes funded shared request', from: ctx.accounts.outsider, method: 'execute', args: first.action, at: readyAt });
      const expected = 10000n * ctx.U - first.amount;
      assert.ok(expected >= loser.amount, 'Duplicate denied despite enough funds');
      assert.equal(await ctx.one('BUD', 'balanceOf', [ctx.address.Treasury]), expected);
      assert.equal(await ctx.one('BUD', 'balanceOf', [first.recipient]), first.amount);
      assert.equal(await ctx.one('BUD', 'balanceOf', [loser.recipient]), 0n);
      assert.equal(await ctx.one('Treasury', 'paidRequests', [requestId]), true);
      const payments = paid.logs.filter(log => log.address.toLowerCase() === ctx.address.Treasury.toLowerCase()).map(log => ctx.abi.Treasury.parseLog(log)).filter(event => event?.name === 'BudgetDisbursed');
      assert.equal(payments.length, 1); assert.deepEqual(Array.from(payments[0].args), [requestId, first.recipient, first.amount]);
      const before = await ctx.invariants(loser);
      await ctx.tx({ label: 'Losing proposal cannot pay same request twice', from: ctx.accounts.caller, method: 'execute', args: loser.action, at: readyAt + 1n,
        expectError: { name: 'RequestAlreadyPaid', args: [requestId] } });
      assert.deepEqual(await ctx.invariants(loser), before);
      assert.equal(await ctx.one('Governor', 'state', [first.id]), 7n); assert.equal(await ctx.one('Governor', 'state', [loser.id]), 5n);
      assert.equal(await ctx.one('Timelock', 'isOperationDone', [first.operationId]), true); assert.equal(await ctx.one('Timelock', 'isOperationReady', [loser.operationId]), true);
      ctx.row.checks.push({ name: 'TC10 independent same-request winner-only payment', kind, winner: winner + 1, requestId, winnerProposal: first.id, loserProposal: loser.id, winnerTransaction: paid.transactionHash, recipient: first.recipient, amount: first.amount, treasury: expected, loserBeforeAndAfter: before });
      const snapshot = await ctx.checkpoint({ label: 'Winner-only receipt API ledger and duplicate UI preflight', proposals, expectedStates: proposals.map((_, i) => i === winner ? 'Executed' : 'Queued'), expectedTreasury: expected, expectedPayouts: 1,
        ui: { account: ctx.accounts.outsider, cancelEnabled: false, expectedOperation: winner === 0 ? 'Done' : 'Ready', tc10: { kind, winner: winner + 1, winnerId: String(first.id), loserId: String(loser.id), requestId, recipient: first.recipient, amount: String(first.amount), winnerTransaction: paid.transactionHash } } });
      const payout = snapshot.responses.outgoing.body.data[0];
      assert.equal(await ctx.one('BUD', 'balanceOf', [ctx.address.Treasury]), expected, 'UI duplicate preflight cannot spend');
      assert.equal(await ctx.one('BUD', 'balanceOf', [first.recipient]), first.amount);
      assert.equal(await ctx.one('BUD', 'balanceOf', [loser.recipient]), 0n);
      assert.deepEqual(await ctx.invariants(loser), before, 'UI denial leaves losing operation Ready and shared request already paid');
      assert.equal(payout.proposalId, String(first.id)); assert.equal(payout.requestId, requestId); assert.equal(payout.transactionHash, paid.transactionHash); assert.equal(payout.to, first.recipient.toLowerCase()); assert.equal(payout.amount, String(first.amount));
      for (let i = 0; i < 2; i++) {
        const detail = snapshot.responses[`detail-${i}`].body.data;
        assert.equal(detail.transactions.executed, i === winner ? paid.transactionHash : null);
        assert.equal(detail.operation.status, i === winner ? 'Done' : 'Ready'); assert.equal(detail.operation.eta, String(proposals[i].eta));
      }
    });
  }
  return { count: 4, scope: 'NEW independently reset hashed/zero request IDs and both winners: real receipt -> shared sync/project -> same-H/hash/revision API -> live browser winner/loser/Treasury linkage and duplicate-request preflight with no wallet send.' };
}
