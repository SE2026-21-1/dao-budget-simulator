# BE02 synthetic log fixtures

Every log in this directory is **synthetic**. Addresses, transaction hashes, block hashes and coordinates are artificial. These files are neither mined receipts nor evidence that BE02 has passed SC06 acceptance. No SC06 implementation ABI or chain receipt was present on the current Dev baseline.

`events.json` contains one RPC-shaped log for each of the eleven supported events. It exercises indexed fields, non-indexed fields, dynamic arrays/bytes/strings, Unicode, and uint256 values exceeding JavaScript's safe integer range. Decimal ABI integers are expected as strings. Regenerate deterministically with `npx tsx fixtures/be02/generate.ts`; the generator does not touch BE01 fixtures.

`independent-transfer.json` is a hand-assembled independent decoder vector. Its canonical `Transfer(address,address,uint256)` topic is `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`, the two addresses are left-padded to 32 bytes, and the data word is hex `0de0b6b3a7640000` (decimal `1000000000000000000`). Neither the generator nor the decoder ABI registry constructs this vector, so the decoder tests do not depend solely on an encoder/decoder round trip.

ABI provenance (event subsets, awaiting confirmation against SC06 deployed artifacts):

- Governor: [OpenZeppelin Contracts 5.4.0 IGovernor.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/governance/IGovernor.sol), ABI ID `oz-5.4.0-governor`. `ProposalCreated`, `ProposalQueued`, `ProposalExecuted` and `ProposalCanceled` have no indexed fields; `VoteCast` indexes only `voter`.
- Timelock: [OpenZeppelin Contracts 5.4.0 TimelockController.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/governance/TimelockController.sol), ABI ID `oz-5.4.0-timelock`. `CallScheduled` and `CallExecuted` index `id` and `index`; `Cancelled` and `CallSalt` index `id`.
- BUD: [OpenZeppelin Contracts 5.4.0 IERC20.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/token/ERC20/IERC20.sol), ABI ID `oz-5.4.0-erc20`. `Transfer` indexes `from` and `to`.
- Treasury: repository `shared/abi/ITreasury.json`, matching `contracts/interfaces/ITreasury.sol` from SC01, ABI ID `sc01-itreasury-v1`. `BudgetDisbursed` indexes `requestId` and `recipient`.

The OpenZeppelin commit above is pinned in `foundry.lock`; its upstream source was inspected without changing vendor submodules. Replace or add ABI versions after TV1 provides the actual implementation ABIs, deployment addresses/blocks and receipts. Preserve these synthetic vectors as unit-test inputs.

Text storage policy: invalid UTF-8 or a decoded Solidity string containing NUL produces `DECODE_ERROR` and remains raw-only. NUL is valid Solidity string data but unsupported by PostgreSQL JSONB; the original ABI bytes are retained without replacement so this text policy can be revisited later.
