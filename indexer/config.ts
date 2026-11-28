import { readFile } from 'node:fs/promises';
import { getAddress } from 'ethers';
import { validateAbi } from './abi-registry.js';
import { IndexerError } from './errors.js';
import type { ContractConfig, ContractRole, IndexerConfig } from './types.js';

export const UINT256_MAX = (1n << 256n) - 1n;
export const PG_BIGINT_MAX = (1n << 63n) - 1n;
const roles = new Set<ContractRole>(['governor', 'timelock', 'treasury', 'budget_token']);

export function uint(value: unknown, field: string, max = UINT256_MAX): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new IndexerError('INVALID_CONFIG', `${field} must be a canonical decimal integer string.`);
  }
  const result = BigInt(value);
  if (result > max) throw new IndexerError('INVALID_CONFIG', `${field} is out of range.`);
  return result;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IndexerError('INVALID_CONFIG', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function parseConfig(value: unknown, env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const input = object(value, 'config');
  const rpcUrl = env.RPC_URL ?? input.rpcUrl;
  try {
    if (typeof rpcUrl !== 'string') throw new Error();
    const url = new URL(rpcUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new IndexerError('INVALID_CONFIG', 'Set RPC_URL or rpcUrl to an HTTP(S) RPC endpoint.');
  }
  const chainId = uint(input.chainId, 'chainId');
  const deploymentId = uint(input.deploymentId, 'deploymentId', PG_BIGINT_MAX);
  const fromBlock = uint(input.fromBlock, 'fromBlock');
  const toBlock = input.toBlock === 'latest' ? 'latest' : uint(input.toBlock, 'toBlock');
  const batchSize = uint(input.batchSize, 'batchSize', 10_000n);
  if (!chainId || !deploymentId || !batchSize || (toBlock !== 'latest' && toBlock < fromBlock)) {
    throw new IndexerError('INVALID_CONFIG', 'chainId/deploymentId/batchSize must be positive and toBlock >= fromBlock.');
  }
  if (!Array.isArray(input.contracts) || input.contracts.length === 0 || input.contracts.length > 4) {
    throw new IndexerError('INVALID_CONFIG', 'contracts must contain one to four distinct supported roles.');
  }
  const addresses = new Set<string>();
  const configuredRoles = new Set<ContractRole>();
  const contracts = input.contracts.map((entry): ContractConfig => {
    const contract = object(entry, 'contract');
    const role = contract.role as ContractRole;
    if (!roles.has(role) || configuredRoles.has(role)) {
      throw new IndexerError('INVALID_CONFIG', 'Contract role is unsupported or duplicated.');
    }
    let address: string;
    try {
      if (typeof contract.address !== 'string') throw new Error();
      address = getAddress(contract.address).toLowerCase();
      if (address === '0x' + '0'.repeat(40) || addresses.has(address)) throw new Error();
    } catch {
      throw new IndexerError('INVALID_CONFIG', 'Contract address is invalid, zero or duplicated.');
    }
    if (typeof contract.abiVersion !== 'string' || contract.abiVersion.length === 0) {
      throw new IndexerError('INVALID_CONFIG', 'Contract abiVersion is required.');
    }
    const result = { role, address, deploymentBlock: uint(contract.deploymentBlock, 'deploymentBlock'), abiVersion: contract.abiVersion };
    try { validateAbi(result); }
    catch { throw new IndexerError('INVALID_CONFIG', 'Contract ABI version is unsupported for its configured role.'); }
    addresses.add(address);
    configuredRoles.add(role);
    return result;
  });
  const confirmations = input.confirmations === undefined ? 2 : input.confirmations;
  if (typeof confirmations !== 'number' || !Number.isInteger(confirmations) || confirmations < 0 || confirmations > 2_147_483_647) {
    throw new IndexerError('INVALID_CONFIG', 'confirmations must be an integer number in [0, 2147483647].');
  }
  const reorgWindow = input.reorgWindow ?? 128;
  const pollIntervalMs = input.pollIntervalMs ?? 1000;
  if (!Number.isInteger(reorgWindow) || typeof reorgWindow !== 'number' || reorgWindow < 1 || reorgWindow > 10000 ||
      !Number.isInteger(pollIntervalMs) || typeof pollIntervalMs !== 'number' || pollIntervalMs < 100 || pollIntervalMs > 10000)
    throw new IndexerError('INVALID_CONFIG', 'reorgWindow must be 1..10000; pollIntervalMs must be 100..10000.');
  return { reorgWindow, pollIntervalMs, rpcUrl: rpcUrl as string, chainId, deploymentId: deploymentId.toString(), fromBlock, toBlock, batchSize, contracts, confirmations };
}

export async function loadConfig(path: string, env: NodeJS.ProcessEnv = process.env): Promise<IndexerConfig> {
  let input: unknown;
  try { input = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new IndexerError('INVALID_CONFIG', 'Cannot read config as UTF-8 JSON.'); }
  return parseConfig(input, env);
}
