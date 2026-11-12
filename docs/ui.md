# Bàn giao giao diện TV3

Tài liệu này mô tả cách chạy, kiểm tra và demo bốn màn hình của DAO Budget Simulator. Giao diện đọc snapshot từ API và gửi giao dịch bằng ví EVM của người dùng. Hướng dẫn cấu hình đầy đủ nằm trong [frontend/README.md](../frontend/README.md); hợp đồng dữ liệu nằm trong [docs/api.md](api.md).

## Phạm vi hiện có

| Màn hình | Đường dẫn | Dữ liệu và thao tác |
| --- | --- | --- |
| Tổng quan | `/` | Thống kê proposal, số dư/tổng vào/tổng ra BUD, lịch sử Transfer và nạp BUD |
| Danh sách | `/proposals` | Lọc trạng thái, tra cứu đúng proposal ID và phân trang 20 mục |
| Chi tiết | `/proposals/:id` | Khoản chi, phiếu/quorum, snapshot/deadline/ETA, transaction hash, vote/cancel/queue/execute |
| Tạo đề xuất | `/proposals/new` | Kiểm tra nội dung, địa chỉ, số BUD và request ID trước khi ký |

FE01–FE09 đã có mã giao diện tương ứng. FE10 có test cho payload/amount, khám phá ví và các trường hợp API phân trang/snapshot/lỗi. Kết quả test tại máy mới cần chạy lại theo phần kiểm tra bên dưới.

## Chạy và cấu hình

Từ repository root, dùng Node 24.15.0 và lockfile frontend:

```sh
npm ci --prefix frontend
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Ứng dụng mặc định gọi API TV2 tại `http://127.0.0.1:3000`. Để đọc dữ liệu thật, cấu hình `frontend/.env.local` theo [frontend/.env.example](../frontend/.env.example) với `VITE_CHAIN_ID` và `VITE_DEPLOYMENT_ID` từ deployment; chạy PostgreSQL, indexer/projection và API theo [README](../README.md). Chỉ đặt `VITE_DATA_SOURCE=fixture` khi muốn xem dữ liệu offline và khóa giao dịch. Sau khi thay cấu hình, khởi động lại Vite. Các biến `VITE_*` công khai trong browser, chỉ chứa URL, chain ID và địa chỉ công khai.

Khi dùng API, `VITE_DEPLOYMENT_ID` và chain ID phải khớp deployment được API trả. Để gửi giao dịch, cần thêm RPC và năm địa chỉ Governor/Timelock/Treasury/GOV/BUD từ cùng deployment. API lỗi sẽ hiện lỗi; giao diện không chuyển ngầm về fixture. Chưa kết nối ví vẫn xem được dữ liệu công khai. Ví sai mạng bị chặn gửi giao dịch.

## Luồng demo local

1. Mở dashboard, ghi nhận `asOfBlock`, số dư BUD và trạng thái đồng bộ. Vào danh sách, lọc một trạng thái rồi mở chi tiết. Fixture có 45 proposal qua ba trang 20/20/5.
2. Chọn ví EVM trong đúng browser profile, kết nối đúng chain và kiểm tra GOV balance, delegate và voting power. Self-delegate nếu cần; quyền của proposal cũ vẫn tính tại snapshot của nó.
3. Tạo đề xuất một khoản chi. Kiểm tra người nhận, số BUD, request ID và `0 ETH` native value trước khi ký. Ghi transaction hash, đợi receipt và đợi indexer xuất bản snapshot mới.
4. Tại chi tiết, vote bằng ví có quyền ở snapshot. Khi hết thời gian biểu quyết, tải dữ liệu mới nhất và queue proposal Succeeded. Đến ETA, dùng một ví có gas để execute qua Governor. Nếu Treasury thiếu BUD, nạp BUD bằng transfer rồi thử execute lại sau khi có snapshot mới.
5. Đối chiếu số dư và lịch sử Treasury ở cùng `asOfBlock`. Một khoản chi thành công chỉ tính một lần vào tổng ra. Thử từ chối ký, ví sai mạng và mô tả chứa HTML để kiểm tra lỗi và hiển thị văn bản an toàn.

Các nút giao dịch chỉ xác nhận thành công sau receipt. `Ready` là tình trạng operation của proposal Queued, không phải proposal state mới. Execute revert không tạo trạng thái Failed. Trình duyệt không dùng đồng hồ riêng để cấp quyền thao tác; contract kiểm tra lại trạng thái khi gửi giao dịch.

## Kiểm tra trước khi bàn giao

```sh
npm run test --prefix frontend
npm run build --prefix frontend
npm run lint --prefix frontend
```

Kiểm tra thủ công ở viewport 390px và 1366px: điều hướng bàn phím, nhãn trường, loading/empty/error, phân trang không lặp/mất proposal, form giữ dữ liệu khi từ chối ký, cảnh báo API/RPC chậm, đổi account/chain và snapshot mới sau receipt. Với môi trường local, ghi chain ID, deployment ID, block H và transaction hash để TV2/TV4 đối soát. Bằng chứng local Anvil/API hiện có trong [báo cáo TV4](tv4-work-summary.md); nó chưa thay cho nghiệm thu ví extension hoặc testnet.
