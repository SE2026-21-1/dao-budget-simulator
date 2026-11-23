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
Fixture không cho phép ký. Phản hồi API 409/503 thu hồi phiên ghi ngay cả khi body
là HTML/rỗng, kể cả giao dịch đang chờ kiểm tra RPC; chỉ một lần tải canonical
thành công mới cấp lại phiên.
Đổi ví/tài khoản/mạng thu hồi phiên ký cũ; sự kiện lặp cùng tài khoản/mạng không
xóa GOV reads hợp lệ. Receipt phải khớp contract, calldata/event và kết quả on-chain.
Nạp BUD và self-delegate chỉ báo thành công khi receipt khớp token/tài khoản đã
gửi và có Transfer đúng người nhận/số tiền hoặc DelegateChanged đúng delegatee;
hash đã mined nhưng thiếu/sai sự kiện vẫn được giữ và hiển thị lỗi.

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

## Static hosting: Netlify fixture demo

`netlify.toml` ở repository root dành cho bản demo static, không dùng Docker.
Node **24.15.0**, `npm ci` theo lockfile frontend, lint, tests và production build
đều được khai báo trong build command; publish **chỉ** `frontend/dist`.
Không upload repository root hoặc `.env.local`.

Cấu hình đặt `VITE_CONTAINER_RUNTIME=0`, `VITE_DATA_SOURCE=fixture` và
`VITE_API_BASE_URL` trống. `/runtime-config.js` vẫn được phục vụ như file JavaScript
tĩnh rỗng; không đặt `globalThis.__DAO_PUBLIC_CONFIG__`. Bundle đọc các biến build,
hiển thị **Dữ liệu mô phỏng** và khóa giao dịch. Đây không phải dữ liệu testnet.
Không dùng bundle container yêu cầu server sinh runtime config cho cách triển khai này.

Netlify phục vụ file asset/favicon/runtime có thật trước khi rewrite các route
khác về `/index.html` với HTTP 200. Vì vậy tải trực tiếp hoặc refresh
`/proposals/:id`, `/treasury`, `/governance` vẫn mở được ứng dụng.

Kết nối repository với Netlify và chọn nhánh triển khai riêng làm production
branch; không cần merge cấu hình này vào `Dev`. Push lên nhánh đã kết nối sẽ build
và deploy tự động. Để cập nhật nguồn, fetch rồi merge `origin/Dev` vào nhánh triển
khai, xử lý conflict nếu có và push; không merge ngược vào nhánh chung khi chưa
được chấp thuận. Rollback bằng **Publish deploy** của một deploy thành công trước
trong Netlify; khóa auto publishing nếu cần giữ bản rollback qua các push mới.

Chỉ dùng gói Free, không bật nâng cấp hoặc auto recharge. Gói Free có giới hạn
usage; đây không phải cam kết uptime không giới hạn. Kiểm tra URL `netlify.app`
trước, sau đó thêm custom domain trong Netlify và dùng chính bản ghi DNS mà
Netlify cung cấp tại DNS provider đang quản lý zone. Giữ nguyên MX/TXT email,
không tự đổi nameserver. HTTPS custom domain chỉ được nghiệm thu sau khi DNS
phân giải đúng và chứng chỉ được cấp.

Muốn chuyển sang API thật phải thay cấu hình fixture trên nhánh triển khai,
build lại và kiểm tra HTTPS/CORS cho origin mới. Chain/deployment ID, RPC và
địa chỉ contract phải đến từ cùng deployment đã xác minh; không đưa private key,
database URL, API cursor secret hoặc RPC secret vào bất kỳ biến `VITE_*` nào.

### Triển khai public đã kiểm chứng ngày 23/11/2026

- URL chính: https://dao-budget-simulator.xyz/
- URL hosting: https://dao-budget-simulator.netlify.app/
- Project ID: `bc26ae0b-88f3-4892-972f-5204cf7c574c`, team `dung0611`,
  gói **Free**, auto top-up tắt; không mua hoặc nâng cấp dịch vụ.
- Source ứng dụng được chuẩn bị tại `2fd0be825fee6f8f73c29e8ae305c670020b24aa`,
  từ Dev `6766e5ee2d8c466542687cbeb09677c4d11e5463`.
- Lần build từ repository đã nghiệm thu: source
  `952742afc6a7c421a2a9afc0c0ab40a27c5089a5`, production deploy
  `6b04531e63d8d2912824dd82`, build `6b04531e63d8d2912824dd80`;
  Netlify báo `ready`, không có build error.
