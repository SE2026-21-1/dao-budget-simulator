import assert from 'node:assert/strict';
import { AbiCoder, ZeroAddress, ZeroHash, keccak256 } from 'ethers';

const coder = AbiCoder.defaultAbiCoder();
const lower = value => value.toLowerCase();
const eventNames = ['CallScheduled', 'CallSalt', 'Cancelled', 'CallExecuted'];
const coordinate = log => [BigInt(log.blockNumber), BigInt(log.transactionIndex), BigInt(log.logIndex)];
function compareLogs(a, b) {
  const left = coordinate(a), right = coordinate(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}
function fingerprint(log) {
  assert.equal(log.removed, false, 'Removed Timelock operation log');
  return [lower(log.address), ...coordinate(log).map(String), lower(log.blockHash), lower(log.transactionHash),
    log.topics.map(lower), lower(log.data)];
}

/** Audit successful operations at one H. No bootstrap operation is accepted, even if canceled or Done. */
export async function auditTimelockOperations(rpc, manifest, { interfaces, height, blockHash, bootstrapThrough, receiptLogs, headers }) {
  assert.ok(Array.isArray(receiptLogs) && headers instanceof Map, 'Complete canonical receipt/header evidence is required');
  const timelock = manifest.contracts.Timelock.address;
  const governor = manifest.contracts.Governor.address;
  const treasury = manifest.contracts.Treasury.address;
  const topics = new Set(eventNames.map(name => interfaces.Timelock.getEvent(name).topicHash));
  const expected = receiptLogs.filter(log => lower(log.address) === lower(timelock) && topics.has(log.topics[0]));
  const logs = await rpc('eth_getLogs', [{ address: timelock, fromBlock: `0x${BigInt(manifest.contracts.Timelock.deploymentBlock).toString(16)}`,
    toBlock: height, topics: [[...topics]] }]);
  assert.ok(Array.isArray(logs), 'Missing Timelock operation history');
  logs.sort(compareLogs);
  assert.deepEqual(logs.map(fingerprint), expected.map(fingerprint), 'Incomplete or contradictory Timelock operation evidence');
  const at = headers.get(BigInt(height).toString());
  assert.equal(at?.hash, blockHash, 'Operation audit H/hash differs from canonical receipt history');
  const records = new Map();
  const actions = new Map();
  const saltFor = descriptionHash => `0x${(BigInt(`${governor}${'0'.repeat(24)}`) ^ BigInt(descriptionHash)).toString(16).padStart(64, '0')}`;
  async function action(log, method) {
    const cacheKey = `${log.transactionHash}:${method}`;
    if (actions.has(cacheKey)) return actions.get(cacheKey);
    const transaction = await rpc('eth_getTransactionByHash', [log.transactionHash]);
    assert.ok(transaction?.to && lower(transaction.to) === lower(governor), 'Timelock operation did not originate from a direct Governor transaction');
    assert.equal(lower(transaction.hash), lower(log.transactionHash), 'Wrong operation transaction identity');
    assert.equal(transaction.blockHash, log.blockHash, 'Operation transaction is not canonical');
    assert.equal(BigInt(transaction.blockNumber), BigInt(log.blockNumber), 'Wrong operation transaction block');
    assert.equal(BigInt(transaction.transactionIndex), BigInt(log.transactionIndex), 'Wrong operation transaction index');
    assert.equal(BigInt(transaction.value), 0n, 'Unexpected native value in Governor operation');
    const parsed = interfaces.Governor.parseTransaction({ data: transaction.input, value: transaction.value });
    assert.equal(parsed?.name, method, `Expected Governor.${method} operation transaction`);
    assert.equal(lower(interfaces.Governor.encodeFunctionData(parsed.fragment, parsed.args)), lower(transaction.input), 'Noncanonical Governor operation calldata');
    const [targets, values, calldatas, descriptionHash] = parsed.args;
    assert.equal(targets.length, 1, 'Operation must contain exactly one Treasury action');
    assert.equal(values.length, 1, 'Operation native values length differs');
    assert.equal(calldatas.length, 1, 'Operation payload count differs');
    assert.equal(lower(targets[0]), lower(treasury), 'Operation target is not the configured Treasury');
    assert.equal(values[0], 0n, 'Treasury operation carries native value');
    const payment = interfaces.Treasury.decodeFunctionData('disburse', calldatas[0]);
    assert.equal(lower(interfaces.Treasury.encodeFunctionData('disburse', payment)), lower(calldatas[0]), 'Noncanonical disbursement payload');
    assert.ok(payment[2] > 0n && lower(payment[1]) !== lower(ZeroAddress) && lower(payment[1]) !== lower(treasury), 'Invalid disbursement amount/recipient');
    const salt = saltFor(descriptionHash);
    const id = keccak256(coder.encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'], [targets, values, calldatas, ZeroHash, salt]));
    const proposalId = BigInt(keccak256(coder.encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32'], [targets, values, calldatas, descriptionHash]))).toString();
    const result = { id, proposalId, target: lower(targets[0]), value: values[0], data: lower(calldatas[0]), salt,
      requestId: payment[0], recipient: lower(payment[1]), amount: payment[2].toString() };
    actions.set(cacheKey, result);
    return result;
  }
  function governorEvent(log, name, proposalId) {
    const topic = interfaces.Governor.getEvent(name).topicHash;
    const matches = receiptLogs.filter(item => item.transactionHash === log.transactionHash && lower(item.address) === lower(governor) && item.topics[0] === topic);
    assert.equal(matches.length, 1, `Missing/ambiguous ${name} receipt evidence`);
    const parsed = interfaces.Governor.parseLog(matches[0]);
    assert.equal(parsed.args.proposalId.toString(), proposalId, `${name} does not match the operation proposal`);
    return parsed;
  }
  for (const log of logs) {
    const event = interfaces.Timelock.parseLog(log);
    assert.ok(event, 'Undecodable Timelock operation log');
    const encoded = interfaces.Timelock.encodeEventLog(event.fragment, event.args);
    assert.deepEqual(log.topics, encoded.topics, 'Noncanonical Timelock operation topics');
    assert.equal(lower(log.data), lower(encoded.data), 'Noncanonical Timelock operation data');
    assert.ok(BigInt(log.blockNumber) > BigInt(bootstrapThrough), `Bootstrap operation detected: ${event.name}; do not renounce or fund`);
    const id = lower(event.args.id);
    let record = records.get(id);
    if (event.name === 'CallScheduled') {
      const queued = await action(log, 'queue');
      assert.equal(id, lower(queued.id), 'Scheduled batch operationId differs from Governor payload/salt');
      assert.equal(event.args.index, 0n, 'Unexpected batch action index');
      assert.equal(lower(event.args.target), queued.target, 'Scheduled target differs');
      assert.equal(event.args.value, queued.value, 'Scheduled native value differs');
      assert.equal(lower(event.args.data), queued.data, 'Scheduled data differs');
      assert.equal(event.args.predecessor, ZeroHash, 'Unexpected operation predecessor');
      assert.equal(event.args.delay.toString(), manifest.config.minDelay, 'Scheduled delay differs from the locked minDelay');
      assert.ok(!record || (!record.pending && !record.done), 'Operation rescheduled without cancellation');
      const timestamp = BigInt(headers.get(BigInt(log.blockNumber).toString()).timestamp);
      const eta = timestamp + event.args.delay;
      const proposal = governorEvent(log, 'ProposalQueued', queued.proposalId);
      assert.equal(proposal.args.etaSeconds, eta, 'Proposal ETA differs from Timelock schedule');
      record = { ...queued, id, pending: true, done: false, saltSeen: false, eta,
        schedules: (record?.schedules ?? 0) + 1, queueTransaction: log.transactionHash, queueBlock: BigInt(log.blockNumber).toString() };
      records.set(id, record);
    } else if (event.name === 'CallSalt') {
      assert.ok(record?.pending && record.queueTransaction === log.transactionHash && !record.saltSeen, 'CallSalt lacks its unique schedule');
      assert.equal(event.args.salt, record.salt, 'Operation salt differs from the Governor address XOR descriptionHash');
      record.saltSeen = true;
    } else if (event.name === 'Cancelled') {
      assert.ok(record?.pending && !record.done, 'Cancellation lacks a pending schedule');
      const canceled = await action(log, 'cancel');
      assert.equal(lower(canceled.id), id, 'Canceled operation differs from Governor cancellation payload');
      governorEvent(log, 'ProposalCanceled', record.proposalId);
      record.pending = false;
      record.canceledTransaction = log.transactionHash;
    } else {
      assert.ok(record?.pending && !record.done, 'Execution lacks a pending schedule');
      const executed = await action(log, 'execute');
      assert.equal(lower(executed.id), id, 'Executed operation differs from Governor payload/salt');
      assert.equal(event.args.index, 0n, 'Unexpected execution index');
      assert.equal(lower(event.args.target), record.target, 'Executed target differs');
      assert.equal(event.args.value, record.value, 'Executed native value differs');
      assert.equal(lower(event.args.data), record.data, 'Executed payload differs');
      assert.ok(BigInt(headers.get(BigInt(log.blockNumber).toString()).timestamp) >= record.eta, 'Operation executed before ETA');
      governorEvent(log, 'ProposalExecuted', record.proposalId);
      record.pending = false;
      record.done = true;
      record.executionTransaction = log.transactionHash;
    }
  }
  const operations = [];
  for (const record of records.values()) {
    assert.ok(record.salt === ZeroHash || record.saltSeen, 'Scheduled operation is missing CallSalt evidence');
    const timestampData = await rpc('eth_call', [{ to: timelock, data: interfaces.Timelock.encodeFunctionData('getTimestamp', [record.id]) }, height]);
    const timestamp = interfaces.Timelock.decodeFunctionResult('getTimestamp', timestampData)[0];
    const stateData = await rpc('eth_call', [{ to: timelock, data: interfaces.Timelock.encodeFunctionData('getOperationState', [record.id]) }, height]);
    const state = interfaces.Timelock.decodeFunctionResult('getOperationState', stateData)[0];
    const expectedTimestamp = record.done ? 1n : record.pending ? record.eta : 0n;
    const expectedState = record.done ? 3n : !record.pending ? 0n : BigInt(at.timestamp) >= record.eta ? 2n : 1n;
    assert.equal(timestamp, expectedTimestamp, 'Timelock timestamp differs from complete operation history');
    assert.equal(state, expectedState, 'Timelock state differs from complete operation history');
    operations.push({ operationId: record.id, proposalId: record.proposalId, requestId: record.requestId,
      recipient: record.recipient, amount: record.amount, eta: record.eta.toString(), timestamp: timestamp.toString(),
      state: ['Unset', 'Waiting', 'Ready', 'Done'][Number(state)], schedules: record.schedules,
      queueBlock: record.queueBlock, queueTransaction: record.queueTransaction,
      ...(record.executionTransaction ? { executionTransaction: record.executionTransaction } : {}),
      ...(record.canceledTransaction ? { canceledTransaction: record.canceledTransaction } : {}) });
  }
  return { policy: 'No operation event through initial funding; later direct Governor batch actions reconciled with canonical receipts and pinned Timelock state',
    fromBlock: manifest.contracts.Timelock.deploymentBlock, toBlock: BigInt(height).toString(), blockHash,
    bootstrapThrough: BigInt(bootstrapThrough).toString(), eventCount: logs.length, operations };
}
