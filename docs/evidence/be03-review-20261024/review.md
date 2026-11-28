# BE03: review và nghiệm thu bổ sung 24/10/2026

**Kết luận: đủ để bàn giao review mã nguồn BE03; nghiệm thu chain mới → RPC →
PostgreSQL vẫn BLOCKED. Chưa có receipt VoteCastWithParams mới.** Không phát hiện
lỗi cụ thể cần sửa trong phạm vi review; không sửa runtime/migration/test đã đạt,
không thêm regression khi chưa có lỗi tái hiện. Thay đổi của lượt này chỉ là tài
liệu và bằng chứng. Không triển khai BE04.

## Candidate và phạm vi review

- Nhánh `feature/tv2-be03`, HEAD `1a4c262f387fa7480020da17dde5d608a5193eaf`.
  Candidate là working tree **chưa commit** trên HEAD đó, không phải chỉ riêng
  nội dung commit. Hash từng source và đối chiếu với lần triển khai trước nằm
  trong [verification.json](verification.json).
- Không có AGENTS.md tại `D:/`, root repository, `.agents`, `.codex` hoặc trong
  cây source của dự án (bỏ qua dependencies). Đã đọc `docs/be03.md`, checklist,
  verification trước, migration 001/002, CLI/config/reader/decoder/scope/syncer/
  storage/types, test BE03, test decoder, script PostgreSQL, contract Governor,
  Foundry lock/config và script deploy/governance/CI liên quan.
- Submodule `forge-std`: `f3dae6e6ee381f25eb6a246f7da9b85c91a68219`;
  OpenZeppelin: `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` (lock v5.4.0).
  Không đổi compiler, EVM target, dependencies hoặc nguồn contract.

## Các bất biến đã review

| Yêu cầu | Cơ chế trong source | Bằng chứng mới |
|---|---|---|
| Header/raw/decode/checkpoint nguyên tử | `storage.ts`: `writeBatch` BEGIN, advisory lock theo chain, ghi header/raw và nhãn decode, ghi checkpoint, COMMIT; callback sau COMMIT | DB: rollback giữa insert, deferred COMMIT failure, kill trước/sau COMMIT đều PASS |
| Batch rỗng và nguồn deploy khác block | `reader.ts`: filter từ max(batch start, source deploymentBlock); chỉ ghi scannedSources sau RPC thành công. Storage kiểm toàn bộ nguồn active, đủ header, dải liên tiếp, head−K | Unit/DB: empty batch, clamp nguồn muộn, nguồn lỗi/thiếu scan evidence không tiến H |
| Writer cũ không ghi lùi/ghi đè | Checkpoint number/hash kỳ vọng so với checkpoint đã khóa; from = H+1; fingerprint source/K; BE02 writer bị từ chối khi có checkpoint | DB quan sát writer thứ hai chờ advisory lock rồi CHECKPOINT_CONFLICT; stale retry không đổi H |
| Restart xác minh hash khi idle | `syncer.ts` đọc chainId, load/kiểm metadata và checkpoint, đọc header H trước khi xét head/safe range | Unit/DB: idle restart, hash mismatch, header null/malformed và RPC lỗi; SQL giữ nguyên |
| Raw watermark và decode completeness | H là prefix raw đã quét; unknown/error/legacy chưa phân loại vẫn làm decodeComplete=false, không có decoded watermark riêng; sync_status vẫn syncing | `docs/be03.md`, migration 002, `decodeIssues`/`markDecodeState` và test restart nhất quán |
| Decode issue còn sau restart, exit đúng | Trạng thái/code decode bền vững trong DB; report đếm đến H và chứa tối đa 100 issue. CLI trả 0 khi complete, 2 khi còn issue, 1 khi lỗi vận hành | Unit/DB xác minh report/SQL khi idle; review trực tiếp các nhánh return trong CLI. Crash child CLI mới trả 0; lượt này không bổ sung phép đo child CLI exit 2 |
| Redecode không phá raw/checkpoint hoặc bỏ metadata | `redecode` dùng cùng advisory lock, strict verifyMetadata và checkpoint scope/K/prefix trước SELECT/UPDATE; chỉ cập nhật decoded fields/labels và last_error_code, không thay H/hash/rpc_log/raw_event_id | DB recovery WithParams PASS, giữ raw identity và đủ 6 field. Guard metadata/scope được review trực tiếp; chưa thêm phép đo CLI riêng cho mọi guard redecode |

