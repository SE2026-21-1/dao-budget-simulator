# Bài tập cá nhân 3 — BC-03 — VT-064

**Phan Thanh Dũng — MSV 23001850 — Nhóm SE2026-T16 — Thành viên.**

Dự án: DAO Budget Simulator. Repository: https://github.com/SE2026-21-1/dao-budget-simulator

Baseline bài gốc: `1bb182144d516c13d6bb32fc30d2778af71a8169`. Baseline bổ sung trong worktree sạch: `0328eea8e3f5fca5fb7c5e1f92fa744720e4f43c`. Nhánh nộp: [personal/23001850-vt064-submission-20261114](https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt064-submission-20261114).

**Cam kết:** “Tôi chịu trách nhiệm về toàn bộ code, test và nội dung bài làm; tôi đã khai báo việc sử dụng AI.” Công cụ hỗ trợ và giới hạn context được khai báo trong phụ lục A; code/test, không phải ảnh chụp, là bằng chứng chạy lại.

## 1. Specification và invariant

**Problem statement:** Người vận hành cần import hàng loạt bản nháp yêu cầu chi BUD. Dòng dữ liệu sai không được xóa hoặc ngăn các dòng hợp lệ khác được lưu. Một lần ghi thất bại không được bị báo thành công. Slice là CLI → kiểm tra dữ liệu → file draft offline; không tự tạo Governor proposal hoặc ghi vào read model chain.

| AC | Điều kiện nghiệm thu kiểm thử được |
|---|---|
| AC1 | File JSON UTF-8 hợp lệ, không quá 1 MiB, chứa 1–1000 dòng; ID an toàn, recipient EVM lower-case, amount uint256 dương canonical, description khác rỗng. Report có index và reason. Byte UTF-8 hỏng phải bị từ chối trước khi ghi. |
| AC2 | Với JSON hợp lệ, dòng sai ở bất kỳ vị trí nào được reject độc lập; dòng đúng trước/sau còn nguyên dữ liệu. All-invalid không tạo draft; mảng rỗng là lỗi input. |
| AC3 | Tạo từng file atomically, duplicate không overwrite; race cùng ID có đúng một winner, report phải khớp nội dung winner trên disk. |
| AC4 | Persistence thất bại → lỗi PERSISTENCE_FAILED, CLI exit 1, stdout không success; báo đúng những dòng đã commit và các rejection trước đó. Dừng lỗi hạ tầng nhưng giữ file đã ghi; không giả định dòng sau đã xử lý. |
| AC5 | Không thay đổi chain-derived proposals, checkpoint, API GET hoặc authority của ví/contract. Accepted field values không bị thay thế hay Unicode normalization ngoài ý muốn. |

**Invariant quan trọng nhất:** mọi phần tử `{index,id}` được báo imported phải có draft thật với đúng dữ liệu; reject không xóa/ghi đè draft đã commit. Đây là atomic publication trên filesystem local, không phải cam kết sống sót qua mất điện.

**Non-functional constraints:** NFR1: 80 tác vụ import đồng thời, p95 ≤ 2500 ms cho slice local. NFR2: đọc bị chặn cứng ở 1 MiB, ≤1000 dòng; không network/secrets; kết quả có thể tái lập. Invalid encoding/JSON là lỗi cả file chưa thể phân tích; khác với một record có field sai trong JSON hợp lệ. Không cố “cứu” JSON hỏng bằng suy đoán row boundaries.

## 2. Coding-agent plan → review trước code

Bài cũ đã có importer và log lịch sử. Lượt bổ sung dùng coding agent `ScopedImporterPlan`, chỉ được đọc `indexer/import/{drafts,cli}.ts`, test importer, module spec và package.json. Agent ghi [prompt/assumptions/plan thật](20261114-module-plan.md) trước runtime patch; không chạy test hoặc sửa runtime. Parent giữ checkout cá nhân dirty nguyên trạng và dùng worktree riêng.

