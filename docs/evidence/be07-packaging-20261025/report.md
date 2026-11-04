# BE07 — Audit trước Draft PR, 25/10/2026

Đợt này được người dùng cho phép commit, push `feature/tv2-be07` và mở Draft PR;
không merge/force-push/đóng issue/bình luận. Chỉ worktree BE07 được chỉnh sửa;
checkout cũ `docs/add-requirements` và `.gitignore` CRLF của người dùng được giữ.
Không có AGENTS.md tại repo/các thư mục cha. Đã đọc docs/be07.md và report local.

Fetch lại: `origin/Dev=1451779` vẫn thiếu BE05/BE06; BE06 vẫn
`c41a9ab97ad24d9b156eb03baa504dff43b165ec`; TV4 đã tiến tới `cf7f71f`.
`merge-base --is-ancestor` BE05/BE06 với Dev đều exit 1. PR xếp chồng trên
**feature/tv2-be06**; không merge dependency hoặc sửa lịch sử nhánh cũ.

## Evidence nền được xác minh

[Local report trước audit](../be07-20261025/report.md) có 133/133 unit,
65 PostgreSQL case (21+16+10+3+1+14), tất cả command run-7 exit 0 trên PG18.4.
Các hash implementation/test/CI/config khớp tested-source.json trước audit.
Anvil/BE06 compare equal ở H67/hash canonical; 5 ranh giới SIGKILL BE07,
normal RPC sample 180 ms và outage 31176 ms khớp JSON/log thật.
Evidence TV4 là kế thừa; không cộng vào kết quả local mới. Không nhận SLA NFR03
ở tải lớn từ một sample local. Raw logs trước audit được giữ nguyên.

## Findings và sửa bổ sung

1. **Gate sau mismatch:** recovery gọi RPC kiểm tra chain ID trước transaction
   lưu gate. Nếu request này lỗi, API còn có thể thấy ready trên publication
   orphan. Gate/revision/invalidation nay commit trước request RPC tiếp theo.
   Caller sync/project đã kiểm tra chain và hash; recovery vẫn kiểm tra chain ID
   trước mọi rollback. Wrong chain hoặc RPC lỗi không xóa raw/model; gate đóng.
2. **Heartbeat chờ DB lock:** trước đây lastCheckedAt lấy clock tại lúc UPDATE,
   có thể biến một quan sát RPC cũ thành mới sau khi đợi writer. Nay giữ thời
   điểm RPC đã hoàn tất trước khi đợi connection/lock. Test PostgreSQL giữ khóa
   thật để xác minh thời điểm này, không dùng last commit làm heartbeat.
3. **Lag JSON null:** COALESCE không coi JSON null là SQL NULL. Nay NULLIF xử lý
   đúng để lagSince khởi tạo và giữ mốc qua nhiều lượt observe.
4. **Shorter fork cuối batch:** header checkpoint vừa commit có thể biến mất;
   nhánh catch trước đây dừng bằng RPC_INVALID_DATA trước recovery. Nay xác minh
   header thấp hơn; chỉ khi có hash mismatch mới recovery/retry, giữ gate đóng.
5. **Cursor padding:** API từng chấp nhận base64url không canonical nhưng giải
   mã cùng HMAC bytes, làm test tamper không ổn định. Nay từ chối padding alias
   cho payload/signature; cursor hợp lệ và error contract BE05 giữ nguyên.

Bốn regression đầu được chạy **trước sửa**: [before-fix/be07-db.txt](before-fix/be07-db.txt)
14 pass/4 fail. Chúng dùng PostgreSQL thật và RPC synthetic. API regression lần
đầu bắt được lỗi padding thật, được giữ trong after-fix/api-db.txt; không đổi
kết quả lỗi đó thành PASS. Suite API cuối xác minh alias cùng bytes vẫn trả
INVALID_CURSOR và summary/detail/proposals/votes/transfers/health/cached cursor
đều bị gate trong recovering/replaying/rebuild_required.

## Kiểm thử lại có chọn lọc

