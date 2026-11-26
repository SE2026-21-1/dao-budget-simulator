# BE02 — đọc RPC log, decode ABI và lưu PostgreSQL

BE03 bổ sung luồng `--sync` cho checkpoint/K/resume và `--redecode` để phục hồi
decode từ raw đã lưu. Xem [quy ước và hướng dẫn BE03](be03.md). Các phần dưới
mô tả luồng BE02 hữu hạn không có cờ; các kết quả cũ giữ đúng ngày/SHA của chúng.
Registry hiện có thêm `VoteCastWithParams` theo compiler ABI BudgetGovernor;
payload giữ cả `params`, uint256 vẫn là chuỗi thập phân.

BE04 bổ sung `--project` / `--sync-project` và các bảng dẫn xuất; xem
[hướng dẫn projection](be04.md). Những giới hạn BE02 bên dưới mô tả riêng luồng
scan hữu hạn, không có cờ, tại thời điểm bàn giao BE02.

BE02 là CLI quét **hữu hạn** một dải block cho một deployment. Đầu vào là
Ethereum JSON-RPC; đầu ra là header trong `indexed_blocks` và log trong
`raw_events` của migration BE01. Không có projection proposal/vote/operation,
API server, checkpoint, K confirmations, rollback reorg hoặc rebuild ở bước này.
Không dùng kết quả CLI để khẳng định dữ liệu đã sẵn sàng phục vụ API BE01.

Trên `Dev` nền `1b247000396c3209bedf823c94e1ec1255239293`, BE01 đã có schema và
123 fixture API. Khi bắt đầu BE02 ngày 20/10/2026, chưa có bàn giao SC06 trong
`shared/abi/` hoặc `fixtures/chain/`. Nhánh remote TV1 SC02 cũng chưa có receipt
SC06. Không merge nhánh TV1 vào BE02. Dữ liệu kiểm thử BE02 là synthetic riêng;
hash giao dịch/block tổng hợp không phải bằng chứng giao dịch blockchain thật.

## Kiến trúc

```text
config + ABI registry
        |
eth_chainId -> xác minh mạng
        |
cố định toBlock -> chia khoảng [from, to] liên tiếp
        |
eth_getLogs theo contract và deploymentBlock riêng
        |
header/timestamp + tọa độ transaction/log -> normalize -> sort
        |
decode: decoded | unknown_topic | decode_error
        |
xác minh metadata -> transaction PostgreSQL: indexed_blocks + raw_events
        |
báo cáo batch đã commit, duplicate và lỗi; kết thúc CLI
```

Các module tách cấu hình, RPC, registry/decoder, scanner, storage và CLI.
`ethers` v6 cung cấp ABI coder/decoder và Ethereum Keccak tiêu chuẩn; `pg` là
PostgreSQL driver dùng truy vấn có tham số. TypeScript kiểm tra kiểu; `tsx`
chạy CLI/test TypeScript. Phiên bản thực tế được khóa trong `package-lock.json`;
cài bằng `npm ci` với Node.js 24.

Block number/timestamp, chainId và uint256 dùng `bigint` nội bộ. Khi ghi JSON
hoặc `NUMERIC`, chuyển thành chuỗi nguyên thập phân. Address/hash phục vụ khóa
database được chuẩn hóa hex thường; `rpc_log` giữ nguyên object JSON-RPC nguồn,
bao gồm trường bổ sung. Decode không thay thế topics/data/log nguồn.

## Nguồn ABI và event hỗ trợ

| Contract role trong BE01 | ABI version cấu hình | Event hỗ trợ | Nguồn và trạng thái |
|---|---|---|---|
| `governor` | `oz-5.4.0-governor` | ProposalCreated, VoteCast, ProposalQueued, ProposalExecuted, ProposalCanceled | Interface/module Governor của OpenZeppelin Contracts 5.4.0 theo revision dependency đã khóa; chưa xác nhận với Governor tích hợp SC06 |
| `timelock` | `oz-5.4.0-timelock` | CallScheduled, CallExecuted, Cancelled, CallSalt | TimelockController OpenZeppelin Contracts 5.4.0; CallSalt thuộc ABI phiên bản này; chưa xác nhận với deployment SC06 |
| `treasury` | `sc01-itreasury-v1` | BudgetDisbursed | `shared/abi/ITreasury.json` của SC01; interface hiện có, chưa có receipt Treasury SC06 |
| `budget_token` | `oz-5.4.0-erc20` | Transfer | IERC20 OpenZeppelin Contracts 5.4.0; chưa xác nhận BUD bằng artifact/receipt SC06 |

Registry chọn ABI theo cặp role/ABI version của contract đã cấu hình; không thử
đoán event bằng một ABI chung cho mọi địa chỉ. GOV và event delegate chưa thuộc
phạm vi BE02. BUD Transfer hiện được lưu như raw event, chưa lọc thành projection
dòng tiền Treasury hoặc liên kết với BudgetDisbursed.

