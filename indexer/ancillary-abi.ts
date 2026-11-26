import { Interface } from 'ethers';
import type { ContractRole } from './types.js';

// Administrative events already accepted by the BE04 projector. Raw decoding
// must recognize the same exact indexed layouts instead of reporting them unknown.
// Fragments are checked against the pinned shared compiler ABIs in decoder tests.
export const ANCILLARY_ABI: Readonly<Record<ContractRole, readonly string[]>> = Object.freeze({
  governor: Object.freeze([
    'event VotingDelaySet(uint256 oldVotingDelay,uint256 newVotingDelay)',
    'event VotingPeriodSet(uint256 oldVotingPeriod,uint256 newVotingPeriod)',
    'event ProposalThresholdSet(uint256 oldProposalThreshold,uint256 newProposalThreshold)',
    'event QuorumNumeratorUpdated(uint256 oldQuorumNumerator,uint256 newQuorumNumerator)',
    'event TimelockChange(address oldTimelock,address newTimelock)',
  ]),
  treasury: Object.freeze([
    'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
  ]),
  timelock: Object.freeze([
    'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
    'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
    'event MinDelayChange(uint256 oldDuration,uint256 newDuration)',
  ]),
  budget_token: Object.freeze(['event Approval(address indexed owner,address indexed spender,uint256 value)']),
});

const interfaces = Object.fromEntries(Object.entries(ANCILLARY_ABI).map(([role, abi]) => [role, new Interface(abi)])) as Record<ContractRole, Interface>;

export function isAncillaryTopic(role: ContractRole, topic: string): boolean {
  return interfaces[role].getEvent(topic) !== null;
}
