# TV4 — công việc chung và bàn giao theo GitHub, 27/11/2026

> **Historical first27/11 snapshot:** [r3 current handoff](2026-11-27-r3-dev-merge-handoff.md).
> #42 independently PASS scoped; actual integrated union/admin candidate exists with r2 runtime proof.
> Earlier NOT READY/static-only statements below are not current source-merge or receiver blockers.

## 1. Baseline / nguồn tin

Đọc README, manifest scripts, tracked guidance, Git status/remotes/branches/worktrees và đầy đủ GitHub body/comments/reviews/inline/pagination cho #6/#7/#19/#20/#40/#41/#42/#44, PR60/61/62/52. Không có root `AGENTS.md` hoặc AGENTS tracked trên cây PR60/Dev đã kiểm. Không nhận bài cá nhân vào phạm vi. GitHub API raw và transcripts đầy đủ nằm ngoài repo `/tmp/tv4-review-20261127`; links công khai theo từng báo cáo bên dưới.

Working tree gốc sạch tại `57e8cba1083ce8cd6e12e38c42065ee7ffcb2cf2`, local `fix/tv4-submission-identity-20261124`, upstream PR60 đã tiến. Giữ nguyên; không reset/stash/overwrite, không force-push. Worktree bàn giao riêng `/tmp/dao-tv4-delivery-20261127`, local `tv4-delivery-session-20261127`, bắt đầu đúng remote PR60; đích normal-push **`feature/tv4-qa-completion-20261121` / PR60→Dev hiện có**, không tạo PR trùng, không push Dev/main. PR62 review ở detached worktree riêng, không sửa source PR62.

| Ref / loại source | Full SHA đã resolve |
|---|---|
| Dev hiện hành / PR52 head | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| PR60 docs/delivery baseline | `d4d405f2ca64e1786b44c7d81354cbe2de18040f` |
| PR61 BE08 code head | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| PR62 source thực chạy narrow tests | `d4a0fb563e66be951760167a6f62b246821dc17c` |
| PR52 base main, chỉ so sánh promotion | `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` |
| #19 evidence commit, không product source | `887c5ecafd79feaf64956b8e05e9d16576404d84` |
| #19 lượt hẹp mới product source | `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44` |
| #41 pipeline accepted product | `6766e5ee2d8c466542687cbeb09677c4d11e5463` |
| #42 receiver source đã TV2 duyệt | `896f93ea282d76fa72339a97ea12339240c16da4` |

