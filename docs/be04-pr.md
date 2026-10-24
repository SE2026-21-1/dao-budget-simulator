# feat indexer Implement BE04 proposal and treasury projections

Base PR dự kiến: `feature/tv2-be03` (#22), sau khi #22 merge sẽ chuyển base sang
`Dev`. Nhánh `feature/tv2-be04`; PR này chỉ thêm BE04 trên BE03, không tự merge.

## Description

BE04 dựng bảng proposal/vote/operation/transfer/disbursement từ raw BE03 và
công bố snapshot chỉ sau khi contract và dữ liệu suy ra khớp tại cùng H. Clock
trên block trống vẫn đổi Pending/Active/result và Waiting/Ready; chỉ BUD
Transfer được tính dòng tiền, BudgetDisbursed nối khoản chi cùng transaction.

- Giữ nguyên description/calldata; kiểm proposalId/hash, operation hash và salt
  của OZ 5.4.0; giữ sáu field VoteCastWithParams. requestId lặp không làm nối nhầm
  proposal chưa thực thi.
- Migration 003, projection checkpoint H/hash/revision và bảng trạng thái; thay
  bảng dẫn xuất trong một transaction với advisory lock như BE03. Đối soát dùng
  EIP-1898 canonical block hash cho mọi eth_call.
- CLI `--project` / `--sync-project`, SQL truy vấn, runner DB/live và CI.
  16 bootstrap unknown của BE03 giữ nguyên; combined CLI vẫn exit 2.

## Validation

- Build/typecheck PASS; BE04 23 unit + 8 real PostgreSQL PASS, không skip.
- Hồi quy BE02/BE03: 86 unit/CLI, 21 + 16 PostgreSQL PASS.
- Anvil mới, deployment/roles từ script repo: 8 mốc H=24…55,
  5 proposal, 7 vote, 2 operation, 1 payment 1.000 BUD; treasury còn 9.000 BUD.
  Cùng requestId execute lần hai revert, giữ Queued/Ready; repeat projection và
  raw idle restart giữ dữ liệu ổn định.
- Môi trường local: Node 24.19.0, Forge/Anvil 1.7.1, Solc 0.8.37/Osaka,
  PostgreSQL 16.15 với điều chỉnh startup guard trong namespace chỉ có UID 0.
  Chưa xác nhận CI với toolchain chuẩn Forge 1.8.5/PostgreSQL 18.4.

Evidence: `docs/evidence/be04-20261024/`, hướng dẫn `docs/be04.md`.
Liên quan #18; không đóng issue đó bằng BE04.

## Review and limits

TV1: semantics clock/quorum/salt/calldata. TV4: canonical H, atomic publication,
raw unknown policy và chạy CI chuẩn. Chưa có peer review.
Full replay và publication mới nhất là phạm vi BE04; HTTP API thuộc BE05,
production rebuild/compare BE06, rollback/retry BE07, benchmark BE08.
