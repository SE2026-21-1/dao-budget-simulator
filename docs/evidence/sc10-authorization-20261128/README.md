# SC10 / Issue #20 — authorization draft và kiểm chứng gas, 28/11/2026

**Trạng thái: PRELIMINARY / BLOCKED / NO BROADCAST.** Nhóm trưởng đã chọn các
phương án sơ bộ bên dưới. Đây chưa là final packet, owner acceptance, deployment
authorization hoặc nghiệm thu Sepolia. Không có giao dịch Sepolia nào được gửi
trong quá trình chuẩn bị này. Evidence branch chứa tài liệu và runner chỉ đọc;
**source triển khai vẫn là SHA e17ef61**, không phải commit tài liệu này.

## Quyết định đã ghi nhận

| Mục | Quyết định sơ bộ | Còn thiếu |
| --- | --- | --- |
| Deployment owner/operator | Ứng viên TV4 **@dung0611** | TV4 nhận trách nhiệm công khai |
| Source | **e17ef61a8a51518005c38b0808cdc06fe7a68bbf** | Owner xác nhận full SHA |
| Network | Sepolia **11155111**, PublicNode, **K=2** | Recheck network/anchor ngay trước campaign |
| Gas-price cap | **1 gwei = 1000000000 wei/gas** | Chốt lại sau actual-map estimate |
| Deployment/bootstrap | **0,10 Sepolia ETH** | Actual-map cost và balances từng sender |
| Demo/dự phòng | **0,02 Sepolia ETH** | Demo/native funding cost và funder |
| Tổng planning envelope | **0,12 Sepolia ETH** | User và owner duyệt final budget |
| Broadcast | **CHƯA ĐƯỢC CẤP** | Explicit approval riêng của user **và** owner |

[authorization-draft.json](authorization-draft.json) giữ riêng quyết định sơ bộ,
owner acceptance và hai quyền broadcast đều `false`.
[accounts.pending.json](accounts.pending.json) có chín địa chỉ `null`, chưa phải
config executable hoặc owner-approved. Không dùng địa chỉ Anvil/synthetic thay thế.

## Source, review và CI