`--redecode` hiện là **thao tác offline**. Nó xác minh chainId/deployment với
metadata trong PostgreSQL và scope checkpoint, **không gọi RPC**. Nó không chứng
minh canonical hash hoặc sự sống của deployment; phải dùng `--sync` cho phép
kiểm tra đó. Không coi offline recovery là tích hợp RPC hoặc nghiệm thu chain.

Không phát hiện lỗi cần viết lại phần BE03 đã có. Phạm vi kết luận giới hạn ở
source đã đọc và các phép kiểm thực sự dưới đây, không thay peer review TV1/TV4.

## Kiểm tra mới, độc lập với báo cáo cũ

| Lệnh | Exit | Kết quả | Loại bằng chứng |
|---|---|---|---|
| `npm run build` | 0 | PASS | TypeScript runtime |
| `npm run typecheck` | 0 | PASS | Runtime/tests |
| `npm run test:be03` | 0 | 22/22, 0 skip | RPC synthetic |
| `npm run test:be03:db` ngoài sandbox | 0 | 16/16, 0 skip | PostgreSQL 18.4 mới riêng, RPC synthetic, crash/lock/CLI thật |
| `node --import tsx --test tests/indexer/decoder.test.ts` | 0 | 25/25, 0 skip | ABI vectors synthetic, gồm WithParams |
| `git diff --check` và kiểm whitespace source/tài liệu mới | 0 | PASS | `whitespace.json`; giữ nguyên native log |
| `node --check docs/evidence/be03-review-20261024/probe-anvil.mjs` | 0 | PASS | Syntax của script probe đã chạy |

Lần DB trong sandbox exit 1 do initdb không tạo được đường dẫn TEMP; giữ
`be03-db.txt` để phân biệt với lần chạy thành công `be03-db-escalated.txt`.
Cluster thành công: `%TEMP%/dao-be03-pg-cab3857d277a48b1941783ca08bcd460`, loopback
port **55198**, database/user `be03_test`; `server stopped` trong finally, kiểm
tra lại `pg_ctl status` exit **3**, `no server running`. Server log sao chép tại
[postgres-server.txt](postgres-server.txt); các lỗi SQL cố ý trong log là test
rollback/COMMIT failure, không phải lỗi suite.

SQL crash trong lần chạy mới (hash là synthetic, không phải block Anvil):

| Barrier kill | Sau kill, trước restart | Sau CLI restart |
|---|---|---|
| beforeCommit | 0 header, 0 raw, checkpoint absent | 2 header, 1 raw, H=101; 1 batch |
| afterCommit, trước stdout | 2 header, 1 raw, H=101 | cùng 2 header, 1 raw, H=101; 0 batch |

Query join `checkpoints` và `indexed_blocks` theo deployment/number/hash trả
`block_number=101`, hai hash cùng `0x0000000000000000000000000000000000000000000000000000000000000065`,
`events=1`. Giá trị JSON được in từ SQL assertion thật trong log DB và chép vào
`verification.json`, không suy từ stdout báo commit.

Không chạy lại toàn bộ BE02/BE01 hoặc Foundry suite: không sửa runtime, contract,
schema hoặc test; chạy lại đúng BE03 và decoder liên quan. Các số BE02 **64/64**
và BE02 PostgreSQL **21/21** trong bundle trước là **kết quả lịch sử**, không phải
phép kiểm mới của lượt này.

## Điểm chặn tích hợp đã đo riêng

1. **Forge**: `D:/dao-budget-simulator/dist/be03-tools/package/bin/forge.exe`
   SHA256 `6df26c16a6e53519abdd09fcdacf9af1ecdb50e216ee1816fa8012b5a553ef48`.
   `--version` và `build` đều không khởi chạy được, kể cả `require_escalated`:
   **An Application Control policy has blocked this file**. Exit của executable
   là **null**, không được ghi 0 hoặc suy là lỗi compiler. Xem
   [forge-escalated.json](forge-escalated.json). Không xác minh được version từ
   executable bị chặn; tên tarball 1.7.1 không thay bằng chứng version thực thi.
2. **Cast**: tải package chính thức `@foundry-rs/cast-win32-amd64@1.7.1` vào
   `dist` tạm, không đổi package/lockfile. `cast --version` exit 0; version
   **1.7.1**, commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8`. Ngoài sandbox,
   `cast chain-id --rpc-url http://127.0.0.1:54456` exit 0, trả **31337**. Lần
   sandbox lỗi TCP 10061 được giữ riêng, không bỏ qua. Xem `cast-probe.json`,
   `cast-package.txt`, `anvil-preflight-sandbox.json`, `anvil-preflight.json`.
