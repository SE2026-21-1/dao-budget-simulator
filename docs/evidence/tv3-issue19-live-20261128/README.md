# TV3 — #19: live MetaMask selected-provider interval, 28/11/2026

## Disposition

**LIVE SCOPED EVIDENCE SUBMITTED — TV4 INDEPENDENT REVIEW REQUIRED.** Provider interval và same-session identity đã được thu bằng extension thật. Historical HTTP503 cause vẫn **UNKNOWN**; #19 tiếp tục **OPEN/PARTIAL**, không tự đóng hoặc nhận full acceptance. Không nộp lại accepted visual/preflight/provenance cũ, không chạy governance lifecycle.

- Run: **`TV3-MM-boundary-20261128T100609709Z`**.
- Product source: **`e17ef61a8a51518005c38b0808cdc06fe7a68bbf`**, fetched Dev sau PR63; chạy từ checkout riêng `/home/chung2k5/dao-issue19-live-source-e17ef61`, recursive submodules đúng pin, root/frontend lockfile install và `forge build` thành công. Tooling overlay trên branch PR64, base **`9f11296667f75c7f4fa3860a2fddc471d13e9e22`**; ba script trong commit bàn giao này, bytes được ghi ở `verification.json`, observer hash còn được ghi lúc capture trong `run.json`.
- Local unforked chain31337; deployment DB id1/name `qa07-e2e`; K2. `handoff.json` và `manifest.json` là bytes run mới, SHA256 manifest **`0a8637a9cda0de5a70f5b958a68c7f3010c3836a62f6c537ead2c6bf7df52a5c`**.
- Stack phục vụ `10:02–10:19Z`; capture từ `10:06:09.709Z` đến `10:19:08.078Z`, exit0. Stack graceful `SERVE_STOPPED`, exit0 tại `10:19:36.256Z`, không coi startup/serve-stop là acceptance. `stack-report.json.gz` là **nguyên bytes report gốc được gzip**, không lược bỏ worker RPC/source hashes/lỗi.
- Môi trường chỉ loopback và do lượt này sở hữu: frontend36453, API proxy41191, original API36223, RPC39545, PG43939, worker RPC proxy33405, CDP37039. **Tất cả đã dừng** sau thu evidence; không mở các URL archived như endpoint đang sống.

## Ba blocker

| Blocker | Evidence mới | Kết quả phạm vi TV3 | Còn thiếu |
|---|---|---|---|
| Continuous selected-provider interval | `provider-trace.jsonl`, final snapshots, A/B draft records, raw RPC exchanges | Direct boundary support: hook trước app acquire; interval52–77, không send; A→B→A/draft continuity | TV4 independent review/acceptance |
| Same-session extension identity | `identity.json`, `installed-extension.png`, `installed-extension-manifest.json`, `extension-release.json` | Actual same-session ID/version/profile captured; real stable unpacked MetaMask | TV4 review; H26 historical version vẫn UNKNOWN |
| Raw HTTP503 + TV2 logs | Browser HTTP JSONL, new direct/proxied probes, backend-state, raw worker/PG logs và stack report | New requests có200, không quan sát503; **không giải thích historical503** | TV2 lookup original26/11 packet/logs; historical cause UNKNOWN nếu dữ liệu gốc không còn |

## Direct provider interval (không phải inference từ nonce)

`qa07_live_capture.mjs` tạo tab app, expose append-only external JSONL sink, cài `installProviderObserver` bằng `evaluateOnNewDocument` **trước navigation và module app**. Observer không tạo provider, không phát accountsChanged giả, không sửa form/app state hoặc response/error ví. Capture-phase listener wrap đúng object MetaMask trong EIP6963 announcement trước listener discovery của app; không dùng logger cài muộn trên một provider khác. Các phương thức ngoài allowlist vẫn được đếm tên nhưng redact params/results để tránh ghi signing secrets.

Coverage trực tiếp trong trace:

