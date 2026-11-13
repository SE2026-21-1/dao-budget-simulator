# DAO Budget Simulator

Mô phỏng ngân sách DAO trên local/testnet (không dùng tiền thật). GOV holders
tạo đề xuất chi BUD, bỏ phiếu; Governor xếp lịch qua Timelock rồi Treasury mới
giải ngân. Worker đọc sự kiện đã đủ K confirmation, lưu raw và checkpoint
nguyên tử vào PostgreSQL, dựng projection tại H/hash; HTTP API chỉ đọc snapshot,
React đọc API và gửi giao dịch trực tiếp tới contract qua ví.

**Nhánh tích hợp:** `feature/tv4-operation`
([PR #21](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21))
chứa wallet/UI và nghiệm thu TV4. VT-064 là bài cá nhân theo PR #31,
không thuộc diff tích hợp; import bản nháp offline không chứng minh
wallet/chain/API. `Dev` (`87738d3`, 06/11/2026) đã có SC06, BE03–BE08
và freshness nhưng chưa có UI/API consumer của PR #21. CI và peer review
phải đối chiếu đúng head mới; `main` không phải nhánh tích hợp.

Fixture `fixtures/api/` chỉ đọc khi không đặt `VITE_API_BASE_URL` hoặc chọn
`VITE_DATA_SOURCE=fixture`; lỗi API thật không được fallback sang fixture.
Recovery đóng publication và trả HTTP 503, cursor cũ trả 409; quá `reorgWindow`
yêu cầu rebuild sang database mới. Local Anvil/transport EIP-1193 không chứng minh
ví extension hoặc testnet.
Xem [trạng thái nghiệm thu TV4](docs/test-plan.md),
[runbook BE07](docs/be07.md), [BE08 trên Dev](docs/be08.md) và
[bàn giao TV4](docs/tv4-work-summary.md).

## Thành viên và tài liệu

| Thành viên | Phụ trách | Hướng dẫn |
|---|---|---|
| TV1 | Contract, roles, SC06 | [SC05](docs/sc05-timelock-roles.md), [contract](docs/contracts.md) |
| TV2 | RPC/indexer, PostgreSQL, API, recovery, BE08 | [BE07](docs/be07.md), [BE08](docs/be08.md), [API](docs/api.md) |
| TV3 | React, ví, giao dịch và consumer API | [Frontend](frontend/README.md) |
| TV4 | Testing, deploy, CI, nghiệm thu | [Test plan](docs/test-plan.md), [checklist](docs/tv4-checklist.md) |

Cập nhật tích hợp TV4 13/11: tiếp nhận chọn lọc Swiss UI/consumer TV3 `15b62b5`,
giữ WalletSession và snapshot signing leases; xem [quyết định API/fixture](frontend/README.md).
SC06 hiện dùng [fixture v2 mới, source-bound](fixtures/chain/sc06-v2/README.md);
v1 và các kết quả lịch sử giữ nguyên attribution.
[Đường Sepolia riêng](docs/sepolia-deployment.md) chuẩn bị estimate/sign/audit K=2,
không gỡ guard local Anvil; chưa có signer được cấp phép hoặc testnet PASS.
Chỉ cập nhật Project nhóm #1 đang mở; Project TV4 #2 đã đóng.

## Quick start — một deployment local mới

Node **24.15.0** (`.nvmrc`), npm lockfiles riêng, Foundry **1.8.5**,
Solidity **0.8.37**/Osaka, OpenZeppelin **5.4.0**, PostgreSQL **18.4**.
Các lệnh dưới dùng terminal riêng cho chain, worker, API, frontend; không kết
nối một PostgreSQL đã phục vụ hay Anvil vừa bị reset với checkpoint cũ.
`Dev` chạy được backend; để chạy UI hoặc offline draft import trước khi PR #21
merge phải checkout `feature/tv4-operation` và đối chiếu lại với Dev.

```bash
git clone --branch feature/tv4-operation https://github.com/SE2026-21-1/dao-budget-simulator.git
cd dao-budget-simulator
git submodule update --init --recursive
nvm install && nvm use
npm ci && npm ci --prefix frontend
forge build
# Terminal chain: chỉ bind loopback, ví Anvil unlocked không được phơi ra mạng.
anvil --host 127.0.0.1 --chain-id 31337 --hardfork osaka --silent
# Terminal mới: bắt đầu bằng Anvil rỗng/unforked, output chưa tồn tại.
node scripts/deploy_local.mjs --rpc http://127.0.0.1:8545 --output /tmp/dao-local-manifest.json
node scripts/check_roles.mjs --rpc http://127.0.0.1:8545 --manifest /tmp/dao-local-manifest.json
node scripts/export_local_handoff.mjs --rpc http://127.0.0.1:8545 \
  --manifest /tmp/dao-local-manifest.json --output /tmp/dao-local-handoff
```

Tạo **database rỗng riêng** bằng PostgreSQL đang chạy; đặt `DATABASE_URL`
trỏ đúng database đó và `RPC_URL=http://127.0.0.1:8545` trong shell của worker
(CLI không tự nạp `.env`). Ví dụ URL **placeholder**:
`postgresql://<user>:<password>@127.0.0.1:<port>/<new-database>`.
Chạy migration đúng một lần theo thứ tự:

```bash
for migration in database/migrations/{001_initial,002_be03,003_be04,004_be05_api,005_be07}.sql; do
  psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$migration" || exit 1
done
```

Đăng ký `deployments` và năm `deployment_contracts` từ **manifest đã audit**;
`deployment_name` là tên API, `deployment_id` là serial SQL cho config indexer.
Xem [BE03 metadata](docs/be03.md#migrate-và-vận-hành) và
[`scripts/check_be04_live.mjs`](scripts/check_be04_live.mjs) (đường INSERT thực).
Không sao chép địa chỉ/block synthetic từ `indexer/config/example.json`.
Đặt `indexer/config/local.json` từ example với chainId, `deploymentId` SQL,
`fromBlock` không muộn hơn BUD deployment block, bốn role
budget_token/treasury/timelock/governor từ manifest, `toBlock:"latest"`,
`confirmations:2`, `reorgWindow:128`, `pollIntervalMs:1000`. GOV có metadata
nhưng không là role log scanner BE02. Sau đó:

```bash
# Terminal worker (DATABASE_URL, RPC_URL đã export; config và metadata cùng chain).
npm run indexer -- --config indexer/config/local.json --worker
# Terminal API: giữ secret ổn định, không dùng trong VITE_* hoặc commit.
export API_CURSOR_SECRET="$(openssl rand -hex 32)"
export API_CORS_ORIGINS=http://127.0.0.1:5173
npm run api
# Terminal frontend: điền frontend/.env.local từ manifest và context.deploymentId
# theo bảng frontend/README.md; VITE_API_BASE_URL=http://127.0.0.1:3000.
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
curl 'http://127.0.0.1:3000/api/health?chainId=31337&deploymentId=<deployment_name>'
```

Không chạy frontend live trước khi API xuất bản `ready` tại H/hash; không
nhầm receipt confirmed với snapshot đã publish (chờ K=2). Tắt theo thứ tự
frontend → API → worker → Anvil bằng Ctrl-C/SIGTERM; restart worker/API sau
khi xác minh **cùng chain/manifest/database**, không dùng lại DB sau Anvil reset.
Demo ký propose/vote/queue/execute/cancel và deposit theo
[frontend runbook](frontend/README.md); demo âm: sai mạng, từ chối ký, thiếu
quỹ execute revert → nạp BUD → retry **cùng** operation. Không cộng BUD
Transfer và BudgetDisbursed thành hai khoản chi.

Health `lagging` sau hơn 30 giây thiếu canonical RPC check; publication
`recovering`/`replaying` trả 503, cursor cũ 409 phải tải lại trang đầu. Fork quá
`reorgWindow` chuyển `rebuild_required`: giữ database nguồn để chẩn đoán,
[BE06 rebuild](docs/be06.md) ở **database mới/rỗng**, so cùng H/hash rồi mới
đổi cấu hình API; không xóa DB đang phục vụ. Test theo module:
`FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh`,
`npm run test:be07:native` (đặt `BE07_PG_BIN`),
`npm run test:be08:native -- --postgres-bin <pg18.4/bin> --output <new-dir> --benchmark`
trên `Dev`, `npm run test:tv4:native -- --postgres-bin <pg18.4/bin> --output <new-dir>`
trên PR #21, và `npm run lint --prefix frontend && npm run test --prefix frontend && npm run build --prefix frontend`
trên PR #21. Docker chỉ khi daemon có quyền; native không cần Docker.

Các lệnh `test:be02`, `test:be03`, `test:be06` dùng Node `--import tsx --test`
như các suite BE04/BE07/BE08; không cần Unix IPC server của CLI `tsx --test`
(theo [#47](https://github.com/SE2026-21-1/dao-budget-simulator/issues/47)).

## Evidence và gate tại thời điểm đối chiếu

| Thành phần | Source/CI/chạy mới đã đối chiếu | Giới hạn trước release |
|---|---|---|
| BE03–08, freshness 001–004/005, SC06 | Dev [`87738d3`](https://github.com/SE2026-21-1/dao-budget-simulator/commit/87738d3f792c3a283a52b5c18c306809d6cfcfd4); [TV4 CI 41973419072](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/41973419072), [BE08 CI 41973418947](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/41973418947) success. **Chạy mới** `test:be08:native --benchmark` trên Dev: PostgreSQL 18.4/Anvil, 20.986 HTTP success/0 lỗi, p95 212,461 ms, 20/20 freshness (<30s); [raw/digest](docs/evidence/tv4-20261106-acceptance.md). Artifact CI [13391310183](https://api.github.com/repos/SE2026-21-1/dao-budget-simulator/actions/artifacts/13391310183) cần auth để tải raw | Chạy local không thay peer review, artifact CI chưa được đọc; xem [#18](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18), [#37](https://github.com/SE2026-21-1/dao-budget-simulator/issues/37) |
| Wallet/UI↔API | [PR #21](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21) còn open; [nhánh TV3](https://github.com/SE2026-21-1/dao-budget-simulator/tree/feature/tv3-frontend) live suite **PASS 1/1, 0 SKIP** trên Anvil/PG/API H79 native PR #21 sau sync RPC thật. Chromium 1366/390 đọc dữ liệu; **lượt local thứ hai** browser EIP-1193 adapter→Anvil receipt `0xb4fa5ad3…aba82b` H82→sync/project→API 200 H82/hash canonical→UI hiển thị amount BigInt và description chính xác; [raw/ảnh](docs/evidence/tv4-20261106-wallet-raw.tar.gz) | #36/#40/#41 vẫn chờ ví extension và service/manifest cho peer; EIP adapter Anvil unlock không phải xác nhận ký extension, endpoint tạm đã teardown |
| SC/CI/testnet | Candidate `105f2ba` (source kiểm chứng `d8f8743`): SC06 canonical/mutation **32/32** theo source `9ad0aea`; TV4 QA05 local **202/202 Foundry, 21/21 attack** tại `b7a74ce`; [evidence peer](docs/evidence/tv4-20261111-peer-acceptance.json), [delta QA05](docs/evidence/tv4-20261111-qa05-variants.json). [CI source d8f8743 9/9](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/42958494472) success, khác với số đo local. | SC07 technical PASS; SC05 local audit/roles PASS. Full QA05 PARTIAL; testnet #20, extension wallet, máy nhận #42 và release #44 vẫn chưa nghiệm thu. |

GitHub [Projects của nhóm](https://github.com/orgs/SE2026-21-1/projects)
hiển thị 0 project công khai khi chưa đăng nhập; chưa thể xác nhận hoặc sửa
board riêng tư bằng SSH Git. Danh sách status/priority/dependency **đề xuất**
trong [checklist](docs/tv4-checklist.md), không nhận là đã cập nhật Project.
Bảng backend/UI phía trên giữ evidence 06/11 theo SHA/môi trường gốc. Kết quả SC hiện hành
đối chiếu thêm [peer 11/11](docs/evidence/tv4-20261111-peer-acceptance.json) và
[QA05 delta 11/11](docs/evidence/tv4-20261111-qa05-variants.json); không chuyển số đo giữa các lượt chạy.

TV4 đã chọn **Ethereum Sepolia, chainId 11155111, K=2**, RPC PublicNode theo
[preflight read-only 11/11](docs/evidence/tv4-20261111-testnet-preflight.json).
Probe chain identity/CLZ là kiểm tra hạn chế, **0 transaction broadcast**, chưa dùng signer;
không chứng minh compiled contracts đã deploy hoặc gas/roles/ABI hoạt động trên testnet.
Deployment vẫn **BLOCKED** đến khi có signer funded an toàn, đường remote deploy/check-roles
được review, revision được chấp nhận và manifest/receipts Executed/Defeated thời gian thật.
Không bỏ guard Anvil31337 của script local.

## Trạng thái các task TV1

| Task | Trạng thái |
|---|---|
| SC01 — Nền tảng và chuẩn tích hợp | Đã triển khai, còn các mục review/tái lập trong docs/contracts.md |
| SC02 — Token và voting power | Đã tích hợp từ Dev qua PR #10; có unit test và review TV4 |
| SC03 — Treasury và chống chi lặp | Đã tích hợp từ Dev qua PR #11; review độc lập TV4 được ghi riêng |
| SC04 — Governor và giới hạn proposal | Đã tích hợp `f57fcfd`, PR #13 đã merge; peer nghiệm thu SC05/deployment vẫn là đầu việc riêng |
| SC05 — Timelock và quyền sau deploy | Local audit/roles PASS tại `ff484fb`, có pre-renounce/pre-funding và operation-history audit; TV1 kiểm 15 bootstrap tests. Testnet BLOCKED (#20), không suy từ local |
| SC06 — ABI và dữ liệu tích hợp | Đã merge nền tảng qua PR #39; candidate source `9ad0aea` canonical/mutation 32/32, peer TV1/TV2 đã có; TV3 consumer/tích hợp còn riêng (#43) |
| SC07 — Hoàn thiện unit test và test biên | **Technical PASS / contract-level completed** tại `d8f8743`: 138 unit functions, 40 integration; [mapping SC07](docs/sc07-test-coverage.md). Full QA05/E2E riêng; bàn giao tài liệu chờ TV4 review |
| SC08 — Tích hợp local | UI → EIP-1193 local → contract → indexer/API → UI trên nhánh PR #21; chưa có trên Dev, chưa thay ví extension/testnet |
| SC09 — Review dữ liệu và tài liệu contract | [Contract docs](docs/contracts.md) và [phần báo cáo nhóm #44](docs/sc09-smart-contracts-report.md) đã cập nhật cho candidate `d8f8743`; chờ TV4 review tài liệu tích hợp, không chốt release |
| SC10 — Testnet và bàn giao | TV4 chọn Sepolia/11155111/K=2; probe read-only không là deploy. BLOCKED #20: signer funded an toàn, remote deploy/check-roles được review và manifest/receipts thật |

## Môi trường Foundry — TV4 Operation

Cấu hình, thư viện và dữ liệu tích hợp SC01 được đồng bộ từ nhánh `feature/tv1-sc01`,
commit `9a406fedfbac6c54237712a536b0700fdad9bb73`. Interface `ITreasury`, ABI chia sẻ,
fixture tổng hợp và script kiểm tra fixture được giữ làm chuẩn tích hợp.
Test selector TV1 đã được thay bằng bộ kiểm tra tương thích ABI dành cho TV4.
GOV/BUD/Treasury đã tích hợp từ `Dev` tại `1f40748`; BudgetGovernor từ `f57fcfd`. TimelockController dùng dependency OpenZeppelin đã khóa; SC05 `21e53e1` bổ sung kiểm thử tích hợp, ABI và tài liệu quyền, không thay deployment/testnet acceptance.

| Thành phần | Phiên bản |
| --- | --- |
| Foundry (`forge`, `cast`, `anvil`) | 1.8.5 |
| Solidity | 0.8.37 |
| OpenZeppelin Contracts | 5.4.0 |
| forge-std | 1.17.0 |
| EVM local | osaka |
| Optimizer | bật, 200 runs |

Dependency được khóa bằng Git submodule và `foundry.lock`. Cài Foundry 1.8.5
theo [hướng dẫn Foundry](https://getfoundry.sh/introduction/installation), rồi chạy:

```bash
git clone --branch feature/tv4-operation https://github.com/SE2026-21-1/dao-budget-simulator.git
cd dao-budget-simulator
git submodule update --init --recursive
forge --version
cast --version
anvil --version
forge build
forge test -vv
python3 scripts/check.py
forge fmt --check
```

Lần build đầu có mã Solidity cần mạng để tải compiler 0.8.37 nếu chưa có.
Foundry tìm contract trong `contracts/`, test trong `tests/` và thư viện trong
`lib/`. Remapping `forge-std/` và `@openzeppelin/contracts/` đã có trong
`foundry.toml`. Script kiểm tra ABI/fixture cần Python 3, không cần package bổ sung.
Bộ test `tests/unit/OperationAbiCompatibility.t.sol` gồm:

- `testFuzzDisbursementPayloadMatchesClientAbi`: đối chiếu calldata do interface
  tạo với ABI công khai cho requestId, địa chỉ nhận và số lượng được fuzz.
- `testBudgetDisbursedTopicMatchesIndexerAbi`: cố định topic0 của sự kiện
  `BudgetDisbursed` để phát hiện thay đổi làm mất tương thích với indexer.

Script Python đối chiếu ABI compiler, calldata, descriptionHash và proposalId.
Fixture là dữ liệu tổng hợp, không phải receipt on-chain. Các kiểm tra này chưa
chứng minh phân quyền Treasury, chống giải ngân lặp hay luồng DAO end-to-end.

Cấu hình `osaka` chỉ được xác minh bằng thực thi EVM local; cần kiểm tra hỗ trợ
của testnet trước khi deploy. Không commit private key hoặc RPC secret:
`.env`, `.env.*`, `out/`, `cache/` và `broadcast/` được bỏ qua; `.env.example`
được phép đưa vào Git.

## Kiểm tra tự động — TV4

Sau khi cài dependency, chạy các kiểm tra Foundry như job contracts:

```bash
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh
```

Job contracts dùng Foundry 1.8.5, Python 3.12, Node 24.15.0 và profile `ci`
(256 fuzz runs, 100 invariant runs × 50 thao tác, seed `0x20261021`), smoke Treasury
và governance thật qua PostgreSQL 18.4 cô lập, rollback/restart/raw replay cùng H.
Job BE01 kiểm fixture/SQL; BE02 có 64 RPC/decoder và 21 PostgreSQL tests.
BE03 thêm 22 bài confirmation/resume và 16 bài PostgreSQL/crash; BE04 kiểm
projection, BE05 API và BE06 rebuild/compare cùng H. Frontend chạy lint,
6 behavior tests và production build (`tsc -b && vite build`).
Workflow cấu hình tám job; artifact giữ 14 ngày. Browser/EIP-1193 acceptance
được lưu riêng, không giả là CI đã chạy ví extension.

Workflow chạy khi push vào `main`, `Dev`, `feature/**` hoặc mở/cập nhật PR.
Lần đầu cần mạng để tải công cụ, compiler, dependency và image PostgreSQL.
Không cần RPC ngoài hoặc private key; Docker local cần quyền daemon hợp lệ.

[CI bản triển khai `7a0ab33`](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342)
đã chạy thành công cả ba job; [metadata và log SQL](docs/evidence/tv4-ci-7a0ab33.json).
Đây không chứng minh Governor/Timelock, checkpoint/reorg/rebuild, HTTP API,
UI wallet/E2E hay NFR07 toàn hệ thống. Xem [checklist TV4](docs/tv4-checklist.md).

Các CI tại source cũ chỉ là lịch sử. Dev `1451779` có
[CI năm job thành công](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40088009664).
Nhánh tích hợp TV4 có BE05/BE06/wallet và job BE03 mới đã push qua SSH tới
`24f576e`; [CI đúng revision](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40113995662) đạt **8/8 job**.
Kết quả local, metadata publish/CI và blocker có trong [evidence 24/10](docs/evidence/tv4-20261024-acceptance/report.md).

Clone sạch candidate `d2617d0` cùng máy đã chạy lại install/build/typecheck,
330 tests, smoke và native `--benchmark` thành công, không overlay/cache dự án.
TC12 bổ sung đủ tám proposal cùng H và sáu mốc S/S+1/D/D+1/E−1/E; mỗi case
reference/target mới, normalized/chain compare bằng nhau. Gitleaks toàn history
có283finding public hash/address/placeholder đã triage; raw exit1 được giữ,
không suppress. [Report và lệnh chạy lại](docs/evidence/tv4-20261024-acceptance/report.md)
ghi rõ giới hạn clone cùng máy, pattern scan và gate reorg chưa đạt.

### Nghiệm thu native PostgreSQL khi không dùng được Docker

Node được pin bằng `.nvmrc` (24.15.0). Dùng PostgreSQL **18.4** có sẵn, hoặc
cài binary vào thư mục tạm, không cần sudo/quyền Docker:

```bash
nvm install
nvm use
npm ci
npm ci --prefix frontend
forge build
npm install --prefix /tmp/dao-tv4-pg18 --ignore-scripts --no-audit --no-fund \
  @embedded-postgres/linux-x64@18.4.0-beta.17
(cd /tmp/dao-tv4-pg18/node_modules/@embedded-postgres/linux-x64 && node scripts/hydrate-symlinks.js)
PG_BIN=/tmp/dao-tv4-pg18/node_modules/@embedded-postgres/linux-x64/native/bin
npm run test:tv4:native -- --postgres-bin "$PG_BIN" --output /tmp/tv4-native-new
# Bao gồm cả benchmark 100 proposal/1000 vote thật, 10 client/60 giây:
npm run test:tv4:native -- --postgres-bin "$PG_BIN" --output /tmp/tv4-native-perf-new --benchmark
```

Mỗi output phải mới/rỗng. Runner sở hữu cluster loopback, tài khoản/database
tách theo suite, Anvil và cleanup; không dùng `DATABASE_URL`/`RPC_URL` của người
gọi. Không có `psql` vẫn chạy được qua `pg`. `report.json` ghi exit code, test
counts, version/source/binary hashes và cleanup; lỗi/ngắt không được báo PASS.
Binary NPM có version đóng gói beta; PostgreSQL thực chạy phải báo **18.4**.
Benchmark tạo database riêng trước khi runner dừng cluster, không tái dùng
database live. Kết quả máy này không thay benchmark máy khác/testnet.

### Đồng bộ liên tục và phục hồi

Sau deploy, migration 001–004 và đăng ký deployment metadata đã xác minh, áp
dụng `database/migrations/005_be07.sql` một lần trên database đang dùng. Đặt
`RPC_URL`, `DATABASE_URL` và `indexer/config/local.json` theo deployment thật,
với `toBlock: "latest"`; `.env` không được tự động nạp:

```bash
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f database/migrations/005_be07.sql
npm run indexer -- --config indexer/config/local.json --worker
```

Worker tuần tự sync → project, polling theo `pollIntervalMs` (mặc định 1000 ms).
API/frontend chạy ở terminal riêng. SIGINT/SIGTERM hủy RPC/backoff đang chờ,
đóng pool sau transaction; heartbeat chỉ cập nhật sau kiểm tra canonical, kể cả
idle. API báo `lagging` nếu quá 30 giây chưa xác minh; UI kiểm tra health mỗi 5
giây. Đây là chỉ báo freshness, không phải phép đo chính xác mọi event.

Khi reorg, phase `recovering` đổi revision và vô hiệu hóa cursor trước khi tìm
tổ tiên/rollback/replay; API trả 503 trong lúc phục hồi, cursor cũ trả 409.
Nếu không có tổ tiên trong `reorgWindow` (mặc định 128 block), giữ trạng thái
`rebuild_required` và dùng [BE06 rebuild](docs/be06.md) trên database mới;
không sửa hash hoặc xóa DB đang chạy để né lỗi. Chế độ `--watch` cũ vẫn chạy
chu kỳ sync/project trên DB đã migration 001–004, nhưng không thay cho worker
BE07 khi cần phục hồi/replay tự động. Hướng dẫn đầy đủ: [BE07](docs/be07.md).


## Unit test SC02

Sau khi cài dependency và toolchain ở trên, chạy riêng từng token:

```bash
forge test --match-path 'tests/unit/GovernanceToken.t.sol' -vv
forge test --match-path 'tests/unit/BudgetToken.t.sol' -vv
```

Hoặc chạy cả hai token, rồi toàn bộ test để kiểm tra cùng SC01:

```bash
forge test --match-path 'tests/unit/*Token.t.sol' -vv
forge test
```

Test GOV kiểm tra nguồn cung/phân bổ, decimals, delegation, timestamp clock và
checkpoint lịch sử. Test BUD kiểm tra nguồn cung, phân bổ demo, chuyển không phí,
approve/transferFrom và allowance. Có test âm và fuzz test cho hai token.
Constructor và trình tự phân bổ cho TV4 được mô tả trong
[tài liệu SC02](docs/sc02-tokens.md).

## Unit test SC03

```bash
forge build
forge test --match-path 'tests/unit/Treasury.t.sol' -vv
forge test -vv
python3 scripts/check.py
```

Treasury dùng AccessControl và SafeERC20; nạp bằng transfer BUD, kiểm tra số dư khi chi,
chặn requestId đã thanh toán và cho retry sau lần thất bại. Test dùng địa chỉ Timelock giả lập,
chưa chứng minh luồng Governor → Timelock → Treasury. Xem [hướng dẫn SC03](docs/sc03-treasury.md).

### Smoke độc lập TV4 và invariant Treasury-only

Cần Node 24.15.0; chạy sau build ở trên:

```bash
npm ci
node --import tsx scripts/smoke_treasury.mjs --output /tmp/sc03-local-smoke.json
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/invariant/TreasuryAccounting.t.sol -vv
```

Smoke sở hữu Anvil loopback tạm, tự dừng; không nhận RPC URL/private key.
Kiểm phân quyền, chi trùng, thiếu tiền/retry và 7 Transfer/3 BudgetDisbursed
thật qua BE02. Spender EOA là thiết lập thử nghiệm, không phải Timelock.
Invariant dùng oracle lịch sử độc lập; không thay INV01–INV04 governance.
Xem [review SC03](docs/sc03-review.md) và [kết quả local](docs/evidence/tv4-local-verification-20261021.json).

## Unit test SC04

```bash
forge build
forge test --match-path 'tests/unit/BudgetGovernor.t.sol' -vv
forge test -vv
python3 scripts/check.py
```

BudgetGovernor chỉ nhận một lời gọi Treasury.disburse chuẩn ABI, dùng GOV timestamp checkpoint,
threshold 50 GOV và quorum 20%. Xem [SC04 — Governor](docs/sc04-governor.md).
Test có Timelock thật làm fixture; production roles/deploy/check-roles thuộc SC05 và TV4.

## SC05 — Timelock và quyền sau bootstrap

```bash
forge build
forge test --match-path 'tests/integration/TimelockGovernance.t.sol' -vv
npm run test:bootstrap
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261023 forge test -vv
python3 scripts/check.py
```

[Hướng dẫn SC05](docs/sc05-timelock-roles.md) chốt minDelay 120 giây, role matrix,
trình tự grant/revoke/renounce và audit lịch sử role. Fixture dùng năm contract thật,
bỏ mọi quyền bootstrap trước khi nạp BUD; kiểm tra queue/execute qua ví không có GOV,
biên ETA, retry thiếu quỹ và chi trùng requestId. ABI [TimelockController](shared/abi/TimelockController.json)
sinh từ compiler. Script TV4 đã thêm preflight trước renounce và audit lại trước
funding; kiểm chứng Foundry không thay audit deployment/testnet hoặc UI/API E2E.

## Deploy, audit role và demo governance local — TV4

Cần Foundry 1.8.5, Node 24.15.0 và `npm ci`; build bằng cấu hình đã khóa.
Để giữ chain chạy cho TV2/TV3, mở terminal riêng:

```bash
anvil --host 127.0.0.1 --chain-id 31337 --hardfork osaka --silent
```

Trên **Anvil mới, rỗng, không fork**, chạy:

```bash
forge build
node scripts/deploy_local.mjs --rpc http://127.0.0.1:8545 --output /tmp/dao-local-manifest.json
node scripts/check_roles.mjs --rpc http://127.0.0.1:8545 --manifest /tmp/dao-local-manifest.json
```

Script chỉ nhận RPC deploy numeric loopback, không nhận key, từ chối chain có
giao dịch và không ghi đè manifest. Deploy GOV/BUD/Treasury/Timelock/Governor
thật. Preflight ở `preRenounceRoleCheck` kiểm receipt/constructor/runtime/config,
admin graph và toàn bộ role/operation history khi bootstrap admin vẫn còn.
Script không tạo temporary operational roles, nên gate này cũng xác nhận cleanup
đã hoàn tất. Sau renounce, `preFundingRoleCheck` kiểm lại trước giao dịch nạp đầu tiên.
Bất kỳ operation bootstrap nào — kể cả đã Cancelled/Done — đều chặn bàn giao.
Sau seed, `roleCheck` lưu final audit; Treasury/funding mỗi ví10.000BUD.

Checker replay canonical receipts và đối chiếu `eth_getLogs` để phát hiện log bị
thiếu; mọi state call ghim cùng H/hash. Operation sau bootstrap chỉ chấp nhận
Governor batch đúng payload/salt/ETA và đối soát trạng thái Timelock ởH. Manifest
chứa provenance/source/compiler/ABI, từng deployment receipt và K=2; K được BE03
thực thi, không nhầm với raw reader BE02. Manifest gắn đúng source commit/build.
Địa chỉ local không dùng làm cấu hình testnet.

Gate lỗi phải giữ bootstrap authority nếu chưa renounce, không funding tiếp.
CLI giữ file output với format `dao-budget-local-deployment-failure-v1`,
statusFAIL, stage/H/hash đã thu được và lý do; đó **không phải manifest thành công**.
Giữ chain/report để điều tra hoặc redeploy Anvil mới; không retry vào chain dở dang.

Xuất bundle bàn giao từ chain **còn chạy**; thư mục đích phải chưa tồn tại:

```bash
node scripts/export_local_handoff.mjs --rpc http://127.0.0.1:8545 \
  --manifest /tmp/dao-local-manifest.json --output /tmp/dao-local-handoff
```

Bundle có manifest, role audit cùng H, ABI compiler đầy đủ cho năm contract,
`handoff.json` và `be02-contracts.json` cho bốn role BE02 hiện hỗ trợ.
Exporter read-only, kiểm source/build/roles trước xuất, không ghi đè thư mục cũ.
TV2 tạo deployment metadata trong DB đã migration rồi dùng `deployment_id`
thực được SQL trả về; bundle không bịa ID. GOV ABI được bàn giao nhưng BE02 chưa
decode GOV. Numeric loopback chỉ dùng cùng máy; thành viên máy khác tự deploy
và tạo bundle mới. Không mở RPC chứa tài khoản Anvil unlocked ra Internet.

Smoke tự sở hữu Anvil loopback tạm, không tác động chain đang chạy:

```bash
node --import tsx scripts/smoke_governance.mjs --output /tmp/sc04-local-smoke.json
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/invariant/GovernanceInvariant.t.sol -vv
forge test --match-path tests/attacks/GovernanceAttacks.t.sol -vvvv
```

Smoke có nhánh F0 chi đúng1.000 BUD, lưu receipt riêng rồi revert nhánh đó trước
campaign attack; không trộn receipt đã revert vào ledger canonical cuối. Campaign
chính kiểm snapshot/deadline/ETA, final roles, quorum/cancel/payload, chi7.000,
thiếu tiền cho6.000, nạp3.000/retry cùng operation và hai proposal trùng request.
BE02 `HttpRpc/readBatch` đọc thật Governor/Timelock/Treasury/BUD; GOV giữ raw receipt,
registry BE02 chưa hỗ trợ GOV. Không có DB projection/API/UI hoặc reorg trong smoke.
Xem [bằng chứng và review SC04](docs/sc04-governor.md) và [matrix nghiệm thu](docs/test-plan.md).

### Governance → PostgreSQL, restart và raw replay

Sau `npm ci` và `forge build`, với Docker daemon có quyền hợp lệ:

```bash
bash scripts/check_governance_database.sh --output /tmp/sc04-storage-smoke.json
```

Runner sở hữu Anvil tạm, container PostgreSQL 18.4 và hai database mới; không dùng
`DATABASE_URL`/`RPC_URL` đang có, dọn container/volume khi kết thúc. Kiểm actual
HttpRpc/scanner/CLI/storage, header và raw/payload đầy đủ, ledger SQL khớp chain
cùng H; cố ý lỗi SQL giữa batch phải rollback; chạy lại qua process mới không trùng;
replay sang DB thứ hai cho cùng semantic digest. Unknown init/role topics giữ raw
và CLI trả 2 đúng hợp đồng, không che thành exit 0.

[Kết quả ngày 22/10](docs/evidence/tv4-20261022/governance-storage.json):
108 header, 61 raw log, 45 decoded, 16 unknown, 0 decode error.
Local dùng native PostgreSQL 18.4 cô lập; chưa chứng minh Docker runner mới chạy
trên máy này hoặc GitHub. Raw replay không thay projection/state rebuild FR15,
checkpoint/resume, K-confirmations, reorg hoặc UI/API E2E.

## Frontend tích hợp — TV3 và nghiệm thu TV4

Cần Node **24.15.0**. Không đặt `VITE_API_BASE_URL` thì frontend đọc trực tiếp
fixture canonical `fixtures/api/`, khóa mọi giao dịch; không giữ bản sao JSON.
Đặt API/deployment từ manifest thật để dùng BE05 và ví theo
[runbook frontend](frontend/README.md#kết-nối-be05-và-deployment-thật).

```bash
npm ci --prefix frontend
npm run lint --prefix frontend
npm run test --prefix frontend
npm run build --prefix frontend
npm run dev --prefix frontend -- --host 127.0.0.1
# Hoặc xem bản production sau build:
npm run preview --prefix frontend -- --host 127.0.0.1
```

Bốn màn hình `/`, `/proposals`, `/proposals/:id`, `/proposals/new`.
Fixture có 45 proposal, exact-ID/filter/phân trang 20/20/5; tiền dùng BigInt.
API mode hỗ trợ connect/switch account/network, propose/vote/cancel/queue/
execute, self-delegate và nạp BUD. Queue/execute giữ payload/description gốc;
receipt bị hủy/thay thao tác không báo thành công, repricing dùng hash đã mine.
Sau receipt, chỉ đọc snapshot đã xuất bản; bấm **Tải dữ liệu mới nhất** khi
indexer đã bắt kịp K xác nhận. Trong dev fixture, `?fixture=error` kiểm retry;
production bỏ qua query này. Root build chỉ build backend.

[Browser evidence 24/10](docs/evidence/tv4-20261024-acceptance/browser.json):
12 kiểm tra, bốn route ×390/1366, luồng A+B700 For chi1000 BUD, cancel/deposit,
wrong network/refusal/HTML-safe, replacement và account-switch regressions.
Provider kiểm chứng forward RPC thật tới Anvil unlocked riêng, **không** phải
MetaMask extension hoặc testnet. Reorg local đã có bằng chứng phục hồi ngày25/10;
không lấy kết quả local làm testnet/release approval.
Xem [hướng dẫn frontend](frontend/README.md) và [checklist TV4](docs/tv4-checklist.md).


## Tài liệu và chuẩn tích hợp

- [Yêu cầu nhóm](docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
- [Phân công TV1](docs/requirements/TV1_Cong_viec_Smart_Contracts.md)
- [Giao tiếp contract và quyết định chờ review](docs/contracts.md)
- [SC02 — Token, constructor và phân bổ cho TV4](docs/sc02-tokens.md)
- [SC03 — Treasury, quyền và bàn giao TV4](docs/sc03-treasury.md)
- [SC04 — Governor, proposal và voting](docs/sc04-governor.md)
- [SC05 — Timelock và role bàn giao TV4](docs/sc05-timelock-roles.md)
- [ABI TimelockController](shared/abi/TimelockController.json)
- [ABI BudgetGovernor](shared/abi/BudgetGovernor.json)
- [ABI Treasury triển khai](shared/abi/Treasury.json)
- [ABI interface Treasury](shared/abi/ITreasury.json)
- [Fixture tổng hợp SC01](fixtures/sc01/disbursement-v1.json)
- [Phân công TV4](docs/TV4_Cong_viec_Testing_Deployment.md)
- [Test matrix và trạng thái nghiệm thu](docs/test-plan.md)
- [Review token SC02 và smoke local](docs/sc02-review.md)
- [Review SC03 độc lập, invariant và receipt smoke](docs/sc03-review.md)
- [Tổng kết công việc TV4 và tác dụng](docs/tv4-work-summary.md)

Fixture SC01 không phải receipt hoặc bằng chứng deployment. Receipt/log thật thuộc SC06.
TV1 phụ trách contract/unit test; TV2 indexer/API; TV3 dashboard/ví;
TV4 deploy/seed/check-roles, CI và attack/invariant/E2E. Mỗi PR cần người khác review.
Không đưa private key hoặc RPC secret vào fixture, tài liệu hay Git.

## BE01 — database, API dự kiến và dữ liệu mẫu

TV3 có thể dùng [fixture API tổng hợp](fixtures/api/README.md) để dựng giao diện
trước khi có API server. Đọc [đặc tả API](docs/api.md),
[thiết kế PostgreSQL](docs/database.md) và [checklist bàn giao](docs/be01-checklist.md).
BE01 chưa triển khai indexer, HTTP server hoặc xử lý reorg thực tế.

Kiểm tra fixture với Node.js (CI pin 24.15.0; chỉ dùng thư viện chuẩn):

```powershell
node scripts/check_be01.mjs
```

Checker đọc trực tiếp JSON và tự chạy regression cho logIndex toàn block,
snapshot theo timestamp block tạo và thứ tự phát log. Metadata offline nằm ở
`fixtures/api/simulation.json`; vẫn có 45 proposal, trang 20/20/5. Dữ liệu mới
dùng revision `fixture-v2`; bỏ cursor v1. Hướng dẫn kiểm tra sinh lại xác định
và các giới hạn đối chiếu hash nằm trong README fixture.

Trên Linux/macOS có Docker, chạy cùng runner SQL với CI:

```bash
bash scripts/check_be01_database.sh
```

Runner tạo container PostgreSQL 18.4 mới, không có mạng hoặc port công khai,
mount SQL read-only, chạy migration rồi constraints với `ON_ERROR_STOP`,
và xóa đúng container/anonymous volume do nó tạo kể cả khi kiểm tra lỗi.
Log in ra terminal (CI lưu artifact). Cần quyền truy cập Docker daemon;
không đổi permission socket hoặc dùng database đang chạy để vượt lỗi môi trường.

Kiểm tra migration và ràng buộc bằng cụm PostgreSQL tạm độc lập trên Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be01_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

Script tạo cụm mới trong thư mục tạm, tự dừng sau kiểm tra và giữ log để xem lại;
không kết nối hoặc xóa database đang có. Đây là ghi chú lịch sử BE01, **không**
mô tả trạng thái schema/API hiện hành trên Dev; xem quick start và docs/api.md.

## BE02 — RPC log reader và decoder

BE02 được tích hợp từ `4c568d6`; [PR #12](https://github.com/SE2026-21-1/dao-budget-simulator/pull/12)
là bàn giao lịch sử cho CLI quét dải block hữu hạn, decode event và lưu raw
log/header. **Chỉ BE02 ban đầu** chưa có projection, HTTP API, checkpoint,
K confirmations, reorg rollback hay rebuild; các chức năng đó đã được triển
khai trong BE03–BE07 trên Dev. BE02 synthetic RPC và smoke SC03 vẫn không
thay kiểm tra full DAO tại H/hash, API/UI hoặc wallet.

Cần Node.js 24 và PostgreSQL (đã kiểm thử với 18.4):

```powershell
npm ci
npm run build
npm run typecheck
npm run test:be02
npm run test:be02:db
node scripts/check_be01.mjs
```

Test database tự tạo và dừng một cluster tạm độc lập. Nếu binaries PostgreSQL
khác vị trí mặc định, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be02_database.ps1 -PostgresBin "C:\Program Files\PostgreSQL\18\bin"
```

Trên Linux/macOS có Docker:

```bash
npm run test:be02:db:linux
```

Runner tạo container PostgreSQL 18.4 mới, cổng host ngẫu nhiên chỉ bind
`127.0.0.1`, không dùng `DATABASE_URL` của người gọi; host chạy test CLI/RPC
và tự xóa container/anonymous volume. Đã chạy thật trên CI; không dùng
database đang có hoặc đổi quyền socket để vượt lỗi môi trường.

Để quét RPC, chuẩn bị database đã migrate cùng metadata deployment khớp cấu hình
theo [hướng dẫn indexer](docs/indexer.md), rồi chạy:

```powershell
$env:RPC_URL = 'http://127.0.0.1:8545'
$env:DATABASE_URL = 'postgresql://be02_demo@127.0.0.1:5432/be02_demo'
npm run indexer -- --config indexer/config/local.json
```

Tạo `local.json` từ [cấu hình mẫu](indexer/config/example.json), thay địa chỉ,
deployment block, ABI version và `deploymentId` bằng metadata đã xác minh.
Địa chỉ trong mẫu là synthetic. CLI không tự nạp `.env`, không tạo deployment;
exit code `2` báo raw log đã lưu nhưng có unknown topic/decode error.
Xem [checklist BE02](docs/be02-checklist.md) để biết kết quả và phần chờ SC06.

## BE03 — checkpoint, confirmations và resume

Luồng BE03 dùng `--sync`, lưu checkpoint raw theo chain/deployment và bộ nguồn
manifest; restart tự kiểm tra hash rồi tiếp tục H+1. `confirmations` là số nguyên
JSON, mặc định `2`: chỉ nhận H ≤ head−K. Cần chạy thêm migration
`database/migrations/002_be03.sql`; giữ nguyên migration BE01.

```powershell
npm run indexer -- --config indexer/config/local.json --sync
npm run test:be03
npm run test:be03:db
```

Chạy lại lệnh `--sync` để resume. Dải BE02 không có cờ vẫn là công cụ quét hữu
hạn; không dùng nó ghi vào deployment đã có checkpoint BE03. Đọc
[quy trình migrate/start/restart và phục hồi decode](docs/be03.md),
[checklist BE03](docs/be03-checklist.md) và
[bằng chứng tích hợp mới](docs/evidence/be03-integration-20261024/report.md).
Lịch sử BLOCKED giữ trong checklist. Tích hợp raw/checkpoint PASS tại H=32,
head=34; 16 topic quản trị bootstrap ngoài ABI subset vẫn unknown, nên CLI
trả exit 2 / DECODE_INCOMPLETE, không phải decodeComplete=true.

## BE04 — proposal và sổ dòng tiền

BE04 bổ sung projection proposal/vote/operation/transfer/disbursement, đối chiếu
contract tại cùng H và công bố một snapshot nhất quán. Chạy migration
`database/migrations/003_be04.sql` sau 001/002 rồi dùng:

```bash
npm run indexer -- --config indexer/config/local.json --sync-project
# Hoặc tạo lại projection từ raw checkpoint hiện có, không quét lại log:
npm run indexer -- --config indexer/config/local.json --project
npm run test:be04
npm run test:be04:db
# Cần forge build, Anvil và Docker; tự tạo chain/DB local mới:
mkdir -p reports
npm run test:be04:live
```

H/hash/revision của bảng truy vấn lấy từ `projection_checkpoints`, có thể thấp
hơn raw checkpoint khi đối soát chưa thành công. Chỉ BUD Transfer được tính
dòng tiền; BudgetDisbursed nối đúng khoản chi và proposal thực thi. Trạng thái
được cập nhật cả ở block trống, không cần event mới. RPC phải hỗ trợ historical
`eth_call` với EIP-1898 canonical block hash.

Xem [hướng dẫn BE04](docs/be04.md), [checklist](docs/be04-checklist.md),
[SQL truy vấn](database/queries/be04_read_model.sql) và
[evidence baseline](docs/evidence/be04-20261024/report.md). Hai lỗi P2 có
regression trước/sau và live runner chính thức 10/10 phase tại
[báo cáo sửa P2](docs/evidence/be04-p2-fix-20261024/report.md).
HTTP API thuộc BE05, rebuild/compare thuộc BE06, reorg rollback/retry thuộc
BE07 và benchmark thuộc BE08.

## BE05 — HTTP API đọc

API có sáu GET endpoint theo [đặc tả API](docs/api.md). Chạy migration
`database/migrations/004_be05_api.sql` sau 001–003, cấu hình `DATABASE_URL` tới
database BE03/BE04 và đặt secret HMAC ổn định:

```bash
npm ci
export API_CURSOR_SECRET="$(openssl rand -hex 32)"
npm run api
npm run typecheck
npm run build
npm run test:api:db
```

Mặc định server chỉ bind `127.0.0.1:3000`; có thể cấu hình `API_HOST`,
`API_PORT`, `API_SNAPSHOT_TTL_SECONDS` và `API_CORS_ORIGINS`. Snapshot immutable
được lưu riêng để cursor tiếp tục đọc đúng H sau khi BE04 tiến lên; GET đầu tạo
cache chỉ đọc trong các bảng `api_read_*`, không sửa raw/projection/business tables. H lịch sử
chỉ còn phục vụ trong TTL nếu đã được API lưu. API không gọi RPC/indexer/projector
và không gửi transaction. Test database dùng container PostgreSQL 18.4 mới,
port chỉ bind loopback; wrapper từ chối dùng `DATABASE_URL` hiện có. Xem
[hướng dẫn chạy, cursor và ví dụ curl](docs/api.md#7-chạy-api-be05).

## BE06 — rebuild và compare tại H

BE06 dựng database riêng từ verified manifest + RPC ở H cụ thể, rồi compare với
publication BE04 đúng cùng H/hash; target không được là database API đang chạy.
Xem [hướng dẫn vận hành, manifest mẫu và kiểm thử live](docs/be06.md) và
[bằng chứng nghiệm thu](docs/evidence/be06-20261024/summary.md). Reorg/retry tự
động thuộc BE07, benchmark thuộc BE08.

## BE07 recovery và worker

Xem [BE07](docs/be07.md) để áp dụng migration 005, chạy worker polling và nghiệm thu reorg/RPC trên PostgreSQL/Anvil local cô lập. Native acceptance: `npm run test:be07:native`.
