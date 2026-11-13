# TV4 Sepolia deployment path — 13 November 2026

## Scope and status

Separate path for **Ethereum Sepolia 11155111**, public read/broadcast RPC
`https://ethereum-sepolia-rpc.publicnode.com`, **K=2 descendants** (not consensus
finality), Solidity 0.8.37 / optimizer 200 / Osaka, voting delay/period 60/300s,
Timelock 120s. No local guard is relaxed: `deploy_local.mjs` still requires a
new, empty, unforked, numeric-loopback Anvil 31337.

This implementation is preparation, **not a testnet deployment or acceptance**.
No signer owner/public approved account map, native-gas authorization or signed
Sepolia transactions have been supplied. Actual deployment SHA and contract
addresses remain UNKNOWN. No Executed/Defeated claim is made. Do not replace
these missing addresses with local fixtures, the synthetic preflight map, or
fork contract addresses.

Current #20 decision and original review:
- [TV4 network decision](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-6787670054).
- [TV1 local security/deployment PASS; testnet BLOCKED](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-6763792761).
- [12 November testnet gate](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-6818101258).

## Public address-role map

Provide a public JSON object with **only** these keys:

| Field | Required value |
| --- | --- |
| `format` | `dao-budget-sepolia-accounts-v1` |
| `chainId` | string `11155111` |
| `approvedSourceCommit` | full accepted deployment Git HEAD SHA |
| `signerOwner` | named responsible signer owner; not a claim of peer approval |
| `accounts` | exactly A, B, C, D, funding, deployer, caller, recipient, outsider |

All nine addresses must be valid, distinct and nonzero. A/B/C/D initially hold
400/300/200/100 GOV and sign their own delegation. `funding` receives 20000 BUD
and signs the 10000 BUD seed only after the final role gate. `deployer` deploys,
grants and renounces bootstrap admin. Caller/recipient/outsider need no deployment
signer; their later campaign use must be authorized separately. Do not put a
private key, mnemonic, password, RPC credential or keystore contents in this map.
Unexpected fields are rejected before the map is journaled.

The owner must approve the exact integrated source revision and maximum fee / total
native-gas budget, use dedicated testnet-only accounts, obtain faucet gas for all
six signing accounts, and ensure no other process sends from these accounts during
the campaign. Independent TV1 approval is separate from the owner's address map.

## Secure signing, without requesting secrets

`deploy_sepolia.mjs` uses the real ethers encrypted JSON keystore implementation.
The signer owner runs it locally, retains the encrypted keystores, and supplies
passwords only via inherited file descriptors >=3. Passwords/private keys are
never arguments, environment variables, manifest fields, or chat/GitHub inputs.
Decrypted wallets remain in process memory only. No demo private key or unlocked
remote account is used. An owner may create/import the encrypted keystores with
`cast wallet import` interactively; do not use `--private-key` or shell history.

A private local signer-config JSON has exactly six entries A/B/C/D/funding/deployer.
Each entry contains `{ "path": "/owner/local/encrypted-keystore.json", "passwordFd": 3 }`.
Use a different inherited FD per password if necessary. It contains paths and FD
numbers, not passwords or decrypted keys. Restrict access to the owner; do not
commit or upload it. Keystore addresses are checked against the approved public
map before any broadcast. Owner-controlled inherited descriptors may be opened
from a protected local password manager/file; example shell redirection below
refers to a locally managed secret, not a request to publish one.

```bash
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:$PATH
# On a clean checkout of the accepted SHA, initialized submodules, npm ci:
forge build
# Obtain reviewed gas caps from the preflight; APPROVED_* are public permissions.
node scripts/deploy_sepolia.mjs \
  --accounts /owner/public-sepolia-accounts.json \
  --keystores /owner/private-signer-config.json \
  --output /owner/new-sepolia-deployment.json \
  --approve-chain 11155111 --approve-source "$APPROVED_SOURCE_SHA" \
  --max-fee-wei "$APPROVED_MAX_GAS_PRICE_WEI" \
  --max-total-cost-wei "$APPROVED_TOTAL_NATIVE_GAS_BUDGET_WEI" \
  3< /owner/protected-local-password-source
node scripts/check_roles_sepolia.mjs --manifest /owner/new-sepolia-deployment.json
```

The broadcast CLI hardcodes the selected public endpoint and chain/genesis, rejects
dirty tracked files, requires explicit exact-SHA/chain/budget permission, and will
not accept a fork manifest as a remote deployment. Receipt wait never resends.
Use the manifest's source SHA checkout when checking later; the checker deliberately
rejects a different HEAD or changed source/compiler/ABI/script bytes.

## Signer-independent read-only/fork preparation

```bash
# New output paths only. '-' creates conspicuously UNAPPROVED synthetic public addresses.
node scripts/preflight_sepolia.mjs --accounts - --output /tmp/sepolia-preflight.json
# Once the owner's public map is available, estimate that actual address/nonce path:
node scripts/preflight_sepolia.mjs --accounts /owner/public-sepolia-accounts.json \
  --output /tmp/sepolia-approved-map-preflight.json
```

The preflight records all remote JSON-RPC requests/results/errors and a pinned
K2 H/hash. Remote transport refuses send/Anvil methods. It attempts GOV creation
estimation with the actual compiled initcode on remote Sepolia at H using an
explicit synthetic balance state override (no state change); unsupported overrides
are recorded, never replaced with fictional remote success. It then starts a
caller-owned Anvil fork at that exact block/hash, verifies fork identity, impersonates
only on that disposable fork, sets synthetic gas balances there, and runs the entire
five-contract deployment, grants, role audits, renounces, delegations and funding.
Each of the 17 transactions has its own current-state estimate and actual receipt.
Two fork blocks are mined per transaction, **never on Sepolia**. Anvil is terminated
on success or failure. Full fork journal is retained beside the report.

