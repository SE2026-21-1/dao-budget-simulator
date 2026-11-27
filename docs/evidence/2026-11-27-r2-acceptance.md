# TV4 — shared-project technical acceptance and handoff r2, 27/11/2026

## Current disposition

**#42 scoped receiver API-only restart PASS, independently checked by TV4.** #40 is access/ownership readiness HOLD, not a failed lifecycle run. #19 remaining documentary boundary/version/503 scope is PARTIAL. PR62 unchanged-source review retained, live SKIP. Overall #6/#7 remain In review/PARTIAL; #44 **NOT RELEASE-READY**. No merge, promotion, release/tag, infrastructure rollout or Sepolia broadcast.

| Work completed | Verdict / proof | External dependency / acceptance owner |
|---|---|---|
| #42 actual bytes, archive safety, checksums, semantic/context/TTL/process/SQL/RPC audit and seal | **PASS scoped**, [report](2026-11-27-r2-issue42.md), [152-file inventory](2026-11-27-r2-issue42-inventory.json); restart78/78 + supplement37/37 + metadata34/34actual (TV2 lịch sử báo33);5digest pairs/12HTTP200 | User reviews/posts draft signoff; group decides issue closure. No remaining receiver-NOT-READY request, no BE06 rerun |
| PR60/61 actual historical integration candidate, union/admin runtime verification | [Exact branch/commit/parents/tree, commands/exits/counts and runtime results](2026-11-27-r2-integration.md); **not merged into Dev** | TV2 reviews union/admin/SQL actual delta; retain unchanged scoped approvals. Maintainer alone decides later integration |
| #19 new-artifact search and byte freshness, minimal pass-through instrumentation | Accepted visual/preflight retained; **PARTIAL** strong no-send/sessionversion/raw503, [fresh review/checklist](2026-11-27-r2-receiver-deltas.md) | TV3 complete selected-provider interval + actual About/manifest identity for new session; TV2 retained503 packet/log correlation. No request to resubmit B-active/provenance or reconstruct H26 |
| #40 concrete receiver unblock/preflight/ownership/foreground/restoration packet | **Runtime SKIP / readiness HOLD**, not FAIL; historical lifecycle PARTIAL/offline ACCEPTED | Receiver owner provides authorized accessible isolated Windows/WSL; TV2 confirms clean sourcee8e443c; TV3 narrowOptionB; TV4 checks new before/after/restoration/HTTP/actualserveexit bytes |
| PR62 HEAD/reviews/CI freshness and read-only live input checklist | Unchanged head; historical144PASS retained **without rerun**; live **SKIP**, [fresh review](2026-11-27-r2-receiver-deltas.md) | Deployment/chain owner +TV1/TV2: approvedcurrentendpoint/chaininstance/deployment, independently trusted runtimekeccak, exactH/hash and numericpolicy |
| #6/#7/#41/#44, PR60/61/62/52 draft handoff and matrix/demo synchronization | [Drafts NOT POSTED](2026-11-27-r2-handoff-drafts.md), [matrix](../test-plan.md), [checklist](../tv4-checklist.md), [summary](../tv4-work-summary.md), [demo](../qa07-e2e.md) | Group/lead confirms one exact source/manifest/report/demo/video; per-scope peer reviews and remaining gates are not replaced by CI/preview |
| #20 local technical path retained; no unauthorized live action | **Owner gates BLOCKED / live testnet SKIP / 0 Sepolia broadcast** | Group leadTV1 identifies deployment owner; public fullapprovedSHA,9-address map,6signer custodians/exclusiveuse/signingpath,numericgas/feebudget/funder,explicitbroadcastauthorization. No secret requested |

**N/A stays N/A:**10Ready(single) production-unreachable cases. **FAIL stays FAIL:** historical benchmark/clock/evidence results remain bound to their original sources; not relabeled by current fixes. #18/#36/BE06/boundedinvariants and #41 local OptionB pipeline already accepted: not reopened. No conflation of PARTIAL, SKIP, FAIL or N/A with PASS.

## Source identities, not interchangeable

Root `AGENTS.md` absent; tracked PR60/Dev tree search found none. Read PR60's27/11 reports first, then fetched branch/PR refs and full current issue/review histories. Original checkout at57e8cba was left untouched; all authored changes are on isolated TV4 worktrees. No PR21/55/personal source or ancestry imported.

| Identity | Full SHA / scope |
|---|---|
| Fetched Dev / PR52 head | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| PR60 initial head/docs baseline | `24f66b6cae0f13651c622625adcc687e6d11fffd` |
| PR61 unchanged code head | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| PR62 unchanged source tested previously | `d4a0fb563e66be951760167a6f62b246821dc17c` |
| main / PR52 base | `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` |
| Actual #42 restart runtime source | `896f93ea282d76fa72339a97ea12339240c16da4` |
| #19 evidence commit, not product | `887c5ecafd79feaf64956b8e05e9d16576404d84` |
| #19 new narrow run product | `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44` |
| #40 clean source currently approved by TV2 | `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0` |
| #41 accepted pipeline product | `6766e5ee2d8c466542687cbeb09677c4d11e5463` |

