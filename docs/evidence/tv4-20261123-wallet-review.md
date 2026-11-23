# TV4 — Issue #19 wallet evidence review, 23/11/2026

## Decision and source boundary

**Accept the delivered historical happy-path record with explicit evidence limits; FULL_ACCEPTANCE_PENDING.** The ZIP and three screenshot files are now delivered and reviewed. Do not retain “no accessible ZIP/screenshots” as a current blocker. This is not independent historical chain verification, full real-extension acceptance, or acceptance on the current approved source.

- Historical source: `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`.
- Historical run: `20261122T151715Z-3cb615b2187f`.
- Deployment: `be09-local-20261122T151715Z-17bb72e04967`, local chain31337.
- Historical proposal: `62849244793568770327830970846656297920794061083257884506153138992139515370756`.
- Request: `0xe3e4e13dc391dcd088115b4f9412b3fc3880887d679d48d92f57cd6f6f2ff3a1`.
- Reported operation: `0xb5553ad2a81e9e9d63e15ce37b6fdafe872279d4a76512cb96464775f0e8d34c`.

The old in-memory Anvil is offline after Windows shutdown; no saved verified state dump/final receipts/full final API responses are supplied. The new disposable20261123 chain is excluded even if chainId, genesis, addresses and ports coincide. Dev`6766e5ee2d8c466542687cbeb09677c4d11e5463` is not historicale8e443c. PR60/61 are not whole-integration approved. This review does not transfer historical results to either revision or bypass peer review.

## Actual attachment inspection

