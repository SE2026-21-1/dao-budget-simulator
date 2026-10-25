# SC05 — Timelock và quyền sau bootstrap

TV1 bàn giao thiết kế quyền và kiểm thử tích hợp Foundry; TV4 sở hữu deploy/seed/check-roles,
manifest, vận hành local/testnet và kiểm thử độc lập. Không tạo custom Timelock hoặc sửa SC01–SC04.
Base: origin/Dev ff26697, chứa commit SC04 f57fcfd qua PR #13 và công việc TV4 qua PR #5.
Căn cứ FR07–FR08, BR03–BR07, NFR01/NFR08, TC01/06/07/09/10/14 và INV01–INV03.

## Kiến trúc và ranh giới quyền

User propose/vote qua BudgetGovernor → Succeeded → user queue qua Governor →
Timelock.scheduleBatch → chờ minDelay 120 giây → user execute qua Governor →
Timelock.executeBatch → Treasury.disburse → BUD.transfer → recipient.

Bất kỳ ví nào có gas được queue/execute qua Governor khi hợp lệ, không cần GOV hoặc là proposer.
Timelock thấy msg.sender là Governor; Treasury thấy msg.sender là Timelock. Quyền công khai ở
Governor không có nghĩa quyền schedule/execute Timelock hoặc disburse Treasury được mở công khai.
Chỉ thành viên đủ past voting power mới propose; voting power snapshot và quorum ở Governor.

Dùng TimelockController OpenZeppelin 5.4.0 nguyên bản với minDelay = 120.
Không triển khai lại delay, operation state hoặc tạo contract Timelock tùy biến.

## Bootstrap và final state

| Contract/role | Bootstrap trong fixture SC05 | Final state bắt buộc |
|---|---|---|
| Treasury DEFAULT_ADMIN_ROLE | deployer và một admin tạm, rồi cấp cho Timelock | chỉ Timelock |
| Treasury SPENDER_ROLE | constructor không cấp; fixture cố ý cấp tạm cho hai bootstrap để kiểm cleanup | chỉ Timelock |
| Timelock DEFAULT_ADMIN_ROLE | Timelock tự giữ, deployer được cấp bởi constructor; fixture thêm admin tạm | chỉ Timelock |
| Timelock PROPOSER_ROLE | arrays ban đầu rỗng; fixture cấp tạm rồi cấp Governor | chỉ Governor |
| Timelock EXECUTOR_ROLE | arrays ban đầu rỗng; fixture cấp tạm rồi cấp Governor | chỉ Governor |
| Timelock CANCELLER_ROLE | arrays ban đầu rỗng; fixture cấp tạm rồi cấp Governor | chỉ Governor |

Các grant tạm spender/proposer/executor/canceller chỉ phục vụ kiểm thử thu hồi nhiều tài khoản.
TV4 KHÔNG cần tạo những grant tạm này trong deploy thật; giữ bề mặt quyền bootstrap tối thiểu.
Không có public executor address(0), không cấp Treasury spender cho Governor hoặc deployer cuối cùng.
Trong Timelock, EXECUTOR_ROLE của zero mở quyền execute cho mọi người; phải từ chối cấu hình đó.
Trong Treasury AccessControl chuẩn, zero role không tự mở cho mọi ví nhưng vẫn bị cấm trong final matrix.

## Trình tự deploy/cấp quyền cho TV4

1. Deploy GovernanceToken(A,B,C,D), kiểm bốn ví khác zero/đôi một khác nhau, phân bổ 400/300/200/100.
2. Deploy BudgetToken(fundingWallet), kiểm 20.000 BUD, fundingWallet giữ toàn bộ.
3. Deploy Treasury(bud, bootstrapAdmin), chưa nạp BUD; bootstrapAdmin chỉ là admin ban đầu.
4. Deploy TimelockController(120, [], [], bootstrapAdmin); contract tự có DEFAULT_ADMIN_ROLE.
5. Deploy BudgetGovernor(gov, treasury, timelock). Không có vòng phụ thuộc constructor.
6. Bootstrap gọi timelock.grantRole(PROPOSER_ROLE, governor), grantRole(EXECUTOR_ROLE, governor),
   grantRole(CANCELLER_ROLE, governor). Arrays proposer rỗng nên không dựa vào grant canceller tự động.
