# BE03 — nghiệm thu tích hợp mới 24/10/2026 UTC

**PASS tích hợp raw/checkpoint BE03 và các event nghiệp vụ đã hỗ trợ.** Đã chạy
chain mới → deploy repository → propose/vote/queue/execute → RPC thật → PostgreSQL
riêng. Receipt, raw/decode và checkpoint được đối chiếu cùng H=32, head=34, K=2.
Lịch sử BLOCKED giữ nguyên ở [lần đầu](../be03-20261024/verification.json) và
[lần tái review](../be03-review-20261024/verification.json). Không dùng receipt
hoặc manifest cũ làm bằng chứng mới.

## Môi trường, artifact và provenance

Nhánh `feature/tv2-be03`, HEAD `1a4c262f387fa7480020da17dde5d608a5193eaf`;
working tree BE03 chưa commit. Checkout có khác biệt CRLF/LF so với Git trong
WSL; [trạng thái đầu phiên](initial-status.txt) được lưu trước khi thay đổi.

- Forge **1.8.5**, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`, chạy trực
  tiếp trong Ubuntu/WSL2 với `PATH=/home/cuongdz/.foundry/bin:$PATH`. Không chạy
  Forge Windows. Phiên bản và SHA-256 binary: [wsl-provenance.json](wsl-provenance.json).
- Solc **0.8.37+commit.f401782d**, optimizer enabled/runs=200, EVM **osaka**;
  [compiler binary](solc-provenance.json), [effective config](forge-config.json).
- `forge build` exit 0, compilation skipped; sau đó `forge build --force`
  exit 0, **83 files**, 4,30 giây. [Log compiler và warnings](forge-rebuild.txt).
  Không sửa source hoặc cấu hình để loại bỏ warnings.
- **98 artifact + 1 build-info**, đủ tất cả output khai báo trong cache;
  compiler/settings/ABI đúng. Cả 99 JSON sau force rebuild giống byte-for-byte
  artifact người dùng đã build: [rebuild-comparison.json](rebuild-comparison.json).
- 83 source vật lý được kiểm; LF normalization khớp metadata với source dùng
  deploy. Sáu file Solidity test đã được dynamic test linking biến đổi, cùng bốn
  `foundry-pp/DeployHelper*.sol`, có provenance từ force rebuild tái lập đúng
  toàn bộ artifact, không coi chúng là hash trực tiếp của file gốc.
  [Kiểm artifact](artifact-verification.json), [hash source cuối](final-source-verification.json).
- `forge-std` tại `f3dae6e6ee381f25eb6a246f7da9b85c91a68219`, OpenZeppelin
  tại `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`; cả ba submodule lồng nhau
  cũng khớp gitlink cha. Không có thay đổi nội dung ngoài line endings:
  [submodules-recursive.json](submodules-recursive.json).

RPC/DB chạy trong môi trường Windows đã có: Node **24.15.0**, Anvil/Cast
**1.7.1** commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8`, PostgreSQL
**18.4**. Anvil được khởi động `--hardfork osaka`; Cast đọc chainId 31337,
code Osaka deploy/execute thành công. Không suy phiên bản từ tài liệu cũ;
phiên bản thực và binary hashes nằm trong [integration.json](integration.json).

## Chain, database và manifest mới

Runner [run-integration.mjs](run-integration.mjs) tạo cluster PG riêng
`C:\Users\Cuongdz\AppData\Local\Temp\dao-be03-live-UI7x0n\data`,
bind loopback, role `be03_test`, DB tích hợp `be03_live`; DB `be03_test` tách
riêng cho regression. DB tích hợp rỗng trước migration 001+002. Không dùng
`DATABASE_URL` có sẵn, không xóa hoặc tái sử dụng DB cũ.

Anvil mới unforked, H=0 trước deploy, instance
`0xc5a7d26f82b7af8074e60f68964a0638a9bed4d1f0ea7114bfbdf8c910d23a48`,
genesis `0xbf48bc3c82308c9f095294b82fb69a9d32425e21de16ef725a531fd6ff2d8c9c`.
Địa chỉ có thể xác định lặp lại theo nonce; danh tính instance/genesis và
receipt/manifest mới là bằng chứng phân biệt chain này với chain cũ.

Deploy qua `node scripts/deploy_local.mjs --rpc <owned-loopback> --output <new-manifest>`;
[command/log](repository-deploy.json), [manifest mới](manifest.json) lưu compiler,
source hashes, ABI/bytecode hashes, receipt, constructor/runtime/role audit.
Helper kiểm bootstrap roles đã bị loại trước khi funding Treasury.

| Contract | Địa chỉ mới trên instance này | Deployment block |
|---|---|---:|
| GOV | `0x0116686E2291dbd5e317F47faDBFb43B599786Ef` | 1 |
| BUD | `0x9bAaB117304f7D6517048e371025dB8f89a8DbE5` | 2 |
| Treasury | `0x1Eb835EB7BEEEE9E6bbFe08F16a2d2eF668204bd` | 3 |
| Timelock | `0x31A65C6d4EB07ad51E7afc890aC3b7bE84dF2Ead` | 4 |
| Governor | `0x2706A171ECb68E0038378D40Dd1d136361d0cB7d` | 5 |

