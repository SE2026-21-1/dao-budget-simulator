# BE08 native bottleneck — TV4, 24/11/2026

## Scope và nguyên nhân có bằng chứng

Yêu cầu mới: sửa bottleneck thực, không nới timeout, giảm tải hoặc bỏ gate.
Các native FAIL trước đây vẫn là FAIL của đúng source cũ; diagnostic PASS
không được dùng để đổi kết luận những lượt đó.

- PR61 `72d08940d63b99ec4d8e4d49f463251d7a0c714c`: normal-load event H1173
  đủ K lúc `12:26:43.163Z`; API vẫn H1170 sau30.078,688ms. Worker publication
  quan sát được sau30.238ms; không có worker error. Benchmark chưa đến outage.
- PR60 `7221c131f558a6566c715c371e58899acb05dccc`: event H1185 đủ K lúc
  `12:37:03.123Z`; API vẫn H1182 sau30.228,330ms, worker publication31.045ms.
- Diagnostic riêng trên `47faa8ee96c910a2ed211b1c14d747a485006aee` giữ cùng
  benchmark/probe/worker/config hashes: full replay/decode/model chiếm56,3%
  non-idle CPU samples; host idle1,77%, CPU pressure70,41%, main runqueue wait
  93,84s. Không quan sát SQL blocker. Đây là profiling có hooks, không phải
  native acceptance; raw profiles, probes và instrumentation được giữ riêng.

`projectReadModel` vẫn replay raw và rebuild model mỗi cycle. Hai chi phí lặp
trong đường này: ethers `Interface.getEvent(topic)` tìm event/hash lại qua các
candidate ở mỗi log; `publish` await từng INSERT riêng cho từng row. Cycle
đang chạy rồi cycle chứa event mới khiến publication vượt30s dưới tải. Không
quy nguyên nhân cho RPC retry: hai failure xảy ra trước outage, worker không
báo lỗi; final-trace oracle không được sửa để che freshness failure.

## Fix và chuyển cùng nội dung

