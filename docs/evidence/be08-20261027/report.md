# BE08 — Evidence local ngày 27/10/2026

Implementation và kết quả hiệu năng local đã có để review. **Hiệu năng cuối:
run-4-final; functional và CI-service mode cuối: run-6-service-final**, đều
PASS/exit0. Audit độc lập [final-audit.json](final-audit.json) cũng PASS, xác nhận
source đo hiệu năng vẫn khớp file hiện tại. Không commit/push/PR/merge/đóng issue/
bình luận GitHub. Remote CI BE08 **NOT RUN** theo chỉ dẫn local-only.

## Các lượt chạy, giữ nguyên lịch sử

| Lượt | Exit | Kết quả thật / vai trò |
| --- | --- | --- |
| [run-1-before-fix](run-1-before-fix/report.json) | 1 | FAIL setup: git patch vượt maxBuffer (`ENOBUFS`); chưa chạy test. Tăng buffer cho patch |
| [run-2-before-fix](run-2-before-fix/report.json) | 1 | Tái hiện freshness synced khi raw vượt publication; API case kế tiếp bị cascade do shared fixture chưa hoàn thành. Shell CRLF chặn contract command. Đây là before-fix, không nghiệm thu |
| [run-3-after-fix](run-3-after-fix/report.json) | 1 | Backend/live/benchmark PASS, tổng FAIL do Solidity CRLF format. Benchmark phát triển:34152 request/0 lỗi/p95=26.166ms; không chọn làm số đo cuối |
| [run-4-final](run-4-final/report.json) | 0 | **PASS native đầy đủ và số đo NFR02–04 cuối**. Source không đổi trong lúc chạy; cluster/Anvil dừng thành công. Live scope label cũ được phát hiện sau đó, không sửa raw report |
| [run-5-service-final](run-5-service-final/report.json) | 1 | Scope BE07 đã đúng; 135 unit,70 DB/API,142 contract và live PASS. BE01 SQL FAIL do mật khẩu role test khác admin trong service mode; đã sửa runner, giữ log lỗi |
| [run-6-service-final](run-6-service-final/report.json) | 0 | **PASS functional và CI-service mode cuối** sau sửa password/scope; source không đổi suốt lượt chạy. Driver start/stop cluster riêng exit0. Benchmark dependencies vẫn khớp run4 |

[development-audit.json](development-audit.json) tính độc lập lại p95 run3.
Nó cũng ghi rõ patch run2 bị cleanup kế thừa scrub URL sau khi hash, nên **hash
patch run2 không khớp**. Không dùng patch đó làm provenance cuối và không sửa log
cũ. Từ run3, `source.patch`/`tested-source.json` được giữ byte-exact. Run4 và lượt
functional cuối có source hashes/patch riêng, base SHA giống nhau.

| Tiêu chí | Kết quả cuối |
| --- | --- |
| NFR02 | PASS: mọi p95 dữ liệu<1000ms;100/1000 đúng;10 client≥60s;0 lỗi |
| NFR03 backend | PASS:20/20 sample đủK→publication/API<30000ms; cảnh báo API lagging có kiểm |
| NFR04 | PASS: bounded retry/backoff, atomic crash/restart, shallow/deep reorg, gate/cursor và fresh rebuild compare |
| NFR07 local | PASS: build/typecheck, unit, SQL/API, contract/invariant và service-mode orchestration |
| Remote CI BE08 | NOT RUN: chưa commit/push theo yêu cầu; workflow/artifact đã chuẩn bị |
| TV4 peer review / UI visual / testnet | NOT RUN trong BE08 local; bàn giao đúng owner |

## Base, source và môi trường

Base: `2adcbfac24fa34da9f76673a2404ef71dd3cb804`, PR#27 draft/head BE07 đã xác minh.
TV4 kế thừa: `213f9f7e8d88a65866861da1df8c95800cd1004e`; remote sau fetch lại là
`8abccfb146ee00a458514a514cc9dea44ad1f775`, delta frontend-only. Attribution và
dependency selection ở [docs/be08.md](../../be08.md). Dev1451779 chưa chứa BE05–07.
[Remote trước](remote-before.json), [remote kiểm lại](remote-recheck.json) chỉ là
CI của source đã có; không phải CI của implementation chưa commit.

Mỗi `report.json` lưu commands, args, thời gian, timeout, exit code/signal, đường
log và status thật. `tested-source.json` lưu hash file thực tế, `source.patch`
gắn với base. Source manifest cuối kiểm cả fixtures, migrations001–005, tests,
backend, scripts, compiler config/lockfile, CI, contracts/ABI. Benchmark còn ghi
hash dependency riêng; dùng để xác minh số đo vẫn tương ứng code hiện tại sau
khi sửa nhãn scope và password BE01 ở orchestrator.

