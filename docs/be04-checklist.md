# BE04 Checklist bàn giao

Nhánh `feature/tv2-be04`, nền `4b9f060` của BE03. Ngày 24/10, BE03 đã merge
qua PR #22 (`a36247a`), BE04 qua PR #26 (`1451779`). PR #23 là bàn giao
lịch sử trên base BE03, không dùng trạng thái của nó để suy BE04 chưa có trên Dev.
Phạm vi FR04, FR09, FR11, FR13; liên quan #18.

- [x] Proposal từ description nguyên bản + calldata, kiểm proposalId/hash.
- [x] VoteCast và WithParams giữ nguyên trọng số/reason/params.
- [x] Operation nối đúng CallScheduled/CallSalt/queue/execute/cancel.
- [x] requestId được phép lặp giữa proposal; chỉ nối khoản thực thi thành công.
- [x] Transfer là nguồn dòng tiền duy nhất; zero/self/unrelated transfer có test.
- [x] Biên snapshot/deadline/ETA và kết quả quorum có test; không thêm Failed.
- [x] Tự tính lại trạng thái tại H mới không có event nghiệp vụ.
- [x] Đối soát historical RPC dùng canonical block hash cho state/quorum/tally/balance/operation.
- [x] Publication + projection checkpoint commit cùng transaction; SQL/RPC lỗi giữ snapshot cũ.
- [x] Giữ nguyên raw identity/unknown và checkpoint BE03; scope không bị thay ngầm.
- [x] Migration 003 và SQL đọc trong REPEATABLE READ; không sửa migration 001/002.
- [x] CLI --project và --sync-project; combined command giữ exit 2 khi raw chưa decode đầy đủ.
- [x] P2 `--redecode`: regression trên SHA trước sửa **7 pass, 3 fail** như dự kiến; sau sửa BE04 PostgreSQL **10/10 PASS**, raw identity/bytes/checkpoint giữ nguyên.
- [x] P2 receipt wait: test timeout/RPC error/status và official live runner **10/10 phase**, 24 receipt tại H=24…67; raw/projection hash và Treasury total in/out/balance khớp.
- [x] Hồi quy BE02/BE03: 86 unit/CLI và 21 + 16 PostgreSQL PASS.
- [x] GitHub Actions trên code head `53638b816d2b327d6a41fd8657566ee3f503b956`: [run 40078301376](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40078301376) PASS; cả 5 job, gồm BE04 projection/atomic PostgreSQL và live reconciliation, đều success.
- [ ] TV1/TV4 peer review. CI PASS và evidence local không thay thế approval.
- [x] BE04 đã được tích hợp vào Dev qua [PR #26](https://github.com/SE2026-21-1/dao-budget-simulator/pull/26).

Nội dung và phạm vi review dự kiến nằm tại [be04-pr.md](be04-pr.md).
Trạng thái review lịch sử cần đối chiếu GitHub; nghiệm thu local không là approval.
TV4 đã chạy độc lập native PostgreSQL 18.4: 10/10 projection DB tests,
live Anvil → BE03 → BE04 → HTTP API và hai BE06 rebuild tại H=67 đều PASS.
[Evidence mới](evidence/tv4-20261024-acceptance/native/report.json) ghi riêng
runtime, source hashes và cleanup; Docker trên máy TV4 vẫn bị từ chối quyền.

Evidence ban đầu: [report](evidence/be04-20261024/report.md), [live](evidence/be04-20261024/live.json).
Evidence sửa P2: [report](evidence/be04-p2-fix-20261024/report.md),
[live receipt/projection](evidence/be04-p2-fix-20261024/be04-live-final-run.json),
[SQL summary](evidence/be04-p2-fix-20261024/be04-live-final-run-sql.log).