Plan: raw buffers → đếm raw bytes → một TextDecoder fatal có trạng thái → flush EOF → JSON.parse → importer cũ. Planned files: plan và `tests/indexer/import-encoding.test.ts`; patch chỉ `indexer/import/cli.ts` và script `test:vt064`. Không dependency/migration/API mới. Prompt đầy đủ, alternatives và context boundary nằm trong artifact, không tái dựng thành cuộc gọi AI chưa xảy ra.

**Review bằng repo thật, đã sửa ≥2 điểm:** (1) Bác oracle pin file bytes bằng JSON.stringify + newline: `drafts.ts` serialize như vậy nhưng AC bảo vệ field data, không định dạng newline; test đổi sang parsed object/description equality. (2) Đổi launcher đề xuất giữ convention cũ sang `node --import tsx --test`, theo script `test:be07` và CLI child tests trong package/module; không cần dependency hay Unix IPC phụ của tsx CLI. (3) Sửa diễn đạt “giữ nguyên raw-byte ceiling”: baseline đếm byte sau replacement decoding; đếm raw buffers là correction rõ ràng, không phải behavior đã được chứng minh giống hệt.

Plan được review trước patch, ghi trong cuối artifact; diff được kiểm trước commit trong `20261114-implementation.patch`: chỉ decoder/raw-byte accounting và test launcher. `drafts.ts` không đổi. Giữ BOM đầu file bị JSON.parse từ chối, giữ U+FFFD thật trong data, không catch nhầm filesystem errors thành INVALID_INPUT.

**Risk do context thiếu:** Agent module-only không biết read API của dự án chỉ phục vụ GET/OPTIONS. Parent kiểm `indexer/api/server.ts:683–686`: thêm POST hoặc chèn thẳng draft vào projection sẽ phá boundary cũ. Vì vậy chỉ dùng staging offline, không khẳng định đã có UI/HTTP import. Assistant điều phối có repo instructions và lịch sử hội thoại; không tuyên bố mọi tương tác AI đều module-only. Ràng buộc được thực hiện ở lần coding-agent plan/test tách biệt này.

## 3. Risk-based strategy và thiết kế test

Unit/public-function contract kiểm validation/report; integration kiểm filesystem thật, atomic no-overwrite, lỗi ghi và race; CLI E2E chạy Node process thật kiểm exit/stdout/stderr/files. Không tạo POST API tests hay wallet E2E giả: slice không thêm API/transaction/UI. Chạy BE07 hiện hữu để theo dõi risk “sửa nhỏ làm hỏng behavior cũ không liên quan”; không coi suite đó là toàn hệ thống đã hồi quy.

