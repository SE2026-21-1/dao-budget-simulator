# TV4 — public signoff, integration review and handoff, 28/11/2026

## Disposition

**#42 technical PASS scoped; PR63 NOT MERGED, scoped peer gate pending; PR62 COMMENT/live SKIP; #6/#7 In review/PARTIAL; #44 NOT RELEASE-READY.** This delivery publishes previously unposted acceptance and corrects actual dependencies. It is not a new receiver, browser-wallet, benchmark, live RPC or testnet campaign. No actionable source defect was found, so no implementation/test/workflow change was made.

[Machine state and persisted Project fields](2026-11-28-tv4-state.json). Work branch `tv4/acceptance-20261128` starts at evidence commit **16c0ab21bee2022bf478bc0fc2a10137ba8e68b3**, not the PR63 candidate. Do not merge the broad evidence branch into that candidate. Original checkout57e8cba and existing worktrees/user changes were preserved; work is isolated at `/tmp/dao-tv4-acceptance-20261128`. Root/tracked applicable AGENTS/CONTRIBUTING/CODEOWNERS absent; repository checklist requires another person's PR review.

## Fresh identities

| Identity | Full SHA |
|---|---|
| Actual fetched Dev / PR52 head | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| Actual main / PR52 base | `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` |
| PR63 candidate head | `4f6a3968e9538e1a17fd95c38284c02b2b0c9e3a` |
| PR63 historical log-backed actual checkout | `fe8df7cd1019d01b38f5f71a0a78865127c29f80` |
| PR63 head/merge tree | `ae72560970b82ba308813f2d9930765c6a9cd4f8` |
| PR60 / PR61 heads, contained in candidate but not yet Dev | `24f66b6cae0f13651c622625adcc687e6d11fffd` / `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| PR62 unchanged Draft head | `d4a0fb563e66be951760167a6f62b246821dc17c` |
| Prior r2 executed runtime, not a new local run | `9417d4cecb774b301e29e2ed7fe6cb3c7e28f308` |
| #42 independent evidence seal / r2 docs | `73617327ba6c6244120ff13b4da948aa7ff44042` / `a265434cd2c4f3acde4b382dfd9274d581961584` |

Authenticated GitHub API read full current issue bodies/comments, PR/review/thread/request/CI state. Fresh discovery since27Nov found only #63/#42/#40 updates, no new producer artifacts, deployment-owner packet or group release choice. PR63 reviews0/threads0, sole pending daongocuong request; no duplicate request was sent. Existing TV1/TV2/TV3 conclusions retain their exact source/scope.

## Published actions

| Target | Confirmed public action | Remaining owner/action |
|---|---|---|
| #42 | [TV4 independent signoff7234721032](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7234721032); current body removes receiver-not-ready/API-missing | OPEN/In review for group/TV2/TV1 final issue disposition, not another technical run |
| PR63 | [Full relevant source/CI author audit7234792896](https://github.com/SE2026-21-1/dao-budget-simulator/pull/63#issuecomment-7234792896), no new finding | TV2 union/admin/decoder/storage scoped peer conclusion; author audit is not peer approval |
| PR62 | [TV4 COMMENT review6096047429](https://github.com/SE2026-21-1/dao-budget-simulator/pull/62#pullrequestreview-6096047429) on exact d4a0fb5 | Draft retained; owner-approved live configuration absent, live SKIP; TV2/TV3/caller review remains separate |
| #19 | [Scoped B-active/preflight/provenance acceptance7234792353](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7234792353) | TV3 provider interval/session identity; TV2+TV3 retained raw503/log packet only |
| #40 | [Readiness HOLD acknowledgment7234792567](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7234792567), not lifecycle FAIL | TV3/receiver owner authorized isolated Windows/WSL inventory and narrow lifecycle/restoration/actual serve exit |
| #44 | [Aggregate acceptance/dependency correction7234810916](https://github.com/SE2026-21-1/dao-budget-simulator/issues/44#issuecomment-7234810916) | Group/lead exact source/manifest/report/demo/video; NOT RELEASE-READY |
| #6/#7/#19/#20/#40/#41/#42/#44, PR52 | Eight issue bodies and PR52 description updated; old bodies preserved verbatim in superseded details | No issue closed; PR52 remains Draft; #6/#7 PARTIAL, #41 local pipeline ACCEPTED |
| Project#1 | Eight items × `Bằng chứng / SHA` and `Phụ thuộc / cần xác nhận`, real UI edits and reload/readback | Existing whole-issue status/acceptance retained; no Done or broad release promotion |

## #42 signoff basis and limits

Read [sealed report](https://github.com/SE2026-21-1/dao-budget-simulator/blob/73617327ba6c6244120ff13b4da948aa7ff44042/docs/evidence/2026-11-27-r2-issue42.md), [inventory](https://github.com/SE2026-21-1/dao-budget-simulator/blob/73617327ba6c6244120ff13b4da948aa7ff44042/docs/evidence/2026-11-27-r2-issue42-inventory.json), all43 current pre-signoff comments and [TV2 backend7212241945](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7212241945). No changed/missing/inconsistent bytes require redownload. Independent checks occurred27Nov; not rerun28Nov.

Runtime **896f93ea282d76fa72339a97ea12339240c16da4**, attempt **api-restart-attempt-20261127T134827+0700**, TV3 WSL, chain31337/deployment `tv3-issue42-20261127`, SQL ID1. H22/hash **0x3b9fd152a6d4946883c3cb206bd4e18d5ffb8629dfb137d55169ab9e027e94c8**, revision **edc6f818-67a1-4b6e-90b1-22844197db90**. Restart archive SHA256 **f05b176ebfea53dcb43fb89a00a0275192c4b9dc55abdcbe92f00a2a42bd94af**,78/78 checksums; supplement37/37, metadata34/34 actual (TV2 historical33 retained). Inventory152files/149payloads.

Twelve HTTP200, six unchanged URL pairs, five semantic digest pairs independently MATCH; checkpoint/publication/scope/canonical/header prefix consistent. Snapshotff83df86-df42-4532-a98d-e705576ec210 not invalidated, effectiveTTL899.837095s/default900, last capture394s before expiry. API listener9959→14532/newwrapper14504; Anvil5756/PG6595/worker9667 retain PID/starttime/identity, heartbeat advances. TERM command exit0 is **not** actual oldAPI termination status (uncaptured); newAPI still running at capture, termination N/A. Missing continuous shutdown/worker transcript remains a documented limit, not invented exit0/143. Health200/degraded/rawunknown16/0decodeerror is historical source behavior, not complete decoding or explanation of unrelated503.

All technical scoped gaps are accepted with original source/run limits. BE06 independent rebuild/compare accepted at source4cba99a/H24 remains separate; four exit0 remain historical report. Latest TV2 explicitly leaves whole issue for group disposition, so #42 stays open. Seal is not permission to stop its receiver for #40. No BE06 rerun/worker-PG restart/redeploy.

## PR63 complete source audit and CI binding

Read all relevant implementation/tests/workflow differences against actual Dev, not just union conflict hunks. No new actionable finding:

- Registry creates one business/admin union per registration for the same Interface/frozen ABI/null-prototype frozen topic index; no per-log union/index. Canonical decoder and role-specific admin classifier require valid decoding before ignoring admin; malformed/indexed-topic/unknown/roundtrip controls retained.
- SQL set-based batches preserve decimal uint256 strings, exact UTF-8/arrays/null source fields, FK insert/delete ordering, stable replay identity, shared advisory-lock transaction and all-table/publication/checkpoint rollback. Decoder/storage tests retain admin compiler layouts/16raw logs/redecode/unknown and trigger-failure controls.
- Same logical RPC ID/method/params, positive backoff/max4attempts and final sealed-trace late-fifth/interleaving/boundary guards retained; owned-Anvil interval0 and actual timed receipt-header assertions remain.
- signedRaw Ethereum keccak identity and durable SIGNED journal precede broadcast; strict response identity, receipt block/hash/index/membership/K2 binding, no automatic resend, both funding-substitution regressions remain. Contract/QA07 pin/revision/DOM sources match their scoped reviewed versions.
- All4 release +3 migration/manifest tests and verify-only workflow preserved. Inherited Dev infrastructure source is not deleted and does not authorize retired staging operations.

[Existing immutable readiness/log/artifact record](https://github.com/SE2026-21-1/dao-budget-simulator/blob/16c0ab21bee2022bf478bc0fc2a10137ba8e68b3/docs/evidence/2026-11-27-pr63-merge-readiness.md): fresh run/job APIs still match every historical ordered step/conclusion, both attempt1. [46034162713](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46034162713)10success/1publishSKIP; [46034162609](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46034162609)1success. All11 historical log-backed actual checkouts fe8df7cd, not eventHEAD4f6a396; merge parents Dev+candidate and tree match. Existing compiler/frontend warnings remain. No rerun/new download or PR60CI substitution.

Artifact15215558819 unexpired, unchanged ZIP digest **026f5cf81f1a70344a86ce8cabf75c29837f77ab4ad479cf6e5b3dd45eb3f0cb**; five sealed preserved payloads match,292 tested-source SHA256 entries match candidate. Historical native13suites/18commands exit0/empty source patch retained; repeated suites not aggregated into unique totals. Publish/image-save/upload SKIPPED is correct PR condition, not publication. Infra validation N/A/not triggered; verify-release not dispatched.

TV1 TC10/security approvals and TV2 BE08 approvals preserve exact unchanged scopes; TV3 COMMENT6055560601 resolves pinningP2, not whole-PR approval. New union/admin integration still needs TV2 review already requested. **No merge commit exists and no post-merge Dev CI exists in this task.** Keep PR60/61 open; only after eventual merge recheck then-current heads/ancestry and close integrated duplicates through GitHub, never replay implementation. Refresh refs/reviews/checks immediately before any permitted history-preserving merge.

## PR62, remaining receiver and owner gates

PR62 code/static review rechecked bigint/base-unit/JSON, uniqueness/failure atomicity/conservation/order/retry/input bounds and workflow. Adapter requires independently trusted patched runtime Ethereum keccak, chain/Treasury/BUD binding, exactH/hash/EIP1898requireCanonical, canonical anchors, bounded whole-read abort/deadline/fail-closed; archive/finality remain external. Historical144PASS and PR/push actual checkouts e604426703610b1a5bbdf07df0dddf8a9ac8f109/d4a0fb5 remain historical, seven existing CI runs SUCCESS. No approved current endpoint/instance/deployment/runtime identity/pin/numericconfirmation-finality-staleness policy: live SKIP, not unit proof of provider behavior. No guessed endpoint/latest fallback/artifactSHA256 substitution/deployment.

#19 evidence887c5ec unchanged8files; prior7/7/visual/preflight/provenance accepted without download. Only continuous selected-provider interval before Submit through guard settle(method/time/accounts/from), actual same-session About/manifest and raw503 URL/query/headers/body/UTC/context+TV2logs remain. No-popup/unchangednonce/head/txpool supports no-send inference, not absence of provider calls. H26versionUNKNOWN/imageMISSING and503causeUNKNOWN retained; new13.58.0 is producer-declared, not H26.

#40 latest7221841931/7222076540 reports access/namespace limitations, no preflight/serve run. Clean approvede8e443c already confirmed by TV2; runtime SKIP/readinessHOLD, BE09 offlineACCEPTED/historical lifecyclePARTIAL. Need authorized isolated Windows/WSL inventory/owners/restoration baseline; actual before/after PID/starttime/listeners/task/transport/Vite restoration, rawHTTP recovery, rawforegroundserve transcript and actualserveexit, never tee/down/kill. No Linux substitution or #42 receiver action.

#41 local OptionB product6766e5e/H52/hash6be070…ba66/revisionae1ae7f2…82c9 already ACCEPTED; SQLqueryH58 is not publicationH52. Only remaining #19boundary/session/503 and #40access/lifecycle, no workerSQL/signoff/re-extraction/governance rerun. #20 unchanged pending owner packet: group leadTV1/nvdungmim appoints owner, owner chooses fullapprovedSHA/map9publicaddresses/custody+exclusiveuse+signingpath6/numericgas+fee+funder/explicitbroadcastauthority. Local #42 bootstrap permission is not Sepolia authority; no secret requested or send performed. #44 group exactsource/manifest/report/demo/video remains unchosen. PR52 Draft; no mainmerge/tag/release. #18/#36/BE06/boundedinvariants accepted,10Ready(single)N/A, historicalFAIL/raw evidence unchanged.

## Delivery verification and access limits

No code/tests changed or runtime campaign rerun. Final document/source-binding/link/JSON/whitespace/conflict-marker/secret checks run after the last authored change; delivery chat records their actual result and pushed SHA. A selective commit draft is inspected before normal push; no empty commit/force/rewrite or user-change staging. This evidence branch is separate so candidate head/CI does not churn.

GitHub CLI was absent; official2.106.0 installed only under `/tmp/tv4-20261128`, authenticated existing dung0611 keyring/scopes. Project API lacks read:project; did not change OAuth/settings. Existing authenticated relay browser provided real UI updates; table reload confirmed all eight rows/two fields. Project whole-issue statuses retained (including #42 In review/PARTIAL until group closure); scopedPASS is explicit in dependency/evidence fields. Browser observe repeatedly stalled after panel scrolling; tool issue reported, table UI remained usable. No scripted app-state mutation or fake completion. One initial immediate reload happened before an edit persisted; final edits were saved and read back after reload, only those final values are in machine state.

Next priorities: (1) TV2 scoped PR63 union/admin review, then fresh gates/history-preserving Dev merge and actual postmergeCI; (2) TV3/receiverowner narrow #19 proof and isolated #40 inventory/lifecycle; (3) TV1/group owner appointment and group exact release/demo packet, while #20 broadcast stays separately unauthorized.