7. Bootstrap gọi treasury.grantRole(SPENDER_ROLE, timelock) và grantRole(DEFAULT_ADMIN_ROLE, timelock).
8. **Preflight bắt buộc trước thu hồi quyền/renounce:** kiểm chainId/manifest/receipt, bytecode cả
   năm contract, liên kết constructor, minDelay=120, admin graph getRoleAdmin và lịch sử quyền/operation
   theo checklist dưới đây. Holder tạm phải nằm trong danh sách bootstrap được duyệt, có kế hoạch revoke;
   không chấp nhận holder không rõ nguồn gốc, public executor hoặc thiếu final role.
9. Sau preflight đạt mới revoke mọi role tạm: Treasury spender/admin và Timelock
   proposer/executor/canceller/admin. Giữ bootstrap admin cuối cùng cho đến khi kiểm tra lần nữa:
   final roles đầy đủ, chỉ còn bootstrap admin được duyệt ngoài final matrix, operation history sạch.
   Renounce admin không tự xóa các role khác.
10. Chỉ khi kiểm tra trước renounce đạt, bootstrap admin cuối cùng gọi
    treasury.renounceRole(DEFAULT_ADMIN_ROLE, bootstrapAdmin) và
    timelock.renounceRole(DEFAULT_ADMIN_ROLE, bootstrapAdmin).
    callerConfirmation phải bằng người gọi. Nếu preflight lỗi: dừng, chưa funding, giữ quyền để sửa
    hoặc redeploy; không renounce rồi mới phát hiện cấu hình sai.
11. Sau renounce audit lại toàn bộ final role matrix, admin graph, địa chỉ/code/config và operation
    history tại cùng block H/hash. Không đạt thì không funding/bàn giao.
12. Chỉ sau final audit đạt mới fundingWallet.transfer(treasury, 10000 * 10^18), còn 10.000 BUD.
13. Các ví demo tự delegate GOV, chờ checkpoint thành quá khứ; lưu manifest và audit sau seed.

Deployer mất admin thì không thể grant lại spender/proposer hoặc revoke quyền Governor. Deployer
không có đường chi riêng. Timelock tự quản admin nhưng Governor chỉ cho proposal disburse:
MVP không có đường governance để đổi role, settings hoặc minDelay; muốn đổi cấu hình phải redeploy.
Không mở thêm admin EOA để giải quyết giới hạn này. Phải phân biệt khóa cấu hình có chủ đích với lỗi deploy.

## Kiểm tra hậu triển khai/check-roles

Dev đã có scripts/deploy_local.mjs, scripts/check_roles.mjs và scripts/export_local_handoff.mjs của TV4.
SC05 không sửa hoặc thay thế những script này, không chạy deployment trong đợt triển khai test này.
TV4 chạy tại môi trường được cho phép; không dùng địa chỉ fixture synthetic làm địa chỉ thật.

Các lời gọi bắt buộc ở cùng H:

| Kiểm tra | Giá trị mong đợi |
|---|---|
| RPC eth_chainId | bằng chainId manifest/mạng đã chốt |
| eth_getCode từng địa chỉ | có code, khớp source/build/runtime/constructor của manifest |
| governor.token() | địa chỉ GovernanceToken đã xác minh |
| governor.treasury() | Treasury đã xác minh |
| governor.timelock() | TimelockController đã xác minh |
| treasury.budgetToken() | BudgetToken đúng source SC02, không chỉ name/symbol/code.length |
| timelock.getMinDelay() | 120 |
| treasury.getRoleAdmin(SPENDER_ROLE), getRoleAdmin(DEFAULT_ADMIN_ROLE) | DEFAULT_ADMIN_ROLE |
| timelock.getRoleAdmin(các role trong matrix) | DEFAULT_ADMIN_ROLE |
| hasRole từng holder/candidate | khớp đúng final matrix |
| governance config | threshold 50 GOV, delay 60, period 300, quorum 20%, mode=timestamp |
| token supply/decimals/số dư sau seed | 1.000 GOV, 20.000 BUD, 18 decimals, Treasury/funder 10.000/10.000 |

