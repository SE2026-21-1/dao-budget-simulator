# SC04 — BudgetGovernor và giới hạn proposal

Căn cứ: FR03, FR05, FR06, FR10; BR01–BR04/BR06; TC02–TC05/TC08.
Nhánh feature/tv1-sc04 tạo từ origin/Dev tại 1f40748 sau khi SC02/SC03 đã merge.
Không thay token, Treasury, ITreasury, dependency hoặc triển khai script TV4.

## Constructor và kế thừa OpenZeppelin 5.4.0

`new BudgetGovernor(address(gov), address(treasury), address(timelock))`.
Ba địa chỉ phải là contract đã deploy. GOV phải trả CLOCK_MODE = mode=timestamp,
clock = block.timestamp. Hàm private _validatedGov chạy khi truyền tham số vào GovernorVotes,
trước module quorum dùng token clock; tránh lỗi mơ hồ khi cấu hình GOV là zero/EOA.
Kiểm tra code/clock không xác minh danh tính contract: TV4 đối chiếu manifest/source đúng SC02/SC03
và TimelockController chuẩn. Treasury lưu immutable; production không dùng địa chỉ fixture SC01.

| Module | Trách nhiệm |
|---|---|
| Governor | Proposal ID, vòng đời, vote entrypoints, proposer và event |
| GovernorSettings | delay 60, period 300, threshold 50 × 10^18 |
| GovernorCountingSimple | Against=0, For=1, Abstain=2; mỗi ví một phiếu |
| GovernorVotes | Đọc getPastVotes từ GOV; dùng clock/CLOCK_MODE của token |
| GovernorVotesQuorumFraction | Quorum 20% getPastTotalSupply(snapshot) |
| GovernorTimelockControl | Queue/execute bằng Timelock, state và cancel tích hợp |

Các override votingDelay, votingPeriod, proposalThreshold, quorum, state,
proposalNeedsQueuing, _queueOperations, _executeOperations, _cancel, _executor
chỉ giải quyết kế thừa và gọi super. Không viết lại logic bỏ phiếu/timelock.
Không cần mapping creator riêng: Governor đã lưu và có proposalProposer.

## Voting power và thời gian

GOV balance không tự là voting power. A có 400 GOV, delegate(A) để có 400 phiếu;
delegate(B) chuyển quyền biểu quyết cho B nhưng token ở A. Delegation phải thành checkpoint quá khứ.
Threshold được Governor kiểm tra bằng getVotes(proposer, clock()-1); đủ 50 GOV được tạo proposal.
Không lấy balanceOf hiện tại để tính threshold hoặc trọng số.

Snapshot = thời điểm tạo + 60; deadline = snapshot + 300. Clock dùng giây:

| Thời điểm t | Trạng thái/cửa sổ |
|---|---|
| t < snapshot | Pending |
| t = snapshot | Vẫn Pending; creator còn được cancel |
| snapshot < t <= deadline | Active, được vote |
| t > deadline | Xét Succeeded/Defeated theo phiếu |

Trọng số phiếu tại snapshot không đổi khi chuyển token/đổi delegate về sau.
Ví không có voting power có thể ghi phiếu trọng số 0; không tăng kết quả và vẫn bị chặn vote lại.
Các entrypoint castVoteWithReason/WithParams/BySig của OZ cùng đi qua cơ chế đếm và hasVoted.
Không hỗ trợ đổi phiếu.

Quorum = 20% tổng cung tại snapshot, demo 200 GOV. For + Abstain >= quorum và For > Against mới thắng.
100 For thất bại; 100 For + 100 Abstain thắng; 200 For = 200 Against thua;
100 For/200 Against/100 Abstain thua; 400 For/300 Against thắng. Abstain đơn thuần không thắng.
Succeeded không chuyển tiền, không giữ chỗ quỹ. Hai proposal có thể dùng cùng requestId;
Treasury chỉ trả thành công một lần. Số dư đủ hay chưa chỉ kiểm tra tại execute.

## Giới hạn proposal ở contract

Override _propose, là hook duy nhất tạo proposal trong tổ hợp module hiện tại.
Public propose chuẩn vẫn kiểm tra threshold rồi gọi hook này. Không thêm proposal entrypoint khác.
Người gọi cast/ethers/viem trực tiếp không bỏ qua hook, nên không bypass được giới hạn bằng cách bỏ UI.