- seq1 `document-init`, `readyState=loading`.
- seq2 hook thành công trên **provider-1**, EIP6963 `io.metamask`, UUID `5714e20d-7132-46ae-8290-9d5b8104bdeb`.
- seq9/10 là `eth_accounts`/`eth_chainId` từ restore path thật của app; seq11/12 là responses. Hook cài trước các request app, không chỉ có zero entries.
- A/B/return records và final snapshot đều `installed=true, stillWrapped=true`; một extension wallet được app discover. Các control queries do harness gọi sau đó cũng ghi rõ trong trace; không gọi chúng là app restore requests.
- Full raw trace **78 entries**, contiguous sequence; measured interval **seq52–77**, **26 entries**, `2026-11-28T10:15:39.776Z` → `10:17:42.867Z`.
- seq58: real `accountsChanged [B,A]`; seq64: before Submit `10:16:19.922Z`; seq65: actual guard visible + submit no longer busy, `10:16:20.263Z`; seq72: real `accountsChanged [A,B]`; seq77: A-return settled.
- Trong interval không có `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_signTransaction` hoặc `wallet_sendCalls`. **Không tuyên bố toàn session zero-send**: trace giữ cả hai preparation delegation requests (seq33 lỗi4100 và seq40 thành công), đều trước seq52. Positive preparation request cũng chứng minh logger thực sự bắt send boundary.

Chuỗi thao tác thực: A đủ power400 → nhập draft1BUD → Review → đổi site-authorized sang B0 bằng chooser MetaMask → bấm Submit đúng một lần → guard báo thiếu past voting power → đợi submit enabled/UI settle → đổi về A. Không propose/vote/queue/execute/cancel Governor.

### Draft/account/nonces

- A: `0x9b524d3a18716b0607504761ed2eb061932c9527`.
- B: `0x729b025adae5aca996c1e13b091fbacf293b89d5` (**không phải fixture manifest.accounts.B**).
- Request ID: `0x75299a818f18ce4b86ffdf69d62f9b02649919f6a0913504dd1341fd9a59f0e3`.
- `A-draft.json`, `B-before-submit.json`, `B-blocked.json`, `A-return.json`: title/body/recipient/amount và full review/requestId giữ nguyên. B Submit enabled trước thao tác; guard chặn **sau click**, không gọi nút disabled.
- `rpc-before.json`, `rpc-after-submit.json`, `rpc-after-return.json` giữ raw request/HTTP status/headers/response body; head26/hash **`0x0065513d2936fe49adc7632a89aa9aa7899521b8cbe86b1024c7465fac82b9f0`**, A latest/pending1/1, B0/0, pool0/0 không đổi. Governor clock1800000808; pastVotes A400e18/B0; threshold50e18. Đây là corroboration riêng, **không thay provider trace**.
- **H26 của run mới không phải H26 lịch sử 24/11.** Không gán nonce, ảnh, hash, manifest hoặc version mới cho run cũ.

`preparation-fixture.json` phân biệt unlocked local fixture funding A1ETH/400GOV với signature MetaMask. A self-delegate qua extension tx `0x67da8c28577459b140faa3674b115a87b06ead143ff6b57596973ba23db364d1`; mine2blocks/1second trước interval để checkpoint ở quá khứ. Ảnh B còn hiển thị receipt self-delegate cũ ở sidebar: **không phải transaction của blocked proposal**. Không có proposal receipt để nộp.

## Same-session browser/extension identity và profile safety

