import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Interface } from 'ethers';
import { ABI_REGISTRY, getAbi, validateAbi } from '../../indexer/abi-registry.js';
import { decodeLog } from '../../indexer/decoder.js';
import type { ContractConfig, ContractRole, JsonObject, NormalizedLog } from '../../indexer/types.js';

interface Fixture {
  role: ContractRole;
  abiVersion: string;
  eventName: string;
  expectedPayload: JsonObject;
  rawLog: JsonObject & {
    address: string;
    blockNumber: string;
    blockHash: string;
    transactionHash: string;
    transactionIndex: string;
    logIndex: string;
    topics: string[];
    data: string;
  };
}

const fixtureFile = JSON.parse(readFileSync(new URL('../../fixtures/be02/events.json', import.meta.url), 'utf8')) as { synthetic: boolean; events: Fixture[] };
const vectors = fixtureFile.events;
const independent = JSON.parse(readFileSync(new URL('../../fixtures/be02/independent-transfer.json', import.meta.url), 'utf8')) as Fixture & { synthetic: boolean };

function normalize(fixture: Fixture): NormalizedLog {
  const rawLog = structuredClone(fixture.rawLog);
  return {
    contract: { role: fixture.role, abiVersion: fixture.abiVersion, address: rawLog.address, deploymentBlock: 100n },
    blockNumber: BigInt(rawLog.blockNumber), blockHash: rawLog.blockHash,
    transactionHash: rawLog.transactionHash, transactionIndex: BigInt(rawLog.transactionIndex),
    logIndex: BigInt(rawLog.logIndex), topics: rawLog.topics.slice(), data: rawLog.data,
    rawLog,
  };
}

function vector(eventName: string): Fixture {
  const found = vectors.find((candidate) => candidate.eventName === eventName);
  assert.ok(found, `Missing ${eventName} fixture`);
  return found;
}

function expectDecodeError(log: NormalizedLog): void {
  const result = decodeLog(log);
  assert.equal(result.status, 'decode_error');
  assert.equal(result.code, 'DECODE_ERROR');
  assert.ok(result.message.length > 0);
  assert.equal(result.abiVersion, log.contract.abiVersion);
}

test('synthetic vectors cover all eleven required event types and source indexed layouts', () => {
  assert.equal(fixtureFile.synthetic, true);
  const indexedCounts: Record<string, number> = {
    ProposalCreated: 0, VoteCast: 1, ProposalQueued: 0, ProposalExecuted: 0, ProposalCanceled: 0,
    CallScheduled: 2, CallExecuted: 2, Cancelled: 1, CallSalt: 1, BudgetDisbursed: 2, Transfer: 2,
  };
  assert.deepEqual(vectors.map((fixture) => fixture.eventName).sort(), Object.keys(indexedCounts).sort());
  for (const fixture of vectors) assert.equal(fixture.rawLog.topics.length, 1 + indexedCounts[fixture.eventName]!);
});

for (const fixture of vectors) {
  test(`decodes ${fixture.role}.${fixture.eventName} with exact named ABI values`, () => {
    const log = normalize(fixture);
    const result = decodeLog(log);
    assert.deepEqual(result, { status: 'decoded', eventName: fixture.eventName, payload: fixture.expectedPayload, abiVersion: fixture.abiVersion });
    assert.doesNotThrow(() => JSON.stringify(result));
  });
}