Patch hiệu năng run4 SHA-256:
`50fb690274fbf543cdbbb475495a62d1fb8c11b175b6898ff89e11d2c639e140`.
Patch functional cuối run6 SHA-256:
`1ba258fb132e3ffa1de980d3e934a8b947fad0b698709a8721cc5262ed8632ea`.
Audit độc lập xác nhận cả hai patch khớp hash đã lưu, mọi hash dependency benchmark
và mọi source hash functional cuối khớp file hiện tại. [SHA256SUMS](SHA256SUMS)
niêm phong toàn bộ evidence sau khi chốt báo cáo; [final-review.json](final-review.json)
liệt kê hash file thay đổi và trạng thái nhánh/index.

Máy đo: i5-12500H,16 logical CPU, WSL RAM8,130,560,000byte (~7.57GiB), Ubuntu26.04.1,
kernel6.18.54.1-microsoft-standard-WSL2, x64. Node24.15.0, ethers6.17.0,
pg8.23.1, tsx4.23.15, TypeScript5.9.3, Foundry/Anvil/Cast1.8.5,
Solc0.8.37+commit.f401782d/Osaka. PostgreSQL18.4 PGDG Ubuntu, cả binary và server
được assert. Không dùng18.6. [Provision](provision.json), [binary hashes/OS](toolchain-provision.log).
Hai lockfile/contract logic không đổi. LF được chuẩn hóa trong worktree riêng;
`.gitattributes` giữ LF cho shell/Solidity và byte-exact cho evidence.

## NFR02 — PASS local

Raw: [benchmark.json](run-4-final/benchmark.json). 100 proposal/1000 vote real-chain,
10 unlocked account×100GOV self-delegated. Receipt, ID, voter/weight, on-chain
state/tally, SQL counts và ledger đều kiểm trước/sau. H1137,
hash `0x23df87853fbd650527a1d36d7fe1bbf5aa82a92b22198c84f9e60b41d92f126d`,
head1139/K2. Fixture tách demo bốn ví.

Preflight đủ100 detail/100 vote collection. Warm-up10 client **5.009s**,3858 request,
0 lỗi; không tính vào p95. Measurement10 closed-loop client, một outstanding/client,
không retry/think time, **60.0065s** gồm drain. Mọi client kết thúc sau60000ms.
Cycle list/list/summary/detail/votes/transfers. Đọc snapshot pin H/hash; bao gồm
snapshot materialized/cache. Probe freshness dùng latest transfers, đồng thời
tạo publication mới trong thời gian đo. Client/API cùng tiến trình Node, worker
CLI riêng, PG/Anvil cùng máy loopback.

| Endpoint dữ liệu | N | p95 (ms) | Max (ms) | Lỗi |
| --- | ---: | ---: | ---: | ---: |
| `/api/proposals` | 12726 | 20.702 | 3564.883 | 0 |
| `/api/summary` | 6361 | 11.523 | 2081.295 | 0 |
| `/api/proposals/:id` | 6359 | 16.647 | 3579.217 | 0 |
| `/api/proposals/:id/votes` | 6357 | 20.627 | 2785.937 | 0 |
| `/api/treasury/transfers` | 6356 | 19.778 | 3581.636 | 0 |
| **Tổng dữ liệu** | **38159** | **19.450** | **3581.636** | **0** |

100% request đo trả200 và vượt kiểm nội dung. Max có spike trên1s; tiêu chí là
p95<1000ms và0 lỗi, không tuyên bố mọi request đều<1s. Health đo riêng100 request
tuần tự sau data load: p95=**2.622ms**, max=6.024ms,0 lỗi; không trộn với dữ liệu.

Timer monotonic từ trước fetch đến **đọc hết JSON body**. Semantic validation
thực hiện sau timestamp, vẫn quyết định FAIL. Raw columns:
`worker,sequence,endpoint,proposalId,startOffsetMs,latencyMs,httpStatus,ok`;
mọi lỗi/timeout thuộc workload được lưu trong errors và làm phép đo FAIL.
Nearest-rank p95: sort N, lấy index `ceil(.95*N)-1`; không làm tròn trước tính,
không bỏ outlier. [verify.mjs](verify.mjs) dùng phép tính rank nguyên độc lập.
Kết quả TV4 ngày25/10 (8116 request,p95≈121.4ms) chỉ là lịch sử, mix/source/máy khác.

## NFR03 — PASS backend local

Worker thực tế `node --import tsx indexer/cli.ts --config <owned-config> --worker`:
K2, poll1000ms,batch100,reorgWindow128,pool1,timeout5000ms,4attempt,
backoff250/500/1000ms,cap2000ms,jitter50–100%. Không đo bằng timer tự gọi sync/project.
Normal RPC không có worker error; worker shutdown code0/signalnull.

Mỗi deposit1wei có txHash/block/hash riêng. Bắt đầu clock ngay **trước** RPC mine
block xác nhận thứ hai, ghi thêm mining acknowledgement để thể hiện khoảng đủ K;
độ trễ báo cáo là cận trên thận trọng. Đọc hết latest transfers response chứa
đúng txHash rồi xác minh publication SQL H/hash khớp API. Mọi sample<30000ms.

