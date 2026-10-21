# DAO Budget Simulator

Mô phỏng quản lý ngân sách DAO: proposal → voting → queue → timelock → giải ngân BUD.
Chỉ dùng local/testnet, không dùng tiền thật. Repository đã có nền tảng SC01 và
hai token của SC02: GovernanceToken (GOV) và BudgetToken (BUD), kèm unit test.
SC03 đã có Treasury và unit test chống chi lặp. SC04 đã có BudgetGovernor và fixture Timelock trong unit test; chưa hoàn tất SC05,
chưa chạy được demo end-to-end.

## Trạng thái các task TV1

| Task | Trạng thái |
|---|---|
| SC01 — Nền tảng và chuẩn tích hợp | Đã triển khai, còn các mục review/tái lập trong docs/contracts.md |
| SC02 — Token và voting power | Đã triển khai hai token và unit test; chờ review/tích hợp |
| SC03 — Treasury và chống chi lặp | Đã triển khai Treasury, unit test và ABI; chờ review/tích hợp |
| SC04 — Governor và giới hạn proposal | Đã triển khai BudgetGovernor, unit test và ABI; chờ review |
| SC05 — Timelock và quyền sau deploy | Chưa triển khai |
| SC06 — ABI và dữ liệu tích hợp | Chưa hoàn tất; hiện có ABI nháp và fixture tổng hợp SC01 |
| SC07 — Hoàn thiện unit test và test biên | Chưa hoàn tất; đã có unit test SC01/SC02 |
| SC08 — Tích hợp local | Chưa thực hiện |
| SC09 — Review dữ liệu và tài liệu contract | Chưa hoàn tất; đã có tài liệu nền tảng và token |
| SC10 — Testnet và bàn giao | Chưa thực hiện |

## Môi trường tái lập

- Foundry (forge/cast/anvil): 1.8.5.
- Solidity: 0.8.37; optimizer 200 runs; EVM local: osaka.
- OpenZeppelin Contracts: 5.4.0; forge-std: 1.17.0.
- Python 3 để kiểm tra ABI/fixture, không cần package bên ngoài.
- Dependency được khóa bằng git submodule và `foundry.lock`.

Cài Foundry đúng phiên bản theo hướng dẫn của nhóm/TV4. Sau khi clone:

```bash
git submodule update --init --recursive
forge --version
cast --version
forge build
forge test --match-path 'tests/unit/ITreasury.t.sol' -vv
python3 scripts/check_sc01.py
forge fmt --check
```

Lần build đầu cần mạng để tải compiler nếu máy chưa có Solidity 0.8.37.
Để kiểm tra toàn bộ test hiện có, dùng `forge test`.
Cấu hình tìm test trong `tests/` để nhận cả unit/invariant/attacks sau này.
Không suy ra test thành công từ artifact `out/` có sẵn.

## Unit test SC02

Sau khi cài dependency và toolchain ở trên, chạy riêng từng token:

```bash
forge test --match-path 'tests/unit/GovernanceToken.t.sol' -vv
forge test --match-path 'tests/unit/BudgetToken.t.sol' -vv
```

Hoặc chạy cả hai token, rồi toàn bộ test để kiểm tra cùng SC01:

```bash
forge test --match-path 'tests/unit/*Token.t.sol' -vv
forge test
```

Test GOV kiểm tra nguồn cung/phân bổ, decimals, delegation, timestamp clock và
checkpoint lịch sử. Test BUD kiểm tra nguồn cung, phân bổ demo, chuyển không phí,
approve/transferFrom và allowance. Có test âm và fuzz test cho hai token.
Constructor và trình tự phân bổ cho TV4 được mô tả trong
[tài liệu SC02](docs/sc02-tokens.md).

## Unit test SC03

```bash
forge build
forge test --match-path 'tests/unit/Treasury.t.sol' -vv
forge test -vv
python3 scripts/check_sc01.py
```

Treasury dùng AccessControl và SafeERC20; nạp bằng transfer BUD, kiểm tra số dư khi chi,
chặn requestId đã thanh toán và cho retry sau lần thất bại. Test dùng địa chỉ Timelock giả lập,
chưa chứng minh luồng Governor → Timelock → Treasury. Xem [hướng dẫn SC03](docs/sc03-treasury.md).

## Unit test SC04

```bash
forge build
forge test --match-path 'tests/unit/BudgetGovernor.t.sol' -vv
forge test -vv
python3 scripts/check_sc01.py
```

BudgetGovernor chỉ nhận một lời gọi Treasury.disburse chuẩn ABI, dùng GOV timestamp checkpoint,
threshold 50 GOV và quorum 20%. Xem [SC04 — Governor](docs/sc04-governor.md).
Test có Timelock thật làm fixture; production roles/deploy/check-roles thuộc SC05 và TV4.

## Tài liệu và chuẩn tích hợp

- [Yêu cầu nhóm](docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
- [Phân công TV1](docs/requirements/TV1_Cong_viec_Smart_Contracts.md)
- [Giao tiếp contract và quyết định chờ review](docs/contracts.md)
- [SC02 — Token, constructor và phân bổ cho TV4](docs/sc02-tokens.md)
- [SC03 — Treasury, quyền và bàn giao TV4](docs/sc03-treasury.md)
- [SC04 — Governor, proposal và voting](docs/sc04-governor.md)
- [ABI BudgetGovernor](shared/abi/BudgetGovernor.json)
- [ABI Treasury triển khai](shared/abi/Treasury.json)
- [ABI interface Treasury](shared/abi/ITreasury.json)
- [Fixture tổng hợp SC01](fixtures/sc01/disbursement-v1.json)

Fixture SC01 không phải receipt hoặc bằng chứng deployment. Receipt/log thật thuộc SC06.
TV1 phụ trách contract/unit test; TV2 indexer/API; TV3 dashboard/ví;
TV4 deploy/seed/check-roles, CI và attack/invariant/E2E. Mỗi PR cần người khác review.
Không đưa private key hoặc RPC secret vào fixture, tài liệu hay Git.

## BE01 — database, API dự kiến và dữ liệu mẫu

TV3 có thể dùng [fixture API tổng hợp](fixtures/api/README.md) để dựng giao diện
trước khi có API server. Đọc [đặc tả API](docs/api.md),
[thiết kế PostgreSQL](docs/database.md) và [checklist bàn giao](docs/be01-checklist.md).
BE01 chưa triển khai indexer, HTTP server hoặc xử lý reorg thực tế.

Kiểm tra fixture với Node.js (chỉ dùng thư viện chuẩn):

```powershell
node scripts/check_be01.mjs
```

Checker đọc trực tiếp JSON và tự chạy regression cho logIndex toàn block,
snapshot theo timestamp block tạo và thứ tự phát log. Metadata offline nằm ở
`fixtures/api/simulation.json`; vẫn có 45 proposal, trang 20/20/5. Dữ liệu mới
dùng revision `fixture-v2`; bỏ cursor v1. Hướng dẫn kiểm tra sinh lại xác định
và các giới hạn đối chiếu hash nằm trong README fixture.

Kiểm tra migration và ràng buộc bằng cụm PostgreSQL tạm độc lập trên Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be01_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

Script tạo cụm mới trong thư mục tạm, tự dừng sau kiểm tra và giữ log để xem lại;
không kết nối hoặc xóa database đang có. Cách chạy SQL trên hệ điều hành khác
nằm trong tài liệu database. Schema và API vẫn chờ nhóm review.
