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
