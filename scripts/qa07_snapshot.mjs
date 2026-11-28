import assert from 'node:assert/strict';

// Publication identity/metadata are immutable; sync freshness may change between reads.
export function assertReconciledSnapshot(summary, detail, transfers) {
  assert.equal(typeof summary.snapshotRevision, 'string', 'Summary snapshotRevision must be a string');
  assert.notEqual(summary.snapshotRevision, '', 'Summary snapshotRevision must not be empty');
  for (const [label, context] of [['detail', detail], ['transfers', transfers]]) {
    for (const key of ['chainId', 'deploymentId', 'asOfBlock', 'asOfBlockHash', 'snapshotRevision', 'asOfTimestamp', 'dataKind'])
      assert.equal(context[key], summary[key], `API ${label} ${key} must match the reconciled publication`);
  }
}

export async function readReconciledSnapshot(get, summary, proposalId) {
  // H/hash select the cached snapshot; revision remains a response invariant, not a query parameter.
  const pin = { asOfBlock: summary.asOfBlock, asOfBlockHash: summary.asOfBlockHash };
  const detail = await get(`/proposals/${proposalId}`, pin);
  assert.equal(detail.status, 200);
  const transfers = await get('/treasury/transfers', { proposalId, ...pin });
  assert.equal(transfers.status, 200);
  assertReconciledSnapshot(summary, detail.body.context, transfers.body.context);
  return { detail, transfers, pin };
}

export function assertRenderedSnapshot(ui, summary) {
  assert.equal(ui.asOfBlockHash, summary.asOfBlockHash, 'Rendered UI hash must match the reconciled publication');
  assert.equal(ui.snapshotRevision, summary.snapshotRevision, 'Rendered UI revision must match the reconciled publication');
}
