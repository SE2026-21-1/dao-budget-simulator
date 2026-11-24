# TV4 — submission identity, nghiệm thu và release gates, 24/11/2026

## Revision và phạm vi

- Fix: [`033e63d3d70408ee87563e8dc809f67fbde67c72`](https://github.com/SE2026-21-1/dao-budget-simulator/commit/033e63d3d70408ee87563e8dc809f67fbde67c72), tiếp nối PR [#60](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60) tại `9e121c51c2091b3b544cc74acc558d9eb8c31076`; target `Dev` tại `6766e5ee2d8c466542687cbeb09677c4d11e5463`. Default branch GitHub là `main`, không phải `Dev`.
- Các lệnh local bên dưới chạy **trước commit**, trên base `9e121c5` cộng đúng ba file có fingerprint dưới đây; không gọi đó là chạy lại trên SHA sau commit. CI của HEAD cuối phải kiểm riêng qua PR60; CI xanh của `9e121c5` không chứng minh delta này.
- Chỉ đổi helper deployment chung, CLI, regression và tài liệu TV4. Không đổi contract, ABI, frontend/indexer product, migration, lockfile, K2, timeout, nonce/gas/role guards. Không nhập/review/comment/merge nội dung personal, individual hoặc các PR hỗn hợp #21/#55. Metadata đường dẫn/mô tả chỉ dùng để loại trừ.
- Working tree ban đầu sạch. Giữ Git author đã cấu hình của Phan Thanh Dũng; GitHub xác thực `dung0611`, quyền push/triage/read, không admin/maintain. Không có AGENTS.md/CONTRIBUTING gốc; dùng README, phân công TV4 và workflow chung. Dev rules API trả `[]`; protection API trả404, **không suy ra được quyền bypass**. Quy tắc chung yêu cầu peer review, nên tiếp tục PR60, không push thẳng Dev.

Fingerprint source đã kiểm:

```text
65ece5976bc029ed237da7a758fd1fcce24d00ca13a66a35248d00418e2aff23  scripts/deploy_sepolia.mjs
8324abad84f0d2df35459f865a10049c65183fc01f93ccfd5bf12c71c3e64fe0  scripts/governance_sepolia.mjs
47b228a1f61a78a0e15e63c6cb1bf2650c4d1c5f56f037f56f09fee2f8a2416d  tests/smoke/sepolia.test.mjs
```

## Finding đã tái hiện và nguyên nhân

**Medium — submission response chọn nhầm transaction identity.** Vị trí trước sửa: `scripts/deploy_sepolia.mjs:27`, truyền tới `scripts/governance_sepolia.mjs:171–178`. [TV1 finding](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#discussion_r4667841738) có full-campaign counterexample; [mốc tái hiện TV4](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#issuecomment-7123684855).

Điều kiện: RPC gửi/mines funding thật nhưng trả hash delegation trước đó. Các lookup receipt/header/audit vẫn genuine. Receipt binding ở `waitConfirmed` kiểm đúng hash đầu vào, nhưng đầu vào chưa được ràng buộc với signed raw bytes; có thể ghi funding `CONFIRMED_K2` và manifest `DEPLOYED_K2` trong khi funding thật có0descendants. Đây là lỗi tái hiện trên Anvil, **không phải cáo buộc public provider đã xảy ra lỗi**.

Regression mới, trước sửa:

```text
node --test --test-name-pattern='funding submission cannot borrow' tests/smoke/sepolia.test.mjs
pass 0 / fail 1 / skipped 0; exit 1
AssertionError [ERR_ASSERTION]: Missing expected rejection.
```

Bản sửa tính `keccak256(signedRaw)` từ đúng byte đã ký, persist/fsync hash local với trạng thái `SIGNED` trước `eth_sendRawTransaction`, chỉ nhận response32bytes cùng identity (không phân biệt hoa/thường). Response sai/null/mất: fail-stop, giữ identity local, không lookup receipt theo hash lạ hoặc resend. Raw signed bytes/keystore/password không được đưa vào journal/evidence. `SIGNED` sau lỗi **có thể đã broadcast**, không được hiểu là an toàn để chạy lại. [Runbook reconciliation](../sepolia-deployment.md).

## Ma trận nghiệm thu delta — NFR08 / QA02–03 / #20

| Kịch bản / dữ liệu | Kỳ vọng | Thực tế sau sửa / bằng chứng | Trạng thái |
|---|---|---|---|
| Signed transaction hợp lệ; response hash uppercase | Cùng keccak identity, trả lowercase, gửi một lần | `signed submission ... valid uppercase hash`; full17tx constructors/bootstrap/delegation/funding audit thành công | PASS local |
| Hash thuộc transaction khác; hash null | Dừng, giữ expected identity trước broadcast, không resend | `different transaction`, `malformed hash` | PASS local |
| Signed payload đổi value0→1 nhưng response còn hash payload cũ | Từ chối hash stale; hash tính từ exact raw mới | `changed signed payload` | PASS local |
| RPC mất response sau khả năng đã nhận send | Giữ hash reconcile, đúng một lần send | `response lost` | PASS local |
| Journal không persist được identity | Không broadcast | `journal failure`, send count0 | PASS local |
| Full campaign: chỉ response funding bị đổi thành delegation cóK2; funding thật0descendants | Không DEPLOYED_K2/receipt funding; journal trên đĩa có local funding hash trước send, cuối SIGNED/FAIL_STOP; một funding send | `funding submission cannot borrow ...`; signed raw submission thật trên Anvil, disk journal đối chiếu final snapshot, canonical funding/delegation blocks được assert | PASS local |
| Receipt delegation bị trả khi yêu cầu funding và bảy initial/final/block/index/membership negatives | Receipt phải thuộc đúng submitted identity; không ghi K2 sai | Existing `unconfirmed final funding ...` và `K2 rejects inconsistent receipt binding ...` giữ nguyên assertions | PASS local |
| Owner-authorized Sepolia deployment, Executed/Defeated real-time | Đủ SHA/map/custodians/gas/permission/review trước send | Không được cấp quyền, không thực hiện;0Sepolia broadcasts | BLOCKED |

Full-campaign test dùng local Anvil signer để có raw transaction thật, cùng helper submit với CLI; test encrypted-keystore riêng vẫn chạy. Adapter genesis là synthetic và `fork:true` dùng polling local; không gọi đây là Sepolia/fork testnet acceptance. Không normalize description hoặc thay công thức proposalId/descriptionHash/backend hashes: chúng không phải nguyên nhân finding này.

## Kiểm tra thực chạy

Linux x64, Node24.15.0, Foundry1.8.5, artifacts/dependencies sẵn có. Không cài lại hoặc đổi dependency của dự án.

| Lệnh | Kết quả quan sát |
|---|---|
| `node --test tests/smoke/bootstrap.test.mjs tests/smoke/dependency-provenance.test.mjs tests/smoke/sepolia.test.mjs` | 44PASS/0FAIL/0SKIP, exit0;119,81s. Trong đó28Sepolia và16bootstrap/provenance; không cộng thành44Sepolia. |
| `npm run typecheck`; `npm run build` | Cả hai exit0 |
| `npm run test:be08` | 14PASS/0FAIL/0SKIP, exit0 |
| `node --test scripts/cd/release.test.mjs` | 4PASS/0FAIL/0SKIP, exit0 |
| `npm --prefix frontend test` | 127PASS/1SKIP, exit0; live test opt-in thiếu môi trường, không phải live PASS |
| `npm --prefix frontend run lint` | exit0;8warning tại wallet.tsx, không sửa vì ngoài delta |
| `npm --prefix frontend run build` | exit0; cảnh báo chunk>500kB, không warning-free |
| Docker runtime/Compose local mới | Không chạy: `docker info` bị permission denied tại daemon socket; không đổi quyền hoặc dùng DB đang phục vụ. BE07 native bổ sung sau CI được ghi riêng bên dưới. |
| Browser/extension live acceptance mới; full Foundry/SC06/BE08 benchmark local mới | Không chạy lại các campaign đã đủ evidence chỉ để tăng hoạt động; product/contract không đổi. CI PR60 vẫn giữ các gate chung. |

Review toàn bộ diff code được tạo: identity trước send, failure ordering/journal, no-resend, canonical receipt guards và regressions. Đọc diff chung ba file PR61: same-ID lifecycle/backoff/max-attempt assertions vẫn giữ, không sửa lại. Không tạo self-review/approval; formal TV1/TV2/TV3 vẫn là điều kiện merge. Workflow hiện có đã chạy suite Sepolia trong contracts job, nên không cần thêm gate trùng.

## Trạng thái tích hợp và điều kiện phát hành

- **Đã xác minh metadata hiện hành:** #18 backend và #36 browser/live UI đã closed/completed; không mở lại. Kết quả [23/11](tv4-20261123-acceptance.md) vẫn gắn source riêng, không nhận thành lượt chạy24/11.
- **Staging #56:** closed/not_planned, scope server đã withdrawn/retired theo [record23/11](tv4-staging-retirement-20261123.json). Candidate không còn workflow SSH deploy, vẫn giữ GHCR và Compose CI. Lượt này chỉ đọc repo/issue/evidence; không truy cập OpenStack, không tái kiểm inventory live hoặc tái tạo staging.
- **CI:** đã đọc baseline Dev và PR60 `9e121c5` completed/success; final-head CI sau push phải được ghi bằng link run ở PR60, không lấy baseline thay thế. Publish ngoài pushDev bị skip theo policy, không có release mới.
- **Review:** TV1 `nvdungmim` re-review signed-submission/receipt/journal delta; TV2 `daongocuong` giữ request BE08/backend/delivery và #41 same-H reconciliation; TV3 `LangXiTrum2005` giữ request harness/extension/account-switch. Danh tính/phạm vi xác định từ phân công chung, runbook và review threads. Không dismiss/resolve thread thay reviewer. CHANGES_REQUESTED vẫn chặn merge dù local PASS.
- **Còn mở:** #19 account-switch site-authorized A→B; #41 peer acknowledgement same-proposal pipeline; #40 final receiver lifecycle/transport outputs; #42 API-restart receiver; #20 final approved SHA/nine-address map/six custodians/gas budget/explicit broadcast authorization và actual testnet receipts/roles. #7/#44 giữ PARTIAL/NOT READY.
- **Project:** [Project nhóm#1](https://github.com/orgs/SE2026-21-1/projects/1) được nhận diện từ tài liệu chung; tài liệu lịch sử ghi Project#2 đã closed. API hôm nay trả `INSUFFICIENT_SCOPES` vì token chỉ có `repo/read:org/gist`, thiếu `read:project` để đọc và `project` để ghi. Public reader trả404. **Chưa xác minh trạng thái hiện tại hoặc cập nhật Project**, không tự mở rộng OAuth scope. Maintainer có quyền Project cần liên kết PR60/#20/#7/#44 và giữ In review/Blocked theo các gate trên, không Done.

Kịch bản chuẩn bị/thao tác/kỳ vọng và phương án demo lỗi đã cập nhật tại [QA07 — Diễn tập Integration & Release](../qa07-e2e.md#diễn-tập-integration--release--2411). Đây chưa là buổi diễn tập/video nhóm. Không merge/pushDev, promote main, tag, release, provision server hoặc tiêu gas trong lượt này.

## Follow-up CI: clock của harness BE07

HEAD `d2a3dd841c555979820ccacac07072e607265e1c`:
[push45339531142](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45339531142)
success; [PR45339537419](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45339537419)
failure. Hai forced-fallback workflows success:45339531101/45339537553.
Tổng bốn run: **21success/1failure/2publishSKIPPED**, không gọi CI xanh.
Đã đọc actual contract logs của cả push/PR:182Foundry PASS và44bootstrap/
provenance/Sepolia PASS, gồm funding-response regression; BE08/container cũng PASS.

Failure riêng [job138259591612](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45339537419/job/138259591612):
unit và sáu DB suites exit0, `be07-live` exit1 sau `empty Active block`.
Artifact14895207493 được tải và khớp SHA256
`bae364d45299ac13269a5e16340130625b5eef1c6805a0c98e22dee32be753ac`;
`be07-live.json/.txt` chỉ rõ `evm_setNextBlockTimestamp` RPC-32602 tại
`scripts/check_be04_live.mjs:152/359`. Source là PR merge-ref
`c06735c9d6464f10a7a98fce20f94afaf6209981`, empty patch; không nhầm với HEAD.

Nguyên nhân harness: SQL/API phase có thể tốn hơn một giây thật, nhưng các vote
sau phase cố đặt lại đúng snapshot+1. Clock auto-mine mặc định có thể tiến vượt
mốc đó. Bản sửa dùng pattern sẵn có của `benchmark_api.mjs`:
`anvil_setBlockTimestampInterval(0)` **chỉ trên Anvil do runner vừa tạo**, sau deploy
và trước snapshot/campaign. Mỗi transaction có mốc explicit còn assert timestamp
header đúng mốc yêu cầu. Không dùng max(now,requested), bỏ boundary assertion,
tăng timeout hoặc retry lỗi timestamp; không đổi clock của testnet/chain người khác.

Chuẩn bị native local ban đầu chưa chạy scenario vì package PostgreSQL18.4 thiếu
SONAME links/loader path; lần kế thiếu utility `createdb` không được bundle.
Đã dùng thư viện package cùng version, tạo links trong thư mục tạm sở hữu và
khởi tạo DB bằng pg client trên cluster loopback mới; không sửa hệ thống/lockfile,
không dùng database đang phục vụ. Không tính các bước preparation lỗi là test PASS.

Sau sửa đã thực chạy **một campaign BE07 native** trên PostgreSQL18.4/Anvil1.8.5,
Node24.15.0, base`d2a3dd8`+clock patch SHA256
`b4ce4a5ffab32729ef2a112b596bc14ad44f7f894317a653f4575328c208f561`:

```sh
BE04_LIVE_ISOLATED=1 \
BE04_LIVE_DATABASE_URL=postgresql://be04_test@127.0.0.1:33727/be04_live \
BE07_TEST_ISOLATED=1 \
BE07_COMPARE_DATABASE_URL=postgresql://be04_test@127.0.0.1:33727/be07_compare \
BE07_BASELINE_ROOT='' node --import tsx scripts/check_be04_live.mjs \
  --output /tmp/tv4-be07-clock-evidence.EUHd7p/be07-live.json --be07
```

**PASS/exit0,67,83s;10phases**, exact snapshot/deadline/ETA và mỗi explicit
transaction header được assert; underfunded retry giữ nguyên.
`report.be07.status=PASS`: shallow reorg cùng H67/head69, orphan removal,
recovery503/cursor409, ba replay cycles, BE06 same-H compare,31s RPC outage/recovery
và deep-fork rebuild-required đã chạy. Canonical recovery hash
`0xcf82ea9de901ae34cf3abbb4eb5f092a8d17ecb9d75391dd9103ee0d670bd7bb`.
Cluster dùng một lần đã stop (`server stopped`); runtime/cluster tạm do lượt này
tạo đã xóa, raw report/log giữ trong output trên. Đây không phải Docker/browser/
testnet acceptance. PR CI mới sau clock fix vẫn phải chạy, không rerun mù run lỗi cũ.
