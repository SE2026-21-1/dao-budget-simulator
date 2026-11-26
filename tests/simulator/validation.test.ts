import assert from 'node:assert/strict';
import test from 'node:test';
import { ScenarioValidationError, LIMITS, UINT256_MAX, validateScenario } from '../../simulator/validation.js';
import { id, proposal, scenario, treasury } from './helpers.js';

const rejects = (input: unknown, code: string) => assert.throws(() => validateScenario(input),
  (error: unknown) => error instanceof ScenarioValidationError && error.code === code);

for (const value of [-1n, 0n, UINT256_MAX + 1n, 1, 0.1, '1', null, undefined]) {
  test(`reject amount ${String(value)} (${typeof value})`, () => {
    rejects(scenario({ proposals: [{ ...proposal(), request: { ...proposal().request, amount: value } }] as never }), 'INVALID_UINT256');
  });
}
for (const value of [-1n, UINT256_MAX + 1n, 1, '100', NaN, Infinity, null]) {
  test(`reject initial balance ${String(value)}`, () => rejects(scenario({ initialBalance: value as bigint }), 'INVALID_UINT256'));
}
for (const value of ['0x' + '0'.repeat(40), treasury, 'alice.eth', '0x1234', '0x' + 'g'.repeat(40), '0x5A384227B65FA093DEC03Ec34e111Db80A0406153']) {
  test(`reject recipient ${value}`, () => rejects(scenario({ proposals: [{ ...proposal(), request: { ...proposal().request, recipient: value } }] }), 'INVALID_ADDRESS'));
}
for (const value of ['', '0x01', '0x' + 'g'.repeat(64), 5, null]) {
  test(`reject request ID ${String(value)}`, () => rejects(scenario({ proposals: [proposal('p1', 1n, value as string)] }), 'INVALID_REQUEST_ID'));
}
test('accept uint256 limits, normalize hex case, preserve zero requestId and opaque proposal IDs', () => {
  const s = validateScenario(scenario({ initialBalance: UINT256_MAX, proposals: [proposal('đề xuất', UINT256_MAX, id(0n))], steps: [] }));
  assert.equal(s.initialBalance, UINT256_MAX);
  assert.equal(s.proposals[0]!.request.requestId, id(0n));
  assert.equal(s.proposals[0]!.proposalId, 'đề xuất');
  assert.equal(validateScenario(scenario({ initialBalance: 0n })).initialBalance, 0n);
  const normalized = validateScenario(scenario({ proposals: [proposal('p1', 1n, '0x' + 'AB'.repeat(32))] }));
  assert.equal(normalized.proposals[0]!.request.requestId, '0x' + 'ab'.repeat(32));
});
test('duplicate request IDs across proposals are valid scenario inputs', () => {
  assert.equal(validateScenario(scenario({ proposals: [proposal(), proposal('p2')] })).proposals.length, 2);
});
test('duplicate proposal IDs and case-insensitive initial paid IDs are rejected', () => {
  rejects(scenario({ proposals: [proposal(), proposal()] }), 'DUPLICATE_PROPOSAL_ID');
  rejects(scenario({ initialPaidRequestIds: ['0x' + 'ab'.repeat(32), '0x' + 'AB'.repeat(32)] }), 'DUPLICATE_PAID_REQUEST_ID');
});
test('eligibility must be explicit and boolean', () => {
  rejects(scenario({ proposals: [{ ...proposal(), executionAllowed: undefined } as never] }), 'INVALID_SHAPE');
});
for (const steps of [[{ kind: 'execute', proposalId: 'absent' }], [{ kind: 'unknown' }], [null], new Array(1)]) {
  test(`reject invalid steps ${JSON.stringify(steps)}`, () => rejects(scenario({ steps: steps as never }), steps[0]?.kind === 'execute' ? 'UNKNOWN_PROPOSAL' : 'INVALID_SHAPE'));
}
test('structural input validation rejects batches, unknown fields and sparse proposals', () => {
  for (const input of [null, [], { ...scenario(), actions: [] }, scenario({ proposals: new Array(1) }),
    scenario({ proposals: [{ ...proposal(), request: [proposal().request] } as never] })]) rejects(input, 'INVALID_SHAPE');
  rejects(scenario({ treasuryAddress: '0x' + '0'.repeat(40) }), 'INVALID_ADDRESS');
  rejects({}, 'INVALID_ADDRESS');
  rejects(scenario({ proposals: [proposal(' p1 ')] }), 'INVALID_PROPOSAL_ID');
});
test('bounded inputs fail before iterating unbounded work', () => {
  rejects(scenario({ proposals: new Array(LIMITS.proposals + 1) }), 'LIMIT_EXCEEDED');
  rejects(scenario({ steps: new Array(LIMITS.steps + 1) }), 'LIMIT_EXCEEDED');
  rejects(scenario({ initialPaidRequestIds: new Array(LIMITS.paidRequests + 1) }), 'LIMIT_EXCEEDED');
});
test('validation returns an independent copy without changing input', () => {
  const input = scenario(), before = structuredClone(input), output = validateScenario(input);
  assert.deepEqual(input, before);
  assert.notEqual(output.proposals[0]!.request, input.proposals[0]!.request);
  assert.notEqual(output.steps, input.steps);
});

test('explicit null is not an omitted initial paid-request list', () => {
  rejects(scenario({ initialPaidRequestIds: null as never }), 'INVALID_SHAPE');
});
