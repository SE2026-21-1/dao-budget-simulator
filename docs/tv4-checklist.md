# TV4 — Checklist kiểm thử bảo mật và vận hành

Nguồn yêu cầu: [đặc tả nhóm trên Dev](https://github.com/SE2026-21-1/dao-budget-simulator/blob/Dev/docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md), mục 7–10.
TV4 chịu trách nhiệm chính về invariant/attack/E2E, deploy/seed/demo,
CI, check-roles và tổng hợp evidence. Mỗi thành viên vẫn viết test/tài liệu phần mình.
TV1 review deployment; TV4 review logic chi tiền của TV1. Mỗi PR cần người khác review.

## Nền tảng hiện có

- [x] Pin Foundry 1.8.5, compiler và dependency qua submodule/lockfile.
- [x] Có test tương thích calldata/event ABI và fixture SC01 tổng hợp.
- [x] Có lệnh `bash scripts/ci.sh` dùng chung giữa local và CI.
- [x] Có workflow build, format, test và kiểm tra fixture; lưu log/commit.
- [x] Foundry CI baseline thành công tại commit `0344fdb`: [run 39454309744](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39454309744). Đây chưa phải bằng chứng job BE01 mới.
- [ ] Chạy lại từ clone sạch trên máy thành viên khác.

Các mục đã đánh dấu là thành phần đã được thiết lập, không phải bằng chứng
nghiệm thu toàn hệ thống. Fixture SC01 không phải receipt on-chain.
Đã tích hợp GOV/BUD/Treasury/BudgetGovernor và BE02 vào TV4. TimelockController OZ5.4.0 thật đã dùng cho deploy/seed/check-roles/smoke local; projection/API, reorg/rebuild và UI wallet thật vẫn thiếu, SC05/testnet chưa peer nghiệm thu.

## SC04 mở khóa QA02–QA03/QA05–QA06 — 21/10/2026

- [x] Tích hợp TV1 `f57fcfd` bằng `70c2b33`; mở [PR #13 SC04](https://github.com/SE2026-21-1/dao-budget-simulator/pull/13), request TV1/TV2 review; không tự approval/merge.
- [x] [QA02 #14](https://github.com/SE2026-21-1/dao-budget-simulator/issues/14): deploy local thực, grant final roles/renounce bootstrap trước funding, seed và historical delegation, manifest/compiler/ABI/source/receipt.
- [x] [QA03 #15](https://github.com/SE2026-21-1/dao-budget-simulator/issues/15): checker cùngH từ creation/runtime/token links/config/full grant-revoke history; [8 probes CLI](evidence/sc04-role-audit.json) đúng exit0/sai exit1. Extra spender thật ngoài demo mapping bị chặn trước funding.
- [x] Smoke final-role EOA→Governor→Timelock→Treasury: [QA02 demo5 receipt chi1000 và campaign105receipt](evidence/sc04-local-smoke.json), snapshot/delay/cancel/whitelist/replay/budget race/retry. Nhánh demo được reset, không trộn ledger.
- [x] [QA05 #16](https://github.com/SE2026-21-1/dao-budget-simulator/issues/16): regression concurrent khác snapshot/shared request/budget retry; smoke có exact time/error/receipt. Coverage cục bộ theo [matrix](test-plan.md), không phải mọi TC đã PASS.
- [x] [QA06 #17](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17):4 governance invariant checks, campaign100×50 seed0x20261021; ghost oracle độc lập và execute trong sequence. [Review/scope](sc04-governor.md#qa05qa06-oracle-và-giới-hạn), [stdout](evidence/tv4-sc04-foundry-20261021.txt).
- [x] BE02 HttpRpc/readBatch đọc chain thật:108 header,61 raw/45decoded/16unknown/0decode errors tạiH109;0 discarded. Không DB/projection/API/reorg, GOV raw-only.
- [ ] Peer review/approval và merge; đầy đủ TC variants/whole-system INV/E2E, testnet.

`scripts/deploy_local.mjs` để chain do người dùng mở tiếp tục chạy; `scripts/smoke_governance.mjs` tự sở hữu và dừng chain tạm. Cả hai không dùng private key hay RPC testnet. Hướng dẫn chạy ở README; manifest cũ ràng buộc source commit/build ghi kèm.

## Tiến độ tích hợp ngày 21/10/2026

- [x] Tích hợp `Dev` (`1f40748`) và BE02 (`4c568d6`) bằng `496a2f3`/`5cb8b7e`; giữ checker ABI chuẩn TV4.
- [x] QA03 Treasury: [review SC03](sc03-review.md), [19 receipt thật](evidence/sc03-local-smoke.json); quyền/chi trùng/thiếu tiền/retry/role transitions và ledger đạt cục bộ.
- [x] Treasury-only stateful oracle: 3 invariant checks, campaign100×50, seed `0x20261021`; regression nhiều role epochs. Không thay whole-governance INV01–INV04.
- [x] Local tại `7a0ab33`: Foundry58/58, BE02 unit63/63, PostgreSQL18.4 storage21/21, không skip; typecheck/build và BE01 fixture đạt. [Evidence local](evidence/tv4-local-verification-20261021.json).
- [x] CI contracts+live smoke, BE01, BE02 đều thành công: [push](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342), [PR](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539695150). [Docker log](evidence/be02-ci-7a0ab33.txt) xác nhận loopback và cleanup thành công; chưa fault-inject failure/interruption của runner.
- [x] Mở [PR #12 BE02](https://github.com/SE2026-21-1/dao-budget-simulator/pull/12), request TV2/TV1 review; không tự approval/merge vào Dev.
- [ ] Peer approval/merge PR #5 và #12. Yêu cầu review không phải approval.

Local SQL dùng cluster native tạm mới (Node24.15.0/PostgreSQL18.4), đã dừng/xóa; không vượt quyền Docker. Docker runner được kiểm chứng riêng trên CI. Phần ngày 20/10 dưới đây là lịch sử, không phải trạng thái tích hợp hiện tại.


## Tiến độ tích hợp ngày 20/10/2026

- QA01: xử lý conflict với `Dev`, giữ tài liệu SC01/BE01; bỏ checker/selector test
  cũ bị phục hồi trùng. CI thêm Node 24.15.0 và PostgreSQL 18.4 cô lập.
  [Issue #6](https://github.com/SE2026-21-1/dao-budget-simulator/issues/6)
  giữ các mục review/clone sạch chưa hoàn tất.
- QA04: [test matrix](test-plan.md) ánh xạ FR/BR/NFR/TC/INV, owner, setup/reset,
  kỳ vọng và blocker; [issue #7](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7).
  Ma trận không phải kết quả nghiệm thu các test còn thiếu.
- QA03 (phần token): [review SC02](sc02-review.md), 24 token tests và smoke deploy
  Anvil đã đạt; [evidence token-only](evidence/sc02-local-smoke.json).
  [TV1 bàn giao PR ở #8](https://github.com/SE2026-21-1/dao-budget-simulator/issues/8).
  Chưa có full role checker hoặc kiểm thử chi tiền qua Governor/Treasury.
- TV3 nhận [issue #9](https://github.com/SE2026-21-1/dao-budget-simulator/issues/9)
  dùng fixture BE01 chung; chưa coi giao diện mock là E2E.

Kiểm tra local sau tích hợp: `FOUNDRY_PROFILE=ci bash scripts/ci.sh` đạt 2 tests
(256 fuzz runs) và ABI/fixture SC01; `node scripts/check_be01.mjs` đạt 123 JSON,
45 proposal, trang 20/20/5, timeline và regression. SC02 chạy ở detached
commit `9a890a2`, chưa merge token vào TV4.
Máy local không có quyền Docker và sudo yêu cầu mật khẩu, nên không có bằng chứng
SQL local từ runner Bash mới. **CI đã chạy thật thành công** ở commit `b2c32a0`:
[run 39457911277](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39457911277),
cả Foundry và BE01 đều success; Node `v24.15.0`, PostgreSQL 18.4, migration
COMMIT, SQL constraints báo `BE01 checks passed` rồi ROLLBACK.
[Stdout SQL nguyên bản](evidence/be01-ci-b2c32a0.txt) được lưu từ artifact
`tv4-be01-b2c32a06be39cfacb749cb9d305e462d8929bce0`.
Workflow tiếp theo pin các Actions dùng Node24 để xử lý cảnh báo runtime Node20
từ run này; không đặt biến môi trường để che cảnh báo.
Fixture/SQL success không phải worker/API/E2E hoặc NFR07 hoàn tất. Bằng chứng
PostgreSQL Windows trước đó của TV2 được giữ riêng tại `be01-checklist.md`.

## Thứ tự thực hiện

1. TV1/TV2 peer review PR #13/#5 và deploy/check-roles, đối chiếu bàn giao SC05; local không còn chờ Governor/Timelock giả.
2. TV2/TV3 dùng manifest của **Anvil local còn chạy**, không dùng địa chỉ smoke đã dừng hoặc receipt nhánh reset làm canonical.
3. Rà đủ actor/state/transferFrom/zero-request/reset variants và bounded oracle; không nâng scope vượt evidence.
4. TV2 checkpoint/K-confirmations/reorg/projections/API/rebuild; TV3 wallet/form/shared fixtures, rồi TV4 E2E/same-H.
5. Chốt mạng testnet/RPC/faucet, xác minh Osaka/compiler, TV1 review deployment trước phát giao dịch thật.

## Deploy, cấu hình và demo (NFR05, NFR08)

- [x] Script deploy/seed **local** và manifest chainId/từng address/block/tx, ABI/compiler/source/config/commit; [README](../README.md#deploy-audit-role-và-demo-governance-local--tv4).
- [ ] Script/deployment/manifest **testnet**; không coi local thành testnet.
- [x] GOV1000: A/B/C/D400/300/200/100, self-delegate và checkpoint đã quá khứ.
- [x] BUD20000: Treasury10000/funding10000 sau init,18 decimals.
- [x] Threshold50,quorum20%,delay60/period300/minDelay120,timestamp clock.
- [x] Checker đúng exit0/sai exit1, read-only cùngH và full role history.
- [x] Treasury admin/spender chỉ Timelock.
- [x] Timelock proposer/executor/canceller chỉ Governor, zero executor không mở.
- [x] Admin Timelock self, deployer bỏ bootstrap cả Treasury/Timelock **trước funding**.
- [x] `.env.example` BE02 hiện có; deploy/checker dùng `--rpc` explicit, không nạp `.env` tự động hoặc nhận key.
- [ ] Xác nhận testnet hỗ trợ EVM/compiler đã chọn trước deployment.
- [x] Local tự tăng thời gian và QA02 demo1000 BUD qua Governor thật; chưa dùng time-warp trên testnet.
- [ ] Testnet có ít nhất một proposal giải ngân và một proposal thất bại.

## Acceptance và attack scenarios

Các TC dưới đây chưa nghiệm thu đầy đủ. E-SC04-L/E-SC04-ROLE/E-GOV-INV trong [matrix](test-plan.md) đã mở khóa bằng chứng contract/roles/reader thật, không thay đầy đủ variants hoặc Governor/UI/API end-to-end. E-SC03-C/E-TV4-21 giữ scope Treasury-only lịch sử.

| Mã | Điều cần kiểm tra | Phối hợp |
| --- | --- | --- |
| TC01 | A+B 700 For, chi 1.000 BUD, treasury còn 9.000 | TV1/TV3 |
| TC02–03 | Thiếu quorum, hòa hoặc thua thì không queue/execute | TV1 |
| TC04 | Vote hai lần; đúng tại snapshot, sau snapshot, deadline, sau deadline | TV1 |
| TC05 | Chuyển token/delegate sau snapshot không tăng phiếu proposal | TV1 |
| TC06 | Ví thường gọi Treasury/Timelock trực tiếp bị chặn | TV1 |
| TC07 | Execute trước ETA bị chặn, tại ETA được phép; execute lặp bị chặn | TV1 |
| TC08 | Chặn target/selector/native value/recipient/amount sai và proposal cấp role | TV1 |
| TC09 | Hai khoản chi tranh số dư; thiếu quỹ revert toàn bộ, nạp lại rồi retry được | TV1/TV2 |
| TC10 | Hai proposal cùng requestId chỉ chi thành công một lần | TV1 |
| TC11 | Dừng giữa batch/reorg, resume không mất hoặc trùng log | TV2 |
| TC12 / FR15 | Rebuild DB trống tại cùng H, so proposal/vote/chi/số dư/state | TV2 |
| TC13 | Sai mạng, từ chối ký, mô tả HTML, trạng thái receipt/UI đúng | TV3 |
| TC14 | Deployer không lấy lại quyền/chi tiền; chỉ creator hủy Pending | TV1 |

- [ ] TC01–TC14 có kết quả và evidence.
- [ ] TC05–TC08, TC10, TC14 có attack scenario: mục tiêu, thiết lập,
  lệnh chạy, kỳ vọng, trace/receipt và giải thích cơ chế chặn.
- [ ] E2E qua UI → ví → chain → indexer/API → UI; dữ liệu khớp cùng block.

## Bất biến (INV01–04)

- [ ] INV01: mỗi requestId chi thành công tối đa một lần.
- [ ] INV02: chi thành công chỉ qua proposal hợp lệ và Timelock hết delay.
- [ ] INV03: số dư BUD treasury bằng tổng vào trừ tổng ra.
- [ ] INV04: thay đổi token sau snapshot không làm tổng trọng số phiếu vượt tổng cung tại snapshot.
- [x] Có campaign Treasury-only100×50 và oracle độc lập; không đánh dấu các INV toàn hệ thống phía trên đạt.
- [x] Handler governance CI tối thiểu100chuỗi×50,4properties nhóm1campaign; Treasury campaign riêng.
- [x] Handler đạt execute thành công trong sequence, có attempts/success/revert/state counters và seed; counters stdout là chuỗi cuối, không tự nhận aggregate100runs.

## CI và evidence cuối kỳ

- [x] BE02 CI: lockfile/typecheck/build/RPC-decoder/storage-CLI PostgreSQL thật, có artifact SHA/logs.
- [ ] Frontend CI và governance invariant/E2E đầy đủ sau bàn giao; chưa nghiệm thu NFR07.
- [ ] Mọi yêu cầu an toàn có test âm; không còn lỗi mở cho phép chi sai/bỏ qua quyền.
- [ ] Xác minh NFR02 hiệu năng và NFR03 độ mới với TV2; ghi máy, dữ liệu và lệnh đo.
- [ ] Kiểm tra retry/backoff, checkpoint và phục hồi NFR04 với TV2.
- [ ] Kiểm tra UI 390px/1366px và bàn phím NFR06 với TV3.
- [ ] README clone sạch chạy được local demo; CI xanh trước bàn giao.

Mẫu ghi một bằng chứng (không chứa bí mật):

```text
Yêu cầu/TC/INV:
Commit SHA:
Môi trường và phiên bản:
Lệnh chạy / GitHub Actions run URL:
Kết quả mong đợi:
Kết quả thực tế:
Seed, runs/depth (nếu có):
ChainId, block đối chiếu, txHash (nếu có):
Trace/log/receipt:
Người chạy / người review:
```

Chỉ đánh dấu nghiệm thu khi có kết quả thực tế gắn commit; CI tương thích ABI
hiện tại không thay thế bộ kiểm thử bảo mật và nghiệm thu ở trên.
