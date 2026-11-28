# TV4 — scoped review and receiver gates, 25/11/2026

## Scope and method

Read-only review of public #42/#40/#41/#20/#44 comments, PR60/61 reviews and inline replies, and issue-comment streams for both PRs (PR60: five comments; PR61: none returned). Cached public API inputs were read on 25/11; PR60/61 issue comments were fetched separately with `per_page=100`. No comments/reviews were posted. No tests, builds, linters, formatters, benchmark, chain calls, service operations or archive extraction were run for this report. Existing test/CI results below are attributed historical evidence, not a new TV4 run.

Scoped source inspection used local `git show`/`git diff` only. No unrelated history, individual work, secrets, staging/OpenStack/SSH, server revival, merge, tag or broadcast was involved.

| Snapshot | Full SHA |
|---|---|
| PR60 reviewed candidate | `59426fb50607583b1bec77ec9d998a8fd0410cf5` |
| PR61 reviewed candidate | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| TV1 security-approved PR60 baseline | `b186844d1ff19ef26dfd83a060e7584bb6e0c419` |

These are research snapshots, not deployment authorization or automatic acceptance of later revisions.

## D — #42: authorize only a new, separately identified API restart check

[TV3 proposal7136310301](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7136310301) explicitly distinguishes API startup/worker restart from the missing independent API stop/start. Its historical run `20261111T071940Z-a0311f572edf`, source `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`, deployment `be09-local-20261111T071940Z-0210c9c44501`, H24 and revision `440c6ec1-f436-4f48-958f-07f68a80a99e` must remain historical, not be relabeled Dev/current candidate.

