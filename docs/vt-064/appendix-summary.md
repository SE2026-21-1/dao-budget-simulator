# Phụ lục A — AI Usage Log rút gọn

Bài cá nhân Phan Thanh Dũng,23001850,VT-064. AI hỗ trợ lập plan, tests, patch và báo cáo; không dùng output AI làm chứng cứ correctness. [AI Usage Log đầy đủ](AI-usage.md) và [prompt/plan trước patch](20261114-module-plan.md) được giữ nguyên trên nhánh nộp.

| Công cụ / bước | Prompt chính, output và review | Evidence |
|---|---|---|
| OMP + ScopedImporterPlan | Chỉ cấp drafts.ts,cli.ts,import.test.ts,spec.md,package.json. Yêu cầu plan strictUTF8,giữ1MiB/1000rows/errorcontracts; viết tests trước runtime patch,không tự chạy checks. | Plan/test31cd658 |
| Parent review plan | Bác oracle pin JSON.stringify+newline; so parsed fields. Đổi launcher node--importtsx--test theo test:be07; ghi rõ raw-byte accounting là correction. | Plan §Parent review;implementation.patch |
| Test-first + patch | RED6malformed-byte counterexamples; patch statefulfataldecoder/EOFflush/BOM semantics; giữ persistence cũ. | RED31cd658→GREEN8e6f27a |
| Mutation / quality | Cố ý success khi mkdir fail trên worktree riêng;T07 bắt lỗi. Coverage,đảo thứ tự/concurrency1/4;80tasks×3runs,giữ samples. | Mutant3e6ce68;results/load JSON |
| PdfSubmissionLayout + OMP | Layout tiếng Việt,links,main/appendix;parent render/đếm trang/xem ảnh. Lượt rút gọn chỉ đổi PDF/phụ lục,không chạy lại hoặc gán lại runtime tests. | build_pdf.py;PDF verification |

**Context thiếu:** Agent lập plan chỉ xem module; parent có repo instructions/lịch sử và kiểm API GET-only ởserver.ts:683–686. Không khẳng định toàn bộ tương tác AI đều module-only. Risk là nhầm draft với projection chain hoặc vô tình thêm quyền ghi; giữ staging offline,không POST/chain mutation.

**Hai output chưa đáng tin ngay:** (1) Chỉ đếm imported không chứng minh persistence; phải đọc file và kill mutant. Pin serializer/newline lại kiểm implementation thay contract. (2) Decoder fatal thiếu stream state/EOF flush hoặc tự strip BOM vẫn phá behavior cũ;T14–T17 kiểm các boundary liên quan.

**Lịch sử không sửa:** Bài gốc b61cec8/69ca712 và logs cũ được giữ đúng nguồn; PR31 đã merge09/11,không có submitted reviews theo API. Nhánh bổ sung chưa merge; mutant không push/merge. Reflection do AI hỗ trợ soạn và đã khai báo; không giả lập chữ ký hoặc peer approval.

<!-- pagebreak -->

# Phụ lục B — evidence và cách kiểm lại

Logs đầy đủ ghi command,sourceSHA,exit code trên [thư mục evidence](https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt064-submission-20261114/docs/vt-064). Bảng dưới tóm tắt execution đã có,không phải các lượt chạy mới khi rút PDF.

| Kiểm chứng | Source / kết quả thực tế | Log đầy đủ |
|---|---|---|
| RED trước patch |31cd658:6malformed-byte subcases sai;Missing expected rejection;exit1.14Nodechecks gồm group:7pass/7fail. |[RED](20261114-red.log) |
| Patch→GREEN |8e6f27a:21/21PASS,0FAIL/SKIP;typecheck/build exit0. |[GREEN](20261114-green.log),[diff](20261114-implementation.patch) |
| Mutation bắt buộc |3e6ce68:catch mkdir lỗi vẫn push imported/continue;T07exit1 Missing expected rejection.Clean source cùng test exit0.Mutant không là ancestor nhánh nộp. |[Mutation diff](20261114-mutation.patch),[FAIL](20261114-mutation.log),[clean PASS](20261114-mutation-clean.log) |
| Behavior cũ / flaky |BE07 tại8e6f27a:15/15PASS;Gitblobkhôngđổi.Đảo fileorder và concurrency1/4 tạib79beda:3/3PASS mỗi lượt. |[Regression](20261114-regression.log),[replay1](20261114-flaky-1.log),[replay2](20261114-flaky-2.log) |
| Coverage |drafts100%line/branch;cli91,89%line/75%branch.Tổng97,78%line/96,36%branch;không chứng minh mọi I/O/crash. |[Coverage](20261114-coverage.log) |
|80tasks đồng thời |b79beda:3runs riêng,mỗi run80/80,0errors;p95109,012/88,523/88,187ms≤2500ms.Tính lại từ80samples/run;localFS,không80HTTPusers. |[Raw samples](20261114-load.json),[source/results](20261114-results.json) |