test('independent hand-assembled canonical Transfer vector decodes without fixture encoder', () => {
  assert.equal(independent.synthetic, true);
  assert.equal(independent.rawLog.topics[0], '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
  const result = decodeLog(normalize(independent));
  assert.deepEqual(result, {
    status: 'decoded', eventName: 'Transfer', abiVersion: independent.abiVersion,
    payload: { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', value: '1000000000000000000' },
  });
});

test('preserves uint256 above 2^53 including indexed integers and maximum proposal ID', () => {
  const proposal = decodeLog(normalize(vector('ProposalCreated')));
  const scheduled = decodeLog(normalize(vector('CallScheduled')));
  assert.equal(proposal.status, 'decoded');
  assert.equal(scheduled.status, 'decoded');
  if (proposal.status !== 'decoded' || scheduled.status !== 'decoded') return;
  assert.equal(proposal.payload.proposalId, (2n ** 256n - 1n).toString());
  assert.deepEqual(proposal.payload.values, ['0', (2n ** 255n + 123456789n).toString()]);
  assert.equal(scheduled.payload.index, (2n ** 255n + 123456789n).toString());
  assert.equal(scheduled.payload.value, scheduled.payload.index);
});

test('dynamic description and reason preserve exact Unicode and whitespace', () => {
  const fixture = vector('ProposalCreated');
  const result = decodeLog(normalize(fixture));
  assert.equal(result.status, 'decoded');
  if (result.status === 'decoded') {
    assert.equal(result.payload.description, '{ "version": 1, "title": "Synthetic BE02", "body": "Ngân sách thử nghiệm 🚀" }');
    assert.deepEqual(result.payload.signatures, ['', 'disburse(bytes32,address,uint256)']);
    assert.deepEqual(result.payload.calldatas, ['0x1234abcd', '0x']);
    assert.deepEqual(result.payload.targets, ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', '0x1234567890abcdef1234567890abcdef12345678']);
  }
});

test('registry Treasury fragment matches handed-over shared JSON ABI exactly', () => {
  const abi = JSON.parse(readFileSync(new URL('../../shared/abi/ITreasury.json', import.meta.url), 'utf8'));
  const expected = new Interface(abi).getEvent('BudgetDisbursed')!;
  const actual = ABI_REGISTRY['sc01-itreasury-v1']!.interface.getEvent('BudgetDisbursed')!;
  assert.equal(actual.format('full'), expected.format('full'));
  for (const registration of Object.values(ABI_REGISTRY)) {
    assert.equal(registration.integrationStatus, 'awaiting-sc06');
    assert.ok(registration.source.length > 0);
  }
});

test('ABI version is explicitly bound to contract role and cannot use object prototype keys', () => {
  const contract: ContractConfig = normalize(vector('Transfer')).contract;
  assert.doesNotThrow(() => validateAbi(contract));
  assert.equal(getAbi(contract).role, 'budget_token');
  for (const abiVersion of ['oz-4.9.0-erc20', 'toString', '__proto__']) {
    assert.throws(() => validateAbi({ ...contract, abiVersion }), /Unsupported ABI version/);
    expectDecodeError({ ...normalize(vector('Transfer')), contract: { ...contract, abiVersion } });
  }
  assert.throws(() => validateAbi({ ...contract, role: 'treasury' }), /Unsupported ABI version/);
  expectDecodeError({ ...normalize(vector('Transfer')), contract: { ...contract, role: 'treasury' } });
});

test('unsupported topic and a supported ABI for the wrong event return UNKNOWN_TOPIC', () => {
  const log = normalize(vector('Transfer'));
  log.topics[0] = `0x${'00'.repeat(32)}`;
  const result = decodeLog(log);
  assert.equal(result.status, 'unknown_topic');
  if (result.status === 'unknown_topic') assert.equal(result.code, 'UNKNOWN_TOPIC');
  const wrongAbi = normalize(vector('Transfer'));
  wrongAbi.contract = { ...wrongAbi.contract, role: 'treasury', abiVersion: 'sc01-itreasury-v1' };
  assert.equal(decodeLog(wrongAbi).status, 'unknown_topic');
});

test('known events reject missing, additional and malformed indexed topics', () => {
  for (const topics of [[], ['0x1234'], normalize(vector('Transfer')).topics.slice(0, 2), [...normalize(vector('Transfer')).topics, `0x${'00'.repeat(32)}`]]) {
    expectDecodeError({ ...normalize(vector('Transfer')), topics });
  }
  const highAddressBits = normalize(vector('Transfer'));
  highAddressBits.topics[1] = `0x01${highAddressBits.topics[1]!.slice(4)}`;
  expectDecodeError(highAddressBits);
});

test('known events reject truncated, odd, nonhex and trailing data', () => {
  const log = normalize(vector('Transfer'));
  for (const data of ['0x', '0x0', '0xzz', `${log.data}00`]) expectDecodeError({ ...log, data });
  const vote = normalize(vector('VoteCast'));
  expectDecodeError({ ...vote, data: vote.data.slice(0, -64) });
  const call = normalize(vector('CallScheduled'));
  expectDecodeError({ ...call, data: call.data.slice(0, -64) });
});

test('known events reject noncanonical uint8 and invalid dynamic offsets', () => {
  const vote = normalize(vector('VoteCast'));
  // The second unindexed word is uint8 support: 256 is not a valid uint8.
  vote.data = `${vote.data.slice(0, 66)}${'100'.padStart(64, '0')}${vote.data.slice(130)}`;
  expectDecodeError(vote);
  const proposal = normalize(vector('ProposalCreated'));
  // The third word is the address[] offset; point beyond the supplied payload.
  proposal.data = `${proposal.data.slice(0, 130)}${'ff'.repeat(32)}${proposal.data.slice(194)}`;
  expectDecodeError(proposal);
});

test('NUL in valid Solidity description or reason is raw-only for JSONB storage', () => {
  for (const eventName of ['ProposalCreated', 'VoteCast']) {
    const fixture = vector(eventName);
    const log = normalize(fixture);
    const expected = { ...fixture.expectedPayload };
    const field = eventName === 'ProposalCreated' ? 'description' : 'reason';
    expected[field] = 'synthetic\0text';
    const encoded = getAbi(log.contract).interface.encodeEventLog(eventName, Object.values(expected));
    log.data = encoded.data;
    log.rawLog.data = encoded.data;
    const original = structuredClone(log);
    const result = decodeLog(log);
    assert.equal(result.status, 'decode_error');
    assert.equal(result.code, 'DECODE_ERROR');
    assert.match(result.message, /NUL character unsupported by PostgreSQL JSONB/);
    assert.doesNotMatch(result.message, /synthetic/);
    assert.deepEqual(log, original);
  }
});

test('invalid UTF-8 in a dynamic Solidity string produces a raw-only decode error', () => {
  const log = normalize(vector('VoteCast'));
  // VoteCast has four non-indexed head words; the string tail starts with
  // its length word, followed by text. 0xff cannot begin valid UTF-8.
  log.data = `${log.data.slice(0, 322)}ff${log.data.slice(324)}`;
  log.rawLog.data = log.data;
  const original = structuredClone(log);
  expectDecodeError(log);
  assert.deepEqual(log, original);
});

test('decoded, unknown and malformed logs retain every original RPC field', () => {
  for (const status of ['decoded', 'unknown_topic', 'decode_error'] as const) {
    const log = normalize(vector('Transfer'));
    log.rawLog.providerExtra = { observedBy: 'synthetic-test', nested: ['preserve', 'verbatim'] };
    if (status === 'unknown_topic') log.topics[0] = `0x${'00'.repeat(32)}`;
    if (status === 'decode_error') log.data = '0x';
    const original = structuredClone(log);
    Object.freeze(log.rawLog);
    Object.freeze(log.topics);
    Object.freeze(log);
    assert.equal(decodeLog(log).status, status);
    assert.deepEqual(log, original);
  }
});