Fetch mới nhất vẫn xác nhận `origin/Dev=e17ef61a8a51518005c38b0808cdc06fe7a68bbf`.
[PR #63](https://github.com/SE2026-21-1/dao-budget-simulator/pull/63) đã merge lúc
2026-11-28 07:43:40 UTC. CI push Dev đúng SHA: [TV4 CI 46122529051](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46122529051)
11/11 jobs success; [Foundry fallback 46122528925](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46122528925)
1/1 success. API được đọc lại; xem [github-status.json](github-status.json).

[TV1 security APPROVED tại b186844](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460)
vẫn áp dụng cho bytes đã đối chiếu: cả 10 transitive modules remote, contracts,
shared ABI, dependency gitlinks và compiler/lock configuration không đổi.
[source-comparison.json](source-comparison.json) chứa SHA256 từng module.
Không yêu cầu review hoặc chạy lại các suite accepted vì các file này không đổi.

Quy trình giữ nguyên: grant → operation/history/role audit tại K2 và tip → audit
lặp ngay trước renounce → hai renounces → final audit → delegation → audit → seed
funding → final audit. Treasury admin/spender = Timelock; Timelock admin = self,
proposer/executor/canceller = Governor; deployer không còn quyền đặc biệt; không
có zero-address executor. Việc revoke proposer không tự hủy operation đã schedule.

Signed identity = `keccak256(signedRaw)` được persist `SIGNED` trước RPC send;
response phải cùng hash, hai receipt và canonical block/index/membership phải
khớp K2. Journal fsync file/rename/directory. Timeout/ambiguous submission phải
stop và đối chiếu hash/sender/nonce/chain/journal; không tự resend hoặc rerun.
Đó là source verification/accepted evidence, chưa là audit deployment Sepolia.

## Gas Sepolia hiện hành và BudgetGovernor

Nguồn chính thức được kiểm tra lại ngày 28/11/2026:

- [EF Glamsterdam activation](https://blog.ethereum.org/2026/09/17/glamsterdam-testnet-announcement):
  Sepolia kích hoạt 06/10/2026 13:53:36 UTC, timestamp `1791294816`.
- [Geth config tại commit 3d858f858a458effb2a563788aedf1fe65e1f0d3](https://github.com/ethereum/go-ethereum/blob/3d858f858a458effb2a563788aedf1fe65e1f0d3/params/config.go#L77)
  xác nhận chainId và Amsterdam timestamp. Không suy active fork chỉ từ trạng thái
  Draft/Last Call của một trang EIP; đối chiếu cả lịch và client config.
- [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037) tách execution gas và state gas.
  Cap **16.777.216** từ [EIP-7825](https://eips.ethereum.org/EIPS/eip-7825) áp dụng
  execution gas; tổng `tx.gas` có cap **4.294.967.295**. Intrinsic gas và phần tài
  nguyên còn lại trong block vẫn ràng buộc admission/inclusion.

[protocol-sources.json](protocol-sources.json) ghi nguồn và mốc kiểm tra. Block
được pin có gas limit **200.000.000**; không coi đây là hằng số cho mọi block.

**Kiểm tra RPC mới, không phải rerun security suite:** chạy
[probe-governor-readonly.mjs](probe-governor-readonly.mjs) trên artifacts hiện có.
Runner allowlist chỉ có phương thức đọc, không load signer, không ký hoặc gửi.
Các RPC payload bytecode lớn được lưu bằng byte length/hash và có thể dựng lại
từ source/compiler; report chứa source hashes, ABI/artifact identities và runner hash.

Anchor: H **12229626**, hash
`0x3bfb1b7ab7d6730896c6450ad563c60edffb6a1e90ebd7b9dc0fa395d4e9b4a2`;
chain/genesis và anchor được đọc lại. K2 là hai descendants, không là consensus finality.

| Kiểm tra mới | Kết quả thực tế |
| --- | --- |
| Governor `eth_estimateGas` | **29.437.589** gas |
| Limit +20%, so với total cap/block limit quan sát | **35.325.107**, PASS |
| `eth_call` với total gas 16.777.216 | Lỗi `contract creation code storage out of gas`, đúng kết quả âm dự kiến |
| `eth_call` với total gas 35.325.107 | Thành công, runtime **18.279 bytes** |
| Runtime ngoài compiler-declared immutable ranges | Khớp compiler |
| Canonical anchor và network recheck | PASS |

Report [governor-readonly.json](governor-readonly.json): **4 assertions PASS, 0
FAIL**, gồm một negative call được kiểm tra lỗi. Đây không là bốn deployment tests.
Governor initcode 21.564 bytes. Runtime keccak được ghi trong report; các immutable
thực tế vẫn phải đối chiếu bằng deployment manifest/audit sau này.

**Kết luận có giới hạn:** total estimate 29,4M không tự vi phạm cap execution
16,7M trên fork đang hoạt động. Constructor chạy được trong mô hình RPC với
35,3M total gas và trả runtime phù hợp. Chưa chứng minh txpool admission, builder
inclusion hoặc transaction deployment thực. Không đo riêng execution/state gas.
Synthetic sender được cấp balance/nonce bằng state override; dependency code
templates không có storage/immutables đã triển khai thật. Chúng chỉ đáp ứng các
lời gọi constructor như clock/CLOCK_MODE; không thay thế full campaign estimate.
Một RPC provider và offline hashes không tự chứng minh blockchain provenance độc lập.

## Ngân sách: cơ sở tính và giới hạn

Năm constructor đã được estimate bằng remote RPC tại cùng H/hash trong lượt
chuẩn bị trước; lần này chỉ kiểm tra thêm Governor theo yêu cầu. Không trộn gas
Anvil Osaka vào quote Sepolia Amsterdam.

| Contract | Remote synthetic estimate | Limit +20% |
| --- | ---: | ---: |
| GovernanceToken | 11.865.474 | 14.238.569 |
| BudgetToken | 3.422.948 | 4.107.538 |
| Treasury | 3.515.492 | 4.218.591 |
| Timelock | 10.780.488 | 12.936.586 |
| BudgetGovernor | 29.437.589 | 35.325.107 |
| Tổng 5 constructor | **59.021.991** | **70.826.391** |

Tại cap **1 gwei**, tổng constructor limits tương ứng **0,070826391 ETH**.
Trong envelope deployment 0,10 ETH còn **0,029173609 ETH**, tương đương
29.173.609 gas tại cap cho 12 bootstrap transactions còn lại. Đây là phép tính
trần, chưa chứng minh đủ ngân sách. Demo/funding ngoài deployment CLI budget.

Quote lịch sử 14 wei/gas lúc 2026-11-28T11:01:00Z chỉ tương ứng constructor limits
**991.569.474 wei = 0,000000000991569474 ETH**. Giá trị ETH này sửa lỗi đổi đơn vị
trong bản báo cáo văn bản tạm trước đó; JSON gốc chứa costWei đúng. Không dùng
quote thấp đó làm full campaign budget hoặc giá chắc chắn lúc broadcast.

[budget-draft.json](budget-draft.json) và [prior-constructor-estimates.json](prior-constructor-estimates.json)
ghi phép tính/limitations. Diagnostic `naiveTotalAtMostOldOsakaCap` chỉ so sánh số
học total gas với cap Osaka cũ; không là kết luận validity trên Amsterdam.
CLI hiện ký **legacy type-0 gasPrice**: `--max-fee-wei` giới hạn `eth_gasPrice`,
không tạo `maxFeePerGas` type 2. Nếu quote vượt cap thì dừng; không tăng cap tự động.
Native funder, actual-map gas/nonce/balances và phân bổ ETH chưa có.

## Public account map và signing

Tất cả chín địa chỉ đang **PENDING**. Owner được đề nghị tái sử dụng account
Sepolia phù hợp nếu đã có; chưa tạo ví hoặc lấy địa chỉ từ Anvil/fixture.

| Role | Chức năng | Bootstrap signer |
| --- | --- | --- |
| A | 400 GOV, self-delegate, propose và vote For | Có |
| B | 300 GOV, self-delegate, A+B = 700 For | Có |
| C | 200 GOV, self-delegate, actor độc lập | Có |
| D | 100 GOV, self-delegate, vote proposal thiếu quorum 200 | Có |
| funding | Nhận 20.000 BUD, seed Treasury 10.000 sau audit | Có |
| deployer | 5 creations + 5 grants + 2 renounces, không final privilege | Có |
| caller | EOA thường gọi Governor queue/execute | Không; cần signing/gas riêng cho demo |
| recipient | Nhận 1.000 BUD | Không |
| outsider | Actor không quyền, negative scenarios | Không |

Sáu bootstrap signers = **A/B/C/D/funding/deployer**. Custodian chưa được mặc
định là TV4/TV2; mỗi role cần người quản lý và exclusive campaign-use confirmation.
Current CLI giải mã sáu encrypted JSON keystores trong một trusted local process,
password từ inherited FD >=3, địa chỉ khớp map; không hỗ trợ distributed hoặc
hardware signing. Nếu owner chọn mô hình custody khác thì cần đánh giá delta;
không tự thay signing implementation. Không gửi key/seed/password/keystore qua
GitHub/chat hoặc đưa raw signed transactions vào evidence. Funding role BUD không
đồng nghĩa native ETH funder. Caller là sender bổ sung cho demo, ngoài sáu signer.

## Kết quả đã có — không chạy lại lần này

| Nguồn bằng chứng | Lệnh/phạm vi | Kết quả đã xác nhận bằng log |
| --- | --- | --- |
| Local, lượt chuẩn bị trước tại e17ef61 | `forge build`; `forge fmt --check`; `npm run typecheck`; `python3 scripts/check_sc06_abi.py` | Exit 0, ABI/catalog 6 artifacts |
| Local, lượt chuẩn bị trước | `python3 tests/test_sc06_abi.py` | 6 PASS / 0 FAIL / 0 SKIP |
| Local, lượt chuẩn bị trước | `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/integration/TimelockGovernance.t.sol -vv` | 40 PASS / 0 FAIL / 0 SKIP; 2 fuzz ×256 runs |
| Local environment probe đầu tiên | `node scripts/check_sepolia_readonly.mjs` | FAIL vì nested submodule chưa initialized; giữ report lỗi |
| Local environment đã init đúng + remote read-only | Cùng probe, output mới | PASS network/genesis/CLZ/K2; 0 broadcasts |
| Local disposable fork | `node scripts/preflight_sepolia.mjs --accounts - --output NEW_REPORT` | 17 tx/17 receipts; role/operation gates PASS; owned Anvil exit0 |
| GitHub CI đúng e17ef61 | Contract job 140909935478, run 46122529051 | Foundry 182 PASS / 0 FAIL / 0 SKIP; 9 suites |
| Cùng CI | Combined bootstrap/provenance/Sepolia/QA07 | 67 PASS / 0 FAIL / 0 SKIP, không gọi là 67 Sepolia tests |
| Cùng CI | SC06 versioned canonical | 32 PASS / 0 FAIL / 0 SKIP |

CI invariants có 100 runs / 5.000 calls / 0 reverts; fuzz 256 runs. Logs local được
chép có nhãn `prior-*`, chỉ thay HOME bằng placeholder; original hashes được giữ
trong [prior-evidence-index.json](prior-evidence-index.json). CI dùng trích đoạn
có số dòng và full-log SHA256, không giả là vừa chạy local. Fork gas 9.371.009 và
các audit block phát sinh trên fork **không phải Sepolia canonical receipts**.
Xem [prior-fork-summary.json](prior-fork-summary.json); không dùng synthetic fork
fee/budget làm authorization thật.

## Phân công và packet còn thiếu

- **TV4 @dung0611:** xác nhận nhận deployment ownership/operator và full source
  SHA; chuẩn bị 9 public addresses distinct/nonzero, 6 custodian/exclusive-use
  confirmations, secure signing path và caller path. Chỉ công khai policy/kết quả,
  không gửi secrets hoặc đường dẫn keystore cá nhân. Đề xuất native funder, đọc
  balances và latest/pending nonces tại H/hash, lập actual-map estimate +20% cho
  toàn bộ 17 deployment/bootstrap tx và budget demo/funding riêng. Local fork
  hoặc state-override cost phải được ghi rõ; sau dependencies deploy thật vẫn
  re-estimate pending cho từng transaction theo script trước khi ký.
- **TV2 @daongocuong:** phối hợp thu owner confirmation, kiểm schema/map với
  constructor allocations và manifest; đối chiếu chainId/K/ABI/IDs cho backend,
  theo dõi mục còn thiếu và phối hợp final sign-off. Không mặc định TV2 giữ keys;
  không triển khai trùng Issue #19 hoặc #40 trong lượt này.
- **TV1:** giữ evidence/source equivalence đã accepted, kiểm actual-map gas và
  final packet; sau authorization mới đối chiếu manifest, constructors/runtime,
  role history/operations và receipts. Không mở lại security review bytes không đổi.
- **Nhóm trưởng + owner:** chốt funder, caps/budget cuối và **separate explicit
  broadcast authorization** ràng buộc SHA, checksum map, chain/RPC/K2, scope,
  thời hạn, fee/budget và fail-stop/journal policy. Hiện cả hai approval đều false.

Trước broadcast cần đầy đủ các mục trên, source/CI/review vẫn đúng, nonce không
có pending ngoài campaign, đủ native balance từng sender và fresh gas/network
checks đạt. Nếu estimated total limit vượt block resource availability/provider
policy, dừng và báo owner; không đổi contract/giảm guard để vượt gate.

Sau khi được phép và triển khai mới có thể thu manifest thật, pre-renounce/final
role audits, real-time Executed và Defeated evidence. Successful demo: A+B 700
For, giải ngân 1.000 BUD, Treasury còn 9.000. Defeated: D 100 For < quorum 200;
không có transaction tự động chuyển Defeated, dùng create/vote receipts và
`Governor.state/quorum/proposalVotes` sau deadline tại canonical H/hash. Không
dùng warp hoặc receipts fork để tuyên bố testnet PASS. Issue #20 giữ BLOCKED.

## Tái lập kiểm tra gas mới (chỉ đọc)

Cần Node 24.15.0, dependencies/artifacts đúng pins của source đề xuất. Dùng
checkout source e17ef61, runner tại evidence branch này và output **mới**:

```bash
node PATH_TO_EVIDENCE/probe-governor-readonly.mjs PATH_TO_E17_CHECKOUT NEW_REPORT.json 12229626
```

Bỏ argument height để chọn fresh head−2 nếu cần kiểm tra lại cho actual campaign;
ghi nhận anchor mới, không ghi đè report lịch sử. RPC có thể hết khả năng đọc
historical state; ghi UNVERIFIED/FAIL nếu không tái lập được, không suy PASS từ hash.
Runner không import deploy CLI, không chứa signer hoặc send method. Không chạy
deployment command từ evidence branch vì deploy CLI yêu cầu exact approved HEAD.

`checksums.json` seal các file trong packet, self-excluded. Checksum chứng minh
bytes nhất quán, không tự chứng minh nguồn gốc blockchain hoặc quyền broadcast.
