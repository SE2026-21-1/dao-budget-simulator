import { createHash } from 'node:crypto';
import { IndexerError } from './errors.js';
import type { ContractConfig, IndexerConfig } from './types.js';

export const sourceKey = (c: ContractConfig): string => JSON.stringify([c.role, c.address, c.deploymentBlock.toString(), c.abiVersion]);
export const firstBlock = (c: IndexerConfig): bigint => c.contracts.reduce((a, b) => a < b.deploymentBlock ? a : b.deploymentBlock, c.contracts[0]!.deploymentBlock);
export const scopeHash = (c: IndexerConfig): string => '0x' + createHash('sha256').update(JSON.stringify([
  'be03-raw-v1', c.chainId.toString(), c.deploymentId, c.contracts.map(sourceKey).sort(),
])).digest('hex');

export function confirmationDepth(config: IndexerConfig): number {
  const k = config.confirmations === undefined ? 2 : config.confirmations;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k > 2_147_483_647) {
    throw new IndexerError('INVALID_CONFIG', 'confirmations must be an integer number in [0, 2147483647].');
  }
  return k;
}

/** K following blocks, not the inclusion block. null means no eligible block. */
export function safeBlock(head: bigint, k: number): bigint | null {
  confirmationDepth({ confirmations: k } as IndexerConfig);
  if (head < 0n) throw new IndexerError('INVALID_RANGE', 'Head cannot be negative.');
  return head < BigInt(k) ? null : head - BigInt(k);
}
