
# DAO Budget Simulator — Smart Contracts

## TV1: Smart Contracts & Governance

### Technology

- OpenZeppelin Contracts: v5.4.0 (proposed, pending team approval)
- forge-std: v1.17.0
- Solidity: 0.8.37 (proposed)
- Foundry: 1.8.5

### Contracts
- GovernanceToken: GOV voting power
- BudgetToken: BUD budget currency
- Treasury: token disbursement
- BudgetGovernor: proposals and voting
- TimelockController: delayed execution

### Treasury Interface

disburse(bytes32 requestId, address recipient, uint256 amount)

Event:
BudgetDisbursed(requestId, recipient, amount)

### Business Rules
- One proposal contains exactly one disbursement
- Disbursement must use BUD, not native ETH
- Recipient must be valid
- Amount must be greater than zero
- Each requestId may be paid successfully only once
- Only the authorized timelock may disburse
- Insufficient balance must revert the entire execution

### Integration
- TV2: event and receipt reconstruction
- TV3: contract calls and wallet integration
- TV4: deployment, roles and security testing

Status: SC01 draft — pending team review.



## Governance Configuration (Draft)

| Parameter | Value |
|---|---|
| GOV total supply | 1,000 GOV |
| GOV distribution | A=400, B=300, C=200, D=100 |
| BUD total supply | 20,000 BUD |
| Initial Treasury balance | 10,000 BUD |
| Token decimals | 18 |
| Proposal threshold | 50 GOV |
| Quorum | 20% |
| Voting delay | 60 seconds |
| Voting period | 300 seconds |
| Timelock delay | 120 seconds |
| Clock | ERC-6372 timestamp |

## Smart Contract Architecture

GovernanceToken:
- ERC20Votes
- Self-delegation
- Historical voting power checkpoints

BudgetToken:
- ERC20 mock token
- Fixed initial supply
- No transfer fees

Treasury:
- Stores BUD tokens
- Executes authorized disbursements
- Prevents duplicate requestId payments

BudgetGovernor:
- Creates proposals
- Records voting results
- Enforces proposal restrictions
- Queues and executes through Timelock

TimelockController:
- Enforces execution delay
- Holds Treasury spending authority

## Treasury Interface

Function:
disburse(bytes32 requestId, address recipient, uint256 amount)

Event:
BudgetDisbursed(
    bytes32 indexed requestId,
    address indexed recipient,
    uint256 amount
)

## Access Control (Planned)

| Role | Authorized contract |
|---|---|
| Treasury SPENDER_ROLE | TimelockController |
| Treasury DEFAULT_ADMIN_ROLE | TimelockController |
| Timelock PROPOSER_ROLE | BudgetGovernor |
| Timelock EXECUTOR_ROLE | BudgetGovernor |
| Timelock CANCELLER_ROLE | BudgetGovernor |
| Timelock DEFAULT_ADMIN_ROLE | TimelockController |

Deployment must revoke temporary deployer privileges.

## Business Rules

- One proposal contains exactly one BUD disbursement.
- Recipient cannot be zero address or Treasury.
- Disbursement amount must be positive.
- Each requestId can be paid successfully only once.
- Only the authorized Timelock can spend Treasury funds.
- Insufficient Treasury balance reverts the execution.
- Voting uses delegated voting power at snapshot.
- For + Abstain counts toward quorum.
- Approval requires For > Against.
- Only the creator can cancel a Pending proposal.
- Successful proposals require queue and execute.
- Native ETH transfers are not supported.

## Pending Team Decisions

- Confirm exact dependency versions with TV4.
- Confirm description v1 format with TV2 and TV3.
- Confirm event indexed fields with TV2.
- Confirm custom error names and arguments.
- Confirm ABI consumer requirements with TV3.

Status: SC01 draft, pending team review.
