# BE07 local acceptance — 25/10/2026 UTC

Implementation nằm trong worktree `Downloads/cv3/dao-budget-simulator-be07`,
nhánh `feature/tv2-be07`, nền `c41a9ab97ad24d9b156eb03baa504dff43b165ec`.
Không commit/push/PR/merge/comment GitHub. Checkout cũ
`Downloads/cv3/dao-budget-simulator` vẫn ở `docs/add-requirements`, giữ thay đổi
`.gitignore` CRLF của người dùng. [Provenance](provenance.json) ghi branch/ref,
submodule và fingerprint; fetch đã xác nhận BE06 c41a9ab, TV4 3b6869d và Dev
1451779 chưa chứa BE06. Không dùng Dev làm nền hoặc sửa lịch sử nhánh cũ.

## Baseline và phạm vi bằng chứng

Đọc issue #18 bằng web fallback sau khi connector GitHub transport thất bại;
đọc handoff/reorg.json TV4 bằng git show tại ref 3b6869d. Chúng là evidence kế
thừa, không tính PASS cho BE07. Không có AGENTS.md trong checkout/các thư mục cha.

[baseline-be03.txt](baseline-be03.txt): 22 unit tests nền chạy trước khi sửa
syncer, gồm tình huống mismatch dừng và giữ dữ liệu. RPC/storage của suite này
là synthetic/in-memory; không phải acceptance chain thật.

[run-2/baseline-live.json](run-2/baseline-live.json) tái hiện độc lập bằng module
**nguyên bản c41a9ab** trong detached worktree, trên Anvil và PostgreSQL test mới:
CLI CHECKPOINT_HASH_MISMATCH, DB giữ model nhánh cũ, API 200/synced với hash orphan.
Driver được tạo trong quá trình triển khai rồi mới chạy baseline thật; không
khẳng định lần chạy Anvil baseline xảy ra trước mọi chỉnh sửa file BE07.
`REPRODUCED_OLD_BUG` là tái hiện lỗi nền, không phải PASS của recovery.

## Kết quả cuối

[run-7-pg184/commands.json](run-7-pg184/commands.json) ghi argv, start/end và exit
code thực tế. Tất cả command trong lượt này exit 0. Node 24.15.0, npm 11.12.1,
PostgreSQL **18.4**, Foundry/Anvil 1.8.5, Solc 0.8.37/Osaka. Chi tiết binary tại
[runtime.json](run-7-pg184/runtime.json), nguồn/hash package PGDG tại
[postgres-18.4-provision.json](postgres-18.4-provision.json).
Không cài/nâng cấp cluster PostgreSQL đang dùng; extract binary vào /tmp và tạo
cluster mới. [pg-stop.txt](run-7-pg184/pg-stop.txt) xác nhận cluster đã dừng.

| Kiểm tra thực chạy | Kết quả | Môi trường/giới hạn |
|---|---|---|
| typecheck, build | exit 0 | TS source và tests theo repo |
| Unit BE02/BE03/BE04/BE06/BE07 | 133/133 | RPC oracle synthetic; test retry/timeout/network/429/5xx dùng HTTP loopback thật |
| BE02 DB | 21/21 | PostgreSQL thật, RPC synthetic |
| BE03 DB | 16/16 | PostgreSQL thật, child process interruption tại raw COMMIT |
| BE04 DB | 10/10 | PostgreSQL thật, historical RPC oracle synthetic, publication atomic khi lỗi SQL/RPC |
| API DB | 3/3 | HTTP API + PostgreSQL thật, dữ liệu fixture; request/cursor/metadata/error contract |
| BE06 DB | 1/1 | Hai DB thật; chain oracle synthetic |
| BE07 DB | 14/14 | Reorg shallow/deep/same height/shorter head, scope, concurrent writer, crash; RPC synthetic |
| BE07 real chain | PASS | Anvil mới + PostgreSQL mới + HTTP API + hash-pinned eth_call + BE06 rebuild/compare |
| BE01 fixture checker | exit 0 | Synthetic fixture compatibility, [log](be01-fixtures.txt) |
| forge build | exit 0 | [log](forge-build.txt); không sửa contract và không nhận lại toàn suite Foundry PASS chỉ từ build |
| git diff --check | exit 0 | Whitespace, không phải functional test |

Tổng unit 133 và PostgreSQL 65 case không bao gồm driver Anvil. Không cộng test
TV4 kế thừa vào số test mới. 15 unit BE07 và 14 DB BE07 là test mới; regression
BE02–BE06/API chạy lại cùng implementation.

## Reorg và BE06 compare cùng H/hash

[acceptance-summary.json](acceptance-summary.json) trích các kết quả chính từ
[full real-chain report](run-7-pg184/be07-live.json), gồm receipts, phase,
manifest, RPC/SQL/API và normalized compare.

- Trước reorg: head 69, H **67**,
  `0xdbc8df2afb814de2a58a731e38d8ef5775da60342cc2c82c2a2dd203a61a97d6`.
- Tổ tiên chung: H **19**,
  `0xa7d096d0da530ccbc308ed873dc6ba2800c4e947a2b9e674df10e0c21c8f9972`.
- Nhánh canonical thay thế đạt cùng head 69, H **67**,
  `0x7da95efaa33320e9c98d1198af5bb5ea7c86475d5dc8cb3383e26736f74a9359`.
- Nhánh cũ có proposal/vote/operation/transfer/disbursement; sau rollback/replay
  chỉ còn lịch sử canonical mới: **1 proposal, 1 vote, 1 operation, 3 Transfer,
  1 disbursement**, quỹ **9996 BUD**. Ba lần sync/project nữa giữ nguyên model.
