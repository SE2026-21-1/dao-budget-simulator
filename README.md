# DAO Budget Simulator

Mô phỏng quản lý ngân sách DAO: proposal → voting → queue → timelock → giải ngân BUD.
Chỉ dùng local/testnet, không dùng tiền thật. Repository đã có nền tảng SC01 và
hai token của SC02: GovernanceToken (GOV) và BudgetToken (BUD), kèm unit test.
SC03 đã có Treasury và unit test chống chi lặp. Chưa triển khai Governor/Timelock,
chưa chạy được demo end-to-end.

## Trạng thái các task TV1

| Task | Trạng thái |
|---|---|
| SC01 — Nền tảng và chuẩn tích hợp | Đã triển khai, còn các mục review/tái lập trong docs/contracts.md |
| SC02 — Token và voting power | Đã tích hợp từ Dev qua PR #10; có unit test và review TV4 |
| SC03 — Treasury và chống chi lặp | Đã tích hợp từ Dev qua PR #11; review độc lập TV4 được ghi riêng |
| SC04 — Governor và giới hạn proposal | Chưa triển khai |
| SC05 — Timelock và quyền sau deploy | Chưa triển khai |
| SC06 — ABI và dữ liệu tích hợp | Chưa hoàn tất; hiện có ABI nháp và fixture tổng hợp SC01 |
| SC07 — Hoàn thiện unit test và test biên | Chưa hoàn tất governance; đã có unit test SC01/SC02/SC03 |
| SC08 — Tích hợp local | Chưa thực hiện |
| SC09 — Review dữ liệu và tài liệu contract | Chưa hoàn tất; đã có tài liệu nền tảng và token |
| SC10 — Testnet và bàn giao | Chưa thực hiện |

## Môi trường Foundry — TV4 Operation

Cấu hình, thư viện và dữ liệu tích hợp SC01 được đồng bộ từ nhánh `feature/tv1-sc01`,
commit `9a406fedfbac6c54237712a536b0700fdad9bb73`. Interface `ITreasury`, ABI chia sẻ,
fixture tổng hợp và script kiểm tra fixture được giữ làm chuẩn tích hợp.
Test selector TV1 đã được thay bằng bộ kiểm tra tương thích ABI dành cho TV4.
GOV/BUD và Treasury đã tích hợp từ `Dev` tại `1f40748`; Governor/Timelock chưa có.

| Thành phần | Phiên bản |
| --- | --- |
| Foundry (`forge`, `cast`, `anvil`) | 1.8.5 |
| Solidity | 0.8.37 |
| OpenZeppelin Contracts | 5.4.0 |
| forge-std | 1.17.0 |
| EVM local | osaka |
| Optimizer | bật, 200 runs |

