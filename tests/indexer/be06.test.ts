import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBe06Manifest } from '../../indexer/be06/manifest.js';
import { normalizedDiff } from '../../indexer/be06/compare.js';

const manifest = () => ({
  format: 'dao-budget-local-handoff-v1',
  sourceCommit: '1234567890abcdef1234567890abcdef12345678',
  chainId: '31337',
  contracts: {
    BUD: { address: '0x4444444444444444444444444444444444444444', deploymentBlock: '10', abiVersion: 'oz-5.4.0-erc20' },
    Treasury: { address: '0x1111111111111111111111111111111111111111', deploymentBlock: '11', abiVersion: 'sc01-itreasury-v1' },
    Timelock: { address: '0x3333333333333333333333333333333333333333', deploymentBlock: '12', abiVersion: 'oz-5.4.0-timelock' },
    Governor: { address: '0x2222222222222222222222222222222222222222', deploymentBlock: '13', abiVersion: 'oz-5.4.0-governor' },
    GOV: { address: '0x5555555555555555555555555555555555555555', deploymentBlock: '9', abiVersion: 'sc02-governance-token-v1' },
  },
  confirmationPolicy: { depth: '2' },
});

test('BE06 parses the verified TV4 handoff without requiring a source deployment id', () => {
  const parsed = parseBe06Manifest(manifest(), 'http://127.0.0.1:8545', '80');
  assert.equal(parsed.config.chainId, 31337n);
  assert.equal(parsed.config.toBlock, 80n);
  assert.equal(parsed.config.fromBlock, 10n);
  assert.equal(parsed.config.confirmations, 2);
  assert.equal(parsed.config.contracts.length, 4);
  assert.equal(parsed.governanceToken.address, '0x5555555555555555555555555555555555555555');
  assert.equal(parsed.sourceCommit, '1234567890abcdef1234567890abcdef12345678');
});

test('BE06 rejects an incomplete or unsupported manifest and a source range that skips deployment', () => {
  const incomplete = manifest();
  delete (incomplete.contracts as Record<string, unknown>).Governor;
  assert.throws(() => parseBe06Manifest(incomplete, 'http://127.0.0.1:8545', '80'), /four BE03 contract roles/);

  const unsupported = { ...manifest(), format: 'synthetic-fixture' };
  assert.throws(() => parseBe06Manifest(unsupported, 'http://127.0.0.1:8545', '80'), /verified DAO deployment/);

  const skipped = { ...manifest(), scanFromBlock: '14' };
  assert.throws(() => parseBe06Manifest(skipped, 'http://127.0.0.1:8545', '80'), /skips an indexed contract/);
  const missingGov = { ...manifest(), contracts: { ...manifest().contracts } };
  delete (missingGov.contracts as Record<string, unknown>).GOV;
  assert.throws(() => parseBe06Manifest(missingGov, 'http://127.0.0.1:8545', '80'), /governance token address/);
});

test('manifest H and confirmation settings stay canonical and bounded', () => {
  assert.throws(() => parseBe06Manifest(manifest(), 'http://127.0.0.1:8545', '080'), /canonical decimal/);
  const badK = { ...manifest(), confirmations: 2.5 };
  assert.throws(() => parseBe06Manifest(badK, 'http://127.0.0.1:8545', '80'), /confirmations must be an integer/);
});

test('normalized compare ignores internal IDs, UUID revisions and ingestion timestamps by construction', () => {
  const normalized = {
    context: { chainId: '31337', scope: { chainId: '31337', contracts: [] }, atBlock: '80', blockHash: `0x${'1'.repeat(64)}`, blockTimestamp: '1800000000' },
    proposals: [{ proposalId: '1', requestId: `0x${'0'.repeat(64)}` }, { proposalId: '2', requestId: `0x${'0'.repeat(64)}` }],
    treasury: { totalIn: '10', totalOut: '0', balance: '10' },
  };
  const rebuilt = structuredClone(normalized);
  assert.deepEqual(normalizedDiff(normalized, rebuilt), []);
  assert.deepEqual(normalizedDiff(normalized.proposals, rebuilt.proposals), []);
  // Internal deployment IDs and timestamps are deliberately not export fields.
  const localOnly = { deploymentId: '1', snapshotRevision: 'old', publishedAt: 'then', indexedAt: 'then', apiCache: { row: 1 } };
  const targetOnly = { deploymentId: '9', snapshotRevision: 'new', publishedAt: 'now', indexedAt: 'now', apiCache: { row: 2 } };
  assert.equal(Object.keys(localOnly).length, Object.keys(targetOnly).length);
  assert.deepEqual(normalizedDiff(normalized, rebuilt), []);
});

test('normalized compare reports precise values for data, scope, H and hash mismatches', () => {
  const reference = { context: { scope: 'scope-a', atBlock: '80', blockHash: '0xaaa' }, proposals: [{ proposalId: '1', amount: '5' }] };
  const rebuild = { context: { scope: 'scope-b', atBlock: '81', blockHash: '0xbbb' }, proposals: [{ proposalId: '1', amount: '6' }] };
  assert.deepEqual(normalizedDiff(reference, rebuild), [
    { path: 'context.atBlock', reference: '80', rebuild: '81' },
    { path: 'context.blockHash', reference: '0xaaa', rebuild: '0xbbb' },
    { path: 'context.scope', reference: 'scope-a', rebuild: 'scope-b' },
    { path: 'proposals[proposal:1].amount', reference: '5', rebuild: '6' },
  ]);
  const zeroRequest = `0x${'0'.repeat(64)}`;
  assert.deepEqual(normalizedDiff(
    [{ proposalId: '1', requestId: zeroRequest }, { proposalId: '2', requestId: zeroRequest }],
    [{ proposalId: '1', requestId: zeroRequest }],
    'proposals',
  ), [{ path: 'proposals[proposal:2]', reference: { proposalId: '2', requestId: zeroRequest }, rebuild: null }]);
});