- Official stable release asset: `https://github.com/MetaMask/metamask-extension/releases/download/v13.58.0/metamask-chrome-13.58.0.zip`, downloaded bằng `gh release download`; digest được tính trong lượt này, **không claim đã verify sigstore signature**.
- Actual installed ID **`oamaibdaigjnbdconjppnkfdcacinpgn`**; MetaMask enabled/UNPACKED từ `chrome://extensions/?id=...` trong chính CDP browser đang chạy app. Installed UI version13.58.0; actual package manifest `version=13.58.0.0`, `version_name=13.58.0`, MV3. Không chỉ producer khai báo version.
- Chrome for Testing **150.0.7871.24**, Linux x64; actual profile `/home/chung2k5/.config/google-chrome-for-testing/Default`, directory birth `2026-11-28T10:00:26.972067686Z`. Profile chạy mới bắt đầu ở MetaMask onboarding; không import, export hoặc đọc key/seed/vault. Password ngẫu nhiên chỉ trong RAM, backup phrase không được reveal.
- Không restart/copy/truy cập Windows Chrome cá nhân. User-local runtime libraries được extract từ Ubuntu packages vì sudo không có, không thay package hệ thống. Test binary/profile khác Windows Chrome và được sinh trong lượt này.
- Tool custom launcher thực tế **không thêm `--user-data-dir`** như default documentation; đã report tool issue, ghi nguyên actual profile/command line trong `identity.json`. Không mô tả profile đó thành một đường dẫn per-run khác. Lượt tương lai phải truyền explicit fresh `--user-data-dir` như dưới.
- Các button MetaMask được kích hoạt bằng **DOM click trên control UI hiện hữu** khi native click/focus+Enter không kích hoạt handler. Đây vẫn là permission/network/account/signature UI thật; không gọi controller, không sửa storage/state hoặc override response. Giữ giới hạn input-method này cho TV4.
- Một `page.screenshot(fullPage)` timeout **sau khi guard và marker seq65 đã hoàn tất**. Không bấm Submit lại; browser tool reattach không reload page, external capture service tiếp tục ghi và hook vẫn nguyên. `B-blocked.json` đã lưu trước timeout; `B-blocked.webp` được chụp sau recovery, không gọi ảnh đó là instant click hoặc video liên tục. `runtime-observations.json` giữ các lỗi này.

## HTTP503 và TV2 correlation

`http.jsonl`: 160 browser requests,158 raw responses đều200;2 initial health/summary requests `net::ERR_ABORTED` được giữ nguyên, không đổi thành successful responses. Không quan sát503 mới. `http-probe.json` là phép đo read-only mới qua frontend transport proxy; `http-direct-api.json` lấy original in-process API36223, giữ status/headers/body/UTC thật cho health/proposals200. API proxy runner chuẩn hoá headers; không lấy proxy headers thay original API headers.

`backend-state.json` chụp transaction PG repeatable-read/read-only: deployment1, head26/confirmed24, recovery phase ready; projection publicationH24/hash `0x12cfc1583fc3f0f7211f2a45cb6629d5a52ec066b41ed26bbc4b978d84b855b9`. Có16 ignored ancillary topics; không tự gọi đó là nguyên nhân503 hoặc fully healthy. Worker/PG logs gzip là original bytes cùng stack; PG logs dùng UTC+07, JSON capture UTC. API chạy in-process qua `createApiServer`, **không có separate API request logger**; packet/correlation từ browser/probe được giao thay vì dựng log API không tồn tại. Không có request/correlation ID do server cung cấp trong probe nếu header không chứa.

Nhờ TV2 `@daongocuong` review raw packets/worker/PG/state mới để xác nhận phạm vi run này; đồng thời xác nhận retention/location original503 của `TV3-MM-negative-20261126-4cba99a0`, source `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`, deployment label `tv3-local-0xa6c8b5`. Các RPC timestamps26/11 16:40–16:45Z chỉ là lookup markers, không request timestamp. Nếu original URL/query/status/headers/body/UTC/raw-health/logs không còn, giữ **MISSING / historical cause UNKNOWN**; probe200 run mới không sửa được lịch sử. Không có frontend/backend defect mới được chứng minh để sửa production.

## Chạy lại an toàn / manual fallback tối thiểu

**Lượt này đã tự hoàn thành, không cần người dùng làm thêm thao tác ví.** Các lệnh dưới dành cho lượt mới nếu TV4 cần independent live review, không dùng lại endpoints đã dừng hoặc wallet profile cũ.

1. Terminal WSL, source checkout approved và artifacts/dependencies như trên. Tạo output chưa tồn tại rồi chạy (giữ foreground; `--serve` không inject adapter):

   ```sh
   node --import tsx scripts/check_qa07_e2e.mjs \
     --postgres-bin /tmp/issue19-pg184/node_modules/@embedded-postgres/linux-x64/native/bin \
     --output /absolute/NEW-stack-output \
     --project-root /home/chung2k5/dao-issue19-live-source-e17ef61 --serve
   ```

