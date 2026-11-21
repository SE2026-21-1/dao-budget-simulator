import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, UINT256_MAX } from '../../indexer/config.js';
import { configInput } from './helpers.js';

test('config preserves bigint, validates scope and permits a pinned latest request', () => {
  const input = { ...configInput(), chainId: UINT256_MAX.toString(), fromBlock: '9007199254740993', toBlock: 'latest' };
  const config = parseConfig(input, { RPC_URL: 'https://example.invalid/secret' });
  assert.equal(config.chainId, UINT256_MAX);
  assert.equal(config.fromBlock, 9007199254740993n);
  assert.equal(config.toBlock, 'latest');
  assert.equal(config.rpcUrl, 'https://example.invalid/secret');
});

for (const [name, patch] of Object.entries({
  numericChainId: { chainId: 31337 }, zeroChain: { chainId: '0' }, overflow: { chainId: (UINT256_MAX + 1n).toString() },
  fractionalBlock: { fromBlock: '1.2' }, negativeBlock: { fromBlock: '-1' }, reversedRange: { toBlock: '99' },
  zeroBatch: { batchSize: '0' }, unboundedBatch: { batchSize: '10001' }, invalidRpc: { rpcUrl: 'file:///secret' },
  deploymentOverflow: { deploymentId: (1n << 63n).toString() }, emptyContracts: { contracts: [] },
})) test(`reject invalid config: ${name}`, () => { assert.throws(() => parseConfig({ ...configInput(), ...patch }, {})); });

test('reject invalid, zero or duplicate addresses, duplicate roles and unsupported ABI', () => {
  const input = configInput();
  for (const patch of [{ address: '0x12' }, { address: '0x' + '0'.repeat(40) }, { deploymentBlock: 'NaN' },
    { role: 'unrecognized' }, { abiVersion: 'wrong-version' }, { abiVersion: 'oz-5.4.0-governor' }]) {
    assert.throws(() => parseConfig({ ...input, contracts: [{ ...input.contracts[0], ...patch }] }, {}));
  }
  assert.throws(() => parseConfig({ ...input, contracts: [input.contracts[0], input.contracts[0]] }, {}));
  assert.throws(() => parseConfig({ ...input, contracts: [input.contracts[0], { ...input.contracts[0], role: 'treasury', abiVersion: 'sc01-itreasury-v1' }] }, {}));
});