**Chạy lại từ repository root,Node24.15.0:**

```bash
npm ci
npm run test:vt064
npm run test:be07
npm run typecheck && npm run build
node --import tsx scripts/benchmark_vt064.mjs
```

[README](README.md) có lệnh coverage và hướng dẫn tái tạo mutant trong worktree disposable;không áp mutation lên nhánh nộp. [PDF source](report.md) giữ17casefamilies,traceability và reflection314từ. Không tuyên bố upload Classroom,peer review,DB/chain/walletE2E hoặc durability khi mất điện.

<!-- pagebreak -->

# Phụ lục C — test thất bại trước patch

**Source:** `31cd65858a18d5a47862f62321fb3bed09758b4f`. Đây là commit plan/tests, trước runtime fix. Chạy trên worktree sạch từ baseline0328eea, không lấy thay đổi chưa commit ở checkout cá nhân.

**Lệnh chạy:**

```bash
node --import tsx --test tests/indexer/import-encoding.test.ts
```

**Trích kết quả thật:** [20261114-red.log](20261114-red.log). Các đoạn dưới chọn phần counterexamples, counts và nguyên nhân; không phải toàn bộ log hoặc lần chạy mới.

```text
EXIT_CODE=1
✖ invalid_leading_byte
✖ stray_continuation
✖ overlong_slash
✖ encoded_surrogate
✖ above_unicode_max
✖ incomplete_before_ascii
tests 14
pass 7
fail 7
skipped 0
AssertionError [ERR_ASSERTION]: Missing expected rejection:
invalid_leading_byte: bytes=ff
```

Tên/counts/error được giữ từ log; timings và các stack frames được bỏ trong bản trích. Sáu subcases hỏng encoding cộng parent group tạo7checksFAIL, không phải7defects độc lập.

**Vì sao fail đúng lý do?** Bytes hỏng được đặt bên trong JSON string; nếu decode bằng replacement thì JSON vẫn parse được. CLI cũ trả success thay vì reject, nên assert.rejects phát hiện hành vi sai. Không phải lỗi thiếu dependency/module hay JSON luôn sai cú pháp. Valid Unicode, EOF và BOM controls đã chạy trong cùng suite.

**Review patch trước chấp nhận:** [diff đầy đủ](20261114-implementation.patch) chỉ thay cách đọc/đếm raw bytes, decoder fatal có state/EOF flush và test launcher. Không sửa saveDraft, API, database hoặc contract. Decoder không được normalize dữ liệu hoặc âm thầm chấp nhận BOM đầu file.

**Sau patch:** runtime source `8e6f27ac645382901b62e21db8b43b20c19acae8`, [GREEN log](20261114-green.log) ghi21/21PASS,0FAIL/SKIP. Typecheck/build cũng exit0. Counts là Node checks gồm groups/subtests, không phóng đại thành21featurefamilies.

<!-- pagebreak -->

# Phụ lục D — mutation giết được bằng test

**Mutation bắt buộc VT-064:** trả success dù persistence thất bại. Commit local riêng `3e6ce686421c7e79f8beedbac9417958c0008616`, branch experiment/23001850-vt064-false-success-20261114. [Diff gốc](20261114-mutation.patch) được lưu để review; không push code lỗi.

**Thay đổi cố ý trong catch của mkdir:**

