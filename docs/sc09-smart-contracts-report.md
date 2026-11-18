# SC09 — Phần Smart Contracts bàn giao báo cáo nhóm (#44)

## Nguồn và phạm vi sử dụng

Nhóm trưởng có thể dùng phần mô tả và bảng truy vết dưới đây cho
[issue #44](https://github.com/SE2026-21-1/dao-budget-simulator/issues/44).
Source kiểm chứng ngày 11/11/2026 của PR #21 là
`d8f8743179d7748d0e05499646b5d9322820c782`; Dev vẫn
`87738d3f792c3a283a52b5c18c306809d6cfcfd4`.
Base bàn giao tài liệu hiện tại `105f2ba4bebc2e6b761027eb01792c521875ec07` chỉ thêm docs/evidence
so với source kiểm chứng trên. Đây là bàn giao tài liệu TV1, chờ TV4 review tích hợp, không là approval PR hoặc release.

Production contracts/ABI và unit/integration/invariant tests không đổi từ revision peer
`ff484fbe95519cf2079e3dabda43e456a2c55fe6`.
Delta QA05 tại `b7a74ce4f5a7336a992b39310fb9d569831176d3` thêm tests/runner TV4;
`d8f8743` công bố evidence. [Coverage SC07](sc07-test-coverage.md) ghi test functions,
assertions và SHA; [contract reference](contracts.md) ghi interface/roles/configuration.

## Nội dung Smart Contracts cho báo cáo

DAO Budget Simulator dùng năm contracts: GovernanceToken lưu GOV và timestamp checkpoints;
BudgetToken là BUD ERC20 cố định, không phí; BudgetGovernor kiểm proposal/voting/quorum;
TimelockController OpenZeppelin 5.4.0 giữ operation và thời gian chờ; Treasury giữ BUD,
kiểm quyền, số dư và requestId trước khi chuyển tiền. API/database không quyết định quyền chi.

GOV có 18 decimals, tổng 1.000, phân bổ A/B/C/D = 400/300/200/100. BUD có 18 decimals,
mint một lần 20.000 cho funding wallet; sau audit quyền, funding chuyển 10.000 vào Treasury.
Ngưỡng propose là 50 GOV đã delegate theo checkpoint quá khứ. Voting delay 60 giây,
period 300 giây, quorum 20% tổng cung tại snapshot; For + Abstain tính quorum, For > Against
mới thắng. Token transfer/delegate sau snapshot không sửa trọng số của proposal đó.

Mỗi proposal chỉ chứa một Treasury.disburse(requestId, recipient, amount), native value 0,
recipient khác zero/Treasury và amount dương. Proposal thành công không tự trả tiền:
người dùng queue qua Governor rồi execute sau Timelock 120 giây. Treasury chỉ cho Timelock
chi; requestId đã trả không được trả lần hai. Không giữ chỗ ngân sách: thiếu tiền lúc execute
revert toàn bộ, operation vẫn retry được sau topup. Creator chỉ cancel Pending.

Final roles: Treasury admin/spender chỉ Timelock; Timelock proposer/executor/canceller chỉ
Governor, admin chỉ chính Timelock, không public executor tại zero. Deployment local thực hiện
preRenounceRoleCheck → renounce hai bootstrap admin → preFundingRoleCheck → delegation và
checkpoint quá khứ → funding → final roleCheck. Revoke proposer không hủy operation cũ;
operation-history audit bắt buộc loại lịch sử bootstrap bất thường trước bàn giao quyền.
Sau renounce, whitelist MVP không có đường đổi role/settings; sai cấu hình có thể phải redeploy.

Vòng đời: Pending → Active → Succeeded → Queued → Executed; nhánh Defeated/Canceled.
Tại S vẫn Pending; S+1 Active; D còn Active; D+1 xét kết quả. Ready là trạng thái operation
khi timestamp >= ETA, không thêm Governor state. Execute revert không tạo state Failed.

Đối chiếu dữ liệu tại cùng chainId/deployment/H/hash: giữ raw receipt/log coordinates, dựng
proposalId từ description bytes nguyên bản, nối requestId từ calldata và operationId từ batch
salt của Governor. BUD Transfer là nguồn ledger; BudgetDisbursed chỉ nối metadata, không cộng
thành hai khoản chi. So balanceOf, proposal state/votes/quorum và operation state tại H, kiểm lại
hash canonical. Các nhánh reset có manifest/hash riêng không được gộp ledger hoặc gán API revision.

## Requirement → issue/PR → test/evidence

Tất cả kết luận dưới đây chỉ phạm vi contract/local được ghi. Requirements lấy từ
[đặc tả nhóm](requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md) và
[phân công TV1](requirements/TV1_Cong_viec_Smart_Contracts.md).

| Requirement/phần việc | Issue/PR bàn giao | Test/evidence | Kết luận và giới hạn |
|---|---|---|---|
| FR02, BR01 — SC02 token/checkpoint | [#8](https://github.com/SE2026-21-1/dao-budget-simulator/issues/8), [PR #10](https://github.com/SE2026-21-1/dao-budget-simulator/pull/10) đã merge | [GOV unit](../tests/unit/GovernanceToken.t.sol), [BUD unit](../tests/unit/BudgetToken.t.sol), [token smoke lịch sử](evidence/sc02-local-smoke.json) tại 9a890a2; integration/peer ff484fb | Contract/local PASS; token-only smoke không chứng minh Treasury hoặc extension wallet. Constructor GOV cho phép duplicate cộng dồn; deployment kiểm distinct accounts. |
| FR03/05/06, BR02/04 — proposal/voting/quorum | [PR #13](https://github.com/SE2026-21-1/dao-budget-simulator/pull/13) đã merge; [#7 mapping](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7) | [Governor 82 tests](../tests/unit/BudgetGovernor.t.sol), [peer evidence](evidence/tv4-20261111-peer-acceptance.json) tại ff484fb | Contract-level PASS; title/body/form/consumer và full reset variants không tự PASS. |
| FR08/09, BR03/05 — Treasury/atomic payment | [PR #11](https://github.com/SE2026-21-1/dao-budget-simulator/pull/11) đã merge; [#16 QA05](https://github.com/SE2026-21-1/dao-budget-simulator/issues/16) | [Treasury 30 tests](../tests/unit/Treasury.t.sol), [integration](../tests/integration/TimelockGovernance.t.sol), [QA05 delta](evidence/tv4-20261111-qa05-variants.json) tại b7a74ce | Contract/local payment/retry/shared request PASS; API/UI từng variant còn PARTIAL. |
| FR07/10, BR06/07, NFR01/08 — roles/Timelock/cancel | [#20 deployment/testnet](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20), PR #21 candidate | [SC05](sc05-timelock-roles.md), [bootstrap tests](../tests/smoke/bootstrap.test.mjs), [15 cancellation tests mới](../tests/attacks/GovernanceAttacks.t.sol), [SC07 mapping](sc07-test-coverage.md) | Local audit/roles và contract boundaries PASS; testnet BLOCKED, full acceptance variants PARTIAL. |
| FR03/04, FR13–16 — SC06 ABI/event/provenance | [PR #39](https://github.com/SE2026-21-1/dao-budget-simulator/pull/39) đã merge nền tảng; [#43](https://github.com/SE2026-21-1/dao-budget-simulator/issues/43), PR #21 fix | [shared ABI](../shared/abi/), [fixture](../fixtures/chain/sc06-v1/README.md), [source9ad0aea proof](evidence/tv4-20261110-project2.json), [32 tests](../tests/sc06-chain.test.mjs) | Canonical/mutation 32/32; peer TV1/TV2 có; TV3 consumer/tích hợp còn riêng. Không ký thay pipeline backend/UI. |
| TC01–TC10/TC14, NFR07 — SC07 | [#7 QA04 mapping](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7), [#16 QA05](https://github.com/SE2026-21-1/dao-budget-simulator/issues/16), PR #21 | [Coverage SC07](sc07-test-coverage.md), TV4 local202/202 và attack21/21 sourceb7a74ce; CI status đúng d8f8743 | Technical PASS / contract-level completed; tài liệu tích hợp chờ TV4 review; full QA05 không được nâng thành PASS. |
| INV01–INV04 — QA06 | [#17](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17), PR #21 | [Ghost oracle](../tests/invariant/GovernanceInvariant.t.sol), [Treasury invariant](../tests/invariant/TreasuryAccounting.t.sol), [test plan](test-plan.md) | PASS bounded đã peer chốt, seed0x20261021/100×50; không phủ mọi strategy, signatures/ERC1271 hoặc API/reorg. |
| SC09/SC10 và báo cáo cuối | [#44](https://github.com/SE2026-21-1/dao-budget-simulator/issues/44), [#20](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20) | Tài liệu này, [contracts](contracts.md), manifest/evidence theo revision đã nghiệm thu | Tài liệu sẵn sàng review; release/testnet chưa nghiệm thu. Không tự tạo tag/video/deadline. |

## Phân biệt các lượt kiểm chứng

- TV4: [peer11/11](evidence/tv4-20261111-peer-acceptance.json) tại ff484fb có 105 canonical
  receipts và 5 reset-demo receipts riêng. [Delta QA05](evidence/tv4-20261111-qa05-variants.json)
  tại b7a74ce có raw local202/202, attack21/21 và bốn TC10 receipt rows độc lập.
- TV1: đã review source/mapping/ABI/archives, tự chạy local deployment/bootstrap tại ff484fb
  và 15 test cancellation mới tại d8f8743 trong các lượt trước. Không trình bày các log cá nhân
  chưa lưu trong repo như artifact bàn giao. Trong đợt documentation này không chạy mới tests.
- CI candidate: [9/9 success](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/42958494472)
  và [BE08 1/1](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/42958494495)
  tại d8f8743 là metadata đã xác minh, không gộp thành lượt local hoặc gán con số raw chưa tải.
- Không dùng Anvil adapter, receipt local hoặc archive RPC đã dừng làm bằng chứng ví extension,
  mạng testnet hoặc service còn sống. Bản báo cáo nhóm phải giữ manifest/SHA/môi trường tương ứng.

## Gate nhóm trưởng cần giữ mở

| Gate | Đầu mối/điều kiện |
|---|---|
| Tích hợp candidate vào Dev | TV2/TV4, #18/#47; CI và acceptance trên revision tích hợp thực tế |
| FE mapping/consumer và extension | TV3, #7/#43/#19/#41; full workflow trên đúng deployment |
| Môi trường nhận/máy khác | #40/#42; restart/rebuild và H/hash có evidence người nhận |
| Testnet | TV4 đã chọn Sepolia/11155111/K=2 và PublicNode; #20 vẫn BLOCKED: signer funded an toàn, remote deploy/check-roles được review, compiled-bytecode/gas checks và Executed/Defeated thời gian thật |
| Release | Nhóm trưởng/TV4, #44: cùng revision/manifest, review thành viên, demo/evidence và giới hạn rõ ràng |

Chỉ chốt phần Smart Contracts đã chứng minh. Không ghi toàn bộ QA05, extension-wallet, testnet
hoặc release PASS từ số lượng tests, CI xanh hoặc mapping đầy đủ.

### Bổ sung testnet cho báo cáo nhóm

Theo [preflight TV4](evidence/tv4-20261111-testnet-preflight.json), network đã được TV4
chọn là Sepolia/11155111, K=2. PublicNode trả chain identity và CLZ read-only như expected;
đó là probe opcode hạn chế, không phải full Osaka/compiled-contract compatibility acceptance.
Báo cáo ghi **0 broadcast, không signer, không deployment**. Không công bố testnet PASS.
Còn thiếu signer owner/funded balance/secure signing, đường remote deployment/check-roles
được review, revision tích hợp được chấp nhận, manifest/receipts và demo thời gian thật.
Giữ #20 BLOCKED; receiving-machine và extension-wallet là các gate riêng.
