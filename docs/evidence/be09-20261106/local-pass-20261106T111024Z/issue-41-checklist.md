# Nháp #41 — nghiệm thu frontend và ví local

**Tất cả mục dưới đây PENDING.** Lượt backend/local PASS trong [gói](README.md)
không phải nghiệm thu browser hoặc extension-wallet. Dùng ví thử nghiệm và
deployment local xác định bởi manifest/runtime đang sống; không đưa private key
hay secret vào evidence. Lưu browser/OS, ví/version, chain ID, deployment name,
manifest, thời gian, viewport, H/hash/revision, tx hash và ảnh/log đã lọc.

TV2 chịu trách nhiệm đối soát backend/contract và hỗ trợ kiểm checkpoint,
publication; TV3 trực tiếp thực hiện frontend/ví; TV4 nghiệm thu độc lập và
ghi rõ xác nhận hoặc lỗi còn mở. Chọn môi trường test cô lập phù hợp trước khi
gây lỗi/reorg; không thao tác phá trạng thái run đang dùng chung.

## TV3 — đọc và trạng thái UI

- [ ] Dashboard lấy API thật, không fixture; ghi H/hash/revision và đối chiếu
  cùng scope với API. Kiểm health `ready` và thể hiện đúng cảnh báo degraded.
- [ ] Kiểm empty state, lỗi API/mất kết nối, phân trang có nhiều trang, ID sai
  hoặc không tồn tại, và dữ liệu cũ/stale; không hiển thị fixture như live.
- [ ] Kiểm cursor bị invalidated với HTTP 409 và recovery/not-ready HTTP 503;
  UI giải thích và cho phép refresh/retry phù hợp. Ghi cách tạo tình huống và
  evidence trên môi trường cô lập, không giả vờ đã chạy trường hợp này.
- [ ] Kiểm viewport 390px và 1366px, điều hướng bàn phím/focus và thao tác
  chính; lưu ảnh và bước tái hiện.

## TV3 — ví và giao dịch

- [ ] Kết nối ví đúng chain/deployment; thử sai mạng và xác nhận UI chặn ghi,
  cho phép người dùng khắc phục.
- [ ] Từ chối ký và thử giao dịch revert/retry; UI phân biệt lỗi và không báo
  thành công. Ghi bước, trạng thái và tx hash nếu có.
- [ ] Thực hiện giao dịch thật trên local → receipt → worker publication → API
  → UI; cùng TV2 đối chiếu hash, block và trạng thái ở từng bước.
- [ ] Tạo trường hợp receipt đã xác nhận nhưng worker/API chưa index; UI phải
  phản ánh chờ cập nhật, sau đó refresh đúng khi publication đến. Ghi lại cách
  kiểm soát worker trong môi trường cô lập.

## TV2/TV4 — đối chiếu và nghiệm thu

- [ ] TV2 xác nhận contract, receipt, raw checkpoint và API snapshot theo
  H/hash liên quan; xác nhận rõ khi chưa có publication hoặc có recovery.
- [ ] TV4 chạy/review độc lập các trường hợp, đối chiếu evidence, ghi PASS/FAIL
  riêng và theo dõi lỗi; không suy ra PASS từ kết quả của TV3 hoặc TV2.
- [ ] Testnet và các điều kiện TV3/TV4 còn chờ được theo dõi riêng; chỉ đóng
  nghiệm thu sau khi có bằng chứng tương ứng.
