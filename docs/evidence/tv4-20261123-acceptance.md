# TV4 — nghiệm thu theo phạm vi, 23/11/2026

## Revision, workspace và quyền

- Dev `6766e5ee2d8c466542687cbeb09677c4d11e5463`; main `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4`. Đã fetch và đọc PR/review/comments/checks mới của #60/#61 và #7/#18/#20/#36/#40/#41/#42/#44/#56.
- Workspace gốc đang dirty trên personal/23001850-vt-064-bulk-import được giữ nguyên. Worktree riêng `/tmp/dao-tv4-integrated-20261123` bắt đầu từ Dev, fast-forward các commit chung #60; không reset/stash/clean, merge/rebase/cherry-pick nhánh cá nhân hoặc #21/#55.
- `148f8e9`, `b67611e`, `c947553` không là ancestor của Dev; hai original branch #21/#55 không là ancestor của Dev. Delta chung #60 được kiểm riêng. Các file/changelog cá nhân không được nhập gián tiếp.
- Commit tích hợp BE08 `5c899976ac4de97434737493815e7ccbdcd13984` đã push vào [#60](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60). Ba file BE08 đúng nội dung [#61 /42518f7](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61), TC10 và bỏ SSH rollout của #60 giữ nguyên.
- Candidate bổ sung harness và remote preparation qua file chung có hash riêng; không đổi Solidity, ABI, backend/frontend product, migration hoặc lockfile. Không gán kết quả candidate cho main/Dev chưa merge.

## Kiểm tra thực chạy trong lượt TV4

Linux x64; Node24.15.0/npm11.12.1, Foundry/Anvil/Cast1.8.5, solc0.8.37/Osaka/optimizer200, PostgreSQL18.4. Root/frontend `npm ci` và recursive submodules thành công trong worktree riêng.

| Lệnh/phạm vi | Kết quả thực tế | Evidence/source |
|---|---|---|
| `npm run test:be08` | 14 PASS/0 fail/skip, exit0 | `integrated-checks.log`, C=`5c89997` |
| `npm run typecheck`; `npm run build`; `forge build` | exit0; Solidity lint warnings giữ nguyên | log trong raw archive |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/integration/TimelockGovernance.t.sol -vv` | 40 PASS/0 fail/skip, exit0; TC10 reverse-order và zero-ID giữ nguyên | C |
| `node --test scripts/cd/release.test.mjs` | 4 PASS, exit0 | C |
| `npm run test:be08:native -- --postgres-bin /tmp/dao-tv4-pg18-20261123/node_modules/@embedded-postgres/linux-x64/native/bin --output /tmp/tv4-be08-integrated-20261123 --benchmark` | PASS, exit0;22 command exit0; cleanup cluster/temp PASS | [native summary](tv4-20261123-native.json); base c1ffb9e + patch SHA256 `19f83e67de6bec312358d9e0c74d5b180f3c115daef9e586d525a56d1ce7be4e` = ba file BE08 sau đó commit5c89997 |
| `node --import tsx scripts/check_qa07_e2e.mjs --postgres-bin … --output /tmp/qa07-e2e-evidence-20261123-final` | PASS, exit0; real browser/chain/worker/API;14 screenshots; no browser/cleanup errors | [QA07 summary](tv4-20261123-qa07.json); product5c89997 + harness hash `9334b7f355d31283d95a634ec1cf13dca4a1bbf5986a2d1a112653d07c625cfe` |
| `node --test tests/smoke/sepolia.test.mjs` | 13 PASS/0 fail/skip, exit0 | [remote preparation](tv4-20261123-sepolia-remote.json); synthetic Anvil, không Sepolia deployment |
| `node scripts/check_sepolia_readonly.mjs --output /tmp/tv4-current-20261123/sepolia-readonly-final.json` | READ_ONLY_PREFLIGHT_PASS, exit0;0 broadcast | Sepolia H12194119/hash4ce302…67296, chain11155111, K2, CLZ(1)=255 |
| Compose production/smoke `config --quiet`; Bash/JS syntax | exit0 với env.example + synthetic digest inputs | `compose-populated.log`; chỉ cấu hình/syntax, không image pull/runtime local |

Native release gate gồm191 backend unit,77 DB cases (21+19+10+7+1+19), BE01 SQL,182 Foundry tests và live BE07; số suite rerun không được cộng thành cases mới. Không tăng timeout RPC/test, giảm dataset hoặc nới assertion. Native gate là cấu hình10clients/60s/100proposals/1000votes, không phải Q browser runner polling200ms.

| Backend measurement | Dev CI lịch sử6766e5e | Corrected push CI5c89997 | Native local candidate |
|---|---:|---:|---:|
| HTTP200 | 29.724 | 30.431 | 13.080 |
| HTTP errors | 0 | 0 | 0 |
| p95 ms | 29,271088 | 29,057945 | 299,206655 |
| Freshness samples | 20 | 20 | 20 |
| Max freshness ms | 4.004,002533 | 4.405,304341 | 23.855,711135 |

Mỗi cột là một run khác; không gộp datasets hoặc gọi số đo local là SLA/testnet. p95<1000ms không có nghĩa mọi response<1000ms; spikes được giữ trong raw. Backend Dev artifact có ID9398 chỉ3 attempts, không có same-ID tail proof; corrected CI có ID9620 clipped-at-end với same-ID success bên ngoài. Native cũng giữ lifecycle proof cho partial tail, max4/backoff/method/params assertions.

## CI và review, không tự merge

- [Push CI45126740550](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45126740550) trên exact5c89997 và [PR CI45126748982](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45126748982) trên merge-ref **b4b505d**, tổng22 successful/2 publish skipped. Không nhầm PR merge-ref với HEAD.
- [Artifact14795624482](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45126740550/artifacts/14795624482) tự tải/kiểm digest `0390cbec96a3cf236d72233f60564d25c526466bac86436bea79bcdf6f08f5cd`, source5c89997/patch rỗng; [CI evidence](tv4-20261123-integrated-ci.json). Container build/Compose runtime smoke là CI thật, không local Docker proof (local daemon permission denied).
- TV1 approve tại c1ffb9e chỉ contract/TC10/contract-CI integrity. TV2 Request changes BE08 vẫn có hiệu lực cho đến re-review. #61 chưa có approval; giữ request hiện hành. Không self-approve/dismiss/bypass hoặc merge chỉ do CI xanh.
- Source mới remote helpers có local13/13 nhưng cần TV1 delta review; harness cần TV3 review. CI5c89997 không được gọi là CI của các file mới chưa có trong commit đó. Final-head checks được ghi tại PR60 sau push, không sửa lịch sử số đo.

## Backend #18 — đã đủ nghiệm thu và đã đóng

[TV4 signoff](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-7093896813) chấp nhận TC11/TC12/NFR02–04 trên Dev6766e5e, tiếp nhận TV2 scoped review và tự kiểm actual Dev artifact/26 indexer source hashes/empty patch/503/409/deep fork/crash/replay/same-H rebuild cùng raw performance. Artifact Dev SHA256 `b84cf8a84297c623b394adefb03dfe8d10f65a1bfe69257ca8c4ebc93b89bb61`; [offline backend evidence](tv4-20261123-backend.json).

Corrected CI5c89997 có cùng26 indexer source hashes, bổ sung lifecycle measurement còn thiếu; không phải sửa sản phẩm backend. Receiver/MetaMask/testnet không chặn riêng backend đã đủ bằng chứng. Giữ16 unknown ancillary topics/raw-decode incomplete, không nhận fully healthy.

## QA07 / #36/#40/#41

[Runbook và extension checklist](../qa07-e2e.md). Cùng proposal do browser tạo: propose→vote→queue→execute receipt0 thiếu quỹ→fund2000→retry execute receipt1; EIP-1193 unlocked Anvil adapter **NOT MetaMask**. Confirmed-not-indexed, wrong-network khóa ký, reject4001/no tx, loading/network-error/retry, actual worker gate recovering/summary503/cursor409 và canonical replay đều đã chạy. Desktop1366×900/mobile390×844 đã render; mobile read-only, không mobile signing campaign.

Execution publication: H44/hash `0xb3cbe8d9dff9606bcc8a34d0515488924b3b9cfa77e1a62cca80c8e393af2b60`; request `0xf8ea1e52c0b71dd1b4ae8fd0026b2a02053ba3d2808c58c1b8f6fe22dd7d0152`; proposal `90707688329980159823894945967180366348968337209741854949864732845074955894595`; operation `0x30c2c00ceb4034a93aac8bf7d92b7a0b926f9f640beba8f3317dcd32a2171c34`; execute tx `0x351eefb0d0b84b935e619806110448f4b16a92150996c25aba7a26f40d56cce0`.

Treasury1000 BUD/recipient11000 BUD/paid=true, Governor Executed/Timelock Done; SQL/API/contract reads ghim canonical hash và UI cùng publication. Đây là A400 For/chi11000 retry case, không dùng thay exact TC01 A+B700/chi1000. Nhánh reorg test sau đó H47 có hash/revision khác, không gộp với execution H44.

TV3 manual browser1366×768/390×844 tại sourcee8e443c, run20261121T164230Z-1d31cb975ecc được tiếp nhận đúng scope TV3, không thành TV4 rerun. Historical503 DATA_NOT_READY/reload200 giữ là observation; chưa đủ kết luận root cause, fix hoặc current blocker. #36/#41 còn extension/governance manual acceptance.

## Bundle máy nhận #40/#42

[Toàn bộ offline validation](tv4-20261123-bundles.md), [machine-readable inventory](tv4-20261123-bundles.json).

- #42: ZIP đúng72a16f…60dd;13/13 SHA256SUMS,11 manifest bindings,7 source Git hashes; exports byte-identical, compare equal/mismatches=[] cùng31337/H24/hash255897…becd/scope. Bốn exit0 là TV3 historical report, logs không có process exit code. Đã chấp nhận BE06 bytes; chỉ còn API restart trên máy TV3 trước/sau context/checkpoint/digest/six responses để đóng toàn issue, không đòi rerun rebuild.
- #40: ZIP đúngc29d61…98d3;17/17 original checksums và7 Git hashes;6GET200/OPTIONS204/contract comparison/worker restart/FE live1/0 có recorded evidence. Có API/worker/Postgres shutdown bytes; final PID/port/Windows restoration và transport/status claims chưa có raw outputs đầy đủ. Chỉ xin output đã giữ, không đòi làm lại campaign.

## Sepolia #20 / server #56

[Runbook](../sepolia-deployment.md). Chỉ tái tạo sáu **file chung** remote deployment/preflight/keystore/journal/tests từ reviewed94d5367, không nhập ancestry hay nội dung cá nhân; hashes được ghi và13 local tests mới PASS. Local31337 guards không bị mở. CLI broadcast yêu cầu exact SHA/map/chain/fee/budget; operator/signers/authorization chưa có nên **0 remote broadcast**.

Owner do nhóm xác định phải cung cấp accepted revision,9public addresses,6signer custodians/exclusive secure custody, actual-map estimates/native balances/fee caps/total budget/funder và explicit authorization. TV1 review candidate delta + hậu deployment runtime/roles/history; sau đó Executed/Defeated real-time receipts mới là nghiệm thu testnet. Local/fork/CLZ probe không thay thế.

Bỏ SSH server rollout giữ trong #60, GHCR/Compose CI còn. Không chạy Terraform/OpenStack provisioning, không kiểm/xóa cloud inventory hoặc dừng process người khác. #56 giữ mở theo quyết định scope chưa merge và inventory lịch sử không được xác nhận hiện tại.

## #7/#44 — bản nộp chuẩn bị, release chưa đủ điều kiện

[Ma trận hiện hành](../test-plan.md#6-traceability-đầy-đủ-frbrnfr--tcinv--evidence) liên kết từng FR/BR/NFR→TC/INV→test→evidence→SHA→kết luận. Giữ10 Ready(single) **N/A**, không PASS; không mở lại bounded invariant đã chốt khi không có regression. Không gán QA05 evidence #21 cho source sạch.

Demo/submission checklist:

- [ ] Chọn full revision sau peer review + exact-head CI; dùng manifest sinh đúng revision, không tái dùng manifest archived/Anvil đã dừng.
- [ ] TV3 extension workflow/evidence; TV2 same-H receipt/worker/API reconciliation; TV4 signoff theo bytes.
- [ ] Chốt receiver #40 lifecycle/raw outputs và #42 API restart máy nhận.
- [ ] Owner #20 cấp quyền và TV1/TV4 nghiệm thu testnet manifest/roles/Executed+Defeated real-time.
- [ ] Cả nhóm chốt kịch bản demo/video/báo cáo và những giới hạn thực tế cùng revision.
- [ ] Chỉ promote Dev→main/tag/release khi đủ các gate và quyền, không lấy CI xanh thay nghiệm thu.

## Raw archive và giới hạn kiểm chứng

[Raw archive](tv4-20261123-raw.tar.gz), SHA256 **`75dfae1be68cb14651ca1f2d0eee35c1b9d0f39263eb3382987f1ddef7ad67f0`**: final browser report/14 PNG+DOM/logs, native BE08 reports/logs/patch/source hashes, actual downloaded Dev/corrected-push CI ZIP, narrow check logs và read-only Sepolia reports. Archive không chứa DB/keystore/env/private key. Bounded evidence-only pattern scan52text files không có match, không phải whole-history security guarantee.

Các kết quả thất bại khi điều tra không được che: Compose thiếu image/env inputs fail interpolation trước khi cấu hình bằng synthetic digests; assertion kiểm artifact PR như exact HEAD bị từ chối vì đó là merge-refb4b505d, sau đó dùng đúng push artifact5c89997; historical Dev tail thiếu same-ID trace không được gọi verified. Một patch probe sai line anchors được sửa ngay trước chạy final tests, không là bug sản phẩm. Những việc này không bị biến thành PASS của test chưa chạy.
