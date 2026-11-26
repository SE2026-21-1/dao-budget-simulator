# Endpoint API cố định: api.dao-budget-simulator.xyz

Mục tiêu: named Cloudflare Tunnel tới `http://127.0.0.1:3000` trên VM.
Tên miền vẫn đăng ký tại P.A Việt Nam; frontend vẫn chạy trên Netlify.
Không public Anvil RPC, PostgreSQL hoặc metrics. Quick Tunnel cũ chạy song song
đến khi endpoint mới đã kiểm tra và Netlify chuyển thành công.

## 1. Chuẩn bị DNS và tài khoản

Cần quyền quản trị domain và tài khoản Cloudflare. Với Full DNS setup, thêm
`dao-budget-simulator.xyz` vào Cloudflare, chọn gói phù hợp và review toàn bộ
bản ghi trước khi thay nameserver tại nhà đăng ký. Không tự giả định DNS scan
đã tìm đủ MX/TXT/CAA hoặc bản ghi xác minh dịch vụ.

Giữ nguyên nội dung các bản ghi website đang dùng và đặt **DNS only**:

| Host | Loại | Giá trị đã quan sát |
| --- | --- | --- |
| @ | A | 75.2.60.5 |
| www | CNAME | dao-budget-simulator.netlify.app |

Xuất/sao lưu toàn bộ DNS từ P.A Việt Nam. Nếu có DNSSEC/DS ở nhà đăng ký, làm
theo quy trình migration DNSSEC của Cloudflare trước khi đổi NS để tránh SERVFAIL.
Sau khi bản ghi đã đối chiếu đầy đủ, thay NS tại P.A Việt Nam bằng chính hai NS
Cloudflare cấp cho zone, không dùng NS mẫu. Chờ zone Active và website vẫn lên
bình thường. Đây là đổi nơi quản lý DNS, không transfer registrar.

Nếu đang giữ DNS ở P.A Việt Nam và chưa có Cloudflare zone phù hợp, không chỉ
thêm một CNAME api vào UUID.cfargotunnel.com rồi coi như xong: published tunnel
phải được gắn domain/zone đúng mô hình Cloudflare hỗ trợ.

## 2. Tạo remotely-managed named tunnel

Trong dashboard Cloudflare, vào khu vực Tunnels/Cloudflare One, tạo tunnel
Cloudflared tên `dao-demo-api`. Thêm published application route:

- Hostname: `api.dao-budget-simulator.xyz`.
- Service: HTTP, `127.0.0.1:3000` (connector chạy host network của VM).
- Không trỏ service tới 8545 hoặc 5432.

Dashboard tạo bản ghi DNS cho tunnel. Không nhập UUID giả hoặc tự đổi apex/www.
Không bật trang đăng nhập Cloudflare Access cho endpoint này khi frontend public
chưa có cơ chế xác thực tương ứng. API hiện chỉ hỗ trợ đọc GET/OPTIONS.

## 3. Lưu token trên VM, không đưa vào Git/chát

Token tunnel khác với GitHub PAT. Lấy riêng giá trị token từ bước cài connector
trong dashboard, không dán toàn bộ lệnh install. Lưu file ngoài repo:

```bash
python3 - <<'PY'
import getpass, os
from pathlib import Path
path = Path.home() / 'dao-demo/config/cloudflared.token'
token = getpass.getpass('Dán token của named tunnel (ẩn): ').strip()
if not token or any(char.isspace() for char in token):
    raise SystemExit('Token trống hoặc chứa khoảng trắng; không ghi file.')
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    handle.write(token)
print('TOKEN_FILE_READY')
PY
```

File thuộc user ubuntu, mode 600. Compose dùng cùng UID/GID và bind read-only;
token không nằm trong command line hay environment của container. Không ghi đè
file cũ nếu chưa review rotation. `--token-file` yêu cầu cloudflared >=2025.4.0;
image đã quan sát 2026.11.2 đáp ứng, tiếp tục dùng digest đã ghim.

## 4. Chạy connector mới song song

Checkout bản source có profile `named-tunnel`; kiểm tra Git sạch trước khi đổi
commit. Dùng Compose trong repo, không thay bản `/opt/dao-demo-cd/compose.yml`
đã review của agent. Chỉ tạo service named-tunnel:

```bash
sudo -n docker compose --env-file deploy/anvil-demo/.env \
  -f deploy/anvil-demo/compose.yml --profile named-tunnel \
  up -d --no-deps named-tunnel
sudo -n docker logs --tail 40 dao-demo-named-tunnel
```

Metrics bind loopback 20242 để tránh xung đột connector cũ. Không stop/recreate
Quick Tunnel, API, indexer, Anvil hay PostgreSQL trong bước này.

## 5. Kiểm tra và chuyển frontend

```bash
curl --fail-with-body --silent --show-error --include \
  -H 'Origin: https://dao-budget-simulator.xyz' \
  'https://api.dao-budget-simulator.xyz/api/health?chainId=31337&deploymentId=dao-demo-anvil'
curl --fail-with-body --silent --show-error \
  'https://api.dao-budget-simulator.xyz/api/summary?chainId=31337&deploymentId=dao-demo-anvil'
```

Yêu cầu HTTPS hợp lệ, HTTP 200, đúng chain/name/H/hash, số dư và header
`Access-Control-Allow-Origin` đúng website. So sánh với API loopback và tunnel cũ.
Không hạ yêu cầu TLS hoặc dùng `curl -k` để vượt lỗi certificate.

Chỉ sau khi đạt, đặt Production Netlify:
`VITE_API_BASE_URL=https://api.dao-budget-simulator.xyz` (không thêm /api),
build/deploy lại và kiểm tra browser Network thực sự gọi host mới. Giữ các biến
chain/deployment hiện có. Đọc dữ liệu đúng, không fallback fixture khi API lỗi.

Kiểm tra restart riêng named connector vẫn giữ hostname và API hoạt động, trong
khi Quick Tunnel còn dự phòng. Khi đã nghiệm thu, dừng Quick Tunnel cũ:
`sudo -n docker stop --timeout 30 dao-demo-tunnel`. Chưa xóa container cũ cho
đến khi hoàn tất rollback window. Nếu chuyển Netlify lỗi, đổi API base về URL
Quick Tunnel còn chạy và build lại; không đổi database/chain để xử lý lỗi DNS.

Named tunnel giữ hostname qua restart nhưng không thay thế uptime của VM/host
lab. Hồ sơ này chưa chứng minh domain/zone, named tunnel hay DNS đã được đổi.

Nguồn chính thức:
- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- https://developers.cloudflare.com/tunnel/reference/run-parameters/
