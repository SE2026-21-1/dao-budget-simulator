# VT-062 — Review diff sau GREEN (AI review, 2026-10-31 UTC)

Phạm vi source được đọc: production diff `ae8c353..8a4cb64`, hai test RED trong `9a87741`, test bổ sung trong `8a4cb64` và `6144f1b`, spec/plan v1–v4. Đây là review của AI; sinh viên mới xác nhận nguyên nhân RED, chưa xác nhận review hay chấp thuận patch.

| Câu hỏi review | Kết luận và evidence |
|---|---|
| Identity có gắn đủ request? | `CreateProposalPage.tsx:44–50` xây key từ payload đã build, account, wallet chain, deployment chain/ID, governor và treasury. `buildProposal` ở `transactions.ts:140–146` đưa requestId vào calldata. Test UI đổi calldata do amount và đổi account rồi xác nhận không gửi thêm (`CreateProposalPage.vt062.test.tsx:210–267`). Chain/deployment được đọc trong key nhưng chưa có test thay đổi cấu hình runtime. |
| Timeout sau H1 có gửi lại? | `useTransaction.ts:31–38,42–49` giữ pending `{hash,key}` khi `waitForReceipt` reject lỗi tạm; retry cùng key dùng H1 thay vì gọi `send`. Hai assertion RED giữ nguyên tại unit và UI; GREEN `green-original-two.txt`. |
| Sau thành công có gửi thêm? | Khi `proposalIdFromReceipt` trả ID, UI vô hiệu hóa nút (`CreateProposalPage.tsx:56–58,86`); test UI mới bấm thử nút sau thành công và send count vẫn 1 (`CreateProposalPage.vt062.test.tsx:203–207`). **Finding F1** dưới đây chỉ ra đường thiếu ID chưa được bảo vệ. |
| Payload/scope khác có nhận H1 nhầm? | `useTransaction.ts:15–24` chặn key khác khi H1 chưa rõ kết quả; UI test đổi payload/account và khôi phục bản cũ mới wait(H1). `assertWritable` chạy trước hook (`CreateProposalPage.tsx:42`), nhưng mock UI chưa thực thi guard thật cho chain/deployment. |
| Revert, cancel, repricing? | `transactions.ts:72–87` phân biệt terminal revert/cancel/replace và repriced; `waitForReceipt.vt062.test.ts` có timeout, status reverted, callback replacement resolve/reject và repriced. `useTransaction.vt062.test.ts` kiểm terminal xóa pending, callback success không chạy khi terminal. |
| Callback sau success? | `useTransaction.ts:38–41` xóa pending, đặt success rồi gọi callback; unit retry kiểm callback đúng một lần. Lỗi callback bị nuốt để không đảo receipt success; nhánh callback throw chưa có test riêng. |
| Caller không cấp identity? | `useTransaction.ts:22–24` giữ hành vi action mới nếu callback object khác và cả hai key là function. Unit kiểm non-keyed fallback; source caller: `TreasurySection.tsx:41`, `ProposalActions.tsx:35`, `WalletPanel.tsx:23`. Cơ chế VT-062 có key chỉ áp dụng cho CreateProposalPage, không khẳng định các caller kia chống trùng. |
| Oracle có độc lập? | Test API có expectedRequestId bytes32 fixture cố định, xác nhận khác proposalId thập phân (`vt062-request-id.test.mjs:18–40`), assert list/detail `:120–142` và snapshot count = 0 trước request. Test UI dùng expected send count 1, wait(H1) hai lần và form/requestId nguyên vẹn từ acceptance criteria. Mock `proposalIdFromReceipt` trả 42 nên không xác minh decoder thật; test API đi qua mapper thật riêng. |

## Finding F1 — success không có ProposalCreated ID có thể gửi lại

**Mức độ:** trung bình, có điều kiện; cần xử lý riêng trước khi tuyên bố mọi successful retry đã an toàn. `proposalIdFromReceipt` trả `null` nếu receipt không có log giải mã được (`transactions.ts:155–164`). Callback đặt `submittedId` thành `null` (`CreateProposalPage.tsx:56–58`), trong khi nút chỉ khóa success qua `submittedId !== null` (`:86`). Hook đã xóa pending ngay khi receipt thành công (`useTransaction.ts:37–39`), nên một submit kế tiếp có thể chạy `send` mới. Đây là suy luận trực tiếp từ source; chưa dựng reproduction UI cho receipt success thiếu event. Với receipt proposal hợp lệ có `ProposalCreated`, test UI đã xác nhận nút khóa. Cần quyết định UX khi receipt success nhưng thiếu event rồi viết test/patch riêng; không sửa production trong lượt đánh giá này.

## Giới hạn review

Không có ví extension, RPC chain thật hoặc testnet. UI tests mock API/wallet/transaction; test API dùng PostgreSQL 18.4 và HTTP loopback thật. Kết luận về byte identity và mapper dựa trên source + test; chưa chứng minh khôi phục sau reload hoặc đa thiết bị. Không dùng mutation ở indexer để khẳng định frontend đã chống giao dịch trùng.
