# BE01 — bàn giao TV2 cho TV1/TV3 review

Ngày kiểm tra: **18/10/2026** (Asia/Bangkok). Nhánh làm việc:
`feature/tv2-be01`, tạo từ `origin/Dev` sau fetch; base `1d29041`.
Thư mục ban đầu trống, đã clone đúng repository, không có thay đổi người dùng
để ghi đè. Không tìm thấy AGENTS.md hoặc phân công TV2 riêng; đã đối chiếu
README, requirements nhóm, phân công TV1, contracts.md, interface/ABI Treasury
và fixture SC01. Bản BE01 đã được commit/push theo yêu cầu riêng ở `09c6735`;
lần sửa fixture hiện tại không commit, push, mở Issue/PR hoặc merge.

**Phạm vi hoàn thành BE01:** thiết kế PostgreSQL, đặc tả API đọc và fixture
tổng hợp để frontend làm song song. Toàn bộ thiết kế mới vẫn **chờ nhóm review**.
Chưa tuyên bố FR13–FR16 đã nghiệm thu đầy đủ khi chưa có indexer/API thật.

## 1. File dùng để làm gì

| File/nhóm file | Mục đích |
|---|---|
| `database/migrations/001_initial.sql` | Tạo domain uint256 và các bảng/FK/index cho read model trên database mới |
| `database/tests/001_initial_checks.sql` | Kiểm tra ràng buộc bằng dữ liệu tổng hợp rồi ROLLBACK |
| `docs/database.md` | Giải thích quan hệ, lưu số chính xác, batch/checkpoint, truy vấn H và chuẩn bị rollback/rebuild |
| `docs/api.md` | Hợp đồng GET giữa TV2 và TV3: request/response, số nguyên, cursor, snapshot, sync và lỗi |
| `fixtures/api/README.md` | Hướng dẫn TV3 dùng mock và giải thích dữ liệu tổng hợp |
| `fixtures/api/manifest.json` | Ánh xạ method/path/query/HTTP status/scenario sang file JSON; không phải HTTP server |
| `fixtures/api/simulation.json` | Metadata offline về block/timestamp và log nguồn; kiểm tra timeline, không có endpoint mới |
| `fixtures/api/*.json` | Summary, 3 trang proposal 20/20/5, lọc/tìm kiếm, transfers, health, empty/error |
| `fixtures/api/proposals/*.json` | Detail riêng cho từng proposal, cùng dữ liệu với list |
| `fixtures/api/votes/*.json` | Phiếu tương ứng từng proposal, cộng khớp với detail |
| `scripts/generate_be01_fixtures.mjs` | Sinh lại fixture xác định, offline; BigInt, Ethereum Keccak và ABI encode tối thiểu |
| `scripts/check_be01.mjs` | Kiểm tra JSON, ID/hash, cursor/trang, state, phiếu, dòng tiền và fixture nhất quán |
| `scripts/check_be01_database.ps1` | Tạo PostgreSQL tạm trên cổng localhost riêng, chạy migration/check rồi dừng |
| `README.md` | Thêm đường dẫn bàn giao BE01 và lệnh kiểm tra |

Mọi địa chỉ/block/transaction hash/operation của bộ API mẫu là **tổng hợp**.
Không có receipt thật, không deploy, không gọi RPC hay ký giao dịch khi tạo fixture.
SC01 được giữ nguyên description/calldata/hash/proposalId để kiểm tra cấu trúc.

## 2. Ánh xạ FR13–FR16

| Requirement | Đầu ra BE01 | Phần còn phải làm ở bước sau |
|---|---|---|
| FR13 thu thập sự kiện | deployments/deployment_contracts, indexed_blocks, raw_events, proposals, votes, operations, transfers, disbursements; dedup chain+tx+log, block hash, topics/data/raw RPC log; Transfer là nguồn tiền | Quét chain từ deployment block, decode ABI build thật, nối BudgetDisbursed với Transfer thật, kiểm chứng receipt |
| FR14 resume/reorg | checkpoints FK đến header đã ghi; quy trình transaction nguyên batch và đối chiếu canonical hash; lưu header cả block không event; snapshot/cursor invalidation | Hiện thực K-confirmation, retry/backoff, crash/resume, common ancestor, rollback, cửa sổ hash và dừng/rebuild; TC11 chưa chạy |
| FR15 rebuild tại H | Lưu nguyên bytes description, calldata và event; thiết kế dựng trạng thái theo clock(H), đối chiếu state/quorum/balance tại H; định hướng tạo database mới để rebuild | Lệnh rebuild thật và replay so sánh trước/sau cùng H, đối chiếu historical eth_call; TC12 chưa chạy |
| FR16 API đọc | Đặc tả đủ 6 GET, scope/H/hash/revision, decimal strings, pagination/filter/ID/errors/health; bộ 45 proposal và fixture nhất quán | HTTP server, validation/cursor xác thực, DB queries và integration/performance tests thật |

Hỗ trợ thêm FR04 (45 proposal, 20/20/5), FR09 (dòng tiền), FR11 (dashboard),
FR03 (form lấy cấu hình, giữ description/requestId) và NFR03 (báo chậm >30 giây).
API/database không thay các kiểm tra quyền và số dư on-chain của BR01–BR07/NFR01.

## 3. Chạy kiểm tra

Tại thư mục repository, Node.js không cần npm install:

```powershell
node scripts/check_be01.mjs
```

Chỉ sinh lại khi chủ động thay fixture/spec; sau đó luôn chạy checker:

```powershell
node scripts/generate_be01_fixtures.mjs
node scripts/check_be01.mjs
```

