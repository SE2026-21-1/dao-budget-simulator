# DAO Budget Simulator frontend

React/TypeScript/Vite + viem, tích hợp wallet, form, Governor và Treasury của TV3 với API đọc BE05. Xem hợp đồng API tại [docs/api.md](../docs/api.md) và triển khai tại [docs/be06.md](../docs/be06.md).

## Snapshot bị invalidated hoặc API đang recovery

Khi refresh trả HTTP409/503, dữ liệu H/hash/revision cũ và receipt/hash giao dịch
vẫn được giữ để đối chiếu, nhưng Vote/Cancel/Queue/Execute và nạp Treasury bị khóa.
Retry chưa hoàn tất hoặc retry tiếp tục lỗi không mở khóa. Chỉ một lượt tải
snapshot canonical thành công mới tạo quyền thao tác mới; quyền cũ đã thu hồi
không sống lại, kể cả RPC preflight của thao tác trước đó trả lời muộn.
`sync.status=not_ready` cũng không cho ký. API lỗi thật không fallback fixture.

`useProposalFixtures` cung cấp `snapshotSignal` cho `ProposalActions`/`TreasurySection`;
bind signal vào `walletSession(account, snapshotSignal)` để kiểm lại ngay tại
provider dispatch, không chỉ disable nút. Create proposal dùng signal của summary
read; thay context Treasury cũng hủy session còn chờ RPC. Self-delegate độc lập
snapshot vẫn giữ session guard provider/account/network.

TV4 tích hợp chọn lọc frontend TV3 `15b62b5b1a5402ca2bdb24aad2d7312b6299440c`
trên PR21 `4296c87`: Swiss Fintech/Inter tự host, Treasury/Governance, form review,
timeline, và đối chiếu detail/votes/Transfer tại cùng H/hash/revision. Giữ nguyên
WalletSession/provider/account/chain guard và kiểm chứng emitter/payload/proposal ID/
outcome tại block receipt. Transaction owner không bị remount trong lúc canonical
detail refresh, kể cả lỗi API; snapshot cũ luôn có nhãn, không là fixture fallback.

**Quyết định cấu hình:** không nhận default API localhost mới của TV3. Giữ hợp
đồng PR21: `VITE_API_BASE_URL` trống → fixture read-only, URL được đặt rõ → API.
`VITE_DATA_SOURCE=fixture` cho phép bỏ qua URL/deployment cũ một cách chủ động.
API chỉ cần chain/deployment để đọc; RPC và năm địa chỉ contract hợp lệ mới cho ký.
Các kết quả ở SHA lịch sử bên dưới không nghiệm thu cây tích hợp mới; browser,
receiving-host, extension-wallet và testnet vẫn cần bằng chứng riêng.

## Chạy fixture

Cần Node.js 24 và npm. Trên máy mới, chạy trong PowerShell hoặc terminal:

```sh
git clone https://github.com/SE2026-21-1/dao-budget-simulator.git
cd dao-budget-simulator
# Checkout the reviewed integration commit supplied with this handoff first.
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Nếu đã clone repo thì chạy hai lệnh `npm` ở trên từ repository root. Mở `http://127.0.0.1:5173` trong Chrome/Edge trên **cùng máy** đang chạy Vite. Mỗi thành viên tự cài, thiết lập và mở khóa tiện ích ví EVM trong đúng profile trình duyệt đó; trên web bấm **Tìm lại ví** rồi **Kết nối ví**. Không chia sẻ seed phrase/private key và không commit `.env.local`.

