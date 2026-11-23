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

### Trạng thái triển khai ngày 23/11/2026

- URL public đã kiểm chứng: https://dao-budget-simulator.netlify.app/
- Project ID: `bc26ae0b-88f3-4892-972f-5204cf7c574c`, team `dung0611`,
  gói **Free**, auto top-up tắt, không có payment method tại thời điểm triển khai.
- Source deploy: `2fd0be825fee6f8f73c29e8ae305c670020b24aa`, từ Dev
  `6766e5ee2d8c466542687cbeb09677c4d11e5463`; nhánh riêng
  `deploy/static-hosting-20261123-162223`, không merge vào Dev.
- Production deploy ID: `6b0409d7264e38cba59f36bd`; permalink:
  https://6b0409d7264e38cba59f36bd--dao-budget-simulator.netlify.app/
- Dữ liệu fixture có banner, giao dịch bị khóa. Không có API/RPC/testnet live.
- Node 24.15.0, frontend lockfile install, lint, 127 tests pass/1 opt-in live test
  skipped và production build đã chạy. Còn 8 React lint warnings và cảnh báo bundle lớn.
- Browser public: cả sáu route, direct load/refresh, favicon, JS/CSS,
  `/runtime-config.js` hoạt động; không HTTP 4xx/5xx, console error hoặc request
  failure trong lượt kiểm tra. Mobile 390px không tràn ngang. Chứng chỉ
  `*.netlify.app` hợp lệ, TLS 1.3. Netlify có chèn badge/telemetry của nền tảng.
- Đã dừng local preview; kiểm chứng website public dùng Netlify, không gọi
  API/RPC trên laptop. Chưa thực hiện thử nghiệm tắt vật lý laptop.

**Cập nhật hiện là thủ công**, chưa có auto-deploy Git. Thử build trực tiếp từ
repository đã thất bại tại `preparing repo` / `Host key verification failed`;
kết nối Git chưa đủ quyền đã được gỡ, không ảnh hưởng production upload.
Để bật auto-deploy, quản trị viên repository/organization cần cấp Netlify Git
integration cho repository, liên kết project và chọn đúng nhánh triển khai trên.
Tài khoản GitHub đang dùng có quyền push nhưng không có quyền admin/maintain.
Không coi việc chỉ khai báo repo URL là đã thiết lập auto-deploy.

Từ checkout của nhánh triển khai, cập nhật thủ công sau khi lấy source mong muốn:

```sh
nvm use
npm ci --prefix frontend
npm run lint --prefix frontend
npm run test --prefix frontend
VITE_CONTAINER_RUNTIME=0 VITE_DATA_SOURCE=fixture VITE_API_BASE_URL='' npm run build --prefix frontend
npx --yes netlify-cli@27.20.1 deploy --site bc26ae0b-88f3-4892-972f-5204cf7c574c --prod --no-build --dir frontend/dist
```

Đăng nhập Netlify bằng `netlify login` trước khi deploy; không đưa token vào
source hoặc cuộc trò chuyện. Rollback chọn một deploy thành công trước đó ở
https://app.netlify.com/projects/dao-budget-simulator/deploys rồi **Publish deploy**.

**Custom domain chưa nghiệm thu**: đã thêm apex `dao-budget-simulator.xyz` và
alias `www.dao-budget-simulator.xyz` vào project, bật automatic TLS provisioning,
nhưng chưa có chứng chỉ custom domain. Registrar báo `client hold`, DNS public
NXDOMAIN; yêu cầu cấp chứng chỉ trả HTTP 422. Cần P.A Việt Nam kiểm tra nguyên
nhân và hoàn tất kích hoạt/gỡ hold; đây không chỉ là chờ propagation.
Nameserver ghi trong registry: `ns1.pavietnam.vn`, `ns2.pavietnam.vn`,
`nsbak.pavietnam.net`. Trợ lý không sửa nameserver hoặc DNS tại P.A; các bản ghi
do chủ tài khoản nhập, nếu có, chưa được xác minh ở lượt bàn giao này. Giữ nguyên
MX/TXT email và các bản ghi không liên quan.

Giá trị DNS theo [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/),
TTL chọn 300 giây:

| Host | Loại | Giá trị | TTL |
| --- | --- | --- | --- |
| `@` | A | `75.2.60.5` | `300` |
| `www` | CNAME | `dao-budget-simulator.netlify.app` | `300` |

Netlify chưa yêu cầu TXT xác minh riêng. Sau khi registrar gỡ hold và bản ghi
phân giải đúng, kiểm tra lại chứng chỉ và HTTPS custom domain trước khi báo thành công.
