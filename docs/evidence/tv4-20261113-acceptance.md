# TV4 — nghiệm thu mới và chuẩn bị Sepolia, 13/11/2026

Người chạy: Phan Thanh Dũng (`dung0611`). Không merge, self-approve, auto-merge, đóng gate release hoặc broadcast Sepolia. Worktree cá nhân VT-064 ban đầu (33 modified/7 untracked) được giữ nguyên; mọi thay đổi ở worktree TV4 riêng. Tài khoản có push/triage, không admin. Chỉ cập nhật Project nhóm #1 đang mở; Project TV4 #2 đã đóng.

## 1. Source và attribution

| Lượt mới | Source thực chạy | Kết quả/phạm vi |
|---|---|---|
| Baseline thêm instrumentation, chưa tối ưu reconciliation | `312104f8dc7b2e182c2210e017d47184f17feacc` | Campaign đầy đủ PASS nhưng freshness sát ngưỡng; không lặp lại được timeout lịch sử trong lượt này |
| Full native cố định source, patch rỗng | `b7ff654c15adeb3095dd187c04509fd1e60c3331` | Typecheck/build, 188 unit, 76 DB/API, 202 Foundry, SQL, live recovery/rebuild, benchmark/outage và cleanup PASS |
| Frontend + SC06 mới | `da2237fed63eee89341881b076a9551022e31e8f` | 102 frontend PASS/0 skip với API live và SC06 live; lint8warnings/exit0, typecheck/build exit0; SC06 32/32 PASS |
| Browser Swiss UI → receipt → worker → API → UI | `2b9100bca7ebd3d64cceba8316b3f14f15957d28` | Runtime đã ghép TV3; Executed/Defeated/Canceled, H/hash/revision, guards và layout local. Các diff đang chuẩn bị khi chạy chỉ ở SC06 fixture/test/doc, không đổi frontend runtime |
| Bốn nhánh TC10 có API, lượt NEW | `764ba4e4eb518fd803ea28d4bbb779f06cb7eba6` | 4/4 PASS/exit0; source công bố tại `test/tv4-tc10-api-20261113`; không phải worker/browser proof |
| Sepolia tests + preflight mới cuối | `7a0a94fbae0bf9682259f785643d4b30260f5850` | 28/28 bootstrap/Sepolia PASS; actual remote GOV estimate + pinned-state fork17transactions PASS; 0 remote broadcasts |

SHA commit chứa báo cáo/raw không được gọi là source của mọi lượt trên. Sau full native chỉ có delta fork/testnet/test harness/CI/evidence; không gán số cũ cho head cuối. Exact-head GitHub CI và review được ghi tại PR21 sau push. TV2 fix gốc `8b72aa9` được tiếp nhận với attribution tác giả; TV3 published `15b62b5` được port chọn lọc tại `c31f797`, không merge toàn nhánh hoặc ghi đè frontend.

Toolchain thực chạy: Linux x64, Node24.15.0, Foundry/Anvil1.8.5, Solidity0.8.37/Osaka, PostgreSQL18.4; root/frontend lockfiles và submodules pinned. Package PG cần ICU60, được extract riêng trong `/tmp`, không đổi hệ thống hoặc fake symlink ABI. Các command/exit code/runtime/source/binary hashes đầy đủ ở raw.

## 2. #18 — số đo và nguyên nhân đã xác minh

Raw FAIL12/11 tại rehearsal `f20f8f04e4083f161d5e6a8141e8d5aa06308aa2` vẫn nguyên checksum **`4e4735edde53d471374620c4cce66b4c50c0ee41a6696b1ebf9d929091292f70`** trong PR50. EventH1182/APIH1179 sau30.105,566ms vẫn là FAIL; 8.302 HTTP success/p95 diagnostic282,919140ms không thành NFR02 acceptance, outage sau load NOT_RUN. Không sửa archive, threshold30s, dataset100/1000, concurrency10, duration minimum60s hoặc assertions.

| Phép đo mới, cùng workload/threshold | Serial baseline `312104f` | Fixed full `b7ff654` |
|---|---:|---:|
| Requests thành công / lỗi | 21.473 / 0 | 11.407 / 0 |
| p95 HTTP, ms | 185,647861 | 198,801668 |
| Load duration gồm drain, ms | 229.981,015 | 126.367,165 |
| Idle freshness max, ms | 8.916,870 | 8.483,693 |
| Load freshness max, ms | 27.306,266 | 17.680,628 |
| Worker RPC peak đang thực thi | 1 | 4 |
| Outage, ms | 31.250,161 | 31.250,373 |
| Recovery tới giao dịch mới được publish, ms | 8.250,687 | 9.920,775 |

