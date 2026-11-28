# TV4 #20 — owner/operator accepted; signer/funding still blocked

Published [owner acceptance7240590072](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7240590072), responding to [TV2/leader nomination7238797965](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7238797965) and [TV1/SC10 packet7238535741](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7238535741). [Machine decision/evidence](2026-11-28-tv4-owner-acceptance.json).

## What changed

The user explicitly confirmed **dung0611 accepts deployment owner AND operator**, and accepts proposed full source **e17ef61a8a51518005c38b0808cdc06fe7a68bbf for preparation**. This removes the owner/operator-acceptance blocker; do not repeat appointment requests. Group lead is **daongocuong / TV2**; nvdungmim / TV1 retains technical security review/audit scope. This is not an implicit final release-source selection or broadcast permission.

Actual observed Dev is **f15f19252957d9ca37b424facdbb13afc8da0b05**, containing PR64 integration. Read baseline-to-Dev commit/path metadata: no deployment/contracts/sharedABI/dependency-pin delta. Do not silently move the owner-selected preparation source to latest Dev or evidence HEAD. Accepted [TV1 security review6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460) stays scoped accepted; no security/PR64/campaign rerun in this task.

## Actual remaining facts

| Gate | Actual status | Next owner/action |
|---|---|---|
| Deployment owner | CONFIRMED dung0611 | Appointment acceptance complete |
| Operator | CONFIRMED dung0611 | Not proof of holding signer keys |
| Preparation source | CONFIRMED e17ef61a8a51518005c38b0808cdc06fe7a68bbf | Preserve exact pin |
| Public actor map9 | MISSING, user has no public wallet address to provide | Owner/custodians privately create dedicated testnet wallets and provide public map |
| Six bootstrap signer custody/exclusive use/secure CLI path | NOT CONFIRMED | Each custodian confirms actual control and exclusive campaign use; no secrets sent |
| Caller demo signer/gas | NOT CONFIRMED | Separate signing/gas outside six bootstrap signers |
| Native ETH funder/source | UNKNOWN | TV2 coordinates a named funder or legitimate faucet source; no presumed team balances |
| Balances/nonces/actual-map estimates | NOT AVAILABLE | Read only after actual public addresses; canonical H/hash, pending/latest and headroom |
| Final numeric fee/budget | NOT APPROVED | Actual sender allocation and estimates required |
| Signing/ETH transfer/broadcast | NOT AUTHORIZED | Separate explicit user+owner decision bound to final SHA/map/network/K/scope/budget |

The user clarified **they do not know whether a Sepolia ETH source exists**. No funded status is inferred. The incomplete earlier funding selection is not evidence of ETH availability. No address means no balance query; do not write zero ETH as a measured balance. The map role `funding` is the BUD initial holder/seed-transfer account, not automatically the native ETH funder.

Sepolia11155111/PublicNode/K2 remains the chosen network. **0.12 Sepolia ETH** (0.10bootstrap +0.02demo/reserve) and **1gwei** remain a planning envelope, not funded balance/final approval. No fiat/mainnet ETH purchase or transfer is needed to establish a legitimate free-testnet funding option. Legacy type0 gasPrice/CLI cap semantics and actual-map estimation requirements remain unchanged; historical synthetic/fork estimates do not prove current funding sufficiency.

## Secure local onboarding, not agent key generation

[Updated runbook](../sepolia-deployment.md) gives one private Bash/WSL procedure using **existing directory + account-name arguments** to `cast wallet new`; pathless mode prints a private key and must not be used. Hidden password prompt is default according to actual CLI help. The example clears password environment overrides, keeps a fresh private directory/files outside Git, and prints only nine validated public addresses from encrypted-keystore metadata. No decryption, private key export, password argv/env, recording/tee, or upload is part of that workflow. Custody is not marked confirmed merely because instructions exist.

**Agent executed help only, not wallet creation, signing or secret access.** The required manual step is entering and safeguarding passwords at the owner's private terminal. Do not send private keys, seeds, passwords, encrypted keystore contents or raw signed transactions through GitHub/chat/agent tools. The existing deployment CLI decrypts six keystores in one trusted local process; MetaMask/hardware/distributed custody is not automatically a supported substitute.

## Potential ETH sources — not actual receipt evidence

- [Ethereum.org Sepolia resources/faucets](https://ethereum.org/developers/docs/networks/#sepolia) identify Sepolia for application testing and distinguish testnet balances from mainnet. It advises against reusing mainnet accounts on testnets.
- [Official Google Cloud Web3 Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia): inspected page presents sign-in. Owner eligibility/quota/access not verified; no login or claim performed.
- [Chainlink Ethereum Sepolia faucet](https://faucets.chain.link/sepolia): native ETH is separate from LINK; the site describes compatible-wallet connection. No connection/challenge/signature/claim performed; advertised drips are not owner balances or guaranteed entitlement.

Choose Ethereum Sepolia11155111/native ETH, not another chain's Sepolia or LINK. User/funder handles provider authentication/eligibility/quotas personally; no CAPTCHA/quota circumvention or agent account creation. Never submit keys/seed to faucets. If no legitimate faucet route is available, the leader must identify an existing funded team account/person. No one is assigned custody/funding by assumption.

## Coordination actually performed

- Posted one new #20 response with actual owner/operator/source acceptance and narrowly requested native-funder/source coordination from @daongocuong; no duplicate appoint-owner request.
- Updated #20 and #44 current summaries, preserving previous bodies as history; kept #20OPEN/BLOCKED/live testnetSKIP and #44notrelease-ready.
- Updated five shared docs plus this report/JSON. Upstream immutable TV1 draft/maps were not rewritten or replaced with Anvil/synthetic accounts.
- Project NOT UPDATED: existing browser/API Project authorization blocker; no OAuth/token/settings change.
- No receiver/#40/#42/service/process/chain operation, PR64 re-review/merge, main promotion/tag/release or Sepolia broadcast.

Next: owner/custodians supply the public map and actual custody confirmations; leader/funder confirms the native ETH source. TV4 can then check canonical balances/nonces and actual-map estimates read-only, prepare per-sender funding/budget, and submit the final packet. Transaction authorization remains a distinct later decision.

Final after-last-edit verification covers selected docs/links/JSON flags/secret-conflict-whitespace patterns and the documented shell/heredoc syntax/public-only address-extraction fixture. It does **not** generate a real wallet, contact a balance endpoint or prove testnet funding; observed results and normal-pushed SHA are reported in delivery chat.
