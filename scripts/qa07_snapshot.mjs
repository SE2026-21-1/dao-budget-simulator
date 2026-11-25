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
