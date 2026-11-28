# TV4 — Issue #19 QA07 account-switch evidence review — 2026-11-25

## Scope and disposition

**FUNCTIONAL PASS SUPPORTED / EVIDENCE PARTIAL.** Accept the submitted bytes as support for the narrowly scoped site-authorized A→B→A stale-signer/no-send case on recorded product source `6766e5ee2d8c466542687cbeb09677c4d11e5463`. This is an independent offline review of the actual attachment, not a claim that TV4 observed the original browser interaction live. The contemporaneous B screenshot and exact MetaMask version remain missing. Do not call Submit disabled, or call this full/current-head Issue #19 acceptance. **Keep #19 open / FULL_ACCEPTANCE_PENDING.**

Reviewed the issue body and all six supplied comments, including the latest handoff. Public anchors:

- [Issue #19 body](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19).
- [Prior scoped historical review](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7095167550).
- [Approved-source extension work and account-switch gap](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7097738807).
- [TV3 handoff, limitations and declared checksum](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7134770655).
- [Actual shareable redacted ZIP](https://github.com/user-attachments/files/35336910/TV3_Issue19_QA07_Stale_Signer_SHAREABLE_REDACTED_20261124.zip).
- [Approved product source](https://github.com/SE2026-21-1/dao-budget-simulator/tree/6766e5ee2d8c466542687cbeb09677c4d11e5463); [account-switch checklist](https://github.com/SE2026-21-1/dao-budget-simulator/blob/3166adcb3e9ebd9599a26e79b374791a20bde395/docs/qa07-e2e.md#account-switch-phần-evidence-tối-thiểu-còn-thiếu-của-19).

No governance campaign rerun, live endpoint access, chain mutation, signature, broadcast, server revival, build, test, lint or formatter was performed. Archived loopback URLs are provenance only. Evidence bytes and downloaded source comparisons stayed outside the repository in a newly created isolated temporary directory; this report is the sole repository artifact from this review.

## Attachment integrity and safe handling

Downloaded the public attachment with `curl --fail --location`; actual size **1,575,039 bytes**, **23 files**, no directory entries. Independently computed SHA-256:

```text
eb6aefafc60724bff4bc13ab6565a5d82655e3bb55fbcd850ed52508f34c5824
```

This exactly matches comment 7134770655. Python `zipfile.testzip()` returned no bad member. Before extraction, inspected every member for absolute/traversal paths, backslashes, NULs, drive-style prefixes, duplicate names, symlinks and encryption: none found. Extraction used a fresh directory and exclusive-create (`xb`) files, so no existing evidence was overwritten. No archived code was executed.

`sha256sum --check SHA256SUMS`: **22/22 OK**. Independently checked that the checksum list has exactly 22 distinct entries and covers every archived member except `SHA256SUMS` itself. Archive SHA protects that remaining checksum-list member. Integrity demonstrates received-byte consistency, not independent authentication of the original observations.

### Complete member inventory

| Member | Bytes |
| --- | ---: |
| `A_return_provider_20261124.json` | 3,118 |
| `A_return_rpc_20261124.json` | 1,233 |
| `A_review_current_before_switch_20261124.json` | 1,400 |
| `B_after_blocked_submit_rpc_20261124.json` | 1,216 |
| `B_before_submit_rpc_20261124.json` | 1,461 |
| `B_blocked_submit_provider_20261124.json` | 1,940 |
| `B_site_authorized_before_submit_20261124.json` | 2,433 |
| `PROVENANCE.md` | 3,249 |
| `README_SHAREABLE.md` | 1,369 |
| `REDACTED_TAB_STRIP__A_return_provider_trace_original_capture_20261124.png` | 958,394 |
| `REDACTED_TAB_STRIP__A_return_review_original_capture_20261124.png` | 333,877 |
| `REDACTED_TAB_STRIP__user_supplied_chrome_metamask_delegate_20261124.png` | 284,621 |
| `SHA256SUMS` | 2,269 |
| `delegate_confirmation_blocks_20261124.json` | 3,981 |
| `delegate_nonce0_receipt_20261124.json` | 6,781 |
| `drop_queued_nonce6_20261124.json` | 3,270 |
| `funding_eth_20261124.json` | 3,500 |
| `funding_gov_20261124.json` | 5,340 |
| `handoff.json` | 1,253 |
| `manifest.json` | 100,121 |
| `pre_funding_verified_20261124.json` | 1,126 |
| `pre_review_switch_rpc_20261124.json` | 1,392 |
| `stale_nonce_queued_delegate_20261124.json` | 3,239 |

## Source, deployment and account identity

The manifest, handoff, A baseline and B RPC/provider exports consistently record approved product source `6766e5ee2d8c466542687cbeb09677c4d11e5463`. A baseline separately records tooling source `3166adcb3e9ebd9599a26e79b374791a20bde395`; these are not interchangeable. Independently downloaded the 12 non-`lib/` source files listed in `manifest.provenance.sourceHashes` from the exact public product commit and compared SHA-256: **12/12 match** (`foundry.toml`, `foundry.lock`, `package-lock.json`, four deployment/governance/role scripts, and five first-party contract/interface files). Dependency hashes and compiled artifacts were not rebuilt/reverified. The packet does not provide a full frontend served-asset attestation; source labels are not proof of every runtime byte.

- Claimed run label in `PROVENANCE.md`: `20261124T081807Z-tv3-account-switch`.
- Neither `manifest.json` nor `handoff.json` has a dedicated `runId`; handoff `deploymentId=qa07-e2e` is generic. Unique run identity is therefore **partial**, not independently proved by that label alone.
- Chain: `31337` / `0x7a69`; confirmations: **2**.
- Genesis: `0xbf48bc3c82308c9f095294b82fb69a9d32425e21de16ef725a531fd6ff2d8c9c`.
- Anvil instance: `0x225d244ff7c262cbd38d1e0ee7421b1b9ff381732c2eb6fdcee56c9ef29feaa8` (`anvil/v1.8.5`).
- Actual manifest SHA-256: `eed749340e0530538195bb6695ea4ad11e7cf33698ddab49d9c32ba3c0bcfbbc`; matches handoff and relevant exports.
- Actual handoff SHA-256: `6732e7d3255bbef64b9c9ac28c017b40b1f99a160aa28f19711dd889ee67e479`.

Manifest and handoff contract addresses independently reconciled:

| Contract | Address |
| --- | --- |
| GOV | `0x0116686E2291dbd5e317F47faDBFb43B599786Ef` |
| BUD | `0x9bAaB117304f7D6517048e371025dB8f89a8DbE5` |
| Treasury | `0x1Eb835EB7BEEEE9E6bbFe08F16a2d2eF668204bd` |
| Timelock | `0x31A65C6d4EB07ad51E7afc890aC3b7bE84dF2Ead` |
| Governor | `0x2706A171ECb68E0038378D40Dd1d136361d0cB7d` |

Browser accounts, not the manifest fixture aliases:

- Extension A: `0xA6BE0B9c35ade169093EF3959409330E4227C20A`.
- Extension B: `0x9ade2810182cb3e7cef4e49ef270698d1efaf72a`.
- Manifest fixture A (`0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`) funded extension A with **0.001 ETH** at H22 and **400 GOV** at H23. These are unlocked-fixture transfers, not MetaMask Governor signatures.
- Extension A's nonce-0 self-delegation has receipt status 1 at H24: `0xed8ab0a96360c69e8bc5011cf7363a578019fdf56394c141f0e2a6b630a6b811`. Its logs record self-delegation and 400 GOV voting power. Confirmation exports extend the same chain through empty H25 and H26.
- A prior nonce-6 delegation `0x6e47ac60b7435c9359c1289d9d02af84a5d199eaf5ee507ae479184996df0da3` was queued with no receipt at H23, then explicitly removed with `anvil_dropTransaction` before the nonce-0 delegation. It is preparation history, **not** a stale proposal broadcast during A→B→A. The reviewed switch interval starts later at an empty H26 txpool.

## What the actual records establish

### Retained draft and eligibility

A baseline (`A_review_current_before_switch_20261124.json`) explicitly supersedes an earlier draft after a page remount; do not merge the earlier preparation into one uninterrupted observer session. The subsequent B and A-return exports describe no reload during the switch interval.

The same title, description bytes, recipient, **1 BUD** amount and request ID occur in A baseline, B pre-submit, B-blocked and A-return records; independently compared these values, not just the summary flags:

```text
title: QA07 TV3 stale signer test #19
description: Draft only for TV4 Issue 19 account-switch acceptance. Transfer 1 BUD to the disposable TV3 test wallet. Do not submit.
recipient: 0xA6BE0B9c35ade169093EF3959409330E4227C20A
requestId: 0x43ddf72a3ca64e95908fa21270bd3d9db4399be94cfe6acadf9bace5c4e68cda
```

A and B pre-submit both record native value **0 ETH**. B-blocked/A-return exports omit native-value fields; the A-return Review screenshot visibly shows 0 ETH. Do not claim a complete encoded-calldata comparison: this case intentionally produced no proposal transaction.

`B_before_submit_rpc_20261124.json` records checkpoint **1800003549**, A past votes **400 GOV**, B past votes **0**, and proposal threshold **50 GOV** (`50000000000000000000`). This is a valid eligible-A/ineligible-B control. B also has zero ETH, but the recorded UI reason is insufficient delegated past voting power; do not substitute a guessed gas failure for the recorded guard.

### Real site authorization, not only global wallet selection

The provider records show `isMetaMask=true`, one provider, chain `0x7a69`, and these retained events/results:

| UTC | Observation |
| --- | --- |
| 13:53:55.240 | `accountsChanged([B,A])` |
| 13:55:29.445 | `eth_accounts → [B,A]`; `eth_chainId → 0x7a69` |
| 14:00:55.864 | B Submit attempt export: `eth_accounts → [B,A]`; matching active B and chain |
| 14:04:59.824 | `accountsChanged([A,B])` |
| 14:05:57.301 / 14:06:11.652 | `eth_accounts → [A,B]`; A-return UI header matches A |

These page-provider events plus the B active-signer export distinguish this case from the earlier unsuccessful global-selection-only attempt. A remained second and authorized while B was first; this does **not** invalidate the active-signer switch, but does not test removal of A's permission or a B-only authorized account list.

### Click-time guard, no stale send

`B_site_authorized_before_submit_20261124.json` explicitly says `submit_disabled=false`. `B_blocked_submit_provider_20261124.json` records **one click**, then:

```text
Không gửi được giao dịch.
Chưa đủ voting power đã delegate tại checkpoint quá khứ để tạo proposal.
eth_sendTransaction_count: 0
```

The recorded error is `role=status`, not `role=alert`. The observed behavior is **enabled Submit → eligibility preflight → blocked before transaction request/signature**, not a disabled button. The checklist requires blocking before signature; it does not require a permanently disabled button. There is no evidence here of a stale A send or of a B send. No signature prompt or proposal receipt is expected for this preflight failure, and none should be fabricated.

Independently compared pre-B-click, post-B-click and A-return RPC exports:

| Invariant | All three snapshots |
| --- | --- |
| Canonical head | H26 (`0x1a`) |
| Head hash | `0x70114d1c0c6b79369e3c6b73d35e18268fde943db401429967e267263d5d6b3f` |
| A latest / pending nonce | **1 / 1** |
| B latest / pending nonce | **0 / 0** |
| Txpool pending / queued count | **0 / 0** |
| Txpool content | empty pending and queued maps |

Genesis, chain, head, account ETH/GOV/current votes and both nonces also compare equal. Together with the page observer's zero send count, this supports **no broadcast and no stale signer send in the captured interval**, not a universal wallet-wide negative claim. The supplied records are retained observation/RPC exports rather than a complete independently authenticated network recording. The observer is page-scoped and tracks accounts/chain/send; it cannot establish all activity in other pages or unrecorded intervals.

## Criterion-by-criterion assessment

“Proved” below means directly supported by the received bytes and cross-checks within this offline scope, not independently replayed live.

| Criterion | Result | Basis / limit |
| --- | --- | --- |
| Actual public ZIP, declared SHA, CRC and safe inventory | **Proved** | Actual download; exact SHA; 23 files; all CRCs valid; safe exclusive extraction. |
| Internal checksum completeness | **Proved** | 22/22 digests and exact member coverage excluding checksum list itself. |
| Approved-source provenance | **Partial** | Source labels agree; 12 first-party manifest source hashes independently match public exact commit. No complete served-frontend attestation or rebuild. |
| Deployment/chain linkage | **Proved** | Handoff/manifest hashes, contracts, genesis and H26 records reconcile. |
| Unique run label | **Partial** | Label is declared in provenance; generic deployment ID and no dedicated runId field. |
| Eligible A / zero-power B controls | **Proved** | 400/0 past GOV at checkpoint versus 50 GOV threshold; funding/delegation preparation preserved. |
| Site-authorized A→B→A active signer | **Proved** | B-first/A-first `accountsChanged` and `eth_accounts`, active-signer/UI exports; not mere global selection. |
| Draft/requestId retained | **Proved** | Exact retained title/body/recipient/amount/requestId comparisons; native 0 ETH present in A/B pre-submit and A-return screenshot. No transaction-calldata claim. |
| B prevented from transaction signing/submission | **Proved within captured scope** | Recorded click-time voting-power failure; send count 0; unchanged RPC state. Contemporaneous B screenshot missing. |
| No stale A or B broadcast | **Proved within captured scope** | A1/B0 latest and pending nonces unchanged, identical H26/hash, empty txpools, zero page send count. |
| Submit disabled before click | **Missing / not observed** | Records explicitly show enabled Submit. This is not the safety criterion and not automatically a product bug. |
| B-active blocked/error visual evidence | **Missing** | No original B-time screenshot/video in ZIP. A-return screenshots cannot replace it. |
| Real extension/browser identity | **Partial** | MetaMask UI, `isMetaMask`, one provider, extension ID `nkbihfbeogaeaoehlefnkodbefgpgknn`, retained Chrome UA `157.0.0.0`; exact MetaMask version unknown. |
| B-only permission / A permission revoked | **Missing / outside submitted case** | B is first but A remains second; not a prerequisite of the demonstrated active-signer guard. |
| Full #19 acceptance / current PR-head regression | **Missing from this packet** | No full-campaign or newer-source acceptance claimed; earlier evidence retains its own scopes. |

### Screenshot and provenance limits

All three actual PNGs were visually inspected. The Review screenshot shows MetaMask Account 1/A, retained 1 BUD draft/request ID and the earlier voting-power error. The provider screenshot shows A active, A400 voting power, A-return trace and zero send count. Both were taken **after returning to A**, so they corroborate the return state and retained error, not a B-active blocked moment. The third screenshot concerns delegation and shows a wallet failure toast beside a confirmed app delegation status; it is not B-blocked proof and does not override the saved successful delegation receipt.

`PROVENANCE.md` declares an original unredacted ZIP SHA `b1d61f38ca5fb34c87cb9b1a04b235e64fb0a7c2605f9648716ad8741ff432ad` and original-to-derivative screenshot hashes. Originals are not in this shareable archive, so those original hashes and the claimed unchanged pixels below the redaction strip were **not independently verified**. The received derivatives visibly have dark tab strips and their own bytes/checksums were verified. No need to request unrelated private tab content or browser profiles.

Unknown MetaMask version, missing B screenshot, post-A timing, generic run label and A's secondary authorization are evidence limitations, **not automatic defect findings**. This review identifies no demonstrated stale-send failure in the supplied interval.

## Minimum remaining evidence and draft #19 response

For an unqualified documentary sign-off of this account-switch gate, request only:

1. A privacy-safe original screenshot or short unaltered recording **while B is active**, showing the retained Review/requestId and the error immediately after the single Submit attempt. Prefer a previously retained capture if it exists; do not re-label A-return captures as B. If none exists, one isolated account-switch/draft/no-send recapture suffices; no proposal lifecycle rerun is required. Bind any new capture to its own source/manifest/session and before/after nonces/trace rather than presenting it as the old H26 run.
2. Exact MetaMask version/package or extension-details evidence for the reviewed session, if retained. Otherwise explicitly retain UNKNOWN for that session and record the exact version in any narrow recapture. Do not borrow the version from TV4's separate extension run.
3. If retained, a source/manifest-linked run identity record for the claimed run label. This is provenance clarification, not a request to rebuild or resurrect the archived chain. A-only/B-only permission testing is not required to accept the demonstrated first-account switch.

These requests do not reopen previously reviewed historical checksums, happy path, wrong-network/refusal/revert/retry, or unrelated backend/UI gates. Full #19 closure remains a separate integration/reviewer decision using all exact-scope evidence; this packet alone does not authorize it.

### Draft comment — not posted

> TV4 đã tải và kiểm bytes attachment ở comment 7134770655: SHA-256 `eb6aefafc60724bff4bc13ab6565a5d82655e3bb55fbcd850ed52508f34c5824`, 23 file, CRC/path safety đạt, checksum nội bộ 22/22 khớp. Manifest/handoff cùng source `6766e5ee2d8c466542687cbeb09677c4d11e5463`; 12 first-party source hashes trong manifest khớp public commit.
>
> **Tiếp nhận FUNCTIONAL PASS SUPPORTED cho case account-switch, EVIDENCE PARTIAL.** Raw `accountsChanged`/`eth_accounts` thể hiện site-authorized A→B→A; draft 1 BUD/requestId giữ nguyên. A400/B0 past votes so với threshold50; B bị chặn sau một lần bấm Submit ở pre-signature eligibility guard, không phải nút đã disabled. `eth_sendTransaction=0`; nonce latest/pending A1→1, B0→0, H26/hash và txpool trống không đổi, hỗ trợ không stale-send trong interval ghi nhận.
>
> Giữ rõ giới hạn: thiếu ảnh đúng lúc B bị chặn; hai ảnh Review/trace là sau về A; MetaMask version chưa xác minh; A vẫn được site cấp quyền ở vị trí thứ hai; run label chưa có dedicated runId. Các điểm này không tự là product bug, và global wallet switch không đồng nghĩa site account-switch.
>
> Chỉ xin bổ sung ảnh/clip B-active + lỗi + draft/requestId nếu đã giữ và version MetaMask của session nếu còn. Nếu không có ảnh, một recapture riêng case draft/account-switch/no-send, gắn source/manifest/nonces/trace/version của chính session mới, là đủ; không rerun cả governance hoặc dựng lại H26. Run identity xin làm rõ từ record còn giữ, không khởi động lại chain. #19 tiếp tục mở/FULL_ACCEPTANCE_PENDING; đây không phải full/current-head sign-off hay đề nghị đóng issue.
