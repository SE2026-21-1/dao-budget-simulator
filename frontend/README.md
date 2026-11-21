# DAO Budget Simulator — frontend fixture

Giao diện React/TypeScript/Vite được tích hợp từ TV3 commit
`47f91d50b7a9104c027dbf05e7a862ddb69d31d0`, kèm các sửa tích hợp/nghiệm thu TV4.
Đây là **giao diện dùng dữ liệu tổng hợp**, không phải bằng chứng chạy E2E on-chain.

## Chạy từ clone sạch

Dùng Node.js **24.15.0** và npm đi kèm. Giữ nguyên cấu trúc repository: frontend
import trực tiếp JSON ở `../fixtures/api/`, không có bản sao dữ liệu riêng.
Từ thư mục gốc repository:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Dev server: <http://127.0.0.1:5173>. Để xem bản build, dừng dev server nếu cần rồi chạy:

```sh
npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Preview: <http://127.0.0.1:4173>. Lệnh build frontend là `tsc -b && vite build`,
khác với `npm run build` ở gốc repo (không build frontend). `npm --prefix frontend
run lint` là script oxlint hiện có. Không cần PostgreSQL/RPC/ví để chạy UI này.

## Route, dữ liệu và giới hạn

| Route | Hành vi hiện có |
| --- | --- |
| `/` | Tổng quan, ba đề xuất đầu của fixture; các số liệu treasury vẫn là `—` chờ API. |
| `/proposals` | 45 đề xuất; phân trang client 20/20/5; tìm **đúng toàn bộ Proposal ID thập phân**, có trim khoảng trắng; lọc AND theo một trong bảy state. Đổi tìm kiếm/state trở về trang 1. |
| `/proposals/:id` | Chi tiết trong cùng bộ fixture; ID không có hoặc không đúng định dạng hiện màn hình không tìm thấy đề xuất. |
| `/proposals/new` | Chỉ bản phác thảo, nút tạo bị disable; không có form nhập/gửi giao dịch. |
| Route khác | Màn hình không tìm thấy trang. |

Nguồn duy nhất: `fixtures/api/proposals-page-{1,2,3}.json` ở gốc repo,
được Vite import động và bundle khi build. Loader kiểm tra cùng snapshot,
không trùng/thiếu ID và tổng số bản ghi. Dữ liệu có `dataKind: synthetic`,
revision `fixture-v2`, block giả `9000`; xem
[contract fixture BE01](../fixtures/api/README.md). ID và amount luôn là chuỗi;
hiển thị BUD dùng BigInt, không chuyển sang Number hay làm tròn mất wei.
Không dùng cursor/API pagination trong UI này: cả ba trang được tải trước rồi
lọc/phân trang cục bộ. Không gọi backend, đọc ví, ký giao dịch hoặc gọi chain.

Loader có trạng thái loading, error và nút **Thử lại** để tải lại. Chỉ khi chạy
**dev**, thêm `?fixture=error` vào `/`, `/proposals` hoặc `/proposals/:id` để tạo
lỗi xác định. Thử lại trong khi query vẫn còn sẽ tiếp tục lỗi; chọn
**Tắt mô phỏng lỗi** để bỏ query và tải fixture thật. Query này **không gây lỗi
trong bản build/preview**. Không có query tạo độ trễ/loading giả.

Dùng BrowserRouter: host static production phải rewrite đường dẫn UI về
`index.html` (không rewrite file asset có thật). Vite dev/preview dùng cho smoke
local, không phải cấu hình triển khai production.

## Smoke nghiệm thu thủ công

Các mục dưới đây là kịch bản tái lập; kết quả thực tế ngày22/10 được ghi riêng tại [browser evidence](../docs/evidence/tv4-20261022/frontend-browser.json). Chỉ claim các thao tác/viewport có trong report, không coi toàn bộ hướng dẫn là đã chạy.
Chạy cả viewport rộng **1366px** và mobile **390px**, kiểm tra không tràn ngang,
Proposal ID/địa chỉ dài xuống dòng, số tiền đủ chữ số; hàng proposal mobile được
wrap để state, amount và link chi tiết không đẩy rộng trang.

- `/`: có heading `Ngân sách DAO`, banner fixture, ba link `.proposal-row` và
  bốn chỉ số chờ API. Các navigation link có `aria-current="page"` khi active.
- `/proposals`: `.proposal-list > article` có 20 hàng đầu; nav
  `[aria-label="Phân trang đề xuất"]` có `Trang 1 / 3`, nút `Trang trước`
  disabled. `Trang sau` lần lượt cho 20 rồi 5 hàng; ở trang 3 nút sau disabled.
  Page indicator là live region để thông báo thay đổi trang.
- Tìm kiếm qua `#proposal-search`: nhập ID đầu trang
  `32591545501524741886300998079617704300347801580532258275547383289645120742286`
  cho một kết quả (Canceled), kể cả khi có khoảng trắng đầu/cuối. `0` hoặc
  một phần ID cho zero kết quả và thông báo `Không tìm thấy đề xuất phù hợp`.