2. Mở **Linux Chrome for Testing riêng**, không Windows Chrome cá nhân. Dùng profile path mới chưa tồn tại, không copy profile. Launcher thực của máy này (user-local libs) có thể chạy:

   ```sh
   LD_LIBRARY_PATH=/tmp/issue19-browser-deps/root/usr/lib/x86_64-linux-gnu \
   /home/chung2k5/.omp/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome \
     --user-data-dir=/absolute/NEW-private-test-profile \
     --remote-debugging-address=127.0.0.1 --remote-debugging-port=0 \
     --disable-extensions-except=/tmp/issue19-metamask-release/extension \
     --load-extension=/tmp/issue19-metamask-release/extension about:blank
   ```

   Chỉ dùng ví disposable mới. Thiết lập mật khẩu/backup trực tiếp trên UI nếu automation không làm được; không gửi credential cho assistant. Không dùng tài khoản có tài sản thật. Actual ID phải đọc từ `chrome://extensions`, không gán ID của run này nếu đường dẫn load khác.

3. Kết nối công cụ qua **loopback CDP**, không cần browser relay. Đọc `DevToolsActivePort` trong profile vừa tạo để lấy port + websocket path; chạy từ checkout tooling:

   ```sh
   QA07_PUPPETEER_MODULE=/tmp/issue19-driver/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js \
   node scripts/qa07_live_capture.mjs \
     ws://127.0.0.1:NEW_PORT/devtools/browser/ACTUAL_ID \
     /absolute/NEW-stack-output/handoff.json /absolute/NEW-capture-output ACTUAL_EXTENSION_ID
   ```

   Capture tool **tự mở đúng `handoff.frontendUrl + /proposals/new` sau khi cài init observer**. Không tự mở app trước rồi cài logger muộn. Chờ `QA07_CAPTURE_READY`; thu identity đã cùng browser. Dùng URL frontend/RPC từ handoff của lượt mới, không nhập các cổng archived ở báo cáo này.

4. Manual chỉ nếu UI automation bị chặn: trên website bấm Kết nối ví; trong MetaMask Connect và add/switch network31337 đúng loopback RPC handoff; tạo/cho phép A và B cho site. Chuẩn bị A400GOV + self-delegate bằng ví test (unlocked local fixture chỉ funding), mine checkpoint trước measurement. Assistant/tool làm funding/read/snapshot, không yêu cầu operator chạy toàn governance.
5. **Logger chạy từ đầu page đến hết A-return.** Bắt đầu measured marker sau preparation, trước A draft; A điền1BUD/Review, lưu requestId+nonces. Chọn B qua account chooser MetaMask với site permission, đợi website thực hiện B0, kiểm draft giữ nguyên. Bấm Submit **một lần**, chờ lỗi thiếu voting power và nút hết busy, lưu raw snapshot/ảnh. Chọn lại A, đợi website400GOV, đối chiếu cùng requestId/fields; không gửi proposal bằng A.
6. Thu RPC snapshots bằng `node scripts/qa07_capture_state.mjs HANDOFF PUBLIC_A PUBLIC_B NEW_OUTPUT.json` trước switch/sau blocked Submit/sau return. Assistant đặt marker và lưu DOM thật; không yêu cầu operator paste logger hay sửa app state. Chỉ sau A-return+snapshot xong mới Ctrl-C **capture process** (flush JSONL/final snapshot); sau đó Ctrl-C đúng **stack runner** (flush worker/PG/report). Không stop service của người khác. Thiếu thao tác hoặc mất coverage thì BLOCKED, không diễn giải zero entries thành PASS.

## Verification / inventory

`verification.json` và các `check-*.txt` ghi lệnh/UTC/exit code sau lần edit cuối, kiểm observer unit (mock-labelled), existing wallet/API/transaction/QA07 regression, lint/typecheck/build và assertions trên raw evidence (sequence/coverage/retained draft/nonce/source/identity/HTTP separation). Đây không thay TV4 review hoặc historical503 proof. `SHA256SUMS.txt` bao phủ mọi payload trừ chính checksum file. Gzip logs/report có thể giải nén để kiểm nguyên bytes; không chứa browser profile, vault, private key, seed hoặc password.