Chỉ chấp nhận targets/values/calldatas đều đúng 1 phần tử, target Treasury đã cấu hình, value 0.
Calldata phải đúng 100 byte = 4 selector + 3 word ABI (32 byte mỗi word).
Selector phải là ITreasury.disburse.selector. Copy 96 byte arguments rồi abi.decode
(bytes32,address,uint256); decoder từ chối address padding không canonical. Không chấp nhận thiếu/thừa byte.
Recipient phải khác zero/Treasury, amount > 0. requestId=bytes32(0) vẫn hợp lệ.
Không gọi grantRole/revokeRole, token transfer, Governor settings, relay hoặc Timelock bằng proposal.
Không kiểm tra paidRequests hoặc balance tại lúc tạo, đúng quy tắc không giữ chỗ ngân sách.

## Description, hash, event và ID

TV3 tạo JSON v1 gồm version/title/body theo fixture SC01; title 5–120, body 20–2.000 ký tự.
Các giới hạn nội dung/JSON được kiểm tra tại ứng dụng, KHÔNG parse/kiểm tra trong Governor.
Contract giữ nguyên description bytes; đây là lựa chọn phân lớp, không phải chứng minh FR03 UI đã nghiệm thu.
Các quy ước Unicode/CSPRNG requestId vẫn cần nhóm review theo docs/contracts.md.

`descriptionHash = keccak256(bytes(description))`.
`proposalId = uint256(keccak256(abi.encode(targets,values,calldatas,descriptionHash)))`.
Không hash file fixture, không parse rồi stringify lại. Giữ chuỗi nguyên bản cho queue/execute/cancel.
Test vector SC01 có proposalId:
41188251149770464419086128880638239388642337502157923625475508004855043094545.

Event ProposalCreated giữ targets/values/calldatas, description nguyên bản, snapshot/deadline và proposer.
Còn có VoteCast/VoteCastWithParams, ProposalCanceled, ProposalQueued, ProposalExecuted và event cấu hình OZ.
Với OZ 5.4.0, operationId dùng hashOperationBatch, predecessor=0,
salt = bytes32(bytes20(address(governor))) XOR descriptionHash (address được padding phải khi chuyển từ bytes20).
Không dùng salt=descriptionHash. Transfer/BudgetDisbursed xảy ra trong execution trước ProposalExecuted.
Ready là tình trạng Timelock operation, không phải proposal state mới; execute revert không tạo Failed.

## Cách dùng và hàm đọc bàn giao TV2/TV3

1. Delegate GOV rồi chờ checkpoint thuộc quá khứ.
2. Sinh requestId, encode disburse, tạo arrays một phần tử và giữ description.
3. Gọi propose; lấy proposalId/snapshot/deadline từ ProposalCreated/contract.
4. Khi Active gọi castVote(id, support), hoặc entrypoint vote chuẩn OZ.
5. Creator gọi cancel(targets,values,calldatas,descriptionHash) khi Pending nếu cần.
6. Khi Succeeded gọi queue; sau ETA gọi execute qua Governor, với production roles đúng SC05.

Hàm đọc: token, treasury, timelock, clock, CLOCK_MODE, COUNTING_MODE,
proposalThreshold, votingDelay, votingPeriod, quorum(snapshot), proposalSnapshot,
proposalDeadline, proposalProposer, proposalVotes, hasVoted, state, proposalEta,
proposalNeedsQueuing, hashProposal. Đọc quorum lịch sử chỉ khi snapshot đã thuộc quá khứ.
ABI đầy đủ sinh từ compiler trong shared/abi/BudgetGovernor.json; không sửa bằng tay.
TV2 lưu uint256/amount dưới dạng chuỗi, không tính đôi Transfer/BudgetDisbursed.
TV3 dùng ABI này để encode và decode custom errors; không dùng ID 101–145 như ID chain.

Lỗi riêng: InvalidContract(address), InvalidTokenClock(),
InvalidActionCount(uint256 targets,uint256 values,uint256 calldatas), InvalidTarget(address),
InvalidNativeValue(uint256), InvalidCalldata(), InvalidRecipient(address), InvalidAmount(uint256).
Address padding sai bị strict ABI decoder revert (không bảo đảm có custom error).
Lỗi threshold, state, duplicate vote, cancel và chữ ký giữ nguyên OpenZeppelin.

## Cancel và giới hạn cấu hình

Public cancel của OZ dùng _validateCancel: caller=proposalProposer và state=Pending.
_cancel của GovernorTimelockControl là internal, không phải đường bypass public.
Test kiểm tra người khác, Active/Succeeded/Defeated/Queued/Executed và Canceled không thể thao tác tiếp.
Không có emergency cancel hoặc quyền owner trong Governor.

Các setter settings/quorum/updateTimelock/relay kế thừa vẫn xuất hiện trong ABI,
được bảo vệ onlyGovernance. Không thể proposal gọi chúng vì whitelist target/selector.
MVP không đổi cấu hình; muốn đổi deploy lại. Timelock có proposer ngoài Governor vẫn có thể phá
mô hình tin cậy: SC05/TV4 phải loại bỏ mọi proposer/executor/canceller trái thiết kế và admin tạm.

