# TV4 — Checklist kiểm thử bảo mật và vận hành

Nguồn yêu cầu: [đặc tả nhóm trên Dev](https://github.com/SE2026-21-1/dao-budget-simulator/blob/Dev/docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md), mục 7–10.
TV4 chịu trách nhiệm chính về invariant/attack/E2E, deploy/seed/demo,
CI, check-roles và tổng hợp evidence. Mỗi thành viên vẫn viết test/tài liệu phần mình.
TV1 review deployment; TV4 review logic chi tiền của TV1. Mỗi PR cần người khác review.

## Trạng thái tích hợp — 27/10/2026

- [x] Đã nhận BE07 `2adcbfa` vào nhánh TV4: migration `005_be07.sql`, worker sync → project, fence publication trước rollback/replay, cursor cũ 409 và API 503 khi recovery. Cửa sổ mặc định **128 block**; ngoài cửa sổ dùng BE06 rebuild trên DB mới. `--watch`/64 block là trạng thái **25/10 trước tích hợp**, không phải hướng dẫn vận hành hiện tại; xem `docs/be07.md` và `README.md`.
- [x] Kiểm tra lại trên worktree hiện tại với Node 24.15.0: `npm run typecheck` exit 0; `npm run test:be07` **15 pass, 0 fail/skip**. Đây là unit/model không dùng PostgreSQL/Anvil, không thay nghiệm thu native.
- [x] BE07 native **sau tích hợp**: `npm run test:be07:native` với Node 24.15.0/PostgreSQL 18.4/Foundry-Anvil 1.8.5 trên cluster riêng; typecheck/build exit 0, **172 unit + 73 DB pass, 0 fail/skip**. Live reorg rollback/replay, API 503/cursor 409, deep fork `rebuild_required`, RPC outage/freshness và BE06 compare `equal` đạt; đã sửa nhãn `scope` sai của report BE07 và chạy lại. [Lệnh, raw evidence `/tmp`, hashes và giới hạn](evidence/tv4-be07-20261027.md). Không trỏ vào database demo hay lấy lượt 25/10 làm bằng chứng này.
- [x] Bằng chứng 25/10 trước tích hợp: 185 Foundry, 165 backend/process, 54 DB/API và 6 frontend tests; native/live/rebuild/recovery, 14 ca Anvil, cursor HMAC canonical, benchmark 100 proposal/1.000 vote với 8.116 request thành công và gitleaks triage. Xem [evidence cuối](evidence/tv4-20261025-final.json) và [tổng kết](tv4-work-summary.md); không gán kết quả này cho BE07 mới.
- [x] Code `fa498d6` đã push với CI push/PR **8/8** đúng revision đó ([metadata](evidence/tv4-20261025-final/publication.json)). Workflow hiện tại khai báo **9 job** (thêm BE07); cần bằng chứng CI theo revision đang nghiệm thu, không lấy CI cũ thay thế.
- [x] Demo 26/10 đã ngừng: ngày 27/10 cả RPC/API/UI cũ không nghe cổng. Đã dựng **Anvil mới và PostgreSQL 18.4 mới**, deploy/audit role lại, áp migrations 001–005, worker BE07 và API/UI từ manifest mới; không tái sử dụng DB/checkpoint cũ. Browser thật tại `http://127.0.0.1:46709/` hiển thị API snapshot H19, quỹ 10.000 BUD; health API `synced`/`ready`, `lagBlocks=0` nhưng **degraded** do 16 unknown topics. Runbook tạm ở `/tmp/dao-tv4-demo-20261027-uNp9gL/README-demo.md` đã không còn khi kiểm lại; đây là bằng chứng lịch sử, không phải demo đang chạy. Chain Anvil ở RAM, mất chain thì phải deploy và tạo DB mới; đây không phải test ví extension.
- [x] Nhận TV3 `1b4b1ea`/`4ff1a13`/`f3f3bc5` bằng fast-forward từ `origin/feature/tv3-frontend`, không đụng các file TV4 đang sửa. Chromium 1366px ở chế độ fixture hiển thị 45 đề xuất, 7 Active, 7 Executed và khóa giao dịch; trang danh sách tại 390px không tràn ngang (`scrollWidth=clientWidth=390`). Không có ví extension trong phiên này; khi dùng cấu hình API local đã dừng, UI hiển thị lỗi kết nối thay vì lùi về fixture. Cần CI đúng revision sau khi công bố.
- [ ] Peer review TV1/TV2/TV3, testnet với network/RPC/signer/gas đã chốt, ví extension thật và clone trên máy thành viên khác; không tự approve/merge hay coi local/CI là các gate này.

Các mục 24/10 bên dưới là lịch sử trước BE07, kể cả lỗi reorg đã ghi **KHÔNG ĐẠT**.
Không sửa bằng chứng cũ để thay thất bại bằng lượt PASS mới.

## Lịch sử nghiệm thu — 24/10/2026

Mục ngày 21–23/10 bên dưới là lịch sử theo source commit, không phải mô tả
nhánh tích hợp hiện tại. [Báo cáo và giới hạn](evidence/tv4-20261024-acceptance/report.md)
là căn cứ mới; local PASS không tự thành release/peer approval.

- [x] Merge Dev1451779, candidate BE05/BE06c41a9ab và wallet TV3 9f4d57a; giữ phần TV4, không tự merge PR upstream.
- [x] `.nvmrc`24.15.0; native PostgreSQL18.4 runner có isolation, logs/source hashes và cleanup, không cần Docker/sudo.
- [x] Foundry147/147, fuzz256 và invariant100×50 seed0x20261021; backend64+22+27+5,51 real-DB tests,8process tests và6frontend behavior tests PASS.
- [x] BE03 K/checkpoint/crash trước/sau COMMIT/redecode, BE04 atomic publication, BE05 API và hai BE06 rebuild cùng H67/hash PASS.
- [x] TC12 bổ sung đúng tám proposal H49/t0+1000 và S/S+1/D/D+1/E−1/E; từng cặp DB mới, normalized/chain compare equal và HTTP API cùng H, Pending quorum=null, ledger9000/10000/1000. [Evidence](evidence/tv4-20261024-acceptance/tc12-complete/report.json).
- [x] Clone sạch candidate d2617d0 cùng máy, không overlay/source cache;330tests/build/smoke/native `--benchmark` PASS. [Report](evidence/tv4-20261024-acceptance/clean/report.json); không thay máy thành viên khác.
- [x] Gitleaks8.30.1 quét49commit; giữ raw exit1/283finding, triage public SHA/address/placeholder,0credential được xác nhận; không allowlist/suppress. [Triage](evidence/tv4-20261024-acceptance/gitleaks-triage.json).
- [x] Benchmark NFR02 local:100 proposal/1000 vote chain thật,10client/60s,8133success/0error,p95133,652ms. Không thay AD-064753 user hoặc benchmark testnet.
- [x] Browser EIP-1193 local:12checks PASS,4route×390/1366; A+B700For chi1000BUD, creator cancel, deposit, HTML-safe/network/refusal và receipt/account-switch regression.
- [x] Sửa TS1294, replacement receipts, stale wallet refresh, status mất khi reload, label nguồn API, mobile table containment và lỗi mạng tiếng Việt; không suppress warning.
- [x] SIGTERM native runner trả143, stop cluster/đóng port/xóa temp, không báo PASS khi ngắt.
- [x] Reorg thật đã được kiểm tra và ghi **KHÔNG ĐẠT**: ingestion exit1 hash mismatch/DB nguyên vẹn, nhưng API vẫn200 với hash orphan. Không đánh dấu TC11 PASS.
- [ ] TV2 BE07: rollback/replay, hash window, revision/cursor invalidation và RPC retry/backoff; production freshness/pause-warning-recover.
- [x] Push code/evidence24f576e lên `feature/tv4-operation` bằng SSH agent, không đổi origin; [CI revision mới](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40113995662) đạt8/8job. [Metadata publish/CI/PR21 head](evidence/tv4-20261024-acceptance/publication.json).
- [ ] TV1/TV2/TV3 peer review; [nội dung PR/issue sẵn](tv4-handoff-20261024.md) chưa đăng thành body/comment/request-review mới do chưa có GitHub API credential. SSH push không cấp quyền ghi REST API.
- [ ] Mạng/RPC testnet được chốt, signer an toàn đã có gas, EVM/compiler được TV1 xác nhận; demo Executed/Defeated thời gian thật.
- [ ] Ví extension và thành viên khác chạy lại trên máy khác; không lấy EIP-1193 injected hoặc clone cùng máy thay nghiệm thu này.

## Nền tảng hiện có

- [x] Pin Foundry 1.8.5, compiler và dependency qua submodule/lockfile.
- [x] Có test tương thích calldata/event ABI và fixture SC01 tổng hợp.
- [x] Có lệnh `bash scripts/ci.sh` dùng chung giữa local và CI.
- [x] Có workflow build, format, test và kiểm tra fixture; lưu log/commit.
- [x] Foundry CI baseline thành công tại commit `0344fdb`: [run 39454309744](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39454309744). Đây chưa phải bằng chứng job BE01 mới.
- [ ] Chạy lại từ clone sạch trên máy thành viên khác.

Các mục đã đánh dấu là thành phần đã được thiết lập, không phải bằng chứng
nghiệm thu toàn hệ thống. Fixture SC01 không phải receipt on-chain.
Các thành phần local hiện có gồm governance, BE03–BE06 và wallet/API; xem mục24/10. TimelockController OZ5.4.0 thật đã được kiểm qua deploy/seed/check-roles/smoke. SC05/testnet và full recovery/reorg chưa peer nghiệm thu.

## Bổ sung TV4 ngày 23/10/2026

- [x] Sửa cleanup hai smoke CLI: SIGINT/SIGTERM trả 130/143, dừng/reap Anvil và indexer con; signal lặp không bỏ cleanup, có SIGKILL escalation giới hạn thời gian.
- [x] Evidence được stage và thay thế atomically sau cleanup thành công; interruption không ghi PASS hoặc thay evidence cũ. Temp directory storage tham gia cùng lifecycle.
- [x] Tám process regression dùng Anvil thật đạt; workflow contracts chạy `node --test tests/smoke/interruption.test.mjs` sau build.
- [x] BE02 typecheck/build, 63 RPC/config/decoder/CLI tests và 21 PostgreSQL18.4 storage tests đạt, không skip; frontend lint/build đạt.
- [x] Browser production fixture: phân trang20/20/5, lọc7Executed, không tràn ngang390/1366, production bỏ qua error injection; form vẫn disabled, không coi là wallet E2E.
- [x] Fetch nhánh nhóm: TV2 vẫn `4c568d6` finite raw storage; TV3 `26ecca7` tinh chỉnh thiết kế, chưa có wallet/form giao dịch thật. Không nhập thay đổi thiết kế không liên quan để giả mở khóa E2E.
- [x] GitHub xác nhận PR #5/#12/#13 đã merge vào Dev ngày23/10; [CI baseline877141c](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39726637732) success. Các ghi chú PR open/chưa có CI ở mục ngày22/10 là lịch sử.
- [x] Source bổ sung `228077a`: [CI push39899337940](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39899337940) cả4job success, gồm process interruption và governance→Docker PostgreSQL acceptance; [metadata](evidence/tv4-20261023/ci-source.json). [PR #21](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21) đã request `nvdungmim`/`daongocuong`, chưa approval/merge.
- [x] Full147Foundry tests đạt; hai ca ngắt trong PostgreSQL mode có real indexer CLI đạt130/143, children reaped, RPC đóng, temp files được dọn và prior evidence không đổi.
- [x] Clone sạch đúng commit `228077a` bằng `--no-local --recurse-submodules`, không overlay source/copy node_modules/out/cache; cài mới dependency,147Foundry/8process/63backend tests,frontend lint/build và governance smoke thực đạt. [Provenance](evidence/tv4-20261023/clean-clone.json). Cùng máy và compiler global đã có; chưa thay kiểm chứng máy thành viên khác.
- [ ] Peer review bản bổ sung23/10; merge trước đây không thay review thay đổi mới.

### Cập nhật bàn giao nhóm sau yêu cầu đồng bộ commit

- [x] Merge `origin/Dev` tại `ee2b739`; không có thay đổi nội dung, ghi nhận lịch sử PR đã merge.
- [x] Các head TV1 SC01–SC04 và TV2 BE01/BE02 đều là ancestor của TV4; TV1 `f57fcfd`, TV2 `4c568d6` đã được tích hợp, không có contract/backend commit mới để bỏ sót.
- [x] Cherry-pick có attribution TV3 `26ecca7` thành `9322547`: dashboard/sidebar/charts/compact BUD. Giữ canonical fixtures, loading/retry, skip-link/focus target và mobile wrapping; không đưa JSON copy/dead assets trở lại.
- [x] Lint/build/BE01 checker đạt; browser4route×390/1366 không overflow, metrics45/7/7, raw amount2871875000000000000015, precision tooltip/detail, pagination20/20/5 và error/recovery đạt. Sửa skip-link bị sticky header che, xác nhận keyboard Enter focus main-content.
- [ ] Wallet/API/E2E, checkpoint/reorg/state rebuild và testnet vẫn theo #18/#19/#20; cập nhật thiết kế không thay các bàn giao này.

[Source hashes, commit map, browser và screenshot](evidence/tv4-20261023/team-update/verification.json).


Regression contract mới trong `tests/attacks/GovernanceAttacks.t.sol` bổ sung
transfer/delegate/approved transferFrom đúng timestamp snapshotS; negative role
controls với operation hợp lệ và exact AccessControl error; ETA−1/ETA; hủy Pending
không tiêu thụ request; cấm hủy Queued sau thiếu tiền rồi retry cùng operation.
Kết quả, source hashes và phạm vi xem [evidence23/10](evidence/tv4-20261023/verification.json).

Lệnh kiểm cleanup sau `npm ci`/`forge build`, trên Node24.15.0:

```bash
node --test tests/smoke/interruption.test.mjs
```

Điều kiện còn thiếu được giao cụ thể:
[TV2 checkpoint/reorg/API/rebuild #18](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18),
[TV3 wallet/form/E2E #19](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19),
[TV1/TV4 testnet, peer review và máy khác #20](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20).
Chưa có mạng/RPC testnet được chốt hoặc funded signer; không đưa secret lên
GitHub, không tự phát giao dịch hoặc tự approval. QA07/QA08/QA10 toàn bộ vẫn mở.


## Bổ sung TV4 ngày 22/10/2026

- [x] Nhập frontend từ `47f91d50b7a9104c027dbf05e7a862ddb69d31d0`, không tự nhận phần UI nguồn là của TV4. Dùng fixture BE01 canonical, bỏ JSON copy/template dead assets; sửa loading theo request và mobile amount wrapping, thêm skip-link.
- [x] Node24.15.0: frontend lint không warning/error; `tsc -b && vite build` đạt. Workflow có job frontend và artifacts, contracts chuyển sang smoke PostgreSQL thật; **chưa push/chạy workflow mới trên GitHub**.
- [x] [11 scenario browser thật](evidence/tv4-20261022/frontend-browser.json): 20/20/5, exact ID/filter/empty/detail precision, loading/error/retry, production không bật injection, not-found và form disabled; bốn màn hình 390px/1366px không tràn ngang, Tab/Enter/skip-link/native select.
- [x] [Raw governance PostgreSQL](evidence/tv4-20261022/governance-storage.json): canonical H109,108 headers/61 raw/45 decoded/16 unknown/0 decode error, SQL raw/payload/RPC/header đúng reader; ledger13.000in/out và supply/balances khớp chain cùng H.
- [x] SQL trigger lỗi ở header thứ hai trong batch mới: rollback toàn batch, prior batches giữ nguyên. CLI finite-range tiếp nối, scanner/CLI process mới chạy lại không trùng; CLI exit2 đúng unknown init topics. Replay vào DB mới cho cùng semantic digest.
- [x] Clone baseline `5fbf615` bằng `--no-local --recurse-submodules`, overlay candidate source; không copy node_modules/out/cache. Cài lại dependency, frontend lint/build và Foundry142/142 đạt, fuzz256/invariant100×50 seed0x20261021. Đây là **candidate chưa commit trên cùng máy**, không phải clone remote bản mới hay máy thành viên khác.
- [x] BE02 typecheck/build63/63, PostgreSQL18.4 native cô lập21/21 và migration/SQL checks đạt,0skip. Local native không chứng minh Docker runner mới; không đổi quyền daemon.
- [x] Deploy CLI trên clone candidate, check-roles từ working tree chính exit0; [bundle thật](evidence/tv4-20261022/local-handoff/handoff.json) có manifest/audit/5ABI/4BE02contract descriptors; exporter từ chối ghi đè bundle có sẵn, nội dung không đổi.

[Tổng hợp môi trường/source hashes/stdout](evidence/tv4-20261022/verification.json).
HEAD `5fbf615` là base của candidate chưa commit, không đại diện toàn bộ code mới;
hash từng source trong evidence ràng buộc bản đã chạy. Manifest bàn giao H19 thuộc
chain riêng, không dùng receipt smoke đã dừng hoặc nhánh demo đã reset làm canonical.

### Bàn giao và điều kiện còn thiếu

| Bên nhận | Đã sẵn sàng | Điều kiện để TV4 nghiệm thu tiếp |
|---|---|---|
| TV1 | Manifest, full compiler ABI, role audit và attack/invariant evidence | Peer review deployment/SC05, xác nhận cấu hình; không tự approval |
| TV2 | `be02-contracts.json`, deployment blocks/ABI, raw SQL/restart/replay evidence | Tạo metadata và dùng deployment_id SQL thật; bàn giao checkpoint/K/reorg/projections/API và full rebuild |
| TV3 | Frontend fixture chạy được, ABI/chain/accounts, browser evidence | Ví/form/giao dịch thật, receipt/error/network handling |
| Cả nhóm | Clone candidate local tái lập và script local handoff | Máy thành viên khác chạy lại; peer approval; CI cho revision mới sau commit/push |
| Testnet | Thông số/roles đã kiểm local | Chốt mạng/RPC/faucet, signer được cấp test token/gas và EVM/compiler tương thích trước khi ký/gửi |

Để tạo lại bundle từ Anvil mới còn chạy: dùng `deploy_local.mjs`, `check_roles.mjs`,
`export_local_handoff.mjs` theo README. Bundle chỉ numeric loopback; máy khác phải
deploy/regenerate, không mở tài khoản Anvil unlocked ra Internet. Export không bịa
deployment ID hoặc tuyên bố backend đã enforce K=2.

Chưa đóng QA07/QA08/QA10 toàn bộ: raw replay không là FR15 proposal/state rebuild;
finite-range process restart không là checkpoint/resume/reorg TC11; browser fixture
không là TC13 wallet hoặc UI→chain→API E2E. PR #5 vẫn open và đã request
`nvdungmim`/`daongocuong` theo API GitHub ngày22/10; chưa có thao tác commit/push,
approval/merge hoặc transaction testnet trong đợt này.


## SC04 mở khóa QA02–QA03/QA05–QA06 — 21/10/2026

- [x] Tích hợp TV1 `f57fcfd` bằng `70c2b33`; mở [PR #13 SC04](https://github.com/SE2026-21-1/dao-budget-simulator/pull/13), request TV1/TV2 review; không tự approval/merge.
- [x] [QA02 #14](https://github.com/SE2026-21-1/dao-budget-simulator/issues/14): deploy local thực, grant final roles/renounce bootstrap trước funding, seed và historical delegation, manifest/compiler/ABI/source/receipt.
- [x] [QA03 #15](https://github.com/SE2026-21-1/dao-budget-simulator/issues/15): checker cùngH từ creation/runtime/token links/config/full grant-revoke history; [8 probes CLI](evidence/sc04-role-audit.json) đúng exit0/sai exit1. Extra spender thật ngoài demo mapping bị chặn trước funding.
- [x] Smoke final-role EOA→Governor→Timelock→Treasury: [QA02 demo5 receipt chi1000 và campaign105receipt](evidence/sc04-local-smoke.json), snapshot/delay/cancel/whitelist/replay/budget race/retry. Nhánh demo được reset, không trộn ledger.
- [x] [QA05 #16](https://github.com/SE2026-21-1/dao-budget-simulator/issues/16): regression concurrent khác snapshot/shared request/budget retry; smoke có exact time/error/receipt. Coverage cục bộ theo [matrix](test-plan.md), không phải mọi TC đã PASS.
- [x] [QA06 #17](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17):4 governance invariant checks, campaign100×50 seed0x20261021; ghost oracle độc lập và execute trong sequence. [Review/scope](sc04-governor.md#qa05qa06-oracle-và-giới-hạn), [stdout](evidence/tv4-sc04-foundry-20261021.txt).
- [x] BE02 HttpRpc/readBatch đọc chain thật:108 header,61 raw/45decoded/16unknown/0decode errors tạiH109;0 discarded. Không DB/projection/API/reorg, GOV raw-only.
- [ ] Peer review/approval và merge; đầy đủ TC variants/whole-system INV/E2E, testnet.

`scripts/deploy_local.mjs` để chain do người dùng mở tiếp tục chạy; `scripts/smoke_governance.mjs` tự sở hữu và dừng chain tạm. Cả hai không dùng private key hay RPC testnet. Hướng dẫn chạy ở README; manifest cũ ràng buộc source commit/build ghi kèm.

## Tiến độ tích hợp ngày 21/10/2026

- [x] Tích hợp `Dev` (`1f40748`) và BE02 (`4c568d6`) bằng `496a2f3`/`5cb8b7e`; giữ checker ABI chuẩn TV4.
- [x] QA03 Treasury: [review SC03](sc03-review.md), [19 receipt thật](evidence/sc03-local-smoke.json); quyền/chi trùng/thiếu tiền/retry/role transitions và ledger đạt cục bộ.
- [x] Treasury-only stateful oracle: 3 invariant checks, campaign100×50, seed `0x20261021`; regression nhiều role epochs. Không thay whole-governance INV01–INV04.
- [x] Local tại `7a0ab33`: Foundry58/58, BE02 unit63/63, PostgreSQL18.4 storage21/21, không skip; typecheck/build và BE01 fixture đạt. [Evidence local](evidence/tv4-local-verification-20261021.json).
- [x] CI contracts+live smoke, BE01, BE02 đều thành công: [push](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342), [PR](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539695150). [Docker log](evidence/be02-ci-7a0ab33.txt) xác nhận loopback và cleanup thành công; chưa fault-inject failure/interruption của runner.
- [x] Mở [PR #12 BE02](https://github.com/SE2026-21-1/dao-budget-simulator/pull/12), request TV2/TV1 review; không tự approval/merge vào Dev.
- [ ] Peer approval/merge PR #5 và #12. Yêu cầu review không phải approval.

Local SQL dùng cluster native tạm mới (Node24.15.0/PostgreSQL18.4), đã dừng/xóa; không vượt quyền Docker. Docker runner được kiểm chứng riêng trên CI. Phần ngày 20/10 dưới đây là lịch sử, không phải trạng thái tích hợp hiện tại.


## Tiến độ tích hợp ngày 20/10/2026

- QA01: xử lý conflict với `Dev`, giữ tài liệu SC01/BE01; bỏ checker/selector test
  cũ bị phục hồi trùng. CI thêm Node 24.15.0 và PostgreSQL 18.4 cô lập.
  [Issue #6](https://github.com/SE2026-21-1/dao-budget-simulator/issues/6)
  giữ các mục review/clone sạch chưa hoàn tất.
- QA04: [test matrix](test-plan.md) ánh xạ FR/BR/NFR/TC/INV, owner, setup/reset,
  kỳ vọng và blocker; [issue #7](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7).
  Ma trận không phải kết quả nghiệm thu các test còn thiếu.
- QA03 (phần token): [review SC02](sc02-review.md), 24 token tests và smoke deploy
  Anvil đã đạt; [evidence token-only](evidence/sc02-local-smoke.json).
  [TV1 bàn giao PR ở #8](https://github.com/SE2026-21-1/dao-budget-simulator/issues/8).
  Chưa có full role checker hoặc kiểm thử chi tiền qua Governor/Treasury.
- TV3 nhận [issue #9](https://github.com/SE2026-21-1/dao-budget-simulator/issues/9)
  dùng fixture BE01 chung; chưa coi giao diện mock là E2E.

Kiểm tra local sau tích hợp: `FOUNDRY_PROFILE=ci bash scripts/ci.sh` đạt 2 tests
(256 fuzz runs) và ABI/fixture SC01; `node scripts/check_be01.mjs` đạt 123 JSON,
45 proposal, trang 20/20/5, timeline và regression. SC02 chạy ở detached
commit `9a890a2`, chưa merge token vào TV4.
Máy local không có quyền Docker và sudo yêu cầu mật khẩu, nên không có bằng chứng
SQL local từ runner Bash mới. **CI đã chạy thật thành công** ở commit `b2c32a0`:
[run 39457911277](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39457911277),
cả Foundry và BE01 đều success; Node `v24.15.0`, PostgreSQL 18.4, migration
COMMIT, SQL constraints báo `BE01 checks passed` rồi ROLLBACK.
[Stdout SQL nguyên bản](evidence/be01-ci-b2c32a0.txt) được lưu từ artifact
`tv4-be01-b2c32a06be39cfacb749cb9d305e462d8929bce0`.
Workflow tiếp theo pin các Actions dùng Node24 để xử lý cảnh báo runtime Node20
từ run này; không đặt biến môi trường để che cảnh báo.
Fixture/SQL success không phải worker/API/E2E hoặc NFR07 hoàn tất. Bằng chứng
PostgreSQL Windows trước đó của TV2 được giữ riêng tại `be01-checklist.md`.

## Thứ tự thực hiện

1. TV1/TV2 peer review PR #13/#5 và deploy/check-roles, đối chiếu bàn giao SC05; local không còn chờ Governor/Timelock giả.
2. TV2/TV3 dùng manifest của **Anvil local còn chạy**, không dùng địa chỉ smoke đã dừng hoặc receipt nhánh reset làm canonical.
3. Rà đủ actor/state/transferFrom/zero-request/reset variants và bounded oracle; không nâng scope vượt evidence.
4. TV2 checkpoint/K-confirmations/reorg/projections/API/rebuild; TV3 wallet/form/shared fixtures, rồi TV4 E2E/same-H.
5. Chốt mạng testnet/RPC/faucet, xác minh Osaka/compiler, TV1 review deployment trước phát giao dịch thật.

## Deploy, cấu hình và demo (NFR05, NFR08)

- [x] Script deploy/seed **local** và manifest chainId/từng address/block/tx, ABI/compiler/source/config/commit; [README](../README.md#deploy-audit-role-và-demo-governance-local--tv4).
- [ ] Script/deployment/manifest **testnet**; không coi local thành testnet.
- [x] GOV1000: A/B/C/D400/300/200/100, self-delegate và checkpoint đã quá khứ.
- [x] BUD20000: Treasury10000/funding10000 sau init,18 decimals.
- [x] Threshold50,quorum20%,delay60/period300/minDelay120,timestamp clock.
- [x] Checker đúng exit0/sai exit1, read-only cùngH và full role history.
- [x] Treasury admin/spender chỉ Timelock.
- [x] Timelock proposer/executor/canceller chỉ Governor, zero executor không mở.
- [x] Admin Timelock self, deployer bỏ bootstrap cả Treasury/Timelock **trước funding**.
- [x] `.env.example` BE02 hiện có; deploy/checker dùng `--rpc` explicit, không nạp `.env` tự động hoặc nhận key.
- [ ] Xác nhận testnet hỗ trợ EVM/compiler đã chọn trước deployment.
- [x] Local tự tăng thời gian và QA02 demo1000 BUD qua Governor thật; chưa dùng time-warp trên testnet.
- [ ] Testnet có ít nhất một proposal giải ngân và một proposal thất bại.

## Acceptance và attack scenarios

Các TC dưới đây chưa nghiệm thu đầy đủ. E-SC04-L/E-SC04-ROLE/E-GOV-INV trong [matrix](test-plan.md) đã mở khóa bằng chứng contract/roles/reader thật, không thay đầy đủ variants hoặc Governor/UI/API end-to-end. E-SC03-C/E-TV4-21 giữ scope Treasury-only lịch sử.

| Mã | Điều cần kiểm tra | Phối hợp |
| --- | --- | --- |
| TC01 | A+B 700 For, chi 1.000 BUD, treasury còn 9.000 | TV1/TV3 |
| TC02–03 | Thiếu quorum, hòa hoặc thua thì không queue/execute | TV1 |
| TC04 | Vote hai lần; đúng tại snapshot, sau snapshot, deadline, sau deadline | TV1 |
| TC05 | Chuyển token/delegate sau snapshot không tăng phiếu proposal | TV1 |
| TC06 | Ví thường gọi Treasury/Timelock trực tiếp bị chặn | TV1 |
| TC07 | Execute trước ETA bị chặn, tại ETA được phép; execute lặp bị chặn | TV1 |
| TC08 | Chặn target/selector/native value/recipient/amount sai và proposal cấp role | TV1 |
| TC09 | Hai khoản chi tranh số dư; thiếu quỹ revert toàn bộ, nạp lại rồi retry được | TV1/TV2 |
| TC10 | Hai proposal cùng requestId chỉ chi thành công một lần | TV1 |
| TC11 | Dừng giữa batch/reorg, resume không mất hoặc trùng log | TV2 |
| TC12 / FR15 | Rebuild DB trống tại cùng H, so proposal/vote/chi/số dư/state | TV2 |
| TC13 | Sai mạng, từ chối ký, mô tả HTML, trạng thái receipt/UI đúng | TV3 |
| TC14 | Deployer không lấy lại quyền/chi tiền; chỉ creator hủy Pending | TV1 |

- [ ] TC01–TC14 có kết quả và evidence.
- [ ] TC05–TC08, TC10, TC14 có attack scenario: mục tiêu, thiết lập,
  lệnh chạy, kỳ vọng, trace/receipt và giải thích cơ chế chặn.
- [ ] E2E qua UI → ví → chain → indexer/API → UI; dữ liệu khớp cùng block.

## Bất biến (INV01–04)

- [ ] INV01: mỗi requestId chi thành công tối đa một lần.
- [ ] INV02: chi thành công chỉ qua proposal hợp lệ và Timelock hết delay.
- [ ] INV03: số dư BUD treasury bằng tổng vào trừ tổng ra.
- [ ] INV04: thay đổi token sau snapshot không làm tổng trọng số phiếu vượt tổng cung tại snapshot.
- [x] Có campaign Treasury-only100×50 và oracle độc lập; không đánh dấu các INV toàn hệ thống phía trên đạt.
- [x] Handler governance CI tối thiểu100chuỗi×50,4properties nhóm1campaign; Treasury campaign riêng.
- [x] Handler đạt execute thành công trong sequence, có attempts/success/revert/state counters và seed; counters stdout là chuỗi cuối, không tự nhận aggregate100runs.

## CI và evidence cuối kỳ

- [x] BE02 CI: lockfile/typecheck/build/RPC-decoder/storage-CLI PostgreSQL thật, có artifact SHA/logs.
- [x] Có job frontend lint/typecheck/build và live governance raw PostgreSQL acceptance trong workflow; kết quả local ngày22/10 ở trên.
- [x] Workflow bổ sung chạy thành công trên GitHub tại source `228077a`; không suy ra E2E hoặc NFR07 toàn hệ thống.
- [ ] E2E đầy đủ sau bàn giao TV2/TV3; nghiệm thu NFR07 toàn hệ thống.
- [ ] Mọi yêu cầu an toàn có test âm; không còn lỗi mở cho phép chi sai/bỏ qua quyền.
- [ ] Xác minh NFR02 hiệu năng và NFR03 độ mới với TV2; ghi máy, dữ liệu và lệnh đo.
- [ ] Kiểm tra retry/backoff, checkpoint và phục hồi NFR04 với TV2.
- [x] Kiểm tra UI fixture 390px/1366px và bàn phím trên Chromium150; không thay ví/giao dịch TC13 hoặc chứng nhận accessibility đa trình duyệt.
- [x] Clone sạch cùng máy chạy được local demo và bộ test tại source `228077a`; CI source xanh. Máy thành viên khác vẫn theo #20.

Mẫu ghi một bằng chứng (không chứa bí mật):

```text
Yêu cầu/TC/INV:
Commit SHA:
Môi trường và phiên bản:
Lệnh chạy / GitHub Actions run URL:
Kết quả mong đợi:
Kết quả thực tế:
Seed, runs/depth (nếu có):
ChainId, block đối chiếu, txHash (nếu có):
Trace/log/receipt:
Người chạy / người review:
```

Chỉ đánh dấu nghiệm thu khi có kết quả thực tế gắn commit; CI tương thích ABI
hiện tại không thay thế bộ kiểm thử bảo mật và nghiệm thu ở trên.
