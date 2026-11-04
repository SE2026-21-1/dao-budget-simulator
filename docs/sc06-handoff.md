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

## Giai đoạn 2 — kiểm chứng local ngày 04/11/2026

Mục này ghi lịch sử đợt đầu; revision/bộ test cuối sau final review được ghi ở mục tiếp theo.

Giai đoạn 1 đã commit `5df980d619ccd344683007e1f38f64e5deb31648`, không push.
Đã bổ sung Node portable 24.15.0 trong /tmp (SHA256 chính thức khớp), cài dependency
bằng `npm ci --ignore-scripts` theo lock. npm sandbox lỗi DNS EAI_AGAIN, chạy lại có
quyền mạng thành công; Anvil sandbox lỗi listen EPERM, live run có quyền loopback đạt.
Giới hạn thiếu Node ở mục giai đoạn 1 phía trên là lịch sử, không còn chặn run này.

[Fixture canonical SC06 v1](../fixtures/chain/sc06-v1/README.md) gồm manifest, toàn bộ
raw blocks/transactions/receipts, expected decode TV2, description/calldata/ID links và
eth_call cùng H. Một campaign riêng không snapshot/revert: proposal chi 1.000 BUD và
proposal khác creator hủy Pending. H=26; 27 headers, 24 receipts, 42 logs.
TV2 decode 14 business events, giữ 16 unknown role/init topics; 12 GOV raw logs được
compiler ABI kiểm nhưng không tự mở rộng registry TV2. Không có decode_error.

| Lệnh | Kết quả thực tế |
|---|---|
| `node --import tsx scripts/generate_sc06_chain.mjs /tmp/sc06-final-canonical` | Exit 0; toàn bộ RPC receipt/transaction/block/log và eth_call đối chiếu trực tiếp trước khi dừng owned Anvil; copy nguyên bytes chain.json vào fixtures/chain/sc06-v1 |
| `node --import tsx scripts/check_sc06_chain.mjs` | Offline checks đạt; liveRpcVerified=false ở output CLI vì không kết nối RPC lúc kiểm offline |
| `node --import tsx tests/sc06-chain.test.mjs` | 14 passed, 0 failed; 1 bản dương, 13 negative mutations |
| `node --import tsx tests/indexer/decoder.test.ts` | 25 passed, 0 failed |
| `node --import tsx tests/indexer/projection.test.ts` | 23 passed, 0 failed |
| `npm run typecheck` / `npm run build` | Cả hai exit 0; consumer source không đổi |
| `python3 scripts/check_sc06_abi.py` / `python3 tests/test_sc06_abi.py` | ABI/catalog đạt; 6 tests passed |

Trong phát triển, negative rawLogData ban đầu phát hiện GOV log chưa được checker bắt;
đã thêm compiler-ABI round-trip mọi raw log, chạy lại 14/14 và regenerate campaign cuối.
Lần live đầu có lỗi so địa chỉ checksum/lowercase, chưa xuất fixture; đã sửa so theo
address bytes và chạy lại. Không sửa receipt để làm test pass hoặc che các lần lỗi này.

SC06 đã có bằng chứng local decode/encode/hash/canonical ledger; chưa đóng acceptance.
TV2/TV3 cần xác nhận độc lập bộ fixture; TV4 review source/evidence, ghi commit fixture
cuối và xử lý operation preflight SC05. Chưa chạy PostgreSQL/API/browser wallet/testnet;
không lấy offline checker làm bằng chứng inclusion proof hay nghiệm thu deployment SC05.

## Khắc phục final review — provenance cố định và projection fixture SC06

Nguồn generator/checker/test được commit riêng tại
`c4c5eb338b0a65d1e9050b0335b3e44329345f5d` **trước** khi tạo lại fixture.
Source commit chứa scripts/sc06_provenance.mjs và mọi adapter/test giai đoạn 2;
không dùng commit giai đoạn 1 để đại diện nguồn chưa tồn tại. Generator kiểm Git blobs
và working tree trước khi khởi chạy Anvil. Fixture/docs được commit sau, không thuộc
sourceHashes; source revision là ancestor của commit data, không có checksum vòng tròn.

- Canonical run cuối: H=26/hash `0xcf056c1e86f136ba749ee384ee31ad237c0f9b237ae945099a08822a479a65da`,
  27 headers/24 receipts/42 logs; liveRpcVerified=true trong file archive. Không evm_revert.
- Checker dùng trực tiếp raw logs của fixtures/chain/sc06-v1/chain.json qua TV2
  classify/buildModel/evaluate; assert 2 proposals, A=400/B=300 For, 1 operation Done,
  1 khoản chi 1.000, balance 9.000; proposal thứ hai Canceled và không có operation.
  Tất cả evaluate/state/quorum/read calls cùng H. Không sửa implementation TV2.
- Provenance kiểm revision tồn tại và ancestor HEAD, hash nguồn tại commit và working tree,
  compiler source/submodule/gitlink/ABI/artifact/runtime/constructor, chainId/address/block/version.
  Audit phải cùng H/hash; replay role logs so với audit lẫn pinned hasRole/getRoleAdmin calls.
- Offline xác minh repository và tính nhất quán archive; không chứng minh blockchain origin
  độc lập. Live generator so RPC receipts/tx/headers/logs/code/calls và H/hash cuối khi chain
  còn chạy. Snapshot calls không là state proof; TV4 vẫn phải review nguồn/evidence độc lập.

Kết quả chạy lại thực tế (Node 24.15.0, Foundry 1.8.5):

| Lệnh | Kết quả cuối |
|---|---|
| `node --import tsx scripts/generate_sc06_chain.mjs /tmp/sc06-pinned-canonical` | Exit 0; live RPC và projection đạt; copy chain.json nguyên bytes vào fixture |
| `node --import tsx tests/sc06-chain.test.mjs` | 28 passed/0 failed/0 skipped: integration trên SC06 + các mutation provenance/ABI/tx/log/ID/text/ledger |
| `node --import tsx tests/indexer/decoder.test.ts` | 25 passed/0 failed |
| `node --import tsx tests/indexer/projection.test.ts` | 23 passed/0 failed; regression bổ sung, không thay test SC06 |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261023 bash scripts/ci.sh` | Exit 0; fmt/build, 142 passed/0 failed/0 skipped, ABI SC01 đạt |
| `npm run typecheck` / `npm run build` | Cả hai exit 0 |
| `python3 scripts/check_sc06_abi.py` / `python3 tests/test_sc06_abi.py` | ABI/catalog đạt; 6 passed |

Foundry fuzz 256 runs/test, hai invariant campaigns mỗi campaign 100×50=5.000 handler calls.
Warning signature cache ngoài workspace read-only vẫn còn; không làm test fail.
Provenance test cần spawn Git; sandbox chặn spawnSync git EPERM nên đã chạy lại với quyền
đọc Git ngoài sandbox và đạt. Không bỏ kiểm tra provenance để vượt lỗi môi trường.
Không push/tạo PR trong đợt này. SC05/consumer approval, shared Timelock ABI sau merge,
TV4 operation preflight, testnet/UI/API/DB acceptance vẫn chưa được đóng.
