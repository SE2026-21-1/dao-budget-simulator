// Deterministic SYNTHETIC ABI vectors. Never evidence of mined transactions.
// Keep the independent-transfer.json vector independent of this generator.
import { writeFileSync } from 'node:fs';
import { getAddress, Interface } from 'ethers';

const a = getAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
const b = getAddress('0x1234567890abcdef1234567890abcdef12345678');
const large = (2n ** 255n + 123456789n).toString();
const proposalId = (2n ** 256n - 1n).toString();
const operationId = `0x${'cd'.repeat(32)}`;
const requestId = `0x${'ef'.repeat(32)}`;
const salt = `0x${'ab'.repeat(32)}`;
const zeroHash = `0x${'00'.repeat(32)}`;
const description = '{ "version": 1, "title": "Synthetic BE02", "body": "Ngân sách thử nghiệm 🚀" }';

const vectors = [
  {
    role: 'governor', abiVersion: 'oz-5.4.0-governor',
    fragment: 'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
    expected: { proposalId, proposer: a, targets: [a, b], values: ['0', large], signatures: ['', 'disburse(bytes32,address,uint256)'], calldatas: ['0x1234abcd', '0x'], voteStart: '123', voteEnd: '456', description },
  },
  {
    role: 'governor', abiVersion: 'oz-5.4.0-governor',
    fragment: 'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
    expected: { voter: a, proposalId, support: '2', weight: large, reason: 'Synthetic vote: ủng hộ 🚀' },
  },
  { role: 'governor', abiVersion: 'oz-5.4.0-governor', fragment: 'event ProposalQueued(uint256 proposalId, uint256 etaSeconds)', expected: { proposalId, etaSeconds: '1900000000' } },
  { role: 'governor', abiVersion: 'oz-5.4.0-governor', fragment: 'event ProposalExecuted(uint256 proposalId)', expected: { proposalId } },
  { role: 'governor', abiVersion: 'oz-5.4.0-governor', fragment: 'event ProposalCanceled(uint256 proposalId)', expected: { proposalId } },
  {
    role: 'timelock', abiVersion: 'oz-5.4.0-timelock',
    fragment: 'event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)',
    expected: { id: operationId, index: large, target: a, value: large, data: '0xabcdef0123456789', predecessor: zeroHash, delay: '120' },
  },
  {
    role: 'timelock', abiVersion: 'oz-5.4.0-timelock',
    fragment: 'event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)',
    expected: { id: operationId, index: large, target: b, value: large, data: '0x1234abcd' },
  },
  { role: 'timelock', abiVersion: 'oz-5.4.0-timelock', fragment: 'event Cancelled(bytes32 indexed id)', expected: { id: operationId } },
  { role: 'timelock', abiVersion: 'oz-5.4.0-timelock', fragment: 'event CallSalt(bytes32 indexed id, bytes32 salt)', expected: { id: operationId, salt } },
  {
    role: 'treasury', abiVersion: 'sc01-itreasury-v1',
    fragment: 'event BudgetDisbursed(bytes32 indexed requestId, address indexed recipient, uint256 amount)',
    expected: { requestId, recipient: a, amount: large },
  },
  {
    role: 'budget_token', abiVersion: 'oz-5.4.0-erc20',
    fragment: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    expected: { from: a, to: b, value: large },
  },
];
const addresses: Record<string, string> = {
  governor: `0x${'11'.repeat(20)}`, timelock: `0x${'22'.repeat(20)}`,
  treasury: `0x${'33'.repeat(20)}`, budget_token: `0x${'44'.repeat(20)}`,
};

function lowerAddresses(value: unknown): unknown {
  if (typeof value === 'string' && /^0x[\da-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (Array.isArray(value)) return value.map(lowerAddresses);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, lowerAddresses(child)]));
  return value;
}

const events = vectors.map((vector, index) => {
  const iface = new Interface([vector.fragment]);
  const fragment = iface.fragments[0]!;
  if (fragment.type !== 'event') throw new Error('Fixture fragment must be an event');
  const event = iface.getEvent(fragment.format('sighash'))!;
  const encoded = iface.encodeEventLog(event, Object.values(vector.expected));
  return {
    role: vector.role,
    abiVersion: vector.abiVersion,
    eventName: event.name,
    expectedPayload: lowerAddresses(vector.expected),
    rawLog: {
      address: addresses[vector.role],
      blockNumber: '0x64',
      blockHash: `0x${'55'.repeat(32)}`,
      transactionHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
      transactionIndex: '0x0',
      logIndex: `0x${index.toString(16)}`,
      removed: false,
      topics: encoded.topics,
      data: encoded.data,
    },
  };
});
writeFileSync(new URL('./events.json', import.meta.url), `${JSON.stringify({ synthetic: true, chainId: '31337', disclaimer: 'Artificial addresses, hashes and logs. Not mined receipts or SC06 acceptance evidence.', events }, null, 2)}\n`);
