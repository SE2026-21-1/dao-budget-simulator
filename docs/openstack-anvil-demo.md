# Demo Netlify + OpenStack/Kolla-Ansible + Anvil

## Kiến trúc và phạm vi

**OpenStack được triển khai bằng Kolla-Ansible**, mô hình lab all-in-one.
Xem [hồ sơ Kolla](../infra/kolla/README.md); không suy diễn version OpenStack,
inventory hay globals.yml chưa được cung cấp.

| Lớp | Công cụ và trách nhiệm |
| --- | --- |
| Cloud | Kolla-Ansible chạy các dịch vụ OpenStack trong container trên host lab |
| Tài nguyên tenant | [Terraform](../infra/openstack/README.md): VM, Neutron network/subnet/router, SG, keypair, port, floating IP |
| Backend demo | [Compose](../deploy/anvil-demo/compose.yml): Anvil, PostgreSQL, indexer, API; tunnel tùy chọn |
| Frontend | Netlify, repository chung, production branch `Dev` |
| DNS | P.A Việt Nam; giữ bản ghi website Netlify đang hoạt động |

Đây là Anvil demo riêng chain `31337`, **không phải Sepolia** và không khôi phục
hạ tầng staging cũ. Chỉ đọc API qua HTTPS; chưa công khai RPC để giao dịch ví.
Không thay đổi personal/individual hoặc khu vực đánh giá cá nhân.

## Inventory từ lần triển khai ngày 2026-11-25

Đây là đầu ra vận hành do người triển khai cung cấp, không phải một lần kiểm tra
live mới của CI. IDs để đối chiếu/import ở [runbook Terraform](../infra/openstack/README.md).

| Thành phần | Giá trị đã quan sát |
| --- | --- |
| Project | `dao-budget-demo` |
| VM | `dao-demo-01`, Ubuntu 22.04, 2 vCPU / 2048 MiB / 20 GiB |
| Private network | `dao-demo-net`, `10.20.30.0/24`, VM `10.20.30.192` |
| Router | `dao-demo-router`, SNAT, provider network `public` |
| Floating IP VM | `192.168.248.217`, RFC1918; chỉ lab truy cập được |
| SSH | `dao-demo-key`, ingress từ host br-ex `192.168.248.1/32` |
| Database | PostgreSQL 18.4; Docker volume `dao-demo-postgres-data` |
| Chain | Anvil/Foundry 1.8.5, hardfork Osaka, state lưu ngoài container |
| Source đang chạy | `896f93ea282d76fa72339a97ea12339240c16da4` |
| Public deployment name | `dao-demo-anvil`; SQL ID đã cấp trong DB này: `1` |
| Publication | H=19, Treasury 10.000 BUD, 0 đề xuất/chi |
| Decode | 16 unknown topics, 0 decode errors; HTTP health vẫn `degraded` |

Raw start block là `2` (bốn vai trò raw), không dùng block GOV sớm hơn làm prefix.
API healthcheck xác nhận database up/publication ready, **không** chứng minh
rawDecodeComplete. Không đổi unknown thành decoded để làm health xanh.

## Khai báo và tạo VM

Theo [infra/openstack](../infra/openstack/README.md). Project/flavor đã được tạo
thủ công nên import tài nguyên hiện tại trước; không apply tạo một VM thứ hai.
Cloud-init chỉ dành cho VM mới. Không cần Cinder; không xóa Docker volume Kolla
hoặc lab cũ để lấy dung lượng. Quota không đảm bảo host còn RAM/disk thật.

## Các file riêng trên VM

```text
/home/ubuntu/dao-demo/
  anvil/state.json
  config/deployment.json
  config/indexer.json
  config/frontend.json
  config/postgres.env
  config/runtime.env
  config/before-migrations.dump
```

Đây là dữ liệu vận hành ngoài Git. Không copy cả thư mục vào repo.
`postgres.env`/`runtime.env` có quyền 600, thư mục cha 700; không commit private key,
database URL/password, cursor secret, token, Terraform state/plan hay bản dump.
`indexer.json` được mount trực tiếp cho user `node`, cần file readable (644);
thư mục host vẫn riêng tư. Compose giữ nguyên manifest và config hiện có.

