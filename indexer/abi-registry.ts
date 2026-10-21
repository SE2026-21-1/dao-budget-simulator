import { Interface } from 'ethers';
import type { ContractConfig, ContractRole } from './types.js';

/** Event subsets only: these are not the ABI of a deployed BudgetGovernor. */
export interface AbiRegistration {
  role: ContractRole;
  version: string;
  source: string;
  integrationStatus: 'awaiting-sc06';
  abi: readonly string[];
  interface: Interface;
}

const ozRevision = 'c64a1edb67b6e3f4a15cca8909c9482ad33a02b0';
const ozSource = `https://github.com/OpenZeppelin/openzeppelin-contracts/blob/${ozRevision}/contracts/`;

function register(role: ContractRole, version: string, source: string, abi: string[]): AbiRegistration {
  return Object.freeze({
    role,
    version,
    source,
    integrationStatus: 'awaiting-sc06' as const,
    abi: Object.freeze(abi),
    interface: new Interface(abi),
  });
}

// The OpenZeppelin revision is the v5.4.0 revision pinned in foundry.lock.
// Event indexed flags were verified against these pinned upstream Solidity files.
// SC06 has not supplied implementation ABIs or real deployment receipts yet.
export const ABI_REGISTRY: Readonly<Record<string, AbiRegistration>> = Object.freeze({
  'oz-5.4.0-governor': register('governor', 'oz-5.4.0-governor', `${ozSource}governance/IGovernor.sol`, [
    'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
    'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
    'event ProposalQueued(uint256 proposalId, uint256 etaSeconds)',
    'event ProposalExecuted(uint256 proposalId)',
    'event ProposalCanceled(uint256 proposalId)',
  ]),
  'oz-5.4.0-timelock': register('timelock', 'oz-5.4.0-timelock', `${ozSource}governance/TimelockController.sol`, [
    'event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)',
    'event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)',
    'event Cancelled(bytes32 indexed id)',
    'event CallSalt(bytes32 indexed id, bytes32 salt)',
  ]),
  // Event fragment copied from the SC01 shared interface, tested against the JSON ABI.
  'sc01-itreasury-v1': register('treasury', 'sc01-itreasury-v1', 'shared/abi/ITreasury.json', [
    'event BudgetDisbursed(bytes32 indexed requestId, address indexed recipient, uint256 amount)',
  ]),
  'oz-5.4.0-erc20': register('budget_token', 'oz-5.4.0-erc20', `${ozSource}token/ERC20/IERC20.sol`, [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]),
});

export function getAbi(contract: ContractConfig): AbiRegistration {
  const registration = Object.hasOwn(ABI_REGISTRY, contract.abiVersion) ? ABI_REGISTRY[contract.abiVersion] : undefined;
  if (!registration || registration.role !== contract.role) {
    throw new Error(`Unsupported ABI version ${contract.abiVersion} for contract role ${contract.role}`);
  }
  return registration;
}

export function validateAbi(contract: ContractConfig): void {
  getAbi(contract);
}