Dependency được khóa bằng Git submodule và `foundry.lock`. Cài Foundry 1.8.5
theo [hướng dẫn Foundry](https://getfoundry.sh/introduction/installation), rồi chạy:

```bash
git clone --branch feature/tv4-operation https://github.com/SE2026-21-1/dao-budget-simulator.git
cd dao-budget-simulator
git submodule update --init --recursive
forge --version
cast --version
anvil --version
forge build
forge test -vv
python3 scripts/check.py
forge fmt --check
```

Lần build đầu có mã Solidity cần mạng để tải compiler 0.8.37 nếu chưa có.
Foundry tìm contract trong `contracts/`, test trong `tests/` và thư viện trong
`lib/`. Remapping `forge-std/` và `@openzeppelin/contracts/` đã có trong
`foundry.toml`. Script kiểm tra ABI/fixture cần Python 3, không cần package bổ sung.
Bộ test `tests/unit/OperationAbiCompatibility.t.sol` gồm:

- `testFuzzDisbursementPayloadMatchesClientAbi`: đối chiếu calldata do interface
  tạo với ABI công khai cho requestId, địa chỉ nhận và số lượng được fuzz.
- `testBudgetDisbursedTopicMatchesIndexerAbi`: cố định topic0 của sự kiện
  `BudgetDisbursed` để phát hiện thay đổi làm mất tương thích với indexer.

Script Python đối chiếu ABI compiler, calldata, descriptionHash và proposalId.
Fixture là dữ liệu tổng hợp, không phải receipt on-chain. Các kiểm tra này chưa
chứng minh phân quyền Treasury, chống giải ngân lặp hay luồng DAO end-to-end.

Cấu hình `osaka` chỉ được xác minh bằng thực thi EVM local; cần kiểm tra hỗ trợ
của testnet trước khi deploy. Không commit private key hoặc RPC secret:
`.env`, `.env.*`, `out/`, `cache/` và `broadcast/` được bỏ qua; `.env.example`
được phép đưa vào Git.

## Kiểm tra tự động — TV4

Sau khi cài dependency, chạy các kiểm tra Foundry như job contracts:

```bash
FOUNDRY_PROFILE=ci bash scripts/ci.sh
```

Job contracts dùng Foundry 1.8.5, Python 3.12 và profile `ci` (256 fuzz runs;
100 invariant runs × 50 thao tác khi có invariant suite). Job BE01 dùng
Node.js 24.15.0 kiểm tra fixture và container PostgreSQL 18.4 kiểm tra SQL.
Workflow chạy khi push vào `main`, `Dev`, `feature/**` hoặc mở/cập nhật PR.
Xem Actions → **TV4 CI**; mỗi job lưu log và commit SHA trong artifact 14 ngày.
Lần đầu cần mạng để tải công cụ, submodule, compiler và image PostgreSQL;
không cần RPC/private key. Chạy fixture/SQL local theo các lệnh BE01 bên dưới.

CI kiểm tra build, format, ABI/fixture tổng hợp và ràng buộc SQL hiện có,
không chứng minh indexer/API thật, resume/reorg/rebuild hoặc bảo mật giải ngân.
Nhánh tích hợp chưa có Treasury/Governor/Timelock đầy đủ để nghiệm thu E2E.
Xem [checklist và kế hoạch TV4](docs/tv4-checklist.md) để tiếp tục.
Sau khi tích hợp frontend/indexer, cần bổ sung job typecheck và indexer tests
trước khi đánh dấu NFR07 hoàn tất.

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
python3 scripts/check.py
```

Treasury dùng AccessControl và SafeERC20; nạp bằng transfer BUD, kiểm tra số dư khi chi,
chặn requestId đã thanh toán và cho retry sau lần thất bại. Test dùng địa chỉ Timelock giả lập,
chưa chứng minh luồng Governor → Timelock → Treasury. Xem [hướng dẫn SC03](docs/sc03-treasury.md).

## Tài liệu và chuẩn tích hợp

- [Yêu cầu nhóm](docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
- [Phân công TV1](docs/requirements/TV1_Cong_viec_Smart_Contracts.md)
- [Giao tiếp contract và quyết định chờ review](docs/contracts.md)
- [SC02 — Token, constructor và phân bổ cho TV4](docs/sc02-tokens.md)
- [SC03 — Treasury, quyền và bàn giao TV4](docs/sc03-treasury.md)
- [ABI Treasury triển khai](shared/abi/Treasury.json)
- [ABI interface Treasury](shared/abi/ITreasury.json)
- [Fixture tổng hợp SC01](fixtures/sc01/disbursement-v1.json)
- [Phân công TV4](docs/TV4_Cong_viec_Testing_Deployment.md)
- [Test matrix và trạng thái nghiệm thu](docs/test-plan.md)
- [Review token SC02 và smoke local](docs/sc02-review.md)
- [Tổng kết công việc TV4 và tác dụng](docs/tv4-work-summary.md)

Fixture SC01 không phải receipt hoặc bằng chứng deployment. Receipt/log thật thuộc SC06.
TV1 phụ trách contract/unit test; TV2 indexer/API; TV3 dashboard/ví;
TV4 deploy/seed/check-roles, CI và attack/invariant/E2E. Mỗi PR cần người khác review.
Không đưa private key hoặc RPC secret vào fixture, tài liệu hay Git.

## BE01 — database, API dự kiến và dữ liệu mẫu

TV3 có thể dùng [fixture API tổng hợp](fixtures/api/README.md) để dựng giao diện
trước khi có API server. Đọc [đặc tả API](docs/api.md),
[thiết kế PostgreSQL](docs/database.md) và [checklist bàn giao](docs/be01-checklist.md).
BE01 chưa triển khai indexer, HTTP server hoặc xử lý reorg thực tế.

Kiểm tra fixture với Node.js (CI pin 24.15.0; chỉ dùng thư viện chuẩn):

```powershell
node scripts/check_be01.mjs
```

Checker đọc trực tiếp JSON và tự chạy regression cho logIndex toàn block,
snapshot theo timestamp block tạo và thứ tự phát log. Metadata offline nằm ở
`fixtures/api/simulation.json`; vẫn có 45 proposal, trang 20/20/5. Dữ liệu mới
dùng revision `fixture-v2`; bỏ cursor v1. Hướng dẫn kiểm tra sinh lại xác định
và các giới hạn đối chiếu hash nằm trong README fixture.

Trên Linux/macOS có Docker, chạy cùng runner SQL với CI:

```bash
bash scripts/check_be01_database.sh
```

Runner tạo container PostgreSQL 18.4 mới, không có mạng hoặc port công khai,
mount SQL read-only, chạy migration rồi constraints với `ON_ERROR_STOP`,
và xóa đúng container/anonymous volume do nó tạo kể cả khi kiểm tra lỗi.
Log in ra terminal (CI lưu artifact). Cần quyền truy cập Docker daemon;
không đổi permission socket hoặc dùng database đang chạy để vượt lỗi môi trường.

Kiểm tra migration và ràng buộc bằng cụm PostgreSQL tạm độc lập trên Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be01_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

Script tạo cụm mới trong thư mục tạm, tự dừng sau kiểm tra và giữ log để xem lại;
không kết nối hoặc xóa database đang có. Cách chạy SQL trên hệ điều hành khác
nằm trong tài liệu database. Schema và API vẫn chờ nhóm review.
