// Deterministic, offline synthetic data. Node standard library only; no signing/RPC.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const FIXTURE_DIR = path.join(ROOT, 'fixtures/api');
export const UINT256_MAX = (1n << 256n) - 1n;
export const UNIT = 10n ** 18n;
export const STATES = ['Pending', 'Active', 'Succeeded', 'Defeated', 'Queued', 'Executed', 'Canceled'];
const MASK = (1n << 64n) - 1n;
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const RC = ['0000000000000001','0000000000008082','800000000000808a','8000000080008000','000000000000808b','0000000080000001','8000000080008081','8000000000008009','000000000000008a','0000000000000088','0000000080008009','000000008000000a','000000008000808b','800000000000008b','8000000000008089','8000000000008003','8000000000008002','8000000000000080','000000000000800a','800000008000000a','8000000080008081','8000000000008080','0000000080000001','8000000080008008'].map(x => BigInt(`0x${x}`));
const rot = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

// Ethereum Keccak-256 (suffix 0x01), deliberately not NIST SHA3-256 (0x06).
export function keccak256(bytes) {
  const input = Buffer.from(bytes);
  const rate = 136;
  const padded = Buffer.alloc(Math.ceil((input.length + 1) / rate) * rate);
  input.copy(padded); padded[input.length] = 0x01; padded[padded.length - 1] |= 0x80;
  const a = Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let j = 0; j < rate / 8; j++) a[j] ^= padded.readBigUInt64LE(offset + j * 8);
    for (const rc of RC) {
      const c = Array.from({ length: 5 }, (_, x) => a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20]);
      const d = c.map((_, x) => c[(x + 4) % 5] ^ rot(c[(x + 1) % 5], 1));
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) a[x + 5 * y] ^= d[x];
      const b = Array(25).fill(0n);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rot(a[x + 5 * y], ROT[x + 5 * y]);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) a[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]);
      a[0] ^= rc;
    }
  }
  const result = Buffer.alloc(32);
  for (let j = 0; j < 4; j++) result.writeBigUInt64LE(a[j], j * 8);
  return `0x${result.toString('hex')}`;
}
export const hashText = text => keccak256(Buffer.from(text, 'utf8'));
export const unhex = hex => Buffer.from(hex.slice(2), 'hex');
const word = value => {
  const n = BigInt(value);
  if (n < 0n || n > UINT256_MAX) throw new Error('uint256 outside range');
  return n.toString(16).padStart(64, '0');
};
const addressWord = address => address.slice(2).toLowerCase().padStart(64, '0');
const arrayTail = words => word(words.length) + words.join('');
const bytesTail = value => word(BigInt((value.length - 2) / 2)) + value.slice(2).padEnd(Math.ceil((value.length - 2) / 64) * 64, '0');
const bytesArrayTail = values => {
  const tails = values.map(bytesTail);
  let offset = BigInt(values.length) * 32n;
  const offsets = tails.map(tail => { const head = word(offset); offset += BigInt(tail.length / 2); return head; });
  return word(values.length) + offsets.join('') + tails.join('');
};
export function encodeBatch(targets, values, calldatas, trailingWords) {
  const tails = [arrayTail(targets.map(addressWord)), arrayTail(values.map(word)), bytesArrayTail(calldatas)];
  let offset = BigInt(3 + trailingWords.length) * 32n;
  const offsets = tails.map(tail => { const head = word(offset); offset += BigInt(tail.length / 2); return head; });
  return `0x${offsets.join('')}${trailingWords.map(x => x.slice(2)).join('')}${tails.join('')}`;
}
export const proposalHash = p => keccak256(unhex(encodeBatch(p.targets, p.values, p.calldatas, [p.descriptionHash])));
export const operationHash = (p, predecessor, salt) => keccak256(unhex(encodeBatch(p.targets, p.values, p.calldatas, [predecessor, salt])));
export const calldata = (requestId, recipient, amount) => `${hashText('disburse(bytes32,address,uint256)').slice(0, 10)}${requestId.slice(2)}${addressWord(recipient)}${word(amount)}`;
const ZERO = `0x${'00'.repeat(32)}`;
const ADDRESS = suffix => `0x${suffix.repeat(40)}`;
export const ADDRESSES = { treasury: ADDRESS('1'), governor: ADDRESS('3'), timelock: ADDRESS('4'), gov: ADDRESS('5'), bud: ADDRESS('6'), funder: ADDRESS('7'), voters: [ADDRESS('8'), ADDRESS('9'), ADDRESS('a'), ADDRESS('b')] };
export const H = 9000n;
export const T = 1792300000n;
export const context = {
  chainId: '31337', deploymentId: 'synthetic-local-v1', snapshotRevision: 'fixture-v2',
  asOfBlock: String(H), asOfBlockHash: hashText('be01:synthetic:block:9000'), asOfTimestamp: String(T), dataKind: 'synthetic',
  sync: { status: 'synced', headBlock: '9002', confirmedBlock: '9000', indexedBlock: '9000', lagBlocks: '0', lagSeconds: '0', confirmations: '2', lastIndexedAt: '2026-10-18T03:46:40.000Z' },
};
const blockHash = block => hashText(`be01:synthetic:block:${block}`);
const txHash = label => hashText(`be01:synthetic:transaction:${label}`);
// Every requested event time becomes one exact block timestamp, without rounding.
// Sparse transaction indexes model a subset of transactions. logIndex is allocated
// once per block after every modeled transaction/emission is known.
function timeline() {
  const planned = [];
  const event = (sourceId, timestamp, txIndex, emissionOrder, details, transactionHash = txHash(sourceId)) => {
    if (timestamp > T) throw new Error(`Future source event: ${sourceId}`);
    const location = { transactionHash, transactionIndex: String(txIndex) };
    planned.push({ sourceId, timestamp, txIndex, emissionOrder, details, location });
    return location;
  };
  const finalize = () => {
    const times = [...new Set([...planned.map(e => e.timestamp), T])].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const blocks = times.map((timestamp, i) => {
      const number = H - BigInt(times.length - 1 - i);
      return { blockNumber: String(number), blockHash: blockHash(number), timestamp: String(timestamp) };
    });
    const byTime = new Map(blocks.map(b => [BigInt(b.timestamp), b]));
    planned.sort((a, b) => {
      for (const key of ['timestamp', 'txIndex', 'emissionOrder']) {
        if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
      }
      return 0;
    });
    const nextLog = new Map();
    const sourceLogs = planned.map(e => {
      const block = byTime.get(e.timestamp);
      const logIndex = nextLog.get(block.blockNumber) ?? 0n;
      nextLog.set(block.blockNumber, logIndex + 1n);
      Object.assign(e.location, { blockNumber: block.blockNumber, blockHash: block.blockHash, logIndex: String(logIndex) });
      return { sourceId: e.sourceId, ...e.details, emissionOrder: String(e.emissionOrder), ...e.location };
    });
    return { blocks, sourceLogs };
  };
  return { event, finalize };
}
export const tuple = item => [item.blockNumber, item.transactionIndex, item.logIndex];
export const proposalTuple = p => [...tuple(p.created), p.proposalId];
export function descending(a, b) {
  for (let i = 0; i < a.length; i++) { const x = BigInt(a[i]); const y = BigInt(b[i]); if (x !== y) return x > y ? -1 : 1; }
  return 0;
}
const cursorFor = (endpoint, filters, last) => Buffer.from(JSON.stringify({ chainId: context.chainId, deploymentId: context.deploymentId, asOfBlock: context.asOfBlock, asOfBlockHash: context.asOfBlockHash, endpoint, filters, limit: 20, order: endpoint === '/api/proposals' ? 'desc:blockNumber,transactionIndex,logIndex,proposalId' : 'desc:blockNumber,transactionIndex,logIndex', last, revision: context.snapshotRevision }), 'utf8').toString('base64url');
const response = data => ({ context: structuredClone(context), data });