DB đăng ký deployment mới id=1 của DB mới từ manifest này, với đúng bốn source
BE03 governor/timelock/treasury/budget_token và K=2. [Config](config.json)
bắt đầu từ source sớm nhất H=2; GOV không thuộc scanner BE03. Đây là config
cho instance test đã dừng, không phải endpoint đang phục vụ.

## Receipt thật và biên K=2

| Bước | Block | Transaction hash |
|---|---:|---|
| Propose | 20 | `0x8055f4b3bb7ce3007e216c611e5183b7c1e5337098bbd6d3eb7cb6caf74f9090` |
| Vote WithParams | 21 | `0x8b10edb9e325f80ae20340ef2826a8490cc1b477924a62f063f74ca2a191678c` |
| Vote thường | 24 | `0xa8e3f1cb10d71f1d145972b01343fbc051731ee944f7b1b0086770934da27af9` |
| Queue | 25 | `0xc4cb1570ace60cb2feb26f3639bd0764d50366471346bfc15a968766a2a984ad` |
| Execute | 26 | `0x779d58588bc9b541ce4e3301291772dfcc3b89f5d574ebc66ebc7674dc8c4a72` |

Tất cả receipt status=1. H=26: Governor state=7 (Executed),
Treasury.paidRequests=true, recipient nhận **1000 BUD**, Treasury còn **9000 BUD**.
Hai giao dịch test crash sau đó chuyển thêm mỗi lần **1 wei BUD** từ funding
đến recipient, được giữ trong receipt/raw cuối; số dư ở H=26 không bị gán
nhầm cho H=32.

A gọi `castVoteWithReasonAndParams` bằng ABI compiler hiện tại, params **không
rỗng** `0x123400ff`; receipt thật phát `VoteCastWithParams`. Decoder giữ đủ
voter/proposalId/support/weight/reason/params, weight
`400000000000000000000`, reason Unicode. Đối chiếu riêng tại
[withparams-receipt-decoder.json](withparams-receipt-decoder.json), và đối chiếu
lại raw/payload trong PG ở H cuối. B vote thường 300 GOV.

| Số block sau receipt WithParams | Head | Safe block/checkpoint | WithParams trong PG |
|---:|---:|---:|---:|
| 0 | 21 | 19 | 0 |
| 1 | 22 | 20 | 0 |
| 2 | 23 | 21 | 1 |

Các lệnh `k2-*-following.*` và `sql-k2-*.json` là bằng chứng tại từng biên.
Execute chưa có trong PG khi head=26/checkpoint=24; sau hai block mới,
head=28/checkpoint=26 và ProposalExecuted được nhập đúng một lần.

## Dừng, resume và tính nguyên tử trên RPC thật

Dùng worker test sẵn có, PostgresStorage thật và URL Anvil thật. Parent đợi IPC
barrier rồi kill; không dùng sleep ngẫu nhiên để đoán thời điểm COMMIT.
Mỗi batch thử có ba block và một receipt Transfer thật.

| Điểm kill | Checkpoint trước worker | SQL sau kill | CLI restart |
|---|---:|---|---|
| beforeCommit | 26 | H=26, toàn snapshot digest giữ nguyên | 1 batch, H=29 |
| afterCommit, trước stdout | 29 | H=32 đã commit | 0 batch, H=32, snapshot không đổi |

Không có stdout báo thành công ở hai barrier. Hai CLI restart idle tiếp theo
đều commit 0 batch. `--redecode` thử lại 16 raw unknown, giữ nguyên snapshot,
raw_event_id/rpc_log/decoded payload/checkpoint; không biến raw unknown thành
mất dữ liệu. SQL chi tiết trong `sql-beforeCommit-*`, `sql-afterCommit-*`,
`sql-before-idle-reruns.json`, `sql-after-idle-reruns.json`, `sql-after-redecode.json`.

## Đối chiếu cùng H và giới hạn decode

**H=32**, head=34, K=2; checkpoint hash = indexed header hash = RPC block hash:

`0x64dc2cb9ce371d693edf9f9db1d3d684cefac7f63be19b47ff543362f7c59954`

- 31 header liên tiếp H=2..32 khớp number/hash/parent/timestamp với RPC.
- Duyệt độc lập mọi block/transaction/receipt đến H, lọc đúng bốn source và
  deployment block; **30 receipt log = 30 raw event = 30 dedup key duy nhất**.
- `rpc_log`, topics/data, address, block/transaction/log coordinates giữ nguyên.
- **14 log nghiệp vụ** decode khớp từng field với full compiler ABI (phép đối
  chiếu độc lập với registry subset); **0 decode_error**, 0 missing/duplicate,
  0 raw mismatch và 0 supported decode mismatch.
