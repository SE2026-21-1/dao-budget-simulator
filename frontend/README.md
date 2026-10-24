# DAO Budget Simulator frontend

Frontend của TV3 dùng React, TypeScript, Vite và viem. Có hai chế độ:

- **Fixture (mặc định):** mở giao diện ngay, không cần backend, RPC hay ví. Dữ liệu BE01 là tổng hợp; không có giao dịch thật.
- **Deployment thật:** frontend đọc API BE01 cùng một snapshot và dùng ví EVM để gửi giao dịch trực tiếp tới contract. Chế độ này chỉ dùng được khi nhóm đã chạy API và có manifest deployment khớp chain. Hiện nhánh TV2 mới có reader/storage, chưa bàn giao HTTP API đầy đủ nên chưa có bằng chứng E2E cho chế độ này.

## Chạy web để xem giao diện

Cần Node.js 24 và npm. Từ thư mục gốc repository:

```powershell
cd frontend
npm ci
npm run dev
```

Mở địa chỉ Vite in trong terminal, thường là [http://localhost:5173/](http://localhost:5173/). Giữ terminal đang chạy; `Ctrl+C` để dừng. Nếu cổng 5173 bận, dùng đúng URL mới Vite in ra. Không cần tạo `.env.local` để xem fixture.

Các màn hình:

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Dashboard: thống kê đề xuất, số dư BUD và lịch sử Treasury từ fixture/API |
| `/proposals` | Danh sách 45 đề xuất fixture, lọc trạng thái, tìm đúng Proposal ID, phân trang 20 mục |
| `/proposals/:id` | Chi tiết, phiếu, quorum, snapshot/deadline/ETA, giao dịch và thao tác theo trạng thái |
| `/proposals/new` | Form tạo đề xuất, kiểm tra nội dung/địa chỉ/số BUD và xem lại trước khi ký |

Để xem FE06, vào danh sách, lọc **Active** rồi mở chi tiết để thấy vote; lọc **Pending** để thấy cancel. Ở chế độ fixture các nút giao dịch bị khóa có chủ ý, vì địa chỉ và transaction hash trong fixture không phải deployment thật. Web vẫn cho xem dữ liệu khi chưa kết nối ví.

## Cách dữ liệu và ví hoạt động

Nếu thiếu cấu hình deployment hoặc `VITE_API_BASE_URL`, frontend dùng fixture BE01 có sẵn trong `src/data/fixtures/`. Ba trang proposal có 20/20/5 mục; summary và Transfer Treasury cũng là dữ liệu tổng hợp. Banner đầu trang nêu rõ chế độ đang chạy.

Khi cấu hình deployment và API đầy đủ, frontend gọi `GET /api/proposals`, `/api/summary` và `/api/treasury/transfers`. Nó gửi `chainId` và `deploymentId`, giữ cùng `asOfBlock`/`asOfBlockHash` qua các trang và từ chối dữ liệu không khớp snapshot/deployment. Frontend không tự quay về fixture nếu API thật bị lỗi; lỗi sẽ hiện trên màn hình để tránh nhầm dữ liệu thật với dữ liệu mẫu. API trả `dataKind: "chain"` mới cho phép các thao tác quản trị.

Khu vực ví ở thanh bên dùng ví EVM được inject vào trình duyệt (ví dụ MetaMask). Sau khi kết nối đúng mạng, frontend đọc GOV `balanceOf`, `delegates`, `getVotes`; nút **Self-delegate** gửi giao dịch `delegate(account)`. Trang chi tiết đọc voting power tại snapshot và `hasVoted`. Ví ký propose/vote/cancel/queue/execute qua Governor; nạp quỹ dùng BUD `transfer` tới Treasury. Giao diện chờ receipt trước khi báo thành công, hiển thị transaction hash và lỗi/revert. API có thể cần thêm thời gian để index receipt trước khi trạng thái đề xuất thay đổi trên trang.

## Nối deployment và API thật

1. TV4 chạy local chain và tạo **manifest thật** bằng script deployment của nhóm. Đọc `chainId` và địa chỉ `contracts.Governor`, `contracts.Treasury`, `contracts.GOV`, `contracts.BUD` trong manifest. Không lấy địa chỉ từ `fixtures/`.
2. TV2 chạy HTTP API BE01 trỏ tới đúng deployment đó và cung cấp `deploymentId` cùng base URL. `VITE_API_BASE_URL` là origin/base trước `/api`; code sẽ tự thêm `/api`.
3. Sao chép `.env.example` thành `.env.local` trong thư mục `frontend/`, điền các biến bên dưới, rồi khởi động lại `npm run dev`.
4. Dùng ví có account demo trên đúng chain. Nếu ví chưa biết mạng local, thêm mạng với chain ID/RPC của manifest trong ví, sau đó kết nối từ giao diện.

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_DEPLOYMENT_ID=<deploymentId do API cung cap>
VITE_CHAIN_ID=31337
VITE_CHAIN_NAME=Local Anvil
VITE_RPC_URL=http://127.0.0.1:8545
VITE_GOVERNOR_ADDRESS=<manifest.contracts.Governor.address>
VITE_TREASURY_ADDRESS=<manifest.contracts.Treasury.address>
VITE_GOV_TOKEN_ADDRESS=<manifest.contracts.GOV.address>
VITE_BUD_TOKEN_ADDRESS=<manifest.contracts.BUD.address>
VITE_EXPLORER_URL=
```

Giá trị trong khối trên chỉ minh họa **tên trường**; các placeholder không dùng để chạy. `.env.local` bị Git bỏ qua. Không đưa private key, seed phrase hoặc secret vào biến `VITE_`: Vite đưa các biến này vào mã trình duyệt. Ví tự giữ khóa và ký giao dịch.

Frontend kiểm tra chain ID của ví/RPC, bytecode và quan hệ Governor → Treasury/GOV, Treasury → BUD trước giao dịch quản trị. Sai mạng hoặc API trả deployment/snapshot không khớp sẽ chặn giao dịch. Các thao tác queue/execute/cancel dùng nguyên `targets`, `values`, `calldatas` và `descriptionHash` mà API lưu từ proposal ban đầu; không dựng lại description.

## Kiểm tra trước khi bàn giao

```powershell
cd frontend
npm ci
npm run test
npm run build
npm run lint
```

`npm run test` kiểm tra vector calldata/hash SC01, validation amount và fixture 45 proposal. `npm run build` bao gồm TypeScript typecheck. `npm run lint` hiện có cảnh báo React Fast Refresh/effect nhưng không có lỗi chặn lệnh. Testnet và luồng ví–API–chain cần TV2/TV4 phối hợp; build/test fixture không thay thế E2E.

## Lỗi thường gặp

- **Trang báo fixture, nút vote/cancel bị khóa:** chưa có đủ `.env.local` và API thật trả `dataKind: "chain"`. Đây là hành vi dự kiến.
- **Không thấy ví:** cài/bật ví EVM trong trình duyệt rồi tải lại trang. Web vẫn xem được fixture mà không có ví.
- **Sai mạng:** chuyển ví sang `VITE_CHAIN_ID`; nếu ví chưa có mạng local, thêm RPC và chain ID trong ví.
- **API/RPC lỗi:** kiểm tra các service đang chạy, CORS cho origin của Vite, chain ID/deployment ID và các địa chỉ trong manifest. Frontend không dùng fixture thay cho API lỗi.
- **Proposal mới chưa hiện sau receipt:** đợi indexer bắt kịp rồi tải lại. Không coi việc API chậm là giao dịch bị revert.
