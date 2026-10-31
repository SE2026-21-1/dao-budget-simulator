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

## Bổ sung F1 test-first RED (2026-10-31)

Finding F1 trong `evaluation-review.md` trước đây chỉ là suy luận source. `CreateProposalPage.vt062.test.tsx:270–328` nay tái hiện có kiểm soát: send → H1, receipt `success`, decoder boundary trả null, UI vẫn hiển thị success/H1 và giữ draft/requestId; lần click tiếp theo gọi sendGovernor lần hai. Oracle expected 1, actual 2 tại `:327`. `f1-red-ui-all-final.txt`: 2 pass/1 fail; `f1-red-frontend-suite-final.txt`: 30 pass/1 fail. Nguồn chi tiết và giới hạn của fault injection: `docs/evidence/vt062/f1-red-review.md`. Chưa có patch production hoặc GREEN cho F1.

## Bổ sung F1 GREEN sau khi sinh viên xác nhận nguyên nhân RED

Đoạn F1 RED trên là lịch sử trước patch; assertion chống gửi trùng vẫn ở test, nay dòng `:335` do các case bổ sung. Source commit `0d0a5f697f3ccc1a76333177f34508f721e8a2b4` và `f1-green-code-tests.diff` là patch thực.

| Requirement/risk F1 | Oracle trên source cuối | Source/evidence |
|---|---|---|
| Receipt H1 success, decoder null | F1 test giữ expected `sendGovernor` 1 sau cùng draft/requestId; UI thấy success/H1, không có Proposal ID | `CreateProposalPage.tsx:73–79,105–108`; `f1-green-final-original-two.txt` |
| Guard trong handler | Submit event trực tiếp khi nút disabled không làm tăng send/wait; áp dụng cả đường có ID và không ID | `CreateProposalPage.tsx:61–65`; `CreateProposalPage.vt062.test.tsx:210–215,335–337` |
| Decoder throw và refresh lỗi | UI vẫn thấy success/H1, submit trực tiếp không gửi lại, lỗi API không bị gắn thành lỗi transaction | `CreateProposalPage.vt062.test.tsx:340–375`; `f1-green-final-suite.txt` |
| Identity khác | Payload/calldata khác sau H1 success được gửi giao dịch H2 và nhận ID 43; unresolved H1 với account/payload khác vẫn bị chặn theo test cũ | `CreateProposalPage.vt062.test.tsx:378–410,217–275`; `f1-green-final-suite.txt` |
| Regression timeout/terminal/caller khác | 33/33 frontend pass, hook/transactions production không đổi | `f1-green-final-suite.txt`, `f1-green-source-identity.txt` |
| Coverage và flakiness trên source F1 | Trang line/branch 94.91/79.68%; UI 30/30 lượt và shuffle suite 6/6 lượt không fail | `f1-coverage-final-run.txt`, `f1-flaky-ui-30-final-*`, `f1-flaky-suite-6-final-*` |

Mutation API good/mutant/restored là evidence trước F1 trên mapper/API không đổi; xem `f1-green-review.md`. Tải 60 task, ví/chain E2E và PDF chưa làm. Sinh viên chưa review/chấp thuận patch.

## Bổ sung thí nghiệm tải và đóng gói (sau F1)

Đoạn cuối mục trước là trạng thái lịch sử sau F1. Trên đúng source hook/page F1 (SHA ở `docs/evidence/vt062/load-runbook.md`), harness mới `frontend/scripts/vt062-load.load.tsx` kiểm T13. Ba process, 10 warm-up +100 measured waves/workload/process, 60 task/wave: 36.000 measured samples, raw CSV và nearest-rank ở `docs/evidence/vt062/load/`. DUPLICATE 300 receipt success đầu wave +17.700 `blocked_inflight`, fake send 300, p95 riêng 0,184630/0,096189 ms, peak logical/waiter 60/1. DISTINCT 18.000 receipt success đúng hash, fake send 18.000, p95 0,262156 ms, peak 60/60; error 0. Đây là hook production + React với fake send/receipt, không đo F1 handler hoặc SLA hệ thống. Báo cáo MD/PDF và README ở thư mục này; sinh viên chưa review/chấp thuận patch.