Load kéo dài quá60s để đủ10 freshness samples, đúng runner gốc; không so request count như cùng cửa sổ thời gian. Nearest-rank p95 fixed được tính lại từ toàn bộ11.407 raw successful samples, khớp report; từng endpoint dưới1000ms, 0 lỗi; 10idle+10load PASS, recovery sample tách riêng, normal worker errors=[] và cleanup PASS.

**Bottleneck có bằng chứng:** serial code thực hiện 100 quorum cùng snapshot +100 tally +100 state mỗi reconciliation, một RPC in-flight. Worker/HTTP scheduling cộng dồn vòng nối tiếp, kể cả publication H không đổi; proxy service time riêng không giải thích hết wall time. DB activity chủ yếu idle-in-transaction/ClientRead khi chờ worker; sampled blocking PIDs0 ở cả hai lượt. CPU counters đo busy khoảng80,2% baseline và76,0% fixed; có contention nhưng không chứng minh environment-only. Sampler1s có thể bỏ lỡ lock ngắn. Không tuyên bố nguyên nhân duy nhất của timeout cũ, không chứng nhận SLA mọi host.

**Sửa:** giữ EIP-1898 canonical H/hash và mọi oracle quorum/tally/state/Timelock; chia tối đa4 proposal checks, share quorum chỉ trong một H/snapshot, không cache qua H/reorg; drain in-flight trước rollback. Regression kiểm lỗi votes/state/quorum, bounded concurrency và fresh calls khi đổi hash/snapshot. Runner finalize retained HTTP metrics trước rethrow rejected task, nhãn `diagnostic_failed_http_load`/FAIL; good HTTP p95 không che freshness failure.

Full DB/live mới: 21storage+18checkpoint+10projection+7API+1BE06+19BE07=76 distinct cases, không skip/cộng reruns. Reorg503/data503, cursor409 trong/sau replay, deep-fork503; before/after-publication-COMMIT SIGKILL và same-H rebuild `equal`, mismatches=[] tại H67/hash `0x2a98d6b16aeb15333c0ae9b20d26fe4c0b75e56dbd83d9d9eade2ae4a05f6bb3`, head69/K2. **#18 giữ mở** đến review/tích hợp/CI revision nghiệm thu; Dev chưa chứa fix chỉ vì candidate local PASS.

## 3. Frontend TV3 và browser

Giữ Swiss UI, WalletSession/provider/account/chain guards, Governor/emitter/expected-ID/payload/outcome, SnapshotInfo H/hash/revision và original actions. Detail/votes/linked Transfer được đối chiếu cùng snapshot; detail409/503 thu hồi signing lease, giữ dữ liệu/hash để xem. Giữ Treasury regressions mà TV3 bỏ. Chọn **blank API → read-only fixtures**, hỗ trợ explicit `VITE_DATA_SOURCE=fixture`; tách API read scope khỏi full signing deployment, không tự dùng localhost API hoặc fallback khi API lỗi. README/env/tests đã đồng bộ.

Owned UI deployment `be06-2ee1062475e87e9b19504aaf`, chain31337, API/RPC/worker/React cùng manifest. UI tạo proposal, A/B vote700GOV, zero-GOV caller queue/execute1000BUD. Execute receipt **`0x87628f4d9297b1856f0eaebae797cbc25a60d6dbb296a433cbab58e70e09dd3b`**, worker/API ExecutedH43, canonical refresh vẫn giữ receipt/hash. Tạo proposal độc lập không vote →DefeatedH49; Pending khác 1wei →CanceledH55 (không gọi toàn bộ các ca này là F0-reset acceptance).

Final API/UI H55/hash **`0xad889cec42b66642c07a25d87ff08a1363e8eecf21e28ef3a314120d787f22f1`**, revision **`24a49289-7692-4b46-97fd-bd6a102fe92e`**: Treasury9000BUD, totalIn10000/totalOut1000, đúng một linked payout. Mô tả HTML chỉ là text, sentinel không chạy. 6routes×390/1366 không horizontal overflow; Tab/Enter skip-link tới main-content ở cả hai widths. Hai PNG trong raw đã được xem trực tiếp. Console page exceptions0; raw Network/Console giữ cả aborted fetches khi navigation và controlled409/503, không giả mọi request đều200.

