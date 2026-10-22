# BE02 — checklist triển khai và bằng chứng

Ghi nhận gốc TV2: **20/10/2026** (Asia/Bangkok), nhánh `feature/tv2-be02`,
nền `origin/Dev` tại `1b247000396c3209bedf823c94e1ec1255239293` (merge BE01
PR #4). Kết quả Windows bên dưới thuộc lần bàn giao này, không phải kết quả
Linux/CI sau tích hợp TV4. Bổ sung runner và CI TV4 ngày **21/10/2026** được
ghi riêng ở mục tương ứng; không suy kết quả chạy từ việc có workflow.

## Kiểm tra đầu vào

- [x] Đọc README, requirements nhóm/TV1, contracts/database/API, checklist BE01,
  migration và SQL tests BE01, ABI Treasury, fixture SC01/API.
- [x] Không tìm thấy AGENTS.md hoặc file phân công TV2 riêng trong repo.
- [x] Kiểm tra nhánh remote TV1 theo cách chỉ đọc; không merge nhánh thành viên khác.
- [x] Xác nhận Dev hiện chưa có SC06: chỉ ABI interface Treasury SC01 và fixture
  tổng hợp; không có `fixtures/chain/` hoặc receipt thật create/vote/queue/execute/cancel.
- [x] Để nguyên migration BE01, smart contract, frontend, vendor và fixture BE01.

## Hạng mục BE02 đã triển khai

| Hạng mục | Nội dung triển khai |
|---|---|
| Config | RPC, expected chainId, deploymentId nội bộ, role/address/deploymentBlock/ABI version riêng; dải hữu hạn và batch |
| RPC reader/scanner | Xác minh chain trước ghi, deploymentBlock riêng, batch không hở biên, cố định latest, sort block/tx/log, header cả block rỗng |
| Tính nhất quán | Đối chiếu blockHash/transaction coordinates, từ chối removed log và dữ liệu RPC mâu thuẫn |
| ABI registry | Governor/Timelock/BUD từ OZ 5.4.0; Treasury từ interface SC01; chưa xác nhận bằng SC06 |
| Decoder | 11 event; uint256 không mất chính xác; unknown_topic và decode_error có cấu trúc; raw giữ nguyên |
| Storage | Metadata/FK BE01, query tham số, header+logs transaction, rerun idempotent, xung đột nội dung phải báo lỗi |
| CLI | Lệnh npm thực tế, lỗi mã khác 0, summary phần commit/lỗi; không lộ RPC/DB secret |
| Handoff | Config mẫu, docs/indexer.md, checklist này và README gốc |

Nguồn và danh sách event đầy đủ nằm trong [hướng dẫn indexer](indexer.md).
Ở lần bàn giao gốc, đây là **khung BE02 chạy bằng synthetic fixture**. Bằng chứng
raw governance local thật ngày 22/10 được bổ sung riêng bên dưới, chưa phải
nghiệm thu SC06 chính thức, FR13–FR16 hoặc toàn bộ pipeline.

## File tạo/sửa

| File/nhóm file | Vai trò |
|---|---|
| `indexer/config.ts`, `types.ts`, `errors.ts` | Cấu hình, bigint/miền dữ liệu, kiểu và thông báo lỗi an toàn |
| `indexer/rpc.ts`, `reader.ts`, `scanner.ts` | HTTP JSON-RPC, header/log consistency, dải block hữu hạn và báo cáo batch |
| `indexer/abi-registry.ts`, `decoder.ts` | Registry có nguồn, 11 event và kết quả decode có cấu trúc |
| `indexer/storage.ts`, `cli.ts` | Transaction PostgreSQL, metadata/FK/dedup/conflict và CLI |
| `indexer/config/example.json`, `example.metadata.sql` | Mẫu config/metadata tổng hợp không có secret, không phải migration |
| `tests/indexer/{config,decoder,reader,cli,storage}.test.ts`, `helpers.ts` | Unit/RPC/CLI và test PostgreSQL thực, helper synthetic riêng |
| `fixtures/be02/{events.json,independent-transfer.json,generate.ts,README.md}` | 11 log synthetic, vector độc lập và provenance/cách sinh lại |
| `scripts/check_be02_database.ps1` | Khởi tạo/dừng PostgreSQL cluster riêng, chạy migration/SQL/storage/CLI integration |
| `scripts/check_be02_database.sh`, `.github/workflows/ci.yml` (TV4) | Docker PostgreSQL 18.4 riêng với host Node/tsx; CI Linux và artifact 14 ngày |
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json` | Dependency/runtime/test/build TypeScript, phiên bản khóa bằng lockfile |
| `.env.example`, `.gitignore` | Mẫu biến môi trường và bỏ qua output/config local |
| `README.md`, `docs/indexer.md`, `docs/be02-checklist.md` | Lệnh chạy, thiết kế, kết quả thực tế và giới hạn bàn giao |

Không có thay đổi trong `fixtures/api`, `fixtures/sc01`, `shared/abi`,
`database`, `contracts` hoặc `lib` so với commit nền. Không chạy lại generator
fixture BE01 để làm test BE02 đạt.

## Kiểm chứng lịch sử TV2 trên Windows

Kết quả cuối sau `npm ci` thành công và chạy suite tuần tự trên Windows/Node.js
24; không có test bị skip trong hai suite BE02.

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `npm ci` | **PASS:** cài theo lockfile |
| `npm run build` | **PASS:** biên dịch BE02 bằng TypeScript |
| `npm run typecheck` | **PASS:** TypeScript kiểm tra toàn bộ source/test BE02 |
| `npm run test:be02` | **PASS:** 63/63 test, 0 skip |
| `npm run test:be02:db` | **PASS:** 21/21 test, 0 skip, PostgreSQL 18.4 thật; migration/SQL checks BE01 và CLI → HTTP RPC synthetic → PostgreSQL thực tế |
| `node scripts/check_be01.mjs` | **PASS:** 123 JSON, 45 proposal, 105 block, 190 log nguồn |
| `git diff --check` | **PASS:** không có lỗi whitespace |
| Bảo toàn fixture so với commit nền | **PASS:** đúng 123 JSON API, SHA-256 từng file khớp byte với Git object nền; SC01 không có Git diff (checkout CRLF, nội dung khớp sau chuẩn hóa newline) |
| RPC/receipt thật SC06 | **Chưa chạy: chưa có bàn giao SC06** |

PostgreSQL thực tế: `postgres (PostgreSQL) 18.4`. Runner đã báo `server stopped`
sau lần kiểm thử 21/21; log giữ ngoài repository tại
`%TEMP%\dao-be02-pg-2b780c36318440b58fe1608d3fd3f98b\postgres.log`.
Test tích hợp gọi CLI child process thật, kiểm tra exit 0 khi hoàn thành/chạy
lại, exit 2 khi unknown/decode error (raw vẫn được SQL đối chiếu), exit 1 khi
batch sau xung đột (SQL chứng minh rollback và báo cáo giữ batch trước).

Các test ánh xạ tiêu chí yêu cầu:

| Tiêu chí | Bằng chứng trong suite |
|---|---|
| 1. Mỗi event, indexed/non-indexed/dynamic | `decoder.test.ts`: đủ 11 event, ABI layout, Unicode/whitespace, arrays/bytes/strings |
| 2. uint256 > 2^53−1 | Decoder kiểm tra ID/weight/indexed integer lớn; storage round trip uint256 max |
| 3. Sai chain trước ghi | `reader.test.ts`, `cli.test.ts`: không gọi storage hoặc kết nối PostgreSQL |
| 4. Địa chỉ ngoài deployment | Reader bỏ trước decode; storage từ chối scope sai |
| 5. Deployment block riêng | Reader clamp từng filter, vẫn giữ log BUD deploy sớm hơn Governor |
| 6. Batch, biên, block rỗng | Reader so sánh dải lớn dùng bigint; storage ghi đủ header block không event |
| 7. Thứ tự nhiều tx/log | Reader sort block/transactionIndex/logIndex và từ chối collision/order mâu thuẫn |
| 8. Rerun và conflict | PostgreSQL kiểm tra retry đồng thời, dedup toàn chain, nội dung/hash khác phải lỗi |
| 9. Unknown/hỏng/ABI sai | Decoder phân loại UNKNOWN_TOPIC/DECODE_ERROR, gồm string NUL không biểu diễn được trong JSONB; raw còn đủ; storage NULL decode fields |
| 10. Rollback batch | PostgreSQL kiểm tra event/header mới rollback khi log sau lỗi; batch cũ vẫn giữ |
| 11. Raw còn đầy đủ | Decoder/reader/storage so sánh object nguồn gồm trường RPC bổ sung |
| 12. Header/removed | Reader từ chối sai blockHash/tx index/hash, header đổi hoặc removed; storage kiểm tra FK/neighbor |

## Bổ sung TV4: Linux/macOS runner và CI

- Runner Bash: `scripts/check_be02_database.sh`; npm tường minh
  `test:be02:db:linux`, không thay lệnh Windows `test:be02:db`.
- Docker image `postgres:18.4`; tạo container/database/anonymous volume mới,
  user và database `be02_test`, password ngẫu nhiên. Không đọc `DATABASE_URL`
  của người gọi hoặc tái sử dụng DB/volume/port có sẵn.
- Docker cấp cổng động chỉ trên `127.0.0.1`; runner từ chối binding khác.
  Node/tsx chạy trên host để CLI child process dùng được HTTP RPC synthetic
  trên cùng loopback. Chỉ subprocess test nhận URL isolated mới và cờ
  `BE02_TEST_ISOLATED=1`; storage suite không được bỏ qua vì thiếu URL.
- Readiness có giới hạn 90 lượt (1 giây giữa lượt), dừng khi unhealthy/stopped.
  Trap EXIT/INT/TERM dùng CID file, xóa đúng container và anonymous volume;
  cleanup lỗi trả exit khác 0, không báo nghiệm thu thành công.
- CI `be02`: Ubuntu 24.04, Node.js **24.15.0**, Actions theo phiên bản đã pin
  trong repo, chuỗi cài/build/test phía dưới. Log từng bước, SHA checkout và
  SHA sự kiện, phiên bản Node/npm/TypeScript/tsx/Docker cùng PostgreSQL/image ID
  trong log DB được upload thành `tv4-be02-<github.sha>`, lưu **14 ngày**.
- Phạm vi vẫn là raw headers/events, synthetic RPC/ABI và SQL thật; **không**
  bổ sung checkpoint/resume, reorg/confirmations, projections hoặc API, và
  không thay bằng chứng receipt/deployment SC06.

Lệnh Linux/macOS chính xác (Docker local hoạt động; Node.js 24.15.0 trên host):

```bash
npm ci
npm run typecheck
npm run build
npm run test:be02
npm run test:be02:db:linux
```

Có thể gọi `bash scripts/check_be02_database.sh` thay lệnh npm cuối.
Runner không giữ data sau test; giữ stdout/stderr làm bằng chứng. Khi lỗi,
runner in server log trước cleanup; không hứa cleanup được nếu SIGKILL/mất
daemon. Nếu cleanup thất bại phải xử lý đúng CID được ghi trong log.

**Bằng chứng TV4 ngày21/10:** source `7a0ab33`, Node24.15.0: typecheck/build,
63 unit/RPC/decoder tests và21 PostgreSQL18.4 storage/CLI tests đạt, không skip.
Local SQL dùng native cluster mới, đã dừng/xóa; không đổi quyền Docker.
[Push CI39539691342](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342)
và [PR CI39539695150](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539695150)
đều success. [Docker stdout](evidence/be02-ci-7a0ab33.txt) chứng minh binding
loopback,21/21 storage tests và cleanup container/volume trên đường thành công;
chưa fault-inject interruption/failure riêng. [Metadata](evidence/tv4-ci-7a0ab33.json).

Tại mốc21/10, smoke SC03 decode7 Transfer và3 BudgetDisbursed local thật bằng
BE02; [receipt evidence](evidence/sc03-local-smoke.json). Lúc đó chưa chạy toàn
pipeline scanner/storage trên governance; bằng chứng bổ sung22/10 nằm bên dưới.


## Còn chờ và phạm vi bước sau

- [x] 22/10 local: có năm full compiler ABI/custom errors, manifest, role audit,
  chainId, địa chỉ, deployment block và bốn ABI version BE02 trong
  [local-handoff](evidence/tv4-20261022/local-handoff/handoff.json).
- [x] 22/10 local: receipt/log create/vote/queue/execute/cancel và header/timestamp
  được đọc qua HTTP RPC thật; đối chiếu proposalId/requestId/operationId và
  predecessor/salt trong smoke. Không coi đây là bàn giao SC06 chính thức.
- [x] 22/10 local: decoder/scanner/PostgresStorage và CLI trên governance thật,
  SQL đối chiếu raw và ledger cùng H=109 cho bốn role hỗ trợ (chi tiết bên dưới).
- [ ] TV1/TV2 nghiệm thu SC06 chính thức và peer review ABI/indexed fields,
  manifest, IDs/salt; xác nhận consumers production. Local proof không tự cấp
  peer approval và không chứng minh testnet.
- [ ] BE03/BE07: checkpoint/resume, K confirmations, kiểm tra hash khi khởi động,
  common ancestor/rollback và yêu cầu rebuild khi vượt cửa sổ.
- [ ] BE tiếp theo: proposal/vote/operation/transfer/disbursement projection,
  state/quorum/balance tại H, API, FR15 projection/state reconstruction và
  performance tests.

Không cộng BudgetDisbursed như dòng tiền thứ hai: projection sau này phải dùng
BUD Transfer và liên kết payout chặt. Không tự lấy salt = descriptionHash hoặc
đổi description nguyên bản. Những quy tắc BE01 còn hiệu lực dù BE02 chưa tạo
projection hoặc API server.

## Bổ sung TV4 ngày 22/10/2026: raw governance local thật

Bằng chứng [governance-storage.json](evidence/tv4-20261022/governance-storage.json)
thuộc candidate chưa commit, HEAD `5fbf615`; không ghi đè kết quả Windows
20/10 hoặc CI source `7a0ab33` ngày 21/10. Cùng ngày, BE02 typecheck/build,
63 unit tests và 21/21 migration/SQL/storage tests trên PostgreSQL 18.4 native
isolated đạt; không suy từ đó rằng Docker/GitHub CI candidate đã chạy.

| Phần đã kiểm chứng | Kết quả local 22/10 |
|---|---|
| Đường thật | HttpRpc → scanner → PostgresStorage; CLI child process mới, Anvil và PostgreSQL 18.4 isolated |
| Canonical H=109 | 108 headers (block 2–109), 61 raw, 45 decoded, 16 unknown, 0 decode errors |
| Bốn role BE02 | Governor/Timelock/Treasury/BUD; unknown initialization/access-control topics giữ raw; GOV ngoài registry |
| SQL đối chiếu | Header, topics/data, decoded payload, RPC object khớp chain; BUD 13.000 vào/13.000 ra, 2 request đã trả cùng H |
| Fault/rollback | Sau nửa đầu scanner đã commit, SQL trigger cố ý lỗi header thứ hai của batch; toàn batch lỗi rollback, batch trước giữ nguyên |
| Restart hữu hạn | CLI quét phần còn lại với dải explicit; scanner full rerun và CLI process mới rerun idempotent |
| Raw replay | DB thứ hai rỗng nhận lại raw/header cùng semantic digest `dcbccb018fe122d966cf0a6f2c42e32215ff873c01f6f62bd42184e5da7c1086` |
| Exit code | CLI restart/replay exit 2 dự kiến vì unknown init topics, không phải exit 0 hoặc mất raw |

Lệnh Docker dành cho lần tái lập (dependencies/Foundry artifacts đã có;
Node 24.15.0, Docker daemon, forge/anvil trên host):

```bash
bash scripts/check_governance_database.sh --output /tmp/tv4-governance-storage.json
```

Runner sở hữu PostgreSQL `postgres:18.4`, hai DB mới và smoke Anvil, cổng DB
động numeric loopback; bỏ qua `DATABASE_URL`/`RPC_URL` người gọi và cleanup
container/anonymous volume riêng. Workflow contracts đã nối runner, nhưng
**chưa tuyên bố lần chạy GitHub CI mới**. Bằng chứng local nêu trên thực sự
dùng native PostgreSQL, không phải kết quả Docker runner.

Native URL mode tùy chọn (tự tạo hai DB mới rỗng, khác nhau, tên `tv4_*`,
do user kết nối sở hữu; không dùng DB người dùng):

```bash
export TV4_SMOKE_ISOLATED=1
export TV4_SMOKE_DATABASE_URL='postgresql://<owner>:<password>@127.0.0.1:<port>/tv4_smoke_live'
export TV4_SMOKE_REBUILD_DATABASE_URL='postgresql://<owner>:<password>@127.0.0.1:<port>/tv4_smoke_rebuild'
node --import tsx scripts/smoke_governance.mjs --output /tmp/tv4-governance-native.json --database
```

`scripts/governance_storage.mjs` kiểm tra numeric loopback, ownership và schema
rỗng, không drop bảng có sẵn. Không có `--database` thì không có SQL proof.
Chi tiết lệnh/bàn giao ở [indexer](indexer.md#bổ-sung-22102026-governance-thật--postgresql-và-cli).
Đây **không phải** checkpoint/resume tự động, reorg/confirmations, FR15 rebuild
projection/state, HTTP API hay full UI/chain/API E2E.

Bundle [local-handoff](evidence/tv4-20261022/local-handoff/handoff.json) chứa
manifest, role audit, bốn descriptor BE02 và năm full compiler ABI. Nó thuộc
Anvil caller-owned `http://127.0.0.1:8559` H=19, khác smoke chain đã dừng.
`scripts/export_local_handoff.mjs --rpc <loopback-url> --manifest <manifest.json>
--output <NEW-directory>` audit/export read-only, không chứa keys và từ chối
thư mục có sẵn. TV2 phải xác minh instance còn chạy hoặc redeploy/export lại;
INSERT metadata vào `deployments`/`deployment_contracts` rồi lấy
`deployment_id` thật từ `RETURNING` cho config, **không tự gán deploymentId**
từ tên bundle. Peer/SC06 chính thức và production consumers vẫn chưa nghiệm thu.
