# SC06 v1 — receipt/log local thật, một lịch sử canonical

`chain.json` lấy từ Anvil riêng do `scripts/generate_sc06_chain.mjs` sở hữu.
Không snapshot, không evm_revert, không ghép receipt lịch sử TV4. Generator đã dừng
Anvil sau khi đối chiếu RPC; đây là archive offline, không phải địa chỉ live/testnet.

## Nội dung

| Field | Nội dung |
|---|---|
| manifest | Manifest TV4: chainId 31337, addresses, deployment blocks/receipts, source/compiler/dependency/ABI hashes, cấu hình, accounts công khai |
| roleAudit | Checker TV4 tại H/hash sau bootstrap; `preRenounceRoleCheck` và `preFundingRoleCheck` trong manifest là hai gate riêng, không bị thay bởi audit cuối |
| blocks | Toàn bộ header RPC từ genesis đến H, parent hashes, timestamps và transaction hashes |
| receipts / transactions | Toàn bộ RPC receipts/transactions, gồm deployment/seed và campaign; raw topics/data/emitter/tx/log coordinates |
| proposals | Chuỗi description nguyên bản, request/amount/calldata/hashes/salt/ID, transaction links; proposal thứ hai bị cancel |
| calls | Raw eth_call input/output tại H: hashProposal, hashOperationBatch, state, quorum(snapshot), timestamp, paidRequests, GOV/BUD supply và cấu hình Governor |
| expectedDecoded | Kết quả từ decoder TV2 thật; unknown topics giữ rõ trạng thái, không đổi thành business event |
| generation | Commit nguồn cố định, Node version, hash các script/decoder/projection/test tồn tại tại commit đó |
| verification / balances | Kết quả live RPC và số dư base units, không cộng đôi dòng tiền |

Một proposal nhận 400+300 For, queue qua caller không GOV và execute qua outsider
không GOV đúng ETA; chi 1.000 BUD. Proposal thứ hai creator cancel khi Pending.
operationId thứ hai chỉ là hash tính trước để kiểm Unset: không chứng minh có operation đã schedule.

Archive hiện tại được tạo từ source ngày 10/11/2026 sau sửa recovery/API TV4: H=26/hash
`0x166146af450c2d638a0914f63d71ab96f19cbca2eea77d35f98467a406c13afd`; 27 headers kể cả genesis,
24 receipts, 42 logs; decoder TV2 nhận 14 decoded + 16 unknown topics (role/init); 12 log GOV
không thuộc registry TV2 vẫn giữ raw và được full compiler ABI kiểm tra.
Tất cả 42 raw logs phải round-trip ABI đúng. Không có decode_error.
Treasury=9.000, recipient=1.000, funding=10.000 BUD; totalSupply=20.000 BUD.
GOV mint từ bốn Transfer constructor=400+300+200+100=1.000 GOV; quorum tại snapshot
S của proposal thành công = 1.000 × 20/100 = **200 GOV**. Checker replay nguồn cung
và các event QuorumNumeratorUpdated tới S, đối chiếu raw quorum(S) ở H.
Một Transfer chi và một BudgetDisbursed liên kết cùng tx chỉ tính là một khoản chi.

## Tái lập và kiểm

Cần Node **24.15.0** theo `.nvmrc`, npm dependency theo lock, Foundry 1.8.5.
Node 24.15.0 và Foundry 1.8.5 được dùng khi tạo lại fixture trên nhánh tích hợp từ Dev.
Thiết lập PATH trỏ Node 24.15.0 đã cài trên máy, sau đó:

```bash
npm ci --ignore-scripts
forge build
node --import tsx scripts/check_sc06_chain.mjs
node --import tsx --test tests/sc06-chain.test.mjs
npm run test:bootstrap
# Tạo run MỚI, thư mục output phải chưa tồn tại; giữ fixtures hiện có:
node --import tsx scripts/generate_sc06_chain.mjs /tmp/sc06-new-run
```

Nguồn tạo **archive hiện tại**: `generation.sourceCommit` trong `chain.json`,
**`9ad0aeaffd8c2a6135c05a2151148e792c84022c`**. Source phải commit trước
khi tạo archive mới; không sửa checksum/receipt để ép archive cũ PASS.
Để tái lập từ revision chính xác mà không đổi branch đang làm việc:

```bash
git worktree add --detach /tmp/sc06-source 9ad0aeaffd8c2a6135c05a2151148e792c84022c
cd /tmp/sc06-source
git submodule update --init --recursive
npm ci --ignore-scripts
forge build
node --import tsx scripts/generate_sc06_chain.mjs /tmp/sc06-reproduced
node --import tsx scripts/check_sc06_chain.mjs /tmp/sc06-reproduced/chain.json
```