`runtime.env` cần các tên biến sau, **giữ nguyên giá trị bí mật đang dùng**:

- `DATABASE_URL` trỏ hostname `dao-demo-postgres:5432`.
- `API_CURSOR_SECRET` ổn định, tối thiểu 32 bytes.
- `CHAIN_ID=31337`, `DEPLOYMENT_ID=dao-demo-anvil` (tên công khai, không phải SQL ID).
- `RPC_URL=http://dao-demo-anvil:8545`.
- `API_HOST=0.0.0.0`, `API_PORT=3000` (bên trong container).
- `API_CORS_ORIGINS=https://dao-budget-simulator.xyz`.

## Chuẩn bị Compose cho deployment đã có

Compose yêu cầu Docker Compose >=2.24.4, hai network external và volume đã có.
Trên **VM ubuntu@dao-demo-01**, kiểm tra thay vì tạo trùng:

```bash
sudo docker network inspect dao-demo dao-demo-db --format '{{.Name}} internal={{.Internal}}'
sudo docker volume inspect dao-demo-postgres-data --format '{{.Name}}'
cd "$HOME/dao-budget-simulator"
cp deploy/anvil-demo/.env.example deploy/anvil-demo/.env
id -u
id -g
sudo docker inspect dao-demo-tunnel --format '{{.Config.Image}}'
```

Sửa `.env` cục bộ: `DAO_DEMO_HOME=/home/ubuntu/dao-demo`, UID/GID của user,
hai image tag đã kiểm thử và `TUNNEL_IMAGE` bằng digest từ container đang chạy.
Không dùng chuỗi REPLACE_WITH. Nếu chưa có tunnel image, pull official
`cloudflare/cloudflared` rồi lấy `RepoDigests` và ghi digest vào file cục bộ.

```bash
sudo docker compose --env-file deploy/anvil-demo/.env -f deploy/anvil-demo/compose.yml config --quiet
```

Lệnh trên chỉ validate, không khởi chạy. Không in `compose config` đầy đủ vì có thể
render secrets từ env_file. App yêu cầu config đã được chuẩn bị; file này không
tự migrate database, deploy lại hợp đồng hoặc tạo journal/metadata giả.

### Chuyển container tạo tay sang Compose trong thời gian bảo trì

**Không chạy tự động chỉ vì pull Git.** Container cũ cùng tên sẽ xung đột; chỉ
chuyển sau khi kiểm tra backup và chấp nhận gián đoạn ngắn. Trước khi dừng, lưu
phản hồi API health/summary làm mốc H/hash/revision và số dư để đối chiếu sau.

```bash
umask 077
DAO_BACKUP_DIR="$HOME/dao-demo-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DAO_BACKUP_DIR"
chmod 700 "$DAO_BACKUP_DIR"
# Dừng writer và flush Anvil state bằng shutdown bình thường.
sudo docker stop --time 60 dao-demo-tunnel dao-demo-api dao-demo-indexer dao-demo-anvil
sudo docker exec dao-demo-postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DAO_BACKUP_DIR/database.dump"
test -s "$DAO_BACKUP_DIR/database.dump"
tar -czf "$DAO_BACKUP_DIR/anvil-config.tar.gz" -C "$HOME/dao-demo" anvil config
sha256sum "$DAO_BACKUP_DIR/database.dump" "$DAO_BACKUP_DIR/anvil-config.tar.gz"
```

Nếu backup có lỗi, dừng và xử lý; không chạy phần xóa container. Kiểm tra restore
database vào DB tách biệt khi cần xác minh khả năng phục hồi; không restore đè live.
Anvil state và database phải được giữ theo cùng bộ backup. Không tự tạo chain mới
rồi dùng lại metadata DB cũ.

Khi backup đã xác nhận, chỉ bỏ **container**; không bỏ volume/bind data:

