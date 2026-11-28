# TV1 — Smart Contracts & Governance

Phần báo cáo SC09, 28/11/2026. Source sản phẩm được review:
`f15f19252957d9ca37b424facdbb13afc8da0b05`. Chi tiết giao diện và kiểm tra nằm ở
[contracts.md](../contracts.md); nhận xét dữ liệu độc lập ở
[SC09 backend review](../reviews/sc09-backend-data-review.md).

## 1. Mục tiêu thiết kế

Smart contracts giữ các điều kiện chi tiền ở on-chain: proposal hợp lệ, voting
power đã chốt, quorum/kết quả đạt, hết timelock và request chưa được thanh toán.
Database/dashboard giúp đọc lịch sử, không có quyền thay các điều kiện này.
TV1 phụ trách hành vi contract và chuẩn ABI; TV2 phụ trách dữ liệu/API; TV3 phụ
trách wallet/UI; TV4 phụ trách deployment, attack/invariant và acceptance evidence.

## 2. Kiến trúc và lý do tách năm contract

GovernanceToken giữ quyền biểu quyết; BudgetToken là tiền mô phỏng BUD; Governor
quản lý quyết định tập thể; Timelock quản lý thời điểm thực thi; Treasury giữ quỹ
và kiểm tra payment. [Architecture và sequence diagrams](../contracts.md#năm-contract-và-nguồn-chân-lý)
cho thấy hai giao dịch queue/execute riêng sau voting.

Governor không có quyền chi trực tiếp Treasury. Sau vote, Governor schedule
operation ở Timelock; khi đủ thời gian, một user gửi execute qua Governor,
Timelock mới gọi Treasury. Tách quyết định, thời gian và custody giúp tránh
đường gọi tắt: Treasury chỉ tin Timelock có SPENDER_ROLE; user gọi Governor
không trở thành executor của Timelock. Timelock tạo khoảng chờ quan sát, không
tạo cơ chế emergency cancel sau Pending hoặc tự động thực thi proposal.

## 3. Hai token và quyền biểu quyết lịch sử

GOV fixed supply1.000, constructor chia A/B/C/D=400/300/200/100. BUD fixed
supply20.000, mint cho funding account; script chuyển10.000 vào Treasury sau audit.
Cả hai dùng18 decimals, không public mint. BUD là token demo không phí, không
phải native ETH trả gas hoặc tiền thật.

GOV dùng ERC20Votes và ERC-6372 timestamp. Holder phải delegate (có thể cho chính
mình) để tạo voting power. Delegation không chuyển tokens. Governor đọc power tại
timestamp snapshot S; thay token/delegate sau S không sửa lịch sử S. Vì nhiều
update cùng timestamp có thể cùng checkpoint, đúng S vẫn Pending, chỉ sau S mới
Active. Threshold50 GOV dùng past votes tại clock−1, không chỉ current balance.

## 4. Governor và proposal lifecycle

Governor ghép các module OZ5.4.0 đã khóa. Proposal MVP chỉ có một action gọi
Treasury.disburse(requestId,recipient,amount), native value0, payload100 bytes,
recipient khác zero/Treasury và amount>0. Giới hạn được kiểm trong `_propose`,
kể cả khi bỏ qua UI; role/settings proposal không được chấp nhận.

Voting delay60s, period300s; quorum20% past supply =200 GOV với demo. For+Abstain
phải đạt quorum và For>Against. Mỗi voter chỉ vote một lần. Ở deadline vẫn Active;
sau deadline mới Succeeded/Defeated. Creator chỉ hủy được Pending. Thành công
voting không trả tiền: cần queue rồi chờ timelock120s, execute từ ETA trở đi.
Ready là operation condition trong Queued, không Governor state mới; execute
revert không tạo state Failed. State transition theo clock có thể không có log.

## 5. Timelock và phân quyền

Final graph: Treasury admin/spender=Timelock; Timelock admin=self,
proposer/executor/canceller=Governor; deployer renounce cả hai bootstrap admin.
Không open zero-address executor và không private disbursement path của deployer.
Bất kỳ ví có gas đều gọi queue/execute qua Governor khi hợp lệ; ví đó không được
schedule/execute/cancel trực tiếp Timelock.

Bootstrap là giai đoạn rủi ro cao vì admin có thể cấp quyền. Script hiện hành
audit source/config/role-admin graph và toàn lịch sử operations trước renounce,
audit final trước funding. Chỉ nhìn role holders cuối chưa đủ: operation đã
schedule có thể tồn tại sau revoke. Clean bootstrap không có operation như vậy.
Source security đã accepted được giữ nguyên, không re-audit chỉ để viết báo cáo.

## 6. Treasury và kế toán

Treasury kiểm role, recipient/amount, paidRequests và balance; ghi paid trước
SafeERC20 transfer. RequestId được tạo trước proposal; nhiều proposal được phép
dùng cùng request, kể cả zero, nhưng chỉ một payment thành công. Nếu thiếu BUD
hoặc transfer revert, toàn bộ flags/balances/outer execution rollback. Top-up rồi
explicit retry cùng operation vẫn được nếu chưa có payment thành công.

Proposal không reserve funds. Hai khoản7.000 và6.000 có thể cùng thắng vote khi
quỹ10.000, nhưng thứ tự execute quyết định khoản nào đủ thanh khoản. Điều này
giải thích cần phân biệt proposed/queued amounts với executed amounts và balance.
Demo chi1.000 từ quỹ10.000 phải còn9.000, recipient tăng1.000.

## 7. What-if: công cụ khám phá có giả định

Engine TypeScript và read-only adapter ở Draft PR62/source
`d4a0fb563e66be951760167a6f62b246821dc17c`, **chưa nằm trong Dev này**. SC06
chính thức là ABI/receipt handoff; không đánh đồng với feature What-if mới.

Core chạy sequential execute/top-up steps trên initial balance/paid requests,
dùng bigint và explicit executionAllowed. Success trừ balance và đánh dấu paid;
failure giữ nguyên; top-up không tự làm proposal eligible. Output là hypothetical
trace, không receipt. Conservation: initialBalance+appliedTopUps=finalBalance+disbursed.
Với quỹ10.000, thứ tự7.000→6.000 để lại3.000; đảo thứ tự để lại4.000. Thêm3.000
rồi retry khoản6.000 sau7.000 có thể cho final0 theo giả định.

Adapter chỉ đọc pinned chain/H/hash, trusted Treasury/BUD runtime identities,
balance và paid flags của supplied requests. Không dự đoán voting, roles/ETA,
gas, future balance/finality hoặc funding feasibility. Differential dùng production
Treasury trong **Foundry VM**, không Anvil receipt/live RPC; adapter tests dùng
**synthetic RPC**, chưa live adapter acceptance. Chưa có production API/UI bridge
của feature này; không dùng simulate để gửi transaction hay cấp quyền execute.

## 8. Review dữ liệu TV2 tại cùng H

TV1 đã đọc ingestion/RPC/storage, projection/rebuild, SQL và read API. Voting
snapshot S khác block checkpoint H và API publication/cache. TV2 dùng timestamp
header H để derive state; historical calls ghim EIP-1898 canonical hash, đối chiếu
Governor state/votes/quorum, Timelock timestamp và BUD balance tại cùng H.
Snapshot/deadline của proposal lấy từ canonical ProposalCreated, không current time.

Projection rows và publication checkpoint commit atomically; API đọc snapshot
REPEATABLE READ gắn H/hash/revision/scope. Recovery đóng serving gate trước RPC
search, xóa orphan suffix/replay; deep fork yêu cầu DB rebuild. API không là
cryptographic chain proof hoặc instantaneous reorg detector; user vẫn preflight chain.

Transfer của configured BUD là nguồn tính dòng tiền. BudgetDisbursed nối đúng
Transfer với request/proposal/operation cùng transaction; CallExecuted và
ProposalExecuted xác nhận governance, không là thêm khoản chi. Ledger model/SQL/
API cùng tránh cộng Transfer+BudgetDisbursed thành2.000 cho payment1.000.
Disposition: **SC09 DATA REVIEW ACCEPTED — SCOPED TO REVIEWED SOURCE**; xem
[matrix và limitations](../reviews/sc09-backend-data-review.md), không thay peer review PR này.

## 9. Invariants và bằng chứng kiểm thử

INV01: request trả tối đa một lần. INV02: payout đúng governance path/delay/final
roles. INV03: BUD balance bằng vào−ra. INV04: snapshot weights/tallies không bị
token changes sau snapshot làm vượt past supply. INV02 phụ thuộc clean bootstrap;
Treasury chỉ có thể enforce spender role, không tự kiểm Governor vote history.

Current Dev CI log đã đọc: [run46151182866](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46151182866)
Foundry182/0/0, trong đó integration40; SC06 versioned32/0/0. Governance invariant
4 properties chung100×50=5.000calls, không20.000; ghost expected state độc lập,
non-vacuity đòi successful execution. Bounded model5voters/4recipients/16requests/
max24proposals không chứng minh mọi strategy/signature/ERC1271/role-transition epoch.
Counter sequence cuối không là aggregate coverage. Đây không formal proof.

QA05 historical disposition188PASS thuộc184+4cases trên hai source riêng, cộng
10Ready(single)N/A; không là188tests vừa chạy trên Dev. Same-H BE06 historical
e4c3ce4 giữ H67/hash riêng, 6proposals/9votes/2payments và13.000in−12.000out=1.000;
hai rebuilt targets equal kể cả sau head73. Current BE06 CI còn xác nhận unit5/DB1
và live phase job success. Tất cả counts/SHA/links ở review; không cộng các campaigns.

Đợt SC09 chỉ source/evidence/documentation checks; không rerun accepted full
Foundry/attack/invariant/BE06/BE08/MetaMask. Evidence lịch sử, failure và checksums
không bị sửa hoặc nâng thành testnet acceptance.

## 10. Tái lập và giới hạn còn lại

Clone đúng reviewed SHA, init recursive submodules, Node24.15.0/npm lock,
Foundry1.8.5/solc0.8.37, OZ5.4.0/forge-std1.17.0, optimizer200/EVM Osaka.
[`contracts.md`](../contracts.md#tái-lập--nfr05) ghi actual commands build/ABI
export-check/local deploy/check-roles và smoke tự own Anvil. Không sửa ABI bằng
tay, không copy wallet secrets, không dùng local Anvil accounts trên Sepolia.

MVP không chống Sybil hoặc mọi mua voting power trước snapshot, không reserve
ngân sách hoặc bảo đảm future balance. K confirmations không đồng nghĩa consensus
finality; API response latency không gồm thời gian blockchain confirmation.
Issue19 đã completed với **historical HTTP503 documented residual limitation**;
original packet/logs missing, root cause UNKNOWN. Không điều tra lại trong SC09.

SC10: [TV4 dung0611 đã nhận owner/operator và source chuẩn bị e17ef61](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7240590072).
Sepolia11155111/PublicNode/K2,0,12ETH/cap1gwei mới là planning; chưa public map,
custody6signers/caller path, funder/balances/actual-map estimates/final budget và
explicit user+owner broadcast authorization. Chưa actual deployment hoặc real-time
Executed/Defeated; **không SC10/testnet PASS**. SC09 chỉ đóng phần tài liệu sau
bàn giao PR; peer acceptance cần TV2/TV4 xác nhận. Không tự merge/main/tag/release.
