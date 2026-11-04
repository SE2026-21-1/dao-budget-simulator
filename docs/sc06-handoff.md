# SC06 — ABI và giao diện tích hợp, giai đoạn 1

Base `origin/Dev`: `0b43364`; branch `feature/tv1-sc06` tạo trực tiếp từ Dev.
Ngày 04/11/2026 GitHub API xác nhận PR #33 open, merged=false, mergeable=true.
Không cherry-pick SC05, không đổi nhánh SC05. Không có receipt/log mới trong giai đoạn này.

## ABI compiler và cách tái lập

Foundry 1.8.5, Solidity 0.8.37, optimizer 200, EVM osaka; dependency theo
`foundry.lock`: OpenZeppelin 5.4.0 và forge-std 1.17.0. Chạy từ repo root:

```bash
forge build
python3 scripts/check_sc06_abi.py --write
python3 scripts/check_sc06_abi.py
python3 tests/test_sc06_abi.py
python3 scripts/check.py
forge fmt --check
```

`--write` chỉ xuất ABI compiler cho GovernanceToken, BudgetToken, Treasury,
BudgetGovernor và ITreasury, cùng catalog; không sửa ABI bằng tay. Checker mặc định
chỉ đọc, so đầy đủ entries/outputs/mutability/indexed/argument order, không coi thứ tự
entries là khác biệt. Phải build trước để compiler artifacts phản ánh source hiện tại.

TimelockController đọc từ artifact dependency để lập catalog. Chưa thêm shared ABI
Timelock vì file đó thuộc PR #33. Checker báo DEFERRED rõ ràng nếu file chưa có;
khi file có mặt sau merge, checker bắt buộc nó khớp artifact, không tự ghi đè file đó.
Không tuyên bố shared ABI Timelock đã bàn giao trên Dev trước khi SC05 merge.

[Catalog sinh từ compiler](sc06-abi-reference.md) chứa toàn bộ public/external
functions, event canonical signatures/kiểu/indexed flags và custom error signatures,
bao gồm errors kế thừa. Presence trong ABI không đồng nghĩa quyền gọi được cấp.
Constructor/receive và dữ liệu ABI đầy đủ nằm trong JSON/artifact.

## Giao diện TV2/TV3 sử dụng

| Contract | TV3 gửi qua ví | TV2/TV3 đọc hoặc decode |
|---|---|---|
| GOV | delegate(address) | balanceOf, decimals, totalSupply, delegates, getVotes, getPastVotes, getPastTotalSupply, clock/CLOCK_MODE; Transfer, DelegateChanged, DelegateVotesChanged |
| BUD | transfer(address,uint256) để nạp Treasury | balanceOf, decimals, totalSupply, Transfer; approve/allowance/transferFrom nếu consumer cần, nạp trực tiếp không cần approve |
| Treasury | Không gọi disburse trực tiếp | budgetToken, paidRequests, hasRole, getRoleAdmin; BudgetDisbursed |
| Governor | propose, castVote, cancel, queue, execute | hashProposal, state, proposalSnapshot/Deadline/Eta/Proposer/Votes, quorum, votingDelay/Period, proposalThreshold, hasVoted, token/treasury/timelock; ProposalCreated/Queued/Executed/Canceled, VoteCast/WithParams |
| Timelock | Không gọi schedule/execute trực tiếp | hashOperationBatch, getTimestamp, getOperationState, isOperationReady/Done, getMinDelay, hasRole/getRoleAdmin; CallScheduled, CallSalt, CallExecuted, Cancelled |

Số lượng/kiểu tham số và overload lấy từ catalog/ABI, không suy từ tên viết tắt trong bảng.
Ví đủ past voting power mới propose; queue/execute qua Governor không yêu cầu giữ GOV.
Cancel chỉ creator khi Pending; cancel Pending chưa queue không cần có Timelock Cancelled.

## Encode khoản chi và nối ID

Ví dụ tương thích ethers 6 đã được repo dùng (minh họa offline, không gửi giao dịch):

```javascript
const treasuryInterface = new Interface(treasuryAbi);
const payload = treasuryInterface.encodeFunctionData('disburse', [requestId, recipient, amount]);
const targets = [treasuryAddress];
const values = ['0'];
const calldatas = [payload];
const descriptionHash = keccak256(toUtf8Bytes(description));
const coder = AbiCoder.defaultAbiCoder();
const proposalId = BigInt(keccak256(coder.encode(
  ['address[]', 'uint256[]', 'bytes[]', 'bytes32'],
  [targets, values, calldatas, descriptionHash],
))).toString();
const salt = toBeHex(BigInt(governorAddress + '0'.repeat(24)) ^ BigInt(descriptionHash), 32);
const predecessor = ZeroHash;
const operationId = keccak256(coder.encode(
  ['address[]', 'uint256[]', 'bytes[]', 'bytes32', 'bytes32'],
  [targets, values, calldatas, predecessor, salt],
));
// queue/execute: gửi targets, values, calldatas, descriptionHash qua Governor.
```

Các helpers trên import từ `ethers`; địa chỉ Governor phải là hex address 20 byte đã validate.
Đối chiếu proposalId với Governor.hashProposal và operationId với Timelock.hashOperationBatch.
Selector disburse là `0x6664ac91`; calldata chuẩn dài 100 byte.
Ví dụ xác định 1.000 BUD đã có tại `fixtures/sc01/disbursement-v1.json`, được
`scripts/check.py` đối chiếu bằng cast. Fixture đó là tổng hợp, không phải receipt.

- requestId là bytes32 có trước propose, nằm trong disburse calldata; không phải proposalId.
  Hai proposal có thể cùng requestId nhưng Treasury chỉ thanh toán thành công một lần.
