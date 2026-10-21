# DAO Budget Simulator

Mô phỏng quản lý ngân sách DAO: proposal → voting → queue → timelock → giải ngân BUD.
Chỉ dùng local/testnet, không dùng tiền thật. Contract trên `Dev` hiện có nền tảng
SC01; TV2 có schema/fixture BE01 và CLI đọc log BE02. Chưa có token, Treasury
hoặc Governor triển khai trên nhánh này, chưa chạy được demo end-to-end.

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
Để kiểm tra toàn bộ test khi các task tiếp theo được triển khai, dùng `forge test`.
Cấu hình tìm test trong `tests/` để nhận cả unit/invariant/attacks sau này.
Không suy ra test thành công từ artifact `out/` có sẵn.

## Tài liệu và chuẩn tích hợp

- [Yêu cầu nhóm](docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
- [Phân công TV1](docs/requirements/TV1_Cong_viec_Smart_Contracts.md)
- [Giao tiếp contract và quyết định chờ review](docs/contracts.md)
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

## BE02 — RPC log reader và decoder

BE02 quét một dải block hữu hạn, decode 11 event theo ABI đã xác định nguồn và
ghi header/raw log vào PostgreSQL bằng transaction. Chưa có projection, API server,
checkpoint, K confirmations, resume/reorg rollback hoặc rebuild. Trên `Dev` hiện
chưa có receipt SC06; kiểm thử dùng dữ liệu synthetic riêng, không chứng minh
nghiệm thu bằng giao dịch thật.

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
