# TV3 MetaMask insufficient-voting-power evidence

## Run identity

- Run ID: `TV3-MM-negative-20261126-4cba99a0`
- Source commit: `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`
- Chain ID: `31337` (Local Anvil)
- MetaMask Extension: `13.58.0`
- Foundry/Anvil: `1.8.5`
- Node.js: `24.15.0`
- PostgreSQL: `18.6` (Ubuntu package)
- Deployment name: `tv3-local-0xa6c8b5`
- Proposal threshold: `50 GOV`

## Negative case

- Account A: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, `400 GOV` voting power.
- Account B (manifest `outsider`): `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f`, `0 GOV` voting power.
- The form was valid: title `TV3 evidence: insufficient voting power`, recipient Account B, amount `1 BUD`.
- Browser `eth_accounts` returned Account B first and Account A second. The app and MetaMask both showed Account B as selected.
- Clicking **Tạo đề xuất** displayed: `Chưa đủ voting power đã delegate tại checkpoint quá khứ để tạo proposal.` No MetaMask transaction confirmation window appeared.

## Chain-state comparison

Before and after the repeated blocked attempt, Anvil remained at block `19` with hash `0x81a732f2b519c449c2d3b6babe165db663bb28c52a1a1f1b5d66d496e90efddf`. Account B nonce remained `0x0` at both `latest` and `pending`; `txpool_status` was empty (`pending=0x0`, `queued=0x0`). See `rpc-state-before-repeat.json` and `rpc-state-after-repeat.json`.

The app's submit handler awaits `assertCanPropose` before calling `sendGovernor` in `frontend/src/pages/CreateProposalPage.tsx` (lines 51–52). `assertCanPropose` reads the proposal threshold and past voting power and throws when voting power is below threshold (`frontend/src/chain/transactions.ts`, line 77 onward). The observed UI error matches that preflight guard. The browser provider request boundary was not instrumented for this run; the absence of `eth_sendTransaction` is supported by the guard path, unchanged chain state, empty txpool, and lack of a MetaMask confirmation prompt.

## API note

At capture time, `/api/health` reported database `up`, indexer `synced`, publication `ready` at block `17`, and `recoveryStatus=ready`. It also reported 16 unknown ancillary topics and zero decode errors. The DevTools capture additionally shows a `503 Service Unavailable` response from `GET /api/proposals`; this endpoint issue is preserved for TV4 review. It did not prevent the form's on-chain voting-power preflight from blocking the attempted proposal.

## Evidence files

- `submit-blocked-account-b.png` — original screenshot showing the active Account B, 0 GOV, valid form, block message, and MetaMask account.
- `browser-eth-accounts-console.png` — browser console result for `eth_accounts` (B appears first); also records the proposals API 503.
- `deployment-manifest.json` — deployment/source/compiler/ABI and role evidence.
- `rpc-state-before-repeat.json`, `rpc-state-after-repeat.json`, `rpc-state-after-submit.json` — read-only chain state snapshots.
- `SHA256SUMS.txt` — SHA-256 checksums for evidence files.
