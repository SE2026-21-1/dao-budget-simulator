# DAO Budget Simulator frontend

React/TypeScript/Vite + viem, tích hợp wallet, form, Governor và Treasury của TV3 với API đọc BE05. Xem hợp đồng API tại [docs/api.md](../docs/api.md) và triển khai tại [docs/be06.md](../docs/be06.md).

## Chạy fixture

Cần Node.js 24 và npm. Từ repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Mở `http://127.0.0.1:5173`. Không cần RPC, backend, ví hoặc `.env.local`.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Dashboard, số dư BUD, tổng vào/ra và lịch sử Treasury |
| `/proposals` | Danh sách, lọc state, tìm đúng ID thập phân, phân trang 20 mục |
| `/proposals/:id` | Description, snapshot/deadline/ETA, phiếu/quorum, receipt và thao tác quản trị |
| `/proposals/new` | Form khoản chi và xem lại trước khi ký |

Nguồn fixture duy nhất là **`../fixtures/api/`**; không duy trì JSON bản sao dưới `src/`. Ba trang proposal có 20/20/5 mục tổng hợp. Không gửi giao dịch quản trị/nạp quỹ từ context synthetic. Banner phân biệt fixture/API; địa chỉ fixture không là giá trị mặc định của cấu hình wallet.

Trong Vite dev, thêm `?fixture=error` vào đường dẫn để xem lỗi tải fixture. Nút **Thử lại** tải lại; bỏ query để phục hồi. Cơ chế này không áp dụng khi API đã bật, và không phải công tắc giả lập giao dịch. Skip link **Bỏ qua điều hướng** trỏ tới main focusable; phân trang thông báo qua live region. Layout có breakpoint mobile; cần kiểm tra lại viewport 390px khi bàn giao.

## Kết nối BE05 và deployment thật

