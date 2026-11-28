# TV4 — PR64 / #19 live evidence and #40 readiness review

## Decisions and public records

| Scope | Decision | Evidence / remaining gate |
|---|---|---|
| PR64 tooling | **REQUEST_CHANGES**, no merge | [Review6097608003](https://github.com/SE2026-21-1/dao-budget-simulator/pull/64#pullrequestreview-6097608003): reproduced P2 serialization failure prevents original provider invocation; TV3 fix + focused regression required |
| #19 provider interval + identity | **ACCEPTED scoped**, whole issue remains OPEN/PARTIAL | [Signoff7238784522](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7238784522); historical503 original packet/logs missing in searched scope, root cause UNKNOWN; group must decide whole-issue disposition |
| #40 supplied readiness bytes | **ACCEPTED scoped**, inventory-access blocker resolved | [Review7238797366](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7238797366); no fresh receiver operation |
| #40 isolation/restoration | **Conditional design approval**, restoration **B** | Allocation/owner/full reviewed descendant/control baseline/execution gates remain **HOLD**, lifecycle runtime **SKIP**, not FAIL or PASS |

[Machine record](2026-11-28-pr64-issue40-tv4-review.json) contains actual inventories/checksums, CI job/step conclusions, sample-log identity, review IDs and persisted Project readback. Previous delivery/merge reports remain historical; this report supersedes only provider/session-missing and inventory-access-missing blockers. No product/runner source was changed by TV4 in this review.

## 1. PR64 exact source and CI context

- Author: `LangXiTrum2005`; reviewed head **08c693ec433e6dd66be2293bdb2e8d07938ab471**.
- Actual Dev: **e17ef61a8a51518005c38b0808cdc06fe7a68bbf**; PR merge checkout **5a53a40114560e58269ceb4eba8088ca5c9fb24a**, parents Dev + reviewed PR head.
- Head and merge tree: **5405194d724aa400d21a257fbba606fd67fe34cc**. Evidence/tooling PR adds61files, no product/contracts/backend/frontend/workflow change.
- [TV4 CI46135418396](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46135418396): event `pull_request`, event head08c693e; 10 jobs success, Publish skipped as expected on PR. [Fallback46135418339](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46135418339): one job success.
- Read job/step metadata for both runs. Downloaded **two sample job logs only** (BE01 and fallback), each actual checkout5a53a401, not all job logs. CI is not evidence of publication or a replacement for manual review; no PR63/PR60 run was substituted.

Reviewed the observer/capture/state tools, all four existing observer tests, readiness and live evidence inventory, raw traces/state/HTTP/provenance and actual A/B/extension screenshots. No configured LSP was available; immutable source/reference inspection used. Focused final verification command: Node24.15.0 `--test tests/smoke/qa07-provider-observer.test.mjs`; no accepted43frontend/23QA07/full-governance/native campaign rerun. New P2 is not covered by the existing four tests.

## 2. #19 independent byte / provider / identity acceptance

Immutable producer packet: [PR64 head live evidence](https://github.com/SE2026-21-1/dao-budget-simulator/tree/08c693ec433e6dd66be2293bdb2e8d07938ab471/docs/evidence/tv3-issue19-live-20261128), with separate [readiness packet](https://github.com/SE2026-21-1/dao-budget-simulator/tree/08c693ec433e6dd66be2293bdb2e8d07938ab471/docs/evidence/tv3-issue19-20261128).

- Verified **13/13 readiness + 42/42 live payload checksums**, exact inventory path/size/hash coverage. Live inventory SHA256 **e1651c331e3b09b98fe629054926948a193739ac84f23d2d80ebeb14b13a0ef7**.
- Served product is **e17ef61a8a51518005c38b0808cdc06fe7a68bbf**, not PR64 evidence/tooling head. Independently compared94 product-source hashes with Git source bytes; all match.
- Run **TV3-MM-boundary-20261128T100609709Z**, chain31337/deploymentqa07-e2e/SQLdeployment1; manifest SHA256 **0a8637a9cda0de5a70f5b958a68c7f3010c3836a62f6c537ead2c6bf7df52a5c**. Observer SHA256 **2f710068ccdd3dc20e55611fc458240c6169b8afa2c1de94ee8d5b632cebe952** matches tool/run/verification.
- Raw JSONL has78 ordered records and exactly equals final snapshot. Exported interval snapshot equals first77 raw records. Provider-1 installed atseq2 via EIP6963/io.metamask before application account restoration; coverage installed/stillWrapped through A→B→A/final.
- Measured sequence **52–77**,26records, **2026-11-28T10:15:39.776Z–10:17:42.867Z**. BeforeSubmit seq64 **10:16:19.922Z**, UI guard settled seq65 **10:16:20.263Z**; continuous interval starts before action and ends after settle. Method/time/accounts/from and request context retained. B Submit was enabled before/after; guard visible; same draft/request persisted after switching back.
- **Zero** eth_sendTransaction/eth_sendRawTransaction/eth_signTransaction/wallet_sendCalls inside measured interval. Whole session has **two preparation eth_sendTransaction requests**: seq33 provider4100 error and seq40 successful self-delegation. These remain in raw evidence; no whole-session no-send claim.
- A `0x9b524d3a18716b0607504761ed2eb061932c9527`, B `0x729b025adae5aca996c1e13b091fbacf293b89d5` (actual run B, not manifest B); retained request ID `0x75299a818f18ce4b86ffdf69d62f9b02649919f6a0913504dd1341fd9a59f0e3`.
- Three actual RPC snapshots match response IDs/status/results. Head26/hash **0x0065513d2936fe49adc7632a89aa9aa7899521b8cbe86b1024c7465fac82b9f0**, A nonce1/Bnonce0 latest/pending, txpool0/0 unchanged; votes A400e18/B0 against threshold50e18. These corroborate the interval; nonce/head/txpool/no-popup alone would only support inference.
- Actual installed-extension UI + manifest: MetaMask13.58.0, manifest13.58.0.0/version_name13.58.0, ID `oamaibdaigjnbdconjppnkfdcacinpgn`; Chrome150.0.7871.24, bound to same CDP/profile/path command line. Profile is existing producer default, not per-run isolation; disclosed. Do not assign this version to historical H26/sessionUNKNOWN.
- Screenshot B was recovered after guard following a screenshot timeout; raw provider trace remains continuous. No continuous-video claim. Captured HTTP:160requests/158responses all200/two ERR_ABORTED, not an old503 packet. Backend H24/hash/revision and new chain H26 are distinct.

[TV2 current-run backend conclusion7238649288](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7238649288) is independently scoped accepted negative-only: no unknown-topic/503 attribution from this run. Original historical503 URL/headers/body/time/context and logs are **MISSING IN SEARCHED TV2 SCOPE**, not proven globally absent; root cause UNKNOWN. Current HTTP200 is not old503 diagnosis. Whole #19 stays open pending group disposition, not silently narrowed acceptance. Do not request accepted7/7 payloads/provenance/B-active again or recreate historical evidence.

## 3. Reproduced tooling P2 — separate from accepted packet

[Source observer helper line9 and request wrapper](https://github.com/SE2026-21-1/dao-budget-simulator/blob/08c693ec433e6dd66be2293bdb2e8d07938ab471/scripts/qa07_provider_observer.mjs#L9): `copy` uses JSON stringify/parse. Recording params runs before original provider invocation; response/event serialization also shares the helper. A recorder must not replace wallet/provider control flow even for an invalid RPC payload.

One narrow Node24.15.0 in-memory VM reproduction, no network/wallet: provider.request called with `{method:'eth_call',params:[1n]}`, original provider would increment calls then reject its own error. Observed **originalProviderCalls0**, **sameProviderError=false**, **TypeError: Do not know how to serialize a BigInt**. This is a consumer-visible observer defect, not a fabricated live-run failure.

Requested TV3 fix observation serialization independently of original invocation/outcome; failed serialization must explicitly mark observation incomplete/invalid without replacing result/error. Add isolated consumer-visible regression proving provider invoked and exact original success/rejection retained, then focused checks. No code fix was authored by TV4; review is REQUEST_CHANGES, no PR64 merge/approval. Existing captured interval contains no triggering value, matches raw/final snapshots and remains accepted.

Nonblocking reuse limits: legacy providers appearing late without EIP6963/initialized may escape initial discovery; fire-and-forget sink/parallel appends have no ACK/drain guarantee. Current EIP6963 provider installed before application use; all78 JSONL records exactly reconcile to snapshot, so neither is an observed packet loss/coverage failure. Do not upgrade tool reuse to universal provider coverage.

## 4. #40 immutable readiness audit, not lifecycle run

- [Readiness Gist revisionc597eb59bb07a0cad6434b3b8c68223af509f1b3](https://gist.github.com/LangXiTrum2005/60acbb25b9e86dd24bc1ddc64f61f709/c597eb59bb07a0cad6434b3b8c68223af509f1b3): decoded gzip10199bytes, SHA256 **064076540ad1eb028ffb112131eef3ef571266691bad6992cbc3da29f9660241**,15regularfiles/32759uncompressedbytes,14/14payloadchecksums/exactcoverage; safe paths/no links/specials/duplicates; standalone report/registration/checksum byte-identical.
- [Proposal revision16997764955d4c15bfa42a47c1f86deb73036a6e](https://gist.github.com/LangXiTrum2005/3ed0409ca2fbc7e950401733480dc163/16997764955d4c15bfa42a47c1f86deb73036a6e): SHA256 **eaae6f129074d5ec8c72ae1e01be21cafd60a8670c0882be054d4ddc8cdb0823**.
- Inspected collector, raw Windows/WSL inventory, retained initial -File execution-policy exit1 and successful subsequent collector exit0, source/toolchain/registration and recorded preflight_exit0. **Inventory access resolved**, not new privileges or ongoing port allocation.
- Approved clean source **e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0**; WSL Node24.15.0/npm11.12.1/Foundry1.8.5/PG18.4 recorded. Preflight checks source/tools, not lifecycle/ports. Windows24.21.0/npm11.19.0 are declared, not raw executable/version proof.
- Windows task `\DAO Budget Simulator Web` Disabled/Enabled=false, no matching Vite. HTTP5173 curl7/HTTP000 is negative baseline, not recovery or port-free proof. Shared WslService/iphlpsvc Running/Automatic; portproxy no rows. Only scoped Windows5432 listener belongs to wslrelay11760, distinct from system Linux PG231; `/proc/231/exe` readlink1 remains unknown. Leave system5432 untouched.
- **Windows filter omitted28545**. Timestamped WSL/listener absence does not reserve endpoint or prove future routing. No runtime ID/manifest/serve command/transcript/actual serve exit/restoration/control HTTP200 exists.

## 5. Conditional design and restoration B

[TV2 conditional design/patch permission7238386171](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7238386171) is not allocation or runtime approval. TV4 agrees with minimal RPC-only logical endpoint/process/state isolation on existing **unchanged** shared Windows/WSL transport; not VM/security isolation. Candidate28545/3300/55432/5173 and private state root remain proposed only.

Reviewed approved source consumers and found the proposal's sole-caller claim false: executable [readiness.test.mjs80–81](https://github.com/SE2026-21-1/dao-budget-simulator/blob/e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0/docs/evidence/be09-20261106/readiness.test.mjs#L80-L81) also invokes registration. Required `--rpc-url` must migrate it/current equivalent, not sealed old results/checksums. Full descendant review must cover:

1. Only unset new-run override selects ordinary default18545; empty/whitespace/sign/nondecimal/oversized/out-of-range/noncanonical/collision/protected tuple rejected before side effects. Canonical explicit numeric-loopback registration URL, no fallback; same URL in runtime/env/worker/indexer/live/frontend/report.
2. Existing-run status uses validated exact-run persisted RPC, not fresh-shell env/default; metadata/source/allocation/env/config mismatch or stopped/unowned run fails closed before probe. No new authority over protected18545.
3. Owned child/listener identity before RPC/deploy/seed closes free-port bind race; canonical checkout/root/run/PGDATA/socket boundaries and PID/PPID/starttime/executable/argv ownership before signal. Preserve retained partial-bootstrap cleanup. Dedicated clean reviewed descendant, not mixed Dev/borrowed scripts/relabelled baseline.
4. Receiver owner confirms exact tuple/controller/window/state/control and fresh allocated-endpoint ownership/route checks on both Windows+WSL. Unexpected ownership means HOLD, no next-port fallback/kill. No WSL/task/service/network-policy change.

TV4 chooses **restoration B conditional design**, retaining positive HTTP recovery, not A/HTTP N/A: temporary separately owned foreground Windows Vite control from clean reviewed full SHA/locked dependencies, exact executable/command/env/public-config digests/private logs/cache, owned identity/listener and raw HTTP200 baseline. Stop only this owned control before WSL serve. After authorized serve termination, prove owned listener gone; restore identical approved command/config and capture new identity/listener/raw URL/time/body HTTP200; then stop only control and return actual original taskDisabled/no-listener and unchanged transport. This is temporary-control recovery, not task/API/wallet acceptance. Actual Windows executable/version/control proof still required; dependency engine compatibility alone is not startup proof. No system toolchain replacement.

Next action TV3: implement minimal patch under existing conditional permission, migrate caller, submit focused results/full descendant SHA. TV2+TV4 source review, owner allocation/control baseline, preregistration and **separate execution permission** must precede narrow serve/status attempt. Actual runtime/manifest are generated by runner, not fabricated in advance. Preserve raw foreground stdout/stderr and **actual serve wait/termination exit**, not tee/down/kill/terminal code; before/after PID/starttime/listeners/task/transport/CORS/HTTP/restoration/checksums. No verify/fullBE09/BE06/governance rerun. Historical offline ACCEPTED/lifecycle PARTIAL remain unchanged; #40 OPEN/HOLD/runtimeSKIP.

**#42 CLOSED/sealed grants no query/reuse/shutdown authority over18545/13300/55442/worker/state/evidence.** No receiver endpoint was contacted, no bind/service/task/process/DB/chain/transport action performed by this review. No testnet broadcast/main merge/tag/release. #41 local pipeline ACCEPTED, #6/#7 PARTIAL, #44 release choices pending, PR52 Draft and PR62 liveSKIP unchanged; #20 ownership was not accepted for the user.

## 6. Delivery and verification boundary

- Published one PR64 review with inline P2 and one scoped comment each on #19/#40; no duplicated review request, self-approval or reviewer-thread resolution.
- Updated current summary in six issue bodies #19/#40/#41/#6/#7/#44, preserving previous bodies inside superseded history. No issue closed.
- Updated evidence/dependency fields for the same six Project items through authenticated UI; **reload + actual DOM readback confirmed12persistedfields**, statuses/acceptance unchanged, including #6/#7 In review/partial and #40 In review/partial. No OAuth/settings change.
- Updated four shared docs and this report/machine record on `tv4/acceptance-20261128`, separate from product candidate. No import of broad evidence ancestry into Dev.
- Final checks after last edit: focused four observer tests at immutable reviewed checkout; selected-doc whitespace/conflict/secret/relative-link/JSON-binding check. Reproduction result above was one narrow investigation, not a live campaign or source-fix claim. Actual final command results and pushed commit are reported in delivery chat; no empty commit/force push.
