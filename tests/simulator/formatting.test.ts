import assert from 'node:assert/strict';
import test from 'node:test';
import { compareExecutionOrders, formatBUD, MAX_SCENARIO_JSON_LENGTH, parseBaseUnits, parseBUD,
  parseScenarioJSON, simulateBudget, stringifySimulation, UINT256_MAX } from '../../simulator/index.js';
import { id, proposal, scenario, treasury } from './helpers.js';

for (const [display, raw] of [['0', 0n], ['1', 10n ** 18n], ['0.000000000000000001', 1n],
  ['123456789.123456789012345678', 123456789123456789012345678n]] as const) {
  test(`lossless BUD conversion ${display}`, () => {
    assert.equal(parseBUD(display), raw);
    assert.equal(formatBUD(raw), display);
  });
}
test('maximum uint256 roundtrips without Number conversions', () => {
  assert.equal(parseBUD(formatBUD(UINT256_MAX)), UINT256_MAX);
  assert.equal(parseBaseUnits(UINT256_MAX.toString()), UINT256_MAX);
});
for (const value of ['-1', '+1', '01', '1e18', '1,000', ' 1', '1 ', '.1', '1.', '0.0000000000000000001', 'NaN', 'Infinity', '']) {
  test(`reject non-exact BUD input ${JSON.stringify(value)}`, () => assert.throws(() => parseBUD(value), /INVALID_UINT256/));
}
test('reject values beyond uint256, numeric wire amounts and noncanonical integer strings', () => {
  for (const value of [0, 1n, '01', '-1', '1.0', '1e18', '0x10', (UINT256_MAX + 1n).toString(), '9'.repeat(1000)]) {
    assert.throws(() => parseBaseUnits(value), /INVALID_UINT256/);
  }
  assert.throws(() => parseBUD(UINT256_MAX.toString()), /INVALID_UINT256/);
  assert.throws(() => formatBUD(-1n), /INVALID_UINT256/);
});
test('scenario JSON roundtrips bigint amounts and top-ups through public exports', () => {
  const input = scenario({ steps: [{ kind: 'top-up', amount: 3n }, { kind: 'execute', proposalId: 'p1' }] });
  const text = stringifySimulation(input);
  assert.equal(JSON.parse(text).initialBalance, '100');
  assert.equal(JSON.parse(text).steps[0].amount, '3');
  assert.deepEqual(simulateBudget(parseScenarioJSON(text)), simulateBudget(input));
  const output = JSON.parse(stringifySimulation(simulateBudget(input)));
  assert.equal(output.kind, 'hypothetical-budget-result-v1');
  assert.equal(output.finalBalance, '93');
  assert.equal(output.trace[1].amount, '10');
});
test('signed comparison deltas serialize as integer strings', () => {
  const result = compareExecutionOrders({ treasuryAddress: treasury, initialBalance: 10n,
    proposals: [proposal('large', 8n), proposal('small', 4n, id(2n))] },
  [{ name: 'large-first', proposalIds: ['large', 'small'] }, { name: 'small-first', proposalIds: ['small', 'large'] }]);
  assert.equal(JSON.parse(stringifySimulation(result)).differences[0].totalDisbursedDelta, '-4');
});
test('wire parser rejects malformed, excessive, missing, numeric or fractional amounts', () => {
  assert.throws(() => parseScenarioJSON('{'), /INVALID_JSON/);
  assert.throws(() => parseScenarioJSON(' '.repeat(MAX_SCENARIO_JSON_LENGTH + 1)), /LIMIT_EXCEEDED/);
  assert.throws(() => parseScenarioJSON('null'), /INVALID_SHAPE/);
  for (const amount of [1, '1.1', null]) {
    const wire = JSON.parse(stringifySimulation(scenario()));
    wire.proposals[0].request.amount = amount;
    assert.throws(() => parseScenarioJSON(JSON.stringify(wire)), /INVALID_UINT256/);
  }
  const missing = JSON.parse(stringifySimulation(scenario()));
  delete missing.initialBalance;
  assert.throws(() => parseScenarioJSON(JSON.stringify(missing)), /INVALID_UINT256/);
});