- **16 log quản trị bootstrap ngoài subset BE03** được giữ `unknown_topic`:
  RoleGranted/RoleRevoked, MinDelayChange, VotingDelaySet, VotingPeriodSet,
  ProposalThresholdSet, QuorumNumeratorUpdated, TimelockChange. Full artifact ABI
  nhận diện được tất cả; tất cả nằm trước proposal H=20. Không có log nghiệp
  vụ unknown. Danh sách theo role/topic/count có trong `integration.json`.
- Vì còn các topic quản trị này, CLI **exit 2**, `decodeComplete=false`,
  checkpoint `last_error_code=DECODE_INCOMPLETE`, `sync_status=syncing` đúng thiết
  kế raw BE03. Không gọi đây là decodeComplete=true hoặc projection hoàn tất.

[RPC headers/receipts canonical cùng H](canonical-rpc-at-H.json),
[SQL raw/decode/checkpoint](sql-final.json), và [integration.json](integration.json)
chứa đầy đủ SQL/query/result, cùng digest cuối
`6e7f8a51cf3c573de66b3b7a2792dd1a8df92f5e145bab6debef000c361d4edf`.
Projection tables vẫn rỗng; không triển khai BE04.

## Lỗi đã phát hiện và sửa, giữ nguyên bằng chứng thất bại

1. **Provenance CRLF/LF** tại `scripts/governance_local.mjs:129` (assert cũ ở
   dòng 131). Contract dùng CRLF; metadata solc dùng LF. Ví dụ BudgetGovernor:
   raw keccak `0xdbc5d554f28d30684463691d0d7b7925c18d9548300918b3f03063408ef4ab87`,
   LF/compiler keccak `0xe9474c2fb805e4c047ae99fc48bbbaf00cdff5817e01490b8df9a24e7314c4ab`.
   Rebuild vẫn giống 99/99 artifact. Sửa helper chấp nhận đúng CRLF→LF khi hash
   raw không khớp; tiếp tục ghi SHA-256 bytes gốc và normalization vào manifest.
   Lỗi gốc: `initial-source-hash-failure-*`. Guard qua entry deploy thật với
   RPC preflight synthetic: **4/4 PASS** — CRLF/LF hợp lệ được nhận, thay tên
   contract hoặc thêm comment bị từ chối trước send. Chỉ sửa bản copy tạm để
   thử guard, bản copy đã xóa; không sửa contract/thư viện checkout.
2. **Giới hạn quan sát concurrency quá ngắn** tại
   `tests/indexer/checkpoint-storage.test.ts:187`. Lần đầu 100 SQL poll (~136 ms)
   không thấy backend cạnh tranh, kết quả **15/16**. `concurrency-attempt-*`
   giữ log và cluster đã dừng. Sửa test sang deadline 5 giây, không bỏ assertion;
   yêu cầu thêm `pg_blocking_pids` có blocker thật. Lần đạt **16/16** in PID chờ
   29352, blocker 19880. Không sửa runtime storage/syncer/migration để né lỗi.
3. **Runner Windows pipe**: postgres kế thừa pipe của pg_ctl, khiến chờ `close`
   không kết thúc dù pg_ctl đã exit và server ready. Lần `pg-pipe-attempt-*`
   được dừng PG riêng qua PowerShell; runner dùng event `exit` và đóng pipe
   reader riêng cho `pg-start`. Không thay đổi code sản phẩm vì lỗi harness này.
4. Lần kiểm artifact ban đầu đòi hash file test gốc bằng source đã preprocessor
   biến đổi; `preprocessor-check-attempt-*` giữ lỗi harness. Kiểm hiện tại phân
   loại rõ source vật lý, test preprocessor và generated helper, có force rebuild
   byte-identical làm bằng chứng cho source biến đổi.

## Kiểm chứng và kết thúc

| Kiểm tra mới | Kết quả |
|---|---|
| Backend build/typecheck | PASS / PASS |
| BE03 unit + decoder | **47/47**, 0 skip |
| PostgreSQL regression riêng | **16/16**, 0 skip |
| Provenance guards | **4/4** |
| Toàn luồng Anvil → BE03 → PostgreSQL | **PASS theo scope raw/ABI subset nêu trên** |
| Biên K=2, crash/resume, idle/redecode, cùng-H receipt/SQL | PASS |

Anvil đã dừng; RPC không còn truy cập. PG đã `server stopped`, `pg_ctl status`
exit **3**; cluster/log giữ lại theo đường dẫn trong report. Không có dịch vụ
nghiệm thu do phiên này để lại. Contract bytes và 99 JSON artifact không đổi
so với đầu phiên. Không commit, stage, push, PR hoặc triển khai BE04.

Còn riêng: TV1/TV4 peer review chưa thực hiện; ABI subset chưa decode các topic
quản trị bootstrap nêu trên; Linux PG runner chưa chạy. Reorg rollback/projection/
API/testnet thuộc các việc khác, không có kết quả nghiệm thu cho chúng trong
báo cáo này. Không còn blocker môi trường/artifact/receipt cho tích hợp BE03
đã chạy ở đây.
