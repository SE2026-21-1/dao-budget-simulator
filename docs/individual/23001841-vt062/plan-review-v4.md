# VT-062 — Source correction: proposal ID versus retry transaction (v4)

Ngày: 2026-10-30 UTC. Đây là lần rà source bổ sung sau khi v3 nâng test từ hook unit lên form UI.

## Evidence mới

BudgetGovernor.sol line 85 delegates valid proposals to super._propose. Baseline submodule lib/openzeppelin-contracts is gitlink c64a1edb67b6e3f4a15cca8909c9482ad33a02b0. Trong Governor.sol của đúng commit này, _propose computes proposalId from targets, values, calldatas and descriptionHash (lines 304–312), then rejects an already-seen voteStart before event emission (lines 316–318).

Với form và requestId không đổi, calldata và descriptionHash không đổi, nên proposalId giống nhau. Transaction gửi lần hai vẫn là side effect thừa, nhưng theo source sẽ revert; không được nói nó chắc chắn tạo ProposalCreated thứ hai hoặc thêm proposal data.

## Wording/spec đã điều chỉnh

- Lỗi trực tiếp cần sửa: sau khi H1 đã được ví gửi và receipt chưa quan sát được, nút retry gọi lại sendGovernor, tạo H2; H2 là giao dịch dư thừa/expected revert cho payload trùng.
- Không quy kết lỗi này cho BE03 raw event dedup, Treasury paidRequests hoặc Governor duplicate proposal ID guard.
- Tách ba invariant: raw event dedup theo chainId+txHash+logIndex; proposalId exact-payload uniqueness ở Governor; duplicate successful disbursement protection theo requestId tại Treasury; VT-062 chỉ kiểm tra ứng dụng không gọi wallet send lần hai khi đã biết H1.
- Nếu người dùng đổi description/action nhưng giữ requestId, proposalId có thể khác và tạo proposal khác; đây không phải retry cùng payload. Bảo đảm hiện tại chỉ cho cùng draft chưa đổi trong cùng mounted session. Không tuyên bố giải quyết reuse requestId giữa payload khác, reload hoặc nhiều browser.
- UI test thật đã assert nội dung form và requestId giống nhau ở cả hai lần submit. Primary oracle vẫn sendGovernor count = 1 và waitForReceipt(H1) hai lần; UI test hiện fail tại sendGovernor actual 2.

Plan v1 problem statement giữ lại như giả thuyết ban đầu đã được review. Phần diễn giải authoritative về hậu quả trên chain là tài liệu này cùng plan-review-v2.md và plan-review-v3.md.

## Acceptance criteria sau review

AC1. Sau khi ví trả H1, lỗi RPC/receipt quan sát tạm thời giữ H1 và trạng thái chưa thành công trên trang đang mở.  
AC2. Bấm gửi lại cùng draft chưa đổi không gọi sendGovernor lần nữa; lần chờ tiếp theo theo dõi H1.  
AC3. Khi receipt H1 thành công, callback xác nhận chạy đúng một lần và trang hiển thị Proposal ID lấy từ receipt.  
AC4. Nếu lỗi xảy ra trước khi send trả hash (ví dụ từ chối ký), retry được phép gọi lại ví; không chờ hash rỗng.  
AC5. Trong cùng phiên component, title/body/recipient/amount/requestId vẫn là cùng draft qua wait failure và retry.

AC5 được test trong UI case bằng assertion đối số buildProposal ở hai submit; test requestId response mapping T10 vẫn là test mutation bổ trợ, không phải cơ chế retry.
