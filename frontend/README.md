# DAO Budget Simulator — frontend

Giao diện React/TypeScript/Vite đọc fixture BE01 hoặc API live theo deployment,
kèm giao dịch ví EVM và kiểm tra receipt. Fixture không phải bằng chứng E2E on-chain.

## Chạy local

Dùng Node.js **24.15.0** và npm đi kèm. Từ thư mục gốc repository:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Mặc định không cần PostgreSQL/RPC/ví: `VITE_API_BASE_URL` trống chọn fixture
ở `../fixtures/api/`. `VITE_DATA_SOURCE=fixture` bỏ qua cả cấu hình deployment cũ.
Chỉ trong Vite dev, `?fixture=error` mô phỏng lỗi tải fixture để kiểm tra nút thử lại.

Để đọc API thật, tạo `frontend/.env.local` theo `.env.example`, điền
`VITE_API_BASE_URL`, `VITE_CHAIN_ID`, `VITE_DEPLOYMENT_ID` từ deployment đã đăng ký
trong PostgreSQL. API base không chứa hậu tố `/api`; server phải cho phép origin
Vite chính xác qua `API_CORS_ORIGINS`. Khởi động lại Vite sau khi đổi cấu hình.

Muốn gửi giao dịch, thêm RPC và đủ năm địa chỉ Governor, Timelock, Treasury,
GOV, BUD từ **cùng manifest**. Trang không hỏi quyền ví khi mount; người dùng
chọn/kết nối ví, chuyển mạng và ký trong tiện ích ví. Không đưa khóa riêng vào
cấu hình frontend. Với chain local mới do người chạy sở hữu, helper
`node scripts/deploy_local.mjs --rpc http://127.0.0.1:8545 --output <manifest.json>`
ở gốc repo kiểm tra bootstrap/role trước khi bỏ quyền admin và cấp vốn Treasury;
cần artifacts `forge build`, dependency submodule recursive đúng revision và Anvil
unforked chain 31337 còn rỗng. Manifest này chưa tự đăng ký metadata API/indexer.

## Route và tính nhất quán

| Route | Hành vi |
| --- | --- |
| `/` | Tổng quan và hoạt động ở snapshot đang đọc. |
| `/proposals` | Danh sách, lọc state, tìm Proposal ID thập phân canonical. |
| `/proposals/:id` | Chi tiết, phiếu và vote/queue/execute/cancel khi đủ điều kiện. |
| `/proposals/new` | Tạo đề xuất Treasury với kiểm tra deployment và receipt. |
| `/treasury` | Số dư/dòng tiền cùng snapshot và chuyển BUD khi có ví hợp lệ. |
| `/governance` | GOV balance, quyền biểu quyết và ủy quyền. |

Loader kiểm tra chain/deployment, H/hash/revision, tính đầy đủ của phân trang và
không trùng ID. Số tiền và ID giữ dạng chuỗi/BigInt, không làm mất wei.
Fixture không cho phép ký. Phản hồi API 409/503 thu hồi phiên ghi, kể cả giao dịch
đang chờ kiểm tra RPC; chỉ một lần tải canonical thành công mới cấp lại phiên.
Đổi ví/tài khoản/mạng thu hồi phiên ký cũ; sự kiện lặp cùng tài khoản/mạng không
xóa GOV reads hợp lệ. Receipt phải khớp contract, calldata/event và kết quả on-chain.

## Container và kiểm tra

Container build đặt `VITE_CONTAINER_RUNTIME=1`. `index.html` nạp
`/runtime-config.js` trước bundle; script do server container sinh đặt
`globalThis.__DAO_PUBLIC_CONFIG__` với cấu hình public live và proxy API `/backend`.
Thiếu script runtime thì frontend dừng, không quay về fixture. File trong
`public/runtime-config.js` chỉ là route rỗng cho Vite local, không phải cấu hình
triển khai. Host production phải phục vụ asset thật và rewrite các route UI
khác về `index.html`.

```sh
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Các regression bao phủ API/snapshot, phiên ví, repeated/stale wallet events,
preflight/receipt và runtime config. Test live trong `src/data/api.live.test.ts`
chỉ chạy khi có đủ biến `BE05_LIVE_*` trỏ đến môi trường thật. Unit test và build
không chứng minh browser/extension-wallet hoặc deployment E2E; báo kết quả smoke
thật riêng, không coi dữ liệu fixture là receipt chain.
