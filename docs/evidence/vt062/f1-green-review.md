# VT-062 F1 — GREEN sau khi receipt H1 thành công nhưng thiếu Proposal ID

Ngày 2026-10-31 UTC. Đây là patch/test do AI thực hiện sau khi sinh viên xác nhận nguyên nhân RED; sinh viên **chưa** review hoặc chấp thuận patch. Không sửa checkout gốc, API mapper, hook dùng chung, contract hoặc indexer.

## Source và diff

- Branch `individual/23001841-vt062-idempotent-retry`; F1 RED HEAD `9e5458f81d13402f4c5120299c54dbc3e59f23c0`; patch/test commit `0d0a5f697f3ccc1a76333177f34508f721e8a2b4`.
- `f1-green-source-identity.txt` có SHA-256 của trang, test, hook, transactions và API mapper. `f1-green-code-tests.diff` là diff thực giữa hai commit. Node 24.15.0, npm 11.12.1, Vitest 4.1.12, happy-dom 21.0.4 theo lockfile.
- Checkout gốc `/mnt/d/dao-budget-simulator` vẫn ở `feature/tv2-be03`, HEAD `4b9f060e8e2bdef7849b09d55ddeaf6a90545d4d` và có nhiều thay đổi sẵn; lượt này không ghi vào đó.

## Review logic F1

| Điểm | Source và test evidence |
|---|---|
| Identity | `CreateProposalPage.tsx:55–60` giữ `requestKey` cũ từ account, wallet chain, deployment chain/ID/governor/treasury và payload đã build (calldata chứa requestId). `:20,61–65,76–78` lưu confirmation theo key, chỉ chặn chính request đó. `:39–44` dùng draft/scope hiện hành để khóa nút/hiển thị đúng confirmation; key trong handler mới là guard thực. Test đổi payload sau success nhận H2 và Proposal ID 43 (`CreateProposalPage.vt062.test.tsx:378–410`); test cũ đổi payload/account khi H1 còn pending vẫn pass. Chưa có test thay deployment runtime. |
| Receipt success thiếu ID | `:73–79` bắt lỗi decoder, giữ `receipt.transactionHash` và `proposalId=null`, refresh sau đó. `:105–108` báo rõ đã xác nhận, ID chưa đọc được, hiển thị H1. F1 RED assertion cũ ở test `:335` giữ nguyên expected send count 1; nay pass. Test mới cho decoder throw cũng pass. |
| Guard không dựa vào disabled | `:61–65` trả về trước `transaction.run` nếu key đã confirmed. Test phát sự kiện submit trực tiếp ở `:336–337`, `:210–215` và `:371–375`; count send vẫn 1, wait không tăng. Nút disabled là bảo vệ UI bổ sung. |
| Refresh/API lỗi | Guard confirmed chạy trước `assertWritable` cho write mới (`:61–67`); lỗi summary không bị biến thành lỗi gửi đối với request đã xác nhận. Test `:340–375` cho auto-refresh và manual refresh reject, vẫn thấy trạng thái success/H1, không gửi ví lần nữa. |
| Timeout/terminal/caller khác | Không đổi `useTransaction.ts` hay `transactions.ts`. Hai RED gốc, F1, unit timeout, revert/cancel/repriced và các caller non-keyed đều thuộc full frontend suite 33/33 pass. Chỉ trang proposal dùng map confirmation này. |

`assertWritable` vẫn kiểm account/chain/deployment/API trước giao dịch mới ở `:66`. Khi thiếu account/deployment, nó chạy sớm ở `:50–53`; nhánh này chưa được test riêng trong F1. F1 test mock boundary ví, summary và decoder; trang và hook thật trong happy-dom. Kết quả không chứng minh extension wallet/RPC thật, trạng thái sau reload/multi-tab hoặc receipt có log sai trong production.

## Commands và kết quả

Mọi lệnh từ clone cá nhân với `PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH`; raw log ghi command, output, `EXIT_CODE`. Các log tên `f1-green-*` không có `final` là lượt đầu trước khi chuyển guard lên trước `assertWritable`; giữ lại như evidence trung gian, **không** dùng làm kết quả source cuối.

| Command sau PATH prefix | Log source cuối | Exit / actual |
|---|---|---|
| `npm run test --prefix frontend -- src/chain/useTransaction.vt062.test.ts src/pages/CreateProposalPage.vt062.test.tsx` | `f1-green-final-original-two.txt` | 0; 13/13 pass, gồm hai RED gốc và F1. |
| `npm run test --prefix frontend` | `f1-green-final-suite.txt` | 0; 33/33 pass, 5 file. |
| `npm run lint --prefix frontend` | `f1-green-final-lint.txt` | 0; 8 warning `wallet.tsx` đã có trước. |
| `npm run build --prefix frontend` | `f1-green-final-build.txt` | 0; TypeScript/Vite pass, warning chunk >500 kB. |
| `npm run test --prefix frontend -- --coverage --coverage.provider=v8 --coverage.include=src/chain/transactions.ts --coverage.include=src/chain/useTransaction.ts --coverage.include=src/pages/CreateProposalPage.tsx --coverage.reporter=text --coverage.reporter=json --coverage.reporter=json-summary --coverage.reportsDirectory=../docs/evidence/vt062/f1-coverage-final` | `f1-coverage-final-run.txt`, `f1-coverage-final/coverage-summary.json` | 0; 33/33 pass. |

## Coverage và flaky checks trên source cuối

V8 line/branch: trang 94.91% / 79.68%; hook 100% / 96.55%; transactions 51.13% / 37.50%; ba module cộng lại 75.13% / 57.46%. Include chỉ ba module trên, exclude phần còn lại của frontend và API; không coi phần trăm là bằng chứng E2E. Dòng trang chưa phủ: fallback thiếu account/deployment `:51–52`, generic form catch `:83`; decoder thật ở `transactions.ts:155–164` không chạy trong page mock. Acceptance F1 được kiểm qua null/throw decoder boundary và submit handler; việc đọc log chain thật còn thiếu.

- Time/network/callback: `f1-flaky-ui-30-final-raw.txt` và TSV tương ứng: 30 process độc lập, 5 UI tests/lượt (có F1, null/throw decoder, refresh, duplicate submit), seeds 62301–62330; 30/30 exit 0, 150/150 test pass. Dùng deferred Promise cho receipt H1 và mock API/wallet; không sleep cố định, không RPC ngoài. Mỗi case reset mocks, unmount React root và remove container.
- Order/shared state: `f1-flaky-suite-6-final-raw.txt` và TSV tương ứng: `--sequence.shuffle --sequence.seed=62401..62406 --no-file-parallelism`, 6 lượt, 33 test/lượt; 6/6 exit 0, 198/198 test pass. Không retry failure để biến thành pass. Đây là sample hữu hạn, không bảo đảm hết flaky trong môi trường ví/API thật.
- Các log `f1-flaky-*` không có `final` là kết quả source trước chỉnh guard, giữ làm lịch sử riêng. Coverage trước F1 trong `coverage/` cũng là lịch sử, không gán cho patch này.

Mutation response-field trước F1: `docs/evidence/vt062/mutation/` chứng minh good-pass/mutant-fail/restored-pass trên PostgreSQL/API thật theo source API SHA-256 `7513723c854f2bfb022aaa6870e6c2dfc465add57e45816eb51d91bb609deaf6`. Mapper/API test không đổi trong commit F1, nên không lặp mutation; đó là evidence trước F1, không phải phép đo mới.

Không chạy tải 60 task, PDF, push, PR hay merge trong lượt này.
