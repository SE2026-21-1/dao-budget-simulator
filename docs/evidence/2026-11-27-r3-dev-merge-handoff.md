# TV4 — candidate → Dev merge handoff, 27/11/2026 (r3)

## Source merge is not release acceptance

This is the current candidate handoff. Earlier27/11 reports remain historical snapshots; their #42 “NOT READY” and static-only integration statements are not current blockers. **#42 independently PASS scoped** at source896f93e/H22; issue signoff/closure remains the user's/group's decision. [Immutable r2 acceptance](https://github.com/SE2026-21-1/dao-budget-simulator/blob/a265434cd2c4f3acde4b382dfd9274d581961584/docs/evidence/2026-11-27-r2-acceptance.md), [#42 report/inventory](https://github.com/SE2026-21-1/dao-budget-simulator/blob/73617327ba6c6244120ff13b4da948aa7ff44042/docs/evidence/2026-11-27-r2-issue42.md), [unposted issue drafts](https://github.com/SE2026-21-1/dao-budget-simulator/blob/a265434cd2c4f3acde4b382dfd9274d581961584/docs/evidence/2026-11-27-r2-handoff-drafts.md).

Dev-source merge gates are conflict-free actual fetched base, appropriate CI on the current PR head/merge context and another person's scoped review under the repository process. Separate release/testnet gates below are **not automatically Dev-merge blockers**. No merge, auto-merge, promotion, release/tag, rollout or Sepolia broadcast is authorized in this handoff.

## Pinned provenance and integration path

| Identity | Full SHA |
|---|---|
| Actual fetched Dev before PR | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| Existing verified candidate before this docs-only handoff | `ff3ee48290f32b46fb1789c136bfd202cb176490` |
| Runtime actually executed for r2 local checks | `9417d4cecb774b301e29e2ed7fe6cb3c7e28f308` |
| PR60 contained head | `24f66b6cae0f13651c622625adcc687e6d11fffd` |
| PR61 contained head | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| Evidence seal | `73617327ba6c6244120ff13b4da948aa7ff44042` |
| Detailed evidence/docs head, not runtime | `a265434cd2c4f3acde4b382dfd9274d581961584` |

Fresh Git refs confirm Devd63842 and candidateff3ee48. Candidate tree58497a34c1091ae8ec4cca326c23eeadcd3d79f4, parents1ac7c3f776fff4d94392af2ac31d461f73652dc8+d63842; its PR61-history mergea84fb234f9bf76e70aadac6894ec56ff0bde3c20 has parents PR60 then originalPR61. `git merge-base --is-ancestor` for Dev/PR60/PR61 returns0; `git merge-tree --write-tree candidate Dev` exits0 and returns candidate tree. This handoff adds documentation only and preserves those parents/authors/history. Actual final PR head/base/run IDs/checked-out commit are recorded in the PR, not guessed in this self-containing source file.

Proposed maintainer path: review this single candidate PR into Dev using a history-preserving merge. It already contains the pinned PR60 and PR61 histories; do not independently replay/squash/cherry-pick their duplicate BE08 changes. **Keep PR60/61 open** until the maintainer compares their then-current heads and chooses their disposition. No PR21/55/personal/individual source or ancestry was imported. Do not import the whole docs branch: immutable links above preserve evidence provenance without duplicating its broad packet.

## Technical decision and review delta

Dev introduced administrative ABI recognition while BE08 introduced a frozen topic index. Taking either side alone loses behavior. `indexer/abi-registry.ts` builds **one** `registeredAbi = [...abi, ...ANCILLARY_ABI[role]]` per registration; the same union creates the Interface, frozen public ABI and frozen eventsByTopic index. No Interface/index/union is allocated per log. Decoder retains malformed/indexed-topic/canonical-roundtrip/unknown-topic checks; valid admin events remain outside business projection.

Preserved: SQL batch/FK order/uint256 precision/atomic publication+checkpoint rollback; same-ID/method/params/backoff/max-attempt controls and late-fifth final-trace guard; BE07 owned-Anvil clock/header assertions; keccak256(signedRaw), durable SIGNED-before-send, strict RPC response identity, receipt/K2 binding/no auto-resend, both funding-substitution regressions;3migration/manifest +4release tests and verify-only workflow. Inherited Dev infrastructure source does not revive #56 staging or authorize operations.

