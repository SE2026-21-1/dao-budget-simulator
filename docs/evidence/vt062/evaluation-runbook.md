# VT-062 — Mutation, coverage và flaky evidence (2026-10-31 UTC)

## Source identity và môi trường

- Branch nộp local: `individual/23001841-vt062-idempotent-retry`; baseline ở đầu lượt `b7528d3b21cdb3ef4ef04364a66935c1906797ee`, status sạch.
- Test PostgreSQL + runner commit `4c5ab03e7ecee5317d47f7e6241d6e48b332cbda`; coverage provider/test bổ sung commit `6144f1b369906b4d906b7cd20760247819268236`. Không sửa production trong lượt đánh giá.
- Node 24.15.0 từ `/home/cuongdz/.local/share/be06-tools/node/bin`, PostgreSQL 18.4 native từ `/home/cuongdz/.local/share/be08-tools/pg184/usr/lib/postgresql/18/bin`; cần `LD_LIBRARY_PATH` từ đường lib be08 + be06. Root `npm ci --offline --no-audit` exit 0 (`mutation-root-npm-ci.txt`); mutant worktree cài độc lập exit 0 (`mutation/mutant-npm-ci.txt`). Không dùng DB của checkout đang mở.
- Mỗi lượt API khởi tạo cluster PostgreSQL do script sở hữu, database mới rỗng `tv4_be05_vt062`, áp dụng migration 001–005, seed deployment/ABI/header/raw proposal/projection/checkpoint, chạy HTTP server thật rồi dừng/xóa cluster. Test kiểm `api_read_snapshots` = 0 trước request và = 1 sau; không đọc snapshot tạo trước mutation. `initdb.txt`, `pg-start.txt`, `runtime.json`, `test.txt`, `pg-stop.txt`, `cleanup.txt` nằm riêng trong mỗi thư mục lượt chạy.

## Mutation M1 — requestId lấy nhầm proposal_id

Mapper thật ở `indexer/api/server.ts:381` tạo payload trước khi lưu `api_read_proposals`; list/detail lấy payload snapshot đó. Fixture `expectedRequestId = 0xabab…abab` (bytes32), `proposalId = 54612022350460919842760889079100287211258693419720423745560677417927857660082` (decimal), khác nhau. Calldata disburse được encode/decode bằng ethers, descriptionHash và proposalId tính theo ABI; API chỉ trả 200 sau khi migration/deployment/publication hợp lệ.

Lệnh thực chạy từ root tương ứng (thay `<output>` bằng đường dưới đây; không có password):

```bash
PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH LD_LIBRARY_PATH=/home/cuongdz/.local/share/be08-tools/pg184/usr/lib/x86_64-linux-gnu:/home/cuongdz/.local/share/be06-tools/postgres-root/usr/lib/x86_64-linux-gnu node scripts/check_vt062_api_native.mjs --postgres-bin /home/cuongdz/.local/share/be08-tools/pg184/usr/lib/postgresql/18/bin --output <output>
```

| Lượt | Output | Mapper SHA-256 | Exit và oracle |
|---|---|---|---|
| Good-pass | `docs/evidence/vt062/mutation/good-02` | `7513723c854f2bfb022aaa6870e6c2dfc465add57e45816eb51d91bb609deaf6` | 0; list và detail requestId đúng fixture. |
| Mutant-fail | `docs/evidence/vt062/mutation/mutant-01` | `fb46fafd044c7ceb4babdc1cf4d1e5ea4aec038255cb5afe4ff2e0f81b3a9bf1` | 1; fail ở `vt062-request-id.test.mjs:131`, expected bytes32, actual proposalId decimal. Không phải setup. |
| Restored-pass | `docs/evidence/vt062/mutation/restored-01` | `7513723c854f2bfb022aaa6870e6c2dfc465add57e45816eb51d91bb609deaf6` | 0; list và detail đúng trên cluster mới. |

Mutation đúng một expression `String(row.request_id)` → `String(row.proposal_id)` trong worktree `/tmp/dao-budget-vt062-mutant-20261031` tại branch tạm `mutation/23001841-vt062-requestid-20261031`. Diff lưu `mutation/requestid-mutant.diff` (SHA-256 `530e9e903c7b0759fdd9687675b9108c1e8fa70d6b911f6c9227f8f626472efa`). Sau fail, diff được áp ngược, worktree sạch rồi tháo bằng `git worktree remove` không force. Branch tạm vẫn trỏ tới code tốt; mutation không có trong lịch sử nhánh nộp. `good-01` là lượt thử trước khi commit test; cũng pass, cùng SHA mapper nhưng HEAD lúc đó là `b7528d3`.