| ID | Risk / AC | Level | Precondition / input | Expected result | P |
|---|---|---|---|---|---|
| T01 | Mất valid neighbors / AC2 | integration | valid–amount0–null–valid | hai file đúng; reject indexes1/2 | P0 |
| T02 | Path/amount/address sai / AC1 | unit + FS | ../escape, 0,01,2^256,address sai | reject có reason; không file ngoài dir | P0 |
| T03 | Valid-set invariant / AC2 | property + FS | 40 generated mixed batches, seed23001850 | persisted set/data = đúng valid rows | P0 |
| T04 | Empty/all-invalid / AC2 | integration | [] hoặc toàn field sai | input error hoặc imported=[]; không draft | P1 |
| T05 | Overwrite / AC3 | integration | ID có sẵn + duplicate amount khác + ID mới | file cũ nguyên, ID mới lưu | P0 |
| T06 | Shared-state race / AC3 | integration | hai imports cùng ID,amount khác | một winner, report khớp file | P0 |
| T07 | False success / AC4 | integration | output path là regular file | ImportFailure, không success; mutant phải chết | P0 |
| T08 | Partial failure / AC4 | integration | file1 ghi thật, store2 ném lỗi | file1 còn, partial report đúng; file3 chưa claim | P0 |
| T09 | Input boundary / AC1 | CLI + function | JSON sai,>1MiB,/dev/zero;>1000 qua function | exit1/INVALID_INPUT; không draft | P1 |
| T10 | Contract CLI / AC1/4 | CLI E2E | mixed JSON rồi blocked destination | stdout/report/file đúng hoặc stderr+exit1 | P0 |
| T11 | Behavior cũ / AC5 | regression | BE07 retry/freshness/config tests không đổi | 15 PASS,0FAIL/SKIP | P0 |
| T12 | Latency / NFR1 | load | 80 in-flight tasks,1 draft/task | 80 complete,0errors,p95≤2500ms | P1 |
| T13 | Lossy corruption / AC1/5 | CLI E2E | 6 dạng malformed bytes trong JSON otherwise valid | INVALID_INPUT,stdout rỗng,không output | P0 |
| T14 | EOF decoder state / AC1 | CLI E2E | valid JSON + UTF8 sequence thiếu byte | reject trước persistence | P0 |
| T15 | Old JSON contract / AC5 | CLI E2E | leading UTF8 BOM | giữ reject cũ, không auto-strip | P1 |
| T16 | Chunk boundary / AC5 | CLI E2E | scalar2/3/4byte bắt đầu offset65535 | description/data giữ nguyên | P0 |
| T17 | Unicode data / AC5 | property + CLI | 48 seeded rows,combining/emoji/U+FFFD/scalars | full object và persisted ID set khớp | P0 |

**Property-based testing:** T03 dùng xorshift32 seed `0x23001850`, 40 batch dài1–24, unique IDs, khoảng2/5 rows hợp lệ; amounts1,10^18,2^256−1. Invalid variants phân bố ID/path,amount00,address sai. Oracle independent generated valid set và đọc file thật, không chỉ đếm report. T17 sinh48 rows, mỗi description có24 Unicode scalar random tránh surrogate, cộng combining/emoji/U+FFFD; kiểm không replacement/normalization. Seed và batch/row/counterexample được in khi fail. Không dùng shrinking tự động; không suy bounded samples thành mọi Unicode hoặc mọi row order. T13 có6 negative subcases; T07/T08 là failure-path gắn risk riêng.

## 4. Test-first → AI-assisted change → verify

Lịch sử gốc: baseline1bb1821; code `b61cec8`, sửa report/limit `69ca712`; log cũ `red.log` chỉ chứng minh module chưa tồn tại. `review-red.log` cũ là failure accepted-index contract. Không đổi nhãn lịch sử này thành lượt kiểm mới.

Lượt **mới14/11**: commit test/plan **`31cd65858a18d5a47862f62321fb3bed09758b4f`** trước runtime patch. `node --import tsx --test tests/indexer/import-encoding.test.ts` exit1:6 malformed-byte subcases báo **Missing expected rejection** vì CLI cũ đã trả success. Node tổng hợp14 checks:7pass/7fail, gồm parent group fail; không phải7 defect độc lập. Log đầy đủ `20261114-red.log`.

Patch **`8e6f27ac645382901b62e21db8b43b20c19acae8`**: stateful fatal decoder, raw-byte limit, EOF flush, giữ BOM semantics. Sau patch `npm run test:vt064`: **21/21 PASS,0FAIL/SKIP**; con số có parent/subtests, không là21 feature families. `npm run typecheck`, `npm run build` exit0. `npm run test:be07`: **15/15 PASS**. Logs đều lưu source SHA và command/exit thật. Git blob của BE07 tests, API server và drafts.ts bằng baseline0328eea: không sửa regression test để làm xanh.

Files chính: `indexer/import/cli.ts`, `tests/indexer/import.test.ts`, `tests/indexer/import-encoding.test.ts`, `scripts/benchmark_vt064.mjs`. Baseline worktree, committed source và claims được ghim trong `20261114-results.json`; tài liệu/PDF commit sau không được gọi là lượt runtime mới.