Các fragment OZ được đối chiếu với source upstream chính thức tại revision
`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` trong `foundry.lock`, không suy ra ABI
từ tên event hoặc thay đổi vendor để có fixture mới. Tham chiếu source cụ thể
nằm trong `indexer/abi-registry.ts` và `fixtures/be02/README.md`.

## Cấu hình

Sao chép `indexer/config/example.json` thành `indexer/config/local.json`, rồi
sửa theo deployment đã xác minh. Không commit file chứa credential. `RPC_URL`
và `DATABASE_URL` cung cấp kết nối bằng biến môi trường; file mẫu không chứa secret.

```powershell
Copy-Item indexer/config/example.json indexer/config/local.json
```

| Trường | Ý nghĩa |
|---|---|
| `rpcUrl` | URL JSON-RPC HTTP/HTTPS; `RPC_URL` trong môi trường được ưu tiên nếu có |
| `chainId` | Chain ID mong đợi, chuỗi nguyên dương; đối chiếu `eth_chainId` trước ghi DB |
| `deploymentId` | Chuỗi khóa nội bộ số nguyên dương `deployments.deployment_id`; không phải tên API `synthetic-local-v1` của fixture BE01 |
| `fromBlock` | Block đầu dải yêu cầu, chuỗi nguyên không âm |
| `toBlock` | Block cuối bao gồm, chuỗi nguyên không âm hoặc `"latest"`; latest được chụp một lần cho cả lượt quét |
| `batchSize` | Số block mỗi batch, chuỗi nguyên trong `[1, 10000]` |
| `contracts[].role` | `governor`, `timelock`, `treasury` hoặc `budget_token` |
| `contracts[].address` | Địa chỉ EVM hợp lệ, khác zero, duy nhất trong deployment |
| `contracts[].deploymentBlock` | Block deploy riêng của contract, chuỗi nguyên không âm |
| `contracts[].abiVersion` | Một trong các ABI version phù hợp role ở bảng trên |

Không đọc log trước `max(fromBlock, contract.deploymentBlock)`. Batch toàn lượt
quét được tính từ contract deploy sớm nhất còn trong dải; không dùng deployment
block lớn nhất của toàn bộ contract. Các khoảng đóng `[a,b]`, `[b+1,c]` liên
tiếp giữ đúng biên và vẫn lưu header block không có log.

Log từ địa chỉ ngoài cấu hình bị loại trước decode. Log có `removed: true`,
tọa độ/blockHash không khớp header hoặc dữ liệu RPC mâu thuẫn phải làm batch
thất bại. Những kiểm tra này phát hiện dữ liệu không nhất quán tại lúc quét;
chúng chưa thay thế cơ chế theo dõi và rollback reorg của BE03/BE07.

## Database và chạy CLI

Chỉ dùng PostgreSQL test/local **mới, độc lập**. Không dùng database đang chứa
dữ liệu người dùng để chạy bộ kiểm thử. Trên database mới, migration BE01 chạy
một lần; không sửa migration hoặc xóa bảng cũ để né lỗi:

```powershell
npm ci
psql -X -v ON_ERROR_STOP=1 -d <database-test-moi> -f database/migrations/001_initial.sql
psql -X -v ON_ERROR_STOP=1 -d <database-test-moi> -f database/tests/001_initial_checks.sql
```

Trước quét, đăng ký deployment và contract metadata đã xác minh vào
`deployments`/`deployment_contracts`, rồi dùng đúng `deployment_id` được trả về
trong cấu hình. Chain ID, địa chỉ, role, deployment block và ABI version phải
khớp metadata đã lưu. Scanner không tự tạo deployment hoặc thay ABI trong DB.
`governance_config` và `confirmation_depth` của BE01 không được CLI diễn giải
thành bằng chứng đã xử lý projection hoặc K confirmations.

Để đăng ký **metadata tổng hợp** khớp `example.json` trên database test mới:

```powershell
psql -X -v ON_ERROR_STOP=1 -d <database-test-moi> -f indexer/config/example.metadata.sql
```

Script in `deploymentId` được tạo; sửa `deploymentId` trong config theo kết quả
này, không mặc định luôn bằng `1`. SQL checks BE01 tuy ROLLBACK vẫn có thể tăng
identity sequence. File metadata không phải migration hoặc bằng chứng deploy;
với mạng thật dùng metadata đã xác minh từ SC06 thay các giá trị tổng hợp.

Sau khi đặt biến môi trường local và cấu hình deployment hợp lệ:

```powershell
$env:RPC_URL = 'http://127.0.0.1:8545'
$env:DATABASE_URL = 'postgresql://<user>:<password>@127.0.0.1:<port>/<database-test-moi>'
npm run indexer -- --config indexer/config/local.json
```

