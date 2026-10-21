# SC03 — Treasury và chống chi lặp

Căn cứ BR03–BR05, FR08–FR09, INV01/INV03 và phân công TV1.
Giữ nguyên interface ITreasury, event BudgetDisbursed và toolchain SC01/SC02.

## Constructor và bootstrap cho TV4

`new Treasury(address(bud), initialAdmin)` nhận địa chỉ BUD đã deploy và admin bootstrap khác zero.
Token phải có bytecode (loại zero/EOA); kiểm tra này không chứng minh contract là BudgetToken đúng.
TV4 phải đối chiếu địa chỉ với manifest/source đã deploy; không thể xác thực danh tính token chỉ bằng tên/symbol.
Địa chỉ token immutable, không có setter, mint, hàm chi token khác hoặc đường chi dành riêng deployer.
Constructor chỉ cấp DEFAULT_ADMIN_ROLE cho initialAdmin, không cấp SPENDER_ROLE cho ai.
Admin tạm có thể grant/revoke role trong giai đoạn khởi tạo; chưa được xem là hoàn tất phân quyền.

Trình tự bàn giao khi SC05 tích hợp (TV4 viết script):

1. Deploy BUD với fundingWallet, deploy Treasury với BUD và admin bootstrap.
2. Deploy Timelock/Governor theo SC04/SC05, xác nhận đúng địa chỉ Timelock có code.
3. Admin gọi grantRole(SPENDER_ROLE, timelock), grantRole(DEFAULT_ADMIN_ROLE, timelock).
4. Thu hồi mọi SPENDER_ROLE/admin tạm khác, kể cả spender của deployer nếu từng cấp.
5. Admin gọi renounceRole(DEFAULT_ADMIN_ROLE, initialAdmin) sau cùng.
6. Kiểm tra chỉ Timelock giữ spender/admin; deployer không còn hai role, zero address không có spender.
7. FundingWallet transfer 10.000 BUD vào Treasury, còn 10.000 BUD để nạp thêm.

AccessControl không mở quyền cho mọi người khi zero address có role; thiết kế vẫn không cấp role cho zero.
Không có khả năng quản lý role ngoài cơ chế AccessControl chuẩn. Trước khi admin bỏ quyền,
admin còn có thể tự cấp spender; phải hoàn tất bàn giao trước khi công bố môi trường sẵn sàng.
RoleGranted/RoleRevoked và script check-roles của TV4 dùng kiểm tra danh sách quyền;
AccessControl cơ bản không có getRoleMember để liệt kê trên chain.
Unit test dùng địa chỉ giả timelock và vm.prank, không deploy Timelock thật trong SC03.

## Thành phần Solidity

- Kế thừa ITreasury để giữ chữ ký disburse/event, AccessControl để quản lý quyền chuẩn.
- SPENDER_ROLE = keccak256("SPENDER_ROLE"); onlyRole là modifier kiểm tra người gọi trước thân hàm.
- budgetToken là IERC20 immutable; getter trả địa chỉ. Số dư đọc budgetToken.balanceOf(treasury).
- paidRequests là mapping bytes32 → bool; mặc định false, getter public cho consumer.
- disburse là external, nonpayable, không nhận native ETH; không có deposit riêng.
- Custom errors: InvalidBudgetToken(address), InvalidAdmin(address), InvalidRecipient(address),
  InvalidAmount(uint256), RequestAlreadyPaid(bytes32), InsufficientBudget(uint256,uint256).
  Đây là lỗi của implementation, không thay đổi ABI interface SC01; ABI đầy đủ sinh từ compiler.

## Trình tự giải ngân

Kiểm tra role → recipient khác zero/Treasury → amount dương → requestId chưa chi → đủ BUD.
Sau đó đánh dấu paidRequests trước external call tới token.safeTransfer, cuối cùng phát BudgetDisbursed.
SafeERC20 xử lý token trả false và lan truyền revert; hỗ trợ ERC-20 không trả giá trị.
BUD của dự án là token không phí; SafeERC20 không tự kiểm chứng token độc hại hoặc phí chuyển.
Checks-Effects-Interactions chặn thanh toán lại cùng requestId khi đang gọi token bên ngoài.
Không thêm token tùy ý hay hook vào BudgetToken.

Revert hoàn tác trạng thái của cả giao dịch, kể cả paidRequests và các thay đổi token.
Thiếu tiền không giữ chỗ hoặc tiêu thụ requestId; transfer BUD thêm rồi thử lại cùng ID được.
ID đã thành công không được dùng lại dù recipient/amount khác. bytes32(0) được dùng như ID bình thường.
Không kiểm tra proposal hoặc delay trong Treasury: Governor/Timelock kiểm tra ở SC04/SC05.

## Dữ liệu tích hợp

BudgetDisbursed(bytes32 indexed requestId,address indexed recipient,uint256 amount) giữ nguyên SC01.
TV2 dùng BUD Transfer để tính dòng tiền; BudgetDisbursed chỉ liên kết requestId, không cộng chi hai lần.
Getter: budgetToken(), paidRequests(bytes32), SPENDER_ROLE(), DEFAULT_ADMIN_ROLE(), hasRole(bytes32,address).
Amount là số nguyên đơn vị 10^18; qua API dùng chuỗi. Treasury không phát event nạp riêng.
`shared/abi/Treasury.json` được trích từ artifact compiler; ITreasury.json giữ nguyên.

## Kiểm thử và giới hạn nghiệm thu

