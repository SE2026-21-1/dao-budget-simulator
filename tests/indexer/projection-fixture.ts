import { AbiCoder, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';
import { ABI_REGISTRY } from '../../indexer/abi-registry.js';
import { parseConfig } from '../../indexer/config.js';
import { decodeLog } from '../../indexer/decoder.js';
import { operationId, timelockSalt, treasuryAbi, type SourceEvent } from '../../indexer/projection/model.js';
import type { ContractRole, NormalizedLog } from '../../indexer/types.js';
import { hash } from './helpers.js';

export const addresses = {
  governor: '0x1111111111111111111111111111111111111111',
  treasury: '0x2222222222222222222222222222222222222222',
  timelock: '0x3333333333333333333333333333333333333333',
  budget_token: '0x4444444444444444444444444444444444444444',
};
export const actor = '0x5555555555555555555555555555555555555555';
export const recipient = '0x6666666666666666666666666666666666666666';
const versions = {
  governor: 'oz-5.4.0-governor',
  treasury: 'sc01-itreasury-v1',
  timelock: 'oz-5.4.0-timelock',
  budget_token: 'oz-5.4.0-erc20',
};
export const projectionConfig = (chainId = '31337', deploymentId = '1') =>
  parseConfig(
    {
      rpcUrl: 'http://127.0.0.1:8545',
      chainId,
      deploymentId,
      fromBlock: '1',
      toBlock: 'latest',
      batchSize: '3',
      confirmations: 2,
      contracts: Object.entries(addresses).map(([role, address]) => ({
        role,
        address,
        deploymentBlock: '1',
        abiVersion: versions[role as ContractRole],
      })),
    },
    {},
  );

export class Scenario {
  events: SourceEvent[] = [];
  logs: NormalizedLog[] = [];
  timestamps = new Map<bigint, bigint>();
  add(role: ContractRole, name: string, args: unknown[], block: bigint, timestamp: bigint) {
    this.timestamps.set(block, timestamp);
    const contract = projectionConfig().contracts.find((c) => c.role === role)!;
    const encoded = ABI_REGISTRY[contract.abiVersion]!.interface.encodeEventLog(name, args);
    const index = BigInt(this.logs.filter((l) => l.blockNumber === block).length);
    const log: NormalizedLog = {
      contract,
      blockNumber: block,
      blockHash: hash(block),
      transactionHash: hash(10000n + block),
      transactionIndex: 0n,
      logIndex: index,
      topics: encoded.topics,
      data: encoded.data,
      rawLog: {},
    };
    log.rawLog = {
      address: contract.address,
      blockNumber: '0x' + block.toString(16),
      blockHash: log.blockHash,
      transactionHash: log.transactionHash,
      transactionIndex: '0x0',
      logIndex: '0x' + index.toString(16),
      topics: log.topics,
      data: log.data,
      removed: false,
    };
    const decoded = decodeLog(log);
    if (decoded.status !== 'decoded') throw new Error(decoded.message);
    const e: SourceEvent = {
      id: String(this.events.length + 1),
      role,
      address: contract.address,
      block: String(block),
      blockHash: log.blockHash,
      timestamp: String(timestamp),
      tx: log.transactionHash,
      txIndex: '0',
      logIndex: String(index),
      name,
      payload: decoded.payload,
    };
    this.logs.push(log);
    this.events.push(e);
    return e;
  }
  propose(
    request = ZeroHash,
    description = '  {"version":1,"title":"Ngân sách 🗳️","body":"Giữ nguyên mô tả"}  ',
    amount = 1000n,
    block = 2n,
  ) {
    const targets = [addresses.treasury],
      values = ['0'],
      calldatas = [treasuryAbi.encodeFunctionData('disburse', [request, recipient, amount])];
    const descriptionHash = keccak256(toUtf8Bytes(description));
    const id = BigInt(
      keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ['address[]', 'uint256[]', 'bytes[]', 'bytes32'],
          [targets, values, calldatas, descriptionHash],
        ),
      ),
    ).toString();
    this.add(
      'governor',
      'ProposalCreated',
      [id, actor, targets, values, [''], calldatas, 1060n, 1360n, description],
      block,
      1000n,
    );
    return { id, request, targets, values, calldatas, descriptionHash };
  }
  vote(p: ReturnType<Scenario['propose']>, support = 1, weight = 700n, voter = actor, block = 4n) {
    return this.add(
      'governor',
      'VoteCastWithParams',
      [voter, p.id, support, weight, 'Lý do 🗳️', '0x0001ff00'],
      block,
      1100n,
    );
  }
  queue(p: ReturnType<Scenario['propose']>, block = 8n) {
    const id = operationId(p, addresses.governor),
      salt = timelockSalt(addresses.governor, p.descriptionHash);
    this.add(
      'timelock',
      'CallScheduled',
      [id, 0n, addresses.treasury, 0n, p.calldatas[0], ZeroHash, 120n],
      block,
      1361n,
    );
    if (salt !== ZeroHash) this.add('timelock', 'CallSalt', [id, salt], block, 1361n);
    this.add('governor', 'ProposalQueued', [p.id, 1481n], block, 1361n);
    return id;
  }
  execute(p: ReturnType<Scenario['propose']>, block = 10n) {
    this.add('budget_token', 'Transfer', [addresses.treasury, recipient, 1000n], block, 1481n);
    this.add('treasury', 'BudgetDisbursed', [p.request, recipient, 1000n], block, 1481n);
    this.add(
      'timelock',
      'CallExecuted',
      [operationId(p, addresses.governor), 0n, addresses.treasury, 0n, p.calldatas[0]],
      block,
      1481n,
    );
    this.add('governor', 'ProposalExecuted', [p.id], block, 1481n);
  }
  fund(amount = 10000n, block = 1n) {
    this.add('budget_token', 'Transfer', [actor, addresses.treasury, amount], block, 999n);
  }
}
