# VT-062 — tải local 60 lời gọi trên hook production

Ngày 2026-10-31 UTC. Branch `individual/23001841-vt062-idempotent-retry`; HEAD lúc chạy `d7ecc1cd40d88753a511459fedaf1a0db322f542`, status sạch trước khi tạo harness. Node 24.15.0, Vitest 4.1.12, React 19.2.8, happy-dom 21.0.4. Hook SHA-256 `4cb742fd8f10a08af84c9b5b678541d26070b9e52350b22ebd8213de970d258d`; trang F1 SHA-256 `121365f2fccb44af4df14dc08a7e16708a337c1ae83e1534d81aaad9dce9ff13`. Harness SHA-256 `30c34c52149b9efc2d8f0e9fb94704360d80c2ddc990c061c993b6d75955c383`; config `fa8eed106c95c6b5da1e43c9b42581ad6c1835a24f96bfeab0192c0e55f4f28a`; summarizer `b8dfe6852624ee44f58cace340b4aecd8afde41badd81e0fa760ac36859a51e5`.

## Harness, boundary và oracle

`frontend/scripts/vt062-load.load.tsx` render `useTransaction` thật trong React thật; 60 hook instance riêng được mount trước đo. Nó mock `waitForReceipt` và `send` tại boundary ví/RPC, mỗi fake send trả hash cố định theo run/wave/task. **Không** có map dedup mới trong harness: mọi lời gọi đi vào `transaction.run`; chính `running.current` của hook trả `null` cho các overlap cùng instance. F1 guard của trang không nằm trong phép đo này; nó được chứng minh bởi UI regression riêng.

- **DUPLICATE:** 60 lần `run` cùng request key trên một hook, gọi nối tiếp trong cùng synchronous loop trước khi microtask nào settle. Lần đầu vào `waitForReceipt` và chờ barrier; 59 lần còn lại trả `null` do in-flight. Outcome ghi `receipt_success` cho lần đầu, `blocked_inflight` cho 59 lần. Không có `cached_result`; không gọi null là success.
- **DISTINCT:** 60 request key độc lập trên 60 hook; mỗi task có hash riêng, barrier chỉ mở khi đủ 60 waiter. Oracle so `receipt.transactionHash` với hash fixture từng task; mọi task trả `receipt_success` và mỗi identity có một fake send.
- `peak_logical_inflight` tăng khi gọi run và giảm lúc Promise settle; đạt 60 mỗi wave. `peak_receipt_waiters` quan sát từ fake wait boundary: DUPLICATE 1, DISTINCT 60. Không phải 60 vòng tuần tự.
- Clock monotonic `performance.now()` bắt đầu ngay trước `run`, kết thúc tại Promise settlement. Barrier được mở ngay khi số waiter kỳ vọng vào, không dùng fake timer, sleep, delay cố định hay RPC ngoài. Wall-clock setup/mount/unmount, Vitest startup, ghi CSV và API/chain không nằm trong latency. 10 wave warm-up/workload/run không tính vào p95.

Mỗi trong **3 process độc lập** chạy 10 warm-up +100 measured waves cho cả hai workload; 60 task/wave. Command từng run và exit code ở `load/run-{1,2,3}-command.txt` (đều exit 0). Smoke trước full run chạy 1 warm-up +2 measured wave/run 99 vào `/tmp/vt062-load-smoke`, exit 0; không đưa vào số liệu. Raw `raw-run-{1,2,3}.csv` có 39.600 dòng task: 3.600 warm-up, 36.000 measured. Cột gồm workload, phase, run/wave/task, identity, latency_ms, outcome, error, expected/actual hash, task_send_calls, wave_send_count_at_outcome và peak concurrency. `summary-run-*.json` lưu wave stats; `validation.txt` là output của `scripts/summarize_vt062_load.py` (exit 0) kiểm đủ wave/task/identity/hash/send và tính lại nearest-rank từ CSV. `aggregate.json` lưu SHA-256 mỗi CSV và p50/p95/max.

## Kết quả measured (không trộn outcome)

| Workload/outcome | N | p50 ms | p95 ms | max ms | Tổng fake send | Peak logical/waiter |
|---|---:|---:|---:|---:|---:|---:|
| DUPLICATE, receipt đầu wave | 300 | 0.089555 | 0.184630 | 0.609894 | 300 cả workload | 60/1 |
| DUPLICATE, blocked in-flight | 17,700 | 0.036675 | 0.096189 | 0.399151 | 0 từ task bị chặn | 60/1 |
| DUPLICATE, cached result | 0 | — | — | — | — | — |
| DISTINCT, receipt success | 18,000 | 0.097580 | 0.262156 | 0.484102 | 18,000 | 60/60 |

Theo từng run, p95 DUPLICATE receipt/blocked: run 1 = 0.184630/0.100714 ms; run 2 = 0.174087/0.075767; run 3 = 0.214916/0.105352. P95 DISTINCT receipt: 0.274879, 0.232717, 0.274817 ms. `unexpected_null`, `wrong_receipt`, exception = 0, không loại sample lỗi khỏi mẫu; tất cả 3 run exit 0. Nearest-rank là sorted `N` latency, index `ceil(0.95*N)-1` từ 0. P95 ở harness đều ≤2.000 ms. **Đây không chứng minh SLA 60 người dùng thật**: send/receipt là fake Promise, không có ví extension, RPC, chain finality, indexer/API hoặc F1 trang dưới tải. PostgreSQL local dành cho mutation mapper, còn Anvil/extension wallet sẽ đo boundary khác và không tái hiện 60 người ký độc lập trong bài này.

Các log RED/GREEN, mutation, coverage và flaky trước/sau F1 giữ nguyên riêng; không nhận số fake send là giao dịch chain thật. Không có correctness failure trong workload này; nếu test fail ở run mới, runner exit nonzero và giữ output, không retry để che failure.