- PR61: [`a672fd229ed4ec1912fe11141d307fd0b1b9abaa`](https://github.com/SE2026-21-1/dao-budget-simulator/commit/a672fd229ed4ec1912fe11141d307fd0b1b9abaa).
- PR60: [`7141d731c10d1e64c81cc1736d21ba8dac16e2ea`](https://github.com/SE2026-21-1/dao-budget-simulator/commit/7141d731c10d1e64c81cc1736d21ba8dac16e2ea).
  Áp dụng đúng patch sáu file từ commit PR61, rồi selective commit cùng tác giả;
  không nhập ancestry nhánh khác, không stage thay đổi người khác. Sáu file
  đã đối chiếu byte-identical; [patch gốc](common-fix.patch) giữ attribution ở commit.

1. `abi-registry.ts` lập frozen topic→EventFragment index một lần theo ABI.
   `decoder.ts` lookup topic đã lower-case; vẫn decode, force deferred errors,
   encode roundtrip, kiểm topic count/role/version và payload mỗi log.
   Không cache decoded payload, không bỏ raw validation.
2. `projector.ts::publish` dùng tối đa sáu set-based INSERT qua
   `jsonb_to_recordset`, thay per-row round trips. Giữ delete/FK order,
   deployment lock, transaction, uint256 string→numeric, domain constraints,
   UTF-8 description bytes, transfer identity, checkpoint và rollback atomic.
   Không thêm early return/no-op skip; canonical/replay/K/recovery checks giữ nguyên.

Không đổi `benchmark_api.mjs`, worker/probe/outage, RPC method/params/ID
lifecycle, backoff, bốn attempts, RPC5s, pool1, poll1s, K2 hoặc reorgWindow128.
Vẫn100 proposals/1000 indexed votes,10clients, duration tối thiểu60.000ms,
20freshness samples và freshness≤30.000ms. Closed-loop có thể kéo dài để đủ
mẫu; không tăng threshold và không giảm concurrent clients. p95 gate vẫn
strictly<1000ms cho global và từng endpoint, zero errors.

## Regression và native thật

Hai nhánh đều typecheck exit0, decoder+projection model54PASS/0FAIL,
`npm run test:be08`18PASS/0FAIL/0SKIP và `git diff --check` exit0.
Raw stdout: `pr{60,61}-{typecheck,codec-model,be08}.txt`.

Regression mới kiểm uppercase topic, payload mutation không làm nhiễm decode
sau, malformed trailing bytes vẫn reject; DB multi-row kiểm Unicode/escaped
bytes, arrays, ID/params/reason, stable replay và trigger reject một vote phải
rollback toàn bộ tables/checkpoint. Không test source text hay chỉ query-count.
Native và CI BE04/BE08 chạy thật regression PostgreSQL này.

Late-fifth regressions18/18 giữ nguyên: cùngID attempt5 muộn/outage boundary
phải FAIL final report và command; request mớiID khác/interleave vẫn riêng.
[Before/after của fix lifecycle](../be08-late-trace-20261124/report.md) giữ
nguyên, không thay bằng performance run.

| Lượt thực chạy | Source | HTTP thành công/lỗi | p95 ms | Idle max ms | Load max ms | Kết luận |
|---|---|---:|---:|---:|---:|---|
| Local native PostgreSQL18.4 + Anvil1.8.5, không hooks | a672fd229ed4ec1912fe11141d307fd0b1b9abaa | 9850 / 0 | 235,910 | 8907,326 | 16161,502 | PASS,20/20 samples;13suites PASS |
| Local native PostgreSQL18.4 + Anvil1.8.5, không hooks | 7141d731c10d1e64c81cc1736d21ba8dac16e2ea | 9830 / 0 | 244,665 | 8411,094 | 16082,377 | PASS,20/20 samples;13suites PASS |
| CI PostgreSQL service + Anvil, BE08 riêng | ac2bdc50a598aa09b0ed34d8bdeeba4a4ca73420 | 30469 / 0 | 30,489 | 1951,721 | 2769,467 | BE08 PASS; không phải whole-workflow PASS |
| CI PR61 sau clock fix, PostgreSQL service + Anvil | b071a29a3c931ffa007dc2e864d56f81e5c41b67 | 16377 / 0 | 54,877 | 2360,825 | 4051,261 | BE08 PASS; whole workflow SUCCESS |
| CI PR60 code-head, PostgreSQL service + Anvil | 67923b46d6b2a3068d5b7e20ef3fdbbb2ad94d89 | 30202 / 0 | 30,751 | 1907,886 | 3053,245 | BE08 PASS; whole workflow SUCCESS |

Local native dùng cluster mới chỉ bind127.0.0.1, databases riêng, current
unprivileged user. Report xác nhận source không đổi suốt run, source.patch
rỗng, worker exit0, normalWorkerErrors=[], outage PASS, clusterStopped=true,
temporaryFilesRemoved=true. Không Docker local, server, Sepolia hoặc chain H52.

Lệnh nguyên gốc tại từng clean worktree, Node24.15.0:

```sh
node scripts/check_be08_native.mjs \
  --postgres-bin /tmp/dao-review-tooling/pg18/node_modules/@embedded-postgres/linux-x64/native/bin \
  --output <new-evidence-directory> --benchmark
```

## CI đầu tiên FAIL: clock acceptance, không phải bottleneck còn bị che

[Run45401658170](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45401658170)
trên PR61 head`a672fd229ed4ec1912fe11141d307fd0b1b9abaa`, merge checkout
`ac2bdc50a598aa09b0ed34d8bdeeba4a4ca73420`: BE04/BE07/BE08 và các job khác
PASS, riêng BE05 live FAIL. API DB suite7/7 đã PASS; lỗi ở bước live sau
`empty result block`, `queue` gọi `evm_setNextBlockTimestamp(deadline+1)` bị
RPC`-32602` vì owned Anvil tự tiến theo wall clock trong phase SQL/API.
[Artifact14924231184](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45401658170/artifacts/14924231184)
và raw `pr61-first-ci-be05-failure.json` giữ nguyên lỗi/stack/phases.

PR61 [`cba8b6c9eda65959d82250441b8eed131a1a5044`](https://github.com/SE2026-21-1/dao-budget-simulator/commit/cba8b6c9eda65959d82250441b8eed131a1a5044)
port đúng sáu dòng clock fix`96e46013e435e743e3d3df696255ab4864461bd5` đã có
trên PR60: freeze interval của owned Anvil và assert receipt-header timestamp.
Không relax boundary assertion, production clock, benchmark/load hoặc timeout.
Chỉ rerun trên revision sửa thật, không rerun mù. Native performance row trên
là source`a672fd2`, không đổi nhãn thành native run của`cba8b6c`.

## CI sau sửa thật, đúng source/merge checkout

| PR | Head được CI kiểm | Merge checkout thực tế | TV4 CI |
|---|---|---|---|
| #61 | cba8b6c9eda65959d82250441b8eed131a1a5044 | b071a29a3c931ffa007dc2e864d56f81e5c41b67 | [45403578782 SUCCESS](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45403578782),10jobs success/1publish skipped |
| #60 | 7141d731c10d1e64c81cc1736d21ba8dac16e2ea | 67923b46d6b2a3068d5b7e20ef3fdbbb2ad94d89 | [45403269468 SUCCESS](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45403269468),10jobs success/1publish skipped |

PR61 BE05 live đã PASS đủ10phases kể cả snapshot/deadline/Ready boundaries,
duplicate zero-requestId revert, thiếu quỹ/retry; raw
`pr61-corrected-ci-be05-live.json` SHA256
`c6fca4213d6d7d4cc368e8ce90b2200a5459e9a4d7d825c26f7b312115749067`.
Không gọi publish SKIP là publish PASS. BE08 metrics bên trên là service-mode
CI riêng; không đổi nhãn thành local Docker/native. Sau evidence-only commit,
delivery-head CI được pin đầy đủ ở review replies để tránh vòng tự tham chiếu
SHA của chính report; source/runtime evidence vẫn gắn code commits trong bảng.

## Quyền nghiệm thu và phạm vi còn mở

TV2 cần re-review decoder/topic index, set-based publication/rollback và BE08
final trace; request đã pending thì không tạo trùng. Không tự resolve thread,
dismiss REQUEST_CHANGES, approve hoặc merge. TV1 security approval b186844 chỉ
signing/receipt/journal/role-audit: những sources/tests đó không đổi. PR60 giữ
BE07 clock, verify-release.yml và ba migration/manifest tests.

#6/#7 giữ In review; #44 giữ Blocked. #41 worker/SQL H52 đã bàn giao trước đó,
chờ TV2 kết luận; receipt/API đã được nhận, không yêu cầu kiểm lại. #19/#40/#42
receiver/account-switch và #20 owner/testnet/group demo không được thay bằng
native/CI xanh. Không thao tác personal/individual/evaluation, không rollout
server, đổi quyền, đọc secret hoặc broadcast. Không tuyên bố reviewer accepted.

## Source inventory, raw bytes và checksum

Fetch đầu lượt: Dev`896f93ea282d76fa72339a97ea12339240c16da4`;
PR61 head`72d08940d63b99ec4d8e4d49f463251d7a0c714c`,
API base`6766e5ee2d8c466542687cbeb09677c4d11e5463`;
PR60 head`47faa8ee96c910a2ed211b1c14d747a485006aee`,
base`896f93ea282d76fa72339a97ea12339240c16da4`.
PR61 API base cũ không thay Dev fetched hoặc merge checkout thực tế của CI.
Hai native run bắt đầu với `source.patch` rỗng trong worktree riêng.
`sourceUnchangedThroughRun=true` là các acceptance source hashes do runner
giám sát; cập nhật shared docs không phải một runtime retest.

| Packet/file | Nội dung và provenance |
|---|---|
| [pr61-native.tgz](pr61-native.tgz) | Nguyên thư mục native run a672fd2: report/benchmark/live/tested-source/source.patch/logs. |
| [pr60-native.tgz](pr60-native.tgz) | Nguyên thư mục native run7141d73, cùng loại output; không hooks. |
| [diagnostic.tgz](diagnostic.tgz) | Nguyên diagnostic47faa8e: CPU profiles, system/database/application probes, benchmark, analysis và instrumentation.tgz. Không phải acceptance run mới. |
| [old-native-failures.tgz](old-native-failures.tgz) | Nguyên hai benchmark.json FAIL cũ; tên member giữ theo thư mục ban đầu. |
| [code-ci-artifacts.tgz](code-ci-artifacts.tgz) | Bytes tải từ BE08 artifacts của run45401658170,45403578782,45403269468; head/merge và số đo ghi ở trên. |
| [pr61-native-report.json](pr61-native-report.json), [pr60-native-report.json](pr60-native-report.json) | Bản sao đổi tên, byte-identical với report.json trong native packet tương ứng. |
| [diagnostic-analysis.json](diagnostic-analysis.json) | Bản sao nguyên analysis.json, SHA256`03c7ce412e9f0eccf610967668f3f12781f85fae908c29eebaaaed25c530fddd`. |
| pr61-first-ci.json / pr61-first-ci-be05-failure.json | API run metadata và original BE05 failure artifact của CI đầu. |
| pr61-corrected-ci.json / pr60-code-ci.json | API run metadata tại code HEAD thật, không metadata của delivery-docs HEAD. |
| pr61-corrected-ci-be05-live.json | Original successful BE05 live artifact sau clock fix. |

Native original `benchmark.json` SHA256:

- PR61: `76e8c63fd245d04006b01cf2804a3580d6f646b2303d626b26da30021b3d7ceb`.
- PR60: `998702375b1c0a451478d757b85dfff87e34d982f5500a20fc0ec0b1bdbcaa00`.

[SHA256SUMS](SHA256SUMS) kiểm toàn bộ file bàn giao, trừ chính checksum manifest.
Chạy `sha256sum -c SHA256SUMS` tại thư mục này. Giải nén **mỗi packet vào một
thư mục rỗng riêng**: native và old-failure packets có member names trùng nhau.
Không gọi JSON summary dựng lại là raw output; không chỉnh sửa bytes của
benchmark/report cũ. Không có dữ liệu mới nào thay JSON H52 đã bàn giao ở#41.
