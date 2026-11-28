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
  if ((await readHeader(rpc, h)).hash !== hash)
    throw new IndexerError('PROJECTION_REORG', 'Projection H is no longer canonical; publication must be invalidated.');
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
  const treasuryBalance = (await call(token, tokenAbi, 'balanceOf', [treasury]))[0] as bigint;
  requireProjection(treasuryBalance === model.balance,
    `BUD balanceOf(H) ${treasuryBalance} differs from Transfer ledger ${model.balance}.`);
  // The answer is fixed by (canonical H hash, snapshot), not by proposal ID.
  // Keep this cache local to one reconciliation: never reuse it across H/reorgs.
  const quorums = new Map<string, Promise<bigint>>();
  async function quorumAt(snapshot: string): Promise<bigint> {
    let value = quorums.get(snapshot);
    if (!value) {
      value = call(governor, governorAbi, 'quorum', [snapshot]).then(result => result[0] as bigint);
      quorums.set(snapshot, value);
    }
    return value;
  }
  const values: Evaluated[] = [];
  let next = 0, failed = false;
  let failure: unknown;
  async function checkProposal(index: number): Promise<void> {
    const p = model.proposals[index]!;
    const quorum =
      timestamp > BigInt(p.snapshot)
        ? await quorumAt(p.snapshot)
        : null;
    const value = evaluate(p, timestamp, quorum);
    const votes = await call(governor, governorAbi, 'proposalVotes', [p.id]);
    requireProjection(
      p.votes.every((v, i) => votes[i] === v),
      `${p.id}: Governor proposalVotes(H) [${votes.join(',')}] differs from indexed votes [${p.votes.join(',')}].`,
    );
    const state = (await call(governor, governorAbi, 'state', [p.id]))[0] as bigint;
    requireProjection(states[Number(state)] === value.state,
      `${p.id}: Governor state(H) ${states[Number(state)] ?? `unknown(${state})`} differs from derived state ${value.state}.`);
    if (p.operation) {
      const actual = (await call(timelock, timelockAbi, 'getTimestamp', [p.operation.id]))[0] as bigint;
      const expected = p.operation.executed ? 1n : p.operation.canceled ? 0n : BigInt(p.operation.eta);
      requireProjection(actual === expected,
        `${p.id}: Timelock getTimestamp(H) ${actual} differs from projected operation timestamp ${expected}.`);
    }
    values[index] = value;
  }
  // Independent historical reads may overlap, but do not flood the provider.
  // Drain every in-flight check before returning/throwing so the caller cannot
  // roll back/release its publication lock while reconciliation is still active.
  await Promise.all(Array.from({ length: Math.min(4, model.proposals.length) }, async () => {
    while (!failed && next < model.proposals.length) {
      const index = next++;
      try { await checkProposal(index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return new Map(model.proposals.map((p, i) => [p.id, values[i]!]));
}