These are real pinned Sepolia **state-fork** estimates but Anvil **Osaka** execution;
they are not a complete proof of the remote chain's later fork/gas rules. A successful
remote GOV estimate proves that constructor only at the recorded H/override. The
signed path separately runs `eth_estimateGas` on the real endpoint immediately
before every transaction. It applies 20% gas-limit headroom, checks the pending
block limit, current gas price against owner cap, balance, cumulative conservative
cost and pending/latest/expected campaign nonce. It refuses unexpected concurrent
signer activity. Do not copy the old local fixed 15M gas limit to testnet. Native gas
reported by the synthetic fork is not evidence that a real account is funded.

## Constructors, provenance, irreversible gates

The locked local configuration and shared provenance/role/operation audit are reused,
not copied. Local audit defaults remain chain31337; a separate strict Sepolia wrapper
supplies the trusted network policy and K2 audit height. The wrapper also audits a
canonical tip snapshot so the two confirmation-gap blocks cannot conceal roles or
operations; K2 and tip hashes are rechecked. Audits are observations at H, not an
atomic lock against another signer. Exclusive owner control and nonce enforcement
are required throughout bootstrap.

| Contract | Constructor |
| --- | --- |
| GOV | A, B, C, D |
| BUD | funding |
| Treasury | BUD, deployer |
| Timelock | 120, empty proposer/executor arrays, deployer |
| Governor | GOV, Treasury, Timelock |

The manifest binds exact HEAD, Solidity compiler/settings/locked OZ revision, source
hashes, artifacts, complete compiler ABI semantics/hashes, initcode and constructor
transaction, runtime identity (compiler immutable-reference normalization plus actual
linked getters), deployment receipts/blocks and contract ABI versions. Testnet script
hashes include the durable-journal helper. All observations are pinned by H/hash;
canonical receipt replay for **every transaction in every scanned block** cross-checks
role and Timelock operation `eth_getLogs`, so omissions, history outages, unknown or
temporarily granted/revoked holders, public executor, changed admins, stale/canceled/
executed bootstrap operations, wrong code/constructors/configuration all fail closed.
RPC pruning or provider range limits are blockers, not permission to skip history.

Before first renounce, bootstrap audit requires full final roles plus only the
approved deployer DEFAULT_ADMIN_ROLE; BUD remains entirely with funding and Treasury
is empty. The complete gate is repeated immediately before the first renounce.
Final audit gates funding after both renounces, and again after delegation. Final:

- Treasury admin + spender: only Timelock.
- Timelock admin: only Timelock; proposer/executor/canceller: only Governor.
- No zero/public executor, deployer or other EOA privilege; no bootstrap operation.

The new output file is reserved exclusively before chain writes. Mode0600 atomic
fsync/rename journals preserve unsigned requests, estimates, submitted hashes,
receipts and gate H/hash before progressing. A failure stops; it does not revoke to
hide history, fund anyway, auto-renounce, reset the chain, or retry a transaction.
A transport timeout may have broadcast a transaction before returning its hash:
**keep the journal and chain**, reconcile sender nonce/receipt with the owner, and
repair under retained authority or redeploy only after review. No automatic resume
is implemented. After partial renounce a reviewed recovery/new deployment may be
necessary; do not blindly rerun the deployment CLI.

## TV1 incremental review request (preserve completed local review)

Do not reopen the 10 November local PASS, SC02 handoff or mapping review. Review only:

1. Shared helper exports and trusted policy injection: local wrapper still refuses
   remote/fork/nonempty deployments; Sepolia chain+genesis+K2 cannot come from a
   manifest/CLI override.
2. Public map/exact-SHA acceptance, encrypted-keystore/FD-only signing, sender checks,
   no secrets in evidence, exclusive-account assumption and no automatic resend.
3. Remote current-state estimates, fee/total caps, nonce/balance/block-limit checks;
   pinned-state fork versus actual remote fork/gas compatibility limitations.
4. Durable manifest, constructor/runtime/ABI/source verification, complete receipt
   and historical role/operation audit at K2 and canonical tip; pre-renounce and
   pre-funding ordering, including partial-failure recovery.
5. New negative controls and unchanged original bootstrap suite at the integrated
   SHA. Then owner-authorized deployment followed by read-only role checker.

Only after the group accepts the integrated revision and TV1 approves this delta,
the named owner supplies the public map, secure local signers and approved native
gas may broadcast proceed. Actual Executed and Defeated proposals must wait for
real chain timestamps, record descriptions/actions/votes/tx hashes/receipts and
manifest at the same SHA; no time warp. Receiver-clone #42 and extension/API/UI
#19/#41 remain independent acceptance gates.

## Narrow verification and evidence

Affected suites: `node --test tests/smoke/bootstrap.test.mjs tests/smoke/sepolia.test.mjs`
after one `forge build`; the new suite's fresh-chain identity adapter is expressly
**synthetic**, not a Sepolia fork. Preflight above separately captures the actual
fork attempt and remote compatibility/gas result. Evidence and full command stdout/
exit codes are stored under `docs/evidence/tv4-20261113-sepolia/`; no testnet PASS is
inferred from either local suite or a disposable fork.
