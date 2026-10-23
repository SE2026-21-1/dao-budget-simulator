# DAO Budget Simulator — chuẩn contract SC01

Căn cứ: hai tài liệu yêu cầu phiên bản 1.0 ngày 11/10/2026 trong `docs/requirements/`.
SC01 cung cấp nền tảng build và giao tiếp dự kiến; không chứng minh SC02–SC10 đã hoàn thành.
Các chữ ký ngoài ITreasury và tên lỗi dưới đây là kế hoạch, chưa phải ABI triển khai.

## Toolchain

| Thành phần | Cấu hình hiện tại |
|---|---|
| Foundry | 1.8.5 |
| Solidity | 0.8.37 |
| OpenZeppelin Contracts | 5.4.0, revision trong foundry.lock/submodule |
| forge-std | 1.17.0, revision trong foundry.lock/submodule |
| Optimizer | bật, 200 runs |
| EVM | osaka, giữ cấu hình local hiện tại; TV4 xác nhận mạng testnet trước deploy |

Solidity pragma `^0.8.20` của interface tương thích compiler đã khóa.
Governor OpenZeppelin 5.4.0 cần compiler tối thiểu 0.8.24.
Cách dựng môi trường và kiểm tra nằm trong README. Chốt phiên bản với TV4 khi review SC01.

## Kiến trúc và cấu hình demo

GOV: ERC20Votes, nguồn cung cố định 1.000, A/B/C/D = 400/300/200/100.
BUD: ERC-20 không phí, mint một lần 20.000; Treasury nhận 10.000, ví nạp quỹ 10.000.
Hai token có 18 decimals; lượng on-chain = lượng token × 10^18.
TV1 bàn giao constructor và trình tự phân bổ cho TV4; không thêm public mint.

Threshold: 50 GOV voting power đã delegate tại checkpoint quá khứ theo Governor.
Quorum: 20% tổng cung tại snapshot. For + Abstain tính quorum; For phải lớn hơn Against.
Voting delay 60 giây, voting period 300 giây, Timelock delay 120 giây từ queue.
GOV override clock/CLOCK_MODE để dùng timestamp; Governor dùng cùng clock.
Người dùng gọi delegate(self); chuyển token/delegate sau snapshot không sửa trọng số đã chốt.

Luồng: ví → Governor → TimelockController → Treasury → BUD.transfer.
Pending → Active → Succeeded → Queued → Executed; nhánh Defeated hoặc Canceled.
Ready là tình trạng operation Queued, không phải proposal state mới.
Execute revert không tạo state Failed. Kiểm tra biên snapshot/deadline/ETA theo contract.
MVP không hỗ trợ proposal đổi role/tham số; muốn đổi cấu hình phải deploy lại.

## Bảng hàm dự kiến

| Contract | Hàm/giao tiếp | Consumer |
|---|---|---|
| GOV | balanceOf, totalSupply, decimals, delegates, delegate, getVotes, getPastVotes, getPastTotalSupply, clock, CLOCK_MODE | TV3, TV2, test |
| BUD | balanceOf, totalSupply, decimals, transfer, approve, allowance, transferFrom | TV2/TV3/TV4 |
| Treasury | disburse(bytes32 requestId,address recipient,uint256 amount) | Timelock |
| Treasury | budgetToken() → address; paidRequests(bytes32) → bool; hasRole(bytes32,address) → bool | dự kiến cho consumer/role test |
| Governor | propose, castVote, cancel, queue, execute, hashProposal, state, proposalSnapshot, proposalDeadline, proposalVotes, quorum, proposalEta, proposalProposer, hasVoted | TV2/TV3 |
| Timelock | getMinDelay, getTimestamp, hashOperationBatch, isOperationReady, isOperationDone, hasRole | TV2/TV4 |

Governor chỉ chấp nhận đúng một target Treasury, một value = 0 và một calldata disburse.
Kiểm tra selector, giải mã calldata, recipient khác zero/Treasury, amount > 0 ngay on-chain.
Không chỉ kiểm tra ở helper hoặc dashboard; gọi propose chuẩn cũng phải bị kiểm soát.
Treasury kiểm tra lại dữ liệu, quyền và requestId; chỉ giữ địa chỉ BUD đã cấu hình.
Nạp quỹ bằng BUD.transfer vào Treasury, không cần hàm deposit riêng.
Không giữ chỗ ngân sách khi propose. Thiếu tiền tại execute revert toàn bộ, không tiêu thụ
requestId, không đánh dấu Executed; nạp thêm rồi thử lại được.

## Event và error dự kiến

ITreasury hiện có:

```solidity
function disburse(bytes32 requestId, address recipient, uint256 amount) external;
event BudgetDisbursed(bytes32 indexed requestId, address indexed recipient, uint256 amount);
```

ABI: nonpayable, không có return; event không anonymous, amount không indexed.
BudgetDisbursed chỉ phát khi thanh toán thành công. BUD Transfer là nguồn tính dòng tiền;
event Treasury liên kết requestId, không cộng cả hai thành hai lần chi.
Governor dùng ProposalCreated, VoteCast, ProposalQueued, ProposalExecuted, ProposalCanceled.
Timelock dùng CallScheduled, CallExecuted, Cancelled và CallSalt khi áp dụng.
GOV dùng DelegateChanged, DelegateVotesChanged; token dùng Transfer/Approval.
ABI sinh từ build là nguồn chính xác cho tên, kiểu, indexed và lỗi OpenZeppelin.

