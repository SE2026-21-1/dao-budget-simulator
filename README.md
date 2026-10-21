# DAO Budget Simulator

Mô phỏng quản lý ngân sách DAO: proposal → voting → queue → timelock → giải ngân BUD.
Chỉ dùng local/testnet, không dùng tiền thật. Nhánh TV4 đã tích hợp SC01, token
GOV/BUD, Treasury và BE02 đọc log RPC/lưu PostgreSQL. Có unit tests, kiểm thử
stateful Treasury và smoke giao dịch local. Chưa có Governor/Timelock đầy đủ,
HTTP API hoặc ví giao dịch frontend; chưa chạy được demo DAO end-to-end.

## Trạng thái các task TV1

| Task | Trạng thái |
|---|---|
| SC01 — Nền tảng và chuẩn tích hợp | Đã triển khai, còn các mục review/tái lập trong docs/contracts.md |
| SC02 — Token và voting power | Đã tích hợp từ Dev qua PR #10; có unit test và review TV4 |
| SC03 — Treasury và chống chi lặp | Đã tích hợp từ Dev qua PR #11; review độc lập TV4 được ghi riêng |
| SC04 — Governor và giới hạn proposal | Đã tích hợp từ `f57fcfd`; TV4 kiểm chứng độc lập và chờ peer review |
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
GOV/BUD/Treasury đã tích hợp từ `Dev` tại `1f40748`; BudgetGovernor từ `f57fcfd`. TimelockController dùng dependency OpenZeppelin đã khóa; SC05 chưa được bàn giao riêng.

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
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh
```

Job contracts dùng Foundry 1.8.5, Python 3.12, Node 24.15.0 và profile `ci`
(256 fuzz runs, 100 invariant runs × 50 thao tác, seed `0x20261021`). Job này
còn deploy BUD/Treasury trên Anvil tạm để kiểm giao dịch thật và decoder BE02.
Job BE01 kiểm fixture/SQL; job BE02 cài dependency theo lockfile, typecheck,
build, 63 bài kiểm tra RPC/decoder và 21 bài storage/CLI trên PostgreSQL 18.4
cô lập. Mỗi job giữ log, SHA và phiên bản trong artifact 14 ngày.

Workflow chạy khi push vào `main`, `Dev`, `feature/**` hoặc mở/cập nhật PR.
Lần đầu cần mạng để tải công cụ, compiler, dependency và image PostgreSQL.
Không cần RPC ngoài hoặc private key; Docker local cần quyền daemon hợp lệ.

[CI bản triển khai `7a0ab33`](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342)
đã chạy thành công cả ba job; [metadata và log SQL](docs/evidence/tv4-ci-7a0ab33.json).
Đây không chứng minh Governor/Timelock, checkpoint/reorg/rebuild, HTTP API,
UI wallet/E2E hay NFR07 toàn hệ thống. Xem [checklist TV4](docs/tv4-checklist.md).

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

### Smoke độc lập TV4 và invariant Treasury-only

Cần Node 24.15.0; chạy sau build ở trên:

```bash
npm ci
node --import tsx scripts/smoke_treasury.mjs --output /tmp/sc03-local-smoke.json
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/invariant/TreasuryAccounting.t.sol -vv
```

Smoke sở hữu Anvil loopback tạm, tự dừng; không nhận RPC URL/private key.
Kiểm phân quyền, chi trùng, thiếu tiền/retry và 7 Transfer/3 BudgetDisbursed
thật qua BE02. Spender EOA là thiết lập thử nghiệm, không phải Timelock.
Invariant dùng oracle lịch sử độc lập; không thay INV01–INV04 governance.
Xem [review SC03](docs/sc03-review.md) và [kết quả local](docs/evidence/tv4-local-verification-20261021.json).

## Unit test SC04

```bash
forge build
forge test --match-path 'tests/unit/BudgetGovernor.t.sol' -vv
forge test -vv
python3 scripts/check.py
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
- [Phân công TV4](docs/TV4_Cong_viec_Testing_Deployment.md)
- [Test matrix và trạng thái nghiệm thu](docs/test-plan.md)
- [Review token SC02 và smoke local](docs/sc02-review.md)
- [Review SC03 độc lập, invariant và receipt smoke](docs/sc03-review.md)
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

## BE02 — RPC log reader và decoder

BE02 được tích hợp từ `4c568d6`; [PR #12](https://github.com/SE2026-21-1/dao-budget-simulator/pull/12)
được mở để TV2/TV1 review bàn giao. CLI quét dải block hữu hạn, decode 11 event
và ghi header/raw log trong transaction PostgreSQL. Chưa có projection,
HTTP API, checkpoint, K confirmations, resume/reorg rollback hoặc rebuild.
Suite BE02 dùng synthetic RPC; smoke SC03 bổ sung decode receipt Treasury/BUD
local thật, không phải nghiệm thu SC06/full DAO hoặc chain→DB→API.

Cần Node.js 24 và PostgreSQL (đã kiểm thử với 18.4):

```powershell
npm ci
npm run build
npm run typecheck
npm run test:be02
npm run test:be02:db
node scripts/check_be01.mjs
```

Test database tự tạo và dừng một cluster tạm độc lập. Nếu binaries PostgreSQL
khác vị trí mặc định, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be02_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

Trên Linux/macOS có Docker:

```bash
npm run test:be02:db:linux
```

Runner tạo container PostgreSQL 18.4 mới, cổng host ngẫu nhiên chỉ bind
`127.0.0.1`, không dùng `DATABASE_URL` của người gọi; host chạy test CLI/RPC
và tự xóa container/anonymous volume. Đã chạy thật trên CI; không dùng
database đang có hoặc đổi quyền socket để vượt lỗi môi trường.

Để quét RPC, chuẩn bị database đã migrate cùng metadata deployment khớp cấu hình
theo [hướng dẫn indexer](docs/indexer.md), rồi chạy:

```powershell
$env:RPC_URL = 'http://127.0.0.1:8545'
$env:DATABASE_URL = 'postgresql://be02_demo@127.0.0.1:5432/be02_demo'
npm run indexer -- --config indexer/config/local.json
```

Tạo `local.json` từ [cấu hình mẫu](indexer/config/example.json), thay địa chỉ,
deployment block, ABI version và `deploymentId` bằng metadata đã xác minh.
Địa chỉ trong mẫu là synthetic. CLI không tự nạp `.env`, không tạo deployment;
exit code `2` báo raw log đã lưu nhưng có unknown topic/decode error.
Xem [checklist BE02](docs/be02-checklist.md) để biết kết quả và phần chờ SC06.
