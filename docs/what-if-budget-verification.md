# What-if Budget Simulator — kiểm chứng bổ sung

## API regression: điều kiện môi trường, không sửa test

Bảy test `tests/api/server.test.mjs` trước đây dừng ở guard thiếu
`BE05_TEST_ISOLATED=1` và DB riêng. Đã đọc `databaseUrl()`/`seed()` và giữ nguyên
mọi assertion, guard, SQL migration, query timeout 6s và statement timeout 5s.

Môi trường bổ sung: Ubuntu 24.04, Node 24.15.0; Docker không có. Download các package
Ubuntu `postgresql-16`, `postgresql-client-16`, `libpq5`, giải nén bằng `dpkg-deb -x`
vào thư mục tạm, không cài dịch vụ hệ thống. Version thực chạy: **PostgreSQL 16.15**
(`16.15-0ubuntu0.24.04.1`), không gọi đó là CI PostgreSQL 18.4.

Hai cluster mới trên filesystem `/tmp` bị client query timeout trong migration đầu.
Giữ log FAIL, không tăng timeout hoặc đổi SQL. Chuyển **chỉ thư mục data của cluster
mới** sang `/dev/shm` (tmpfs); giữ fsync mặc định, schema/test/config không đổi.
Lượt này đạt **7 PASS / 0 FAIL / 0 SKIP**, exit 0 (~2,11s). Không suy ra proof tuyệt
đối về nguyên nhân I/O từ một lượt PASS; kết quả xác nhận test chạy được trong môi
trường cô lập đủ nhanh. Cả ba cluster được `pg_ctl -m fast -w stop`, không chạm DB
hoặc listener sẵn có.

Tất cả bảy named tests thực sự chạy: endpoints/financial semantics; heartbeat stale
boundary; RPC verification timestamp; keyset pagination/fixed-H publication; BE07
recovery gates; filters/errors/unavailable/database failure; migrations 001–004
freshness. Không chỉ test wrapper hoặc skipped tests.

Cách tái lập native (paths tới binaries/share/lib đã giải nén do người chạy cung cấp):

```sh
set -euo pipefail
# PG_BIN=/absolute/path/usr/lib/postgresql/16/bin
# PG_SHARE=/absolute/path/usr/share/postgresql/16
# LD_LIBRARY_PATH=/absolute/path/usr/lib/x86_64-linux-gnu nếu cần libpq riêng
: "${PG_BIN:?Set extracted PostgreSQL bin path}"
: "${PG_SHARE:?Set extracted PostgreSQL share path}"
# Chỉ dùng cluster mới do lượt này tạo, không reuse database đang phục vụ.
run_root=$(mktemp -d /dev/shm/dao-what-if-api-XXXXXXXX)
pg_port=$(node --input-type=module -e '
  import net from "node:net";
  const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{
    console.log(s.address().port); s.close();
  });')
"$PG_BIN/initdb" -D "$run_root/data" -L "$PG_SHARE" -U what_if_test \
  --auth-local=trust --auth-host=trust --no-locale --encoding=UTF8
"$PG_BIN/pg_ctl" -D "$run_root/data" -l "$run_root/postgres.log" \
  -o "-h 127.0.0.1 -p $pg_port -k $run_root" -w start
trap '"$PG_BIN/pg_ctl" -D "$run_root/data" -m fast -w stop' EXIT
"$PG_BIN/psql" -h 127.0.0.1 -p "$pg_port" -U what_if_test -d postgres \
  -c 'CREATE DATABASE tv4_be05_what_if;'
BE05_TEST_ISOLATED=1 \
BE05_TEST_DATABASE_URL="postgresql://what_if_test@127.0.0.1:$pg_port/tv4_be05_what_if" \
node --import tsx --test tests/api/server.test.mjs
```

Trust auth ở đây chỉ cho throwaway cluster loopback trên máy test, không phải cấu
hình triển khai. Khi shell/port/start lỗi phải dừng, không nối vào server khác. Có
thể dùng wrapper Docker hiện có `npm run test:api:db` để kiểm đúng PG 18.4 khi Docker
khả dụng. Không thay thế benchmark/receiver/live DB acceptance bằng lượt API này.

## Differential: engine so với production Treasury trong EVM

```sh
npm run test:simulator:differential
```

`tests/simulator/TreasuryDifferential.t.sol` dùng trực tiếp `contracts/Treasury.sol`
và `BudgetToken.sol`, khởi tạo contract **bên trong Foundry test VM**, không script
broadcast, fork, network deployment, Anvil hay FFI. Mỗi step gọi contract thật và
đọc `balanceOf`/`paidRequests`; không tự implement thuật toán Treasury làm oracle.
Các observations được emit dạng ABI-encoded test logs, không phải receipts on-chain.