BE05 đã có HTTP server, không còn là API dự kiến. API đọc PostgreSQL publication; không ký/gửi transaction hoặc tự chạy indexer. Cần chạy deployment, ingest và projection trước: [hướng dẫn BE06](../docs/be06.md), [chạy API BE05](../docs/api.md#7-chạy-api-be05).

Server cần `DATABASE_URL`, `API_CURSOR_SECRET` ít nhất 32 byte và origin frontend chính xác trong `API_CORS_ORIGINS`, ví dụ `http://127.0.0.1:5173`. `localhost` và `127.0.0.1` là origin khác nhau. Không cấu hình CORS wildcard để che lỗi tích hợp.

Sao chép `.env.example` thành `.env.local` và điền từ manifest thật, hoặc truyền biến môi trường bên ngoài. Tất cả biến `VITE_` đều công khai trong trình duyệt; **không chứa private key, seed phrase, DATABASE_URL hoặc secret**.

| Biến | Giá trị |
| --- | --- |
| `VITE_API_BASE_URL` | Origin/base trước `/api`, ví dụ `http://127.0.0.1:3000`; code thêm `/api` |
| `VITE_DEPLOYMENT_ID` | Chính xác `deployments.deployment_name` mà API trả trong `context.deploymentId`, **không phải** khóa nội bộ `deployment_id` |
| `VITE_CHAIN_ID` | `manifest.chainId`, số nguyên dương an toàn cho wallet |
| `VITE_CHAIN_NAME` | Tên hiển thị mạng |
| `VITE_RPC_URL` | RPC thực của chain này |
| `VITE_GOVERNOR_ADDRESS` | `manifest.contracts.Governor.address` |
| `VITE_TIMELOCK_ADDRESS` | `manifest.contracts.Timelock.address` |
| `VITE_TREASURY_ADDRESS` | `manifest.contracts.Treasury.address` |
| `VITE_GOV_TOKEN_ADDRESS` | `manifest.contracts.GOV.address` |
| `VITE_BUD_TOKEN_ADDRESS` | `manifest.contracts.BUD.address` |
| `VITE_EXPLORER_URL` | Tùy chọn, base URL explorer thật để mở `/tx/<hash>` |

Để chạy từ manifest mà không ghi `.env.local`, đặt các biến shell từ bàn giao thực rồi chạy từ repository root:

```sh
export MANIFEST=/absolute/path/to/manifest.json
export RPC_URL=http://127.0.0.1:8545
export API_BASE_URL=http://127.0.0.1:3000
export DEPLOYMENT_NAME='name-returned-by-the-configured-api'
export FRONTEND_PORT=5173
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const m = JSON.parse(readFileSync(process.env.MANIFEST, 'utf8'));
const env = {
  ...process.env,
  VITE_API_BASE_URL: process.env.API_BASE_URL,
  VITE_DEPLOYMENT_ID: process.env.DEPLOYMENT_NAME,
  VITE_RPC_URL: process.env.RPC_URL,
  VITE_CHAIN_ID: m.chainId,
  VITE_CHAIN_NAME: 'Local Anvil',
  VITE_GOVERNOR_ADDRESS: m.contracts.Governor.address,
  VITE_TIMELOCK_ADDRESS: m.contracts.Timelock.address,
  VITE_TREASURY_ADDRESS: m.contracts.Treasury.address,
  VITE_GOV_TOKEN_ADDRESS: m.contracts.GOV.address,
  VITE_BUD_TOKEN_ADDRESS: m.contracts.BUD.address,
};
const result = spawnSync('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', process.env.FRONTEND_PORT, '--strictPort'], { cwd: 'frontend', env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
NODE
```

Thay đường dẫn/URL/deployment name bằng bàn giao hiện tại; không dùng địa chỉ tổng hợp. Khởi động lại Vite sau khi đổi cấu hình. API được bật nhưng thiếu địa chỉ/chain/RPC hợp lệ sẽ báo lỗi cấu hình, **không âm thầm quay về fixture**. API bị lỗi cũng không thay bằng JSON mẫu.

## Snapshot, health và giao dịch

- Client tải hết các trang proposal bằng cursor BE05 và giữ cùng H/hash/revision. Summary và Transfer dùng chính context đó; mỗi lượt tải mới bỏ context/cursor cũ. Mã lỗi đọc từ envelope `error.code`/`error.message`, không từ trường `message` ở root.
- Health gọi `/api/health` mỗi5s chỉ với chain/deployment, không ghim H. Hiển thị `ok`/`degraded`/`unavailable`, DB/indexer/publication và cảnh báo decode/projection. Heartbeat quá30s hoặc publication bị trễ hiện cảnh báo dữ liệu cũ; tự bỏ cảnh báo khi phục hồi. HTTP503 health vẫn có thể chứa envelope `data` hợp lệ. `lagSeconds` là chỉ báo freshness, không phải phép đo chính xác event delay; fixture cũ có thể null.
- Wallet dùng `window.ethereum` EIP-1193 (ví dụ MetaMask). Chưa kết nối vẫn đọc được API. Đọc GOV balance/delegate/current votes, hỗ trợ self-delegate và account/chain change; sai chain chặn giao dịch.
- Trước thao tác quản trị, frontend đối chiếu chain RPC, bytecode và quan hệ Governor → Treasury/GOV/Timelock, Treasury → BUD. Summary phải khớp cả năm địa chỉ cấu hình.
- Propose kiểm tra voting power tại `Governor.clock()-1` so với proposal threshold thật. Vote kiểm tra Active, `hasVoted` và voting power tại snapshot. Chỉ proposer hủy Pending; ai cũng có thể queue Succeeded và execute Queued/Ready qua Governor. Không gọi Timelock trực tiếp.
- `requestId` sinh một lần bằng CSPRNG và giữ qua retry; amount được parse từ chuỗi thành BigInt 18 decimals, từ chối > uint256, exponent hoặc >18 decimals. Title/body giữ nguyên khoảng trắng/Unicode; description được serialize một lần lúc propose. Queue/execute/cancel dùng nguyên actions/hash đã lưu, đối chiếu calldata disburse và proposal ID; không parse/stringify lại description.
- Nạp quỹ là BUD `transfer(Treasury, amount)`, không có endpoint POST hoặc hàm deposit giả. Pending/Active/Queued không giữ chỗ ngân sách; insufficient Treasury khi execute vẫn có thể revert.
- UI đợi receipt thành công, giữ dữ liệu form khi ký bị từ chối/lỗi, chặn gửi lặp khi giao dịch đang chờ. Sau receipt, thao tác quản trị/nạp quỹ tải lại snapshot mới nhất đã **xuất bản**. Nếu indexer chưa bắt kịp, bấm **Tải dữ liệu mới nhất** sau khi ingest/project; không tự ghi đè state/số dư dự đoán. Nút này cũng phục hồi snapshot/cursor đã hết TTL hoặc invalidated bằng lượt đọc mới, không dùng cursor cũ.
- Receipt replacement chỉ thành công khi repricing cùng action; cancellation/thay action báo lỗi. Hash/Proposal ID lấy từ receipt thực đã mine, không tìm lại hash cũ. Khi account đổi giữa delegation và receipt, callback cũ không được ghi đè balance/delegate/votes của account mới.
- Content có transaction owner được giữ mounted trong snapshot refresh thành công, có nhãn H cũ/đang tải; không xóa receipt chỉ vì publication chưa bắt kịp. API transport lỗi có thông báo tiếng Việt, giữ error thay vì fallback fixture.

## Browser kiểm chứng bằng Anvil thật

Không có production testing switch, mock receipt hoặc fake E2E. Với Anvil chỉ bind loopback, browser runner có thể inject EIP-1193 provider **trước khi tải ứng dụng**, dùng account unlocked trong manifest và forward RPC thật. Ví dụ Playwright (runner do người kiểm chứng cung cấp):

```js
await page.addInitScript(({ rpcUrl, account }) => {
  let id = 0;
  const rpc = async (method, params = []) => {
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const body = await response.json();
    if (body.error) throw Object.assign(new Error(body.error.message), body.error);
    return body.result;
  };
  window.ethereum = { request: async ({ method, params }) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
      const accounts = await rpc('eth_accounts');
      if (!accounts.some((value) => value.toLowerCase() === account.toLowerCase())) throw new Error('Account is not unlocked on this Anvil');
      return [account];
    }
    if (method === 'wallet_switchEthereumChain') {
      if ((await rpc('eth_chainId')).toLowerCase() !== params[0].chainId.toLowerCase()) throw Object.assign(new Error('Wrong local chain'), { code: 4902 });
      return null;
    }
    return rpc(method, params);
  } };
}, { rpcUrl, account: manifest.accounts.A });
await page.goto(frontendUrl);
```

Đổi account bằng context/page mới hoặc provider có event `accountsChanged`; không gọi production app API giả. Tất cả `eth_sendTransaction`, `eth_call`, receipt và chain ID vẫn đến Anvil thật. Chỉ dùng account unlocked trên chain local do người kiểm chứng sở hữu; không mở RPC unlocked ra mạng công cộng.

Selectors: `#proposal-title`, `#proposal-body`, `#proposal-recipient`, `#proposal-amount`, `#vote-support`, `#deposit-amount`. Các nút: **Self-delegate**, **Tạo đề xuất** (submit trong form), **Bỏ phiếu**, **Hủy đề xuất**, **Queue**, **Execute**, **Nạp quỹ**, **Tải dữ liệu mới nhất**. Ví nạp BUD lấy `manifest.accounts.funding`; GOV voting power thuộc A/B/C/D theo manifest.

## Các lệnh kiểm tra để người tích hợp chạy

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

Behavior tests kiểm tra calldata/hash SC01, nguyên văn Unicode/description, uint256/precision, payload gốc và định dạng tiền; không kiểm tra wiring bằng mock-echo hoặc repin bản sao fixture. Build có TypeScript typecheck. Các lệnh này và browser real-chain phải được chạy sau khi tích hợp hoàn tất; tài liệu này không tự khẳng định chúng đã pass. Fixture/unit/build không thay thế bằng chứng ví–API–chain, negative case hoặc deployment testnet thật.

## Kết quả nghiệm thu TV4 ngày 24/10/2026

[Browser evidence](../docs/evidence/tv4-20261024-acceptance/browser.json) ghi12checks,
bốn route ở390/1366 và8ảnh: A+B700For chi1000BUD, queue/execute/cancel/deposit,
wrong network/refusal/HTML-safe, cancellation/repricing và stale-account regression
trên Anvil/API thật. Sáu behavior tests và production build đã PASS sau sửa
TS1294; log theo từng source ở [report](../docs/evidence/tv4-20261024-acceptance/report.md).
Đây không phải wallet extension hoặc testnet. Bản tích hợp25/10 đã kiểm browser thật
pause→stale-warning→watch-recovery và backend reorg/cursor invalidation; xem
[tổng kết TV4](../docs/tv4-work-summary.md). Vẫn cần peer/testnet approval.