Địa chỉ/block trong file mẫu là tổng hợp; thay bằng deployment thật trước khi
quét mạng thật. `.env.example` là mẫu tham khảo; CLI không tự load `.env`, cần
export biến môi trường trước chạy. Lệnh không deploy contract, gửi giao dịch
hoặc ký bằng khóa.

## Ghi dữ liệu, chạy lại và lỗi

Storage ghi cả header/timestamp và raw event của một batch trong cùng
transaction. Khóa FK BE01 ràng buộc chain/deployment/role/address và
blockNumber/blockHash. `raw_events.event_name` chỉ có giá trị khi decode thành
công; `decoded_payload` chứa trực tiếp object tham số theo tên ABI (ví dụ
Transfer có `from`, `to`, `value`). ABI version lấy từ metadata
`deployment_contracts.abi_version` đã được đối chiếu khi ghi. Không thêm cột
hoặc migration mới. Với unknown topic/decode error, cả `event_name` và
`decoded_payload` là SQL NULL; `rpc_log`, topics/data và tọa độ vẫn được lưu.
Phân loại lỗi cùng ABI version và tọa độ nằm trong `issues` của báo cáo CLI.
Giữ báo cáo này để đối soát; không biến log chưa decode được thành event hợp lệ.

Điều trên áp dụng cho log có cấu trúc RPC và tọa độ hợp lệ nhưng ABI không hỗ
trợ/không decode được. RPC envelope, hex hoặc tọa độ không hợp lệ làm batch
thất bại trước ghi; không bỏ qua ràng buộc BE01 để chèn chúng như log canonical.

Solidity string có thể chứa NUL (`U+0000`), nhưng PostgreSQL JSONB không lưu
được ký tự này. Decoder trả `decode_error` cho trường hợp đó, giữ nguyên ABI
bytes trong topics/data/`rpc_log` và không thay NUL bằng ký tự khác. Đây là
giới hạn biểu diễn decoded JSONB; raw nguồn vẫn phục vụ đối soát/replay.

Chạy lại cùng log không thêm bản ghi trùng. Storage so sánh nội dung khi gặp
khóa `(chain_id, transaction_hash, log_index)` đã tồn tại, bao gồm deployment,
blockHash, topics/data và dữ liệu decode; khác nội dung là xung đột và rollback
batch. Header cùng số nhưng khác hash/timestamp cũng không được ghi đè âm thầm.
Nếu đã có header kề trước/sau trong DB, batch phải nối đúng parent hash; sai
nhánh phải dừng. Storage kiểm tra tọa độ với raw log đã lưu trên cùng chain và
khóa transaction theo chain để các lần chạy BE02 không ghi vượt qua nhau.
Các batch trước đã commit vẫn giữ nguyên khi batch sau thất bại; báo cáo phân
biệt phần đã commit và batch lỗi. Không dùng checkpoint để tuyên bố hoàn thành
đồng bộ.

CLI xuất JSON từng dòng: `batch_committed` cho batch đã commit, rồi
`scan_result` tổng lượt quét. Mã thoát `0` = `completed`; `1` = `failed` do lỗi
cấu hình/mạng/RPC/tính nhất quán/database; `2` = `completed_with_decode_issues`
(raw đã lưu nhưng có `UNKNOWN_TOPIC` hoặc `DECODE_ERROR`). Khi thất bại,
`committedBatches` giữ phần đã commit và `failedBatch` chỉ ra dải lỗi nếu đã bắt
đầu batch. Thông báo vận hành không in RPC URL, database connection string hoặc
response lỗi có thể chứa credential.

## Kiểm thử và giới hạn bằng chứng

```powershell
npm run build
npm run typecheck
npm run test:be02
npm run test:be02:db
node scripts/check_be01.mjs
git diff --check
```

Kết quả lịch sử của TV2 ngày **20/10/2026**, Windows/Node.js 24 (không phải kết quả
Linux/CI của tích hợp TV4): `npm ci`, build và
typecheck **PASS**; `test:be02` **63/63 PASS**; `test:be02:db` **21/21 PASS** trên
PostgreSQL **18.4** thật, không skip. Suite SQL chạy cả migration/checks BE01 và
CLI thật qua HTTP RPC synthetic. Cluster tạm đã dừng. Checker BE01 đạt 123 JSON,
45 proposal, 105 block, 190 log nguồn; 123 JSON API giữ nguyên SHA-256 so với
commit nền; `git diff --check` đạt. Bằng chứng và log PostgreSQL trong
[checklist BE02](be02-checklist.md).

