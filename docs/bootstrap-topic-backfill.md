# Bổ sung decode cho các bootstrap administrative events

## Nguyên nhân và thay đổi

Raw ABI trước đây chỉ bao gồm business event, trong khi BE04 có danh sách riêng
để kiểm tra và bỏ qua administrative event khỏi business model. Vì vậy dữ liệu
được publish đúng nhưng raw health vẫn degraded với 16 unknown topics.

`indexer/ancillary-abi.ts` dùng chung danh sách chính xác cho raw decoder và
projector. Canonical encoding/indexed count vẫn được kiểm tra bởi decodeLog;
topic thật sự lạ vẫn unknown, dữ liệu sai vẫn decode_error. Không sửa health
để giấu cảnh báo, không thay ABI version/chain/deployment scope hay migration.

Regression từ receipt BE03 được lưu trong repo xác nhận 16 event (governor 5,
timelock 7, treasury 4) decode đầy đủ và raw bytes không đổi. Compiler ABI checks
đối chiếu toàn bộ fragment quản trị với shared ABI đã ghim. Business projection
vẫn bỏ qua chúng, không tạo proposal hay tính thêm dòng tiền.

## Deployment đang có cần backfill riêng

Release mới decode đúng log mới nhưng không tự ghi lại các row cũ khi worker
idle. Vì vậy phải chạy CLI `--redecode` có chủ đích sau khi release mới đã qua CI
và CD đã dùng đúng image. Không chạy migration, không rescan/reset chain, không
UPDATE unknown thành decoded bằng SQL. Dùng chính bytes đã lưu để tính lại.

1. Tạm dừng timer CD và chờ service không còn activating/active. Ghi lại image
   và health/summary làm baseline. Nếu service còn chạy, không kill giữa rollout.
2. Sao lưu DB và config ngoài Git, xác nhận archive và checksum như runbook chính.
3. Dừng riêng worker indexer bằng Compose; API tiếp tục đọc publication hiện có.
4. Chạy một tiến trình CLI cùng image release mới:

```bash
sudo -n docker compose --env-file deploy/anvil-demo/.env \
  -f deploy/anvil-demo/compose.yml stop --timeout 30 indexer
sudo -n docker compose --env-file deploy/anvil-demo/.env \
  -f deploy/anvil-demo/compose.yml run --rm --no-deps \
  --entrypoint node indexer /app/dist/indexer/cli.js \
  --config /run/dao/indexer.json --redecode
```

CLI giữ transaction/advisory lock và kiểm tra metadata. Exit 0 nếu decode không
còn issue, exit 2 nếu còn issue. Nếu lỗi, giữ report/backup, không reset chain.
Khởi động lại worker để phục vụ canonical checks, rồi chẩn đoán các row còn lỗi.

```bash
sudo -n docker compose --env-file deploy/anvil-demo/.env \
  -f deploy/anvil-demo/compose.yml up -d --no-deps --pull never \
  --wait --wait-timeout 180 indexer
curl --fail-with-body --silent --show-error \
  'http://127.0.0.1:3000/api/health?chainId=31337&deploymentId=dao-demo-anvil'
```

5. Đối chiếu raw row IDs/topics/data/receipt coordinates không đổi; H/hash/revision,
   Treasury và proposals không đổi nếu không có giao dịch mới. Chờ worker publish
   lại: unknownTopics=0, decodeErrors=0, rawDecodeComplete=true. Administrative
   events vẫn được ghi ignoredAncillaryEvents=16 trong projection.
6. Khi tất cả đạt, bật lại timer CD. Đây là cập nhật derived decode metadata;
   rollback image cũ không hoàn tác backfill và có thể cần re-decode lại với ABI
   cũ. Không thực hiện downgrade decoder tùy tiện sau maintenance.

Không thể kết luận live VM đã hết degraded chỉ từ unit tests hoặc CI. Cần lấy
đầu ra CLI/health/SQL trên deployment thực tế để nghiệm thu.