```bash
sudo docker stop --time 60 dao-demo-postgres
sudo docker rm dao-demo-tunnel dao-demo-api dao-demo-indexer dao-demo-anvil dao-demo-postgres
sudo docker compose --env-file deploy/anvil-demo/.env -f deploy/anvil-demo/compose.yml up -d --wait postgres anvil indexer api
# Tùy chọn: bật tunnel tạm. Lấy URL MỚI sau khi container được tạo lại.
sudo docker compose --env-file deploy/anvil-demo/.env -f deploy/anvil-demo/compose.yml --profile tunnel up -d tunnel
sudo docker logs --tail 40 dao-demo-tunnel
```

Không dùng `docker system prune --volumes`, `docker volume rm`, `anvil_reset`,
không xóa state hoặc chạy lại `deploy_local.mjs` trên chain đã deploy.
Volume PostgreSQL là external nên Compose không quản lý vòng đời của nó.
Hai network cũng external: DB internal, edge bridge cho host port publishing.
API có cả hai network; lần triển khai thực tế chỉ có DB internal đã không publish
được cổng host cho đến khi thêm edge network.

## Kiểm tra sau khởi động/restart

```bash
sudo docker compose --env-file deploy/anvil-demo/.env -f deploy/anvil-demo/compose.yml ps
sudo docker exec dao-demo-anvil cast chain-id --rpc-url http://127.0.0.1:8545
sudo docker exec dao-demo-anvil cast block-number --rpc-url http://127.0.0.1:8545
curl --fail-with-body --silent --show-error 'http://127.0.0.1:3000/api/health?chainId=31337&deploymentId=dao-demo-anvil'
curl --fail-with-body --silent --show-error 'http://127.0.0.1:3000/api/summary?chainId=31337&deploymentId=dao-demo-anvil'
```

Đối chiếu chain/H/hash/address/số dư với trước bảo trì, không chỉ container Up.
Nếu chain trở về block 0, dừng indexer/API và kiểm tra state mount; không tự reseed.
Publication/worker phải ready, nhưng vẫn báo `degraded` nếu còn unknown topics.
Chưa chạy nghiệm thu restart/restore trên cloud chỉ bằng cách commit file này.

## Netlify, HTTPS và DNS

Netlify dùng repo `SE2026-21-1/dao-budget-simulator`, branch `Dev`, base directory
trống, build `npm ci --prefix frontend && npm run build --prefix frontend`, publish
`frontend/dist`, Node `24.15.0`. Production env:

```dotenv
VITE_DATA_SOURCE=live
VITE_API_BASE_URL=https://YOUR-CURRENT-TUNNEL.trycloudflare.com
VITE_CHAIN_ID=31337
VITE_DEPLOYMENT_ID=dao-demo-anvil
VITE_CHAIN_NAME=DAO Anvil Demo
```

URL trên là placeholder, thay bằng URL thực. Không thêm `/api` cuối API base.
Không đặt `VITE_RPC_URL` ở demo chỉ đọc và không đặt `VITE_CONTAINER_RUNTIME=1`
cho static Vite build. Không đưa secret backend vào biến VITE. Thay env phải
build/deploy lại. Kiểm tra browser Network: request đúng chain/name, `dataKind=chain`,
Treasury 10.000 BUD khi chưa có giao dịch mới; dữ liệu fixture không phải nghiệm thu.

Quick Tunnel chỉ phục vụ HTTP API, không public Anvil unlocked RPC/PostgreSQL.
URL có thể đổi khi tunnel restart/recreate; không có uptime guarantee. Endpoint
ổn định/named tunnel là việc tiếp theo, chưa được triển khai bởi tài liệu này.
DNS P.A Việt Nam giữ `@ A 75.2.60.5` và `www CNAME dao-budget-simulator.netlify.app`
như đầu ra đã cung cấp; không trỏ DNS public vào IP RFC1918 của VM.

## Còn cần hoàn thiện

- Đối chiếu ABI cho 16 bootstrap unknown topics; giữ health degraded cho tới khi có bằng chứng.
- Kiểm tra restart/restore thực tế trong thời gian bảo trì.
- Thay Quick Tunnel bằng endpoint HTTPS ổn định.
- Thu thập release/inventory/globals Kolla đã redact nếu cần tái dựng toàn bộ cloud.

Không coi Terraform validate, Compose render hay CI syntax checks là bằng chứng
đã apply cloud, chuyển container đang chạy, restore dữ liệu hoặc chạy testnet.
