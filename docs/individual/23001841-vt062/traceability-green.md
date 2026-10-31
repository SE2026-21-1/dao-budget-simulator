# VT-062 — Traceability tới GREEN

Nguồn acceptance criteria: `plan-review-v4.md`; source commit `8a4cb6474775d210d6126b9faa3fab87b4bc2d07` sau test-only commit `9a87741ae4728edb4092ece6d8d9e4c90f7650b7`.

| Requirement / partition | Test assertion cụ thể | Source liên quan | Evidence |
|---|---|---|---|
| AC1, EP2: H1 còn khi RPC timeout | `useTransaction.vt062.test.ts`: first run null, phase error, hash H1, callback 0; UI thấy H1 và timeout | `useTransaction.ts`: pending ref chỉ xóa sau kết quả terminal | `red-targeted.txt`, `red-ui.txt`, `green-original-two.txt` |
| AC2, EP2: retry cùng request không gửi H2 | Hai test RED giữ `send`/`sendGovernor` count = 1; `waitForReceipt` hai lần đều nhận H1 | `CreateProposalPage.tsx`: requestKey; `useTransaction.ts`: nhánh previous hash | `green-original-two.txt` |
| AC3, EP4: kết quả H1 thành công | Unit trả đúng receipt H1 và callback 1; UI thấy Proposal ID 42 từ receipt | `useTransaction.ts`: success/callback sau wait; `CreateProposalPage.tsx`: proposalIdFromReceipt | `green-original-two.txt` |
| AC4, EP1: ví từ chối trước hash | Unit đầu send reject, hash null, lần retry send lần 2, wait chỉ với H1 | `useTransaction.ts`: pending ref chỉ lập sau send resolve | `green-original-two.txt` |
| AC5: cùng draft và đúng identity | UI kiểm title/body/recipient/amount/requestId ở hai submit; test bổ sung đổi calldata hoặc account bị chặn và quay về identity cũ tiếp tục H1 | `CreateProposalPage.tsx`: key gồm account/chain/deployment/payload | `green-original-two.txt` |
| EP3: chạy chồng khi wait pending | Unit deferred barrier: run thứ hai trả null, không send/wait thêm | `useTransaction.ts`: running ref | `green-original-two.txt` |
| EP5: revert/cancel/replacement terminal | `waitForReceipt.vt062.test.ts`: timeout giữ nguyên lỗi, revert/cancel/replace thành terminal, repriced thành công; hook xóa pending và cho action mới | `transactions.ts`: ReceiptTerminalError; `useTransaction.ts`: clear pending | `green-frontend-suite.txt` |
| EP6: action mới sau success | Unit H1 success rồi request B gửi H2 | `useTransaction.ts`: clear pending sau success | `green-original-two.txt` |
| Hook dùng chung | Unit callback khác không có key vẫn gửi action mới; kiểm ba caller trong source | `useTransaction.ts`: non-keyed fallback | `green-original-two.txt`, `patch-review.md` |

T10 API response-field mapping/mutation và tải 60 task chưa thuộc lượt này. Chưa có E2E extension wallet, testnet hoặc SLA hệ thống.

## Bổ sung đánh giá sau GREEN (2026-10-31)

Đoạn trên ghi trạng thái ở cuối lượt patch/GREEN; các kết quả mới dưới đây không sửa lịch sử đó.

| Requirement/risk | Oracle mới | Evidence / giới hạn |
|---|---|---|
| T10, mutation response field | `tests/api/vt062-request-id.test.mjs:120–142` trên PostgreSQL 18.4: list/detail `requestId` bằng bytes32 fixture, khác proposalId decimal; snapshot rỗng trước request | `mutation/good-02` pass, `mutation/mutant-01` fail assertion mapping, `mutation/restored-01` pass. `evaluation-runbook.md`. |
| AC3, EP4 success UI | Test UI bấm nút sau khi đã hiển thị Proposal ID 42; send count vẫn 1 | `CreateProposalPage.vt062.test.tsx:203–207`; chỉ chứng minh đường receipt có ID. Finding F1 ở `evaluation-review.md` cho receipt success thiếu event. |
| EP5 cancel + RPC reject | Test `waitForReceipt` cho `onReplaced(cancelled)` rồi Promise reject; error vẫn terminal | `waitForReceipt.vt062.test.ts`; `coverage-run.txt`. |
| NFR flakiness time/network/concurrency | 30 lượt logic, 16 test/lượt, 0 fail; deferred/barrier, mock network, không sleep | `flaky-logic-final-*`; không thay cho RPC thật. |
| NFR flakiness order/shared state | 6 seeds shuffle suite 30 test/lượt, 0 fail; ba file chạy độc lập đều pass | `flaky-shuffle-final-*`, `flaky-isolated-final-*`; Vitest isolate=true. |
| Risk coverage ba module production | V8 line/branch: hook 100/96.55, trang 93.18/63.63, transactions 51.13/37.50 | `coverage-run.txt`, `coverage/coverage-summary.json`; indexer API không nằm trong phép đo này. |

Tải 60 task, p95, mutation khác, E2E ví/chain và PDF vẫn chưa thực hiện.