3. **Anvil**: binary riêng version **1.7.1**, cùng Foundry commit trên, chạy
   `--host 127.0.0.1 --port 54456 --chain-id 31337 --hardfork osaka --silent`.
   Node mới, unforked, RPC thật trả chainId/clientVersion/metadata/genesis;
   instanceId và genesis hash được lưu trong `anvil-preflight.json`. Đây chỉ là
   kiểm khả năng chạy môi trường; chưa đọc event vào PostgreSQL. Hai lần probe
   đều kill/await đúng child do script tạo; RPC không còn truy cập sau cleanup.
4. **Artifact/deploy**: cả 5 artifact GOV/BUD/Treasury/Timelock/Governor đều
   thiếu. Trên node mới, lệnh repository `node scripts/deploy_local.mjs --rpc
   http://127.0.0.1:54456 --output docs/evidence/be03-review-20261024/new-instance-manifest.json`
   exit **1**: `ENOENT ... out/GovernanceToken.sol/GovernanceToken.json`.
   Script kiểm artifact trước khi gửi giao dịch; head sau attempt vẫn **0**,
   không có manifest hoàn tất, deployment address hoặc transaction hash. Không
   dùng ABI lưu sẵn làm bytecode artifact, không tái dùng manifest/địa chỉ cũ.
5. **Môi trường thay thế**: `wsl --list --verbose` exit **1**, WSL chưa cài;
   `docker` không được tìm thấy trên PATH. Workflow dự án dùng Ubuntu 24.04,
   Foundry v1.8.5 nhưng không được dispatch/upload candidate chưa commit; không
   có kết quả runner mới. Không cài WSL, không thay Windows Application Control,
   antivirus hoặc chính sách bảo mật.

Anvil/Cast 1.7.1 ở đây chỉ kiểm khả năng thực thi/RPC. Không gọi đó là kiểm chứng
toolchain v1.8.5 đã pin trong CI, compiler 0.8.37 hoặc build contract thành công.

## Ba loại bằng chứng và trạng thái bàn giao

- **Synthetic fixture**: các suite mới, kể cả WithParams recovery và PostgreSQL
  crash/lock, dùng log/RPC giả lập. SQL và tiến trình là thật.
- **Receipt lịch sử**: bundle TV4 trên Dev vẫn là bằng chứng lịch sử; không chạy
  lại chain đó hoặc khẳng định deployment ấy còn sống.
- **Receipt mới/tích hợp RPC thật**: **BLOCKED**. Probe có RPC node mới nhưng
  không deploy được, không có receipt, không có BE03 RPC → PostgreSQL mới, chưa
  kiểm biên K=2, resume/dedup/đối chiếu receipt tại cùng H trên chain mới.

TV4 cần cung cấp môi trường hợp lệ chạy được Foundry/solc theo pin hoặc artifact
có provenance kiểm chứng được từ chính source/submodule hiện tại. Deploy helper
đòi compiler **0.8.37+commit.f401782d**, optimizer **200**, EVM **osaka**, full
compiler metadata/source keccak/ABI/creation/runtime bytecode nhất quán. Cấp
quyền Codex không gỡ chính sách Windows.

Sau khi có môi trường, phải tạo Anvil và PostgreSQL mới riêng, dùng script repo
để deploy và lưu manifest mới; propose → vote bằng
`castVoteWithReasonAndParams` với params khác rỗng → queue → execute. Source
Governor/OZ hiện tại hỗ trợ WithParams qua kế thừa (Governor.sol 524, 636–642),
nhưng xác nhận này từ source chưa phải receipt. Sau đó cho `--sync` đọc RPC thật,
kiểm head−2/head−1, dừng/resume và chạy lại, đối chiếu raw/decode/checkpoint với
receipt tại cùng H. Unknown initialization topics cần giữ raw và báo decode
incomplete đúng chính sách. BE04/projection/HTTP API không phải điều kiện BE03.

TV1 cần peer review ABI/indexed fields và contract semantics WithParams; TV4 cần
xác nhận toolchain, provenance manifest/ABI và K cho môi trường bàn giao. Không
thể ghi “đã kiểm chứng toàn bộ hệ thống”. Danh sách file dự kiến đưa vào commit
được lưu ở `commit-candidates.txt`; build/tools/temp liệt kê riêng trong
`verification.json`. Không commit/push/PR/merge/comment GitHub trong lượt này.
