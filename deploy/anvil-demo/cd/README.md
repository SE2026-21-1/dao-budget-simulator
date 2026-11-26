# Pull CD cho VM demo

VM chủ động lấy release từ GitHub/GHCR, không cần inbound SSH từ GitHub Actions
và không cài self-hosted runner cho repository public. Agent chỉ thay hai image
API/indexer. Anvil, PostgreSQL, Quick Tunnel, Terraform và Kolla không thuộc rollout.
Đọc [runbook chính](../../../docs/openstack-anvil-demo.md) trước khi vận hành.

## Những gì được kiểm tra

1. HEAD hiện tại của `Dev`, CI run `push` từ đúng repository, workflow/path/name
   và trạng thái completed/success. CI workflow blob được ghim trong agent;
   thay CI policy cần review và cài lại agent, không tự tin tưởng policy mới.
2. Đúng một artifact `release-SHA` còn hạn thuộc run đó; checksum SHA256 ZIP
   khớp API GitHub. ZIP chỉ được có `manifest.json`, không extract file tùy ý.
3. Manifest khớp repository/SHA/run ID, ba image digest và migration fingerprint.
4. Pull API/indexer theo digest, dùng image candidate chạy preflight schema,
   tracked migrations, metadata và RPC. Không tự migrate database.
5. Kiểm tra lại Dev chưa tiến lên trước khi đổi cấu hình. Compose chỉ chạy
   `up --no-deps --pull never indexer api`, có health wait và khóa chống chạy chồng.
6. Kiểm tra image ID thực tế, API scope/chain, publication không lùi, hash và
   số dư/proposal ở H không đổi. Unknown/decode errors không được tăng;
   `degraded` với 16 unknown topics cũ không bị che đi.
7. Nếu lỗi sau đổi env: phục hồi env cũ, khởi động lại hai app và kiểm tra lại
   image IDs cùng dữ liệu. Release lỗi bị chặn lặp cho tới khi operator retry.

Đây không phải kiểm thử nghiệp vụ đầy đủ. Agent không bảo vệ trước mọi thay đổi
ứng dụng không tương thích về dữ liệu: chỉ tự triển khai release có migration set
đã có trong DB. Thay schema hoặc vận hành reorg/restore cần quy trình riêng.
Chỉ commit được nhóm tin tưởng mới được đưa vào `Dev`.

## Điều kiện trước khi bật

- Đã chuyển API/indexer sang Compose và thử cập nhật/rollback thủ công.
- `gh` đăng nhập dưới user `ubuntu`, đọc được workflow/artifact của repo chung.
- `sudo -n docker` hoạt động; Docker root đã login GHCR bằng token classic
  `read:packages`. Token này không đặt trong unit/env file hoặc Git.
- Hai network `dao-demo`/`dao-demo-db`, volume/state/config đang có như runbook.
- Có Python >=3.9, GitHub CLI (kể cả 2.4), Docker Compose >=2.24.4.
- File `deploy/anvil-demo/.env` hiện trỏ đúng các image đang chạy.

Agent sử dụng Python stdlib, không yêu cầu Node trên host. Chạy dưới ubuntu;
chỉ lệnh Docker dùng sudo không tương tác. Chỉ cài unit dưới đây trên VM demo,
không cài trên host điều khiển Kolla. Nếu user/home khác, sửa unit và env trước.

## Cài bản script đã review, chưa bật lịch

Trên `ubuntu@dao-demo-01`, checkout commit chứa bộ file này sau khi Git sạch.
Việc checkout không cập nhật container. Thư mục `/opt/dao-demo-cd` giữ code và
Compose đã review, root sở hữu; agent không checkout hay thực thi source tải về.

```bash
cd "$HOME/dao-budget-simulator"
sudo -n install -d -m 0755 /opt/dao-demo-cd
sudo -n install -m 0644 deploy/anvil-demo/cd/agent.py /opt/dao-demo-cd/agent.py
sudo -n install -m 0644 deploy/anvil-demo/compose.yml /opt/dao-demo-cd/compose.yml
sudo -n install -m 0600 deploy/anvil-demo/cd/agent.env.example /etc/dao-demo-cd.env
sudo -n install -m 0644 deploy/anvil-demo/cd/dao-demo-cd.service /etc/systemd/system/dao-demo-cd.service
sudo -n install -m 0644 deploy/anvil-demo/cd/dao-demo-cd.timer /etc/systemd/system/dao-demo-cd.timer
sudo -n systemctl daemon-reload
```

