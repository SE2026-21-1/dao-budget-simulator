# TV3 — Issue #19, kiểm tra khả năng bổ sung evidence ngày 28/11/2026

## Kết luận

**OPEN/PARTIAL; ba blocker chưa được nghiệm thu. Đây là kiểm tra môi trường/source và bàn giao dependency, KHÔNG phải một live MetaMask run.** Không tạo lại evidence đã accepted, không chạy governance, không gửi giao dịch, không sửa product/contract/ABI/API/deployment hoặc validation/security guards.

- Run kiểm tra: `TV3-issue19-readiness-20261128T094833Z`; bắt đầu `2026-11-28T09:48:33Z`. Thời gian từng lệnh kiểm thử và kết thúc nằm trong `verification.json`.
- Source kiểm tra: **`e17ef61a8a51518005c38b0808cdc06fe7a68bbf`**, fetched `origin/Dev`; branch riêng `tv3/issue19-evidence-20261128`.
- [PR #63](https://github.com/SE2026-21-1/dao-budget-simulator/pull/63) đã merge tại source trên. `pr63.json` là metadata API thực thu trong lượt này.
- Tiêu chí hiện hành: [TV4 7234792353](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7234792353), lưu nguyên body công khai trong `tv4-acceptance.json`. Không dùng các yêu cầu superseded làm gate mới.
- [TV2 7235788299](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7235788299), lưu trong `tv2-503-investigation.json`: historical root cause **UNKNOWN**. Các probe TV2 cô lập không phải tái hiện lỗi TV3.
- [Dev CI 46122529051](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46122529051) SUCCESS tại exact source (metadata `dev-ci.json`); CI có sẵn, **không phải CI của commit evidence mới hoặc proof extension**.

## Working tree và an toàn

Checkout cá nhân `/mnt/d/DAO-Budget-Simulator` ở `feature/tv3-frontend`, HEAD `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`, behind remote-tracking branch 1 commit. Lệnh read-only `git --no-optional-locks status --short --branch --untracked-files=no` báo **17 staged, 719 unstaged**; không suy ra số file duy nhất hoặc trạng thái untracked từ lệnh này. Local Dev cũ là `357cd3ee1a04b7e13f5f8ce14b96e4e91405af26`. Lần status đầu timeout 30s; lần read-only sau hoàn tất 85.28s; một lệnh diff/list-untracked riêng timeout 45s, không dùng làm proof clean tree.

Không checkout/reset/stash/clean, không sửa index/file ở checkout cá nhân. Các checkout Linux đã kiểm: `dao-budget-metamask19-tv3` detached `e8e443c`, `dao-budget-simulator-tv3-run-4cba99a0` detached `4cba99a`, `dao-budget-issue19-dev-20261123` local Dev `6766e5e`, đều không có thay đổi được status báo trước thao tác. Fetch trong checkout Dev Linux cập nhật remote-tracking `6766e5e` → `e17ef61`, giữ local branch cũ; tạo checkout riêng cho bàn giao. Không đọc/copy wallet vault, seed, private key, password hoặc browser profile; không dừng/khởi động lại service của người khác, không dùng PG đang nghe cổng 5432.

## Đối chiếu ba blocker

| Blocker | Evidence thực có trong lượt này | Kết quả | Còn thiếu / owner |
|---|---|---|---|
| Provider-boundary continuous interval | Static review source/current regression; `environment.txt` chứng minh không có local test listeners tại các cổng đã kiểm; browser tool không có session điều khiển được | **BLOCKED**; không có trace runtime, không claim zero-send | TV3/receiver operator: phiên extension test có thể điều khiển + local deployment/manifest được phép; interval A→B→blocked Submit→settle→A với request/draft continuity |
| Same-session MetaMask identity | Chrome Windows tồn tại, remote debugging=false/custom profile=false; relay không tìm thấy | **BLOCKED**; ID/version/profile/session run mới không được quan sát. **H26 version UNKNOWN** | TV3/operator: actual About/installed extension manifest trong chính phiên mới, ID/exact version/profile-session binding gắn run/source/chain/manifest |
| Raw HTTP 503 + TV2 logs | Tìm candidate logs và kiểm thời gian (`environment.txt`); log tìm thấy thuộc 04–08/11, không liên kết run 26/11. TV2 đã kết luận thiếu raw packet | **MISSING trong phạm vi tìm kiếm; cause UNKNOWN** | TV2/TV3: packet nguyên gốc URL/query/status/headers/body/UTC/context và API/worker/PG logs có correlation. Nếu không giữ được, xác nhận MISSING và thống nhất phép đo backend hẹp mới |

**Giới hạn phiên hiện tại:** không có chainId/deployment manifest/account A/B/nonce trước-sau/screenshot/trace mới để nộp. Các trường này trong `record.json` là null/MISSING, không lấy từ H19/H26 để lấp. Đây không phải failed wallet run; live case chưa thể bắt đầu.

## Provider boundary: kết quả đọc source và điều kiện thu tiếp

Đã đọc `frontend/src/chain/walletProviders.ts`, `wallet.tsx`, `transactions.ts`, `pages/CreateProposalPage.tsx` và các regression liên quan trên source nêu trên:

- App discover EIP-6963/legacy, chọn `selectedWallet.provider`, lưu provider/account/chain trong `activeWalletSession`; không được giả định logger trên `window.ethereum` bất kỳ là logger đúng selected provider.
- `walletSession` capture session; custom transport gọi `assertSession()` trước `session.provider.request(args)`. Account/chain events đổi session đồng bộ; `sendGovernor` còn qua deployment checks. Submit capture session trước `assertCanPropose`, await guard rồi mới send. Đây là phân tích source, **không chứng minh runtime không send**.
- Existing unit regressions kiểm delayed connect, account/chain event, provider replacement, snapshot invalidation và request sender/payload. Mock unit không thay live extension trace. Không có defect mới được chứng minh để sửa production code.
- Lượt tiếp theo phải cài pass-through observer **trước khi app acquire/cache provider hoặc bind request**, bắt đúng object được chọn (kể cả EIP-6963), có bằng chứng hook trước acquisition và control reads thực đi qua hook. Không dùng zero entries của hook cài muộn; nếu không chứng minh coverage thì BLOCKED.
- Giữ nguyên request/result/error; raw trace liên tục với sequence/UTC/method/accounts/chainId và `from` nếu request có, từ trước Submit qua guard/UI settle; đánh dấu A draft → B site-authorized → click → settle → A return. Lưu requestId/fields và A/B latest/pending nonce trước/sau, head/hash/txpool và identity cùng phiên. Không ghi credential/signing secrets. Chỉ local test chain, không Sepolia.
- Screenshot/nonce/head/txpool không đổi chỉ hỗ trợ **inference**; không thay direct boundary evidence. Không tái tạo H26 và không nộp lại accepted visual/preflight/provenance hoặc chạy propose/vote/queue/execute.

## Phạm vi tìm historical artifacts và giới hạn 503

Đã xem metadata/tên file tại checkout run `4cba99a`, checkout Issue19 Linux, `be09-handoff`, project `.local-tv3`, gói evidence `docs/evidence/tv3-metamask-negative-20261126-4cba99a0`, và các thư mục Downloads `TV3_Issue19_Account_Switching_20261123` / `TV3_Issue19_Negative_Tests_20261123`. Không tìm được raw HAR/503 packet hay log tương ứng run mới trong các vị trí này. Không tuyên bố đã tìm hết máy hoặc dữ liệu của TV2. Không tải/kiểm checksum lại gói accepted.

Các API/worker/PG candidate logs `.local-tv3/{user,v2}` và `postgres.log` có mtime 04–08/11; không gán chúng cho run `TV3-MM-negative-20261126-4cba99a0`, source `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`, chain31337/deployment label `tv3-local-0xa6c8b5`/H19. Không đưa nội dung log cũ vào bundle như raw logs của 503. Request timestamp, full URL/query, headers/body, request/correlation ID và raw health cùng interval lịch sử đều **MISSING trong evidence đã kiểm**.

Historical RPC captures có timestamps `2026-11-26T16:40:14.3193375Z`, `16:41:54.5152071Z`, `16:44:45.2779748Z`. Đây chỉ là **mốc tra cứu ứng viên** cho TV2, không phải timestamp của request 503. Endpoint nhìn thấy trong console chỉ là `GET :3000/api/proposals?...&limit=20`; không dựng lại URL bị rút gọn. Summary health không phải raw health packet cùng thời điểm. Không suy ancillary topics, PostgreSQL version, schema hay proxy là nguyên nhân.

**Yêu cầu phối hợp cụ thể:** TV2 `@daongocuong` xác nhận retention/location của API/worker/PG logs cho đúng source/run/deployment và các mốc ứng viên trên; nếu có, xuất sanitized originals với UTC/timezone, request/correlation ID, publication/recovery/checkpoint H/hash/revision và raw health để match packet. TV3/operator tìm retained DevTools Network/HAR; bỏ authorization/cookie/RPC secrets nhưng không sửa status/body để che lỗi, ghi rõ phần redacted. Nếu không còn dữ liệu gốc, giữ historical cause UNKNOWN; thống nhất một phép đo API hẹp trong môi trường disposable, không claim phép đo mới giải thích request cũ.

## Kiểm thử và inventory

Không thay đổi product hoặc tests; không thêm regression giả khi chưa có defect. Chạy các lệnh dưới **sau khi viết xong tài liệu**, trên source `e17ef61` với root/frontend `npm ci --no-audit --no-fund` (cả hai đã exit0). Kết quả thực, UTC, command, exit code và đường dẫn stdout/stderr nằm trong `verification.json`; không coi danh sách lệnh này là PASS:

1. `npm --prefix frontend test -- src/chain/wallet.test.tsx src/chain/walletProviders.test.ts src/chain/transactions.test.ts src/data/api.test.ts src/data/api.integration.test.ts`
2. `node --test tests/smoke/qa07-snapshot.test.mjs`
3. `npm --prefix frontend run lint`
4. `npm run typecheck` (root script); frontend **không có** script `typecheck` riêng.
5. `npm --prefix frontend run build` (`tsc -b && vite build`, bao gồm frontend typecheck).
6. Check docs/JSON/source binding, inventory, relative links và scan secret/conflict markers trong bundle mới. `SHA256SUMS.txt` kiểm tất cả payloads, trừ chính file checksum.

`environment.txt` là raw stdout của phép inventory read-only (exit0); `record.json` phân biệt observed/dependency/history. `*.txt` outputs kiểm thử và `verification.json` được tạo bằng lệnh thực; không đổi nhãn failed output. Các JSON GitHub là snapshots metadata công khai, không raw wallet/HTTP evidence. Bundle không chứa ảnh/trace/HAR/TV2 logs mới vì chưa thu được. TV4 independent review vẫn bắt buộc; không tự đóng issue, merge PR hay promote main.