[TV4's accepted BE06 bundle scope](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7093754308) already covers original rebuild/exports/compare bytes. Do not ask for another BE06 rebuild, repeat upload, or reconstruction of missing historical API evidence. The useful new response is scoped authorization for the proposed **new API-only check on a TV3-owned receiver**, with exact source/toolchain/deployment agreed before execution. This is a TV4 scope decision, not a claim that TV2 has approved it.

### Worker progress: concrete existing API contract

The [actual API implementation](https://github.com/SE2026-21-1/dao-budget-simulator/blob/59426fb50607583b1bec77ec9d998a8fd0410cf5/indexer/api/server.ts#L462-L558), [health route](https://github.com/SE2026-21-1/dao-budget-simulator/blob/59426fb50607583b1bec77ec9d998a8fd0410cf5/indexer/api/server.ts#L692-L698) and [API contract](https://github.com/SE2026-21-1/dao-budget-simulator/blob/59426fb50607583b1bec77ec9d998a8fd0410cf5/docs/api.md#2-snapshot-đồng-bộ-và-phân-trang) establish:

- First materialize a real API read snapshot; then send **both** `asOfBlock` and `asOfBlockHash`, together with unchanged `chainId`/`deploymentId`, to the five data endpoints: summary, proposals, proposal detail, votes, transfers. Keep the same proposal/filter/limit and retain any actual returned cursor. Snapshot rows live in PostgreSQL, not API process memory; documented default TTL is 900 seconds, but capture the actual receiver configuration before testing.
- `snapshotRevision` is a returned context/cursor binding, **not an accepted query parameter**. Do not invent a revision parameter or expect an arbitrary old H to be reconstructable. Require before/after returned H/hash/revision and semantic data digest to agree while the materialized snapshot remains valid.
- `/api/health` explicitly rejects snapshot parameters; it describes the **current** pipeline. `context.sync` on pinned data responses is also current state. Capture all six raw HTTP status/body pairs, but do not require every body byte, current health H, heartbeat timestamp or sync counter to remain frozen.
- Keep worker, database and deployment unchanged. If the worker advances naturally, preserve raw and projection checkpoints/publication before and after, canonical H/hash, revision, timestamps and worker PID/logs. Explain the monotonic movement from actual records; compare the five pinned data payloads at the same H/hash/revision. Exclude only explicitly listed operational/cache fields from the documented semantic digest; retain raw bodies so exclusions remain auditable. Whole-DB byte equality is not an API-restart invariant: API snapshot/cache bookkeeping and a running worker may write legitimately.
- TTL expiry, source/revision change, recovery or reorg must retain the real 409/503 response, not be hidden by switching to unpinned latest or fabricating equality. A receiver revision other than the inspected snapshot requires TV2 to confirm its actual supported pin contract before the run. No worker restart/pause, new API feature or timeout/TTL relaxation is authorized by this proposal.

### Only proposed issue comment — #42 (draft, not posted)

> @LangXiTrum2005 — TV4 đồng ý phạm vi **một lượt API-only stop/start mới trên receiver do TV3 sở hữu** theo [đề xuất7136310301](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7136310301). Không dựng lại evidence cũ, không BE06 rebuild, không restart worker, không đổi DB/deployment. Trước khi chạy, TV3 ghi run/evidence ID mới, full source SHA, toolchain thực tế, deployment/chain và endpoint đang dùng; TV2 xác nhận baseline và cách đối chiếu backend trên đúng revision đó. Không tự coi source4cba99a là Dev, hoặc local/TV2 run là receiver acceptance; đây không phải tuyên bố TV2 đã approve, cũng không phải yêu cầu hồi sinh run lịch sử.
>
> Giữ trước/sau: raw checkpoint + publication, canonical H/hash/revision, semantic digest có quy tắc chuẩn hóa/phạm vi rõ ràng, **sáu HTTP status + raw body** (summary/list/detail/votes/transfers/health), API PID cũ/mới và ownership/listener, stop/start commands/logs và exit codes thực tế. Giữ worker PID/logs để chứng minh không restart; không gửi env/DB/credentials.
>
> Vì worker vẫn chạy, dùng snapshot API thật đã materialize và còn TTL: năm data endpoints ghim cùng `chainId/deploymentId/asOfBlock/asOfBlockHash`, kiểm returned revision; không thêm query `snapshotRevision`. Health không nhận H/hash và `sync` là trạng thái hiện tại, nên ghi riêng mọi tiến triển checkpoint/health cùng thời điểm và giải thích bằng logs; so semantic data tại cùng snapshot, không ép whole-DB/body byte equality. Nếu TTL/reorg/revision đổi làm409/503 thì giữ nguyên lỗi, không đổi sang latest để gọi PASS. TV2 xác nhận contract này trên SHA receiver trước khi thực hiện.
>
> TV3 thực thi; TV2 đối chiếu backend; TV4 kiểm bytes/evidence và quyết định nghiệm thu scoped. #42 giữ PARTIAL/In review đến khi có kết quả và kết luận; rebuild đã nhận không mở lại.

## E — TV2 BE08/performance/delivery and #41

### Latest TV2 decision and existing handoff

Latest TV2 reviews remain **CHANGES_REQUESTED**: [PR60 review6037802801](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037802801), [PR61 review6037801610](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#pullrequestreview-6037801610). The finding is late attempt five after the initial accepted snapshot, not the earlier five-second-boundary issue. TV2 credited the earlier boundary/stdout fixes and scoped delivery/CI evidence; that is not BE08 or whole-release approval.

Existing final handoffs already request the right delta: [PR60 reply4681002653](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#discussion_r4681002653), [PR61 reply4681002182](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#discussion_r4681002182). Keep the pending request and these links; no duplicate reminder/request or self-resolution is needed. No newer TV2 accepting review/reply appears in the inspected streams.

### Exact source comparison findings

`git diff --exit-code 59426fb cba8b6c -- <scoped files>` returned no differences (exit 0) for:

- `scripts/be08_worker_probe.mjs`, `scripts/be08_rpc_outage.mjs`, `scripts/benchmark_api.mjs`, `tests/indexer/be08-rpc-outage.test.mjs`, `docs/be08.md`;
- `indexer/abi-registry.ts`, `indexer/decoder.ts`, `indexer/projection/projector.ts`, `tests/indexer/decoder.test.ts`, `tests/indexer/projection-storage.test.ts`;
- `scripts/check_be04_live.mjs`, plus API server/main and `docs/api.md`.

This is selected-file equality, **not equality of both whole PRs or their ancestry**.

| Review delta | Observed source/evidence | Decision still owned by TV2 |
|---|---|---|
| Late fifth / sealed trace | `outage()` leaves AWAITING_FINAL_TRACE; memoized `close()` awaits clean worker close, closes acceptance and drains tracked async handlers under the existing 10-second shutdown deadline. It rechecks the complete same-ID lifecycle, removes stale passing summary, and retains failure on repeated close. Four deterministic regression variants preserve late-fifth/boundary rejection and bounded/interleaved/new-ID acceptance. [Source/report and before/after logs](https://github.com/SE2026-21-1/dao-budget-simulator/blob/59426fb50607583b1bec77ec9d998a8fd0410cf5/docs/evidence/be08-late-trace-20261124/report.md). | Re-review finalization/trace-to-report/exit behavior; do not infer approval from CI. |
| Decode hot path | Frozen per-registration topic→EventFragment index; lowercase lookup. Per-log decode/re-encode/raw validation remains; no decoded-payload cache. Regression covers uppercase topic, independent payloads and malformed trailing bytes. | Accept/reject topic-index delta. |
| Publication hot path | Set-based INSERT per nonempty table via `jsonb_to_recordset`; exact uint256 strings/UTF-8/arrays/source IDs and FK order retained. Existing transaction/lock/reconciliation/canonical/K/recovery checks surround publication and checkpoint commit. New multi-row test injects a rejected vote and asserts previous complete model/checkpoint remains. | Accept/reject SQL semantics, atomic rollback and lifecycle guards. |
| Native timeout | **FIXED in candidate**, not a still-open native-timeout blocker: new code/native packets report PR61 `a672fd2` and PR60 `7141d73` each PASS 13 suites and 20/20 freshness samples. Old failures remain failures of their original source; diagnostic profiling is not acceptance. [Performance report/raw inventory](https://github.com/SE2026-21-1/dao-budget-simulator/blob/59426fb50607583b1bec77ec9d998a8fd0410cf5/docs/evidence/be08-native-performance-20261124/report.md). | Independently decide the revised implementation/evidence; no new local run performed here. |
| Delivery | TV2's latest review already credited release/migration/Compose/verify-only scope. Current handoffs carry newer exact-head CI and continue to distinguish merge checkout, code-native revision and docs head; publish SKIP is not publish PASS. | Keep accepted scope; review any actual new delta, not repeat all accepted checks. |

Thresholds/load remain unchanged: freshness 30,000ms; p95 strictly <1,000ms globally/per endpoint; zero errors; 100 proposals/1,000 votes; 10 clients; minimum 60 seconds; 10 idle +10 load samples; four attempts/RPC5s/backoff; pool1/poll1s/K2. The owned-Anvil clock fix on PR61 matches PR60; it does not relax receipt timestamps, boundary assertions or production clocks. Existing reports bind native PR61 to `a672fd2`, not falsely to later `cba8b6c`.

### #41 — request already fulfilled; only newest TV2 disposition is useful

[TV2's newest #41 decision7129225892](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7129225892) accepts scoped receipt/API reconciliation at H52/hash/revision, one 11,000 BUD outgoing Transfer, Treasury 1,000 BUD. It requests two raw worker/SQL JSON links, **already delivered in7131321571**. No newer TV2 conclusion on those two files appears in the inspected issue/review/comment streams.

Use the [existing delivery/provenance7131321571](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7131321571) and its exact public files; do not download/extract the packet or regenerate JSON again:

- [worker-publication-H52, evidence commit7221c13](https://raw.githubusercontent.com/SE2026-21-1/dao-budget-simulator/7221c131f558a6566c715c371e58899acb05dccc/docs/evidence/tv4-20261124-h52/extracted-worker-publication-H52.json): 1,346 bytes, SHA256 `619a4f7375bbfb66263a5c17e1949b1891a7ec24aad133eda8b5f18b21984ee2`.
- [sql-reconciliation, same commit](https://raw.githubusercontent.com/SE2026-21-1/dao-budget-simulator/7221c131f558a6566c715c371e58899acb05dccc/docs/evidence/tv4-20261124-h52/extracted-sql-reconciliation.json): 1,968 bytes, SHA256 `9b27aff41993be137b721218bc8abb3bd4fc51e82e997ad25dc576c329649981`.

Preserve SQL `deployment_id=1` versus API deployment name `qa07-e2e`; excerpt SQL does not independently retain lookup/bound parameter values. Preserve `projectionAtQuery=H58` as later query context, **not publication H52**. The original disbursement binding remains H52/hash/execute transaction. Do not relabel or silently bridge these namespaces/heights. Only remaining worker/SQL decision and TV4 scoped sign-off are useful; no repeated receipt/API review or campaign is requested. #41 remains Blocked/Open. No new comment draft: the exact request and links are already handed off.

## F — receiver/lifecycle, security and owner/release gates

### #40: only new receiver/lifecycle evidence can advance it

Latest [TV4 disposition7093754608](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7093754608) already accepts offline technical scope for TV3 source `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`, run `20261121T164230Z-1d31cb975ecc`, deployment `be09-local-20261121T164230Z-eb6f2a6c4641`. Do not rerun verified six GET/CORS/worker restart/live-FE portions or claim that historical services are still alive.

No later receiver/lifecycle evidence appears in the inspected #40 stream. Missing original raw output remains owned-PID/listener absence after stop, Windows transport/health/context/CORS, task/process restoration and foreground `serve` exit. Vite/Anvil “not owned; left untouched” does not prove absence or released ports. If old raw output was not retained, TV3 must say so; a separately proposed/new run cannot be presented as original evidence. Existing [coordination handoff7128243064](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#issuecomment-7128243064) already covers this. Keep PARTIAL/In review; no duplicate comment or automatic service revival.

### Security: honor unchanged scoped approval

[TV1 APPROVED review6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460) is explicitly limited to signing/submission identity, receipt/journal/role-audit security at `b186844`. It marks submission identity FIXED; it does not approve BE08/browser/release or authorize spending gas.

Scoped `git diff --exit-code b186844 59426fb -- <files>` returned no differences (exit 0) for all six shared Sepolia helpers (`governance_sepolia`, `deploy_sepolia`, `check_roles_sepolia`, `check_sepolia_readonly`, `preflight_sepolia`, `sepolia_cli`), `tests/smoke/sepolia.test.mjs`, local governance/deploy/role guards, `docs/sepolia-deployment.md`, `scripts/check_be04_live.mjs`, `tests/integration/TimelockGovernance.t.sol`, `.github/workflows/verify-release.yml` and `deploy/operations.test.mjs`.

Therefore do **not** demand another review of unchanged security source/tests. Preserve the approval's limited scope and signed-identity/receipt-binding/zero-descendant/journal/no-resend guarantees. The unchanged Sepolia runbook's older “TV1 must re-review” wording is superseded for disposition by the newer explicit APPROVED review; it is not evidence of a newly open security finding.

### #20: owner gates remain public and exact

The [existing owner checklist](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7093831057) and [latest coordination handoff](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#issuecomment-7128243064) remain effective. No new owner authorization is present in the inspected comments. Do not repeat reminders, select custodians/addresses/revision for the owner, ask for secrets or broadcast.

Required before any send: owner-selected full approved deployment SHA/artifacts; nine distinct public addresses A/B/C/D/funding/deployer/caller/recipient/outsider; named custodians and secure exclusive custody/use of six signers A/B/C/D/funding/deployer; actual-map canonical native balances/estimates, numerical gas/fee caps and total budget plus gas funder; explicit broadcast authorization bound to exact SHA/map/Sepolia11155111/budget. Technical security approval and read-only RPC readiness do not supply this authorization. Keep K2, pending/latest/expected nonce, durable journal, fail-stop and no automatic resend.

Actual deployment manifest/runtime/constructor/final-role/history/receipt audits and same-deployment Executed+Defeated testnet evidence using real elapsed time remain separate acceptance after authorization. Do not replace them with local/fork/synthetic receipts. #20 stays BLOCKED; server retirement does not remove smart-contract Sepolia scope.

### #44: still gated, no empty status comment

[Latest #44 disposition7123827757](https://github.com/SE2026-21-1/dao-budget-simulator/issues/44#issuecomment-7123827757) is supplemented by the newer PR60/61 performance handoffs above: old native timeout is fixed and TV1 security is approved within unchanged scope. Do not keep those two superseded blockers alive. Remaining gates are TV2 revised BE08/performance and #41 worker/SQL disposition; TV3 harness/consumer/account-switch; #40 receiver/lifecycle; #42 new API-only evidence; #20 owner permission and actual testnet; group-approved exact-SHA demo/video. CI/native green does not close them.

Keep #6/#7 In review and #20/#41/#44 Blocked; no whole-release Done, merge, promotion, tag, broadcast, staging/SSH or cloud rollout. No standalone comment draft is needed for #40/#41/#20/#44 or PR60/61 while existing requests already contain the exact evidence/handoff. The only newly useful public reply is the scoped #42 authorization draft above.