[Downloaded attachment](https://github.com/user-attachments/files/35253529/TV3_Issue19_Consolidated_Delivery_20261123.zip), **679453 bytes**, SHA256:

`592361fd38fdd85a768d1bac686a2e03d3fd994a83775988ec9f185008f07614`

Observed **28 regular files**, no directory records or duplicate names,847552 uncompressed bytes; no absolute/traversal paths; ZIP CRC integrity clean. Computed SHA256 and byte size for all28. Top-level `SHA256SUMS` matches **27/27** files (excludes itself); SourceA matches **14/14** and SourceB **7/7**. Consolidated source index matches **23/23** source-file bindings; historical manifest matches **13/13** pre-manifest included files. These overlapping checks are coverage, not additional test cases. Full inventory and seven source bindings are in [machine-readable review](tv4-20261123-wallet-review.json).

Read all included original report/matrix/README/ledger/draft statements and structured provenance/indexes; inspected original PNG pixels, not filenames alone. Seven BE09 script SHA256 values match immutable `git show e8e443c:<path>` blobs. This binds those seven scripts, not every compiled contract/indexer/frontend runtime byte or the screenshot's build. The bootstrap verifier itself notes its hashes describe the verification worktree rather than reconstructing deployment state.

### Original input ZIP provenance — no envelope overclaim

The consolidated index records two prior archives:

| Source | Original ZIP name | Recorded bytes | Recorded SHA256 |
|---|---|---:|---|
| A | `TV3_Issue19_Final_Review_20261123.zip` |31238|`79e8d8dd8881f9b7f04d7c9c776400e70c1418a832182372df20252ea2aae5a7`|
| B | `TV3_Issue19_Evidence_Review_20261123.zip` |638563|`848f2ab3338322814643a5ee8a972215ac68254f8d60124fe4bba295765e3bfb`|

Neither original ZIP envelope is embedded in the attachment. `checksumVerified:true` is the consolidator's statement, **not an independent TV4 check of those two archive hashes**. TV4 verifies their delivered member bytes and internal manifests. SourceA's earlier “screenshots absent / ZIP not found” and local-only statements are preserved history, superseded for delivery by the actual consolidated attachment. SourceB explicitly says its ledger is conversation-derived, not raw RPC receipts. Its old draft placeholder is not a publishing instruction.

## What the saved bytes support

### Ledger and happy path

TV3 reports real MetaMask Self-delegate→Create→TV3 For vote→Queue→Execute. Six hashes agree between SourceA ledger, SourceB index/report and posted progress; the visible Create/Queue/Execute hashes also match screenshots:

| Action | Reported block | Transaction |
|---|---:|---|
| Self-delegate |29|`0x7a5f6e0b7527f039bf1b1dafcd88f6a696819e7e4d4962f2e97f00e7018454b6`|
| Replacement proposal Create |36|`0x2231c8d8a82c41a3adbb9d754b0a5b7a9ab969e2feced47631db56463e91d9c9`|
| TV3 For60 GOV |40|`0x37192fbf0acb6d34386438f7d6e1c63f938d2dbf608a72d2f03b4c097db2b5fa`|
| AccountA For340 GOV |41|`0x5041c03cb5f4a2f4129eab24982db8e3496b70342d2b0b6f11167d73c465a24a`|
| Queue |47|`0x7054f81c9ac7bcc94e84a09e3228b84d33cf330e499833f89a737cfb996afa37`|
| Execute |53|`0xc0917add0bc8389361586e2af8f203381122f1ab114c750545cb97e5bc0b1a2a`|

**AccountA's340 GOV vote was unlocked local Anvil, not MetaMask.** Screenshots corroborate400 GOV For/quorum200/1 BUD, with60 GOV balance/voting power for TV3. TimelockReady→Done, Governor7, receipt status1, request paid, recipient0→1 BUD and ordered Transfer/BudgetDisbursed/CallExecuted/ProposalExecuted remain **historically reported live checks**, not raw-chain results independently reverified here. Accept support for this historical record without promoting those reports into independently chain-verified assertions.

### Saved H53 worker line

`source-a-historical/historical/final/worker-publication-H53.jsonl`,538 bytes, SHA256 `687ffee339ec85bac70d63e8c5a54a72a86829a88721e7c9cd35f1bee188f3db`, contains:

- chain31337, deploymentId1, H53, hash`0x6971f932fd727f1942eef2193da9ff8378874eb9a9e805388f03eaa3024e9cb4`, timestamp1800005850, revision`4ffb6fea-001f-4e55-9ef0-33cb554d563d`, dataKindchain;
- counts:3 proposals,4 votes,2 operations,3 transfers,2 disbursements;
- totalIn10000 BUD, totalOut1001 BUD, balance8999 BUD;
- `ignoredAncillaryEvents=16`, **`rawDecodeIssues=16`**.

The manifest attributes it to original worker.log line10993, whole-log SHA256`81305b335a888dac712c943e9e0f99e526c3b339234ffef7b4c361a6dad15dba`. The whole log is not delivered, so source-line membership/full-log digest is reported provenance, not independently recomputed. The exact delivered excerpt is verified; it is aggregate publication evidence, not a per-request receipt/API body. “0 decode errors” is TV3's historical report; do not equate it to `rawDecodeIssues` or claim a saved health JSON proves it. Preserve degraded/unknown ancillary-topic warnings, not fully healthy.

### H24 bootstrap is a different proposal and payment

Bootstrap proposal`85033959057062009095055709644487027886063896898440812188508422353819508755887`, request`0x00617eacb17a392c2d2c8a1d4eebebf734a23b1fe9983b0a4f460fbc1557f7ad`,700 GOV For,1000 BUD to another recipient, executed H24/hash`0x5860855e3ccfada24292e2347ae9b20eb3433940ba82fe50b07e340c17edfe3e`. Its execute hash is`0x91008b6c830be0c9309f8e1fd83a05532657a3bed61d48f92c0640769a3ac0d7`. Bootstrap verification records sixGET200, contract/API comparison, worker restart and live frontend test1/0 **at H24**, not finalH53. No tests were rerun for this review.

Bootstrap left Treasury9000. H53 totalOut1001 is consistent with bootstrap1000 plus the reported TV3 payment1, leaving8999. This is arithmetic corroboration, not an independent final transfer proof. Same snapshot revision does not make H24 and H53 the same publication.

## Three actual screenshot observations

All are1920px wide. Exact PNG hashes/dimensions and per-image limitations are in JSON. None supplies390/1366 viewport or keyboard/focus evidence.

| Original PNG | Directly visible | Limit |
|---|---|---|
| `01_governor_succeeded_metamask.png` (1920×1028) | Chrome toolbar/loopback URL with exact proposal; appH44 Succeeded,400 For/quorum200/1 BUD, Queue control; **queue-confirmed** tx banner; MetaMask-branded side panel Account1`0xA6BE0…7C20A`, LocalAnvil and connected127.0.0.1:5173; generic confirmed toast | Not a Queue signing prompt or queue receipt. App is still on pre-Queue indexed snapshot. |
| `02_governor_queued_metamask.png` (1920×1021) | Chrome toolbar/URL; appH50 Queued, ETA, matching Create/Queue hashes, Execute control; **execute-confirmed** tx banner; same MetaMask account/network/origin and generic confirmed toast | Not a TimelockReady read, execute receipt or signing approval. App is still on pre-Execute indexed snapshot. |
| `03_governor_executed_metamask.png` (1920×878) | Same full proposal; appH53 Executed,1 BUD,400 For/quorum200, matching Create/Queue/Execute hashes, no Execute control; description says2 votes/1Transfer reconciled; same MetaMask account/network/origin | Cropped: Chrome toolbar absent. No displayed canonical hash, Treasury/recipient BUD balances, paidRequest, TimelockDone or full API response. |

These are useful visual evidence of real MetaMask-branded browser context and **confirmed-not-indexed→published** app states. They do not expose an extension ID/version or actual signing approval dialog, nor prove which provider signed each action. Branding/account visibility must not be described as cryptographic extension identity or receipt attestation. No visual edits were made; only original PNGs were extracted to temporary storage outside the repository.

## Minimal missing bytes and acceptance gates

### Historical supplement: only preserved bytes, not a repeat campaign

- [ ] If already retained: exact final execute receipt+raw logs binding status1, block53/hash, proposal/request/operation/recipient and1e18 BUD transfer. Earlier action receipts are welcome if retained, not a demand to redo them.
- [ ] If already retained: full final raw HTTP status/headers/JSON for publication/context, proposal detail, votes, Treasury transfers, summary and health, all at the H53/hash/revision boundary.
- [ ] If already retained: matching direct contract reads for Governor/Timelock/paidRequest/balances and any raw before/after recipient output.

The bundle says these final files were not saved. **Do not request restoration, reconstruct receipt-shaped JSON, use bootstrapH24, or query a new chain to fabricate the missing historical proof.** If unavailable, retain this historical limitation and the scoped acceptance above. Missing historical raw files are not a reason to rerun the entire old campaign.

### Approved-source acceptance — checklist snapshot trước lượt TV4 mới

Fresh results hiện hành nằm ở [approved UI](tv4-20261123-approved-ui.json),
[real extension](tv4-20261123-real-extension.json) và
[account-switch partial](tv4-20261123-account-switch.json): wrong-network,
signature refusal, receipt0/retry1 đã có evidence mới; account-switch chưa được
chấp nhận. Các ô dưới đây giữ snapshot của lượt review bundle lịch sử, không
phải tuyên bố rằng TV4 chưa chạy các case mới hoặc chuyển chúng sang sourcee8e443c.

Use a disposable test-only wallet and chain; never personal wallet/seed/key. Each case needs approved revision/relevant file hashes, run/deployment/manifest identity, public account/chain, installed browser+extension identity/version, precondition/action/result, and evidence files+hashes. Keep source labels honest; never call adapter/unit outcomes extension results.

- [ ] **Wrong network:** actual extension network differs; UI identifies mismatch and blocks signing; action attempt/no send recorded, then proper recovery after switching back.
- [ ] **Refusal/cancel confirmation:** actual wallet approval prompt then Reject/cancel; UI rejection/safe state and4001 if emitted; no broadcast/receipt. Popup cancellation is not a Governor.cancel transaction. Historical execute meets the happy-path execute-or-cancel alternative; do not invent a mandatory separate contract-cancel campaign.
- [ ] **Controlled revert/error+retry:** disposable reproducible failing precondition; real extension action, exact call intent and UI handling. If mined, save status0 receipt/block and unchanged payment/state; if estimation/wallet blocks broadcast, report that rather than claim a mined revert. Save recovery/retry receipt/publication when exercised.
- [ ] **Account switching:** actual extensionA→B and accountsChanged; address/power refresh, stale signing intent invalidated, no unintended old/wrong-account send.
- [ ] **Form/HTML/layout/keyboard:** reuse qualifying exact-source evidence from #36/#41; BigInt/address/description validation, unchanged action bytes, safe literal HTML and390/1366/focus trace. No duplicate full campaign required.
- [ ] **Current happy-path attribution, if requested:** one fresh proposal on approved source with a new run identity and saved raw receipts/events plus same-H/hash/revision contract/worker/API/UI boundary. This establishes new-source acceptance; it does not repair/relabel the stopped historical chain.

Until those applicable gates are actually evidenced and reviewed, #19 remains open/FULL_ACCEPTANCE_PENDING. A local extension-installation problem is an environment blocker, not proof of a negative-case PASS.

## #40/#42: do not duplicate completed scoped review

[Existing bundle review](tv4-20261123-bundles.md) and [inventory](tv4-20261123-bundles.json) remain the evidence source; no #40/#42 old checksums were rerun here or called new proof. Parent supplied latest-fetch finding: no newer TV3 files. TV4 comments#40`7093754608`/#42`7093754308` already delivered scoped review. User's earlier waiting-review image is stale.

Remaining requests stay narrow: #40 already-retained final PID/port/Windows restoration and missing raw lifecycle/transport/status outputs; #42 receiving-machine API restart before/after context/checkpoint/digest/six responses, **not another rebuild/checksum campaign**. They are not grounds to reject the newly delivered #19 screenshots or request a whole historical wallet rerun.

## Published scoped review

TV4 posted this historical-bundle decision and the minimal remaining evidence
at [issue19 comment7095167550](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7095167550).
Fresh approved-source runs are separate evidence; they do not rewrite this
historical review or repair missing raw files from the stopped chain.
