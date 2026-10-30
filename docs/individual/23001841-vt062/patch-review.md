# VT-062 — Review patch sau xác nhận RED

Sinh viên xác nhận đã xem log RED tại assertion `expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1)` với actual 2. Xác nhận này cho phép AI làm patch; chưa có xác nhận sinh viên đã review patch hay hiểu code.

## Logic cần review

1. `CreateProposalPage.tsx` tạo `requestKey` từ account, wallet chain, chain/deployment ID, governor/treasury và toàn bộ payload (`targets`, `values`, `calldatas`, `description`). Calldata chứa `requestId`; key thay đổi nếu draft, request ID, account hoặc deployment đổi. `assertWritable` và `buildProposal` vẫn chạy trước khi gọi hook; lần retry không chạy lại `assertCanPropose`/`sendGovernor` vì hook bỏ qua callback gửi khi key trùng H1.
2. `useTransaction.ts` giữ `{hash,key}` trong ref ngay sau khi ví trả H1. Timeout/lỗi quan sát receipt giữ ref; lần `run` cùng key chỉ gọi `waitForReceipt(H1)`. `running` chặn overlap. Key khác khi đã dùng key tường minh bị chặn với thông báo; không gắn H1 vào request khác và không gửi H2. Sau receipt thành công, ref xóa, callback xác nhận chạy một lần. Lỗi trước khi có H1 không tạo pending ref nên retry được gửi lại.
3. `transactions.ts` dùng `ReceiptTerminalError` để phân biệt receipt revert và ví cancel/replace (khác `repriced`) khỏi RPC timeout. Hook xóa pending ref với kết quả terminal; ví có thể gửi action mới sau đó. `repriced` cho cùng action tiếp tục dùng receipt trả về.

## Ảnh hưởng của hook dùng chung

Các caller khác là `TreasurySection` (nạp BUD), `ProposalActions` (vote/cancel/queue/execute) và `WalletPanel` (delegate). Chúng không truyền `requestKey`; callback mới vẫn bắt đầu action mới như baseline, tránh thay đổi hành vi ngoài slice. Nếu chính cùng function object được gọi lại sau timeout, hook sẽ tiếp tục theo dõi hash; trường hợp này được test unit. Cơ chế chống duplicate có key tường minh hiện áp dụng cho CreateProposalPage. Vì các caller khác chưa có identity ổn định, không tuyên bố chúng đã được bảo vệ khỏi gửi trùng.

## Giới hạn và điểm cần sinh viên tự kiểm

- Bảo đảm chỉ trong cùng mounted component, cùng requestKey, sau khi ví đã trả hash. Reload/tab khác không phục hồi H1; ví có thể gửi transaction khác nếu người dùng tự thao tác ngoài UI.
- Test UI mock `buildProposal`, ví, API và RPC; cần thử với ví/Anvil nếu muốn xác nhận tích hợp thực. Test của `waitForReceipt` chỉ mô phỏng các callback replacement của viem.
- Sau H1 timeout, đổi payload hoặc account trong trang sẽ hiện lỗi và không gửi. Muốn tiếp tục H1 phải khôi phục đúng request/account/network/deployment trên trang đang mở. Sau cancel/revert đã xác định, có thể tạo giao dịch mới.
- Bản nháp có `requestId` được tạo một lần khi mount; nếu đổi draft sau một transaction terminal, ID cũ vẫn được dùng. Đây là hành vi baseline của form và cần cân nhắc ở phần thiết kế sản phẩm rộng hơn.

Mutation response-field, coverage, thử flaky risk và tải 60 tác vụ thuộc lượt sau; chưa thực hiện trong lượt patch/GREEN này.