Fault injection ở **surface thật**: summary409/503 giữ create receipt/hash và báo read-only; proposal collection409/503 giữ created hash nhưng Cancel Pending disabled; canonical refresh thành công mở lại quyền. Đây là response injection trên browser, không giả thành backend reorg. Backend recovery có campaign riêng ở §2. Keyboard mới kiểm skip-link, không tự nâng thành mọi keyboard/form/error vector. Adapter EIP-1193 forward RPC tới owned unlocked Anvil **không phải ví extension/testnet**.

Shutdown: owned RPC37281/API43421/Vite5173 đóng, bốn owned PIDs không còn, PostgreSQL stop exit0. Bootstrap process group nhận SIGTERM (exit−15); worker exit code riêng không được giữ, **không gọi graceful worker exit0**. Native BE08 worker/cluster cleanup có proof exit riêng. Không kill dịch vụ người khác.

## 4. SC06, full stdout và TC10

New SC0632/32 và [full stdout](tv4-20261113-sc06.log) thuộc `da2237f`; [Foundry202 full stdout](tv4-20261113-foundry.log) thuộc `b7ff654`. Chúng là lượt mới, không phục dựng stdout bị cắt/mất của S trong PR50 và không nhận lượt TV1 thành TV4. Historical v1/source/checksum giữ nguyên; current default dùng [SC06v2](../../fixtures/chain/sc06-v2/README.md) được sinh trên Anvil thật, verify raw RPC trước shutdown. Lượt tích hợp đầu bị strict source binding chặn4tests là lỗi cần regenerate tương ứng source mới, không rehash fixture cũ để né gate.

[TC10 new four-branch API evidence](tv4-20261113-tc10-api.json), raw SHA256 **`3343ceeaba9620087ecdbe0cbf3716612418e483e88f1ffa23b6f7a133ea0d82`**: hashed/zero request×P1/P2 thắng trước, mỗi empty chain+new DB riêng H29/hash/revision riêng. Mỗi nhánh2proposals/4votes/1disbursement/rejected raw events0, exact winner payment/recipient/amount/tx/request/ID; loser vẫnQueued/Ready/ETA dù đủ tiền. Hai preparation failures (thiếu createdb binary; chưa checkout submodule ở worktree mới) giữ riêng; driver sửa dùng pg client và provision pinned sources. Không yêu cầu chạy lại bốn raw branches lịch sử chỉ để review; đây là lượt mới để bổ sung API. Shared sync/project không phải CLI worker; UI từng nhánh chưa chạy.

Full QA05/#7/#16 còn PARTIAL cho các per-vector reset/receipt/API/UI của TC05/06/08, tampered-description/reset/UI TC07 và các actor/state/history UI còn lại TC14; không dùng unit totals để đóng. 15contract cancellation tests đã có, không yêu cầu TV1 review lại scope đó. **#17 bounded Done giữ nguyên**, không suy thành signatures/ERC1271/arbitrary-strategy/API/UI/testnet acceptance.

## 5. Sepolia chuẩn bị xong trong phạm vi không signer

[Runbook và TV1 delta](../sepolia-deployment.md), [summary/full28-test stdout](tv4-20261113-sepolia/summary.json). Sepolia11155111/PublicNode/K2 giữ đúng cấu hình; deploy/check-roles riêng dùng encrypted keystore và passwordFD, exact chain/source/fee/budget approval, từng transaction estimate/current nonce/native balance/block limit, durable journal, full constructor/runtime/ABI/roles/operation-history audit trước renounce/funding. Local deploy vẫn chỉ empty unforked numeric-loopback Anvil31337.

Đã sửa hai nhóm lỗi preparation: chờ receipt đã mine **rồi** mine2descendants/interval1 để tránh K2 race và timestamp checkpoint chưa thành quá khứ; reuse owned lifecycle để không treo khi child đã signal-exit, có regression giữ failure artifact. Negative log-omission/runtime tests nay thực sự kích hoạt intended fault, không nới oracle. Các lượt21/27,25/28,27/28 failed trước sửa được giữ trong raw; final **28/28 PASS/0skip** tại `7a0a94f`.

PublicNode actual EVM tại **H12123926/hash `0xd0d3078e61e7bcec84bf9e66f005ec4b1860986500f3250025830ac0317c2aea`** estimate GOV constructor **11.865.462 gas** với explicit synthetic balance override. Full pinned-state fork17transactions/17receipts hoàn tất, final role audit K2 H12123975/hash `0x7b84e031898e37b93b463260200f59d58bde7e925d6ea8b99a7774627e991cbf`; fork exit0. Fork Osaka totalGasUsed9.370.997, **không phải ngân sách deploy remote**: remote GOV estimate riêng đã lớn hơn cả tổng fork. Mọi signed remote transaction vẫn estimate lại trên actual pending state/fork rules. Genesis HEADER đọc trực tiếp cùng verified PublicNode vì Anvil đòi genesis state đã pruned; execution/state vẫn actual fork ghim metadata H/hash, không dùng header làm fake state.

