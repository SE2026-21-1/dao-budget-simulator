# Fixture API BE01 cho frontend

**Toàn bộ dữ liệu là tổng hợp, chưa có deployment, receipt, giao dịch hoặc
indexer thật.** Các địa chỉ, hash block/giao dịch, vote, timestamp và operation
được tạo xác định trong script. Không gửi giao dịch đến địa chỉ mẫu. API và
description v1 vẫn là **đề xuất chờ TV1/TV3 review**; xem [đặc tả API](../../docs/api.md).

## Cách dùng

Không cần PostgreSQL, RPC, Foundry hoặc npm package để đọc/kiểm tra fixture.
Dùng Node.js 24 (đã kiểm tra trên 24.15.0), chạy tại thư mục gốc repository:

```sh
node scripts/generate_be01_fixtures.mjs
node scripts/check_be01.mjs
```

Script generate chỉ viết JSON trong `fixtures/api/`, không chạy server, ký giao
dịch, gọi mạng hay xóa file. Script check chạy độc lập, đọc fixture hiện có và
báo lỗi nếu thiếu/thừa JSON, nội dung bị sửa lệch hoặc không khớp generator.
Node.js 24.15.0 đã chạy được hai lệnh này trên môi trường BE01 hiện tại.

[manifest.json](manifest.json) ánh xạ từng request GET, query chính xác, HTTP
status, tình huống (`scenario`) và đường dẫn file. TV3 có thể dùng manifest để
cấu hình mock trong công cụ hiện có, chưa cần backend server. Các route health
và lỗi có cùng request nhưng scenario khác nhau để chọn thử trạng thái vận hành.
Query trong manifest luôn kèm `chainId=31337` và
`deploymentId=synthetic-local-v1`; bỏ `limit` nghĩa là mặc định 20.

## Các nhóm file

| File/thư mục | Dùng làm gì |
|---|---|
| `summary.json` | Tổng quan số dư, tổng vào/ra, count theo state và cấu hình form tạo proposal |
| `proposals-page-1/2/3.json` | 45 proposal duy nhất, đúng 20/20/5; bản ghi đầy đủ giống detail |
| `proposals-state-<State>.json` | Từng bộ lọc trong cả 7 state, count sau lọc |
| `proposals-search-sc01.json` | Tìm chính xác proposalId tham chiếu SC01 |
| `proposals-search-unknown.json`, `proposals-empty.json` | ID đúng nhưng list không có kết quả; bộ lọc AND không có kết quả |
| `proposals/<proposalId>.json` | Chi tiết riêng cho đủ 45 proposal |
| `votes/<proposalId>.json` | Phiếu tương ứng đủ 45 proposal; Pending/Canceled có trang rỗng hợp lệ |
| `transfers-page-1/2.json` | 29 log Transfer BUD, trang 20/9 |
| `transfers-direction-*.json` | Lọc in/out/self, tiếp tục cursor nếu có |
| `transfers-empty.json` | Lọc out + proposalId của proposal Pending nên chưa có giải ngân |
| `health-synced/lagging/not-ready.json` | 200 đồng bộ, 200 chậm và 503 chưa có checkpoint |
| `error-*.json` | ID sai, không tìm thấy, query/cursor sai, snapshot invalid và chưa sẵn sàng |

Mỗi data response dùng chung H=`9000`, hash của H trong `context`, timestamp
`1792300000`, revision `fixture-v1`. Đây là mốc giả cố định để kiểm tra; không
liên quan tip của mạng local đang chạy. Health lagging vẫn phục vụ H này nhưng
pipeline đã quan sát tip mới hơn. Khi chưa có checkpoint, context H/hash/timestamp
và indexedBlock là null, không bịa ra một block dữ liệu.

Proposal giảm dần theo tuple số nguyên
`(created.blockNumber, created.transactionIndex, created.logIndex, proposalId)`;
vote/transfer giảm dần theo `(blockNumber, transactionIndex, logIndex)`.
Cursor là **base64url JSON chưa ký**, chứa chain/deployment, H/hash, endpoint,
filters chuẩn hóa, `limit:20`, `order`, tuple cuối và revision. Đây là ví dụ token
opaque cho mock; frontend chỉ dùng lại nguyên token. Server tương lai phải xác
thực tính toàn vẹn, thời hạn và tính hợp lệ của snapshot, không tin dữ liệu
base64url do client sửa. Đổi filter/scope/limit/H cần bỏ cursor và đọc trang đầu.