## Test, nghiệm thu và phần còn chờ SC05

Bộ test dùng TimelockController thật làm fixture để kiểm tra module composition và cancel Queued/Executed,
không phải deployment production. Fixture cố ý còn admin bootstrap để dựng môi trường test.
Chưa có script deploy/check-roles production, audit danh sách role, manifest/testnet hoặc invariant campaign.
SC05 phải xác minh delay 120 giây, production roles, bỏ quyền deployer, execute sớm/lặp/thiếu tiền retry
và các đường gọi trực tiếp Timelock. Không sửa Treasury trong SC04.

```bash
forge fmt
forge build
forge test --match-path 'tests/unit/BudgetGovernor.t.sol' -vv
forge test -vv
python3 scripts/check.py
forge fmt --check
```

Nhánh TV4 dùng checker chuẩn `scripts/check.py`. Các kết quả nguồn bên dưới giữ
tên `scripts/check_sc01.py` để phân biệt bằng chứng lịch sử tại nhánh TV1.

## Ánh xạ nghiệm thu SC04

| Nhóm yêu cầu | Bằng chứng unit test |
|---|---|
| Constructor/config, FR02/BR01 | metadata/address/clock/quorum config; zero/EOA fuzz; block-number clock bị chặn |
| Threshold FR03 | 49 GOV bị chặn, đúng 50 được tạo; chưa delegate/cùng timestamp bị chặn |
| BR03/BR04, TC08 | trực tiếp propose: sai target/selector/value, role/token/settings/Timelock, array sai/multiple bị chặn |
| ABI canonical | thiếu/thừa byte, dirty address, zero recipient/Treasury, zero amount bị chặn; zero request hợp lệ |
| ID/event tích hợp | công thức hash, vector SC01, description bytes và ProposalCreated nguyên bản |
| FR05/TC04 | vote một lần qua castVote/WithReason, support sai, trọng số 0, biên snapshot/deadline |
| FR06/TC02/TC03 | thiếu quorum, For+Abstain, hòa/thua/thắng, abstain-only; chỉ xét sau deadline |
| TC05 | transfer/đổi delegate/delegate mới sau snapshot không sửa trọng số proposal |
| FR10/BR06 | chỉ creator Pending (kể cả tại snapshot); chặn Active/Defeated/Succeeded/Queued/Executed |
| Canceled | không vote/queue/execute được; Treasury chưa chi |
| Timelock composition | fixture queue/execute thành công, execute chưa queue bị chặn; chưa là SC05 production acceptance |
| Không giữ chỗ | proposal vượt số dư và cùng requestId vẫn tạo được; không chuyển BUD khi Succeeded |

## Kết quả trước bổ sung security tests — 21/10/2026

- forge fmt hai file SC04 và forge fmt --check: đạt.
- forge build: thành công, runtime Governor 18.279 byte (< giới hạn 24.576 byte).
- forge test --match-path tests/unit/BudgetGovernor.t.sol -vv: 54 passed, 0 failed.
- Ba fuzz test SC04 chạy 256 trường hợp mỗi test.
- forge test -vv toàn bộ SC01–SC04: 109 passed, 0 failed, 0 skipped (5 suites).
- python3 scripts/check_sc01.py và git diff --check: đạt.
- ABI BudgetGovernor trích artifact compiler, không chỉnh sửa thủ công.
- Compiler cảnh báo keyword tương lai trong OpenZeppelin; không sửa dependency.
- Lint cảnh báo block.timestamp và bytes4(payload): có chủ đích để xác nhận clock timestamp và
  lấy selector 4 byte sau kiểm tra payload.length=100; không dùng timestamp làm nguồn randomness.
- Không có commit/push/PR, không sửa source/test/ABI SC01–SC03 hoặc code TV2/TV3/TV4.

SC04 đạt điều kiện tạo proposal, voting/quorum, whitelist và cancel trong unit fixture.
FR03 giới hạn title/body cần frontend thực thi; chưa có E2E/receipt thật hoặc production roles SC05.

## Bổ sung security review L-01/L-02/L-03

Thêm 28 test vào BudgetGovernor.t.sol, không đổi contract/ABI/description hoặc file SC01–SC03.