Chế độ fixture không cần RPC, backend, ví hoặc `.env.local`. Có thể kết nối ví để xem địa chỉ, nhưng mọi giao dịch với fixture đều bị khóa. Kể cả khi còn `.env.local` từ lần demo trước, fixture không yêu cầu chuyển mạng hoặc đọc token từ deployment cũ. Muốn thử GOV, self-delegate, propose/vote/queue/execute hoặc nạp BUD, làm theo phần cấu hình BE05 và deployment thật bên dưới.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Dashboard, số dư BUD, tổng vào/ra và lịch sử Treasury |
| `/proposals` | Danh sách, lọc state, tìm ID/nội dung/người tạo/người nhận, phân trang 20 mục |
| `/proposals/:id` | Description, snapshot/deadline/ETA, phiếu/quorum, receipt và thao tác quản trị |
| `/proposals/new` | Form khoản chi và xem lại trước khi ký |
| `/treasury` | Snapshot Treasury, đối chiếu tổng vào/ra và Transfer, nạp BUD |
| `/governance` | Kết nối ví, GOV balance/delegate/votes và thông tin deployment |

Nguồn fixture duy nhất là **`../fixtures/api/`**; không duy trì JSON bản sao dưới `src/`. Ba trang proposal có 20/20/5 mục tổng hợp. Không gửi giao dịch quản trị/nạp quỹ từ context synthetic. Banner phân biệt fixture/API; địa chỉ fixture không là giá trị mặc định của cấu hình wallet.

Trong Vite dev, thêm `?fixture=error` vào đường dẫn để xem lỗi tải fixture. Nút **Thử lại** tải lại; bỏ query để phục hồi. Cơ chế này không áp dụng khi API đã bật, và không phải công tắc giả lập giao dịch. Skip link **Bỏ qua điều hướng** trỏ tới main focusable; phân trang thông báo qua live region. Layout có breakpoint mobile; cần kiểm tra lại viewport 390px khi bàn giao.

## Kết nối BE05 và deployment thật

