# Coverage audit trước khi thêm BE08

Base BE07: `2adcbfac24fa34da9f76673a2404ef71dd3cb804`. TV4 đối chiếu:
`213f9f7e8d88a65866861da1df8c95800cd1004e`. Đây là kiểm kê source,
không gán PASS từ evidence lịch sử. Kết quả chạy mới nằm trong report từng lượt.

| Yêu cầu | Test hiện có trên BE07 | Khoảng trống / quyết định BE08 |
| --- | --- | --- |
| Decoder, chain/address/ABI | `config.test.ts`, `decoder.test.ts`, `reader.test.ts`, `cli.test.ts`; vector WithParams, uint256, topics/data hỏng, sai chain/scope | Kế thừa và chạy lại, không nhân bản |
| Database sạch, 005 | API và BE07 DB suites tự áp dụng 001–005; BE06 rebuild áp dụng 004/005 | Runner benchmark TV4 chỉ có 001–004; cần sửa và xác minh gate/heartbeat thật |
| Idempotency, K, checkpoint/crash | `syncer.test.ts`, `checkpoint-storage.test.ts`: K=0/2, SQL/COMMIT fail, competing writers, SIGKILL trước/sau COMMIT | Kế thừa; chạy DB mới |
| Biên trạng thái, BUD không tính đôi | `projection.test.ts`, `projection-storage.test.ts`, live BE04: S/S+1/D/D+1/ETA-1/ETA, Transfer/BudgetDisbursed, receipt revert | Kế thừa, không bổ sung cùng assertion |
| 45 proposal 20/20/5; filter/cursor | `tests/api/server.test.mjs`: numeric keyset, filter/limit/route/scope/hash/revision, cache, tamper, publication advance | Kiểm hồi quy cảnh báo raw vượt publication; test hiện cho phép nhãn synced khi projection chậm |
| Reorg nông/sâu, rollback/replay/gate | `be07.test.ts`, `be07-db.test.mjs`, `check_be07_live.mjs`: real Anvil, 5 SIGKILL boundary, 409/503, deep rebuild_required | Kế thừa mọi kiểm tra; không thay bằng benchmark |
| Rebuild mới/compare H/hash | `be06.test.ts`, `be06-db.test.mjs`, live BE07 rebuild fresh DB và compare canonical | Kế thừa và chạy lại |
| NFR02 | TV4 `benchmark_api.mjs`, historical 25/10: 100 proposal/1000 vote giao dịch thật | Chọn runner/fixture, thêm 005, worker, warm-up, transfers trong mix, health riêng, raw/error/body validation |
| NFR03/04 | Live BE07 có một sample + RPC503 >31s, unit retry/abort/permanent error | Nhiều sample đủ K → publication/API ở idle và 10 client; vận hành worker CLI mặc định; ghi retry/outage riêng |
| NFR07/evidence | CI build/typecheck/contracts/invariants/indexer/API/reorg | Bổ sung job BE08/artifact; local uncommitted source manifest + patch; remote BE08 chưa chạy |

Không có AGENTS.md trong base/checkout hoặc thư mục cha; đã đọc AGENTS.md trực tiếp
từ ref TV4 để kiểm quy ước tích hợp. Không import frontend/contracts. Tài liệu TV2
không có trong các ref đã fetch/code search; dùng yêu cầu gốc và issue #18 làm
căn cứ bổ sung, chờ đường dẫn người dùng cung cấp nếu có.