Để chứng minh KHÔNG có holder thừa, không chỉ kiểm vài địa chỉ quen thuộc:

1. Xác minh deployment block/chainId/địa chỉ trong manifest bằng receipt và bytecode.
2. Quét RoleGranted/RoleRevoked từ deployment block của TỪNG contract đến H, gồm constructor events.
3. Sắp theo blockNumber/transactionIndex/logIndex; replay set holders cho mỗi (contract, role).
4. Theo dõi RoleAdminChanged; xác minh admin graph vẫn như matrix, không bỏ qua role lạ.
5. Với mọi account từng xuất hiện (kể cả đã revoke), gọi hasRole(role, account) tại H, đối chiếu replay.
6. So sánh toàn bộ holder set với matrix, kiểm zero/EOA/deployer/temp/Governor/Treasury trái vai trò.
7. Lưu H/hash, commit, ABI/build hash, event range và kết quả. Log thiếu/lỗi RPC/historical call không có
   thì fail closed hoặc chưa xác minh; không suy tính duy nhất từ hasRole vài ví.

Bộ test SC05 record toàn bộ bootstrap logs, replay từng grant/revoke rồi so với hasRole và matrix trước
khi nạp BUD; cố ý có hai bootstrap accounts đã từng giữ nhiều role. Đây là lịch sử đầy đủ của fixture
Foundry, không tự chứng minh lịch sử deployment ngoài fixture.

Ví dụ checker TV4 đã có (chỉ đọc, manifest thật do TV4 cấp):

```bash
node scripts/check_roles.mjs --rpc http://127.0.0.1:8545 --manifest /path/to/dao-local-manifest.json
```

Manifest cần source commit, chainId, từng address/deploymentBlock/deployment receipt,
compiler/dependency/ABI/runtime hashes, cấu hình governance, scanFromBlock và chính sách confirmations.
Không commit private key/RPC secret; môi trường local dùng account thử nghiệm riêng, không dùng tiền thật.
Không tạo lại env/deploy infrastructure trong SC05; TV4 review và vận hành script của mình.

## Acceptance criteria bắt buộc TV4 thực hiện trước demo

SC05 không sửa script TV4. TV4 cần đưa các gate dưới đây vào quy trình/script của mình; checker chỉ
chạy sau renounce không thay thế được preflight. Mỗi gate phải lưu block H/hash và báo lỗi rõ ràng.

- Trước cleanup/renounce: RPC chainId khớp manifest; đủ receipt/deployment block cả năm contract,
  xác minh runtime bytecode với build OpenZeppelin 5.4.0/Solidity đã chốt, xử lý immutable/constructor
  khi đối chiếu. Chỉ code.length > 0 hoặc name/symbol token là chưa đủ.
- Đọc đủ governor.token/treasury/timelock, treasury.budgetToken; khớp manifest và dependency đã xác minh.
  Kiểm minDelay=120, threshold/delay/period/quorum/clock, phân bổ GOV/BUD.
- getRoleAdmin của DEFAULT_ADMIN_ROLE ở cả hai contract và của SPENDER/PROPOSER/EXECUTOR/CANCELLER
  đều bằng DEFAULT_ADMIN_ROLE. Quét RoleAdminChanged từ constructor; bản MVP không có thay đổi này.
- Replay toàn bộ RoleGranted/RoleRevoked, kể cả role/account lạ, đối chiếu hasRole ở H. Trước cleanup
  chỉ cho phép final holders cộng danh sách bootstrap đã duyệt; trước renounce chỉ còn admin cuối cùng
  ngoài final matrix. Zero executor bị cấm ở mọi gate bàn giao.
- Quét **CallScheduled, Cancelled, CallExecuted** từ block deploy Timelock đến H theo thứ tự log.
  Lập tập operationId, kiểm hash batch/single, payload/salt/predecessor/ETA và getOperationState ở H.
  Phải giải trình mọi operation, bao gồm operation Done; không để operation bất thường Waiting/Ready.
  Chính sách an toàn mặc định của bootstrap mới: **không có operation nào được schedule**.
  Nếu có lịch sử bất thường: dừng và điều tra, xử lý khi còn quyền hợp lệ hoặc redeploy; không coi
  revoke proposer hay Cancelled riêng lẻ là bằng chứng toàn bộ lịch sử đã sạch.
