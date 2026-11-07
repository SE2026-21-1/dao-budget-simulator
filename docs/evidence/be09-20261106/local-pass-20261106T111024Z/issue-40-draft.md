# Nháp cập nhật #40 — TV2 bàn giao BE09 local cho TV3

**Nháp trong repository; chưa đăng.** TV2 đã có local verify PASS ngày
2026-11-06; TV3 chưa xác nhận trên máy của mình. BE09 chưa hoàn tất testnet
hoặc nghiệm thu TV3/TV4.

SHA nền `681289bb1f11db87bdfcb15c6b28d1d995229835`; sáu script BE09 là thay
đổi local chưa commit tại thời điểm verify, không nằm trong SHA đó. Hash tại verify và khác biệt
preflight tài liệu sau verify được ghi trong [gói evidence](README.md).
Frontend TV3 đang dùng đã có ở SHA nền; patch BE09 này không được trình bày
như một thay đổi frontend mới.

Run `20261106T105820Z-262c5151e980`, chain `31337`, deployment name
`be09-local-20261106T105820Z-3225088c3bdc`. Manifest của run trên máy nguồn:
`/home/cuongdz/.local/state/dao-budget-be09/runs/20261106T105820Z-262c5151e980/public/manifest.json`;
[bản lưu công khai](manifest.json) là evidence lịch sử. Report
[PASS](verify-report.md), [results](results.json), [Vitest](frontend-api-live-test.vitest.json).
Lượt kiểm có H=24,
hash `0x9a23133c9f90387329db7483c90055843e24bbbce8af15248ff0ded44204fa6a`,
revision `ae00bfe8-550e-41a0-9013-292d618f3982`; sáu GET HTTP 200,
đối soát contract/API, CORS và restart worker PASS, FE live 1 pass/0 skip.

Theo runtime metadata của run nguồn: RPC `http://127.0.0.1:18545`, API
`http://127.0.0.1:3300`, frontend `http://127.0.0.1:5173`. Các URL này chỉ
truy cập được trên **cùng máy** và không phải cam kết service còn sống trên
máy TV3. TV3 chưa xác nhận truy cập. Không mở cổng LAN hoặc thay đổi firewall.
TV3 tự dựng run tương đương theo [hướng dẫn](../../../be09.md) sau khi nhận đúng
patch local và chuẩn bị toolchain; máy khác phải điều chỉnh các đường dẫn
toolchain pin trong script. Runner ghim HEAD vào SHA nền, vì vậy làm theo bước
checkout SHA nền và trích file từ nhánh review trong runbook; checkout trực tiếp
commit BE09 không thỏa preflight. Dùng manifest/name của run mới, không tái sử dụng
address lịch sử làm address đang sống.

Trên máy nguồn để kiểm run này:

```bash
cd /home/cuongdz/projects/dao-budget-be09
export BE09_RUN_DIR=/home/cuongdz/.local/state/dao-budget-be09/runs/20261106T105820Z-262c5151e980
bash scripts/be09-local.sh status
bash scripts/be09-local.sh verify
```

`verify` khởi động lại worker và ghi report mới trong `$BE09_RUN_DIR/reports/`.
Không chạy `up` để kiểm run đang sống. Log ở `$BE09_RUN_DIR/logs/`;
runtime metadata ở `$BE09_RUN_DIR/runtime.json`.

TV3 cần xác nhận:

- [ ] Nhận đúng SHA nền **và** script local đã bàn giao; ghi source/hash và
  môi trường run của mình.
- [ ] Có run riêng hoặc cùng máy đã được phép dùng; xác nhận chain ID, RPC,
  API, frontend, manifest và deployment name từ runtime tương ứng.
- [ ] Frontend dùng API thật, CORS và đúng cấu hình manifest; xác nhận health,
  giải thích cảnh báo degraded nếu có.
- [ ] Review contract-to-API scope và lỗi live; ghi kết quả/ảnh ở issue #41,
  không đánh dấu browser/wallet PASS chỉ từ test Vitest của TV2.
- [ ] Báo TV2/TV4 H/hash/revision, log và trở ngại. Chờ TV4 nghiệm thu độc lập.
