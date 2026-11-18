# DAO Budget Simulator — tài liệu contract SC06/SC09

Căn cứ: hai tài liệu yêu cầu phiên bản 1.0 ngày 11/10/2026 trong `docs/requirements/`.
Source kiểm chứng ngày 11/11/2026: `d8f8743179d7748d0e05499646b5d9322820c782`.
Tài liệu bàn giao trên base PR #21 `105f2ba4bebc2e6b761027eb01792c521875ec07`, chỉ docs/evidence mới hơn source này;
base Dev `87738d3f792c3a283a52b5c18c306809d6cfcfd4`. Production contracts/ABI không đổi
so với peer revision `ff484fb`; source fixture hiện hành là `9ad0aea` trong chain.json.
SC06 đã có receipt/log thật local và peer TV1/TV2; frontend consumer, testnet và release
vẫn có gate riêng. Tài liệu giai đoạn 1/base `0b43364` là lịch sử, không phải trạng thái hiện tại.
Full function/event/error signatures (gồm inherited và indexed flags) nằm trong
[catalog compiler](sc06-abi-reference.md); quy trình kiểm tra/bàn giao ở [SC06](sc06-handoff.md).

## Toolchain

| Thành phần | Cấu hình hiện tại |
|---|---|
| Foundry | 1.8.5 |
| Solidity | 0.8.37 |
| OpenZeppelin Contracts | 5.4.0, revision trong foundry.lock/submodule |
| forge-std | 1.17.0, revision trong foundry.lock/submodule |
| Optimizer | bật, 200 runs |
| EVM | osaka cho build local; TV4 có probe read-only Sepolia hạn chế, chưa xác minh compiled-contract deployment/gas trên testnet |

Solidity pragma `^0.8.20` của interface tương thích compiler đã khóa.
Governor OpenZeppelin 5.4.0 cần compiler tối thiểu 0.8.24.
Cách dựng môi trường và kiểm tra nằm trong README. Chốt phiên bản với TV4 khi review SC01.

## Kiến trúc và cấu hình demo

GOV: ERC20Votes, nguồn cung cố định 1.000, A/B/C/D = 400/300/200/100.
BUD: ERC-20 không phí, mint một lần 20.000; Treasury nhận 10.000, ví nạp quỹ 10.000.
Hai token có 18 decimals; lượng on-chain = lượng token × 10^18.
TV1 bàn giao constructor và trình tự phân bổ cho TV4; không thêm public mint.

| Contract | Trách nhiệm và liên kết |
|---|---|
| GovernanceToken | GOV ERC20Votes, timestamp checkpoints; Governor.token() trỏ GOV |
| BudgetToken | BUD ERC20 cố định, không phí; Treasury.budgetToken() trỏ BUD |
| Treasury | Giữ BUD, kiểm quyền/số dư/requestId trước chuyển token; không tự vote hoặc queue |
| BudgetGovernor | Kiểm proposal, snapshot/voting/quorum và creator Pending cancel; treasury() và timelock() cố định theo cấu hình |
| TimelockController | OpenZeppelin 5.4.0 nguyên bản, schedule/Ready/execute theo minDelay; gọi Treasury với SPENDER_ROLE |

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

## Hàm public/external dành cho consumer

| Contract | Hàm/giao tiếp | Consumer |
|---|---|---|
| GOV | balanceOf, totalSupply, decimals, delegates, delegate, getVotes, getPastVotes, getPastTotalSupply, clock, CLOCK_MODE | TV3, TV2, test |
| BUD | balanceOf, totalSupply, decimals, transfer, approve, allowance, transferFrom | TV2/TV3/TV4 |
| Treasury | disburse(bytes32 requestId,address recipient,uint256 amount) | Timelock |
| Treasury | budgetToken() → address; paidRequests(bytes32) → bool; hasRole(bytes32,address) → bool | consumer/role test |
| Governor | propose, castVote, cancel, queue, execute, hashProposal, state, proposalSnapshot, proposalDeadline, proposalVotes, quorum, proposalEta, proposalProposer, hasVoted | TV2/TV3 |
| Timelock | getMinDelay, getTimestamp, hashOperationBatch, isOperationReady, isOperationDone, hasRole | TV2/TV4 |