## 5. Who tests the tests? Coverage, flaky và tải

**Mutation bắt buộc:** nhánh local riêng `experiment/23001850-vt064-false-success-20261114`, commit **`3e6ce686421c7e79f8beedbac9417958c0008616`**. Thay catch mkdir failure bằng imported.push({index,id});continue. Hàm trả completed dù destination không ghi được: lỗi runtime thật, không phải compile error. T07 chạy riêng exit1 **Missing expected rejection**; test giết mutant. `20261114-mutation.patch/.log` lưu diff và lỗi đầy đủ. Clean submission chạy cùng test exit0. Mutant không là ancestor nhánh nộp, không push/merge. Chỉ chứng minh mutation này bị bắt, không phải mutation score toàn module.

| Node V8 coverage tại8e6f27a | Line | Branch |
|---|---:|---:|
| drafts.ts | 100,00% | 100,00% |
| cli.ts | 91,89% | 75,00% |
| Tổng hai file | 97,78% | 96,36% |

Coverage command: `node --experimental-test-coverage --test-coverage-include=indexer/import/** --import tsx --test tests/indexer/import.test.ts tests/indexer/import-encoding.test.ts`. CLI usage lines8–10 chưa cover; các lỗi syscall/write/sync/link/unlink/crash không được suy là đã test toàn bộ từ100% branch. Risk coverage cần T01/T03 đọc disk, T06 winner oracle và T07 mutant, không chỉ tỷ lệ.

**Flaky review đã thực hiện:** (1) Order/shared-state/concurrency: chạy lại3 selected properties/race với test files đảo thứ tự và concurrency1 so4, cả hai **3/3PASS**, log `20261114-flaky-{1,2}.log`; mỗi test mkdtemp riêng và oracle chấp nhận bất kỳ winner nhưng phải khớp report/file. (2) Random: fixed seed và counterexample diagnostic; không dùng network/random library/time để quyết định correctness. (3) Timing: monotonic performance.now,8warmups; ba load runs giữ raw80samples/run; không dùng sleep hay nới threshold khi host chậm. Đây không chứng minh không flaky trên mọi host/filesystem.

<!-- pagebreak -->

| Run mới,80 tasks đồng thời/run | Hoàn thành | Lỗi | p95 ms | Mục tiêu ms |
|---|---:|---:|---:|---:|
| 1 | 80 | 0 | 109,012 | 2500 |
| 2 | 80 | 0 | 88,523 | 2500 |
| 3 | 80 | 0 | 88,187 | 2500 |

Source benchmark **`b79bedada37a9b61495a7920cf399d5e6319ad0b`**, Linux x64, Node24.15.0; lệnh `node --import tsx scripts/benchmark_vt064.mjs`. p95 được tính lại từ sorted samples[75] (nearest-rank ceil(80×0,95)−1), không lấy trung bình ba p95. 80 promises in flight trong một Node process; mỗi task ghi/sync/link và đọc lại1file thật, IDs riêng cùng temporary directory. Mốc chung gồm scheduling/write/read-back. **Cả3run đạt target slice local**, không phải240tasks đồng thời hay80người dùng HTTP/DB/RPC/wallet. Không kết luận SLA toàn DAO. Raw samples, environment, command và source trong `20261114-load.json`/logs.

## 6. Traceability và bàn giao