**Published integration candidate:** `tv4/integration-20261127-r2` /
**`ff3ee48290f32b46fb1789c136bfd202cb176490`**, final tree
`58497a34c1091ae8ec4cca326c23eeadcd3d79f4`. Parents
`1ac7c3f776fff4d94392af2ac31d461f73652dc8` + Devd63842; PR61-history merge
`a84fb234f9bf76e70aadac6894ec56ff0bde3c20` retained.
Executed runtime **`9417d4cecb774b301e29e2ed7fe6cb3c7e28f308`**; later packaging only evidence/history.
**Typecheck/build exit0;184PASS/0FAIL/0SKIP** (108decoder/admin/BE08/QA07/release +
44signing/funding/bootstrap +21realPGstorage +11projection/rollback).
Separate owned PostgreSQL18.4/Anvil1.8.5 liveBE04 **PASS/exit0**,10phases/8checks/24receipts;
no historical BE06/BE09/full native benchmark. [Raw outputs and live JSON](2026-11-27-r2-integration-raw/),
[11-file checksum seal](2026-11-27-r2-integration-raw/SHA256SUMS).

Candidate **source commit/merge parents/tree** are pinned in the [integration report](2026-11-27-r2-integration.md), distinct from this evidence commit. Delivery branch **`tv4/acceptance-20261127-r2`** starts at PR60head24f66b6; it is not the branch from which union/runtime checks ran. Exact delivery commits are produced with eval's selective commit helper after final verification and supplied in the final handoff; no self-referential guessed SHA in this file. No PR created/merged; PR60/61/62/52 remain existing separate review surfaces.

**Metadata discrepancy retained:** initial/current PR60 API `base.sha=896f93e` and PR61 API `base.sha=6766e5e` do not equal `git ls-remote origin refs/heads/Dev` and `origin/Dev`, bothd63842. The first chat observation incorrectly treated PR60's base snapshot as currentDev; corrected by Git refs before integration. Do not infer branch reversion or a new source approval from API base metadata. Merge-tree uses actual fetched exact heads, not GitHub's cached mergeability display or old merge ref.

## CI: exact event head versus actual checkout

[Fresh machine-readable metadata, scoped reviews, job IDs/log hashes and excerpts](2026-11-27-r2-github-state.json). Existing remote runs were read, **not rerun**. All three checkout rows below were freshly downloaded from actual container-job logs and identified from `git log -1 --format=%H`.