export function buildFixtures() {
  const files = new Map();
  const routes = [];
  const scope = { chainId: context.chainId, deploymentId: context.deploymentId };
  const { event, finalize } = timeline();
  const add = (file, body) => { if (files.has(file)) throw new Error(`Duplicate file ${file}`); files.set(file, body); };
  const route = (file, endpoint, query = {}, status = 200, scenario = 'default') => routes.push({ method: 'GET', path: endpoint, query: { ...scope, ...query }, status, file, scenario });
  const paged = (items, endpoint, filters, name, key) => {
    const pages = [];
    const pageCount = Math.max(1, Math.ceil(items.length / 20));
    let incoming = null;
    for (let page = 0; page < pageCount; page++) {
      const data = items.slice(page * 20, (page + 1) * 20);
      const nextCursor = page + 1 < pageCount ? cursorFor(endpoint, filters, key(data.at(-1))) : null;
      const file = pageCount === 1 ? `${name}.json` : `${name}-${page + 1}.json`;
      add(file, { ...response(data), pagination: { limit: 20, totalCount: items.length, nextCursor } });
      const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== null));
      if (incoming) query.cursor = incoming;
      route(file, endpoint, query);
      pages.push(file); incoming = nextCursor;
    }
    return pages;
  };
  const sc01 = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/sc01/disbursement-v1.json'), 'utf8'));
  const proposals = [];
  const votesById = new Map();
  const executionPositions = new Map();
  const cycle = ['Executed', 'Pending', 'Active', 'Succeeded', 'Defeated', 'Queued', 'Canceled'];
  for (let i = 0; i < 45; i++) {
    const n = BigInt(i);
    const state = cycle[i % cycle.length];
    const amount = i === 0 ? sc01.amount : String((20n + n) * UNIT + (i % 3 === 1 ? 125000000000000000n : i % 3 === 2 ? 1n : 0n));
    // Shared requestId deliberately models one successful and one unexecuted request.
    const requestId = i === 0 || i === 1 ? sc01.requestId : i === 2 ? ZERO : hashText(`be01:synthetic:request:${i}`);
    const recipient = i === 0 ? sc01.recipient : `0x${(100n + n).toString(16).padStart(40, '0')}`;
    const content = { version: 1, title: `Budget proposal ${String(i + 1).padStart(2, '0')}`, body: `Synthetic request ${i + 1} funds a DAO activity for frontend development.` };
    const description = i === 0 ? sc01.description : i === 2 ? `{ "body": ${JSON.stringify(content.body)}, "version": 1, "title": ${JSON.stringify(content.title)} }` : JSON.stringify(content);
    const parsed = JSON.parse(description);
    let createdAt = T - 1060n - n;
    if (state === 'Pending') createdAt = i === 1 ? T - 60n : T + n - 60n;
    if (state === 'Canceled') createdAt = T;
    if (state === 'Active') createdAt = i === 2 ? T - 61n : i === 9 ? T - 360n : T - 160n - n;
    if ((state === 'Succeeded' && i === 3) || (state === 'Defeated' && i === 4)) createdAt = T - 361n;
    const snapshot = createdAt + 60n;
    const p = {
      proposalId: '', requestId, proposer: ADDRESSES.voters[i % 4], recipient, amount, description,
      descriptionHash: hashText(description), title: parsed.title, body: parsed.body,
      targets: [ADDRESSES.treasury], values: ['0'], calldatas: [calldata(requestId, recipient, amount)],
      snapshot: String(snapshot), deadline: String(snapshot + 300n), state, stateSource: 'synthetic',
      votes: { against: '0', for: '0', abstain: '0', quorum: snapshot < T ? String(200n * UNIT) : null }, operation: null,
      created: null,
      transactions: { created: txHash(`proposal:${i}:created`), queued: null, executed: null, canceled: null },
    };
    p.proposalId = String(BigInt(proposalHash(p)));
    p.created = event(`proposal:${i}:created`, createdAt, n * 10n, 0n,
      { eventName: 'ProposalCreated', proposalId: p.proposalId, actor: p.proposer });
    const specs = state === 'Pending' || state === 'Canceled' ? [] : state === 'Defeated' ? [[1, 100n], [0, 300n]] : [[1, 400n], [0, 300n], [2, 100n]];
    const votes = specs.map(([support, tokens], v) => {
      const voter = ADDRESSES.voters[tokens === 400n ? 0 : tokens === 300n ? 1 : 3];
      const location = event(`proposal:${i}:vote:${v}`, state === 'Active' ? T : snapshot + 120n,
        n * 10n + BigInt(v) + 1n, 0n, { eventName: 'VoteCast', proposalId: p.proposalId, actor: voter });
      return { proposalId: p.proposalId, voter, support, weight: String(tokens * UNIT),
        reason: ['Fund this DAO activity.', 'Prefer a smaller budget.', 'Participating without a position.'][v], location };
    });
    for (const v of votes) { const key = ['against', 'for', 'abstain'][v.support]; p.votes[key] = String(BigInt(p.votes[key]) + BigInt(v.weight)); }
    votesById.set(p.proposalId, votes);
    if (state === 'Queued' || state === 'Executed') {
      const eta = state === 'Executed' ? T - 300n - n : i === 5 ? T + 1n : i === 12 ? T : i % 2 === 0 ? T - n : T + n;
      const salt = hashText(`be01:synthetic:chosen-operation-salt:${p.proposalId}`);
      p.operation = { operationId: operationHash(p, ZERO, salt), queuedAt: String(eta - 120n), eta: String(eta), status: state === 'Executed' ? 'Done' : eta <= T ? 'Ready' : 'Waiting', predecessor: ZERO, salt };
      p.transactions.queued = txHash(`proposal:${i}:queued`);
      event(`proposal:${i}:queued`, eta - 120n, n * 10n + 4n, 0n,
        { eventName: 'ProposalQueued', proposalId: p.proposalId, actor: p.proposer });
      if (state === 'Executed') {
        p.transactions.executed = txHash(`proposal:${i}:executed`);
        event(`proposal:${i}:executed`, eta + 24n, n * 10n + 5n, 0n,
          { eventName: 'ProposalExecuted', proposalId: p.proposalId, actor: p.proposer });
        executionPositions.set(p.proposalId, { timestamp: eta + 24n, transactionIndex: n * 10n + 5n });
      }
    }
    if (state === 'Canceled') {
      p.transactions.canceled = txHash(`proposal:${i}:canceled`);
      event(`proposal:${i}:canceled`, T, n * 10n + 6n, 0n,
        { eventName: 'ProposalCanceled', proposalId: p.proposalId, actor: p.proposer });
    }
    proposals.push(p);
  }
  const transfers = [];
  const transfer = (data, label, timestamp, txIndex, order = 0n, transactionHash = txHash(label)) => {
    const location = event(label, timestamp, txIndex, order,
      { eventName: 'Transfer', proposalId: data.proposalId, actor: null }, transactionHash);
    transfers.push({ ...data, location });
  };
  for (let i = 0; i < 20; i++) transfer({ token: ADDRESSES.bud, from: ADDRESSES.funder, to: ADDRESSES.treasury,
    amount: String(i === 0 ? 10000n * UNIT : 100n * UNIT + 125000000000000000n), direction: 'in', proposalId: null, requestId: null },
  `funding:${i}`, T - 10000n + BigInt(i), 1000n + BigInt(i));
  for (const p of proposals.filter(p => p.state === 'Executed')) {
    const position = executionPositions.get(p.proposalId);
    transfer({ token: ADDRESSES.bud, from: ADDRESSES.treasury, to: p.recipient, amount: p.amount, direction: 'out',
      proposalId: p.proposalId, requestId: p.requestId }, `payout:${p.proposalId}`, position.timestamp, position.transactionIndex, 1n, p.transactions.executed);
  }
  transfer({ token: ADDRESSES.bud, from: ADDRESSES.funder, to: ADDRESSES.treasury, amount: '0', direction: 'in', proposalId: null, requestId: null }, 'zero-transfer', T - 10n, 3000n);
  transfer({ token: ADDRESSES.bud, from: ADDRESSES.treasury, to: ADDRESSES.treasury, amount: String(UNIT / 2n), direction: 'self', proposalId: null, requestId: null }, 'self-transfer', T - 9n, 3001n);
  const simulation = finalize();
  // Flatten references only after all coordinates have been allocated globally.
  for (const list of [...votesById.values(), transfers]) for (const row of list) {
    Object.assign(row, row.location); delete row.location;
  }
  proposals.sort((a, b) => descending(proposalTuple(a), proposalTuple(b)));
  paged(proposals, '/api/proposals', { state: null, proposalId: null }, 'proposals-page', proposalTuple);
  for (const state of STATES) paged(proposals.filter(p => p.state === state), '/api/proposals', { state, proposalId: null }, `proposals-state-${state}`, proposalTuple);
  paged(proposals.filter(p => p.proposalId === sc01.proposalId), '/api/proposals', { state: null, proposalId: sc01.proposalId }, 'proposals-search-sc01', proposalTuple);
  paged([], '/api/proposals', { state: null, proposalId: String(UINT256_MAX) }, 'proposals-search-unknown', proposalTuple);
  paged([], '/api/proposals', { state: 'Pending', proposalId: sc01.proposalId }, 'proposals-empty', proposalTuple);
  for (const p of proposals) {
    const file = `proposals/${p.proposalId}.json`;
    add(file, response(p)); route(file, `/api/proposals/${p.proposalId}`);
    const votes = votesById.get(p.proposalId).sort((a, b) => descending(tuple(a), tuple(b)));
    paged(votes, `/api/proposals/${p.proposalId}/votes`, {}, `votes/${p.proposalId}`, tuple);
  }
  transfers.sort((a, b) => descending(tuple(a), tuple(b)));
  paged(transfers, '/api/treasury/transfers', { direction: null, proposalId: null }, 'transfers-page', tuple);
  for (const direction of ['in', 'out', 'self']) paged(transfers.filter(t => t.direction === direction), '/api/treasury/transfers', { direction, proposalId: null }, `transfers-direction-${direction}`, tuple);
  paged([], '/api/treasury/transfers', { direction: 'out', proposalId: proposals.find(p => p.state === 'Pending').proposalId }, 'transfers-empty', tuple);
  const totalIn = transfers.filter(t => t.direction === 'in').reduce((sum, t) => sum + BigInt(t.amount), 0n);
  const totalOut = transfers.filter(t => t.direction === 'out').reduce((sum, t) => sum + BigInt(t.amount), 0n);
  const byState = Object.fromEntries(STATES.map(state => [state, proposals.filter(p => p.state === state).length]));
  add('summary.json', response({
    treasury: { address: ADDRESSES.treasury, token: { address: ADDRESSES.bud, symbol: 'BUD', decimals: 18 }, balance: String(totalIn - totalOut), totalIn: String(totalIn), totalOut: String(totalOut) },
    proposalCounts: { total: proposals.length, byState },
    governance: { governor: ADDRESSES.governor, timelock: ADDRESSES.timelock, govToken: { address: ADDRESSES.gov, symbol: 'GOV', decimals: 18 }, clockMode: 'mode=timestamp', proposalThreshold: String(50n * UNIT), votingDelay: '60', votingPeriod: '300', timelockDelay: '120', quorumNumerator: '20', quorumDenominator: '100', totalSupply: String(1000n * UNIT) },
    recentActivity: transfers.slice(0, 5).map(t => ({ type: 'Transfer', ...t })),
  }));
  route('summary.json', '/api/summary');
  add('health-synced.json', response({ status: 'ok', database: 'up', indexer: 'synced' }));
  route('health-synced.json', '/api/health');
  const lag = response({ status: 'degraded', database: 'up', indexer: 'lagging' });
  lag.context.sync = { ...lag.context.sync, status: 'lagging', headBlock: '9038', confirmedBlock: '9036', lagBlocks: '36', lagSeconds: '432' };
  add('health-lagging.json', lag); route('health-lagging.json', '/api/health', {}, 200, 'indexer-lagging');
  const unavailable = response({ status: 'unavailable', database: 'up', indexer: 'not_ready' });
  unavailable.context = { ...unavailable.context, asOfBlock: null, asOfBlockHash: null, asOfTimestamp: null, sync: { ...context.sync, status: 'not_ready', indexedBlock: null, lagBlocks: null, lagSeconds: null, lastIndexedAt: null } };
  add('health-not-ready.json', unavailable); route('health-not-ready.json', '/api/health', {}, 503, 'no-checkpoint');
  const error = (file, status, code, message, details, endpoint, query, scenario, errorContext = context) => {
    add(file, { context: structuredClone(errorContext), error: { code, message, details, retryable: status === 503 || status === 409 } });
    route(file, endpoint, query, status, scenario);
  };
  error('error-invalid-proposal-id.json', 400, 'INVALID_PROPOSAL_ID', 'proposalId must be a canonical uint256 decimal string.', { field: 'id', value: '1e18' }, '/api/proposals/1e18', {}, 'invalid-proposal-id');
  error('error-not-found.json', 404, 'PROPOSAL_NOT_FOUND', 'No proposal matches this ID in this deployment at this snapshot.', { proposalId: String(UINT256_MAX) }, `/api/proposals/${UINT256_MAX}`, {}, 'unknown-id');
  route('error-not-found.json', `/api/proposals/${UINT256_MAX}/votes`, {}, 404, 'unknown-id');
  error('error-data-not-ready.json', 503, 'DATA_NOT_READY', 'No consistent indexed checkpoint is available.', { reason: 'NO_CHECKPOINT' }, '/api/summary', {}, 'no-checkpoint', unavailable.context);
  error('error-invalid-argument.json', 400, 'INVALID_ARGUMENT', 'Unknown proposal state.', { field: 'state', value: 'Failed', allowed: STATES }, '/api/proposals', { state: 'Failed' }, 'invalid-state');
  error('error-invalid-cursor.json', 400, 'INVALID_CURSOR', 'Cursor is malformed, invalid, or expired.', { field: 'cursor' }, '/api/proposals', { cursor: 'invalid!' }, 'invalid-cursor');
  const cursor = files.get('proposals-page-1.json').pagination.nextCursor;
  error('error-cursor-context-mismatch.json', 400, 'CURSOR_CONTEXT_MISMATCH', 'Cursor belongs to different filters or snapshot context.', { field: 'state', expected: null, received: 'Active' }, '/api/proposals', { state: 'Active', cursor }, 'cursor-filter-changed');
  error('error-snapshot-invalidated.json', 409, 'SNAPSHOT_INVALIDATED', 'The cursor snapshot was invalidated by reorg or rebuild; restart pagination.', { restart: true }, '/api/proposals', { cursor }, 'snapshot-reorg-or-rebuild');
  add('simulation.json', { schemaVersion: 1, kind: 'synthetic-be01-timeline-not-chain-evidence',
    context: structuredClone(context), ...simulation });
  add('manifest.json', {
    schemaVersion: 1, kind: 'synthetic-be01-not-chain-evidence', generator: 'node scripts/generate_be01_fixtures.mjs',
    context: structuredClone(context), sc01ProposalId: sc01.proposalId,
    notes: ['All addresses, block/transaction hashes, timestamps, votes and operations are synthetic; no deployment, receipt or RPC was used.', 'Fixture cursors are unsigned base64url JSON for deterministic frontend mocks; a real server must authenticate cursors and validate snapshot availability.', 'States, description v1, requestId strategy and API contracts remain proposed for team review.'],
    metadataFiles: ['simulation.json'], routes,
  });
  return files;
}

export function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function generate() {
  const files = buildFixtures();
  for (const [file, body] of files) {
    const target = path.join(FIXTURE_DIR, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, serialize(body));
  }
  console.log(`BE01 generated ${files.size} deterministic JSON files; 45 proposals, pages 20/20/5. Synthetic only.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) generate();