BE05 đã có HTTP server, không còn là API dự kiến. API đọc PostgreSQL publication; không ký/gửi transaction hoặc tự chạy indexer. Cần chạy deployment, ingest và projection trước: [hướng dẫn BE06](../docs/be06.md), [chạy API BE05](../docs/api.md#7-chạy-api-be05).

Server cần `DATABASE_URL`, `API_CURSOR_SECRET` ít nhất 32 byte và origin frontend chính xác trong `API_CORS_ORIGINS`, ví dụ `http://127.0.0.1:5173`. `localhost` và `127.0.0.1` là origin khác nhau. Không cấu hình CORS wildcard để che lỗi tích hợp.

Sao chép `.env.example` thành `.env.local` và điền từ manifest thật, hoặc truyền biến môi trường bên ngoài. Tất cả biến `VITE_` đều công khai trong trình duyệt; **không chứa private key, seed phrase, DATABASE_URL hoặc secret**.

| Biến | Giá trị |
| --- | --- |
| `VITE_DATA_SOURCE` | Tùy chọn `fixture` để ép demo read-only, kể cả URL/deployment cũ còn tồn tại |
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
  VITE_DATA_SOURCE: '',
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

Thay đường dẫn/URL/deployment name bằng bàn giao hiện tại; không dùng địa chỉ tổng hợp. Khởi động lại Vite sau khi đổi cấu hình. URL API được đặt nhưng thiếu chain/deployment hợp lệ sẽ báo lỗi cấu hình, **không âm thầm quay về fixture**. Có scope API hợp lệ nhưng thiếu RPC/năm địa chỉ thì chỉ đọc, mọi thao tác ký bị khóa. API bị lỗi cũng không thay bằng JSON mẫu.

### Windows nhận run BE09 — sửa deployment ID mà không ghi `.env.local`

Deployment archived ngày11/11 trong #36/#40 không phải service đang hoạt động.
Lấy deployment name và API/RPC/năm địa chỉ từ public manifest/runtime của run hiện
tại. Sau khi **chính owner dừng Vite cũ**, mở PowerShell tại repo và đặt
`$deploymentName` bằng tên run thực đã đối chiếu với `context.deploymentId`:

```powershell
$env:VITE_DATA_SOURCE = ''
$env:VITE_DEPLOYMENT_ID = $deploymentName
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Biến chỉ áp dụng cho shell/tiến trình con; không sửa file môi trường. Các biến
API/RPC/chain/five addresses phải giữ đúng manifest đã kiểm. Vite đọc env khi
khởi động: reload trình duyệt không sửa ID của server cũ. `--strictPort` phải
thất bại nếu port còn bị chiếm; không kill tiến trình không thuộc mình. Nếu dùng
port khác, cần TV2 cấu hình origin CORS chính xác trước, không wildcard.

Sau khi mở lại UI, đối chiếu chain/deployment và SnapshotInfo H/hash/revision với
context canonical API hiện hành, không ép H/hash/revision của run archived.
Thu thập browser tại390/1366, keyboard, Console/Network; FE live không thay
visual/extension acceptance.

## Snapshot, health và giao dịch

- Client tải hết các trang proposal bằng cursor BE05 và giữ cùng H/hash/revision. Summary và Transfer dùng chính context đó; mỗi lượt tải mới bỏ context/cursor cũ. Mã lỗi đọc từ envelope `error.code`/`error.message`, không từ trường `message` ở root.
- Dashboard, danh sách và chi tiết (kể cả không tìm thấy ID) hiện nguồn, H, hash và revision của **snapshot đang hiển thị**; với API, hiện cả trạng thái sync tại lúc tải. Health ở header thăm dò riêng mỗi 5 giây nên có thể mới hơn snapshot: phải bấm **Tải dữ liệu mới nhất** để lấy H/hash/revision mới, không suy trạng thái health là dữ liệu đã xuất bản.
- Health gọi `/api/health` mỗi5s chỉ với chain/deployment, không ghim H. Hiển thị `ok`/`degraded`/`unavailable`, DB/indexer/publication và cảnh báo decode/projection. Heartbeat quá30s hoặc publication bị trễ hiện cảnh báo dữ liệu cũ; tự bỏ cảnh báo khi phục hồi. HTTP503 health vẫn có thể chứa envelope `data` hợp lệ. `lagSeconds` là chỉ báo freshness, không phải phép đo chính xác event delay; fixture cũ có thể null.
- Wallet phát hiện EIP-6963 và `window.ethereum` EIP-1193 (ví dụ MetaMask), cho chọn provider khi có nhiều tiện ích và tìm lại ví khởi tạo muộn. Chưa kết nối vẫn đọc được API. Đọc GOV balance/delegate/current votes, hỗ trợ self-delegate và account/chain change; sai chain chặn giao dịch. Response kết nối đến muộn không được ghi đè account/chain event mới hơn.
- Trước thao tác quản trị, frontend đối chiếu chain RPC, bytecode và quan hệ Governor → Treasury/GOV/Timelock, Treasury → BUD. Summary phải khớp cả năm địa chỉ cấu hình.
- Mỗi thao tác giữ session ví/account/chain ngay trước các bước kiểm tra bất đồng bộ. Nếu đổi provider/account/chain hoặc ẩn tài khoản trước lúc gửi, thao tác cũ báo lỗi, không chuyển yêu cầu ký sang ví vừa chọn. Giao dịch đã gửi tới ví/chain không thể thu hồi bằng cách đổi session.
- Propose kiểm tra voting power tại `Governor.clock()-1` so với proposal threshold thật. Vote kiểm tra Active, `hasVoted` và voting power tại snapshot. Chỉ proposer hủy Pending; ai cũng có thể queue Succeeded và execute Queued/Ready qua Governor. Không gọi Timelock trực tiếp.
- `requestId` sinh một lần bằng CSPRNG và giữ qua retry; amount được parse từ chuỗi thành BigInt 18 decimals, từ chối > uint256, exponent hoặc >18 decimals. Title/body giữ nguyên khoảng trắng/Unicode; description được serialize một lần lúc propose. Queue/execute/cancel dùng nguyên actions/hash đã lưu, đối chiếu calldata disburse và proposal ID; không parse/stringify lại description.
- Nạp quỹ là BUD `transfer(Treasury, amount)`, không có endpoint POST hoặc hàm deposit giả. Pending/Active/Queued không giữ chỗ ngân sách; insufficient Treasury khi execute vẫn có thể revert.
- UI đợi receipt thành công, giữ dữ liệu form khi ký bị từ chối/lỗi, chặn gửi lặp khi giao dịch đang chờ. Sau receipt, thao tác quản trị/nạp quỹ tải lại snapshot mới nhất đã **xuất bản**. Nếu indexer chưa bắt kịp, bấm **Tải dữ liệu mới nhất** sau khi ingest/project; không tự ghi đè state/số dư dự đoán. Nút này cũng phục hồi snapshot/cursor đã hết TTL hoặc invalidated bằng lượt đọc mới, không dùng cursor cũ.
- Receipt replacement chỉ thành công khi repricing cùng action; cancellation/thay action báo lỗi. Hash/Proposal ID lấy từ receipt thực đã mine, không tìm lại hash cũ. Khi account đổi giữa delegation và receipt, callback cũ không được ghi đè balance/delegate/votes của account mới.
- Content có transaction owner được giữ mounted khi refresh snapshot, kể cả refresh bị lỗi: giữ snapshot cũ có nhãn cảnh báo và receipt/hash; thử lại bằng **Tải dữ liệu mới nhất**. Receipt nạp quỹ vẫn hiển thị khi summary/transfer của H mới đang tải hoặc lỗi. Lỗi tải lần đầu vẫn là màn hình lỗi; không fallback fixture hoặc suy đoán số dư.

### Kết nối ví trong trình duyệt

Mở URL Vite trong trình duyệt đã cài và bật tiện ích ví EVM. Chọn ví nếu có nhiều provider, bấm **Kết nối ví** rồi xác nhận popup. Nếu chưa thấy ví, bấm **Tìm lại ví**; trình duyệt tích hợp không có tiện ích sẽ không cung cấp provider. Kết nối và xem địa chỉ không cần API hoặc địa chỉ contract, còn thao tác on-chain cần cấu hình deployment khớp manifest.

Khi đã có API/deployment thật, nút **Chuyển sang mạng** gửi yêu cầu tới ví. Nếu ví chưa biết chain (`4902`), trang yêu cầu ví thêm mạng với chain ID/RPC đã cấu hình rồi xác nhận đã chuyển đúng chain. Người dùng phải kiểm tra RPC và chấp thuận trong tiện ích ví; thao tác này không khởi chạy Anvil/API hoặc cấp GOV/BUD. Ở chế độ fixture nút chuyển mạng không xuất hiện.

Trang không tự mở yêu cầu cấp quyền khi tải; `eth_accounts` chỉ khôi phục tài khoản đã được cấp quyền. **Ẩn tài khoản** chỉ xóa khỏi giao diện. Muốn thu hồi quyền website, thực hiện trong tiện ích ví.

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

Selectors: `#proposal-title`, `#proposal-body`, `#proposal-recipient`, `#proposal-amount`, `#vote-support`, `#deposit-amount`. Form: bấm **Tiếp tục: xem lại**, kiểm nội dung rồi **Ký và tạo đề xuất**. Các nút còn lại: **Self-delegate**, **Bỏ phiếu**, **Hủy đề xuất**, **Queue**, **Execute**, **Nạp quỹ**, **Tải dữ liệu mới nhất**. Ví nạp BUD lấy `manifest.accounts.funding`; GOV voting power thuộc A/B/C/D theo manifest.

Smoke các lỗi lifecycle cần API/deployment thật như phần trên và provider có event `accountsChanged`/`chainChanged` (hai provider để thử đổi ví). Trong lúc trì hoãn RPC kiểm tra deployment, đổi account/provider/mạng rồi tiếp tục RPC: phải báo session đã đổi và không có `eth_sendTransaction` từ thao tác cũ. Trì hoãn response kết nối rồi phát account/chain event mới hơn: UI phải giữ event mới. Sau một deposit/cancel có receipt thật, ngắt API trước refresh: receipt/hash và snapshot H cũ phải còn, có cảnh báo lỗi; bật API và tải lại để phục hồi. Chặn riêng summary/transfer của H mới để kiểm receipt vẫn hiện trong lúc tải và sau lỗi. Chế độ fixture chỉ kiểm route/layout và giao dịch bị khóa, không chứng minh các ca session/receipt này.

Browser bàn giao cây tích hợp: kiểm cả sáu route ở390/1366, không tràn ngang,
skip-link vào main và form review phải reset khi sửa input. Trên cùng deployment
thật, kiểm SnapshotInfo và các tổng phiếu/Transfer; sau receipt trì hoãn detail/
votes/transfers của snapshot mới: hash/receipt và snapshot cũ vẫn hiện, không ký
trong khi lease cũ đã bị thu hồi. Trả409/503 từ collection **hoặc pinned child**:
action/nạp quỹ phải khóa ngay cả RPC preflight đang chờ; retry lỗi không mở khóa,
chỉ canonical load đầy đủ mới mở lại. Lỗi child phải có cảnh báo. Thử điều hướng
sang proposal khác khi detail cũ còn giữ: không được hiển thị/ký proposal trước.
Header wallet ở fixture/read-only API không được báo sai mạng khi chưa có chain
deployment để so sánh.

## Các lệnh kiểm tra để người tích hợp chạy

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

Behavior tests kiểm tra calldata/hash SC01, nguyên văn Unicode/description, uint256/precision, payload gốc và định dạng tiền. Các regression React DOM dùng `happy-dom` kiểm account/chain event đến sau, đổi provider/account khi chờ RPC, abort request superseded, giữ snapshot/receipt khi refresh lỗi và phục hồi; chỉ mock biên ví/RPC/API, không thay bằng mock-echo hoặc repin bản sao fixture. Build có TypeScript typecheck. Chạy các lệnh trên sau khi tích hợp; tài liệu này không tự khẳng định đã pass. Fixture/unit/build không thay thế bằng chứng ví–API–chain hoặc deployment testnet thật.

Live API: trong **tiến trình test riêng**, đặt đủ `BE05_LIVE_API_URL`,
`BE05_LIVE_CHAIN_ID`, `BE05_LIVE_DEPLOYMENT_ID`, `BE05_LIVE_RPC_URL` từ cùng run
đang phục vụ, rồi chạy
`npm --prefix frontend test -- --run src/data/api.live.test.ts`.
Thiếu biến thì SKIP, không là PASS. Test SC06 mới dùng `SC06_LIVE_RUN` trỏ đến
`chain.json` của `scripts/generate_sc06_chain.mjs` vừa chạy ở **cùng HEAD**,
không dùng artifact cũ làm live proof:
`npm --prefix frontend test -- --run src/chain/sc06.live.test.ts`.
Suite thường không cung cấp các biến live này và phải báo các ca đó SKIP.

## Kết quả nghiệm thu TV4 ngày 24/10/2026

[Browser evidence](../docs/evidence/tv4-20261024-acceptance/browser.json) ghi12checks,
bốn route ở390/1366 và8ảnh: A+B700For chi1000BUD, queue/execute/cancel/deposit,
wrong network/refusal/HTML-safe, cancellation/repricing và stale-account regression
trên Anvil/API thật. Sáu behavior tests và production build đã PASS sau sửa
TS1294; log theo từng source ở [report](../docs/evidence/tv4-20261024-acceptance/report.md).
Đây không phải wallet extension hoặc testnet. Bản tích hợp25/10 đã kiểm browser thật
pause→stale-warning→watch-recovery và backend reorg/cursor invalidation; xem
[tổng kết TV4](../docs/tv4-work-summary.md). Vẫn cần peer/testnet approval.