**0 broadcast Sepolia, không testnet PASS.** Còn: owner/public9-address role map;6secure signers và gas/fee budget được cấp phép; TV1 review delta remote mới và accepted revision; manifest deployment thực/check-roles và Executed+Defeated receipts chờ thời gian thật. Không yêu cầu secret/private key/seed, không dùng synthetic fork account hoặc địa chỉ Anvil thay testnet. Local review SC/SC06 cũ không bị mở lại.

## 6. Receiver, GitHub và merge gates

PR49 đã merge4296c87 vào feature/tv4-operation, không vào Dev; không merge lại. PR50 `d85611b` sửa as-of/cập nhật TV3/PR49, raw cũ bất biến; exact-head CI **8TV4+1BE08 checks PASS** ([TV4](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/43364944206), [BE08](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/43364944100)). [TV1 COMMENT và phản hồi delta](https://github.com/SE2026-21-1/dao-budget-simulator/pull/50#issuecomment-6843834951) không thành approval. Docs PR50 được xét độc lập runtime PR21; ghi truthful FAIL không cần đợi runtime merge.

#36/#40/#42: tiếp nhận TV3 reported clean WSL clone/transport/worker restart và new-DB same-H rebuild/compare scope. Raw compare/normalized exports/redacted manifest/verify bytes/API restart+checkpoint/shutdown owned processes còn chưa công bố để TV4 tự kiểm checksum/nội dung; không yêu cầu repeat những lượt đủ proof. Endpoint receiver báo refused/WSL E_ACCESSDENIED không được dùng làm deployment đang sống. Cần owner startup hiện hành/manifest+origin và browser/extension proof đúng source trên máy nhận; local source-machine proof ở §3 không thay thế.

PR21 cần peer delta frontend của TV3 và remote path của TV1, exact final-head CI, integration decision; không tự dùng approval cũ cho mọi delta hoặc merge/close issue. #18 giữ In review; #20 Blocked; full QA05 và receiver scope PARTIAL, #17 Done. Người dùng tự chốt merge.

## 7. Raw, commands và giới hạn

[Machine-readable report](tv4-20261113-acceptance.json), [raw archive](tv4-20261113-raw.tar.gz), SHA256 **`f9e49ecbae8b8274780139df1b5e6e57e75ed01cd839186bdc75d99c03a55142`**. Raw chứa `baseline-serial/`, `fixed-full/` (reports/full command logs/tested-source/patch), `checks/` (full new SC06/frontend/Sepolia stdout/exit), `browser-live/` (receipts/headers/API/network/console/screenshots/shutdown), `sepolia-current/` (full remote requests/responses, fork journal/receipts/exit), earlier preparation attempts và operator drivers. Scoped scan không thấy owner keystore/private key/seed/RPC secret hoặc env files; các chuỗi cursor/test cho dịch vụ disposable đã dừng không phải credentials của signer owner. Không coi đây là secret audit toàn repo/history.

Lệnh chính đã chạy (đường output chỉ là lịch sử, dùng output mới khi tái lập):

```bash
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:$PATH
export LD_LIBRARY_PATH=/tmp/tv4-icu60-20261113/usr/lib/x86_64-linux-gnu
npm run test:be08:native -- --postgres-bin /tmp/tv4-pg18-20261113/node_modules/@embedded-postgres/linux-x64/native/bin --output /tmp/tv4-fixed-full-20261113 --benchmark
node --import tsx scripts/generate_sc06_chain.mjs fixtures/chain/sc06-v2
node --import tsx --test tests/sc06-chain.test.mjs
# Exact live API/SC06 public settings and full commands are retained in checks/ and browser-live/.
npm run test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
node --test tests/smoke/bootstrap.test.mjs tests/smoke/sepolia.test.mjs
node scripts/preflight_sepolia.mjs --accounts - --output /tmp/tv4-sepolia-current-20261113/preflight.json
```

Baseline driver/owned UI bootstrap are archived as operator scripts, not a new production service. All actual test exit codes are in raw; initial helper/environment errors remain disclosed. Local results do not establish another-machine, extension-wallet, testnet, release or universal latency acceptance.
