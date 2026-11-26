# What-if Budget Simulator (TV1)

## Phạm vi và nguồn thiết kế

Module off-chain độc lập để thử các kế hoạch giải ngân BUD giả định. Không có RPC,
wallet, giao dịch, deployment hoặc thay đổi API/UI. Kết quả luôn mang nhãn
`hypothetical-budget-result-v1`; không phải receipt hoặc chứng cứ blockchain.

Base triển khai: `Dev` tại `3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e`.
`main` lúc bắt đầu: `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4`.
PR #60/#61 còn mở, không nhập source chưa merge từ hai PR này. Hạ tầng OpenStack/
Anvil có sẵn trên Dev nằm ngoài phạm vi; không chạy workflow triển khai của nó.
Không tìm thấy AGENTS.md áp dụng hoặc engine what-if đã có. `fixtures/api/simulation.json`
là timeline tổng hợp BE01, không phải engine và không được dùng làm dữ liệu chain thật.

Đối chiếu trực tiếp `contracts/Treasury.sol`, `BudgetGovernor.sol`, `BudgetToken.sol`
và `GovernanceToken.sol` tại base:

- Mỗi proposal chứa đúng một action `Treasury.disburse(bytes32,address,uint256)`.
- Recipient khác zero và khác chính Treasury; amount > 0.
- `paidRequests` gắn với requestId, không gắn riêng proposalId. Hai proposal được
  phép có cùng requestId nhưng chỉ một lần trả thành công.
- Thiếu quỹ không tiêu requestId. Revert không thay balance hoặc trạng thái paid.
- BUD demo là ERC20 cố định supply, không phí, 18 decimals. Engine dùng `bigint`
  theo base units; không giả lập token có phí/callback hoặc lỗi ngoài mô hình.
- GOV dùng timestamp checkpoints. Engine này không tính votes/quorum, deadline,
  ETA, cancellation, signature hoặc quyền thật của Governor/Timelock.

`executionAllowed` là giả định explicit do người lập kịch bản cung cấp. Nó không
chứng minh proposal có thể execute trên chain. Không tự lấy eligibility từ trạng
thái API, không tự đổi nó sau top-up. Chỉ retry lỗi thanh khoản được mô hình hóa.

## Thiết kế triển khai

`simulator/types.ts` định nghĩa scenario và trace; `validation.ts` kiểm tra/chuẩn
hóa input; `engine.ts` chạy tuần tự bằng state cục bộ; `scenarios.ts` xây thứ tự;
`comparison.ts` so các kế hoạch explicit, không sinh hoán vị; `formatting.ts`
chuyển đổi amount chính xác. Test dùng Node test runner + tsx sẵn có, TypeScript
strict của root. Không thêm dependency hoặc import implementation TV2/TV3.

Input gồm Treasury address, initial balance, tập request đã trả ban đầu, danh sách
proposal và các bước theo thứ tự. Proposal ID là nhãn opaque của simulator; có thể
dùng chuỗi ID Governor từ API nhưng engine không tự tính proposal hash.

Execution trace ghi từng attempt (kể cả retry) với balance trước/sau và nguyên nhân.
Thành công tiêu quỹ và requestId cùng lúc; thất bại giữ nguyên cả hai. Top-up chỉ là
giả định funding ngoài Treasury, không mint BUD và không xác nhận tài khoản nào đủ
quỹ. Balance từng thời điểm nằm trong uint256; tổng dòng tiền có thể lớn hơn uint256.

So sánh chỉ chạy các kế hoạch người dùng chỉ định với giới hạn kích thước cố định.
Không khẳng định mọi hoán vị đều hợp lệ theo governance/timelock thật.
