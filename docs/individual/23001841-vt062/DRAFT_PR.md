# Draft PR — VT-062 idempotent retry (chưa publish)

**Base dự kiến:** nhánh frontend phù hợp của repository chính thức, cần kiểm lại ngay trước khi tạo PR. **Head local:** `individual/23001841-vt062-idempotent-retry`. Chưa push và chưa có link PR hoạt động.

## Nội dung đề xuất

- Test-first RED: sau ví trả H1, RPC timeout làm lần retry gửi ví lần hai; giữ cùng request identity và tiếp tục `waitForReceipt(H1)`.
- F1 test-first RED: receipt H1 thành công nhưng thiếu Proposal ID làm form có thể gửi lại; giữ success/H1 theo request key và chặn ở submit handler.
- Kiểm thử các partition trước hash, timeout, concurrency, success có/không có ID, revert/cancel/repriced, payload/account khác. API/PostgreSQL test riêng bắt mutation requestId mapping.
- Evidence source SHA, RED/GREEN, mutation, coverage, flaky và tải synthetic 60 task trong `docs/evidence/vt062/`; báo cáo Markdown/PDF và README tái lập trong `docs/individual/23001841-vt062/`.

## Kiểm chứng

Frontend source cuối F1: 33/33 test pass; lint/build exit 0. API mutation trước F1: good-pass → mutant-fail ở assertion requestId → restored-pass trên PostgreSQL/snapshot mới. Tải local: xem `load/aggregate.json`; chỉ đo hook React với boundary ví/receipt giả, không khẳng định SLA chain thật.

## Cần người review

1. `CreateProposalPage.tsx:39–79`: request identity, điều kiện guard sau success và thứ tự kiểm `assertWritable` cho write mới.
2. `useTransaction.ts:15–49` và `transactions.ts:72–87`: timeout sau hash, terminal revert/cancel/repricing và callback.
3. UX khi receipt thành công nhưng chưa có Proposal ID, thông báo H1 và refresh.
4. Phạm vi local mount: chưa hỗ trợ reload/multi-tab; chưa có E2E extension wallet/Anvil và chưa đo SLA thật 60 người dùng.

Không tự merge. Chỉ push/mở PR khi sinh viên yêu cầu riêng; chưa ghi sinh viên đã review/chấp thuận patch.