| AC / risk | Test IDs → test file | Commit / evidence | Kết quả |
|---|---|---|---|
| AC1/AC2 validation và giữ valid | T01–T04,T09,T10 → import.test.ts | b61cec8/69ca712; new8e6f27a green | PASS |
| AC3 no-overwrite/race | T05,T06 → import.test.ts | 8e6f27a green; b79beda flaky1/2 | PASS |
| AC4 false success/partial commit | T07,T08,T10 → import.test.ts | 3e6ce68 mutant; b79beda clean control | mutant FAIL đúng; clean PASS |
| AC1/AC5 encoding/old BOM | T13–T17 → import-encoding.test.ts | 31cd658 RED →8e6f27a GREEN | 6 corruption counterexamples fixed; controls PASS |
| AC5 old unrelated behavior | T11 → tests/indexer/be07.test.ts | 8e6f27a regression; unchanged Git blob | 15PASS |
| NFR1 | T12 → scripts/benchmark_vt064.mjs | b79beda;20261114-load.json | 3×80tasks đạt p95 |

Đường dẫn hai importer test files bắt đầu `tests/indexer/`. README chạy lại: [docs/vt-064/README.md](README.md). Nhánh mới ở trang đầu được push để review, **không merge trong lượt bổ sung**. Trung thực lịch sử: PR #31 cũ đã merge09/11/2026 vào feature/tv4-operation, merge `b67611e3a7c2f0f1a827b2fbffcb921b27d011c3`; API reviews trả0submitted reviews. Không thể hồi tố gọi lịch sử đó là chưa merge hoặc có peer approval. Không dùng merge cũ làm căn cứ nghiệm thu nhánh mới; không yêu cầu merge nhánh nộp khi nhóm chưa review.

Hai output AI có vẻ hợp lý nhưng chưa tin ngay: oracle chỉ đếm imported có thể xanh khi không file được ghi; oracle pin newline/JSON.stringify lại trói implementation thay behavior. Một decoder “fatal” nhưng không giữ state/flush EOF hoặc tự strip BOM vẫn có thể phá dữ liệu/behavior cũ. Chỉ chấp nhận sau disk oracle, boundary controls, behavioral RED và mutation. Không claim native DB, chain/browser/extension E2E hay production durability; không có CI mới được gán nếu chưa thực chạy.

<!-- pagebreak -->

## 7. Reflection — AI-assisted,250–350 từ

Ban đầu tôi xem import hàng loạt như việc lọc dòng sai rồi lưu các dòng còn lại. Repository cho thấy draft không phải proposal đã được chain xác nhận. Giới hạn thành CLI offline giúp tránh sửa quyền và read model ngoài phạm vi. Tuy vậy, phạm vi nhỏ không bảo đảm dữ liệu được giữ đúng: decoder mặc định có thể thay byte hỏng bằng ký tự replacement rồi vẫn báo thành công.

Confidence tăng khi test mới thất bại vì hành vi, không vì thiếu module. Sáu counterexample có JSON vẫn parse được sau lossy decoding đã khiến kỳ vọng reject thất bại. Patch giữ decoder state, flush cuối file và bảo vệ BOM semantics; controls Unicode qua ranh giới chunk xác nhận chữ hợp lệ không bị hy sinh để chặn lỗi. Property tests đọc file thật và so tập valid, không chỉ so số imported. Đưa false-success mutation vào worktree riêng khiến test persistence đỏ; cùng test trên nhánh sạch lại xanh. Chạy BE07 không đổi giúp quan sát risk regression ngoài importer, nhưng không thay hồi quy toàn dự án.

Tôi cũng phải review output AI: pin JSON.stringify và newline có vẻ chặt chẽ nhưng kiểm chi tiết định dạng thay contract. Seed cố định giúp tái lập, không chứng minh mọi Unicode hay mọi interleaving. Ba lần chạy80tasks giữ toàn bộ latency samples làm p95 kiểm lại được; chúng chỉ đo filesystem local trong một tiến trình, không mô phỏng80người dùng mạng.

Điều chưa chứng minh quan trọng là crash durability và lỗi sau khi publish file nhưng trước cleanup. Test tiếp theo có giá trị cao nhất là fault injection có kiểm soát tại write, sync và link, rồi đối chiếu partial report với file thực sau restart. Cần tiếp tục giữ boundary offline, tránh biến bản nháp thành authority on-chain chỉ để mở rộng demo.
