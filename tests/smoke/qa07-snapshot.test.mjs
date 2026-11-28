import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReconciledSnapshot, assertRenderedSnapshot, readReconciledSnapshot } from '../../scripts/qa07_snapshot.mjs';

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

// A materialized H52 survives monotonic publications H53/H54 at the same revision.
// This deterministic API-contract fixture is not a real-worker/DB acceptance run.
function advancingSnapshots() {
  const snapshots = [summary, { ...summary, asOfBlock: '53', asOfBlockHash: `0x${'cd'.repeat(32)}`, asOfTimestamp: '1800000001' },
    { ...summary, asOfBlock: '54', asOfBlockHash: `0x${'ef'.repeat(32)}`, asOfTimestamp: '1800000002' }];
  let publication = 0;
  const get = async (path, query = {}) => {
    if ((query.asOfBlock === undefined) !== (query.asOfBlockHash === undefined)) return { status: 400 };
    const selected = query.asOfBlock === undefined ? snapshots[publication]
      : snapshots.find(s => s.asOfBlock === query.asOfBlock && s.asOfBlockHash === query.asOfBlockHash);
    if (!selected) return { status: 409 };
    const data = path === '/summary' ? { treasury: { balance: '1000000000000000000000' } }
      : path === '/proposals/7' ? { proposalId: '7', requestId: `0x${'12'.repeat(32)}`, state: 'Executed' }
        : [{ proposalId: '7', amount: '11000000000000000000000' }];
    publication = Math.min(publication + 1, snapshots.length - 1);
    return { status: 200, body: { context: { ...selected }, data } };
  };
  return { get, current: () => snapshots[publication] };
}

test('final API reads retain the summary snapshot when publication advances before detail and transfers', async () => {
  const api = advancingSnapshots();
  const captured = await api.get('/summary'); // Materializes H52, then the worker publication moves to H53.
  const result = await readReconciledSnapshot(api.get, captured.body.context, '7');
  assert.equal(api.current().asOfBlock, '54');
  assert.deepEqual(result.detail.body.context, captured.body.context);
  assert.deepEqual(result.transfers.body.context, captured.body.context);
});

for (const unpinnedPath of ['/proposals/7', '/treasury/transfers']) {
  test(`omitting the pin on ${unpinnedPath} selects a newer publication and must fail reconciliation`, async () => {
    const api = advancingSnapshots();
    const captured = await api.get('/summary');
    const losePin = (path, query) => {
      if (path !== unpinnedPath) return api.get(path, query);
      const { asOfBlock, asOfBlockHash, ...filters } = query;
      return api.get(path, filters);
    };
    await assert.rejects(readReconciledSnapshot(losePin, captured.body.context, '7'), /API (detail|transfers) asOfBlock/);
  });
}

test('rendered UI hash and revision match the summary', () => {
  assertRenderedSnapshot({ asOfBlockHash: summary.asOfBlockHash, snapshotRevision: summary.snapshotRevision }, summary);
});

test('rendered UI revision mismatch at the same hash fails the runner oracle', () => {
  assert.throws(() => assertRenderedSnapshot({ asOfBlockHash: summary.asOfBlockHash, snapshotRevision: '2' }, summary),
    /Rendered UI revision must match/);
});

test('rendered UI hash mismatch still fails even at the same revision', () => {
  assert.throws(() => assertRenderedSnapshot({ asOfBlockHash: `0x${'cd'.repeat(32)}`, snapshotRevision: summary.snapshotRevision }, summary),
    /Rendered UI hash must match/);
});
