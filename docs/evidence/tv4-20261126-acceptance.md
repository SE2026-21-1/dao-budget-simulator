# TV4 — nghiệm thu và bàn giao cập nhật 26/11/2026

## Baseline và bảo toàn

- PR60 đầu lượt: **b92bef5409d6478de97efbc8209241620967d18a**, nhánh remote `feature/tv4-qa-completion-20261121`; PR61 **cba8b6c9eda65959d82250441b8eed131a1a5044**, vẫn open. Không merge/approve/dismiss/resolve thay reviewer.
- Dev đã tiến từ mốc **896f93ea282d76fa72339a97ea12339240c16da4** đến **3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e**, thêm OpenStack VM/persistent Anvil infrastructure. Đây là thay đổi hiện có của người dùng/nhóm; không xóa hay nhập vào lượt TV4 này. User giữ #56 retired: không apply Terraform/OpenStack/SSH rollout. Approval receiver896f93e không tự áp dụng Dev mới.
- Working tree gốc sạch tại `57e8cba1083ce8cd6e12e38c42065ee7ffcb2cf2`, nhánh `fix/tv4-submission-identity-20261124`, upstream PR60 đã tiến. Giữ nguyên checkout đó. Tạo worktree riêng `/tmp/dao-tv4-acceptance-20261126`, nhánh local `docs/tv4-acceptance-20261126` từ đúng b92bef5, để push fast-forward vào nhánh PR60 hiện có. Không reset/stash/force-push, không nhập nội dung/ancestry PR21/55 hoặc individual/personal.
- Không tìm thấy AGENTS.md trong các ancestor `/`, `/home`, `/home/ptdung`, `/home/ptdung/solidity-projects`, root repository hoặc danh sách file tracked. Đọc source/tài liệu và toàn bộ API issue/comment/review hiện hành trước thay đổi.
- Chỉ sửa tài liệu/evidence chung: không đổi code/harness/tests/manifest/migration/lockfile/workflow. Giữ ba migration/manifest tests và verify-only workflow; không provisioning, service action, testnet transaction hoặc secret trong evidence.

## Quyết định theo từng phạm vi