- Database BE06 mới có normalized data **equal**, chain cross-check PASS cho
  cả nguồn đã phục hồi và rebuild tại đúng H67/hash trên. Đối chiếu state,
  votes/quorum, timelock và treasury balance, không chỉ count/raw replay.
- Recovery gate: health 503/replaying, summary 503 DATA_NOT_READY; cursor tạo
  trước fork trả 409 SNAPSHOT_INVALIDATED trong recovery và sau publication mới.
- Deep fork vượt window=1: phase rebuild_required, health 503, data 503; DB giữ
  dữ liệu để chẩn đoán, không phục vụ orphan như publication hợp lệ. Kịch bản
  này đồng thời có head mới thấp hơn checkpoint sau khi worker đã tiến lên.

## Crash/restart và RPC

BE07 DB suite thực SIGKILL child process sau gate COMMIT, trước rollback COMMIT,
sau rollback COMMIT. Restart bằng storage/process mới loại đúng suffix, không
mất/trùng event. Còn có test fault injection riêng, được đặt tên rõ, không tính
chúng như SIGKILL thật.

Live driver SIGKILL thêm hai child project dùng RPC Anvil/PostgreSQL thật:
trước publication COMMIT nhìn thấy phase replaying và chưa có publication;
sau COMMIT nhìn thấy ready và publication đúng hash canonical. Child chỉ được
pause tại SQL boundary; mọi SQL result/RPC response đi qua dịch vụ thật.
Restart project thành công, giữ nguyên model. Cộng **5 ranh giới SIGKILL BE07**;
BE03 raw interruption được kiểm tra riêng trong regression.

Lỗi RPC được kiểm tra qua HTTP server kiểm soát lỗi: timeout, socket disconnect,
429/500/503, rate-limit JSON-RPC rồi phục hồi; bounded exponential delay/jitter,
abort lúc đang HTTP/backoff. HTTP 401/403, invalid method/params/execution error,
JSON hoặc response ID sai không bị retry như lỗi tạm thời. Wrong chain trước và
trong recovery không xóa dữ liệu. RPC chỉ bị chậm hơn checkpoint không phải
bằng chứng reorg; lower-height hash mismatch mới cho phép recovery.

Worker thật xử lý một BUD Transfer vừa đủ K trong **180 ms** ở lượt đo local.
Sau đó proxy HTTP trả 503 hơn **31.176 giây**, không có event mới: API vẫn phục
vụ snapshot canonical đã biết nhưng health degraded/indexer lagging,
`lagBlocks="0"`, `lagSeconds="31"`. Khi RPC phục hồi, worker kiểm tra lại và
health sync trở về synced. Cache snapshot không giữ nhãn synced cũ.
Đây là sample workload local, không phải phân phối latency/SLA dưới tải lớn.

## Diff, các lượt lỗi và giới hạn

[run-7-pg184/tested-source.json](run-7-pg184/tested-source.json) giữ SHA-256 các
file mới/sửa tại lúc bắt đầu test, gồm implementation/tests/CI/config/fixture.
[source.patch](run-7-pg184/source.patch) bao gồm file untracked, loại evidence để
tránh patch tự tham chiếu. Report/tài liệu kết quả được hoàn thiện sau test;
[final verification](verification.json) kiểm lại các hash implementation/test/CI
và ghi riêng thay đổi tài liệu. [Lệnh session](session-commands.json).

Giữ các lần chạy trung gian để truy vết, không đánh lại tất cả thành PASS:
run-1 lỗi fixture thiếu governance_config và kỳ vọng HTTP error cũ; run-2 còn
một fixture reorg giữa batch sai; run-3 bắt được lỗi thật shorter-head rồi được
sửa; run-4 bị người dùng ngắt, chỉ typecheck/build có exit code; run-5/run-6
PASS trên PG18.6; run-7 chạy PG18.4 và thêm publication SIGKILL. Run-5/6 không
thay bằng chứng của version/code sau đó.

FR14/NFR04/TC11 đã có implementation và các kiểm tra local bắt buộc; NFR03 có
freshness/worker, test 30 giây cả idle và một phép đo event đủ K. Chưa chạy CI
remote vì chưa push; TV4/peer/máy khác chưa nghiệm thu độc lập. Không chạy
performance SLA toàn tải BE08, frontend browser, testnet hoặc toàn bộ Foundry
suite; không nhận các phần đó PASS. Không có bài local bắt buộc nào đang bị chặn.
Dependencies Node được tái dùng từ local checkout có lockfile giống byte; không
khẳng định npm ci/clone sạch đã chạy trong session này. Forge rebuild artifact
và runner xác minh hash source/compiler/submodules thực tế.

## TV4 chạy lại

Cài đúng Node24.15.0/Foundry1.8.5/Solc0.8.37/PostgreSQL18.4, rồi theo
[docs/be07.md](../../be07.md):

```bash
npm ci
git submodule update --init --recursive
forge build
export BE07_PG_BIN=/usr/lib/postgresql/18/bin
export BE07_EVIDENCE_DIR=reports/be07-tv4-$(date -u +%Y%m%dT%H%M%SZ)
npm run test:be07:native
```

Không cần chỉ vào DB đang sử dụng. Native runner tạo DB/role/cluster mới và
Anvil mới; ghi lệnh/exit code, source patch/hash, API/cursor và compare. Để chạy
lại baseline lỗi, dùng detached c41a9ab + BE07_BASELINE_ROOT theo tài liệu.
