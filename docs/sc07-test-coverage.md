# SC07 — Coverage unit test và test biên TV1

## Revision, kết luận và ownership

Đối chiếu ngày 11/11/2026 theo [SC07 trong phân công TV1](requirements/TV1_Cong_viec_Smart_Contracts.md#sc07-hoàn-thiện-unit-test-và-test-biên).
S0 là source đã kiểm chứng của PR #21 `d8f8743179d7748d0e05499646b5d9322820c782`, base Dev `87738d3f792c3a283a52b5c18c306809d6cfcfd4`.
Tài liệu được bàn giao trên base `105f2ba4bebc2e6b761027eb01792c521875ec07` (docs/evidence-only sau S0).
S1 là revision peer `ff484fbe95519cf2079e3dabda43e456a2c55fe6`.
Code unit/integration/invariant và production contracts không đổi từ S1; delta
`b7a74ce4f5a7336a992b39310fb9d569831176d3` thêm tests/runner QA05 của TV4.

**SC07 technical PASS / contract-level completed:** đã có coverage S/S+1, D/D+1,
ETA, vote lặp, thiếu quỹ/retry, tranh số dư và shared requestId; các đường chi có
assert balances/state/error/paidRequests. Không cần thêm test trùng. Tài liệu này
là bàn giao TV1, chờ TV4 review tài liệu tích hợp; không đóng full QA05 hoặc release.

| Lớp | Số lượng tại S0 | Owner và giới hạn |
|---|---|---|
| Unit | GOV 15, BUD 9, Treasury 30, Governor 82, ABI compatibility 2 = **138** | TV1; Treasury unit dùng EOA giả Timelock và Governor unit giữ bootstrap admin để cô lập logic |
| Integration | **40** | File SC05 TV1, có đóng góp bổ sung TV4; dùng graph contracts thật cho final roles/ETA/retry |
| Attack | **21**, gồm 15 cancellation tests mới | TV4; không nhận thành tests TV1 |
| Invariant | INV01–INV04 bounded và Treasury campaign | TV4; seed/cấu hình 100 runs × 50 calls, không suy mọi chiến lược hoặc E2E |

## Nguồn bằng chứng và kết quả

| Mã | Source, kết quả và nguồn thực sự |
|---|---|
| E0 | [SC02 review](sc02-review.md), [token smoke](evidence/sc02-local-smoke.json), source `9a890a2084f10876e580d24589fa6cb0829c11f3`. TV4 kiểm 24 token tests; recipient BUD smoke là EOA, không chứng minh Treasury/governance. |
| E1 | [Peer acceptance](evidence/tv4-20261111-peer-acceptance.json), testedRevision S1; [raw archive](evidence/tv4-20261111-governance-raw.tar.gz). TV4 chạy 105 canonical receipts: 49 success, 56 revert. H109/hash `0x3ebfb408811935a2c50fefe08755abca225f2941e0c8c89a5ed6b3460e96210e`; ledger vào/ra 13.000/13.000 BUD, dư 0. |
| E1 demo | Nhánh reset độc lập trong E1 có 5 receipts, 700 GOV For, chi 1.000 BUD, Treasury còn 9.000. H24/hash `0x8082db4d29fb396a1d88a55f6adaad7c95edb18f729725600119c0469a6a356d`; execute `0x91008b6c830be0c9309f8e1fd83a05532657a3bed61d48f92c0640769a3ac0d7`. Nhánh đã revert sau kiểm tra, không cộng vào ledger H109. |
| E2 | [QA05 variants](evidence/tv4-20261111-qa05-variants.json), [raw](evidence/tv4-20261111-qa05-variants-raw.tar.gz), source `b7a74ce4f5a7336a992b39310fb9d569831176d3`. TV4 local **202/202 Foundry, 21/21 attack**, 0 fail/skip. Bốn TC10 rows hashed/zero × P1/P2 trước đều PASS với reset/deployment/H29/hash riêng; API/UI các rows chưa chạy. |
| E3 | TV1 đã chạy riêng 15 cancellation/terminal tests mới tại S0: **15/15 PASS**, 0 fail/skip. Log của lượt kiểm nằm trong môi trường review cá nhân, chưa được lưu trong repo; không dùng làm artifact độc lập. Evidence raw có thể tái lập trong repo là E2 của TV4, không đổi attribution thành TV1. |
| CI | [TV4 CI 9/9](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/42958494472), [BE08 1/1](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/42958494495), success đúng S0. TV1 đã kiểm metadata status, không gán số raw local 202 cho log CI chưa tải. |

Archive E1 SHA256 `89075e6e317f32d867eddc4991c0aca85d45afcc92998e4ecd52760012c62f9c`;
E2 SHA256 `81f94ba6f99b67b73e98a2441f8289ca7ef79a7c81c57be2bc11f548ba5a4bbb` đã được TV1 đối chiếu.
Đợt documentation này không chạy mới campaign, không deploy hoặc gửi giao dịch testnet.

## TC01–TC10/TC14 → test → assertions → SHA/evidence

Tất cả link source dưới đây cố định tại S0; ghi S1 nghĩa function không đổi từ peer revision.
PASS chỉ phạm vi contract/local; full acceptance có thể PARTIAL theo [test plan hiện hành](test-plan.md).

| TC/FR | Owner | Test function và file/dòng | Assert quan trọng | Source SHA / evidence / kết luận |
|---|---|---|---|---|
| TC01 / FR07–09 | TV1 integration | `testTC01ExecuteExactlyAtETAByNonHolder`; [tests/integration/TimelockGovernance.t.sol:636](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/integration/TimelockGovernance.t.sol#L636) | 700 GOV For / quorum 200 GOV; execute tại ETA; Queued→Executed, operation Done; Treasury10.000→9.000, recipient0→1.000; paidRequests=true; BudgetDisbursed/CallExecuted/ProposalExecuted đúng. Helper _successAt:607. | S0; E1 demo/E2; PASS contract/local |
| TC02 / FR06 | TV1 unit | `testInsufficientQuorumDefeated`; [tests/unit/BudgetGovernor.t.sol:367](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L367) | D bỏ 100 GOV For; D+1 Defeated; queue revert GovernorUnexpectedProposalState(expected Succeeded). Succeeded không tự chi được đối chiếu ở testFor400Against300SucceedsWithoutAutomaticPayment:422. | S0/S1 unchanged; E1 low-quorum revert; PASS |
| TC03 / FR06, BR02 | TV1 unit | `testForPlusAbstainReachesQuorum; testTieDefeated; testLossDespiteQuorumDefeated; testAbstainAloneCannotWin`; [tests/unit/BudgetGovernor.t.sol:377](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L377) | 100For+100Abstain Succeeded; 200For/200Against Defeated; đủ quorum nhưng For<Against vẫn Defeated; chỉ Abstain không thắng. Xét tại deadline+1. | S0/S1 unchanged; E1 tie/abstain receipts; PASS |
| TC04 / FR05, BR01–02 | TV1 unit | `testVotingWindowBoundaries; testDuplicateVoteRejectedAcrossEntryPoints:442; testSignedVoteUsesSnapshotAndRejectsReplay:972`; [tests/unit/BudgetGovernor.t.sol:472](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L472) | S−1/S Pending, castVote revert exact GovernorUnexpectedProposalState; S+1 Active trả400; tại D vẫn Active và B vote lần đầu; D+1 Succeeded, vote bị chặn. Duplicate qua castVoteWithReason revert GovernorAlreadyCastVote(A), tally vẫn400; chữ ký replay nonce không tăng; params không bơm weight:1024. | S0/S1 unchanged; E1 time-boundary receipts/CI; PASS |
| TC05 / FR02/05/06, BR01 | TV1 unit, bổ sung TV4 attack | `testBalanceTransferAfterSnapshotDoesNotChangeVoteWeight; testDelegateChangeAfterSnapshotDoesNotChangeVoteWeight:506; testDelegateAfterSnapshotDoesNotCreateVotes:517`; [tests/unit/BudgetGovernor.t.sol:495](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L495) | Chuyển hết400 sauS: current A0/B700 nhưng vote A400/B300; đổi delegate cùng kết quả; late delegate outsider hiện100 nhưng vote0. Token unit testPastVotesAndPastSupply:73, same-timestamp checkpoint:125, current/future revert:136/143. TV4 attackSnapshot:25 kiểm nhiều update tạiS rồi transferFrom/delegate tạiS+1 với oracle từng ví. | S0/S1 unchanged; E0/E1; PASS contract; full reset/API/UI PARTIAL |
| TC06 / FR07–09, role | TV1 unit + integration; TV4 attack độc lập | `testOrdinaryWalletCannotPay; testAdminWithoutSpenderCannotPay:136; integration testUserCannotScheduleSingleOrBatchDirectly:833; testUserCannotExecuteReadyOperationDirectlySingleOrBatch:847`; [tests/unit/Treasury.t.sol:127](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/Treasury.t.sol#L127) | AccessControlUnauthorizedAccount(caller,SPENDER/PROPOSER/EXECUTOR/CANCELLER); paid=false, Treasury10.000/recipient0. Ready operation còn nguyên rồi execute hợp lệ qua Governor thành công. Unit mockTimelock là EOA; chỉ integration/attack thật chứng minh final graph. | S0; E1/CI; PASS contract; actor/reset/raw/API/UI full PARTIAL |
| TC07 / FR07–08, BR03/07 | TV1 unit + integration | `testExecuteAtETAminusOneReverts; testTC01ExecuteExactlyAtETAByNonHolder:636; testExecuteAtETAplusOneByNonHolder:640; testExecuteCannotRepeatAfterDone:644`; [tests/integration/TimelockGovernance.t.sol:603](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/integration/TimelockGovernance.t.sol#L603) | E−1: TimelockUnexpectedOperationState(operation,Ready bitmap); proposal Queued/operation chưa Done/ETA giữ nguyên/paidRequests=false/balances10.000/0. E/E+1: Executed/Done/9.000/1.000. Replay exact GovernorUnexpectedProposalState(Executed), không có lần chi thứ hai. Unit testSuccessfulExecuteCannotReplay:765 và tamper recipient/amount/hash:731–739 assert state/balances/paid. | S0/S1 unchanged; E1/E2; PASS contract; receipt/UI variants PARTIAL |
| TC08 / FR03, BR03–04 | TV1 unit | `testWrongTargetRejectedOnDirectPropose; testNativeValueRejected:243; testWrongSelectorWithCorrectLengthRejected:271; testCorrectSelectorTruncatedTo4BytesRejected:851 và35/36/67/68/99; testFuzzDirtyAddressPaddingWithValidSelector:875`; [tests/unit/BudgetGovernor.t.sol:236](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L236) | Exact custom errors InvalidTarget/InvalidNativeValue/InvalidActionCount/InvalidCalldata/InvalidRecipient/InvalidAmount; correct selector được giữ khi test độ dài. Chặn multi-action/role/settings/self-target, zero/Treasury recipient, amount0, trailing bytes. Threshold49/50 ở145/159 và delegation phải là quá khứ ở183. Tests không chứng minh on-chain title/body validation. | S0/S1 unchanged; E1 invalid receipts; PASS contract; form/per-vector reset PARTIAL |
| TC09 / FR09, BR05 | TV1 Treasury/Governor unit + integration | `testExecuteInsufficientBudgetRollsBackAndRetries; Treasury testCompetingRequestsUseExecutionBalance:207; integration testConcurrentProposalsDoNotReserveBudgetAndRetryAfterTopup:766`; [tests/unit/BudgetGovernor.t.sol:817](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L817) | Unit11.000 vs10.000 revert InsufficientBudget(10.000,11.000); proposal Queued/operation Ready/ETA không đổi/paidRequests=false/balances không đổi; topup1.000 rồi cùng operation trả11.000, Treasury0/funder9.000. Integration proposals7.000+6.000: firstchi7.000; second thiếu3.000 revert; topup3.000 retrysecond, cuốiR1=7.000/R2=6.000/Treasury0/funder7.000. | S0/S1 unchanged; E1 insufficient/retry; PASS; không cần copy competition integration vào unit |
| TC10 / FR08, BR03 | TV1 unit; integration có đóng góp TV4; TV4 runner riêng | `testDistinctProposalsSharingRequestPayOnlyOnce; Treasury testZeroRequestIdCanBePaidOnlyOnce:184; integration testTwoDistinctProposalsWithSameRequestPayOnce:702 và testSecondProposalWithSharedRequestPaysFirstAndBlocksFirstProposal:722`; [tests/unit/BudgetGovernor.t.sol:788](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L788) | Hai descriptions tạo proposalId/operationId khác nhau cùng request. proposal đầu Executed / operation Done, proposal sau Queued / operation Ready, loser RequestAlreadyPaid(request), paidRequests=true, Treasury9.000/R1=1.000. Nhánh integration đảo thứ tự: P2chi2.000 trước, P1revert, Treasury8.000/R2=2.000/R1=0, đúng1Transfer/1BudgetDisbursed. bytes32(0) unit Treasury chặn lần2. TV4 runner4rows hashed/zero×P1/P2 sau reset riêng đã có raw receipts, không viết lại. | S0; E1/E2; PASS unit/integration/4 receipt rows; linkage API/UI full PARTIAL |
| TC14 / FR10, BR06 | TV1 unit + final-role integration; TV4 delta boundary | `testCreatorCancelsPendingAndBlocksAllActions; testOtherWalletCannotCancelPending:556; testCreatorCanCancelAtSnapshotWhileStillPending:632; testCreatorCannotCancelActive/Succeeded/Queued/Executed/Defeated:570–597`; [tests/unit/BudgetGovernor.t.sol:541](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d8f8743179d7748d0e05499646b5d9322820c782/tests/unit/BudgetGovernor.t.sol#L541) | Creator-only Pending; noncreator/late cancel exact GovernorUnableToCancel(id,caller); Canceled chặn vote/queue/execute. Treasury testAdminHandoffRemovesAllDeployerPrivileges:268; integration testFormerBootstrapCannotRegrantTreasuryRoles:806. TV4 15tests mới 2 actor × 6 mốc S−1/S/S+1/D/D+1/ETA +3 terminal actions, exact state/error/no mutation/log0, same-proposal positive control. | S0; E1/E2/E3; PASS contract; raw/API/UI full variants PARTIAL |

## Biên và regression đã có

| Biên/điều kiện | Coverage hiện có |
|---|---|
| S−1, S | Governor Pending, vote bị từ chối; creator còn cancel được |
| S+1 | Active; đọc past votes tại S và dùng trọng số snapshot |
| D | Active, phiếu đầu tiên của ví chưa vote vẫn hợp lệ |
| D+1 | Xét Succeeded/Defeated; vote bị từ chối |
| ETA−1 / ETA / ETA+1 | Execute sớm revert; từ ETA được phép nếu đủ điều kiện khác |
| Request đã trả | RequestAlreadyPaid, không đổi số dư, operation thua còn Ready |
| Thiếu quỹ | Không tiêu thụ request, không Done; topup rồi retry cùng operation |

Governor unit shared-request kiểm một thứ tự; integration kiểm cả hai thứ tự và
recipient/amount khác nhau. Zero request có Treasury unit và runner receipt TV4.
Competition có Treasury unit và Governor integration TV1. Không cần copy các test
đã có sang lớp khác chỉ để tăng số lượng. Standalone GOV transferFrom/undelegate-zero
unit có thể giúp khoanh vùng lỗi, nhưng không là blocker SC07 vì đã có smoke/attack/handler.

## Lệnh tái lập và giới hạn nghiệm thu

Chạy sau khi khởi tạo pinned submodules và cài toolchain theo [README](../README.md):

```bash
forge build
forge test --match-path 'tests/unit/*.t.sol' -vv
forge test --match-path tests/integration/TimelockGovernance.t.sol -vv
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh
```

Các lệnh trên là hướng dẫn tái lập, không phải lượt chạy mới của đợt tài liệu.
Full QA05 còn actor/state/boundary/reset/receipt/API/UI variants; bounded QA06 giữ
phạm vi peer đã chốt. SC07 không chứng nhận extension-wallet, testnet, máy nhận độc
lập hoặc Dev đã tích hợp candidate. Bàn giao SC09 và phần báo cáo nhóm: [Smart Contracts](sc09-smart-contracts-report.md).

Cập nhật môi trường: TV4 chọn Sepolia/11155111/K=2 trong
[preflight](evidence/tv4-20261111-testnet-preflight.json). Probe chỉ đọc, 0 transaction;
không đổi kết luận SC07 contract-level hoặc mở gate deployment testnet #20.