## Tiền, ID và tình huống biên

GOV/BUD có 18 decimals. Amount, weight, proposalId và mọi số blockchain là
chuỗi nguyên; generator và checker dùng BigInt để tính. Có cả BUD nguyên,
`0.125` BUD và khoản có thêm 1 wei để phát hiện lỗi `Number`/float. Count,
`decimals`, `support` và page limit mới là JSON number.

Có 7 Executed, 7 Pending, 7 Active và 6 proposal cho mỗi state còn lại. Các
boundary dùng **cùng H**: đúng snapshot vẫn Pending; snapshot+1 là Active;
đúng deadline vẫn Active; deadline+1 có Succeeded/Defeated; ETA−1 Waiting và
đúng ETA Ready. Ready thuộc operation của Queued, không là proposal state.
Quorum bằng 20% của 1.000 GOV sau snapshot; `quorum: null` trước/tại snapshot
vì chưa thể đọc checkpoint quá khứ. For + Abstain tính quorum, For > Against
mới thắng. Execute revert không tạo fixture/state Failed.

Proposal SC01 giữ **nguyên văn** description, descriptionHash, calldata,
requestId, amount, recipient và proposalId:

```text
41188251149770464419086128880638239388642337502157923625475508004855043094545
```

Hash proposal dùng đúng Ethereum Keccak-256 và `abi.encode`, không dùng
SHA3-256. Implementation thuần Node được kiểm tra bằng vector Keccak rỗng,
`abc`, selector disburse và các giá trị tham chiếu SC01 có sẵn. Một description
khác cố ý có whitespace/thứ tự key khác JSON.stringify để phát hiện việc đổi
chuỗi gốc trước khi hash. Có requestId zero và hai proposal chung requestId;
chỉ một trong hai được Executed. Ba ID proposal/request/operation luôn tách biệt.

Operation dùng hash hợp lệ
`keccak256(abi.encode(targets, values, calldatas, predecessor, salt))`, với
predecessor zero và **salt tự chọn riêng cho fixture**:

```text
salt = keccak256(UTF8("be01:synthetic:chosen-operation-salt:" + proposalId))
```

Không khẳng định đây là thuật toán salt của Governor thật, cũng không giả định
salt = descriptionHash. Cần đối chiếu module OpenZeppelin/receipt SC06 khi có
Governor và Timelock được triển khai.

## Đối soát dòng tiền

Ledger có 20 khoản nạp dương, 1 Transfer zero, 7 giải ngân Executed và 1 chuyển
Treasury → Treasury. Self Transfer không tăng totalIn/totalOut. Chỉ Transfer BUD
được tính tiền; BudgetDisbursed chỉ có vai trò liên kết requestId và không được
cộng thành lần chi thứ hai. Tổng từ đầu bộ mẫu đến H:

| Giá trị | Đơn vị BUD nguyên nhỏ nhất (18 decimals) |
|---|---|
| `totalIn` | `11902375000000000000000` |
| `totalOut` | `1267250000000000000002` |
| `balance` | `10635124999999999999998` |

Các tổng đều nhỏ hơn nguồn cung BUD 20.000; balance không trừ ngân sách của
Pending/Active/Queued. Recent activity là 5 Transfer mới nhất, cùng dữ liệu
trong lịch sử treasury. Mỗi khoản out liên kết đúng proposal, request, recipient,
amount và synthetic executed transactionHash.

Checker xác minh JSON/shape/kiểu dữ liệu, hash và ID, state theo clock tại H,
quorum/vote totals, operation/ETA, log chống trùng và vị trí transaction nhất
quán, list/detail/summary, filter, cursor và không mất/trùng giữa các trang.
Kiểm tra này không chứng minh migration PostgreSQL chạy được, dữ liệu chain
đúng, hiệu năng HTTP hay indexer/reorg hoạt động. Các hạng mục đó có quy trình
riêng trong [checklist BE01](../../docs/be01-checklist.md).