| Existing run | Event head | Actual checkout | Recorded jobs / limit |
|---|---|---|---|
| [PR60 push45869593683](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45869593683) | `24f66b6cae0f13651c622625adcc687e6d11fffd` | **`24f66b6cae0f13651c622625adcc687e6d11fffd`** |10success/1publishSKIP; current head-filtered list contains push TV4+fallback only, no current-head PR checkout proof |
| [PR61 PR45403578782](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45403578782) | `cba8b6c9eda65959d82250441b8eed131a1a5044` | **`b071a29a3c931ffa007dc2e864d56f81e5c41b67`** |10success/1publishSKIP; merge with oldDev896f93e, not d63842/adminunion |
| [PR52 PR45783467915](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45783467915) | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` | **`c35aefaabe3ad964195f71bf22d327a53939d65a`** |10success/1publishSKIP; synthetic merge with mainad8c6cf, not actual promotion |

All three downloaded container-job logs actually list3migration/manifest +4release cases, **7PASS/0FAIL/0SKIP**. This is existing remote recorded evidence, not7 new local tests. Other exact-head jobs remain metadata unless explicitly log-inspected. PR60 old PR run45771184012 at29cea53/d4d405f/Dev3d0f6ca is historical and not unioncandidate proof.

PR62 fresh metadata: seven unchanged completed/success runs,4/4simulator job conclusions success,0human reviews/inlinecomments and one preview bot comment. Previous actual PR checkoute604426/pushd4a0fb5 logs and144local tests retained exactly as historical evidence, not reexecuted or re-proved from metadata. [Details/live gates](2026-11-27-r2-receiver-deltas.md#pr62--current-delta-only).

No green CI, Netlify preview or publishSKIP is release acceptance. A newly pushed candidate/docs SHA does not inherit these existing run conclusions; no new CI result is claimed here.

## Findings fixed and boundaries retained

1. **Stale #42 blocker removed:** now actual receiver restart bytes are independently accepted, not just TV2's conclusion. Sealed file inventory and own digests/context/TTL/process audit replace the old current-status “receiver not ready”. API signal-command exit0 is explicitly separate from old termination exit; new still-running API needs no fabricated termination status.
2. **Static-only integration replaced by real candidate:** old d4d405f-based full patch retained as historical, fresh head/base merge-tree and union/admin runtime verification on a separate branch. Historical approvals remain scoped; TV3's resolvedP2 COMMENT is not wholePRAPPROVED. No new review posted or thread resolved/dismissed.
3. **#19 gap narrowed, not widened:** B-active visual/provenance are already accepted; no fresh boundary/version/raw503 artifact found. New instrumentation preserves real provider results and requires coverage before app acquisition; nonce/pool/no-popup remain supporting inference only. No503 root cause invented.
4. **#40 classification corrected:** new comments show permissions/namespaces/ownership limitations, not failed runner execution. Windows/WSL readiness/restoration acceptance cannot be substituted by LinuxTV4. Protect active receiver/evidence#42 even after offline sealing; lifecycle requires owner coordination.
5. **PR62 no redundant144 rerun:** live is SKIP for missing owner inputs, not productFAIL. Runtimekeccak cannot be artifactSHA256; exacthistoricalH/hash/EIP1898requireCanonical/archive/failclosed/numericpolicy gates remain. No current endpoint guessed or deployment created for evidence.
6. Historical reports get only explicit superseded banners; their raw evidence/status/counts remain unchanged. Current matrix/checklist/summary/demo and separate fresh drafts now point to r2.

## Commands and verification record

- `git fetch origin --prune` then explicit PR60/61/62/52 head fetch: exit0. `git status --short` initially empty; no original-checkout edit/reset/stash. `git ls-remote origin refs/heads/Dev ...` and `git rev-parse origin/Dev`: exit0, source identities above. No force-push or Dev/main push.
- Public GETs for issue bodies/comments and PR bodies/reviews/inlinecomments: complete counts below100; no unconsumed page at limit. PR issuecomments fetched separately from inlinecomments. #42all43comments read through latestTV2acceptance, #40all28 and #19all10; PR60reviews15/inline10,PR61reviews4/inline3,PR62/52reviews0.
- Initial `gh api`: exit127 (CLI absent). Installed official **gh2.106.0** in `/tmp/tv4-r2/gh`, archive matched official checksum, `auth status` used existing keyringdung0611 without reading a token/private key or expanding scopes. One anonymous PR52push-job-metadata GET returnedHTTP403 rate limit; not PASS. Already collected metadata retained; later authenticated GETs/log downloads succeeded.
- `gh api --allow-escape-sequences repos/SE2026-21-1/dao-budget-simulator/actions/jobs/{140081246067,138478213537,139784320977}/logs`: each exit0. Python collector strips ANSI for displayed excerpts; log-byte hashes retained in JSON. No Actions invocation/watch/rerun.
- #42 offline commands/exits/assertion counts and limitations are [fully recorded](2026-11-27-r2-issue42.md#tv4-commands-actually-executed). #19fresh downloads7/7checksum proof and exactread-only commands are in [receiver deltas](2026-11-27-r2-receiver-deltas.md#commands-observed-outcomes-and-limits).
- **Integration source checks:** commands, Node/toolchain, typecheck/build, decoder/admin/storage/BE08 and related security/release counts plus isolatedDB/Anvil outcomes are recorded once in the [candidate report](2026-11-27-r2-integration.md). No threshold/load/timeout/assertion weakened; no historical BE06/BE09/full benchmark rerun.
- **Final docs/evidence check:** `python3 /tmp/tv4-r2/verify_delivery.py` after all documentation edits checks current relative links/anchors, JSON, shell/JS snippet syntax,152sealedfilebindings/149payloads/5digestpairs/3checkoutlogrecords and11drafttargets. First run exit1 caught inherited metadata count33 versus actual34; narrative corrected to actual bytes, not producer evidence. Actual final output/exit is supplied with final delivery, not guessed here. PowerShell snippets remain unexecuted: no accessible Windows receiver, no false syntax/runtimePASS.

## Next actions, in order

1. **Phan Thanh Dũng/user:** review the #42 draft and post only if satisfied; no request to redo BE06 or produce a new termination exit for a still-running API. Preserve archive+inventory seal.
2. **TV2/TV1/TV3 reviewers:** use the candidate exactSHA/tree and narrow runtime proof for union/adminintegration/delta review; retain unchanged approvals. User/maintainer later decides PR integration; no merge authorized in this assignment.
3. **Receiver owner +TV3/TV2:** grant legitimate Windows/WSL inspection route, prove isolation from#42, preregister clean approvede8e443c/toolchain/ownership, then narrowOptionB. TV4 accepts only real foregroundexit/PID/listener/task/transport/Vite/HTTP evidence.
4. **TV3/TV2:** supply only new-session provider boundary/About-manifest and raw503/log packet if retained/needed; if missing, label that explicitly. No H26/governance reconstruction.
5. **Deployment/chain owner:** fill PR62 read-only gates; separately #20deploymentowner publicSHA/map/custody/signing/gas/broadcastauthorization. Runtimekeccak and archivepolicy must come from actual approved inputs, not guessed artifacts.
6. **Group lead +all members:** confirm #44 exactsource/manifest/report/demo/video and remaining scoped gates. CI/preview/publishSKIP does not choose a release. No #56staging revival, infrastructure operation, release/tag or Sepolia broadcast in this work.
