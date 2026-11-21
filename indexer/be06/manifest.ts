import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseConfig } from '../config.js';
import { IndexerError } from '../errors.js';
import type { ContractConfig, IndexerConfig } from '../types.js';

const ROLE_KEYS = new Map<string, ContractConfig['role']>([
  ['governor', 'governor'], ['Governor', 'governor'],
  ['timelock', 'timelock'], ['Timelock', 'timelock'],
  ['treasury', 'treasury'], ['Treasury', 'treasury'],
  ['budget_token', 'budget_token'], ['BUD', 'budget_token'],
]);
const VALID_FORMATS = new Set([
  'dao-budget-local-handoff-v1',
  'dao-budget-local-governance-v1',
  'dao-budget-be06-manifest-v1',
]);

export interface LoadedManifest {
  config: IndexerConfig;
  format: string;
  sourceCommit: string | null;
  deploymentName: string | null;
  governanceToken: { address: string; deploymentBlock: bigint; abiVersion: string };
  manifestSha256: string;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IndexerError('INVALID_CONFIG', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function decimal(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new IndexerError('INVALID_CONFIG', `${field} must be a canonical decimal string.`);
  }
  return value;
}

export function parseBe06Manifest(value: unknown, rpcUrl: string, atBlock: string,
  deploymentId = '1'): LoadedManifest {
  const input = record(value, 'manifest');
  const format = input.format;
  if (typeof format !== 'string' || !VALID_FORMATS.has(format)) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest format is not a verified DAO deployment handoff format.');
  }
  const chainId = decimal(input.chainId, 'chainId');
  const sourceCommit = input.sourceCommit;
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest sourceCommit must be a full 40-hex commit SHA.');
  }
  const entries = Array.isArray(input.contracts)
    ? input.contracts.map((entry) => {
      const item = record(entry, 'manifest contract');
      return [String(item.role), item] as const;
    })
    : Object.entries(record(input.contracts, 'manifest.contracts'));
  const contractObject = Array.isArray(input.contracts) ? null : record(input.contracts, 'manifest.contracts');
  const governanceTokenInput = contractObject?.GOV ?? contractObject?.governance_token ?? input.governanceToken ??
    (Array.isArray(input.contracts) ? input.contracts.find((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const item = entry as Record<string, unknown>;
      return item.role === 'GOV' || item.role === 'governance_token';
    }) : undefined);
  if (governanceTokenInput === undefined) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest must identify a governance token address.');
  }
  const governanceTokenRecord = record(governanceTokenInput, 'manifest.governanceToken');
  const governanceAddress = governanceTokenRecord.address;
  if (typeof governanceAddress !== 'string' || !/^0x[0-9a-f]{40}$/i.test(governanceAddress)
      || /^0x0{40}$/i.test(governanceAddress)) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest must identify a nonzero governance token address.');
  }
  const governanceAbiVersion = governanceTokenRecord.abiVersion;
  if (typeof governanceAbiVersion !== 'string' || governanceAbiVersion !== 'sc02-governance-token-v1') {
    throw new IndexerError('UNSUPPORTED_ABI', 'Manifest governance token ABI version is not supported.');
  }
  const governanceToken = {
    address: governanceAddress.toLowerCase(),
    deploymentBlock: BigInt(decimal(governanceTokenRecord.deploymentBlock, 'governanceToken.deploymentBlock')),
    abiVersion: governanceAbiVersion,
  };
  const contracts = entries.map(([key, value]) => {
    const item = record(value, `manifest.contracts.${key}`);
    const role = ROLE_KEYS.get(key) ?? (typeof item.role === 'string' ? ROLE_KEYS.get(item.role) : undefined);
    if (!role) return null;
    return {
      role,
      address: item.address,
      deploymentBlock: item.deploymentBlock,
      abiVersion: item.abiVersion,
    };
  }).filter((item): item is { role: ContractConfig['role']; address: unknown; deploymentBlock: unknown; abiVersion: unknown } => item !== null);

  const uniqueRoles = new Set(contracts.map((contract) => contract.role));
  if (uniqueRoles.size !== 4 || contracts.length !== 4) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest must identify each of the four BE03 contract roles exactly once.');
  }
  const first = contracts.reduce((min, item) => {
    const block = BigInt(decimal(item.deploymentBlock, `${item.role}.deploymentBlock`));
    return block < min ? block : min;
  }, BigInt(decimal(contracts[0]!.deploymentBlock, 'deploymentBlock')));
  const rawK = input.confirmations ?? record(input.confirmationPolicy ?? {}, 'manifest.confirmationPolicy').depth ?? 2;
  const confirmations = typeof rawK === 'string' && /^(0|[1-9][0-9]*)$/.test(rawK) ? Number(rawK) : rawK;
  const rawFrom = input.scanFromBlock ?? first.toString();
  const fromBlock = decimal(rawFrom, 'scanFromBlock');
  if (BigInt(fromBlock) > first) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest scanFromBlock skips an indexed contract deployment block.');
  }
  const config = parseConfig({
    chainId,
    deploymentId,
    fromBlock,
    toBlock: decimal(atBlock, 'atBlock'),
    batchSize: input.batchSize === undefined ? '500' : decimal(input.batchSize, 'batchSize'),
    confirmations,
    contracts,
  }, { RPC_URL: rpcUrl });
  if (config.contracts.length !== 4 || config.contracts.some((contract) => !uniqueRoles.has(contract.role))) {
    throw new IndexerError('INVALID_CONFIG', 'Manifest scope is incomplete.');
  }
  if (config.contracts.some((contract) => contract.address === governanceToken.address)) {
    throw new IndexerError('INVALID_CONFIG', 'Governance token address must be distinct from the four BE03 contracts.');
  }
  return {
    config,
    format,
    sourceCommit: sourceCommit.toLowerCase(),
    deploymentName: typeof input.deploymentName === 'string' && input.deploymentName.trim()
      ? input.deploymentName.trim() : null,
    governanceToken,
    manifestSha256: '',
  };
}

export async function loadBe06Manifest(path: string, rpcUrl: string, atBlock: string,
  deploymentId = '1'): Promise<LoadedManifest> {
  let bytes: Buffer;
  let value: unknown;
  try {
    bytes = await readFile(path);
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new IndexerError('INVALID_CONFIG', 'Manifest cannot be read as UTF-8 JSON.');
  }
  const loaded = parseBe06Manifest(value, rpcUrl, atBlock, deploymentId);
  loaded.manifestSha256 = createHash('sha256').update(bytes).digest('hex');
  return loaded;
}

export function deploymentScope(config: Pick<IndexerConfig, 'chainId' | 'contracts'>): {
  chainId: string;
  contracts: { role: string; address: string; deploymentBlock: string; abiVersion: string }[];
} {
  return {
    chainId: config.chainId.toString(),
    contracts: config.contracts.map((contract) => ({
      role: contract.role,
      address: contract.address.toLowerCase(),
      deploymentBlock: contract.deploymentBlock.toString(),
      abiVersion: contract.abiVersion,
    })).sort((a, b) => a.role.localeCompare(b.role)),
  };
}

export function sameDeploymentScope(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