- Repository hosting: https://github.com/dung0611/dao-budget-simulator,
  production branch **`deploy/static-hosting-20261123-162223`**.
  Nhánh này chứa source đầy đủ và `netlify.toml` dùng đường dẫn tương đối.
  `main` của repo hosting chỉ chứa artifact và cấu hình sinh từ máy local;
  không sửa `main` và không dùng nó để build cloud.
- Bản chuẩn bị/handoff cũng được giữ trên nhánh cùng tên ở repository tổ chức.
  Không merge vào Dev hoặc sửa các nhánh `personal/*`, `individual/*`.
- Dữ liệu fixture có banner, giao dịch bị khóa. Không có API/RPC/testnet live.
- Node 24.15.0, frontend lockfile install, lint, 127 tests pass/1 opt-in live test
  skipped và production build đã chạy. Còn 8 React lint warnings và cảnh báo bundle lớn.
- Browser trên custom domain: cả sáu route, direct load/refresh, favicon,
  JS/CSS và `/runtime-config.js` hoạt động; không HTTP 4xx/5xx, console error
  hoặc request failure trong lượt kiểm tra. Mobile 390px không tràn ngang.
  Netlify có chèn badge/telemetry của nền tảng.
- Local preview đã dừng; website public dùng Netlify, không gọi API/RPC trên
  laptop. Chưa thực hiện thử nghiệm tắt vật lý laptop.

**Git deployment:** Netlify đã có deploy key và webhook GitHub active cho repo
hosting. Production branch là nhánh source trên, không phải `main`.
Push lên nhánh này sẽ kích hoạt build theo `netlify.toml` rồi publish khi thành công.
Push lên Dev của repo tổ chức không tự đồng bộ sang repo hosting.
Lần kết nối ban đầu tới repo tổ chức thiếu quyền đã được gỡ; lỗi clone lịch sử
không phải trạng thái build của kết nối mới.

Để lấy thay đổi Dev mới mà không sửa nhánh chung, từ checkout nhánh triển khai
của repo hosting, thêm remote tổ chức một lần rồi cập nhật:

```sh
git remote add upstream https://github.com/SE2026-21-1/dao-budget-simulator.git
git fetch upstream Dev
git merge upstream/Dev
git push origin HEAD
```

Xử lý conflict và kiểm tra thay đổi trước khi push; không force-push. Theo dõi
source commit và kết quả build tại
https://app.netlify.com/projects/dao-budget-simulator/deploys.
Rollback chọn một deploy thành công trước đó rồi **Publish deploy**; khóa auto
publishing nếu cần giữ bản rollback qua các push tiếp theo.

Khi cần deploy thủ công từ source đã chọn, không dùng artifact/container cũ:

```sh
nvm use
npm ci --prefix frontend
npm run lint --prefix frontend
npm run test --prefix frontend
VITE_CONTAINER_RUNTIME=0 VITE_DATA_SOURCE=fixture VITE_API_BASE_URL='' npm run build --prefix frontend
npx --yes netlify-cli@27.20.1 deploy --site bc26ae0b-88f3-4892-972f-5204cf7c574c --prod --no-build --dir frontend/dist
```

Đăng nhập bằng Netlify CLI trước; không đưa token vào source hoặc cuộc trò chuyện.

**DNS và HTTPS đã hoạt động:** registry không còn `client hold` sau khi chủ
thể hoàn tất thủ tục tại P.A. Authoritative DNS P.A trả đúng các bản ghi dưới.
Nameserver giữ `ns1.pavietnam.vn`, `ns2.pavietnam.vn`, `nsbak.pavietnam.net`;
trợ lý không sửa nameserver, MX/TXT email hoặc bản ghi không liên quan tại P.A.

| Host | Loại | Giá trị | TTL |
| --- | --- | --- | --- |
| `@` | A | `75.2.60.5` | `300` |
| `www` | CNAME | `dao-budget-simulator.netlify.app` | `300` |

Giá trị theo [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/).
Netlify không yêu cầu TXT xác minh riêng trong lần kết nối này. Chứng chỉ đã
`issued` cho apex và `www`, hết hạn `2027-02-21T09:47:58Z`; browser xác nhận
TLS 1.3, issuer `YE1`. Force HTTPS bật; HTTP apex và HTTPS `www` đều redirect
301 về `https://dao-budget-simulator.xyz/`. Netlify quản lý gia hạn chứng chỉ.