Không yêu cầu tx/block hash giống giữa các lần Anvil chạy: timestamp mine có thể khác;
cần cùng source/config và các bất biến projection/ledger. Cần checkout có Git history/submodules,
không chỉ tải ZIP source. Checker yêu cầu source revision là ancestor HEAD và các file được kiểm
khớp blob ở revision đó lẫn working tree; không sửa source rồi dùng archive cũ để nhận PASS.

Generator tái sử dụng TV4 deployGovernance/checkGovernanceRoles, waitForReceipt và
smoke lifecycle nguyên bản. Bootstrap chạy pre-renounce role/operation preflight khi
deployer còn admin và Treasury chưa nhận BUD; nếu gate thất bại thì dừng trước renounce.
Sau khi renounce Treasury/Timelock admin, final pre-funding audit phải đạt mới nạp BUD;
`npm run test:bootstrap` kiểm các nhánh từ chối bằng Anvil riêng, không phải bằng chứng
testnet. Generator chỉ sở hữu Anvil loopback mới, không nhận key/RPC ngoài.
Generator từ chối output tồn tại. Cần quyền listen loopback; sandbox mặc định chặn
EPERM nên live run được cấp quyền chạy ngoài sandbox. Không mở RPC ra Internet.

Trước khi xuất, checker so toàn bộ blocks/receipts/transactions với RPC, getLogs
toàn dải và eth_call cùng H, kiểm H/hash cuối. Offline checker kiểm liên kết/hash/
ABI/decode/ledger; không xác minh Merkle inclusion proof và không thay RPC độc lập.
`liveRpcVerified: true` ghi lại kết quả lúc tạo, không có nghĩa RPC còn đang chạy.
Source/ABI đổi phải regenerate run mới hoặc checkout đúng provenance, không sửa receipt bằng tay.

Checker đưa raw logs của **chính chain.json** qua TV2 classify/buildModel/evaluate;
không dùng fixture BE03. Assert proposal/calldata/description, phiếu A=400/B=300,
operationId/ETA/execution, một disbursement, ledger 10.000−1.000=9.000 và Canceled
không có operation. Tại timestamp H, oracle tính quorum(S) độc lập từ GOV Transfer
constructor và lịch sử QuorumNumeratorUpdated (đối chiếu pinned totalSupply và
quorumNumerator tại H), rồi buộc raw Governor.quorum(S) khớp trước khi evaluate;
không dùng raw quorum(S) tự xác nhận state. Snapshot S phải sau deployment và nhỏ hơn H;
checkpoint supply tại thời điểm ≤ S không đòi block đúng timestamp S.

Provenance checker đối chiếu sourceHashes với Git blobs và working tree, gồm source
compiler trong submodule theo gitlink ở revision. Artifact/ABI hashes, compiler metadata,
deployment transaction/constructor và runtime (normalize immutables) được kiểm. Role holders
replay từ canonical logs được so với audit và pinned hasRole/getRoleAdmin calls; audit phải
cùng chainId/source revision/H/hash. Kết quả live còn đối chiếu runtime và mọi pinned call với RPC.

Bộ test SC06 định nghĩa **32 trường hợp** (3 kiểm dương, 29 kiểm âm), bao gồm mutation
chỉ sửa raw quorum(S) thành 1.001 GOV và yêu cầu lỗi đúng nguyên nhân, source hash 0/mất
hash, revision không tồn tại/không chứa generator, manifest hash, audit H/hash/holder,
ABI version/address/runtime, tx/log sai block, amount/description/Unicode/hash/salt/raw
data/index/ledger. Cần chạy lại sau khi regenerate archive; không lấy các con số
PASS của lượt trước làm bằng chứng cho source mới. Offline consistency không phải
blockchain inclusion proof; role calls lưu trong archive được xác minh live lúc tạo,
không có state proof.

## Giới hạn bàn giao

Không có private key/secret trong fixture. Không có database/API/UI wallet hay testnet acceptance.
Ví dụ ethers/arrays được kiểm qua encoding và eth_call thực; chưa có xác nhận độc lập từ TV3.
TV2 cần review ABI version/expected decode; nhãn awaiting-sc06 chưa đổi. TV4 cần
review gate bootstrap độc lập trước renounce, final audit trước funding và operation
preflight theo `scripts/governance_local.mjs`/`npm run test:bootstrap`; offline SC06
không thay deployment gate đó. Campaign sạch không tự chứng minh testnet.
Source commit đã cố định trước khi sinh data; commit fixture riêng sau source commit, không
hash fixture trong generation.sourceHashes, tránh vòng tròn source/checksum/fixture.
TV4 cần review source commit và commit fixture bàn giao; không đổi sourceCommit sang commit
fixture để tạo ấn tượng fixture đã tồn tại tại thời điểm tạo nguồn.