| Nhóm | N | p95 (ms) | Max (ms) |
| --- | ---: | ---: | ---: |
| API rảnh | 10 | 2729.052 | 2729.052 |
| Đủ10 load client | 10 | 6593.749 | 6593.749 |
| **Normal RPC gộp** | **20** | **5140.509** | **6593.749** |

Từng mẫu idle (ms):2729.052,1680.131,1401.033,1252.842,1106.582,2683.132,
1527.282,1417.744,1213.068,1067.206.

Từng mẫu load (ms):4434.715,2501.155,4462.818,2135.242,4347.593,6593.749,
2510.960,2266.208,5140.509,2071.701. Tất cả ghi activeClients=10.
N=10 mỗi nhóm nên nearest-rank p95 bằng max nhóm; không suy diễn SLA production.
Raw có từng timestamp, miningAck, probe timeline, body event và publication.

Trước/sau vẫn100 proposal/1000 vote. Transfers1→11→21 do20 deposit1wei;
balance từ10000000000000000000000 thành10000000000000000000020,
totalOut=0. Các API snapshot baseline vẫn trả balance tạiH1137 ban đầu.
Backend đã kiểm lagging/synced; UI visual mới cần TV3/TV4 kiểm khi tích hợp.

## NFR04 và tính đúng — PASS local

Outage riêng qua proxy RPC503, không đưa vào normal latency:
**31250.889ms** mất RPC → health/summary lagging, lagSeconds≥30;
sau phục hồi **525.375ms** → synced. Có56 HTTP503 attempt,14 cycle exhausted,
mỗi cycle4attempt, backoff dương và hữu hạn; từng request/gap/worker error nằm
trong `freshness.outage`. RPC outage không làm raw checkpoint vượt dữ liệu commit.

Live BE07 còn kiểm reorg cùng độ cao thay toàn bộ orphan proposal/vote/operation/
transfer/disbursement; gate health/data503, cursor cũ409 trong/sau replay; canonical
replay3lần không tính đôi. Giữ5SIGKILL boundary của BE07 và checkpoint crash test.
Deep fork ngoài window chuyển rebuild_required và503, giữ diagnosis/metadata.
Fresh BE06 DB compare `equal`, zero mismatch tại cùngH67/hash canonical, chain
cross-check PASS cả reference/rebuild. Raw live report cuối ở lượt service sau sửa
scope.16 unknown ancillary topics vẫn được báo; không suppress để đổi nhãn PASS.

## Test và CI NFR07

Run4 native: typecheck/build PASS; **135 unit**, **70 PostgreSQL/API**
(21+16+10+4+1+18), SQL migration/constraints, **142 contract/invariant**, SC01 ABI
checker, live worker/reorg/crash/rebuild và benchmark PASS. Không fail/skip/cancel/todo
trong các suite TAP cuối. Contract profileci/seed0x20261021; không nhập SC05/TV4
contract tests mới vào BE08 để làm tăng số lượng.

Workflow `be08.yml` pin Node/Foundry/PG18.4, gọi cùng orchestrator và upload artifacts
kể cả khi fail. Đường service được kiểm local bằng [driver](recheck-ci-service.mjs)
trên cluster184 mới, khác cluster benchmark. **Remote CI chưa chạy**, không lấy
CI xanh của BE07/TV4 làm CI của patch này.

## Tái hiện và review

Lệnh chính và môi trường thực tế: [session-commands.json](session-commands.json),
commands array của từng report và driver commands. Linux clone sạch:

```bash
npm ci
git submodule update --init --recursive
forge build
npm run test:be08:native -- --postgres-bin /absolute/pg18.4/bin --output reports/be08-new --benchmark
node docs/evidence/be08-20261027/verify.mjs docs/evidence/be08-20261027/run-6-service-final docs/evidence/be08-20261027/run-4-final reports/new-audit.json
```

Chỉ mục file thay đổi: `.gitattributes`, `indexer/api/server.ts`, `package.json`,
`scripts/check_be04_live.mjs`, `tests/api/server.test.mjs`; thêm
`scripts/benchmark_api.mjs`, `check_be08_native.mjs`, `be08_worker_probe.mjs`,
`be08_measurement.mjs`, `smoke_lifecycle.mjs`, test phép đo,
`.github/workflows/be08.yml`, `docs/be08.md` và thư mục evidence này.
Không có semantic contract/frontend diff; index staged diff rỗng.

Worktree/branch: `D:\dao-budget-simulator-be08`, `feature/tv2-be08`, HEAD vẫn là
base BE07, mọi implementation chưa commit. Checkout ban đầu/user untracked files
được giữ nguyên. TV4 cần review mix/cache/local topology, conservative eligible
timestamp, raw percentiles/errors, reorg/rebuild và artifact rồi chạy remote CI
sau khi có chỉ dẫn xuất bản. TV1 review on-chain semantics; TV3 review cảnh báo/
409/503 consumer. Không dùng local test thay peer approval, testnet hoặc ví thật.