| Phạm vi | Kết luận hiện hành | Evidence / owner còn lại |
|---|---|---|
| QA07 implementation/regression | Pinning P2 **resolved** theo TV3 **COMMENT**, không whole-PR approval | [review6055560601](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6055560601), b92bef5/fixbbe6fa4. 23regressions và isolated real-worker interleaving PASS thuộc run nguồn25/11, không rerun26/11 |
| Security helpers | TV1 **APPROVED** đúng signing/submission/receipt/journal/roles tại b186844 | [6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460); không authorization broadcast hoặc approval BE08/FE/release |
| BE08 | TV2 **APPROVED** PR60 0a5cc5c và PR61 cba8b6c | [6053195381](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6053195381) / [6053196499](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#pullrequestreview-6053196499). Late-fifth/topic-index/batch-SQL rollback không còn finding trong scope; không gọi review toàn delivery đã approve |
| Local pipeline #41 | **ACCEPTED** scoped, không còn chờ TV2 worker/SQL | [TV2 PASS7155488965](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7155488965), [TV4 signoff7155604461](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7155604461). Product6766e5e/H52/hash6be070…ba66/revisionae1ae7f2…82c9; SQLqueryH58≠publicationH52, numericdeployment1≠APInameqa07-e2e |
| #19 provenance bổ sung | **ĐẠT scoped binding**, documentary/full issue **PARTIAL** | [Review bytes](2026-11-26-issue19-provenance-review.md): run20261124T081807Z-tv3-account-switch/capturedAt/source/manifest/handoff khớp. TV3 còn ảnh/clip B-active sau Submit + exact H26 MetaMask version; không gán13.57.0.0 profile khác. Nếu thiếu lịch sử, chỉ draft/account-switch/no-send run mới |
| #40 lifecycle | **B: narrow new receiver run**; historical lifecycle PARTIAL, BE09 offline ACCEPTED không đổi | [Quyết định TV4/checklist7184789349](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7184789349). TV3 chạy owned receiver, TV2 hỗ trợ, TV4 kiểm bytes; không lấy Linux TV4 thay receiver hoặc khôi phục run cũ |
| #42 API restart | **RECEIVER READINESS PENDING**, không chờ source approval lại | [TV3 blocker7158743785](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7158743785), [điều phối7184789885](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7184789885). TV2 chỉ receiver phù hợp/cách chuẩn bị; nếu cần deployment mới, nhóm quyết định vì xung đột no-redeploy. TV3 sau đó API-only, worker/PG giữ nguyên; BE06 đã nhận không rerun |
| #20 Sepolia | **BLOCKED**, không authorization/deployment/acceptance mới | Owner do nhóm chỉ định: full approved SHA,9public addresses,6custodians,signing path,numeric gas/fee budget/funder,explicit authorization; rồi actual manifest/roles/Executed+Defeated thời gian thật. Không mặc định TV1/TV2 là signer |
| #6/#7/#44 | In review/PARTIAL; **NOT RELEASE-READY** | Nhóm chọn revision/manifest demo/report/video và hoàn tất documentary/receiver/testnet. Giữ10Ready(single)N/A, bounded invariants, #18/#36 đã nhận; không promote main/tag/release |

## Kiểm tra thực hiện và giới hạn

Môi trường lượt này: Linux7.0.0-43-generic/x86_64, Python3.12.3, Node22.23.3/npm10.9.9. Review source b92bef5; historical attachment source6766e5e, không đổi nhãn runtime TV3. Dùng GitHub REST API/CLI authenticated `dung0611`, không sửa OAuth scope. CLI2.106.0 tải từ release chính thức, checksum asset khớp.

| Lệnh / thao tác | Kết quả thực tế | Giới hạn |
|---|---|---|
| `python3 /tmp/tv4-github-20261126/verify_docs.py`; selective `commit.draft().diff()` | **exit0**: 10files,33new/changed relative links+anchors,12full Git SHA objects; whitespace/conflict checks không lỗi; operations.test.mjs/verify-release.yml/ci.yml byte-identical baseline. Diff chỉ10docs/evidence files | Không chạy guard tests lại vì không đổi code/workflow; không whole-repository link/history audit |
| HTTP download hai attachments #19; ZIP CRC/path/exclusive extraction | Supplement3.006bytes/3files; original1.575.039bytes/23files; SHA-256 khớp | Không phải chạy extension mới |
| `python3 /tmp/tv4-github-20261126/verify_provenance.py` | **exit0**, supplement2/2 và original22/22 checksums, run/source/digests/genesis/endpoints/H21-H26 bindings PASS,12/12 first-party Git hashes | Không timestamp attestation, served-frontend attestation hoặc full header ancestry H21→H26; B-active visual/version vẫn thiếu |
| Đọc exact-head CI/reviews qua GitHub API | PR60 b92bef5 push45572260043 + PR45572267179: mỗi run10success/1publish **SKIPPED**; fallback success. PR61 cba8b6c PR45403578782/fallback45403578804 success | Đây là CI nguồn đã có, không local rerun hoặc CI của docs head mới; PR checkout merge-ref khác event head |

Không chạy lại toàn bộ campaign, backend/Foundry/browser hoặc receiver vì delta chỉ tài liệu. Regression/guard giữ nguyên; không tăng PARTIAL/SKIPPED/N/A thành PASS. CI của head tài liệu sau push và actual merge checkout sẽ ghi trên PR60; green lịch sử không thay head mới.

## Runbook và bàn giao

- [Test matrix](../test-plan.md), [TV4 checklist](../tv4-checklist.md), [work summary](../tv4-work-summary.md): gỡ pending pinning/workerSQL/BE08 cũ, giữ exact scope/SHA.
- [Receiver lifecycle và API-only](../indexer.md#receiver-acceptance-26112026), [BE06 receiver status](../be06.md#nghiệm-thu-receiver-42--cập-nhật-26112026): ownership/PID/listeners/Windows restoration/foreground actual exit; API materialize+pin5data endpoints/health riêng/sáu status+raw/context+semantic digest đúng jq TV2 gồm newline; không query snapshotRevision hoặc đổi latest để che409/503/TTL/revision.
- [Sepolia owner gates](../sepolia-deployment.md), [demo/source/manifest/expected/failure plan](../qa07-e2e.md#diễn-tập-integration--release--2411): technical/local preparation không thay external-dependent rehearsal. Chưa diễn tập receiver TV3, narrow MetaMask mới, authorized Sepolia hoặc quay video nhóm trong lượt này.
- Chỉ cập nhật issue/PR hiện có; không request trùng đối với provenance/workerSQL/review đã đủ. Không tự đóng issue, merge PR60/61, promote Dev→main, tag hoặc release. Không gửi private key/seed/password/keystore/RPC secret vào GitHub/log.