- `#proposal-status`: chọn `Executed` cho 7 kết quả, `Active` cho 7; tìm ID
  Canceled ở trên đồng thời chọn `Active` cho zero kết quả. Clear search/chọn
  `ALL` khôi phục 45 kết quả và trang 1. Không tìm theo tiêu đề.
- Link `Xem đề xuất <ID>` (accessible name) mở `/proposals/<ID>`; heading
  `.proposal-id`, state, địa chỉ và mô tả đúng bản ghi. Amount đầu tiên phải là
  `61,000000000000000001 BUD` (không mất 1 wei). `/proposals/0` có heading
  `Không tìm thấy đề xuất` và link `Quay lại danh sách`; `/not-a-route` có heading
  `Không tìm thấy trang`.
- Dev `/proposals?fixture=error`: `[role="alert"]`, nút `Thử lại` và link
  `Tắt mô phỏng lỗi`. Thử lại vẫn lỗi; link tắt lỗi phục hồi 20 hàng. Kiểm tra
  tương tự ở dashboard/detail nếu cần. Với preview cùng query, dữ liệu vẫn tải
  bình thường; đây không phải lỗi sản xuất.
- Loading: ở browser mới/cache tắt, trì hoãn request module động
  `**/fixtures/api/proposals-page-*.json*` (dev) hoặc
  `**/assets/proposals-page-*.js` (preview), reload `/proposals`, kiểm tra
  `[role="status"]` chứa `Đang tải dữ liệu đề xuất mô phỏng…`; thả request và
  chờ 20 hàng. Không cần thêm delay hay mock dữ liệu vào code sản phẩm.
- Chỉ bàn phím: Tab đầu tiên hiện link `Bỏ qua điều hướng`; Enter chuyển focus
  đến `#main-content`. Tab/Shift+Tab có focus ring; Enter kích hoạt nav/link;
  search và select có label; dùng phím mũi tên trên select, Enter/Space trên
  button pagination/retry. Không có focus trap; nút disabled không là thao tác
  khả dụng. `/proposals/new` giữ nút tạo disabled, không gửi network/transaction.

## Phạm vi CI frontend

Gate frontend cài lockfile bằng `npm --prefix frontend ci`, chạy
`npm --prefix frontend run lint` và `npm --prefix frontend run build`;
workflow ở gốc repo là nơi định nghĩa gate. Workflow mới chưa có run GitHub.
Build chỉ kiểm tra TypeScript và đóng gói Vite/canonical JSON, **không chứng minh**
keyboard/responsive/browser, kết nối API/ví, form hay governance E2E. Smoke browser
phải báo riêng URL, viewport, thao tác và quan sát thực; không coi fixtures là
receipt hoặc dữ liệu chain thật.