```typescript
// Bản đúng:
catch (error) {
  throw new ImportFailure(index, imported, rejected, error);
}
// Mutant:
catch {
  imported.push({ index, id: draft.id });
  continue;
}
```

Đây là trình bày lại cùng thay đổi một dòng trong diff, không phải patch thứ hai. Với destination là regular file, mkdir thất bại; mutant vẫn ghi report imported rồi trả completed dù không có draft được lưu.

**Lệnh chạy trên worktree mutant:**

```bash
node --import tsx --test \
  --test-name-pattern='persistence failure cannot be returned as success' \
  tests/indexer/import.test.ts
```

**Trích lỗi thực:** [mutation.log](20261114-mutation.log).

```text
EXIT_CODE=1
tests 1
pass 0
fail 1
AssertionError [ERR_ASSERTION]: Missing expected rejection.
```

**Control trên source sạch:** [mutation-clean.log](20261114-mutation-clean.log) ghi exit0,1PASS/0FAIL cho cùng test. Git ancestry check xác nhận mutant không thuộc nhánh nộp; clean source vẫn ném ImportFailure và không có success giả. Mutation không phải compile error: test thất bại do hàm trả thành công sai.

**Giới hạn kết luận:** Một mutation bị giết không chứng minh mọi filesystem failure đều được bắt. T08 kiểm thêm write đầu thành công rồi write sau thất bại: file đầu còn nguyên, partial report đúng và không claim các dòng chưa chạy. Crash/power-loss durability vẫn chưa được chứng minh.

<!-- pagebreak -->

# Phụ lục E — coverage, regression và tải

**Coverage tại source8e6f27a:** [log đầy đủ](20261114-coverage.log). Trích số đo V8, không phải phần trăm tự ước lượng:

```text
tests 21
pass 21
fail 0
skipped 0
file        | line % | branch % | funcs % | uncovered lines
cli.ts      |  91.89 |    75.00 |  100.00 | 8-10
drafts.ts   | 100.00 |   100.00 |   90.91 |
all files   |  97.78 |    96.36 |   92.31 |
```

Các số trên không thay disk oracle, mutation hoặc risk coverage. CLI usage path còn thiếu; line/branch100% của drafts không có nghĩa mọi lỗi write/sync/link/unlink đã được fault-inject hay crash-tested.

**Behavior cũ không liên quan:** [BE07 regression](20261114-regression.log) tại8e6f27a:15PASS,0FAIL/SKIP. Git blob của API server, BE07 tests và drafts.ts bằng baseline0328eea. Không sửa assertion cũ để làm xanh; không gọi BE07 unit là PostgreSQL/full-chain acceptance.

**Flaky review:** [replay1](20261114-flaky-1.log) và [replay2](20261114-flaky-2.log) tạib79beda đổi thứ tự test files và concurrency1/4; mỗi lượt3selected checksPASS. Temp directories tách biệt; race chỉ yêu cầu đúng một winner và report khớp file, không pin người thắng. Fixed seed cho phép tái lập, không loại trừ mọi interleaving hoặc dữ liệu ngẫu nhiên khác.

**80 tác vụ đồng thời:** [raw samples](20261114-load.json) giữ80latencies cho từng run; script có8warmups, dùng monotonic clock và ghi/read-back file thật. Ba run riêng đều80complete/0errors; p95 được tính lại bằng sorted samples[75], so ngưỡng2500ms, không lấy trung bình p95 hoặc cộng thành240tasks đồng thời.

**Giới hạn tải:** Một Node process,80logical tasks,1draft/task trên temporary filesystem local. Mốc chung gồm scheduling, write/sync/link và read-back; không phải80HTTPclients,80physicalthreads hoặc load DB/RPC/wallet. Kết quả chỉ đủ cho slice được đo.

**Tái lập và đối chiếu:** [README](README.md) chứa commands, [results.json](20261114-results.json) gắn baseline/sourceSHA/exit codes và [module plan](20261114-module-plan.md) ghi context/prompt/review thật. Không chạy lại runtime tests chỉ để đổi độ dài PDF; tất cả số liệu vẫn thuộc các lượt và source đã nêu.
