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
Hiện chưa có Treasury/Governor/Timelock triển khai trong nhánh TV4.

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
SQL local từ runner Bash mới. Kết quả job PostgreSQL thực tế phải xem run/check
của [PR #5](https://github.com/SE2026-21-1/dao-budget-simulator/pull/5), artifact
`tv4-be01-<SHA>` và thông báo evidence trên PR; không suy ra pass từ YAML hoặc
fixture JSON. PostgreSQL Windows do TV2 báo cáo trước đó được giữ riêng tại
`be01-checklist.md`.

## Thứ tự thực hiện

1. TV1 cung cấp token, Treasury, Governor, Timelock; chốt constructor,
   ABI/event, clock timestamp và bảng role.
2. TV4 thêm deploy/seed/check-roles local; TV1 review trước khi dùng testnet.
3. Thêm attack và invariant suites; kiểm tra handler đi đến execute thành công.
4. Phối hợp TV2/TV3 chạy E2E và rebuild; bổ sung CI ứng dụng/indexer.
5. Deploy testnet, thu receipt, hoàn thiện demo và evidence.

## Deploy, cấu hình và demo (NFR05, NFR08)

- [ ] Script deploy local và testnet, lưu chainId, địa chỉ, deploymentBlock,
  ABI version, cấu hình governance và commit SHA.
- [ ] Seed GOV 1.000: A/B/C/D = 400/300/200/100; self-delegate và checkpoint quá khứ.
- [ ] Seed BUD 20.000: treasury 10.000, ví nạp quỹ 10.000; 18 decimals.
- [ ] Cấu hình threshold 50, quorum 20%, voting delay 60 giây,
  voting period 300 giây, timelock 120 giây; clock GOV/Governor thống nhất.
- [ ] `check-roles` đọc và kiểm tra đúng bảng quyền, trả exit code khác 0 nếu sai.
- [ ] Treasury SPENDER chỉ Timelock; admin Treasury là Timelock.
- [ ] Timelock PROPOSER/EXECUTOR/CANCELLER chỉ Governor; EXECUTOR không mở zero address.
- [ ] Admin Timelock là chính Timelock; deployer đã từ bỏ quyền ở cả hai nơi.
- [ ] Có `.env.example` phù hợp script thực tế; không commit private key/RPC secret.
- [ ] Xác nhận testnet hỗ trợ EVM/compiler đã chọn trước deployment.
- [ ] Local demo tự tăng thời gian; testnet chờ thời gian thực.
- [ ] Testnet có ít nhất một proposal giải ngân và một proposal thất bại.

## Acceptance và attack scenarios

Mọi dòng dưới đây đang chờ triển khai/kiểm chứng. Lưu mã test, lệnh chạy,
kết quả và evidence tương ứng; không đánh dấu đạt chỉ vì có tên test.

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
- [ ] Có handler stateful, tối thiểu 100 chuỗi × 50 thao tác trong CI.
- [ ] Handler đi được đến execute thành công; ghi số lần thành công/revert,
  seed và thống kê để tránh bộ test chỉ toàn revert.

## CI và evidence cuối kỳ

- [ ] Khi có frontend/indexer: CI thêm build/typecheck/indexer tests theo lockfile thực tế.
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