Test constructor, quyền/admin, dữ liệu không hợp lệ, event và số dư, chi trùng, ID zero,
thiếu quỹ/retry, hai request tranh số dư, transfer trả false/revert, cấp/thu hồi role,
bàn giao admin rồi deployer thử lấy lại quyền/chi tiền, native value và fuzz bảo toàn BUD.
Token transfer lỗi được mô phỏng trên địa chỉ BUD bằng vm.mockCall/vm.mockCallRevert,
không sửa BudgetToken. Unit test chứng minh rollback paidRequests sau external call lỗi.
INV01/INV03 có kiểm tra unit/fuzz; chưa phải stateful invariant campaign của TV4.
BR04 giới hạn target/selector tại Governor và FR08 timelock delay chưa xác minh trong SC03.
SC04/SC05 kiểm thử trạng thái proposal và retry execute toàn luồng; TV4 deploy/check-roles thật.

```bash
forge fmt
forge build
forge test --match-path 'tests/unit/Treasury.t.sol' -vv
forge test -vv
python3 scripts/check_sc01.py
forge fmt --check
git diff --check
```

## Kết quả trước bổ sung security review

- Nhánh feature/tv1-sc03 tạo từ feature/tv1-sc02; không commit/push/PR.
- forge fmt (hai file SC03), forge build: đạt. Build có cảnh báo keyword tương lai trong OpenZeppelin, giữ nguyên thư viện.
- Test Treasury: 23 passed, 0 failed; fuzz bảo toàn ngân sách chạy 256 trường hợp.
- forge test -vv: 48 passed, 0 failed, gồm toàn bộ SC01/SC02.
- python3 scripts/check_sc01.py: ABI/fixture SC01 khớp.
- forge fmt --check và git diff --check: đạt.
- ABI Treasury lấy trực tiếp artifact compiler; đối chiếu disburse/BudgetDisbursed khớp interface SC01.

SC03 đạt tiêu chí unit test giải ngân, chống chi trùng và rollback/retry.
Còn review và deployment/check-roles thật của TV4, tích hợp Governor/Timelock ở SC04/SC05.

## Bổ sung sau security review

Bootstrap là giai đoạn tin cậy: initialAdmin có thể tự cấp spender hoặc thêm admin khác.
Renounce admin không tự xóa spender; nếu sót spender, deployer vẫn chi trực tiếp được.
TV4 phải kiểm tra địa chỉ BudgetToken đúng deployment SC02 bằng manifest/source và chainId,
không chỉ code.length, name hoặc symbol. Token giả có thể báo chuyển thành công mà không chuyển BUD.

Điều kiện bàn giao cuối cùng:

- Timelock đúng contract triển khai giữ DEFAULT_ADMIN_ROLE và SPENDER_ROLE.
- Tất cả deployer, initialAdmin và tài khoản bootstrap khác mất cả hai role.
- Không có role spender/admin cấp nhầm cho EOA, zero address hoặc token contract.
- Đối chiếu toàn bộ RoleGranted/RoleRevoked từ deployment block để phát hiện tài khoản bị sót;
  hasRole của một vài địa chỉ không chứng minh được tính duy nhất.
- Kiểm tra Governor/Timelock role và delay trong SC05; chỉ nạp ngân sách vận hành sau khi kiểm tra quyền.

Mock CallbackBudgetToken chỉ tồn tại trong file test, không thay đổi BUD/Treasury thật.
Mock chuyển token thực sự rồi gọi lại Treasury, hoặc trả false/revert sau khi đã đổi số dư.
Test callback không có spender kiểm tra AccessControl; test callback được cấp spender có chủ đích
kiểm tra cùng requestId bị chặn ngay cả khi thay recipient/amount. Cấu hình cấp spender cho token
chỉ dùng để kiểm thử đối kháng, không được dùng khi deploy.
Test rollback kiểm tra cả số dư và biến đếm transfers của mock, cùng paidRequests Treasury.
Thêm test spender không có admin, renounce spender và năm vòng nạp/chi với năm requestId.

Không thêm ReentrancyGuard: BUD SC02 không callback; quyền và dấu paidRequests đã chặn trường hợp
được kiểm thử. Không khẳng định Treasury chặn mọi callback khác requestId nếu chủ callback được
cấp spender; token độc hại/cấu hình sai role nằm ngoài giả định deployment đúng.
Trước SC05 chưa xác minh Timelock thật, delay, Governor target/selector, trạng thái proposal,
retry execute toàn luồng hoặc danh sách role deployment thật. Chuỗi năm vòng là unit test,
không thay thế stateful invariant campaign do TV4 phụ trách.

## Kết quả sau bổ sung security review

- Chỉ cập nhật tests/unit/Treasury.t.sol và tài liệu này trong đợt bổ sung.
- forge fmt và forge build: thành công.
- forge test -vv: 55 passed, 0 failed; Treasury có 30 test, tăng 7 test so với trước.
- Fuzz Treasury chạy 256 trường hợp, đạt.
- forge fmt --check, python3 scripts/check_sc01.py và git diff --check: đạt.
- Kiểm tra whitespace riêng cho file chưa theo dõi cũng đạt.
- ABI compiler Treasury vẫn khớp shared/abi/Treasury.json và giữ đủ interface SC01.
- Treasury.sol, ITreasury.sol, BudgetToken và GovernanceToken không thay đổi trong đợt bổ sung.
- Không thêm ReentrancyGuard; không commit, push hoặc tạo PR.
