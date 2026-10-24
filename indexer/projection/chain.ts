import { Interface } from 'ethers';
import { IndexerError } from '../errors.js';
import { hex, quantity, type RpcTransport } from '../rpc.js';
import { readHeader } from '../reader.js';
import type { IndexerConfig } from '../types.js';
import { evaluate, requireProjection, type Evaluated, type Model } from './model.js';

const governorAbi = new Interface([
  'function clock() view returns (uint48)',
  'function CLOCK_MODE() view returns (string)',
  'function state(uint256) view returns (uint8)',
  'function quorum(uint256) view returns (uint256)',
  'function proposalVotes(uint256) view returns (uint256 againstVotes,uint256 forVotes,uint256 abstainVotes)',
  'function timelock() view returns (address)',
  'function treasury() view returns (address)',
]);
const tokenAbi = new Interface(['function balanceOf(address) view returns (uint256)']);
const treasuryAbi = new Interface(['function budgetToken() view returns (address)']);
const timelockAbi = new Interface(['function getTimestamp(bytes32) view returns (uint256)']);
const states = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];

export async function canonical(config: IndexerConfig, rpc: RpcTransport, h: bigint, hash: string): Promise<void> {
  requireProjection(
    quantity(await rpc.call('eth_chainId', []), 'eth_chainId') === config.chainId,
    'Projection RPC chain differs from deployment.',
  );
  requireProjection(
    (await readHeader(rpc, h)).hash === hash,
    'Projection H hash differs from the raw checkpoint; rebuild/reorg investigation required.',
  );
}

/** Every eth_call is pinned to an EIP-1898 canonical block hash, never latest. */
export async function reconcile(
  config: IndexerConfig,
  rpc: RpcTransport,
  hash: string,
  timestamp: bigint,
  model: Model,
): Promise<Map<string, Evaluated>> {
  const addresses = Object.fromEntries(config.contracts.map((c) => [c.role, c.address]));
  requireProjection(
    ['governor', 'timelock', 'treasury', 'budget_token'].every((r) => addresses[r]),
    'BE04 requires all four business sources.',
  );
  async function call(address: string, abi: Interface, name: string, args: unknown[] = []) {
    try {
      const data = hex(
        await rpc.call('eth_call', [
          { to: address, data: abi.encodeFunctionData(name, args) },
          { blockHash: hash, requireCanonical: true },
        ]),
        'eth_call',
      );
      const result = abi.decodeFunctionResult(name, data);
      requireProjection(
        abi.encodeFunctionResult(name, result).toLowerCase() === data,
        'Noncanonical historical eth_call result.',
      );
      return result;
    } catch (error) {
      if (error instanceof IndexerError) throw error;
      throw new IndexerError('PROJECTION_RPC_ERROR', `Historical ${name} failed; read model was not advanced.`);
    }
  }
  const governor = addresses.governor!,
    timelock = addresses.timelock!,
    treasury = addresses.treasury!,
    token = addresses.budget_token!;
  requireProjection(
    (await call(governor, governorAbi, 'CLOCK_MODE'))[0] === 'mode=timestamp' &&
      (await call(governor, governorAbi, 'clock'))[0] === timestamp,
    'Governor clock is not timestamp at H.',
  );
  requireProjection(
    String((await call(governor, governorAbi, 'timelock'))[0]).toLowerCase() === timelock &&
      String((await call(governor, governorAbi, 'treasury'))[0]).toLowerCase() === treasury &&
      String((await call(treasury, treasuryAbi, 'budgetToken'))[0]).toLowerCase() === token,
    'Contract linkage differs from configured manifest at H.',
  );
  requireProjection(
    (await call(token, tokenAbi, 'balanceOf', [treasury]))[0] === model.balance,
    'BUD balanceOf(H) differs from Transfer ledger.',
  );
  const evaluated = new Map<string, Evaluated>();
  for (const p of model.proposals) {
    const quorum =
      timestamp > BigInt(p.snapshot)
        ? ((await call(governor, governorAbi, 'quorum', [p.snapshot]))[0] as bigint)
        : null;
    const value = evaluate(p, timestamp, quorum);
    const votes = await call(governor, governorAbi, 'proposalVotes', [p.id]);
    requireProjection(
      p.votes.every((v, i) => votes[i] === v),
      'Governor proposalVotes(H) differs from indexed votes.',
    );
    const state = (await call(governor, governorAbi, 'state', [p.id]))[0] as bigint;
    requireProjection(states[Number(state)] === value.state, 'Governor state(H) differs from derived state.');
    if (p.operation) {
      const actual = (await call(timelock, timelockAbi, 'getTimestamp', [p.operation.id]))[0] as bigint;
      const expected = p.operation.executed ? 1n : p.operation.canceled ? 0n : BigInt(p.operation.eta);
      requireProjection(actual === expected, 'Timelock getTimestamp(H) differs from projected operation.');
    }
    evaluated.set(p.id, value);
  }
  return evaluated;
}
