# BE02 — checklist triển khai và bằng chứng

Ngày làm việc: **20/10/2026** (Asia/Bangkok). Nhánh `feature/tv2-be02`, nền
`origin/Dev` tại `1b247000396c3209bedf823c94e1ec1255239293` (merge BE01 PR #4).
Triển khai/kiểm thử ngày 20/10/2026; chuẩn bị commit và push nhánh theo yêu cầu
ngày 21/10/2026. Chưa mở PR hoặc merge.

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
Đây là **khung BE02 chạy bằng synthetic fixture** cho đến khi có bằng chứng SC06;
không tuyên bố FR13–FR16 hoặc toàn bộ pipeline đã nghiệm thu.

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
| `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json` | Dependency/runtime/test/build TypeScript, phiên bản khóa bằng lockfile |
| `.env.example`, `.gitignore` | Mẫu biến môi trường và bỏ qua output/config local |
| `README.md`, `docs/indexer.md`, `docs/be02-checklist.md` | Lệnh chạy, thiết kế, kết quả thực tế và giới hạn bàn giao |

Không có thay đổi trong `fixtures/api`, `fixtures/sc01`, `shared/abi`,
`database`, `contracts` hoặc `lib` so với commit nền. Không chạy lại generator
fixture BE01 để làm test BE02 đạt.

## Kiểm chứng thực tế

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

## Còn chờ và phạm vi bước sau

- [ ] TV1 xuất ABI build đầy đủ và custom errors; TV4/TV1 xác minh chainId,
  manifest địa chỉ, deployment block riêng và ABI version.
- [ ] TV1 bàn giao receipt/log thật create/vote/queue/execute/cancel, header/block
  timestamp và cách nối proposalId, requestId, operationId, predecessor/salt.
- [ ] Chạy decoder/scanner/storage trên receipt thật và đối chiếu tại cùng H.
- [ ] BE03/BE07: checkpoint/resume, K confirmations, kiểm tra hash khi khởi động,
  common ancestor/rollback và yêu cầu rebuild khi vượt cửa sổ.
- [ ] BE tiếp theo: proposal/vote/operation/transfer/disbursement projection,
  state/quorum/balance tại H, API, rebuild và performance tests.

Không cộng BudgetDisbursed như dòng tiền thứ hai: projection sau này phải dùng
BUD Transfer và liên kết payout chặt. Không tự lấy salt = descriptionHash hoặc
đổi description nguyên bản. Những quy tắc BE01 còn hiệu lực dù BE02 chưa tạo
projection hoặc API server.