- Preflight thất bại phải chặn cleanup/renounce/funding. Sau cleanup kiểm lại trước renounce;
  sau renounce kiểm lại final matrix và operation history; chỉ funding khi gate cuối đạt.
- Log/RPC không đầy đủ, reorg hoặc H không nhất quán: chưa đạt. Lưu audit artifact không chứa secret.
  Chạy local deploy/role-check/smoke E2E và giao manifest thật cho TV1/TV2/TV3 trước demo.

Helper Foundry kiểm tra chainId local 31337, code tồn tại, liên kết, minDelay, final roles cùng bootstrap
admin cuối cùng, admin graph và toàn bộ log fixture. Nó không xác minh manifest/receipt/hash runtime
trên mạng thật. Negative controls thực sự deploy cấu hình thiếu executor, cấp role cho holder lạ/zero,
đổi minDelay thành 121, đối chiếu sai BUD và đổi chainId; mọi trường hợp lỗi giữ bootstrap admin,
Treasury chưa được funding. Log RoleAdminChanged giả lập chỉ kiểm khả năng auditor phát hiện input
bất thường; không tuyên bố production Timelock có hàm sửa admin graph.

## M-01 — Operation tồn đọng vẫn tồn tại sau revoke

Test testStaleBootstrapOperationExecutesSucceededWithoutGovernorQueue tái hiện thành công:
bootstrap account có PROPOSER_ROLE schedule batch đúng payload/salt, sau đó bị revoke; final role
matrix vẫn đúng. OperationId được hash độc lập từ arrays, predecessor=0 và salt Governor.
Operation có ETA=10121 trong fixture; sau voting, proposal Succeeded và proposalEta=0 (chưa queue),
operation đã Ready. Gọi Governor.execute thành công: proposal Executed, operation Done (timestamp=1),
paidRequests=true, Treasury từ 10.000 xuống 9.000 BUD, recipient từ 0 lên 1.000 BUD.
OperationId cụ thể được log trong test; không dùng địa chỉ/hash fixture làm dữ liệu deployment thật.

Đúng với OpenZeppelin 5.4.0: Governor.execute chấp nhận Succeeded hoặc Queued;
GovernorTimelockControl._executeOperations gọi executeBatch bằng payload/salt, không bắt buộc đã có
_timelockIds do Governor.queue tạo. TimelockController.revokeRole chỉ đổi quyền, không xóa timestamp
operation. **Revoke role không tự động hủy operation đã schedule.**

Kịch bản không bỏ qua voting hoặc minDelay đã trôi qua, nhưng bỏ qua queue mới và 120 giây chờ
SAU voting. Đây là điều kiện bootstrap phải ngăn bằng operation audit, không phải lỗi cần sửa
production contract trong phạm vi thiết kế hiện tại. Nếu đã renounce và không còn đường cancel hợp lệ,
không giả định có recovery: redeploy cấu hình sạch. Không mở admin hoặc public executor để khôi phục.

Test clean bootstrap chứng minh: Succeeded nhưng không có operation thì execute revert, state/số dư/
paidRequests không đổi; queue mới tạo ETA=now+120 rồi execute đúng hạn. Test preflight operation tồn
đọng thất bại trước renounce. Helper chọn chính sách nghiêm ngặt: gặp CallScheduled là từ chối,
kể cả operation sau đó được cancel; việc diễn giải lịch sử phức tạp hơn thuộc checker TV4.

## Queue, ETA và operationId — bàn giao TV2/TV3

OpenZeppelin GovernorTimelockControl dùng batch ngay cả khi proposal có đúng một action:

```text
descriptionHash = keccak256(bytes(description nguyên bản))
proposalId = uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)))
salt = bytes32(bytes20(address(governor))) XOR descriptionHash
predecessor = bytes32(0)
operationId = timelock.hashOperationBatch(targets, values, calldatas, predecessor, salt)
```

bytes20 khi mở rộng sang bytes32 được padding bên phải. Không dùng salt=descriptionHash,
không dùng hashOperation(single) để thay hashOperationBatch, không hash lại file fixture/serialize JSON.
requestId nằm trong disburse calldata; một request có thể thuộc nhiều proposal khác ID/operation.