Governor chỉ chấp nhận đúng một target Treasury, một value = 0 và một calldata disburse.
Kiểm tra selector, giải mã calldata, recipient khác zero/Treasury, amount > 0 ngay on-chain.
Không chỉ kiểm tra ở helper hoặc dashboard; gọi propose chuẩn cũng phải bị kiểm soát.
Treasury kiểm tra lại dữ liệu, quyền và requestId; chỉ giữ địa chỉ BUD đã cấu hình.
Nạp quỹ bằng BUD.transfer vào Treasury, không cần hàm deposit riêng.
Không giữ chỗ ngân sách khi propose. Thiếu tiền tại execute revert toàn bộ, không tiêu thụ
requestId, không đánh dấu Executed; nạp thêm rồi thử lại được.

## Event và custom errors từ implementation

ITreasury hiện có:

```solidity
function disburse(bytes32 requestId, address recipient, uint256 amount) external;
event BudgetDisbursed(bytes32 indexed requestId, address indexed recipient, uint256 amount);
```

ABI: nonpayable, không có return; event không anonymous, amount không indexed.
BudgetDisbursed chỉ phát khi thanh toán thành công. BUD Transfer là nguồn tính dòng tiền;
event Treasury liên kết requestId, không cộng cả hai thành hai lần chi.
Governor dùng ProposalCreated, VoteCast, VoteCastWithParams, ProposalQueued, ProposalExecuted, ProposalCanceled.
Timelock dùng CallScheduled, CallExecuted, Cancelled và CallSalt khi áp dụng.
GOV dùng DelegateChanged, DelegateVotesChanged; token dùng Transfer/Approval.
ABI sinh từ build là nguồn chính xác cho tên, kiểu, indexed và lỗi OpenZeppelin.

Catalog [SC06 ABI reference](sc06-abi-reference.md) liệt kê đầy đủ errors của cả token,
Treasury, Governor, Timelock và ITreasury, bao gồm inherited errors cùng kiểu tham số.
Ví dụ lỗi Governor thực tế là `InvalidActionCount(uint256,uint256,uint256)` cho độ dài
của targets/values/calldatas; không dùng chữ ký SC01 cũ một tham số.
TV3 decode revert bằng ABI của contract/đường gọi, không dựa vào chuỗi thông báo RPC.
ABI có hàm quản trị kế thừa không có nghĩa ví được gọi hoặc Governor cho phép đề xuất hàm đó.

## Role sau khởi tạo

| Role | Chủ thể duy nhất |
|---|---|
| Treasury SPENDER_ROLE | TimelockController |
| Treasury DEFAULT_ADMIN_ROLE | TimelockController |
| Timelock PROPOSER_ROLE | BudgetGovernor |
| Timelock EXECUTOR_ROLE | BudgetGovernor, không mở cho zero address |
| Timelock CANCELLER_ROLE | BudgetGovernor |
| Timelock DEFAULT_ADMIN_ROLE | chính TimelockController |

TV1 sở hữu thiết kế quyền, integration tests và tài liệu SC05; TV4 sở hữu deploy/check-roles,
operation preflight và bằng chứng triển khai. Trình tự bàn giao SC05:
deploy GOV/BUD → Treasury → Timelock → Governor → grant role cuối cùng → preflight →
cleanup/revoke role tạm → kiểm lại trước renounce → renounce admin bootstrap cuối cùng →
final audit → funding Treasury. Không nạp BUD trước khi final audit đạt.

Preflight kiểm identity/config/liên kết contract, admin graph, toàn bộ lịch sử role và operation
từ deployment đến cùng block H/hash. Trước cleanup chỉ chấp nhận final holders cộng bootstrap
đã duyệt; trước renounce chỉ còn bootstrap admin cuối cùng ngoài final matrix. Chính sách bootstrap
mới là không có operation từng được schedule, kể cả đã cancel hoặc Done. Revoke proposer không
xóa operation cũ. Gate lỗi phải dừng renounce/funding; sau renounce audit lại trước funding.
Xem trình tự và giới hạn đầy đủ trong [SC05](sc05-timelock-roles.md).

