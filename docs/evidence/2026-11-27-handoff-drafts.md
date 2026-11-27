# Bản nháp GitHub — TV4, 27/11/2026, lượt đầu (đã thay thế)

> **KHÔNG DÙNG ĐỂ ĐĂNG:** [draft r2 hiện hành](2026-11-27-r2-handoff-drafts.md) thay bản này.
> #42 đã PASS scoped qua kiểm độc lập; “receiver NOT READY” dưới đây là lịch sử chưa đăng,
> không phải nội dung bàn giao hiện hành. HEAD/CI/candidate mới được ghim ở report r2.

**CHƯA ĐĂNG.** Người dùng xem trước; không tạo comment/review/request trùng, không tự resolve/approve/đóng issue. Các link báo cáo thuộc cùng commit bàn giao chứa file này; full product/evidence/approved/CI SHAs có trong [báo cáo chung](2026-11-27-tv4-acceptance.md).

## #19 — nghiệm thu gói hẹp mới

TV4 đã tải đủ8files từ evidence commit **887c5ecafd79feaf64956b8e05e9d16576404d84**, kiểm **7/7payload hashes,exit0**, đọc manifest/3RPC snapshots và xem trực tiếp2PNG. [Review/bindings/503/giới hạn](2026-11-27-issue19-review.md), [inventory](2026-11-27-issue19-review.json).

**SCOPED VISUAL/PREFLIGHT ACCEPTED / NO-SEND INFERENCE ONLY / FULL_ACCEPTANCE_PENDING.** Run TV3-MM-negative-20261126-4cba99a0/source4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44: B-active outsider0x23618…21E8f/draft1BUD/requestId/lỗi sau Submit đã có ảnh. B không phải manifest.accounts.B. Nút vẫn enabled rồi guard chặn. Console `eth_accounts=[B,A]`; H19/hash81a732…efddf/Bnonce0latest+pending/txpool0 không đổi ở ba snapshots.

Chưa instrument provider boundary: nonces/pool/no-popup không tự chứng minh chưa gọi eth_sendTransaction. MetaMask13.58.0 là producer khai báo riêng lượt mới, chưa có About/extension-manifest capture để kiểm độc lập; không gán version/ảnh này cho H26. Historical H26 UNKNOWN/MISSING giữ nguyên; provenance đã đạt không yêu cầu lại. API proposals503 có ảnh nhưng thiếu rawbody/context/timestamp/log để chốt nguyên nhân;16unknowntopics không tự giải thích503. Không full E2E PASS.

Phần còn lại chỉ provider-boundary interval+extension identity của narrow blocked-submit nếu cần zero-send assertion, và raw503 packet/log tối thiểu TV2 đối chiếu nếu còn. Không yêu cầu chạy lại governance, nộp lại provenance hoặc sửa lịch sử. #41 local pipeline accepted giữ nguyên.

## PR60 / PR61 — integration delta để review

Fetch pin Dev **d63842ae50dc9a29a42529ce7cd08ca7c569759e**, PR60 **d4d405f2ca64e1786b44c7d81354cbe2de18040f**, PR61 **cba8b6c9eda65959d82250441b8eed131a1a5044**. `git merge-tree --write-tree` mỗi PR×Dev exit1: conflict thực tế **chỉ indexer/abi-registry.ts**, không danh sách5files lịch sử.60×61 exit0/tree bằng60; toàn10net-delta files61 byte-identical60.

[Resolution report](2026-11-27-pr60-pr61-integration.md) và [diff full Dev→head60](2026-11-27-pr60-dev-resolution.patch) giữ ancillary ABI từ Dev và frozen eventsByTopic từ BE08 bằng một union/interface/index mỗi registration. Throwaway-index apply/check đạt; chưa apply vào branch hoặc actual merge, chưa runtime-test union. Diff gồm inherited infrastructure chỉ để review, không quyền rollout/#56.

Đề xuất61→60 bằng normal merge commits khi maintainer cho phép; fetch/tính lại sau hop1, giữ fixes+history, không nhập21/55/personal. TV1 security/TC10, TV2BE08 approvals đúng scope/SHA giữ nguyên. Review bổ sung chỉ union/admin integration và delta thực thay đổi, không request lại toàn campaign; TV3 pinning resolved COMMENT không whole-PR approval. CI60 actual29cea53 thuộc oldDev3d0f6ca, không proof registry integration với Devd63842a. Chưa merge/promote/release.

## #42 — receiver NOT READY, không yêu cầu BE06 lại

Đã đọc TV2 **7189768224** và TV3 **7198985891**: stack ứng viên source4cba99a khác approved896f93e, không proposal/snapshot còn TTL; health200degraded không đủ readiness. TV4 chỉ inventory read-only local, không access trực tiếp receiverTV3, không service action. API-only/digest **SKIP**, không fake PASS.

[Checklist/lệnh collection+comparison](2026-11-27-receiver-readiness.md) sẵn: materialize summary;5data endpoints ghim H/hash, health riêng;6cặpstatus/raw bodies,scope/H/hash/revision,semantic digests đúng TV2 jqcompactsorted+newline;PID/start-time/ownership/listeners/commands/logs/actual exits. Worker/PG/DB/chain/deployment giữ nguyên; không query snapshotRevision hoặc latest fallback để che409/503/TTL.