Queue thành công phát CallScheduled(id,index=0,target=treasury,value=0,data,predecessor,delay=120),
CallSalt khi salt khác zero và ProposalQueued(proposalId,eta). ETA=timestamp block queue+120.
Quorum đã đủ không tự chi và queue không giữ chỗ quỹ. Quét event theo emitter/address đã xác minh.

Operation: Unset → Waiting → Ready → Done. Ready khi block.timestamp >= ETA và chưa Done.
isOperationPending bao gồm Waiting và Ready; getTimestamp giữ ETA khi chưa xong, khi Done trả marker 1.
Không lấy marker 1 làm ngày thực thi; lấy execution block timestamp/receipt. Governor.proposalEta giữ ETA.
Governor vẫn Queued khi operation Ready; UI hiển thị “Queued — sẵn sàng thực thi”.

User bất kỳ gọi Governor.queue(targets,values,calldatas,descriptionHash), rồi đọc proposalEta(id),
timelock.getTimestamp(operationId), isOperationReady/isOperationDone. Queue Pending/Active/Defeated/
Canceled bị từ chối; queue lại Queued bị từ chối. Thời gian quyết định lấy từ chain, không từ máy/trình duyệt.

User bất kỳ gọi Governor.execute với đúng arrays/hash. Trước ETA, TimelockUnexpectedOperationState
revert; tại ETA và sau ETA được nếu còn điều kiện khác. Không gọi trực tiếp Timelock từ ví.
Thứ tự log thực thi: BUD Transfer → Treasury BudgetDisbursed → Timelock CallExecuted → Governor ProposalExecuted.
TV2 liên kết cùng txHash/emitter/logIndex/action index, decode request/recipient/amount từ calldata và event;
BUD Transfer là nguồn dòng tiền, BudgetDisbursed chỉ metadata liên kết, không tính chi lần hai.
ABI TimelockController.json trích từ compiler để decode event và custom errors, không chỉnh bằng tay.

Nếu thiếu quỹ/transfer lỗi: toàn bộ execute revert, không có log thành công trong canonical receipt,
proposal vẫn Queued, operation vẫn Ready/ETA không đổi, paidRequests false. Nạp BUD và retry cùng
arrays/hash/operation, không queue lại hoặc tạo proposal mới. Không tạo proposal state Failed.
Nếu request đã trả bởi proposal khác, paidRequests true và operation thứ hai vẫn Ready khi revert;
nạp thêm không cho phép trả request đó lần hai. Hai request khác nhau tranh quỹ thì request thiếu tiền retry được.

## Kiểm thử local và giới hạn

Fixture tests/integration/TimelockGovernance.t.sol deploy đủ năm contract thật, cleanup toàn bộ bootstrap
trước seed, không impersonate Timelock cho thanh toán thành công. vm.prank chỉ mô phỏng các EOA
thực hiện deploy/grant/renounce/propose/vote/queue/execute; impersonate Governor duy nhất trong test
âm để xác nhận Governor KHÔNG có Treasury spender, không phải bằng chứng người dùng vượt quyền.
Các attack/invariant của TV4 được giữ nguyên và chạy regression, không sửa test của thành viên khác.

| Yêu cầu | Bằng chứng SC05 |
|---|---|
| FR07 | Queue đúng state, user không GOV queue được, event/ETA/batch operation, không chi lúc queue |
| FR08/TC01 | A+B = 700 For, quorum 200; execute 1.000 tại ETA, Treasury còn 9.000 |
| TC06/TC14, NFR08 | Role matrix/history, nhiều bootstrap accounts, direct calls/grant/revoke/renounce/updateDelay bị chặn |
| TC07 | Ngay sau queue/ETA-1 revert; tại ETA/ETA+1 thành công; replay/tamper bị chặn |
| BR05/TC09 | Thiếu 1.000 rồi nạp/retry cùng operation; hai request tranh 10.000 và retry |
| TC10/INV01 | Hai proposal khác nhau cùng requestId chỉ thanh toán một lần |
| INV02/NFR01 | Thành công chỉ qua Governor → Timelock → Treasury sau đủ voting/delay trong fixture final roles |
| INV03 | Số dư/quỹ vào/tiền ra và totalSupply bảo toàn; regression invariant TV4 kiểm nhiều chuỗi |