**Deployment local hiện hành:** [governance_local.mjs](../scripts/governance_local.mjs) thực hiện
`preRenounceRoleCheck` → renounce Treasury admin → renounce Timelock admin →
`preFundingRoleCheck` → delegate/checkpoint quá khứ → funding 10.000 BUD → `roleCheck`.
Preflight diễn ra trước khi mất quyền sửa cấu hình; final pre-funding audit phải đạt rồi mới nạp BUD.
Script local không cấp operational role tạm; checker chỉ cho final holders cộng bootstrap admin ở
stage bootstrap, và final matrix ở stage final. Grant/revoke/admin graph được replay từ lịch sử đầy đủ;
[operation audit](../scripts/governance_operations.mjs) đối chiếu receipts và từ chối lịch sử operation
trong bootstrap, kể cả đã Cancelled/Done. Nhận định cũ “renounce trước audit/chưa audit operation”
không còn đúng tại candidate này.

TV1 đã kiểm local audit/roles tại `ff484fb` (15 bootstrap tests); TV4 lưu thêm
[peer governance proof](evidence/tv4-20261111-peer-acceptance.json). Đây không phải chứng nhận
deployment testnet: [deploy_local](../scripts/deploy_local.mjs) và checker cố ý khóa chainId 31337,
Anvil mới/unforked/unlocked; đường signer/testnet cần review riêng trước khi gửi giao dịch.
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
predecessor = bytes32(0).
salt = bytes32(bytes20(address(governor))) XOR descriptionHash (địa chỉ padding bên phải đến 32 byte).
operationId = keccak256(abi.encode(targets, values, calldatas, predecessor, salt)), đối chiếu
Timelock.hashOperationBatch. Proposal luôn dùng batch dù chỉ một action; không dùng hashOperation single.
requestId nằm trong calldata và có thể thuộc nhiều proposal; proposalId không chứa proposer.
Cùng arrays/description thì cùng proposalId. operationId còn phụ thuộc Governor qua salt.

