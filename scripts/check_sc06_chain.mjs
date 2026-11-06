import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AbiCoder, Interface, ZeroHash, id, keccak256, toBeHex } from 'ethers';
import { decodeLog } from '../indexer/decoder.ts';
import { classify, buildModel, evaluate } from '../indexer/projection/model.ts';
import { checkProvenance } from './sc06_provenance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = { GOV: 'GovernanceToken', BUD: 'BudgetToken', Treasury: 'Treasury', Governor: 'BudgetGovernor', Timelock: 'TimelockController' };
const roles = { BUD: 'budget_token', Treasury: 'treasury', Governor: 'governor', Timelock: 'timelock' };
export async function interfaces() {
  return Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, name]) =>
    [key, new Interface(JSON.parse(await readFile(`${root}/out/${name}.sol/${name}.json`)).abi)])));
}
export function decodedEvents(f) {
  const result = [];
  for (const receipt of f.receipts) for (const log of receipt.logs) {
    const name = Object.keys(roles).find(k => f.manifest.contracts[k].address.toLowerCase() === log.address.toLowerCase());
    if (!name) continue; // GOV not supported by the current TV2 registry; retain raw log.
    const item = f.manifest.contracts[name];
    const decode = decodeLog({ contract: { role: roles[name], address: item.address.toLowerCase(),
      deploymentBlock: BigInt(item.deploymentBlock), abiVersion: item.abiVersion },
    blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash, transactionHash: log.transactionHash,
    transactionIndex: BigInt(log.transactionIndex), logIndex: BigInt(log.logIndex), topics: log.topics, data: log.data, rawLog: log });
    assert.notEqual(decode.status, 'decode_error', 'TV2 decode error');
    result.push({ transactionHash: log.transactionHash, logIndex: log.logIndex, ...decode });
  }
  return result;
}

function pinnedCall(f, abi, name, method, args = []) {
  const data = abi[name].encodeFunctionData(method, args);
  const c = f.calls.find(c => c.to.toLowerCase() === f.manifest.contracts[name].address.toLowerCase() && c.data === data);
  assert.ok(c, `missing pinned call ${name}.${method}`);
  assert.equal(c.block, f.head.number);
  return abi[name].decodeFunctionResult(method, c.result)[0];
}

export function verifyPinnedConfig(f, abi) {
  // Manifest and audit can be edited together; the archived eth_call at H cannot.
  for (const [field, contract, method] of [
    ['proposalThreshold', 'Governor', 'proposalThreshold'],
    ['quorumNumerator', 'Governor', 'quorumNumerator()'],
    ['quorumDenominator', 'Governor', 'quorumDenominator'],
    ['votingDelay', 'Governor', 'votingDelay'],
    ['votingPeriod', 'Governor', 'votingPeriod'],
    ['minDelay', 'Timelock', 'getMinDelay'],
    ['clockMode', 'GOV', 'CLOCK_MODE'],
    ['clockMode', 'Governor', 'CLOCK_MODE'],
    ['govSupply', 'GOV', 'totalSupply'],
    ['budSupply', 'BUD', 'totalSupply'],
  ]) assert.equal(String(pinnedCall(f, abi, contract, method)), f.manifest.config[field], `${field}: manifest differs from pinned chain call`);
}

