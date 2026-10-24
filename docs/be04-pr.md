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

- `npm ci`, typecheck, build và diff checks PASS; lockfile không đổi.
- Unit: BE02 **64/64**, BE03 **22/22**, BE04 **27/27**; không skip.
- PostgreSQL mới, cô lập: BE01 migration/checks PASS; BE02 **21/21**, BE03 **16/16**, BE04 **10/10**.
- Regression `--redecode` chạy cùng test trên SHA trước sửa: **7 pass, 3 fail** như dự kiến; sau sửa BE04 PostgreSQL suite **10/10 pass**. Raw bytes/identity/checkpoint giữ nguyên, payload/event được khôi phục và unknown/malformed vẫn bị đánh dấu.
- Foundry 1.8.5 CI suite: **142/142 pass**, không skip; Solc 0.8.37, Osaka, optimizer 200.
- Official live runner với Anvil 1.8.5 unforked/PostgreSQL 18.4 cô lập: **10/10 phase**, 24 receipt. H=67, raw/projection cùng hash `0x7b66ac580f1eac86167d0bdc26a7534fe8c15b852fa38d671bf23b488014c836`; Treasury total in 13.000 BUD, out 12.000 BUD, balance 1.000 BUD. Bao gồm duplicate requestId zero và execute thiếu tiền → nạp quỹ → retry thành công.
- Bằng chứng cho bản sửa: [`docs/evidence/be04-p2-fix-20261024/`](evidence/be04-p2-fix-20261024/report.md). Cluster/runtime và dependency tải tạm không nằm trong PR; dump SQL là dữ liệu fixture Anvil cục bộ.
- Docker/PowerShell wrappers không chạy được trên WSL cục bộ do thiếu công cụ; các suite PostgreSQL trực tiếp và live runner đã chạy PASS. GitHub CI cho commit mới sẽ được chạy sau khi cập nhật PR.

## Review and limits

TV1: semantics clock/quorum/salt/calldata. TV4: canonical H, atomic publication,
raw unknown policy và chạy CI chuẩn. Chưa có peer review.
Full replay và publication mới nhất là phạm vi BE04; HTTP API thuộc BE05,
production rebuild/compare BE06, rollback/retry BE07, benchmark BE08.