- proposalId hash toàn bộ arrays và descriptionHash; không parse lại description để tính hash.
- operationId hash batch/predecessor/salt; không dùng hash single hoặc salt=descriptionHash.
- Liên kết theo verified emitter + txHash + logIndex: ProposalCreated → calldata/request;
  ProposalQueued + CallScheduled/CallSalt → operation/ETA; execution receipt nối
  ProposalExecuted/CallExecuted/BudgetDisbursed/Transfer. Transfer là nguồn dòng tiền duy nhất.

## Bytes description và số nguyên

UI serialize JSON `{version:1,title,body}` một lần, giữ nguyên chuỗi UTF-8 dùng propose.
Giữ nguyên Unicode, dấu, newline, khoảng trắng và thứ tự keys: không trim, normalize Unicode,
parse/stringify lại khi queue/execute. Hai chuỗi trông giống nhau có thể khác bytes và hash.
Title 5–120/body 20–2.000 là yêu cầu UI; quy ước đếm code point/description v1 cần TV3 xác nhận.
Raw bytes bất thường cần giữ raw log; không thay thế/làm sạch rồi hash lại. TV2 đang giữ raw-only
khi text không decode được hoặc có NUL không lưu được trong JSONB; đây không phải mất log gốc.

GOV/BUD đều 18 decimals. `1.000 BUD = "1000000000000000000000"` base units.
Dùng BigInt/parseUnits với chuỗi nhập, không Number/parseFloat khi tính tiền hoặc ID.
JSON dùng chuỗi thập phân nguyên cho uint256 (amount, proposalId, weight...), bytes32 vẫn hex.
Không JSON.stringify BigInt trực tiếp. Native values của proposal là `["0"]`.

## Trách nhiệm và phần chưa nghiệm thu

TV1 sở hữu ABI, tài liệu, checker và test vector. TV2 xác nhận decoder/projection/ABI version;
TV3 xác nhận dựng calldata/hash, text, decimals và lỗi. Không đổi implementation consumer ở đây.
Registry TV2 có VoteCastWithParams và nhãn awaiting-sc06; không tự đổi ABI version/nhãn approval.
TV4 sở hữu deploy/export/receipt/evidence; tái sử dụng export_local_handoff và smoke_governance,
không tạo deploy framework hoặc receipt poller mới.

SC05 còn operation preflight trước renounce trong script TV4. Không sửa script hoặc coi export ABI
là nghiệm thu deployment; cần TV4 giải quyết/xác nhận trước khi đóng bàn giao deployment.
Không triển khai testnet, không có consumer acceptance hoặc receipt thật mới ở giai đoạn 1.

## Giai đoạn 2

1. Fetch và đối chiếu kết quả review/merge SC05; nhận ABI Timelock từ Dev, không cherry-pick toàn SC05.
2. Cùng TV4 chốt source commit, runtime/compiler/ABI hashes và deployment local được audit.
3. Dùng tooling TV4 chạy campaign canonical không reset: proposal thành công đủ create/vote/queue/execute,
   proposal thứ hai cancel khi Pending. Không trộn demo receipts đã evm_revert với ledger canonical.
4. Đóng gói fixtures/chain/sc06-v1: README, deployment/ABI provenance manifest, raw receipts/headers,
   proposal descriptions/calldata/ID links và expected decode. Không secrets, không địa chỉ live giả.
5. Checker độc lập đối chiếu receipts/block hashes/emitter/event/IDs/ETA/số dư; consumer TV2 decode,
   TV3 tái dựng arrays/hash đúng. TV4 ghi commit tạo fixture; TV2/TV3 xác nhận rồi mới đóng SC06.

## Kết quả thực tế giai đoạn 1 — 04/11/2026

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `forge build` | Exit 0; compile 83 files, Solc 0.8.37; có warning dependency/lint, không che warning |
| `python3 scripts/check_sc06_abi.py --write` rồi chạy không `--write` | Exit 0; kiểm 6 artifacts/catalog; shared Timelock báo DEFERRED đúng phạm vi PR #33 |
| `python3 tests/test_sc06_abi.py` | 6 passed; phát hiện sai indexed, error cũ một tham số, thiếu delegate, catalog cũ, shared Timelock sai; cho phép đổi thứ tự entries |
| `python3 scripts/check.py` | Exit 0; ABI ITreasury/calldata/descriptionHash/proposalId SC01 khớp |
| `forge fmt --check` | Exit 0 |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261023 forge test -vv` | 142 passed, 0 failed, 0 skipped, 8 suites trên base Dev; không gồm 38 test SC05 chưa merge |
| `git diff --check` | Exit 0 |

Fuzz 256 runs/test; Treasury và Governance campaigns mỗi campaign 100 runs/5.000 handler
calls (depth 50), không nhân calls với số invariant properties. Có warning không ghi được
signature cache ngoài workspace vì read-only filesystem; test command vẫn exit 0.
Submodules đúng revisions trong foundry.lock. Treasury/Governor/ITreasury JSON xuất lại không
có diff; token ABI mới lần lượt 45/18 entries. Không đổi contracts, deployment scripts,
consumer implementation hoặc CI. Nhánh SC05 vẫn ở `8f6a47c`.

Chưa chạy Node consumer/build/API/frontend checks: shell không có Node.js. ABI đã tương thích
compiler và regression contract đạt; chưa xác nhận runtime consumer TV2/TV3 hoặc chạy ví dụ
ethers mới trong Node. Đây là giới hạn cần consumer xác nhận, không phải nghiệm thu toàn SC06.