Tên lỗi riêng sau đây là đề xuất cần TV2/TV3/TV4 review trước triển khai:

| Phần | Lỗi đề xuất |
|---|---|
| Treasury | InvalidRecipient(address recipient), InvalidAmount(uint256 amount) |
| Treasury | RequestAlreadyPaid(bytes32 requestId), InsufficientBudget(uint256 available,uint256 required) |
| Governor | InvalidActionCount(uint256 count), InvalidTarget(address target), InvalidNativeValue(uint256 value), InvalidCalldata() |

Ưu tiên lỗi sẵn có của OpenZeppelin cho AccessControl, ERC20 và Governor;
không tự viết lại kiểm tra quyền/voting tiêu chuẩn. Không đưa lỗi dự kiến vào ABI interface hiện tại.

## Role sau khởi tạo

| Role | Chủ thể duy nhất |
|---|---|
| Treasury SPENDER_ROLE | TimelockController |
| Treasury DEFAULT_ADMIN_ROLE | TimelockController |
| Timelock PROPOSER_ROLE | BudgetGovernor |
| Timelock EXECUTOR_ROLE | BudgetGovernor, không mở cho zero address |
| Timelock CANCELLER_ROLE | BudgetGovernor |
| Timelock DEFAULT_ADMIN_ROLE | chính TimelockController |

TV4 viết deploy/check-roles. Trình tự dự kiến: deploy token/Treasury/Timelock theo constructor
đã thống nhất → deploy Governor với các địa chỉ → cấp role cuối cùng → cấp BUD demo →
deployer renounce mọi admin tạm → kiểm tra role/số dư trước bàn giao.
Thứ tự chi tiết token/Treasury phải tránh phụ thuộc constructor vòng; chốt khi SC02–SC05.
Mọi ví có thể queue/execute qua Governor khi hợp lệ; ví thường không schedule/execute trực tiếp Timelock.
Không có đường chi riêng của deployer hoặc hủy khẩn cấp sau Pending; chỉ creator hủy Pending.

## Description v1 và requestId — đề xuất chờ nhóm review

Description là chuỗi JSON UTF-8: `{"version":1,"title":"...","body":"..."}`.
Title 5–120 ký tự, body 20–2.000 ký tự theo FR03; UI kiểm tra và escape bằng JSON serializer.
Đề xuất đếm Unicode code point cho độ dài; nhóm cần thống nhất với TV3.
Giữ nguyên chính xác chuỗi đã gửi trong ProposalCreated, kể cả khoảng trắng/thứ tự key.
Không parse rồi stringify lại khi queue/execute. descriptionHash = keccak256(bytes(description)).
Các giới hạn nội dung không thay thế kiểm tra khoản chi on-chain BR03–BR04.

Đề xuất requestId: sinh 32 byte ngẫu nhiên bằng CSPRNG trước propose, lưu cùng form để retry.
Không dùng timestamp hoặc JavaScript Number làm requestId. Đây chưa phải thuật toán đã được nhóm duyệt.
Requirement không cấm bytes32(0); SC01 không tự thêm lệnh cấm. Hai proposal có thể cùng requestId,
nhưng Treasury chỉ thanh toán thành công một lần. requestId khác proposalId và operationId.

proposalId = uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash))).
operationId do Timelock hashOperationBatch với predecessor/salt do Governor tích hợp sử dụng;
không tự giả định salt = descriptionHash. Đối chiếu module OZ 5.4.0 và receipt thật tại SC06.

## Fixture và bàn giao

`fixtures/sc01/disbursement-v1.json` là dữ liệu tổng hợp, địa chỉ giả, chainId local 31337;
requestId cố định chỉ dùng fixture, không minh họa randomness cho production.
Có amount 1.000 BUD ở đơn vị nhỏ nhất, targets/values/calldatas, description nguyên bản,
descriptionHash và proposalId đã tính. Mọi uint256 dùng chuỗi số nguyên, không dùng JS Number.
Không có transactionHash/receipt/operationId giả; log chain thật thuộc `fixtures/chain/` tại SC06.
Chạy `forge build` rồi `python3 scripts/check.py` để đối chiếu ABI và các giá trị encode/hash.
Script chỉ kiểm tra dữ liệu, không deploy hoặc ký giao dịch, không thay công việc script của TV4.

TV2 review event, format description, cách nối ID và fixture; TV3 review encode/decode,
hàm đọc, lỗi và decimals; TV4 review toolchain, constructor/role và trình tự deploy.
Đối chiếu indexer tại cùng block H, API có asOfBlock. Không commit secret/private key.

## Checklist SC01

- [x] Có cấu hình nguồn/test/compiler, dependency khóa revision và hướng dẫn build.
- [x] Có interface Treasury, ABI nháp, bảng hàm/event/error/role và fixture tổng hợp.
- [ ] TV4 xác nhận toolchain/EVM; TV2/TV3 xác nhận description v1, requestId, hàm đọc và lỗi đề xuất.
- [ ] Nhóm review PR và xác nhận fixture đủ cho các consumer.
- [ ] Bằng chứng từ clone sạch được ghi trong PR/CI khi bàn giao.

SC01 sẵn sàng review sau kiểm tra local; chỉ đóng task khi các mục review/tái lập đã được xác nhận.
SC02–SC10 chưa được triển khai ở đây.
