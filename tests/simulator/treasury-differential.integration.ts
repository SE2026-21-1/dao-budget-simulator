import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AbiCoder } from 'ethers';
import { simulateBudget } from '../../simulator/engine.js';
import type { TreasuryScenario } from '../../simulator/types.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['SuccessAndExactBalance', 'InsufficientFunds', 'SharedRequestAndReplay', 'FundingAndRetry',
  'LargeFirst', 'SmallFirst', 'FailedSharedRequestCanStillBePaid', 'ZeroIdAndExistingPaidState'];
const schema = ['address', 'uint256', 'tuple(bytes32 id,address recipient,uint256 amount)[]',
  'tuple(uint8 kind,uint256 proposalIndex,uint256 amount)[]', 'bool[]', 'tuple(bool success,uint256 balance,bool[] paid)[]'];
interface ForgeResult { status: string; decoded_logs: string[] }

/** Actual production Treasury bytecode runs in Forge's isolated VM, never via a broadcast. */
test('off-chain results match real Treasury transitions in Foundry', async t => {
  const { stdout } = await promisify(execFile)('forge', ['test', '--match-path', 'tests/simulator/TreasuryDifferential.t.sol', '-vv', '--json'],
    { cwd: root, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  const suites = JSON.parse(stdout) as Record<string, { test_results: Record<string, ForgeResult> }>;
  const suitesList = Object.values(suites);
  assert.equal(suitesList.length, 1, 'Must run exactly the differential harness');
  const results = suitesList[0]!.test_results;
  assert.deepEqual(Object.keys(results).sort(), names.map(n => `testDifferential${n}()`).sort());
  for (const name of names) await t.test(name, () => {
    const observed = results[`testDifferential${name}()`]!;
    assert.equal(observed.status, 'Success');
    const lines = observed.decoded_logs.filter(log => log.startsWith('WHAT_IF_TREASURY: '));
    assert.equal(lines.length, 1, 'Exactly one EVM observation per campaign');
    const decoded = AbiCoder.defaultAbiCoder().decode(schema, lines[0]!.slice('WHAT_IF_TREASURY: '.length));
    const treasuryAddress = decoded[0] as string, initialBalance = decoded[1] as bigint;
    const requests = decoded[2] as readonly { id: string; recipient: string; amount: bigint }[];
    const steps = decoded[3] as readonly { kind: bigint; proposalIndex: bigint; amount: bigint }[];
    const initialPaid = decoded[4] as readonly boolean[];
    const observations = decoded[5] as readonly { success: boolean; balance: bigint; paid: readonly boolean[] }[];
    const scenario: TreasuryScenario = { treasuryAddress, initialBalance,
      initialPaidRequestIds: [...new Set(requests.filter((_, i) => initialPaid[i]).map(r => r.id))],
      proposals: requests.map((r, i) => ({ proposalId: `p${i}`, executionAllowed: true,
        request: { requestId: r.id, recipient: r.recipient, amount: r.amount } })),
      steps: steps.map(step => step.kind === 1n ? { kind: 'top-up', amount: step.amount }
        : { kind: 'execute', proposalId: `p${step.proposalIndex}` }) };
    const simulated = simulateBudget(scenario);
    assert.equal(observations.length, simulated.trace.length);
    const paid = new Set(scenario.initialPaidRequestIds);
    for (const [i, trace] of simulated.trace.entries()) {
      const actual = observations[i]!;
      assert.equal(actual.success, trace.outcome === 'executed' || trace.outcome === 'applied', `${name} step ${i}: success`);
      assert.equal(actual.balance, trace.balanceAfter, `${name} step ${i}: Treasury BUD balance`);
      if (trace.kind === 'execute' && trace.outcome === 'executed') paid.add(trace.requestId);
      assert.deepEqual([...actual.paid], requests.map(r => paid.has(r.id)), `${name} step ${i}: paidRequests`);
    }
    assert.equal(simulated.finalBalance, observations.at(-1)!.balance);
    assert.deepEqual(simulated.paidRequestIds, [...paid]);
  });
});