```bash
forge fmt
forge build
forge test --match-path 'tests/integration/TimelockGovernance.t.sol' -vv
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261023 forge test -vv
python3 scripts/check.py
forge fmt --check
git diff --check
```

Profile ci giữ fuzz=256, invariant runs=100/depth=50 (tối thiểu requirement), không sửa foundry.toml.
Nếu Foundry chưa trong PATH, thêm thư mục cài vào PATH của terminal; không đổi toolchain hoặc dependency.
Suite đầy đủ gồm test/attack/invariant đã có trên Dev, không chỉ test SC05 mới.

Chưa chạy deployment/testnet trong đợt này, chưa có audit độc lập source/bytecode deployment mới,
chưa chứng minh frontend ví/API E2E, indexer reorg/rebuild hoặc mọi token/malicious wallet.
Không coi unit/integration pass là chứng nhận an toàn tuyệt đối hay nghiệm thu tất cả NFR08.
Rủi ro bootstrap trước renounce và cấu hình nhầm token/Timelock phải được TV4 kiểm trước funding.
MVP không có emergency cancel sau Pending, không proxy upgrade và không thay role qua proposal.

## Kết quả kiểm tra thực tế — 23/10/2026

Bổ sung sau review M-01/M-02/L-01: 11 test mới (27 → 38). Thứ tự fixture nay có preflight
trước renounce, audit final sau renounce rồi mới funding. Kết quả regression mới ghi bên dưới.

- Nhánh feature/tv1-sc05 từ Dev ff26697; f57fcfd đã có trong lịch sử Dev, working tree sạch trước tạo nhánh.
- Foundry 1.8.5/Solidity 0.8.37/OpenZeppelin 5.4.0, giữ EVM osaka và dependency lock.
- forge fmt file test mới và forge fmt --check toàn repo: đạt.
- forge build: thành công. Ban đầu shell không có forge trong PATH; dùng binary đã cài tại
  /home/nvdungmim/.foundry/bin, không cài/nâng cấp toolchain. Lỗi Vm.Log trong abi.decode của test
  được sửa sang VmSafe.Log theo nơi định nghĩa struct của forge-std; không đổi contract production.
- Test tích hợp SC05: 38 passed, 0 failed, 0 skipped; hai fuzz test chạy 256 trường hợp mỗi test.
- Toàn bộ forge test -vv với FOUNDRY_PROFILE=ci, FOUNDRY_FUZZ_SEED=0x20261023:
  180 passed, 0 failed, 0 skipped, 9 suites (bao gồm test/attack/invariant TV4).
- Hai campaign invariant: Treasury 100×50=5.000 handler calls, Governance 100×50=5.000 handler calls;
  các invariant checks được Foundry nhóm theo campaign, không nhân tổng calls với số invariant.
- Log counter sau Governance campaign thuộc trạng thái chuỗi cuối, không phải aggregate toàn 100 runs;
  test pass không chứng minh random-only liveness hoặc mọi trạng thái đã được random phủ đủ.
- python3 scripts/check.py: ABI/fixture SC01 đạt; cast dùng từ thư mục Foundry đã cài trong PATH.
- git diff --check và whitespace riêng các file mới: đạt.
- shared/abi/TimelockController.json lấy trực tiếp ABI compiler (46 entries); không chỉnh bằng tay.
- Source contract và test SC01–SC04, backend/frontend/script/CI của TV2/TV3/TV4 giữ nguyên.
- Không có lỗi production contract cần sửa; compiler cảnh báo keyword tương lai trong OpenZeppelin
  và lint timestamp/typecast ở Governor, invariant TV4 và timestamp trong helper fixture SC05;
  không che các cảnh báo đó.

SC05 đủ điều kiện commit/peer review về thiết kế và kiểm thử Foundry local. Chưa tự commit, push hoặc
mở PR. Chưa chạy mới deploy/role checker/smoke/testnet của TV4 trong đợt này; không lấy kết quả unit
hoặc invariant làm bằng chứng deployment/testnet/consumer E2E đã được nghiệm thu.