Narrow review against already-reviewed PR60/61 focuses on registry union/current-Dev administrative integration and automatically combined decoder/storage tests. The complete Dev PR diff also contains inherited PR60 signing/TC10/QA07 changes, whose accepted scopes remain source-bound rather than a blanket approval:

- TV2 `daongocuong`: union admin-topic recognition, frozen index using that same union, decoder/projector/storage integration and rollback regressions. Existing BE08 approvals6053195381/6053196499 do not approve the new union.
- TV1 `nvdungmim`: only any genuinely new ABI/security integration delta and required PR conclusion; existing TC10 approval6011704131 and signing/security6037012460 stay scoped. No changed contract/signing implementation in this docs-only continuation.
- TV3 `LangXiTrum2005`: only actual consumer/QA07 integration delta and required PR conclusion. Prior COMMENT6055560601 resolved pinningP2, not whole-PR APPROVED; consumer/frontend source is not newly modified here.

Pending requests and review history must be checked before sending one scoped request. Do not request accepted campaigns again, self-approve, dismiss or resolve reviewers' discussions.

## Verification provenance and safe CI route

[Recorded r2 commands/limits](2026-11-27-r2-integration.md) and [portable raw checks](https://github.com/SE2026-21-1/dao-budget-simulator/tree/a265434cd2c4f3acde4b382dfd9274d581961584/docs/evidence/2026-11-27-r2-integration-raw): typecheck/build exit0, **184PASS/0FAIL/0SKIP** (108decoder/admin/BE08/QA07/release +44signing/funding/bootstrap +21rawPGstorage +11projection/rollback), plus liveBE04 PG18.4/Anvil1.8.5 **PASS**,10phases/8checks/24receipts. These ran at9417d4ce, **not a fresh local run on this final docs HEAD**. They are not added to new CI totals.

Candidateff3ee48 previously had no CI. PR60run45869593683 belongs24f66b6, not candidate proof. Existing `.github/workflows/ci.yml` and fallback workflow have unfiltered pull_request triggers, so opening this PR is sufficient despite push branches excludingtv4/**. No trigger/permission/gate change or empty commit is needed. CI includes reusableBE08 and container/Compose validation; publish/image-save/upload are restricted to pushDev and must remain **SKIPPED** on this PR. Do not dispatch verify-release or operations workflows. Infrastructure validation is path-filtered; no infrastructure path changed relative to currentDev.

Record each actual run's event/head/base, log-backed `git log -1 --format=%H` checkout/merge ref, job/step conclusions and publication skips. CI source failures require a root-cause fix before retry; do not reduce load/timeout/assertions/K/thresholds. Final result lives in the PR and separate evidence record so recording completion does not churn the validated candidate head.

## Repository process and release-only dependencies

No applicable tracked AGENTS.md, CODEOWNERS or CONTRIBUTING file found. Fresh branch API reports/rules/protection access are retained in the external PR evidence; an inaccessible404 is not assumed permission to bypass policy. [Current checklist](../tv4-checklist.md) requires review by another person; [README](../../README.md) separates peer review/current integration CI from release acceptance. GitHub mergeability/permission alone is not scoped review approval.

- #19 remains provider-boundary/session-version/raw503 scope; B-active/provenance already accepted.
- #40 remains access/ownership HOLD and narrow Windows/WSL receiver lifecycle; not a failed run, not LinuxTV4 substitution.
- PR62 live acceptance needs approved current endpoint/instance/deployment, independent runtimekeccak, exact historicalH/hash/EIP1898requireCanonical/archive behavior and numeric policy; no latest fallback/deployment for proof.
- #20 needs deployment-owner-approved fullSHA/map9publicaddresses/custody+signing6signers/numericgas+fee+funder/explicitbroadcastauthority and later actual testnet evidence. No secrets requested.
- #44 needs group-confirmed exactsource/manifest/report/demo/video. Dev merge would not establish full acceptance/release readiness.

Keep #18/#36/BE06/bounded invariants accepted; #41 local pipeline accepted and10Ready(single)N/A. Normal required CI may exercise existing suites on the new source without reopening those historical acceptance decisions. Issue signoff drafts remain unposted; no issue is closed by this PR handoff.