Windows có PostgreSQL:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be01_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
git diff --check
```

`-PostgresBin` thay theo thư mục cài PostgreSQL. Runner không dùng database đang
chạy: tạo cluster riêng dưới `%TEMP%/dao-be01-pg-<uuid>`, bind 127.0.0.1/cổng
tạm, dùng trust chỉ cho test local, dừng cluster trong finally và giữ log/data
để xem lại. Không có thao tác xóa database hoặc xóa thư mục cũ. Nếu thiếu
PostgreSQL, chạy hai file SQL trên database **mới, độc lập** theo database.md;
không kết luận migration đạt chỉ từ checker JSON.

## 4. Kết quả thực tế

| Kiểm tra | Kết quả |
|---|---|
| Công cụ | Node.js v24.15.0; PostgreSQL/psql 18.4; không thêm package/framework |
| Migration trên cluster tạm | **PASS ở lần BE01 trước**: tạo domain, bảng, FK và index, COMMIT thành công; lần sửa fixture này không chạy lại vì SQL không đổi |
| SQL constraints | **PASS ở lần BE01 trước**: uint256 max, miền số, description bytes, Transfer zero/self, dedup, scopes/FKs, payout/checkpoint/revision; không chạy lại trong lần sửa này |
| Kết thúc PostgreSQL test | Cluster đã dừng; dữ liệu test ROLLBACK; log và cluster tạm được giữ ngoài repo |
| Fixture JSON/hash/trang/nhất quán | **PASS**: 123 JSON, 45 ID hash hợp lệ, 20/20/5, đủ 7 state; summary/detail/votes/transfers/filter/cursor/manifest khớp |
| Timeline trực tiếp từ JSON | **PASS**: 105 block tăng timestamp, 190 log nguồn; vị trí toàn block duy nhất, tx hash↔block/index và thứ tự log nhất quán; create/vote/queue/execute/cancel hợp lệ tại H |
| Regression dùng bản sao trong bộ nhớ | **PASS**: phát hiện trùng block/logIndex, snapshot lệch +1 giây, đảo thứ tự giữa transaction và trong cùng transaction; fixture đang theo dõi không bị sửa bởi test |
| Bảo toàn dữ liệu gốc | **PASS** so với `09c6735`: 45 proposalId và đầu vào hash, 13 operationId/salt/predecessor không đổi; SC01 giữ nguyên |
| Sinh lại xác định | **PASS**: lần sinh thứ hai có SHA-256 giống hệt cho cả 123 JSON |
| Đối chiếu Foundry cast | **CHƯA CHẠY**: không tìm thấy cast; vector Keccak/SC01 vẫn được kiểm tra bằng helper Node dùng chung với generator, chưa là đối chiếu crypto độc lập |
| Whitespace | **PASS**: `git diff --check` không báo lỗi; kiểm tra cả file mới khi bàn giao |

Lần chạy PostgreSQL cuối giữ log tại
`%TEMP%\dao-be01-pg-7bde4c4bd35c4eb487b5a774d240e7ad\postgres.log`.

Không chạy contract/Foundry tests, HTTP requests, indexer, reorg/resume/rebuild
hoặc benchmark API vì không thay contract và BE01 chưa có các thành phần đó.
Không lấy fixture tổng hợp làm bằng chứng on-chain hoặc bằng chứng nghiệm thu
các task sau BE01.

Hai lỗi cũ do gán logIndex theo từng transaction và làm tròn block tạo từ
snapshot. Nay các sự kiện dùng lịch timestamp chung, snapshot lấy đúng thời
điểm tạo + 60, còn logIndex được cấp sau khi sắp toàn bộ transaction/emission
trong block. `validateTimeline` kiểm tra JSON đã lưu, không gọi generator làm
đáp án. Metadata sourceId chỉ đếm một lần mỗi log; bản sao hiển thị được đối
chiếu về cùng nguồn. Revision `fixture-v2` làm cursor cũ hết hiệu lực.

## 5. Quyết định còn chờ nhóm

| Người review | Nội dung cần xác nhận |
|---|---|
| TV1 + TV3 | Description v1, đếm Unicode, title/body và CSPRNG requestId theo SC01; zero requestId vẫn hợp lệ và proposal có thể trùng requestId |
| TV1 | ABI build/receipt SC06; snapshot/deadline/ETA boundaries; quorum quá khứ; salt/predecessor/operationId đúng Governor tích hợp; không tự lấy salt=descriptionHash |
| TV1 + TV2 | Cách đối soát event→projection và liên kết payout→BUD Transfer; xác minh tại cùng block H; cách trả description bytes không biểu diễn được thành TEXT |
| TV3 | Envelope, field names/nullability (quorum chưa quá snapshot), list cùng shape detail, filter/cursor/empty/error, sync banner và form dùng RPC/ví |
| TV2 + TV4 | Deployment manifest/name/ABI version, K xác nhận, cửa sổ hash, checkpoint/rebuild revision, lưu lịch sử và xác thực cursor |
| Nhóm | API/schema BE01 là đề xuất đang review, chưa phải giao diện đã triển khai hoặc quyết định nhóm đã duyệt |

Ready là tình trạng operation Queued; execute revert không tạo state Failed.
Hai token 18 decimals; tiền/uint256 trong JSON luôn là chuỗi nguyên. Không giữ
chỗ quỹ khi propose. Tổng chi chỉ lấy từ Transfer, không cộng BudgetDisbursed lần hai.

## 6. Bước tiếp theo

TV3 dùng manifest + JSON để dựng bốn màn hình; TV1/TV3 review các quy ước ở trên.
Sau khi có ABI/manifest/receipt thật từ SC06 và review chung, TV2 triển khai
indexer batch + checkpoint, resume/reorg/rebuild và API đọc theo hợp đồng đã chốt;
đối chiếu state, quorum và balance tại cùng H trước tích hợp end-to-end.