Không chạy lại toàn bộ test khi không cần. Chỉ chạy các phần chịu ảnh hưởng:

| Kiểm tra | Kết quả cuối | Evidence |
|---|---|---|
| BE03 + BE07 unit | 37/37 | after-fix/affected-unit.txt |
| BE07 PostgreSQL | 18/18 | after-fix/be07-db.txt |
| API PostgreSQL + HTTP | 4/4 | api-final/api-db.txt |
| Typecheck/build | exit 0 | api-final/typecheck.txt, build.txt |
| Real Anvil recovery, publication SIGKILL, worker outage và BE06 compare | PASS | after-fix/live.json |

PostgreSQL 18.4, Node24.15.0, Foundry/Anvil1.8.5. Driver tạo cluster/DB mới trên
loopback và stop sau mỗi lượt; runtime/commands/exit code/pg-stop nằm cạnh log.
[audit-runner.mjs](audit-runner.mjs) lưu harness thực chạy; môi trường/path trong
đó thuộc máy này, lệnh portable TV4 ở docs/be07.md.

Live sau sửa: H67/head69 hash cũ
`0x1ffdb8c04782d161900c3674f6b4d8d07939b2b2e5ad4caaa013d40ed6677bfe`,
tổ tiên H19
`0xe2eac13de4e6a65280987297853756db6b017708de411219bdbf6b17c25c963e`,
canonical H67
`0xfe4659502dcd6f21b40d2dfab613cd0eb6260a2414ad8eaeed88ff40156ecd36`.
Compare BE06 equal, quỹ9996 BUD, 1 proposal/1 vote/1 operation/3 Transfer/
1 disbursement. Normal event sample177 ms; RPC503 outage31171 ms chuyển lagging,
rồi synced sau phục hồi. Deep fork vẫn rebuild_required/HTTP503.
Live này chạy trước chỉnh sửa decoder padding cuối; API4/typecheck/build được
chạy lại sau decoder. Decoder mới giữ cursor canonical do API sinh ra.

## Kết luận audit và giới hạn

Gate bền vững precedes RPC search; rollback raw/derived/checkpoint/publication
scoped theo deployment, giữ prefix/metadata; lock chung và revision CAS chặn
writer/recovery cũ. BE04 chỉ mở gate cùng publication sau reconciliation H/hash.
Deep rebuild_required bị chặn ở sync/project/API, không tự trở lại synced.
Retry transport có giới hạn/backoff/jitter/timeout/abort; lỗi config/chain/data
vĩnh viễn dừng. Idle freshness dùng thời điểm RPC verification, không timestamp
commit. NFR03 vẫn chỉ được đo trên workload local, không phải SLA tải lớn.

Snapshot source tại [final-tested-source.json](final-tested-source.json), hashes
bổ sung tại audit-tested-source.json; diff/review và secret scan trong
[precommit-checks.json](precommit-checks.json). Report/tài liệu kết quả viết sau
kiểm thử được phân biệt với hash implementation đã kiểm thử.

CI remote và nghiệm thu TV4 độc lập **chưa đạt tại thời điểm chuẩn bị commit**;
CI chỉ được báo theo đúng SHA vừa publish trong PR/final report. Không coi
queued/running là PASS. Không chuyển sang BE08, không dùng testnet hoặc DB đang dùng.

Secret scan: Gitleaks8.30.1 trên toàn bộ file staged mới/sửa, raw exit1 với248
finding generic-api-key. Triage từng line xác nhận chúng là token contract address
public local hoặc SHA-256 source fingerprint; 0credential xác nhận. Giữ raw exit1
và report redacted; không allowlist/suppress để biến scanner thành PASS. Scan/triage
metadata được sinh sau scan, không tự nhận đã scan chính nó.
Whitespace check cho code/docs/JSON đạt; raw stdout và context dòng trống trong
.patch có whitespace nguyên bản, được giữ để không phá log/checksum. Full cached
check báo các artifact này; không sửa log rồi vẫn gọi là output nguyên bản.