`test:be02` kiểm tra decoder và scanner bằng synthetic RPC riêng, gồm tất cả
event, indexed/non-indexed/dynamic arguments, uint256 lớn, dải/batch, thứ tự,
header/removed log, lỗi và bảo toàn raw. Vector
`fixtures/be02/independent-transfer.json` được ghép tay từ topic Transfer chuẩn,
hai address word và data word `0de0b6b3a7640000` = `1000000000000000000`; generator
không tạo vector này. Decoder vì thế không chỉ được kiểm tra bằng round trip
encoder/decoder cùng thư viện. Fixture API BE01 không được dùng thay receipt
Ethereum; nguồn và cách sinh lại BE02 nằm trong `fixtures/be02/README.md`.

`test:be02:db` chạy storage trên PostgreSQL thật với database tạm độc lập,
migration BE01, dedup, xung đột, transaction rollback và phần batch trước đã
commit. Suite còn gọi CLI thật qua child process, đọc synthetic JSON-RPC HTTP
local và ghi PostgreSQL: exit 0/rerun, exit 2 giữ raw khi decode lỗi và exit 1
khi batch sau xung đột. Lệnh npm dùng PowerShell runner trên Windows, mặc định PostgreSQL bin
`C:\Program Files\PostgreSQL\18\bin`; thay vị trí nếu cần:

```powershell
npm run test:be02:db -- -PostgresBin 'D:\duong-dan\PostgreSQL\bin'
```

Runner tạo cluster mới dưới `%TEMP%/dao-be02-pg-<uuid>`, bind localhost/cổng
riêng, không sử dụng `DATABASE_URL`, dừng cluster khi xong và giữ data/log cho
review. Test mock không thay bằng chứng SQL này. Nếu PostgreSQL không có sẵn,
ghi rõ test chưa chạy; không suy PASS từ unit test.

### Linux/macOS: Docker PostgreSQL 18.4, Node chạy trên host

Cần Docker daemon local đang hoạt động và Node.js **24.15.0** trên host. Không
chạy Node/tsx bên trong container: test mở HTTP RPC synthetic trên loopback và
gọi CLI child process trên cùng host.

```bash
npm ci
npm run typecheck
npm run build
npm run test:be02
npm run test:be02:db:linux
# Hoặc gọi trực tiếp cùng runner:
bash scripts/check_be02_database.sh
```

Tên npm `:linux` là lệnh Bash tường minh, cũng dùng được với Bash/Docker Desktop
trên macOS; không thay thế lệnh PowerShell `test:be02:db` của Windows. Runner
tạo container **mới** từ `postgres:18.4`, user/database `be02_test`, password
ngẫu nhiên và anonymous volume riêng. Không mount dữ liệu host, không dùng
`DATABASE_URL` của người gọi hoặc database đang có. Docker tự cấp cổng host qua
`127.0.0.1::5432`; không probe/chọn cổng cố định, không publish `0.0.0.0`/IPv6.
Runner kiểm tra binding loopback rồi đặt riêng `BE02_TEST_DATABASE_URL` và
`BE02_TEST_ISOLATED=1` cho test host. Suite tự chạy migration/SQL checks BE01,
từ chối database có bảng sẵn; không có chế độ chạy thiếu URL rồi skip storage.

Readiness giới hạn 90 lượt kiểm tra cách nhau 1 giây, dừng sớm khi unhealthy
hoặc container ngừng. Trap EXIT/INT/TERM xóa đúng container theo CID file cùng
anonymous volume, cả khi readiness/test lỗi; lỗi cleanup làm lệnh thất bại.
Không giữ database sau test; stdout/stderr chứa image ID, phiên bản PostgreSQL,
binding và kết quả suite, kèm server log khi có lỗi. SIGKILL hoặc mất Docker
daemon không thể được trap xử lý; nếu cleanup báo lỗi phải xử lý CID được in,
không coi test là PASS.

### CI BE02 và giới hạn bằng chứng Linux

Job `be02` trong `.github/workflows/ci.yml` dùng Ubuntu 24.04 và Node.js
24.15.0, chạy đúng chuỗi `npm ci`, typecheck, build, `test:be02` và Docker runner
ở trên. Artifact `tv4-be02-<github.sha>` giữ **14 ngày**: log từng bước, SHA
checkout thật (`commit.txt`), SHA sự kiện (`event-sha.txt`), phiên bản
Node/npm/TypeScript/tsx/Docker; log database ghi phiên bản PostgreSQL và image ID.
SHA checkout có thể là merge commit của pull request, nên cần đối chiếu cả hai
SHA khi review. Kết quả TV4 source `7a0ab33`: cả ba job success tại
[run39539691342](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342);
[Docker stdout](evidence/be02-ci-7a0ab33.txt) có21 storage tests không skip và
cleanup container/volume. [Metadata](evidence/tv4-ci-7a0ab33.json) giữ SHA/artifact.

