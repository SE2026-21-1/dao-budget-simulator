// Offline verification of the BE01 read-API contract, not a chain/indexer test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT, FIXTURE_DIR, UINT256_MAX, UNIT, STATES, ADDRESSES, H, T, context,
  keccak256, hashText, proposalHash, operationHash, calldata, tuple,
  proposalTuple, descending, buildFixtures, serialize,
} from './generate_be01_fixtures.mjs';

let assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const uint = (value, label) => {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), `${label}: canonical decimal string`);
  const n = BigInt(value); check(n <= UINT256_MAX, `${label}: uint256 domain`); return n;
};
const hash = (value, label) => check(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value), `${label}: bytes32`);
const address = (value, label) => check(typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value), `${label}: address`);
const keys = (object, expected, label) => eq(Object.keys(object).sort(), [...expected].sort(), `${label}: exact keys`);
const enumerate = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? enumerate(path.join(dir, entry.name), `${prefix}${entry.name}/`) : entry.name.endsWith('.json') ? [`${prefix}${entry.name}`] : []);
const jsonFiles = enumerate(FIXTURE_DIR).sort();
const files = new Map(jsonFiles.map(file => [file, JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8'))]));
const expected = buildFixtures();
eq(jsonFiles, [...expected.keys()].sort(), 'No missing, stale or untracked JSON fixtures');
for (const [file, body] of expected) eq(readFileSync(path.join(FIXTURE_DIR, file), 'utf8'), serialize(body), `${file}: deterministic generation is current`);

// Published Ethereum Keccak vectors + immutable SC01 serve as independent anchors.
eq(keccak256(Buffer.alloc(0)), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470', 'Keccak empty vector');
eq(hashText('abc'), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45', 'Keccak abc vector');
eq(hashText('disburse(bytes32,address,uint256)').slice(0, 10), '0x6664ac91', 'disburse selector');
const sc01 = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/sc01/disbursement-v1.json'), 'utf8'));
eq(calldata(sc01.requestId, sc01.recipient, sc01.amount), sc01.calldatas[0], 'SC01 calldata anchor');
eq(hashText(sc01.description), sc01.descriptionHash, 'SC01 exact description hash anchor');
eq(String(BigInt(proposalHash(sc01))), sc01.proposalId, 'SC01 ABI/hash proposalId anchor');
eq(calldata(sc01.requestId, sc01.recipient, String(UINT256_MAX)).slice(-64), 'f'.repeat(64), 'uint256 maximum encoded without precision loss');

function numericTypes(value, label = '') {
  if (Array.isArray(value)) { value.forEach((v, i) => numericTypes(v, `${label}[${i}]`)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'number') {
      check(Number.isInteger(child), `${label}.${key}: integral display/count field`);
      check(['decimals', 'support', 'limit', 'totalCount', 'total', 'schemaVersion', 'status'].includes(key) || label.endsWith('.byState'), `${label}.${key}: blockchain values must not use Number`);
    } else numericTypes(child, `${label}.${key}`);
  }
}
function validateContext(c, file) {
  keys(c, ['chainId', 'deploymentId', 'snapshotRevision', 'asOfBlock', 'asOfBlockHash', 'asOfTimestamp', 'dataKind', 'sync'], `${file} context`);
  eq(c.chainId, '31337', `${file} chain scope`); eq(c.deploymentId, 'synthetic-local-v1', `${file} deployment scope`);
  eq(c.snapshotRevision, 'fixture-v1', `${file} revision`); eq(c.dataKind, 'synthetic', `${file} synthetic label`);
  keys(c.sync, ['status', 'headBlock', 'confirmedBlock', 'indexedBlock', 'lagBlocks', 'lagSeconds', 'confirmations', 'lastIndexedAt'], `${file} sync`);
  uint(c.sync.confirmations, 'confirmations');
  for (const field of ['headBlock', 'confirmedBlock', 'indexedBlock', 'lagBlocks', 'lagSeconds']) if (c.sync[field] !== null) uint(c.sync[field], field);
  if (c.sync.status === 'not_ready') {
    for (const field of ['asOfBlock', 'asOfBlockHash', 'asOfTimestamp']) eq(c[field], null, `${file}: no fabricated checkpoint`);
    eq(c.sync.indexedBlock, null); eq(c.sync.lastIndexedAt, null);
  } else {
    eq(c.asOfBlock, String(H)); eq(c.asOfTimestamp, String(T)); eq(c.asOfBlockHash, context.asOfBlockHash);
    hash(c.asOfBlockHash, 'H hash');
    check(['synced', 'lagging'].includes(c.sync.status), 'Known sync status');
    check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(c.sync.lastIndexedAt), 'Operational ISO8601 UTC timestamp');
    eq(BigInt(c.sync.confirmedBlock), BigInt(c.sync.headBlock) - BigInt(c.sync.confirmations), 'Confirmed block arithmetic');
    eq(BigInt(c.sync.lagBlocks), BigInt(c.sync.confirmedBlock) - BigInt(c.sync.indexedBlock), 'Lag arithmetic');
    check(BigInt(c.asOfBlock) <= BigInt(c.sync.indexedBlock), 'H no newer than checkpoint');
  }
}
function eventFields(e) {
  uint(e.blockNumber, 'blockNumber'); hash(e.blockHash, 'blockHash'); hash(e.transactionHash, 'transactionHash'); uint(e.transactionIndex, 'transactionIndex'); uint(e.logIndex, 'logIndex');
  check(BigInt(e.blockNumber) <= H, 'No event newer than H');
  eq(e.blockHash, hashText(`be01:synthetic:block:${e.blockNumber}`), 'Synthetic block hash matches block identity');
}
for (const [file, body] of files) {
  numericTypes(body, file);
  validateContext(body.context, file);
  if (file === 'manifest.json') continue;
  if (body.error) {
    keys(body, ['context', 'error'], `${file} error envelope`);
    keys(body.error, ['code', 'message', 'details', 'retryable'], `${file} error`);
    check(typeof body.error.code === 'string' && body.error.code.length > 0, 'Error code');
    check(typeof body.error.message === 'string' && body.error.message.length > 0, 'Error message');
    check(typeof body.error.details === 'object' && !Array.isArray(body.error.details), 'Structured error details');
    check(typeof body.error.retryable === 'boolean', 'Retryable boolean');
  } else if (body.pagination) {
    keys(body, ['context', 'data', 'pagination'], `${file} list envelope`);
    keys(body.pagination, ['limit', 'totalCount', 'nextCursor'], `${file} pagination`);
    check(Array.isArray(body.data), 'List data array'); eq(body.pagination.limit, 20);
    check(body.data.length <= 20 && body.pagination.totalCount >= body.data.length, 'Page count bounds');
  } else keys(body, ['context', 'data'], `${file} response envelope`);
}

const pages = [1, 2, 3].map(n => files.get(`proposals-page-${n}.json`));
eq(pages.map(p => p.data.length), [20, 20, 5], 'Exactly 20/20/5');
const proposals = pages.flatMap(page => page.data);
const proposalById = new Map(proposals.map(p => [p.proposalId, p]));
eq(proposals.length, 45); eq(proposalById.size, 45, 'Unique proposal IDs');
eq([...new Set(proposals.map(p => p.state))].sort(), [...STATES].sort(), 'All seven states represented');
const summary = files.get('summary.json').data;
keys(summary, ['treasury', 'proposalCounts', 'governance', 'recentActivity'], 'Summary');
eq(summary.proposalCounts.total, 45);
eq(summary.proposalCounts.byState, Object.fromEntries(STATES.map(state => [state, proposals.filter(p => p.state === state).length])));
for (const p of proposals) {
  keys(p, ['proposalId', 'requestId', 'proposer', 'recipient', 'amount', 'description', 'descriptionHash', 'title', 'body', 'targets', 'values', 'calldatas', 'snapshot', 'deadline', 'state', 'stateSource', 'votes', 'operation', 'created', 'transactions'], 'Proposal');
  check(uint(p.proposalId, 'proposalId') > BigInt(Number.MAX_SAFE_INTEGER), 'IDs exercise JS Number precision hazard');
  hash(p.requestId, 'requestId'); address(p.proposer, 'proposer'); address(p.recipient, 'recipient');
  check(uint(p.amount, 'disbursement') > 0n, 'Disbursement positive');
  check(p.recipient !== ADDRESSES.treasury && p.recipient !== `0x${'0'.repeat(40)}`, 'Recipient allowed');
  eq(p.stateSource, 'synthetic'); eq(p.targets, [ADDRESSES.treasury]); eq(p.values, ['0']);
  eq(p.calldatas, [calldata(p.requestId, p.recipient, p.amount)], 'Calldata links exact request/recipient/amount');
  eq(p.descriptionHash, hashText(p.description), 'Hash original UTF8 without reserialization');
  eq(p.proposalId, String(BigInt(proposalHash(p))), 'ProposalId is real Governor hashProposal formula');
  const description = JSON.parse(p.description);
  eq(description.version, 1); eq(p.title, description.title); eq(p.body, description.body);
  check([...p.title].length >= 5 && [...p.title].length <= 120, 'Proposed v1 title length');
  check([...p.body].length >= 20 && [...p.body].length <= 2000, 'Proposed v1 body length');
  const snapshot = uint(p.snapshot, 'snapshot'); const deadline = uint(p.deadline, 'deadline');
  eq(deadline - snapshot, 300n, 'Voting period');
  keys(p.created, ['blockNumber', 'blockHash', 'transactionHash', 'transactionIndex', 'logIndex'], 'Created event'); eventFields(p.created);
  keys(p.transactions, ['created', 'queued', 'executed', 'canceled'], 'Transactions');
  eq(p.transactions.created, p.created.transactionHash);
  for (const v of Object.values(p.transactions)) if (v !== null) hash(v, 'successful synthetic transaction');
  eq(files.get(`proposals/${p.proposalId}.json`).data, p, 'List/detail identical');
  keys(p.votes, ['against', 'for', 'abstain', 'quorum'], 'Vote totals');
  for (const key of ['against', 'for', 'abstain']) uint(p.votes[key], `votes.${key}`);
  eq(p.votes.quorum, snapshot >= T ? null : String(200n * UNIT), 'Quorum historical availability and 20% supply');
  const votes = files.get(`votes/${p.proposalId}.json`).data;
  const voterSet = new Set(); const sums = { against: 0n, for: 0n, abstain: 0n };
  for (const v of votes) {
    keys(v, ['proposalId', 'voter', 'support', 'weight', 'reason', 'blockNumber', 'blockHash', 'transactionHash', 'transactionIndex', 'logIndex'], 'Vote');
    eq(v.proposalId, p.proposalId); address(v.voter, 'voter'); check(!voterSet.has(v.voter), 'One vote per voter/proposal'); voterSet.add(v.voter);
    check([0, 1, 2].includes(v.support), '0=Against,1=For,2=Abstain');
    check(typeof v.reason === 'string', 'Reason string'); eventFields(v); check(BigInt(v.blockNumber) >= BigInt(p.created.blockNumber), 'Vote no earlier than creation');
    sums[['against', 'for', 'abstain'][v.support]] += uint(v.weight, 'vote weight');
  }
  for (const key of Object.keys(sums)) eq(p.votes[key], String(sums[key]), 'Votes agree with proposal totals');
  const succeeded = p.votes.quorum !== null && sums.for + sums.abstain >= BigInt(p.votes.quorum) && sums.for > sums.against;
  let derived;
  if (p.transactions.canceled !== null) derived = 'Canceled';
  else if (p.transactions.executed !== null) derived = 'Executed';
  else if (p.transactions.queued !== null) derived = 'Queued';
  else if (T <= snapshot) derived = 'Pending';
  else if (T <= deadline) derived = 'Active';
  else derived = succeeded ? 'Succeeded' : 'Defeated';
  eq(p.state, derived, 'State derived from lifecycle plus exact clock H');
  if (['Queued', 'Executed', 'Succeeded'].includes(p.state)) { check(T > deadline, 'Successful voting completed'); check(succeeded, 'Quorum uses For+Abstain and For>Against'); }
  if (['Pending', 'Canceled'].includes(p.state)) eq(votes.length, 0, 'Pending/canceled-before-start has no votes');
  if (p.operation) {
    const op = p.operation;
    keys(op, ['operationId', 'queuedAt', 'eta', 'status', 'predecessor', 'salt'], 'Operation');
    hash(op.operationId, 'operationId'); hash(op.predecessor, 'predecessor'); hash(op.salt, 'salt');
    const queued = uint(op.queuedAt, 'queue timestamp'); const eta = uint(op.eta, 'eta');
    eq(eta - queued, 120n, 'Timelock delay'); check(queued > deadline, 'Queue follows completed voting');
    eq(op.operationId, operationHash(p, op.predecessor, op.salt), 'Real hashOperationBatch with documented synthetic salt');
    check(op.salt !== p.descriptionHash, 'No descriptionHash salt assumption');
    check(p.state === 'Queued' || p.state === 'Executed', 'Operation only after queue');
    eq(op.status, p.state === 'Executed' ? 'Done' : T >= eta ? 'Ready' : 'Waiting', 'Ready boundary is >= ETA');
    if (p.state === 'Executed') check(T >= eta, 'Execution after ETA');
  } else check(!['Queued', 'Executed'].includes(p.state), 'Queued/executed must link operation');
}
const sc01Proposal = proposalById.get(sc01.proposalId);
for (const key of ['proposalId', 'requestId', 'recipient', 'amount', 'description', 'descriptionHash', 'targets', 'values', 'calldatas']) eq(sc01Proposal[key], sc01[key], `SC01 preserved ${key}`);
check(proposals.some(p => p.description !== JSON.stringify(JSON.parse(p.description))), 'Whitespace/key-order-sensitive description example');
check(proposals.some(p => p.requestId === `0x${'0'.repeat(64)}`), 'Zero requestId allowed');
check(proposals.filter(p => p.requestId === sc01.requestId).length === 2, 'Duplicate requestId allowed across proposals');
check(proposals.some(p => p.state === 'Pending' && BigInt(p.snapshot) === T), 'snapshot exactly H is Pending');
check(proposals.some(p => p.state === 'Active' && BigInt(p.snapshot) + 1n === T), 'snapshot+1 is Active');
check(proposals.some(p => p.state === 'Active' && BigInt(p.deadline) === T), 'deadline exactly H is Active');
for (const state of ['Succeeded', 'Defeated']) check(proposals.some(p => p.state === state && BigInt(p.deadline) + 1n === T), `deadline+1 ${state}`);
check(proposals.some(p => p.operation?.status === 'Waiting' && BigInt(p.operation.eta) - 1n === T), 'ETA-1 Waiting');
check(proposals.some(p => p.operation?.status === 'Ready' && BigInt(p.operation.eta) === T), 'ETA Ready');

const transfers = [1, 2].flatMap(n => files.get(`transfers-page-${n}.json`).data);
const seenLogs = new Set(); const transactionAtPosition = new Map(); const positionOfTransaction = new Map();
function uniqueLog(e) {
  const key = `${context.chainId}:${e.transactionHash}:${e.logIndex}`;
  check(!seenLogs.has(key), 'Unique chainId+txHash+logIndex across source logs'); seenLogs.add(key);
  const position = `${e.blockNumber}:${e.transactionIndex}`;
  if (transactionAtPosition.has(position)) eq(transactionAtPosition.get(position), e.transactionHash, 'One transaction hash per block/index');
  if (positionOfTransaction.has(e.transactionHash)) eq(positionOfTransaction.get(e.transactionHash), position, 'Transaction has one canonical block/index');
  transactionAtPosition.set(position, e.transactionHash); positionOfTransaction.set(e.transactionHash, position);
}
for (const p of proposals) { uniqueLog(p.created); for (const v of files.get(`votes/${p.proposalId}.json`).data) uniqueLog(v); }
const paidRequests = new Set(); let totalIn = 0n; let totalOut = 0n;
for (const t of transfers) {
  keys(t, ['token', 'from', 'to', 'amount', 'direction', 'proposalId', 'requestId', 'blockNumber', 'blockHash', 'transactionHash', 'transactionIndex', 'logIndex'], 'Transfer');
  eq(t.token, ADDRESSES.bud); address(t.from, 'from'); address(t.to, 'to'); eventFields(t); uniqueLog(t);
  const amount = uint(t.amount, 'Transfer amount');
  const direction = t.from === ADDRESSES.treasury && t.to === ADDRESSES.treasury ? 'self' : t.from === ADDRESSES.treasury ? 'out' : t.to === ADDRESSES.treasury ? 'in' : null;
  eq(t.direction, direction, 'Treasury direction'); check(direction !== null, 'Transfer concerns Treasury');
  if (direction === 'in') totalIn += amount;
  if (direction === 'out') {
    totalOut += amount; const p = proposalById.get(t.proposalId); check(Boolean(p), 'Payout links existing proposal');
    eq(p.state, 'Executed'); eq(t.requestId, p.requestId); eq(t.to, p.recipient); eq(t.amount, p.amount); eq(t.transactionHash, p.transactions.executed);
    check(!paidRequests.has(t.requestId), 'Only one successful payment per requestId'); paidRequests.add(t.requestId);
    check(BigInt(t.blockNumber) >= BigInt(p.created.blockNumber), 'Payout after proposal creation');
    for (const v of files.get(`votes/${p.proposalId}.json`).data) check(BigInt(v.blockNumber) <= BigInt(t.blockNumber), 'Votes precede execution');
  } else { eq(t.proposalId, null); eq(t.requestId, null); }
}
eq(totalOut, proposals.filter(p => p.state === 'Executed').reduce((s, p) => s + BigInt(p.amount), 0n), 'One Transfer for each executed disbursement');
eq(summary.treasury.totalIn, String(totalIn)); eq(summary.treasury.totalOut, String(totalOut)); eq(summary.treasury.balance, String(totalIn - totalOut), 'Transfer ledger reconciles balance without counting BudgetDisbursed');
check(totalIn <= 20000n * UNIT && totalOut < totalIn, 'Synthetic ledger fits fixed BUD supply and balance');
check(transfers.some(t => t.amount === '0'), 'Zero Transfer fixture');
check(transfers.some(t => BigInt(t.amount) % UNIT !== 0n), 'Fractional BUD fixture');
check(transfers.some(t => t.direction === 'self'), 'Self transfer does not count inflow/outflow');
eq(summary.recentActivity, transfers.slice(0, 5).map(t => ({ type: 'Transfer', ...t })), 'Recent activities are same latest source transfers');

const manifest = files.get('manifest.json');
eq(manifest.kind, 'synthetic-be01-not-chain-evidence'); eq(manifest.sc01ProposalId, sc01.proposalId);
const represented = new Set(); const groupedPages = new Map();
for (const route of manifest.routes) {
  eq(route.method, 'GET'); check(files.has(route.file), 'Manifest points at real fixture'); represented.add(route.file);
  eq(route.query.chainId, context.chainId); eq(route.query.deploymentId, context.deploymentId);
  const body = files.get(route.file);
  if (body.error) { check(route.status >= 400, 'Error HTTP status'); continue; }
  if (route.path === '/api/health') { check([200, 503].includes(route.status)); continue; }
  eq(route.status, 200);
  if (!body.pagination) continue;
  const filters = Object.fromEntries(Object.entries(route.query).filter(([k]) => !['chainId', 'deploymentId', 'cursor'].includes(k)));
  const normalized = route.path === '/api/proposals' ? { state: filters.state ?? null, proposalId: filters.proposalId ?? null } : route.path === '/api/treasury/transfers' ? { direction: filters.direction ?? null, proposalId: filters.proposalId ?? null } : {};
  const group = `${route.path}:${JSON.stringify(normalized)}`;
  if (!groupedPages.has(group)) groupedPages.set(group, []);
  groupedPages.get(group).push({ route, body, filters: normalized });
}
eq([...represented].sort(), jsonFiles.filter(file => file !== 'manifest.json'), 'Every JSON response mapped to exact request/status/scenario');
for (const group of groupedPages.values()) {
  const { route: first, filters } = group[0];
  let all;
  if (first.path === '/api/proposals') all = proposals.filter(p => (!filters.state || p.state === filters.state) && (!filters.proposalId || p.proposalId === filters.proposalId));
  else if (first.path === '/api/treasury/transfers') all = transfers.filter(t => (!filters.direction || t.direction === filters.direction) && (!filters.proposalId || t.proposalId === filters.proposalId));
  else all = files.get(`votes/${first.path.split('/')[3]}.json`).data;
  const key = first.path === '/api/proposals' ? proposalTuple : tuple;
  eq([...all].sort((a, b) => descending(key(a), key(b))), all, 'Stable descending tuple order');
  eq(group.flatMap(page => page.body.data), all, 'No omission/duplication across all pages and filters');
  let incoming = null;
  for (const { route, body } of group) {
    eq(route.query.cursor ?? null, incoming, 'Exact cursor continuation in manifest');
    eq(body.pagination.totalCount, all.length, 'totalCount after filters at H');
    const token = body.pagination.nextCursor;
    if (token !== null) {
      check(/^[A-Za-z0-9_-]+$/.test(token), 'Opaque base64url cursor');
      const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      eq(cursor, { chainId: context.chainId, deploymentId: context.deploymentId, asOfBlock: context.asOfBlock, asOfBlockHash: context.asOfBlockHash, endpoint: route.path, filters, limit: 20, order: route.path === '/api/proposals' ? 'desc:blockNumber,transactionIndex,logIndex,proposalId' : 'desc:blockNumber,transactionIndex,logIndex', last: key(body.data.at(-1)), revision: context.snapshotRevision }, 'Cursor binds exact scope/H/hash/revision/endpoint/filters/limit/order/last tuple');
    }
    incoming = token;
  }
  eq(incoming, null, 'Last page closes cursor');
}
for (const file of ['error-invalid-proposal-id.json', 'error-not-found.json', 'error-data-not-ready.json', 'error-invalid-cursor.json', 'error-cursor-context-mismatch.json', 'error-snapshot-invalidated.json']) check(files.has(file), `Required error fixture ${file}`);
eq(files.get('health-synced.json').data, { status: 'ok', database: 'up', indexer: 'synced' });
eq(files.get('health-lagging.json').data.status, 'degraded'); check(BigInt(files.get('health-lagging.json').context.sync.lagSeconds) > 30n, 'Lagging UI sample exceeds NFR03');
eq(files.get('health-not-ready.json').data.status, 'unavailable');
console.log(`BE01 OK: ${jsonFiles.length} JSON files, 45 hash-valid proposals, pages 20/20/5, seven clock-correct states, votes/operations/transfers/summary/cursors consistent (${assertions} assertions).`);
console.log('Offline synthetic contract checks only; PostgreSQL migration, deployed contracts, RPC, indexer and HTTP server are separate checks.');