Node integration test chạy Forge JSON verbose, đòi đúng chín named campaigns PASS
và đúng một observation/campaign, decode actual requests/steps/initial paid state,
rồi đưa chính input đó qua `simulateBudget`. Sau **từng step**, so success/failure,
Treasury balance và paid flags của mọi request; đồng thời so final balance/paid set.
Test này bắt buộc nếu gọi command, không SKIP nếu thiếu Forge: thiếu tool là lỗi.
CI riêng đã thêm job Node↔Foundry và trigger contracts/shared ABI/dependency pins.

Chín campaign thực chạy:

1. Disbursement thành công và exact balance.
2. Insufficient funds, paid state/balance không đổi.
3. Shared request với recipient/amount khác, và replay sau thành công.
4. Top-up chưa đủ → retry thất bại → thêm một unit → retry thành công → replay thất bại.
5. Large-first cạnh tranh ngân sách.
6. Small-first, cùng bộ proposals nhưng thắng/thua khác.
7. Request lớn thất bại không cản proposal nhỏ cùng ID thành công.
8. Zero requestId đã được trả trước snapshot đầu, proposal khác vẫn chạy.
9. Balance 10.000 BUD, amount lệch **một base unit** trên miền JS safe integer:
   thiếu đúng một unit được phân biệt và retry sau top-up 1 thành công.

Kết quả: **10 Node PASS / 0 FAIL / 0 SKIP** (một parent + chín subtests), chín Forge
campaign PASS. Không cộng hai tầng thành 19 independent financial scenarios.
Treasury không có proposal execution flag; replay có thể trả RequestAlreadyPaid,
trong khi engine trả proposal-already-executed. Differential so trạng thái/boolean
success, không giả vờ hai contract có cùng revert semantics ở tầng Governor.
Eligibility được giả định true cho những campaigns này; không nghiệm thu governance.

## Snapshot adapter và các check cuối

[Thiết kế/trust boundary](what-if-budget-snapshots.md) của adapter opt-in gồm
EIP-1898 exact hash + requireCanonical, chain/header anchors trước/sau, explicit
runtime identities, token binding/18 decimals, relevant paid scope, canonical ABI
returns, sanitized errors, cancellation và whole-read deadline. Input được copy
trước await; không kết nối production API/frontend hoặc live RPC.

| Check thực chạy | Kết quả cuối |
| --- | --- |
| `npm run test:simulator` | 146 PASS / 0 FAIL / 0 SKIP: 109 core tests cũ + 37 adapter tests; vẫn có 500 generated scenarios trong một invariant test |
| `npm run test:simulator:differential` | 10 PASS / 0 FAIL / 0 SKIP, source có precision case thứ chín |
| `node --import tsx --test tests/api/server.test.mjs` trên PG16.15 tmpfs mới | 7 PASS / 0 FAIL / 0 SKIP; giữ nguyên assertions/timeouts/migrations |
| `npm run typecheck`; `npm run build` | exit 0; gồm adapter JSON ABI imports và integration test TS |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` | exit 0: 189 PASS / 0 FAIL / 0 SKIP trong 10 suites, format/build/ABI checker đạt |
| Fuzz/invariants trong lượt Foundry trên | Fuzz tests 256 runs; mỗi invariant suite 100 runs/5.000 calls/0 reverts |
| `actionlint .github/workflows/simulator.yml`; `git diff --check` | exit 0 |

Các lượt cuối chạy trên working snapshot có source tương ứng các commit mới sau
`23656c89f51e0d9b146788880c22d961b30ef9d8`; từng phần được kiểm trước commit. Không
claim GitHub CI hoặc exact-final-docs-HEAD rerun chưa thực hiện. ABI/contracts cũ
không sửa; Foundry count tăng 180→189 do chín differential campaigns, không phải
production behavior change. Các FAIL/setup timeout lịch sử được giữ đúng nguồn,
không đổi thành SKIP hay xóa để gọi toàn bộ lịch sử xanh.

Không còn failure trong các check cuối đã chạy. Chưa kiểm lại API trên PG18.4 vì
Docker không có; chưa kiểm snapshot adapter trên live approved RPC/deployment/pin;
chưa nghiệm thu browser bundling, TV2/TV3 integration, real governance/timelock
eligibility hoặc consensus finality. Không push, PR, merge, hoặc broadcast.