export async function checkFixture(f, rpc) {
  assert.equal(f.kind, 'sc06-canonical-local-receipts-v1');
  assert.equal(f.manifest.chainId, '31337');
  const abi = await interfaces(), coder = AbiCoder.defaultAbiCoder();
  await checkProvenance(f, abi, rpc);
  const address = name => f.manifest.contracts[name].address;
  assert.equal(f.blocks[0].number, '0x0');
  const receipts = new Map(f.receipts.map(r => [r.transactionHash, r]));
  assert.equal(receipts.size, f.receipts.length, 'duplicate receipt');
  const transactions = new Map(f.transactions.map(t => [t.hash, t]));
  assert.equal(transactions.size, receipts.size);
  const blockMap = new Map();
  const logs = [];
  for (let i = 0; i < f.blocks.length; i++) {
    const b = f.blocks[i];
    assert.equal(BigInt(b.number), BigInt(i), 'non-contiguous history');
    if (i) assert.equal(b.parentHash, f.blocks[i - 1].hash, 'noncanonical ancestry');
    blockMap.set(b.number, b);
    let logIndex = 0n;
    for (const [index, hash] of b.transactions.entries()) {
      const r = receipts.get(hash), tx = transactions.get(hash);
      assert.ok(r && tx, 'missing transaction receipt');
      assert.equal(r.status, '0x1');
      for (const obj of [r, tx]) {
        assert.equal(obj.blockHash, b.hash); assert.equal(obj.blockNumber, b.number);
        assert.equal(BigInt(obj.transactionIndex), BigInt(index));
      }
      assert.equal(r.transactionHash, tx.hash);
      assert.equal(r.from.toLowerCase(), tx.from.toLowerCase());
      assert.equal(r.to?.toLowerCase(), tx.to?.toLowerCase());
      for (const log of r.logs) {
        assert.equal(log.removed, false);
        assert.equal(log.blockHash, b.hash); assert.equal(log.blockNumber, b.number);
        assert.equal(log.transactionHash, hash); assert.equal(log.transactionIndex, r.transactionIndex);
        assert.equal(BigInt(log.logIndex), logIndex++);
        assert.match(log.data, /^0x(?:[a-f0-9]{2})*$/i);
        assert.ok(log.topics.length <= 4);
        for (const topic of log.topics) assert.match(topic, /^0x[0-9a-f]{64}$/i);
        const emitter = Object.keys(names).find(k => address(k).toLowerCase() === log.address.toLowerCase());
        assert.ok(emitter, 'unknown emitter');
        const event = abi[emitter].parseLog(log);
        assert.ok(event, 'event absent from compiler ABI');
        const encoded = abi[emitter].encodeEventLog(event.fragment, event.args);
        assert.equal(encoded.data.toLowerCase(), log.data.toLowerCase(), 'noncanonical raw log data');
        assert.deepEqual(encoded.topics.map(t => t.toLowerCase()), log.topics.map(t => t.toLowerCase()));
        logs.push(log);
      }
      if (rpc) {
        assert.deepEqual(await rpc('eth_getTransactionReceipt', [hash]), r, 'RPC receipt mismatch');
        assert.deepEqual(await rpc('eth_getTransactionByHash', [hash]), tx, 'RPC tx mismatch');
      }
    }
    if (rpc) assert.deepEqual(await rpc('eth_getBlockByNumber', [b.number, false]), b, 'RPC block mismatch');
  }
  assert.equal(f.blocks.flatMap(b => b.transactions).length, receipts.size);
  assert.deepEqual(f.head, { number: f.blocks.at(-1).number, hash: f.blocks.at(-1).hash });
  assert.equal(f.blocks[0].hash, f.manifest.localChain.genesisHash);
  for (const [name, info] of Object.entries(f.manifest.contracts)) {
    const r = receipts.get(info.transactionHash);
    assert.ok(r, `${name}: missing deployment receipt`);
    assert.equal(r.contractAddress.toLowerCase(), info.address.toLowerCase());
    assert.equal(BigInt(r.blockNumber).toString(), info.deploymentBlock);
  }
  assert.deepEqual(decodedEvents(f), f.expectedDecoded, 'TV2 expected decode mismatch');
  const eventLogs = (name, event, receipt) => (receipt ? receipt.logs : logs)
    .filter(l => l.address.toLowerCase() === address(name).toLowerCase())
    .map(l => ({ raw: l, event: abi[name].parseLog(l) })).filter(e => e.event?.name === event);
  const getCall = (name, method, args = []) => pinnedCall(f, abi, name, method, args);
  verifyPinnedConfig(f, abi);
  assert.equal(f.proposals.length, 2);
  for (const [index, p] of f.proposals.entries()) {
    assert.match(p.amount, /^(0|[1-9][0-9]*)$/);
    assert.equal(p.descriptionHash, keccak256(Buffer.from(p.description, 'utf8')));
    assert.equal(p.descriptionHash, id(p.description));
    assert.equal(p.calldata, abi.Treasury.encodeFunctionData('disburse', [p.requestId, p.recipient, p.amount]));
    const targets = [address('Treasury')], values = ['0'], calldatas = [p.calldata];
    assert.equal(p.proposalId, BigInt(keccak256(coder.encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32'],
      [targets, values, calldatas, p.descriptionHash]))).toString());
    const salt = toBeHex(BigInt(address('Governor') + '0'.repeat(24)) ^ BigInt(p.descriptionHash), 32);
    assert.equal(p.salt, salt, 'wrong Governor salt');
    const operation = keccak256(coder.encode(['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'],
      [targets, values, calldatas, ZeroHash, salt]));
    assert.equal(p.operationId, operation);
    assert.equal(getCall('Governor', 'hashProposal', [targets, values, calldatas, p.descriptionHash]).toString(), p.proposalId);
    assert.equal(getCall('Timelock', 'hashOperationBatch', [targets, values, calldatas, ZeroHash, salt]), operation);
    const created = eventLogs('Governor', 'ProposalCreated').filter(e => e.event.args.proposalId.toString() === p.proposalId);
    assert.equal(created.length, 1);
    const e = created[0].event;
    assert.equal(e.args.description, p.description);
    assert.deepEqual(Array.from(e.args.targets), targets);
    assert.deepEqual(Array.from(e.args.getValue('values')).map(String), values);
    assert.deepEqual(Array.from(e.args.calldatas), calldatas);
    const parseTx = (label, method, args, from) => {
      const receipt = receipts.get(p.transactions[label]); assert.ok(receipt, label);
      const tx = transactions.get(receipt.transactionHash);
      assert.equal(tx.to.toLowerCase(), address('Governor').toLowerCase());
      assert.equal(tx.from.toLowerCase(), from.toLowerCase());
      assert.equal(tx.input, abi.Governor.encodeFunctionData(method, args));
      assert.equal(BigInt(tx.value), 0n);
      return receipt;
    };
    parseTx('create', 'propose', [targets, values, calldatas, p.description], f.manifest.accounts.A);
    if (index === 0) {
      assert.ok(p.description.includes('ngân sách') && p.description.startsWith(' '), 'missing Unicode/whitespace');
      assert.equal(p.amount, '1000000000000000000000');
      const votes = eventLogs('Governor', 'VoteCast').filter(e => e.event.args.proposalId.toString() === p.proposalId);
      assert.equal(votes.length, 2);
      assert.equal(votes.reduce((s, e) => s + e.event.args.weight, 0n), 700n * 10n ** 18n);
      for (const name of ['A', 'B']) parseTx(`vote${name}`, 'castVote', [p.proposalId, 1], f.manifest.accounts[name]);
      for (const vote of votes) {
        assert.equal(vote.event.args.support, 1n);
        const t = BigInt(blockMap.get(vote.raw.blockNumber).timestamp);
        assert.ok(t > e.args.voteStart && t <= e.args.voteEnd);
      }
      const q = parseTx('queue', 'queue', [targets, values, calldatas, p.descriptionHash], f.manifest.accounts.caller);
      assert.ok(BigInt(blockMap.get(q.blockNumber).timestamp) > e.args.voteEnd);
      const scheduled = eventLogs('Timelock', 'CallScheduled', q);
      assert.equal(scheduled.length, 1);
      const s = scheduled[0].event.args;
      assert.equal(s.id, operation); assert.equal(s.index, 0n); assert.equal(s.target, targets[0]);
      assert.equal(s.value, 0n); assert.equal(s.data, p.calldata); assert.equal(s.predecessor, ZeroHash); assert.equal(s.delay, 120n);
      assert.equal(eventLogs('Timelock', 'CallSalt', q)[0].event.args.salt, salt);
      const queued = eventLogs('Governor', 'ProposalQueued', q)[0].event.args;
      assert.equal(queued.proposalId.toString(), p.proposalId);
      assert.equal(queued.etaSeconds, BigInt(blockMap.get(q.blockNumber).timestamp) + 120n);
      const paid = parseTx('execute', 'execute', [targets, values, calldatas, p.descriptionHash], f.manifest.accounts.outsider);
      assert.ok(BigInt(blockMap.get(paid.blockNumber).timestamp) >= queued.etaSeconds);
      assert.equal(eventLogs('Governor', 'ProposalExecuted', paid)[0].event.args.proposalId.toString(), p.proposalId);
      assert.equal(eventLogs('Timelock', 'CallExecuted', paid)[0].event.args.id, operation);
      const disbursed = eventLogs('Treasury', 'BudgetDisbursed', paid);
      assert.equal(disbursed.length, 1);
      assert.equal(disbursed[0].event.args.requestId, p.requestId);
      assert.equal(disbursed[0].event.args.recipient.toLowerCase(), p.recipient.toLowerCase());
      assert.equal(disbursed[0].event.args.amount.toString(), p.amount);
      const transfers = eventLogs('BUD', 'Transfer', paid);
      assert.equal(transfers.length, 1);
      assert.equal(transfers[0].event.args.from.toLowerCase(), address('Treasury').toLowerCase());
      assert.equal(transfers[0].event.args.to.toLowerCase(), p.recipient.toLowerCase());
      assert.equal(transfers[0].event.args.value.toString(), p.amount);
      const order = ['BUD', 'Treasury', 'Timelock', 'Governor'];
      assert.deepEqual(paid.logs.map(l => Object.keys(names).find(k => address(k).toLowerCase() === l.address.toLowerCase())), order);
      assert.equal(getCall('Governor', 'state', [p.proposalId]), 7n);
      assert.equal(getCall('Timelock', 'getTimestamp', [operation]), 1n);
      assert.equal(getCall('Treasury', 'paidRequests', [p.requestId]), true);
    } else {
      const r = parseTx('cancel', 'cancel', [targets, values, calldatas, p.descriptionHash], f.manifest.accounts.A);
      assert.ok(BigInt(blockMap.get(r.blockNumber).timestamp) <= e.args.voteStart);
      assert.equal(eventLogs('Governor', 'ProposalCanceled', r)[0].event.args.proposalId.toString(), p.proposalId);
      assert.equal(getCall('Governor', 'state', [p.proposalId]), 2n);
      assert.equal(getCall('Timelock', 'getTimestamp', [operation]), 0n);
      assert.equal(getCall('Treasury', 'paidRequests', [p.requestId]), false);
      for (const event of ['CallScheduled', 'CallExecuted', 'Cancelled']) {
        assert.equal(eventLogs('Timelock', event).filter(e => e.event.args.id === operation).length, 0);
      }
    }
  }
  assert.notEqual(f.proposals[0].requestId, f.proposals[1].requestId);
  assert.equal(eventLogs('Treasury', 'BudgetDisbursed').length, 1);
  const treasury = address('Treasury').toLowerCase();
  let incoming = 0n, outgoing = 0n;
  for (const { event } of eventLogs('BUD', 'Transfer')) {
    if (event.args.to.toLowerCase() === treasury) incoming += event.args.value;
    if (event.args.from.toLowerCase() === treasury) outgoing += event.args.value;
  }
  assert.equal(incoming, 10000n * 10n ** 18n); assert.equal(outgoing, 1000n * 10n ** 18n);
  assert.equal(incoming.toString(), f.manifest.config.treasurySeed, 'treasurySeed differs from canonical funding logs');
  const expected = { treasury: incoming - outgoing, recipient: outgoing, funding: 10000n * 10n ** 18n };
  for (const [key, account] of Object.entries({ treasury: address('Treasury'), recipient: f.manifest.accounts.recipient, funding: f.manifest.accounts.funding })) {
    assert.equal(getCall('BUD', 'balanceOf', [account]), expected[key]);
    assert.equal(f.balances[key], expected[key].toString());
  }
  assert.equal(getCall('BUD', 'decimals'), 18n);
  assert.equal(getCall('BUD', 'totalSupply'), 20000n * 10n ** 18n);
  const projection = await projectFixture(f);
  if (rpc) {
    assert.equal(await rpc('eth_chainId'), '0x7a69');
    for (const c of f.calls) assert.equal(await rpc('eth_call', [{ to: c.to, data: c.data }, c.block]), c.result);
    assert.deepEqual(await rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: f.head.number }]), logs);
    assert.equal((await rpc('eth_getBlockByNumber', [f.head.number, false])).hash, f.head.hash);
  }
  return { receipts: f.receipts.length, logs: logs.length, blocks: f.blocks.length,
    decoded: f.expectedDecoded.filter(e => e.status === 'decoded').length,
    unknownTopics: f.expectedDecoded.filter(e => e.status === 'unknown_topic').length,
    disbursements: 1, outgoingBaseUnits: outgoing.toString(), projection, liveRpcVerified: Boolean(rpc) };
}
export async function projectFixture(f) {
  const abi = await interfaces(), events = [];
  const address = name => f.manifest.contracts[name].address.toLowerCase();
  const blocks = new Map(f.blocks.map(b => [b.number, b]));
  let ancillary = 0;
  for (const receipt of f.receipts) for (const log of receipt.logs) {
    const name = Object.keys(roles).find(k => address(k) === log.address.toLowerCase());
    if (!name) continue;
    const c = f.manifest.contracts[name];
    const normalized = { contract: { role: roles[name], address: address(name), deploymentBlock: BigInt(c.deploymentBlock), abiVersion: c.abiVersion },
      blockNumber: BigInt(log.blockNumber), blockHash: log.blockHash, transactionHash: log.transactionHash,
      transactionIndex: BigInt(log.transactionIndex), logIndex: BigInt(log.logIndex), topics: log.topics, data: log.data, rawLog: log };
    const decoded = classify(normalized);
    if (decoded === null) { ancillary++; continue; }
    assert.equal(decoded.status, 'decoded', 'projection cannot skip unknown business log');
    events.push({ id: `${log.transactionHash}:${log.logIndex}`, role: roles[name], address: address(name),
      block: BigInt(log.blockNumber).toString(), blockHash: log.blockHash,
      timestamp: BigInt(blocks.get(log.blockNumber).timestamp).toString(), tx: log.transactionHash,
      txIndex: BigInt(log.transactionIndex).toString(), logIndex: BigInt(log.logIndex).toString(),
      name: decoded.eventName, payload: decoded.payload });
  }
  const model = buildModel(events, address('Treasury'), address('Governor'));
  const clock = BigInt(f.blocks.at(-1).timestamp);
  assert.equal(model.proposals.length, 2); assert.equal(model.operations.length, 1);
  assert.equal(model.votes.length, 2); assert.equal(model.disbursements.length, 1);
  assert.equal(model.totalIn, 10000n * 10n ** 18n); assert.equal(model.totalOut, 1000n * 10n ** 18n);
  assert.equal(model.balance.toString(), f.balances.treasury);
  const states = [];
  for (const [index, expected] of f.proposals.entries()) {
    const p = model.proposals.find(p => p.id === expected.proposalId); assert.ok(p);
    assert.equal(p.description, expected.description); assert.equal(p.descriptionHash, expected.descriptionHash);
    assert.equal(p.requestId, expected.requestId); assert.equal(p.amount, expected.amount);
    assert.deepEqual(p.calldatas, [expected.calldata]);
    let quorum = null;
    if (clock > BigInt(p.snapshot)) {
      const data = abi.Governor.encodeFunctionData('quorum', [p.snapshot]);
      const call = f.calls.find(c => c.to.toLowerCase() === address('Governor') && c.data === data);
      assert.ok(call); assert.equal(call.block, f.head.number);
      quorum = abi.Governor.decodeFunctionResult('quorum', call.result)[0];
    }
    const evaluated = evaluate(p, clock, quorum);
    const stateCall = f.calls.find(c => c.to.toLowerCase() === address('Governor') && c.data === abi.Governor.encodeFunctionData('state', [p.id]));
    assert.ok(stateCall); assert.equal(stateCall.block, f.head.number);
    assert.equal(abi.Governor.decodeFunctionResult('state', stateCall.result)[0], index === 0 ? 7n : 2n);
    assert.equal(evaluated.state, index === 0 ? 'Executed' : 'Canceled');
    if (index === 0) {
      assert.deepEqual(p.votes, [0n, 700n * 10n ** 18n, 0n]);
      for (const [name, weight] of [['A', 400n], ['B', 300n]]) {
        const vote = model.votes.find(v => v.voter === f.manifest.accounts[name].toLowerCase());
        assert.ok(vote); assert.equal(vote.proposal.id, p.id); assert.equal(vote.weight, (weight * 10n ** 18n).toString()); assert.equal(vote.support, 1);
      }
      assert.equal(p.operation.id, expected.operationId); assert.equal(p.operation.salt, expected.salt);
      assert.equal(BigInt(p.operation.eta), BigInt(p.operation.queuedAt) + 120n);
      assert.equal(p.operation.queued.tx, expected.transactions.queue); assert.equal(p.executed.tx, expected.transactions.execute);
      assert.equal(evaluated.operationStatus, 'Done');
      const d = model.disbursements[0];
      assert.equal(d.proposal.id, p.id); assert.equal(d.transfer.amount, expected.amount);
      assert.equal(d.transfer.source.tx, d.source.tx); assert.equal(d.operation.id, expected.operationId);
    } else { assert.equal(p.operation, undefined); assert.equal(p.canceled.tx, expected.transactions.cancel); assert.equal(evaluated.operationStatus, null); }
    states.push(evaluated.state);
  }
  return { asOfBlock: BigInt(f.head.number).toString(), blockHash: f.head.hash, proposals: 2,
    votes: 2, forBaseUnits: model.proposals.find(p => p.operation).votes[1].toString(),
    operations: 1, disbursements: 1, totalOut: model.totalOut.toString(), balance: model.balance.toString(), states, ancillary };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await checkFixture(JSON.parse(await readFile(process.argv[2] ?? 'fixtures/chain/sc06-v1/chain.json'))));
}
