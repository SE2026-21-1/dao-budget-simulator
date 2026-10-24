# BE04 Checklist bàn giao

Nhánh `feature/tv2-be04`, nền `4b9f060` của BE03 / PR #22.
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
- [x] Sau sửa P2: BE04 unit 27/27 và PostgreSQL 10/10 PASS; live 10/10 phase tại H=24…67, 24 receipt, total in/out/balance khớp.
- [x] Hồi quy BE02/BE03: 86 unit/CLI và 21 + 16 PostgreSQL PASS.
- [x] GitHub Actions [run 40077920715](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40077920715) PASS trên commit code f1cbbbbe; BE04 projection/atomic PostgreSQL và live reconciliation đều PASS. CI theo dõi head PR mới nhất.
- [ ] TV1/TV4 peer review và chạy runner chuẩn.
- [x] Publish nhánh BE04 và [draft PR #23](https://github.com/SE2026-21-1/dao-budget-simulator/pull/23) kế thừa BE03; chưa merge.

Nội dung và phạm vi review dự kiến nằm tại [be04-pr.md](be04-pr.md).
Trạng thái peer review/CI cần kiểm tra trên PR; evidence local không thay thế
hai bước nghiệm thu đó.

Evidence ban đầu: [report](evidence/be04-20261024/report.md), [live](evidence/be04-20261024/live.json).
Evidence sửa P2: [report](evidence/be04-p2-fix-20261024/report.md),
[live receipt/projection](evidence/be04-p2-fix-20261024/be04-live-final-run.json),
[SQL summary](evidence/be04-p2-fix-20261024/be04-live-final-run-sql.log).