Ví dụ encode và chính sách bytes/uint256 đầy đủ nằm ở [SC06 handoff](sc06-handoff.md).
Sau execute, Timelock.getTimestamp(operationId) trả marker 1, không phải execution timestamp;
lấy timestamp từ block receipt. Ready là điều kiện operation, proposal vẫn Queued.
Không tạo state Failed khi execute revert; retry cùng arrays/hash sau khi nạp đủ quỹ.

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
Checklist SC01 phía trên là lịch sử, không ghi đè trạng thái SC06 hiện hành. Xem [SC06 handoff](sc06-handoff.md), [SC07 coverage](sc07-test-coverage.md) và [SC09/report #44](sc09-smart-contracts-report.md).

## Snapshot, quorum, ETA và điều kiện giải ngân

| Mốc/điều kiện | Quy tắc hiện hành |
|---|---|
| S−1 và S | Proposal Pending; vote bị từ chối, creator có thể cancel. Lookup checkpoint S cần clock > S |
| S+1 đến D | Active, mỗi ví vote một lần với quyền tại S; tại D vẫn được bỏ phiếu lần đầu |
| D+1 | Succeeded khi For + Abstain >= 20% past supply và For > Against, nếu không Defeated |
| Queue | Chỉ Succeeded, qua Governor; ETA = timestamp queue + 120 giây |
| ETA−1 / ETA | Operation Waiting / Ready; execute từ ETA nếu đủ mọi điều kiện khác |
| Execute | Đúng targets/values/calldata/descriptionHash, chưa execute, operation Ready, Treasury đủ BUD và request chưa paid |
| Thành công/revert | Thành công mới Executed/Done/paid=true; lỗi revert cả token/state/events và có thể retry thiếu quỹ sau topup |

Unit/integration kiểm các biên và exact errors tại [mapping SC07](sc07-test-coverage.md).
Bootstrap sạch là tiền điều kiện: operation được bootstrap schedule trước rồi revoke vẫn tồn tại;
không coi revoke role là cancel operation. Không có emergency cancel sau Pending hoặc đường EOA
admin để khôi phục sau renounce. Cấu hình sai sau bàn giao có thể phải redeploy.

## Đối chiếu dữ liệu chain tại cùng H/hash

1. Chọn chainId/deployment và block H/hash canonical; xác minh manifest, receipt deploy,
   source/compiler/dependency/ABI/runtime và các liên kết getter của năm contract.
2. Quét raw logs từ deployment block đến H, giữ blockHash/txHash/logIndex. Kiểm receipt status,
   canonical ancestry và indexed flags; receipt revert không có log thành công để cộng.
3. Liên kết ProposalCreated → calldata requestId/recipient/amount, proposalId và operationId bằng
   description bytes nguyên bản và salt batch. Một request có thể thuộc nhiều proposal.
4. Chỉ BUD Transfer vào/ra Treasury tạo ledger; BudgetDisbursed nối metadata khoản chi, không cộng
   thành lần chi thứ hai. Balance tại H phải bằng tổng vào − tổng ra; bỏ self-transfer khỏi net flow.
5. Gọi state/votes/quorum(snapshot), paidRequests, operation timestamp/state và BUD balanceOf tại
   cùng H; kiểm lại hash H sau audit. Empty blocks vẫn làm state theo thời gian thay đổi.
6. API/rebuild cần cùng deployment/H/hash; nếu có snapshotRevision phải ghi đúng revision đã publish.
   Không gộp các chain/reset branch dù cùng block number, không gán API revision cho receipt-only run.

[SC06 fixture](../fixtures/chain/sc06-v1/README.md) có provenance/runtime và live-RPC verification
lúc tạo; offline archive không là Merkle/state proof hoặc cam kết RPC vẫn sống. TV2 sở hữu pipeline
indexer/API/reorg/rebuild; TV1 review phép tính và giao diện contract, không ký thay nghiệm thu TV2.

## Giới hạn mô phỏng và các gate còn mở

| Phạm vi | Đã chứng minh / giới hạn | Trạng thái còn lại |
|---|---|---|
| SC07 | Unit/boundary contract-level technical PASS; không phát hiện nhu cầu sửa production | Tài liệu tích hợp chờ TV4 review |
| QA05/QA06 | TV4 local 202/202 Foundry, 21/21 attack tại b7a74ce; INV01–04 bounded đã peer chốt | Full actor/reset/receipt/API/UI variants vẫn PARTIAL; không suy mọi strategy |
| Voting/quỹ | Không chống Sybil, mua GOV trước snapshot hoặc bảo đảm quỹ cho proposal chưa execute | Không mở rộng bảo đảm ngoài mô phỏng |
| Bootstrap/config | Final matrix và no-bootstrap-operation audit local PASS | Sau renounce không có governance quản lý role/settings theo whitelist MVP |
| Frontend | Có adapter/local evidence, chưa thay chữ ký ví extension | TV3 consumer/full extension workflow #19/#41 còn mở |
| Testnet | TV4 chọn Sepolia/11155111/K=2; PublicNode identity/CLZ probe read-only, chưa deploy | BLOCKED #20: signer an toàn có gas, đường remote deploy/check-roles được review, kiểm compiled bytecode/gas, manifest/receipts và Executed/Defeated thời gian thật |
| Tích hợp/release | Candidate khác Dev; local evidence không là máy nhận độc lập | #18/#47 tích hợp, #40 môi trường nhận, #42 máy khác, #44 release/report còn gate riêng |

Bàn giao cho nhóm trưởng: [SC09 — phần Smart Contracts của báo cáo #44](sc09-smart-contracts-report.md).


### Testnet: cấu hình đã chọn, triển khai vẫn bị chặn

[TV4 preflight](evidence/tv4-20261111-testnet-preflight.json) ghi lựa chọn Sepolia,
chainId 11155111, K=2 và RPC `https://ethereum-sepolia-rpc.publicnode.com`.
Đây là lựa chọn cấu hình của TV4, không tự thay deployment authorization hoặc peer approval.
Báo cáo source d8f8743 chỉ có read-only eth_chainId/block/eth_call CLZ(1)=255;
block head và latest eth_call không được khẳng định cùng H/hash. Không có transaction
broadcast hoặc signer được sử dụng; probe không thay kiểm toàn bộ compiled bytecode,
gas estimation theo fork hiện hành, ABI/indexer hoặc contract roles trên testnet.

Phải có signer owner/account-role map riêng và balance gas được xác minh, signer an toàn,
remote deployment/check-roles path được TV1 review, revision/CI được chấp nhận, manifest và
receipts thật. Chờ voting/timelock bằng thời gian thực, không warp/mine testnet.
Không dùng account unlocked/khóa demo archived hoặc tắt guard local để gửi lên mạng ngoài.
#20 vẫn BLOCKED; đợt tài liệu này không gọi RPC testnet hay gửi giao dịch.