Chạy kiểm tra trust GitHub/artifact dưới chính user ubuntu. `--check` không pull
image hay kiểm tra schema và không thay dịch vụ. Nếu HEAD đang CI, chờ release
của chính HEAD hoàn tất; không dùng release cũ để vượt qua CI đang lỗi.

```bash
DAO_CD_ROOT="$HOME/dao-demo" \
DAO_CD_COMPOSE_ENV="$HOME/dao-budget-simulator/deploy/anvil-demo/.env" \
DAO_CD_COMPOSE_FILE=/opt/dao-demo-cd/compose.yml \
python3 /opt/dao-demo-cd/agent.py --check
```

Khi CHECK_OK, chạy service một lần có quan sát (có thể cập nhật app):

```bash
sudo -n systemctl start dao-demo-cd.service
sudo -n journalctl -u dao-demo-cd.service -n 40 --no-pager
```

Mong đợi `ALREADY_CURRENT SHA` hoặc `RELEASE_UPDATE_OK SHA`. Chỉ khi lần chạy
này đạt mới bật timer; kiểm tra lại website và API sau đó:

```bash
sudo -n systemctl enable --now dao-demo-cd.timer
systemctl list-timers dao-demo-cd.timer --all
```

Timer kiểm tra sau boot khoảng 2 phút và khoảng 2 phút sau lần chạy kết thúc,
có jitter tối đa 15 giây. Không có CD đang hoạt động chỉ vì commit các file này;
phải cài và bật timer trên VM. Timeout service 20 phút, có thể gián đoạn API ngắn
trong mỗi rollout. Không cần restart Quick Tunnel nên không đổi URL do CD.

## Theo dõi, dừng và phục hồi

```bash
sudo -n journalctl -u dao-demo-cd.service -n 60 --no-pager
sudo -n systemctl disable --now dao-demo-cd.timer
systemctl is-active dao-demo-cd.service
```

Dừng timer không hủy service đang chạy. Chờ service kết thúc trước thao tác
thủ công; không kill ngang trong rollout. Dữ liệu đối chiếu nằm dưới
`~/dao-demo/cd/`, gồm env rollback, snapshot trước/sau, `applied.json` hoặc
`failed.json`; giữ private, không đưa lên Git.

Sau khi chẩn đoán và sửa nguyên nhân release lỗi, chỉ operator chạy lại với
`--apply --retry-failed` cùng ba biến đường dẫn ở trên. Timer không tự retry
release đã bị đánh dấu lỗi.

Nếu có `pending.json`, tiến trình trước đã bị ngắt: agent chặn mọi apply mới.
Dừng timer, kiểm tra file này để lấy thư mục evidence và image IDs trước đó.
Đối chiếu container đang chạy và `.env`. Nếu cần rollback, khôi phục
`compose-before.env` trong evidence về đường dẫn Compose env, chạy Compose
`up -d --no-deps --pull never --wait indexer api`, kiểm tra health/image/data.
Chỉ xóa `pending.json` sau khi xác nhận trạng thái ổn định; không xóa state/DB
và không tự restore dump đè dữ liệu mới. `ROLLBACK_FAILED` cần operator xử lý,
không phải bằng chứng đã quay lại bản cũ thành công.

GHCR token có hạn: gia hạn/thay bằng lệnh login có password-stdin khi cần.
Không chạy `gh auth status --show-token`, `cat` credential file hay in đầy đủ
Compose config ra log/chát. Agent cố ý không in stdout/stderr của lệnh chứa secret.

## Kiểm thử

```bash
python3 -m unittest discover -s deploy/anvil-demo/cd -p 'test_*.py' -v
```

Tests mô phỏng GitHub/Docker để kiểm tra trust boundary, preflight rejection,
head race, rollback, chặn retry, image scope và xử lý ngắt. Không phải bằng chứng
đã bật timer hoặc thử rollout/rollback live trên cloud.
