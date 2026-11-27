# TV4 — bản nháp bàn giao r2, 27/11/2026

**CHƯA ĐĂNG.** Không comment/review/request/resolve/approve thay người dùng. Dùng các mục riêng bên dưới cho đúng issue/PR; không dùng draft26/11 hoặc draft27/11 lượt đầu có #42 NOT READY. Evidence/doc source bắt đầu PR60 **24f66b6cae0f13651c622625adcc687e6d11fffd**; exact integration candidate, checks và branch trong [report tích hợp r2](2026-11-27-r2-integration.md), không coi baseline docs là runtime source.

## #42 — independent signoff

TV4 đã kiểm độc lập [actual restart bytes](https://github.com/user-attachments/files/35499936/issue42-api-restart-h22.tar.gz): archiveSHA256 `f05b176ebfea53dcb43fb89a00a0275192c4b9dc55abdcbe92f00a2a42bd94af`, archive/path safety và78/78checksums PASS; bổ sung37/37 và metadata**34/34 actual** (TV2 lịch sử báo33) cũng được kiểm. [Report/inventory/limits](2026-11-27-r2-issue42.md).

**PASS — scoped receiver API-only restart**, source **896f93ea282d76fa72339a97ea12339240c16da4**, chain31337/deployment tv3-issue42-20261127, H22/hash `0x3b9fd152a6d4946883c3cb206bd4e18d5ffb8629dfb137d55169ab9e027e94c8`, revision `edc6f818-67a1-4b6e-90b1-22844197db90`. Sáu URLpairs giữ nguyên/12HTTP200; TV4 tự tính10digests,5/5pairsMATCH. Snapshotff83df86…c210 không invalidated, cuối capture còn394sTTL; checkpoint/publication/scope/canonical khớp. API listener9959→14532, Anvil5756/PG6595/worker9667 giữ identity/start time.

TERMcommandexit0 không phải termination exit của API cũ; termination exit cũ chưa capture. API mới còn chạy nên termination exit N/A, không yêu cầu bịa. Health200/degraded/rawunknown16/0decodeerror giữ đúng source lịch sử, không gọi complete decoding. Không còn receiver-not-ready/API-restart-missing blocker; BE06 đã nhận không rerun. Evidence đã niêm phong offline trước #40; issue mở để người dùng/nhóm chốt, không đổi lịch sử hoặc whole-releasePASS.

## #19 — chỉ phần hẹp chưa có

Giữ **B-active visual/preflight ACCEPTED**,7/7payload checksums và provenance đã đủ; không yêu cầu nộp lại. Source lượt mới **4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44**, MetaMask13.58.0 là producer khai báo riêng run mới, không H26.

**PARTIAL:** cần provider-boundary interval liên tục bao quanh blocked Submit (method/time/accounts/from, kết thúc sau UI guard settle), About/extension-manifest capture đúng session, rawproposals503 URL/headers/body/timestamp/context và log tối thiểu TV2 đối chiếu. Nonce/head/pool không đổi và khôngpopup chỉ là no-send inference, không chứng minh eth_sendTransaction chưa gọi; không quy503 cho unknown topics. [Checklist/instrumentation và delta mới](2026-11-27-r2-receiver-deltas.md). Không full governance rerun hoặc tái tạo H26.

## #40 — readiness HOLD, không failed lifecycle

Hai cập nhật [7221841931](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7221841931) và [7222076540](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7222076540) là hạn chế access/ownership. **Runtime SKIP/readiness HOLD**, historical lifecycle PARTIAL và BE09 offline ACCEPTED giữ nguyên.

TV3 + receiver owner cần mở tuyến Windows/WSL có quyền inventory thật, clean approved full source theo TV2, preregister tooling/root/ports/task/transport/owners và restoration baseline; không dùng LinuxTV4 thay acceptance. #42 seal đã có, nhưng không tự cho phép dừng receiver#42. TV3 chạy narrowOptionB trên receiver mình; TV4 kiểm before/after PID+starttime/listeners, task/transport/Vite restoration, HTTP recovery và rawforegroundserve transcript/actualserveexit (khác tee/down/kill). [Unblock packet cụ thể](2026-11-27-r2-receiver-deltas.md). Không BE09/BE06 campaign rerun.

## PR60 — conflict-resolution candidate để narrow review

Current source inputs: head60 **24f66b6cae0f13651c622625adcc687e6d11fffd**, head61 **cba8b6c9eda65959d82250441b8eed131a1a5044**, fetchedDev **d63842ae50dc9a29a42529ce7cd08ca7c569759e**. API PR60.base snapshot896f93e khác fetchedDev; không dùng metadata đó thay merge-tree. Patch cũ dựa d4d405f chỉ là lịch sử, không áp mù.

[Candidate lịch sử, exactSHAs/parents/runtime checks](2026-11-27-r2-integration.md). Một unionABI/registration dựng cả Interface và frozen eventsByTopic, giữ adminABI, canonical/malformed/unknown checks; SQLbatch/FK/rollback, latefifthguard/ownedAnvilclock; signedidentity/durablejournal/receiptbinding/hai fundingguards;3migration+4release tests/verify-only. Chưa merge PR60 vàoDev.

Giữ scoped TV1/TV2 approvals cho blobs không đổi; chỉ đề nghị reviewer kiểm union/adminintegration và actualdelta. TV3 COMMENT6055560601 resolvedP2 không wholePRAPPROVED; không selfapprove/dismiss/resolve thay peer. CI60 mới nhất ở docshead24f66 [push45869593683](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45869593683), actualcheckout24f66/10success+publishSKIP, không proof của unioncandidate. [CI provenance](2026-11-27-r2-github-state.json).

Candidate đã normal-push **`tv4/integration-20261127-r2`** tại
**`ff3ee48290f32b46fb1789c136bfd202cb176490`**; runtime checked
**`9417d4cecb774b301e29e2ed7fe6cb3c7e28f308`**, packaging chỉ evidence/history.
Typecheck/build exit0,184tests PASS/0FAIL/0SKIP; ownedPG18.4+Anvil liveBE04
10phases/8checks/24receipts PASS. [Exact commands/raw outputs](2026-11-27-r2-integration.md).

## PR61 — giữ lịch sử và scoped BE08 acceptance

Head **cba8b6c9eda65959d82250441b8eed131a1a5044** không đổi. Scoped BE08 approval6053196499 giữ nguyên. [PR CI45403578782](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45403578782): eventcba8b6c nhưng actualcheckout **b071a29a3c931ffa007dc2e864d56f81e5c41b67** với Dev896f93e, không fetchedDevd63842/adminunion. Candidate giữ original PR61 ancestry và PR60 QA/security; [runtime integration](2026-11-27-r2-integration.md) là proof mới tách riêng. Chưa merge PR vàoDev; không request lại toàn BE08 campaign đã nhận.

## PR62 — unchanged-source review, live SKIP

Head **d4a0fb563e66be951760167a6f62b246821dc17c**. [144PASS trước](2026-11-27-pr62-tv4-review.md) giữ nguồn/môi trường/counts; **không rerun144** khi source không đổi. [Fresh HEAD/reviews/CI delta](2026-11-27-r2-receiver-deltas.md), không tự approve.

**Live SKIP** đến khi deployment/chain owner +TV2 cung cấp approvedcurrentendpoint/instance/deployment, Treasury+BUD addresses/trustedruntime**keccak256** từ nguồn độc lập, exacthistoricalH/hash và numericfinality/confirmations/staleness policy. Read-onlyEIP1898requireCanonical/archive behavior phải capture thực, unsupported→failclosed, không latestfallback; artifactSHA256 không thay runtimekeccak. Không deploy để tạo proof.

## #6 — integration/QA tổng thể

**In review/PARTIAL.** [#42 independent PASS](2026-11-27-r2-issue42.md) đã gỡ blocker receiver cũ; [candidate integration/runtime verification](2026-11-27-r2-integration.md) và [ma trận](../test-plan.md) tách source chạy/evidencehead/PRhead/CIcheckout. Không đánh Done từ CI/Netlifypreview. Còn #19 boundary/session/503, #40 receiver access+lifecycle, #20 owner/testnet và #44 nhóm chọn exactsource/manifest/demo/video. Giữ #18/#36/BE06/boundedinvariants accepted, không mở lại.

## #7 — requirement/evidence matrix

**In review/PARTIAL.** [Matrix r2](../test-plan.md) bổ sung #42 scopedPASS và candidate runtimeproof;10Ready(single) vẫn **N/A**, không PASS. Historical failures/raw counts giữ nguyên theo source, không cộng các campaign thành một ledger. Backend/contract mapping và scoped approvals không yêu cầu lại khi blobs không đổi; full actor/reset/UI/receiver/testnet acceptance không suy từ mapping hay testcount.

## #41 — không mở lại local pipeline

**Local OptionB pipeline ACCEPTED**, product **6766e5ee2d8c466542687cbeb09677c4d11e5463**, H52/hash6be070…ba66/revisionae1ae7f2…82c9; SQLqueryH58 không phải publicationH52. Không chờ TV2workerSQL/không re-extract haiJSON/không rerun governance. B-active #19 đã nhận, chỉ giữ boundary/sessionversion/raw503 còn thiếu; #40 vẫn accessHOLD/lifecycle chưa chạy. #42 scopedrestart đã kiểm độc lập nhưng là source/run khác, không relabel pipeline. Full issue OPEN/PARTIAL cho các scope còn lại.

## #44 — release/demo không được thay bằng CI hoặc preview

**NOT RELEASE-READY.** [Summary](../tv4-work-summary.md), [checklist](../tv4-checklist.md), [demo](../qa07-e2e.md) dùng cùng r2reports; không dùng SHA/docshead cũ làm selectedrelease. Nhóm/lead phải xác nhận exactapprovedsource+manifest+demo/video/report; TV1/TV2/TV3 xác nhận phần mình, TV4 đối chiếu acceptance. #42 đãPASSscoped, #19/#40/#20 và approval/integration gates còn riêng. CIgreen/Netlify/publishSKIP không releaseacceptance; không tag/release/promote/mainmerge hay #56rollout.

## PR52 — promotion vẫn chưa được phép

HeadDev **d63842ae50dc9a29a42529ce7cd08ca7c569759e**, basemain **ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4**. [CI45783467915](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45783467915) actualcheckout **c35aefaabe3ad964195f71bf22d327a53939d65a** xác minh lại qua joblog,10success/1publishSKIP; không actualpromotion. PR60/61candidate không tự chọn Dev→main source, không nhập PR21/55/personal. #44gates và groupreview vẫn thiếu; không merge/promotion/tag/release.

## #20 — nhắc đúng owner input, không request secret

Nhóm trưởng **TV1/nvdungmim** chỉ định deployment owner; owner cung cấp fullapprovedSHA, map9publicaddresses, custody/exclusiveuse+signingpath của6signers, numericgas/feebudget/funder, explicitbroadcastauthorization gắnSHA/map/Sepolia/K2/budget. TV4 không tự chọn owner/signer/budget hoặc xinsecret. Technicalsecurityapproval không cấp quyền send. **BLOCKED / live testnet SKIP / 0Sepoliabroadcast** trong assignment; actualmanifest/runtime/roles và real-timeExecuted+Defeated chỉ sau đủ gates và yêu cầu riêng cho phép broadcast.