| Nhóm | Test mới và kết quả cần chứng minh |
|---|---|
| Tampering | Ba test queue và ba test execute, mỗi test đổi riêng recipient/amount/descriptionHash; ID mới không tồn tại; proposal gốc, operation, số dư và paidRequests không đổi |
| ID/replay | Queue/execute ID không tồn tại; execute lần hai bị chặn; hai proposal khác ID nhưng cùng requestId chỉ trả tiền một lần |
| Thiếu BUD | Execute 11.000 trong quỹ 10.000 revert; proposal vẫn Queued, operation vẫn Ready, ETA không đổi; nạp 1.000 rồi retry cùng operation thành công |
| ABI canonical | Sáu test cắt calldata hợp lệ về 4/35/36/67/68/99 byte với selector đúng; fuzz dirty address padding và trailing bytes từ calldata hợp lệ |
| onlyGovernance | Sáu hàm relay/updateTimelock/setVotingDelay/setVotingPeriod/setProposalThreshold/updateQuorumNumerator bị chặn khi gọi từ ví thường và khi chỉ giả danh executor |
| Vote | castVoteWithReasonAndParams không cho params quyết định weight; chữ ký EIP-712 thường/mở rộng lấy snapshot, chặn đổi support/params, chặn replay và bảo toàn nonce khi revert |
| Voting window | Phiếu ký trước Active/sau deadline bị chặn; nonce không tiêu thụ, chữ ký có thể retry khi Active |
| Copy proposal | Hai ví đủ threshold tính cùng ID; chỉ submit đầu tiên thành công; submit sau không chiếm creator/cancel; creator đầu tiên hủy Pending được |

Test gọi giả danh Timelock kiểm tra lớp thứ hai của onlyGovernance: không có calldata được
Governor cho phép thì deque rỗng và revert Panic(0x31). Đây là hành vi OpenZeppelin 5.4.0,
không phải crash ngoài dự kiến hay bằng chứng Timelock có quyền gọi setter tùy ý.
Các setter/relay không có đường thành công hợp lệ trong whitelist MVP, nên không tạo proposal
đổi settings để giả một kịch bản thành công không được hỗ trợ. Không cần sửa contract.

Chữ ký trong test dùng khóa tổng hợp cục bộ, không phải tài khoản deploy. Nonce sau phiếu thành công
là 1; replay bị GovernorInvalidSignature và nonce không tăng tiếp. Sai params/support hoặc sai
cửa sổ voting rollback nonce/hasVoted. Không khẳng định đã kiểm tra mọi loại ERC-1271 wallet.

### Giới hạn sao chép/frontrunning

Test bảo vệ quyền của người submit được xác nhận đầu tiên, không chứng minh giao dịch mempool
không thể bị gửi trước. proposalId không bao gồm proposer; ví khác đủ threshold có thể sao chép
payload/description và giành thứ tự xác nhận. Ai tạo đầu tiên mới là creator on-chain và có quyền
hủy Pending. Khi đã tồn tại, người gửi sau không thể ghi đè creator hoặc cancel trái quyền.
Không thêm suffix #proposer hoặc thay JSON v1; đây là giới hạn được ghi nhận cho nhóm review,
không thay đổi yêu cầu tích hợp SC01/TV2/TV3. Không cho phép tự chuyển recipient/amount dưới cùng ID.

### Phần vẫn thuộc SC05/TV4

Các test xuyên contract ở đây dùng fixture, chưa phải acceptance cấu hình deployment thật.
TV4 phải xác minh đúng địa chỉ GOV/BUD/Treasury/Timelock, quyền duy nhất sau bootstrap,
thu hồi admin/spender tạm, minDelay 120, chặn gọi thẳng Timelock và cung cấp manifest/evidence.
Chưa có deploy/check-roles script, testnet, full stateful invariant hoặc audit wallet ERC-1271.

### Kết quả sau bổ sung security tests

- Thêm 28 test: Governor tăng từ 54 lên 82; hai fuzz test mới chạy 256 trường hợp mỗi test.
- forge fmt, forge build: thành công; chỉ còn các cảnh báo đã ghi nhận của dependency/lint contract cũ.
- forge test --match-path tests/unit/BudgetGovernor.t.sol -vv: 82 passed, 0 failed.
- forge test -vv: toàn bộ SC01–SC04 có 137 passed, 0 failed, 0 skipped, 5 suites.
- forge fmt --check, python3 scripts/check_sc01.py và git diff --check: đạt.
- Đối chiếu SHA-256 xác nhận BudgetGovernor.sol và ABI chia sẻ không thay đổi trong đợt này.
- ABI vẫn bằng artifact compiler; source/test SC01–SC03 không thay đổi.
- Không phát hiện lỗi Governor cần sửa khi chạy các tình huống bổ sung.
- SC04 sẵn sàng commit và PR để peer review, chưa nghiệm thu production SC05.
- Không thực hiện commit/push/PR.
