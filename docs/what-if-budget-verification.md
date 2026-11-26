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
# PG_BIN=/absolute/path/usr/lib/postgresql/16/bin
# PG_SHARE=/absolute/path/usr/share/postgresql/16
# LD_LIBRARY_PATH=/absolute/path/usr/lib/x86_64-linux-gnu nếu cần libpq riêng
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
