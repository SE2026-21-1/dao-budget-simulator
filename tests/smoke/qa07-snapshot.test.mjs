import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReconciledSnapshot } from '../../scripts/qa07_snapshot.mjs';

const summary = Object.freeze({ chainId: '31337', deploymentId: 'qa07-e2e', asOfBlock: '52',
  asOfBlockHash: `0x${'ab'.repeat(32)}`, snapshotRevision: '1', asOfTimestamp: '1800000000', dataKind: 'chain' });

test('same publication reconciles despite changing sync freshness', () => {
  assertReconciledSnapshot(summary, { ...summary, sync: { lagBlocks: '2' } }, { ...summary, sync: { lagBlocks: '3' } });
});

for (const response of ['detail', 'transfers']) {
  for (const [key, value] of Object.entries({ snapshotRevision: '2', chainId: '1', deploymentId: 'another-deployment',
    asOfBlock: '53', asOfBlockHash: `0x${'cd'.repeat(32)}`, asOfTimestamp: '1800000001', dataKind: 'fixture' })) {
    test(`${response} rejects ${key} mismatch (other publication fields unchanged)`, () => {
      const changed = { ...summary, [key]: value };
      assert.throws(() => assertReconciledSnapshot(summary, response === 'detail' ? changed : summary,
        response === 'transfers' ? changed : summary), { code: 'ERR_ASSERTION', message: new RegExp(`${response} ${key}`) });
    });
  }
}

for (const revision of [undefined, '']) {
  test(`missing/empty summary revision ${String(revision)} cannot reconcile with equally incomplete responses`, () => {
    const incomplete = { ...summary, snapshotRevision: revision };
    assert.throws(() => assertReconciledSnapshot(incomplete, incomplete, incomplete), /Summary snapshotRevision/);
  });
}