Đúng coordination đang mở: TV2 chỉ receiver phù hợp hoặc kế hoạch chuẩn bị cụ thể; lead quyết định no-redeploy vs bootstrap deployment mới ngoài cửa sổ đo. Không tự bỏ điều kiện. TV3 preregister rồi API-only; nếu dùng chung stack, hoàn tất #42 trước shutdown#40. BE06 đã nhận không mở lại, không request checksum/rebuild trùng.

## #40 — giữ Option B hẹp

Historical BE09 offline ACCEPTED/lifecycle PARTIAL giữ nguyên. [Checklist mới](2026-11-27-receiver-readiness.md#40--checklist-lifecycle-mới-sau-42-nếu-dùng-cùng-stack) có PID/PPID/start-time/exe/cwd/listeners, Windows launcher/task scoped ownership, transport/CORS, Vite/task restoration đúng baseline, HTTP recovery và **actual foreground serve exit**; không dùng tee/down/kill exit thay serve. Lượt này runtime **SKIP** vì receiver chưa đủ; không dùng LinuxTV4 thay receiverTV3. Hoàn tất#42 trước nếu chung stack. Không hồi sinh run cũ hoặc chạy lại full governance/BE06/BE09 đã đủ.

## PR62 — TV4 review, không approval

Review exact head **d4a0fb563e66be951760167a6f62b246821dc17c**, toàn28filediff/docs/workflow và snapshot adapter. [Report exact lines/checks/limits](2026-11-27-pr62-tv4-review.md). **Không phát hiện defect có reproduction trong scope TV4**;37snapshot+14engine+38validation+55reader = **144PASS/0FAIL/0SKIP**,Node24.15.0,exit0. Không whole-suite/live proof.

Đã kiểm caller-provided trusted runtime keccak, chain/H/hash anchors, EIP1898requireCanonical/no latest fallback, historical-state fail-closed, chung deadline/abort/sanitizederrors. Canonical-at-read không consensus finality; caller/owner phải chốt numeric finality/staleness/instance policy. Live deployment/archive/EIP1898 **SKIP** vì thiếu approved current endpoint/deployment/hash/pin config. Không lấy SHA256 artifact làm runtimekeccak hoặc archived Anvil làm endpoint sống. Actual simulator CI PRcheckout **e604426703610b1a5bbdf07df0dddf8a9ac8f109**, pushcheckout đúngd4a0fb5, xác minh bốn joblogs; actionlint localSKIP/toolabsent. Không approve/merge/broadcast.

## #6 / #7 / #44 — báo cáo chung

[Acceptance](2026-11-27-tv4-acceptance.md), [matrix](../test-plan.md), [checklist](../tv4-checklist.md), [demo](../qa07-e2e.md) đã cập nhật theo scope mới: B-activevisual có thật nhưng no-sendinference/503UNKNOWN; registry conflict/diff cụ thể; PR62narrowreview; receiverNOTREADY và checklist#42trước#40. Không gán CI/dochead/sourceapprove cho nhau.

#6/#7 **In review/PARTIAL**, #44 **NOT RELEASE-READY**. Giữ #18/#36/BE06/bounded invariants,10Ready(single)N/A và #41product6766e5e/H52 accepted;SQLqueryH58≠publicationH52. Signed identity/journal-before-broadcast/receipt binding/funding guards/BE07clock/3migration-manifest tests/verify-only workflow không đổi. Không sửa historicalFAIL, không staging#56/rollout. Nhóm còn chọn exactsource+manifest/demo/video và nhận receiver/testnet outputs; không Done từ CIgreen.

## #20 — giữ yêu cầu owner hiện có, không request trùng

Không có public authorization/map/custodian/budget mới trong scope đã đọc. Technical approvals không chọn deploymentrevision hoặc cấp gas permission. Vẫn **BLOCKED**: owner được nhóm chỉ định chốt fullapprovedSHA,map9publicaddresses,custody/exclusive-use+signingpath cho6signers,numericgas/feebudget/funder,explicitbroadcastauthorization gắnSHA/map/Sepolia/K2/budget. Sau đó mới actualmanifest/constructor/runtime/roles và real-timeExecuted+Defeated receipts. Không mặc địnhTV1/TV2 giữsigner, không xin key/seed/password/keystore/RPCsecret; **0Sepoliabroadcast**.

## PR52 — promotion assessment

Current headDev **d63842ae50dc9a29a42529ce7cd08ca7c569759e**, basemain **ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4**. Bodyassessment43acfbd là lịch sử; current TV4CI45783467915 success10jobs/1publishSKIP có actualcheckout **c35aefaabe3ad964195f71bf22d327a53939d65a** theo joblogs, không actualpromotion. Acceptance/receiver/testnet/groupdemo còn pending; giữ draft/gates/history. Không merge/promotemain/tag/release từ lượt review này.