## Coverage

Thêm duy nhất devDependency `@vitest/coverage-v8@4.1.12` trùng Vitest 4.1.12, cùng lockfile; cài đặt exit 0 (`coverage-provider-install.txt`). Lệnh đo thực chạy:

```bash
PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH npm run test --prefix frontend -- --coverage --coverage.provider=v8 --coverage.include=src/chain/transactions.ts --coverage.include=src/chain/useTransaction.ts --coverage.include=src/pages/CreateProposalPage.tsx --coverage.reporter=text --coverage.reporter=json --coverage.reporter=json-summary --coverage.reportsDirectory=../docs/evidence/vt062/coverage
```

`coverage-run.txt`: exit 0, 5 file/30 test pass. Chỉ include ba production module đã đổi; exclude theo phạm vi là test files, fixtures, backend/indexer và các frontend module khác. `coverage/coverage-final.json` và `coverage/coverage-summary.json` là report máy đọc được.

| File | Lines | Branches | Diễn giải rủi ro |
|---|---:|---:|---|
| `useTransaction.ts` | 100% | 96.55% | Đường timeout/retry, concurrent, key khác, terminal, success và non-keyed fallback đã được test. Report còn một branch ở line 32 dù assertion retry có chạy; không dùng riêng con số để kết luận đủ. |
| `CreateProposalPage.tsx` | 93.18% | 63.63% | UI test render form và thử lại; chưa chạy lỗi loadSummary, validation/submit catch, thao tác refresh; chain/deployment guard thật bị mock. |
| `transactions.ts` | 51.13% | 37.50% | File chứa nhiều helper cũ ngoài slice. Các nhánh mới ở `waitForReceipt:74–87` đã chạy, trừ `!publicClient` ở line 73; `assertWritable` và `proposalIdFromReceipt` thật chưa được UI test đi qua. |
| Tổng ba file | 72.94% | 51.74% | Không có coverage threshold của repo; phần trăm không thay cho review AC và mutation. |

API mapper `indexer/api/server.ts` không nằm trong Vitest coverage; test PostgreSQL + mutation xác minh riêng.

## Thử flaky risks

- **Time/network/concurrency:** 30 lượt chạy tuần tự ba test VT-062, mỗi lượt 16 test; `flaky-logic-final-summary.tsv` ghi 30 exit code 0, raw output ở `flaky-logic-final-raw.txt`. Seed = none (không shuffle). Mỗi test dùng fake RPC/API, hash cố định, deferred Promise/barrier; không ngủ theo thời gian. Trong mỗi lượt, test overlap gọi `run` lần hai khi receipt wait đầu còn pending. Kết quả này loại trừ failure trong 30 lượt quan sát, không chứng minh sẽ không bao giờ flaky trên RPC thật.
- **Order/shared state:** 6 lượt toàn frontend suite, mỗi lượt 30 test, `--sequence.shuffle --sequence.seed=<seed> --no-file-parallelism`; seeds `62031–62036`, 6 exit code 0 (`flaky-shuffle-final-summary.tsv`, `flaky-shuffle-final-raw.txt`). Ba file VT-062 cũng chạy độc lập từng file, exit 0 (`flaky-isolated-final-*`). Vitest giữ mặc định isolate=true. Hook mock slots và wait mock reset `beforeEach`; UI unmount root/remove container `afterEach`; API server/pool close và cluster stop/remove. Không dùng retry tự động để che failure.
- Lượt chạy trước khi thêm assertion khóa nút sau success cũng được giữ trong file không có `-final`; chỉ file `-final` được dùng cho kết luận trên test commit cuối.

Frontend lint và build sau dependency/test change đều exit 0 (`eval-frontend-lint.txt`, `eval-frontend-build.txt`); lint còn 8 warning baseline `wallet.tsx`, build còn warning chunk >500 kB. Không chạy tải 60 tác vụ hoặc PDF trong lượt này.