Source approval không phải latest Dev approval: TV1 security **b186844d1ff19ef26dfd83a060e7584bb6e0c419**, TV2 BE08 PR60 **0a5cc5cfda29a92df4ab4498e1cd72cd57023088** / PR61 **cba8b6c9eda65959d82250441b8eed131a1a5044**; TV3 pinning-resolved COMMENT **b92bef5409d6478de97efbc8209241620967d18a**, không whole-PR APPROVED. [Bảng exact reviews và blobs](2026-11-27-pr60-pr61-integration.md#6-review-đúng-sha--scope-không-blanket-approval).

## 2. Đầu ra hoàn thành

| Scope | Kết quả / evidence |
|---|---|
| #19 | [Review bytes/ảnh/guard/503/verdict](2026-11-27-issue19-review.md), [inventory JSON](2026-11-27-issue19-review.json): 7/7 payload hashes, 12first-party+51dependency CRLF comparisons; B-active visual accepted. No-send inference only; phiênH26 không bị sửa; full issue pending |
| PR60/61 | [Git-object audit, approvals, resolution](2026-11-27-pr60-pr61-integration.md), [patch review](2026-11-27-pr60-dev-resolution.patch): mỗi PR conflict **chỉ registry** với Devd63842a; giữ ancillary ABI và frozen topic index. Static patch apply/check đạt, chưa áp vào branch hoặc actual merge |
| #42 rồi #40 | [Readiness inventory + collection/comparison/lifecycle checklist](2026-11-27-receiver-readiness.md): TV3 NOT READY/source mismatch/no proposal/no TTL snapshot; API-only và lifecycle runtime SKIP. Hoàn thành các lệnh độc lập có thể bàn giao; không giả máyTV4 là receiver |
| PR62 | [Review full diff/docs/workflow/adapter](2026-11-27-pr62-tv4-review.md): không defect có reproduction trong scope; 144 narrow tests PASS. Canonical pin khác finality; caller cần trusted runtime keccak/deployment và policy. Live archive/EIP1898/finality SKIP do thiếu approved config |
| #6/#7/#44 | [Matrix](../test-plan.md), [checklist](../tv4-checklist.md), [summary](../tv4-work-summary.md), [demo](../qa07-e2e.md) cập nhật scope mới, không đổi lịch sử thành PASS. [Draft theo từng scope](2026-11-27-handoff-drafts.md), **chưa đăng** |

Không source/harness/test/workflow/migration/lockfile production nào được sửa trong delivery này. Patch tích hợp là artifact **để review**; 34files inherited Dev delta, không phải code đã cài hoặc quyền khôi phục #56. Đề xuất **61→60** để giữ bốn original BE08 commits và phần TC10/security/QA riêng của60; fetch/pin/tính lại merge-tree sau từng hop được maintainer cho phép, không coi patch bound head60/Dev hiện tại áp dụng mù sau61. Không nhập PR21/55 hoặc personal ancestry.

## 3. CI thật: event head không phải checkout merge

TV4 tải job logs, đọc full SHA ngay sau `git log -1 --format=%H`. [Bản trích/metadata/checksums](2026-11-27-ci-checkouts.json); PR62 có bốn job-log records trong [review](2026-11-27-pr62-tv4-review.md#ci-từ-github-api--event-sha-khác-actual-checkout).

| Run | Event head | Actual checkout | Kết quả job |
|---|---|---|---|
| [PR60 TV4 CI45771184012](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45771184012) | d4d405f2ca64e1786b44c7d81354cbe2de18040f | **29cea53cb299bcf7dba4fd340f4cf44bd8d6ac13**, merge với Dev3d0f6ca | 10success / 0failure / 1publishSKIP |
| [PR60 push45771172281](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45771172281) | d4d405f2ca64e1786b44c7d81354cbe2de18040f | **d4d405f2ca64e1786b44c7d81354cbe2de18040f** | 10success / 0failure / 1publishSKIP |
| [PR61 TV4 CI45403578782](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45403578782) | cba8b6c9eda65959d82250441b8eed131a1a5044 | **b071a29a3c931ffa007dc2e864d56f81e5c41b67**, merge với Dev896f93e | 10success / 0failure / 1publishSKIP |
| [PR52 TV4 CI45783467915](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45783467915) | d63842ae50dc9a29a42529ce7cd08ca7c569759e | **c35aefaabe3ad964195f71bf22d327a53939d65a**, merge vào mainad8c6cf | 10success / 0failure / 1publishSKIP |
| [PR62 simulator45792157503](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792157503) | d4a0fb563e66be951760167a6f62b246821dc17c | **e604426703610b1a5bbdf07df0dddf8a9ac8f109**, merge với Devd63842a | 2success / 0failure / 0skip |
| [PR62 simulator push45792125336](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792125336) | d4a0fb563e66be951760167a6f62b246821dc17c | **d4a0fb563e66be951760167a6f62b246821dc17c** | 2success / 0failure / 0skip |

PR60/61 refs/pull/merge fetch được còn là **old-base snapshots**, không proof mergeable với Devd63842a. CI60 xanh trên Dev3d0f6ca không chạy integration registry/admin delta mới. Không gọi CI trên docs commit sau delivery đã chạy chỉ vì baseline xanh; theo dõi exact final head sau push riêng. PR52 body assessment cũ không thay current head hoặc cấp quyền promote main. Publish SKIP không phải release.

## 4. Commands thực chạy / giới hạn

Môi trường Linux x64/Python3.12.3/default Node22.23.3; PR62 narrow test đổi PATH sang **Node24.15.0/npm11.12.1**, reuse lockfile-compatible root dependencies, không cài thêm dependency repo.

| Lệnh / thao tác | Actual result |
|---|---|
| `git fetch origin` branch/PR heads+merge refs; agent fetch pinned60/61/Dev riêng | exit0; không branch merge |
| SHA-pinned `curl --fail ...raw.githubusercontent.com/887c5ec.../<file>` ×8 | exit0, actual downloaded files; không đọc qua dynamic branch |
| `sha256sum --check --strict SHA256SUMS.txt` trong gói #19 | **7OK / 0FAILED, exit0** |
| Python Git-blob LF→CRLF + pinned dependency comparisons; RPC/5 deployment receipt/artifact-identity assertions | **12/12 +51/51**, 3snapshot bindings, 5receipt+5internal-runtime bindings; không live RPC/artifact rebuild hoặc frontend attestation |
| `git merge-tree --write-tree <60> <Dev>`; tương tự61 | **exit1 expected conflict**, một path registry mỗi cặp |
| `git merge-tree --write-tree <60> <61>` | **exit0**, tree bằng head60 |
| `GIT_INDEX_FILE=<temporary> git apply --cached --check ...`; apply/write-tree/diff--check/marker checks | **7static checks PASS**, mọi exit0; resulting tree b54a97dd79dd2e5f31ab04fe724637f37ab5b06e. Không runtime union test/actual merge |
| `node --import tsx --test --test-reporter=tap tests/simulator/snapshot.test.ts tests/simulator/engine.test.ts tests/simulator/validation.test.ts tests/indexer/reader.test.ts` ở PR62 exact head | **144PASS / 0FAIL / 0SKIP**, exit0, 4.262s; synthetic snapshot37/engine14/validation38/reader55 |
| Inventory `ss`/filtered `ps`/tool versions local TV4 | read-only, results/exits trong receiver report; không TV3 ownership/receiver acceptance |
| `gh api .../actions/runs?...`, jobs API, `gh run view <run> --log` | exit0 cho bốn TV4 runs đã trích; existing logs, không rerun Actions |

Ban đầu `gh` không executable; cài CLI official2.106.0 vào `/tmp`, asset SHA256 khớp official checksum, `gh auth status` dùng existing keyring dung0611, không nâng scopes/đọc token trực tiếp. Anonymous API rate-limit403 được giữ là access failure, sau đó dùng authenticated read-only CLI; không coi request403 là PASS. Các lỗi/limits tải PR62 logs được ghi trong review riêng.

Delta delivery chỉ docs/evidence, không chạy broad suites/native benchmark/governance/browser/receiver/testnet. Final documentation validation dùng `python3 /tmp/tv4-review-20261127/verify_delivery.py` (links/anchors trên delta, JSON/checksum/bindings, shell-snippet syntax và protected-file equality); kết quả cuối được ghi ở thông điệp bàn giao sau khi thực thi, không giả test count cho docs. Không sửa assertion, timeout, TTL, retry hoặc error để lấy PASS.

## 5. Blocker / owner / output cần nhận

- **TV3 #19:** chỉ phần còn thiếu cho assertion mạnh no-send: closed provider-boundary interval, accounts/from + retained draft/requestId trước–sau, exact extension identity/version capture của run mới. B-active image đã nhận; historical provenance đã đạt, không yêu cầu lại whole governance/provenance. **TV2:** raw503 body/context/URL/timestamp và logs nếu còn để phân loại; nếu thiếu giữ UNKNOWN.
- **TV2 + lead #42:** stack TV3 hiện báo source4cba99a/khôngproposal/khôngTTL không đủ. Chỉ receiver khác phù hợp hoặc kế hoạch chuẩn bị với quyết định rõ no-redeploy vs deployment mới; source khác896f93e phải được review đúng fullSHA. **TV3:** sau readiness thu API-only trước #40 nếu cùng stack; 6cặpHTTP/5digests/context/process identity/actual exits. Không tự tạo deployment để vượt blocker.
- **TV3 #40, TV2 hỗ trợ:** narrow run mới về shutdown/PIDs/listeners/Windows task+transport/Vite restoration/HTTP recovery và actual foreground serve exit. Không hồi tố run cũ hoặc dùng máy TV4 thay receiver.
- **PR62 deployment/transport owners:** approved current endpoint+chain/Treasury/BUD/trusted runtime keccak/pin và numeric finality policy trước live/archive acceptance. Review không approve thay reviewer.
- **#20 owner do nhóm chỉ định:** full approved deploymentSHA,9public addresses,6custodians/exclusive custody/signing path,numeric gas/fee budget/funder,explicit authorization gắn chain/map/SHA/budget; sau đó actual manifest/runtime/roles/real-time Executed+Defeated. Vẫn **BLOCKED**, không mặc định TV1/TV2 giữ signer, không xin secret.
- **Nhóm #44:** chọn cùng source/manifest/report/demo/video và acceptance gates; **NOT RELEASE-READY**. #6/#7 In review/PARTIAL; #41 local OptionB accepted đúng product6766e5e/H52, SQLqueryH58≠publicationH52, deploymentSQL1≠API name. Không mở lại #18/#36, BE06 hoặc bounded invariants;10Ready(single) giữ N/A; historical FAIL/raw bytes không sửa.

Không post comment/review/resolve/đóng issue, không merge/promote/tag/release, không Terraform/OpenStack/SSH rollout hoặc broadcast Sepolia. Giữ signed-submission identity/journal-before-broadcast,receipt binding,funding guards,BE07clock,ba migration/manifest tests và verify-only workflow nguyên source.