Kết quả thực tế và môi trường ghi tại [checklist BE02](be02-checklist.md).
Ngay cả khi test synthetic/PostgreSQL và local receipt đạt, BE02 vẫn chưa có
nghiệm thu SC06 end-to-end hoặc projection/API/checkpoint/reorg. TV4 đã bàn giao
ABI Governor/Treasury build, manifest local thật và receipt create/vote/queue/
execute/cancel tại [SC04 evidence](sc04-governor.md#tv4-kiểm-chứng-độc-lập-sau-tích-hợp-sc04--21102026).
TV2 cần peer review schema/indexed fields/IDs/salt và tích hợp PostgreSQL; không
dùng địa chỉ của smoke đã dừng làm deployment đang chạy.

TV4 `scripts/smoke_governance.mjs` đã chạy **HttpRpc/readBatch thật** trên owned
Anvil:108header block2–109,61raw/45decoded/16unknown initialization/role topics,
0decode errors/0discarded. Bốn role Governor/Timelock/Treasury/BUD; GOV chưa hỗ trợ
registry, raw-only. Operation salt đúng OZ5.4 right-padding Governor XOR
descriptionHash, không bằng descriptionHash. Proof này chưa ghi chain đó vào
PostgreSQL, không thay projections/API/confirmations/reorg/rebuild acceptance.

### Bổ sung 22/10/2026: governance thật → PostgreSQL và CLI

Đoạn HttpRpc/readBatch phía trên là mốc **21/10**, chưa ghi PostgreSQL ở lần
đó. Ngày **22/10**, candidate local (HEAD vẫn `5fbf615`, thay đổi chưa commit)
đã chạy đường `HttpRpc → scanner → PostgresStorage` và CLI child process thật
trên Anvil riêng cùng PostgreSQL **18.4 native** isolated. Báo cáo:
[governance-storage.json](evidence/tv4-20261022/governance-storage.json).
Tại canonical **H=109**, SQL khớp chính xác **108 headers, 61 raw events,
45 decoded, 16 unknown topics, 0 decode errors** cho bốn role Governor,
Timelock, Treasury, BUD; initialization/access-control topics chưa hỗ trợ được
giữ raw, không coi là lỗi mất dữ liệu. GOV chưa thuộc registry BE02.

SQL đối chiếu header, topics/data, decoded payload và object RPC nguồn với
chain cùng H; ledger BUD có **13.000 vào/13.000 ra**, khớp chain và **2 request
đã trả** (không cộng BudgetDisbursed lần nữa). Scanner ghi nửa đầu, fault SQL
trigger cố ý ở header thứ hai của batch chứng minh rollback batch lỗi và giữ
batch đã commit; CLI quét nốt dải hữu hạn. Full scanner rerun và CLI rerun từ
process mới đều idempotent. Restart/replay CLI trả **exit 2** dự kiến do các
unknown initialization topics. Replay raw vào database thứ hai ban đầu rỗng
có cùng semantic digest
`dcbccb018fe122d966cf0a6f2c42e32215ff873c01f6f62bd42184e5da7c1086`.
Đây là **restart bằng fromBlock/toBlock tường minh và raw replay**, không phải
checkpoint/resume tự động, reorg/confirmations hoặc FR15 tái dựng projection/state.
Không có HTTP API hay nghiệm thu UI/chain/API trong bằng chứng này.

Lệnh tái lập Docker (Node 24.15.0, npm dependencies, Foundry/Anvil và compiler
artifacts đã có; Docker daemon local hoạt động):

```bash
bash scripts/check_governance_database.sh --output /tmp/tv4-governance-storage.json
```

Runner sở hữu container `postgres:18.4`, hai database mới và smoke Anvil riêng,
publish PostgreSQL trên numeric loopback/cổng động; bỏ qua `DATABASE_URL` và
`RPC_URL` của người gọi. Cleanup xóa container/anonymous volume do runner tạo.
Guard helper kiểm tra **TCP peer phía client** là loopback. Không buộc
`inet_server_addr()` của PostgreSQL là loopback: Docker publish cổng trên
`127.0.0.1` nhưng server trong container nhận kết nối tại IP bridge.
Guard URL numeric loopback, database prefix/ownership và schema rỗng vẫn giữ.
Report `storage.databaseConnections` ghi riêng client/server address để đối chiếu.
Workflow contracts gọi runner này. Sau push `33c5297`, Docker CI đã phát hiện
guard server-address sai ở trên; [chẩn đoán và smoke bản sửa](evidence/tv4-20261022/docker-loopback-fix.json).
Bằng chứng local dùng native cluster/TCP forwarding, không gọi thành Docker run
thành công; trạng thái CI bản sửa phải đối chiếu revision/run mới sau push.

Chế độ native tùy chọn: tự tạo **hai database rỗng khác nhau**, do user kết nối
sở hữu, tên bắt đầu `tv4_`, PostgreSQL bind numeric loopback. Không trỏ vào DB
người dùng; helper từ chối schema có sẵn và không drop bảng để chạy tiếp:

```bash
export TV4_SMOKE_ISOLATED=1
export TV4_SMOKE_DATABASE_URL='postgresql://<owner>:<password>@127.0.0.1:<port>/tv4_smoke_live'
export TV4_SMOKE_REBUILD_DATABASE_URL='postgresql://<owner>:<password>@127.0.0.1:<port>/tv4_smoke_rebuild'
node --import tsx scripts/smoke_governance.mjs --output /tmp/tv4-governance-native.json --database
```

Không truyền `--database` thì smoke chỉ kiểm chứng chain/readBatch, không chứng
minh SQL. `scripts/governance_storage.mjs` là helper của đường opt-in này.

### Bàn giao local cho TV2

Bundle thật [local-handoff/handoff.json](evidence/tv4-20261022/local-handoff/handoff.json)
đi cùng `manifest.json`, `role-audit.json`, `be02-contracts.json` và năm full
compiler ABI trong `abi/`. Nó thuộc Anvil caller-owned **127.0.0.1:8559, H=19**,
khác chain smoke H=109 đã dừng; không phải deployment testnet. Lệnh read-only
audit/export (output phải là thư mục **chưa tồn tại**):

```bash
node scripts/export_local_handoff.mjs --rpc http://127.0.0.1:8559 \
  --manifest docs/evidence/tv4-20261022/local-handoff/manifest.json \
  --output /tmp/tv4-local-handoff-new
```

Exporter không deploy, không ghi DB, không chứa private key và từ chối ghi đè
thư mục có sẵn. TV2 phải xác minh chain còn đúng instance hoặc redeploy rồi
export lại, chèn metadata `deployments`/`deployment_contracts` với bốn descriptor
BE02, lấy **deployment_id thực từ INSERT ... RETURNING** để cấu hình scanner.
Bundle không phát minh `deploymentId`. ABI/role audit local không thay nghiệm
thu SC06 chính thức, peer review indexed fields/IDs/salt hay production consumer.

BE07 bổ sung [recovery, RPC retry và worker polling](be07.md). Áp dụng migration 005 sau 001–004; dùng `--worker` để kiểm tra cả khi idle và tự replay sau reorg.

## Receiver acceptance 26/11/2026

Hai phép thử dưới đây có phạm vi khác nhau. TV3 vận hành trên máy nhận, TV2
xác nhận source/đối chiếu backend, TV4 kiểm bytes và nghiệm thu scoped. Không
dùng kết quả Linux/CI/TV2 để ký thay receiver TV3; không thực hiện thao tác trên
service dùng chung hoặc không chứng minh được ownership. Các lệnh ở các phần
BE02/BE03/BE06 phía trên không phải checklist chạy lại campaign cho #40/#42.

### Lifecycle receiver cho #40

Chọn **phương án B: một lượt lifecycle hẹp với run ID mới** theo
[kiểm kê TV3 7164023818](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7164023818).
Giữ nguyên phần [BE09 offline đã được TV4 kiểm](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7093754608)
của run `20261121T164230Z-1d31cb975ecc`, source
`e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`. Không phục hồi run cũ, không
tìm tiếp output đã xác nhận thiếu, không chạy lại toàn BE09 hoặc wallet/E2E.
Các mục lifecycle lịch sử thiếu vẫn là narrative, không được đổi thành raw
proof; không suy ra exit 0/130 từ log shutdown.

1. **Đăng ký trước:** TV3 ghi run/evidence ID mới, full checkout SHA thực tế,
   root checkout và registration script realpath/SHA khớp nhau, submodule và
   toolchain thực tế (OS/WSL, Node/npm, Foundry/Anvil/Solc, PostgreSQL), state
   root mới tách run cũ, manifest công khai kèm SHA-256, chain/deployment và năm
   địa chỉ Governor/Timelock/Treasury/GOV/BUD. Ghi endpoint API/RPC/UI, CORS
   origin, người sở hữu từng service và cửa sổ start/stop. Chốt runner/source
   với TV2; source lịch sử không tự là phê duyệt một baseline khác.
2. **Trước khi nhường Windows Vite:** áp dụng
   [quy trình scoped đã được TV2 xác nhận 7064213463](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7064213463).
   Lưu exact TaskPath/action và enabled/running state ban đầu của
   `DAO Budget Simulator Web`; lưu PID, parent PID, creation time, executable,
   command line của launcher PowerShell và Node/Vite child, cùng listener
   Windows 5173. Chỉ tạm disable/stop đúng task đã nhận diện. Xác minh launcher
   đã dừng trước child vì có vòng tự restart; Stop-ScheduledTask không chứng
   minh child đã dừng. Nếu child còn, chỉ dùng scoped fallback đã được TV2
   duyệt sau khi kiểm lại identity/process object và listener; ownership không
   rõ thì dừng thao tác. Không kill theo tên Node, `taskkill /F` hoặc process
   không thuộc lượt kiểm. Audit lại sau ít nhất 10 giây để chứng minh không
   tự restart; ghi Windows/WSL listeners 5173/3300/18545/55432 trước startup.
3. **Foreground thật:** dùng clone/source/runner đã chốt; chỉ `serve` làm
   startup, không thay bằng background `up`. Với runner BE09 đã chọn, lệnh là
   `bash scripts/be09-local.sh preflight`, rồi
   `bash scripts/be09-local.sh serve`. Lưu raw terminal transcript sanitized,
   thời gian và actual exit code từng lệnh. Sau khi foreground `serve` thực sự
   trả về, capture ngay trong shell sở hữu:
   `serve_rc=$?; printf 'serve_exit=%s\n' "$serve_rc"`.
   Không lấy exit của `tee`, `kill`, terminal wrapper hoặc `down` thay exit
   của foreground; nếu dùng pipeline phải capture exit của chính `serve`.
   SIGINT dự kiến 130 chỉ là contract của runner, không là kết quả quan sát.
   Giữ terminal foreground mở trong cửa sổ kiểm; terminal khác dùng đúng run
   directory thực do runner in để lấy status/PID/listeners. Không mặc định
   script BE09 tồn tại trong checkout common hiện tại hoặc trích script từ
   checkout khác để vượt registration guard.
4. **Chỉ kiểm phần còn thiếu:** trước shutdown ghi owned PID/listener identity
   của PostgreSQL/Anvil/worker/API/frontend và timestamp; từ Windows lưu raw
   API health/context, RPC chain ID, CORS OPTIONS/GET và HTTP UI trên endpoint
   mới, bind manifest/run mới. Không dùng loopback hoặc manifest archived làm
   service sống. Không yêu cầu `verify` full campaign/worker-restart/FE suite
   đã được nhận chỉ để lấy lifecycle proof.
5. **Shutdown và phục hồi:** sau cửa sổ đã thống nhất, Ctrl+C foreground và
   lưu actual exit/transcript. Ghi status và raw PID/listeners Windows/WSL
   trước–sau; kiểm cả năm PID gốc không còn và bốn port thuộc run đã nhả.
   Nếu còn service của run mới dùng `down` với exact run directory, ghi riêng
   command/exit/log và audit lại; không che thất bại automatic cleanup bằng
   kết quả explicit down. Giữ data/manifest/runtime/logs. Khi BE09 đã nhả
   5173, khôi phục đúng enabled/running state và cấu hình Windows task ban đầu;
   không bật task vốn disabled. Lưu task state/action, launcher/child process
   identity mới, Vite listener 5173 và raw HTTP status/body recovery (HTTP 200)
   từ Windows, cùng transport audit sau restoration. Không dừng receiver còn
   được dùng cho phiên kiểm khác.

Gửi bundle sanitized kèm inventory/SHA-256 cho từng file thực giao; không gửi
env, DB URL/password, signer/private key hoặc cursor secret. #40 vẫn
PARTIAL/In review đến khi TV4 kiểm được các output mới; giữ nguyên caveat health
degraded/16 unknown ancillary và transient 503 của lịch sử, không gọi đã fix.
Lượt mới không bổ sung hồi tố exit code hoặc PID audit cho run cũ.

### API-only restart

Checklist này dành cho phần còn lại của **#42**, không phải lifecycle teardown
của #40. [BE06 lịch sử đã nhận](be06.md#nghiệm-thu-receiver-42--cập-nhật-26112026)
không mở lại. [TV2 7155554436](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7155554436)
đã duyệt source **`896f93ea282d76fa72339a97ea12339240c16da4`** và phép so
snapshot bên dưới; source khác cần TV2 kiểm lại đúng full SHA.

**Readiness là điều kiện riêng, chưa đạt:** theo
[TV3 7158743785](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7158743785),
chưa có receiver local phù hợp với manifest/database/worker/proposal cần thiết.
TV2 cần chỉ rõ receiver hiện có, còn sống, TV3 sở hữu, worker chạy đúng source
đã duyệt và có proposal tại snapshot. Nếu không có, nhóm phải chốt phương án
bootstrap và ownership trước; dựng Anvil mới/deploy contract mới là thay đổi
deployment, **không nằm trong no-redeploy/no-BE06-rebuild đã duyệt**. Không
ngầm chạy BE09 `up`/`serve`/`verify`/`down` cũ: chúng có thể deploy, restart
worker/PostgreSQL hoặc teardown cả stack. Phê duyệt lượt lifecycle #40 cũng
không tự phê duyệt bootstrap/redeploy cho #42.

1. **Preregister:** full actual checkout SHA (output `git rev-parse HEAD`),
   run/evidence ID mới, machine/OS/toolchain thực tế, chain ID/deployment name,
   manifest public và SHA-256, API/RPC endpoints + owners, proposal ID có thật,
   filters/limit/trang đầu sẽ dùng. Ghi PID/parent/creation time/command line,
   ownership và listener API/worker/PostgreSQL; xác nhận cùng database,
   deployment và cấu hình API trước–sau. Giữ nguyên secret/TTL/CORS/config,
   không in giá trị bí mật. Không gán run/source lịch sử thành baseline mới.
2. **Materialize rồi pin:** GET `/api/summary` với `chainId`/`deploymentId` để
   API lưu snapshot thật; giữ status/raw body/timestamp của lần chọn này, lấy
   `context.asOfBlock`, `context.asOfBlockHash`, `context.snapshotRevision`.
   Trong TTL hiện có, gọi lại cả **năm** data endpoint bằng cùng scope,
   `asOfBlock=H` và `asOfBlockHash=hash`:

   | Nhãn | Path (thêm scope và H/hash vào query của từng URL) |
   | --- | --- |
   | summary | `/api/summary` |
   | proposals | `/api/proposals` |
   | detail | `/api/proposals/:proposalId` |
   | votes | `/api/proposals/:proposalId/votes` |
   | transfers | `/api/treasury/transfers` |

   Giữ nguyên proposal ID/filter/limit, dùng trang đầu, không cursor. Lưu đủ
   **sáu HTTP status + raw body trước restart**: năm URL đã pin và
   `/api/health?chainId=...&deploymentId=...` riêng. Health không nhận H/hash;
   không đặt `snapshotRevision` vào query. Ghi URL thực đã encode, timestamp,
   raw checkpoint/publication/canonical H/hash/revision, health/worker log.
3. **Chỉ API stop/start:** lưu raw command và log. Start command chuẩn là
   `npm run api` từ checkout đã đăng ký với cấu hình hiện có theo
   [API BE05](api.md#7-chạy-api-be05), không chạy migration hay sinh lại secret.
   Chỉ gửi SIGINT/SIGTERM đến API process đã xác minh; nếu supervisor tự
   restart/teardown worker hoặc PG thì chưa đủ điều kiện dùng supervisor đó.
   Shell sở hữu process ghi **actual API process exit code** (không lấy mã
   thành công của lệnh gửi signal làm mã thoát API). Ghi PID/listener cũ đã
   nhả, PID/parent/creation time/listener mới, startup log và HTTP recovery.
   API mới đang chạy thì ghi running/readiness, không bịa final exit code;
   command fail phải giữ actual exit. Không restart/pause worker/PostgreSQL,
   không thay database/deployment, không dừng stack dùng chung.
4. **Sau restart:** trong TTL, gọi lại đúng sáu URL ở bước 2, lưu sáu status và
   raw bodies, context và raw checkpoint/publication với timestamp. Ghi
   worker/PG PID, start time/listener/log trước–sau để chứng minh chúng không
   restart và worker vẫn chạy. Checkpoint/heartbeat/health có thể tiến hợp lệ;
   không ép toàn database hoặc mọi raw body phải byte-identical.
5. **So semantic từng data endpoint:** yêu cầu HTTP 200 cả trước–sau, cùng
   chain/deployment/H/hash/**returned snapshotRevision**. Dùng chính xác quy
   tắc TV2 trên từng raw body, UTF-8 compact/sorted keys, giữ array order:

   ```bash
   jq -cS '{data, pagination: (if .pagination then (.pagination | {limit,totalCount}) else null end)}' BODY.json | sha256sum
   ```

   Hash gồm **newline cuối do jq xuất**; không dùng `jq -j`, trim newline
   hoặc đổi serialization. Digest của mỗi cặp endpoint phải bằng nhau.
   `pagination` không có thì là `null`. `pagination.nextCursor` và toàn
   `context` không nằm trong digest; vẫn giữ raw và so context riêng.
   So scope/H/hash/revision là invariant; đọc riêng `nextCursor`,
   `context.sync`, health/checkpoint/publication/heartbeat hiện hành và giải
   thích chuyển động từ timestamps/logs, không xóa chúng khỏi evidence.
6. **Kết luận và bàn giao:** nếu 409/503, TTL hết, revision lệch hoặc digest
   khác thì giữ nguyên URL/status/body/snapshot gốc, đánh dấu lượt chưa đạt.
   Không fallback `latest`, không repin snapshot mới để gọi cùng lượt PASS,
   không nới TTL hoặc restart worker/PG để che lỗi. Gửi raw commands/logs,
   actual exits, sáu cặp responses, năm cặp digest/context, process/listener
   audit và SHA-256 inventory đã redact. TV2 đối chiếu backend; TV4 kiểm bytes
   và nghiệm thu riêng API restart. #42 giữ PARTIAL/In review khi readiness
   hoặc evidence còn thiếu; không yêu cầu rerun rebuild đã nhận.
