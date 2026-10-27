# API đọc DAO Budget Simulator — hợp đồng BE01/BE05 cho TV3

**BE05 triển khai sáu endpoint đọc bên dưới.** TV1/TV3 vẫn cần review clock/quorum,
salt, shape và cách dùng cursor trước khi chốt hợp đồng consumer. BE04 có
[projection publication tại H](be04.md); BE05 chỉ phục vụ publication đã commit.
BE02/BE03 cung cấp raw storage/checkpoint; raw checkpoint không được dùng để gắn
nhãn cho projection BE04 cũ.
[Fixture](../fixtures/api/README.md) vẫn là dữ liệu tổng hợp; địa chỉ, block,
hash và operation trong fixture không chứng minh deployment/giao dịch thật.
Không gửi giao dịch đến địa chỉ fixture.

API chỉ đọc, không giữ private key, ký giao dịch, giữ chỗ ngân sách hay quyết định
quyền chi tiền. Ví gửi propose/vote/queue/execute/cancel trực tiếp qua Governor.
Tất cả endpoint dưới đây là `GET`, trả JSON UTF-8, không yêu cầu kết nối ví.

## 1. Quy ước chung

| Quy ước | Ý nghĩa |
|---|---|
| Base path | `/api`; API chỉ đọc |
| `chainId` | Chuỗi số nguyên thập phân, bắt buộc để tránh đọc nhầm mạng |
| `deploymentId` | Mã deployment do cấu hình nhóm cấp, bắt buộc; không tự chọn bản deploy mới nhất |
| `asOfBlock` | Block H của snapshot nhất quán; chuỗi số nguyên |
| `asOfBlockHash` | Hash canonical tại H; dùng kèm `asOfBlock` để ghim cùng nhánh chain |
| `snapshotRevision` | Phiên bản dữ liệu phục vụ, đổi khi rebuild/reorg làm mất tính hợp lệ của snapshot |
| Số on-chain | Chain ID, block/index, timestamp, amount, weight, proposalId, tham số uint256 là **chuỗi số nguyên**, không phải JSON number |
| Số trình bày | `decimals: 18`, `support: 0/1/2`, count, page limit là JSON number; không dùng các số này để chứa tiền |
| Địa chỉ/hash | Địa chỉ `0x` + 40 hex, bytes32/hash `0x` + 64 hex; ví dụ chuẩn hóa chữ thường |
| `proposalId` | Chuỗi thập phân canonical `0` hoặc `[1-9][0-9]*`, trong `[0, 2^256-1]`; không chấp nhận hex, dấu, khoảng trắng, exponent hoặc số có zero đầu |
| `requestId` | bytes32 của khoản chi; có thể lặp giữa proposal và có thể bằng zero theo SC01 |
| `operationId` | bytes32 operation Timelock, khác `requestId` và `proposalId` |

Tất cả lượng GOV/BUD dùng đơn vị nhỏ nhất 18 decimals: `"1000000000000000000"`
là 1 BUD, `"1250000000000000000"` là 1,25 BUD. Frontend dùng BigInt/thư viện
định dạng đơn vị; không chuyển qua `Number`, `parseFloat` hoặc phép nhân số thực.
`asOfTimestamp`, `snapshot`, `deadline`, `queuedAt`, `eta` là giây Unix dạng chuỗi;
`lastIndexedAt` là thời gian vận hành ISO 8601 UTC.

`description` là nguyên văn chuỗi UTF-8 nhận từ `ProposalCreated`.
`descriptionHash = keccak256(bytes(description))`; không parse rồi stringify
lại. `title` và `body` chỉ là trường hiển thị trích xuất, có thể null khi không
hiểu version/JSON; frontend vẫn hiển thị description an toàn dưới dạng text.
Description v1, cách đếm Unicode và cách sinh requestId vẫn **chờ nhóm review**
theo [chuẩn SC01](contracts.md). API không nâng các đề xuất đó thành quyết định đã duyệt.

EVM có thể chứa description không biểu diễn được bằng PostgreSQL TEXT (NUL hoặc
byte UTF-8 không hợp lệ). Database giữ nguyên bytes trong `description_bytes`
và raw log; không thay byte rồi tính lại hash. BE01 chỉ đặc tả response có text
UTF-8 nguyên vẹn; trường hợp không phục vụ nguyên vẹn phải báo `DATA_NOT_READY`
và chờ TV1/TV3 chốt cách cung cấp raw hex, không trả text đã sửa dưới hash cũ.

## 2. Snapshot, đồng bộ và phân trang

Request đầu tiên truyền `chainId`, `deploymentId`; nếu không có H, server chọn
publication BE04 mới nhất đã commit. Client nên giữ cả `asOfBlock` và
`asOfBlockHash` để ghim các endpoint trong một lượt xem. `asOfBlockHash` không
được đứng một mình. API không gọi RPC để chọn H và không đọc raw checkpoint cao
hơn rồi gắn nhãn cho projection cũ.
Frontend dùng lại cả H/hash cho summary, list, detail, votes và transfers của
cùng lượt xem. H phải thuộc deployment và còn dữ liệu lịch sử để phục vụ.
Mỗi request đọc trong transaction `REPEATABLE READ`; không trộn dữ liệu sau H.

BE04 hiện chỉ giữ publication mới nhất. Vì `REPEATABLE READ` không giữ snapshot
giữa các HTTP request, BE05 lần đầu sao chép publication và các hàng
proposal/vote/Transfer vào `api_read_snapshots` và các bảng `api_read_*` trong
cùng transaction. Bản sao bất biến có TTL mặc định 900 giây; request kế tiếp
tra theo deployment + H/hash/revision hoặc snapshot ID trong cursor. Projection
tiến lên H+1 không đổi trang cũ. Cursor HMAC-SHA256 ký bằng `API_CURSOR_SECRET`
(ít nhất 32 byte), ràng buộc endpoint, scope, H/hash, revision, filter, limit,
tuple cuối và thời hạn. Hết TTL, bị xóa, revision đổi, raw vào
`rebuild_required` hoặc hash H không còn khớp thì API báo lỗi, không chuyển
cursor sang H mới. H lịch sử chỉ phục vụ được khi snapshot API đã được lưu và
chưa hết hạn; BE05 không dựng lại read model lịch sử từ raw. Snapshot hết hạn
được dọn khi tạo snapshot mới, không xóa dữ liệu BE02–BE04.

Mọi phản hồi dữ liệu có envelope:

```json
{
  "context": {
    "chainId": "31337",
    "deploymentId": "synthetic-local-v1",
    "asOfBlock": "1000",
    "asOfBlockHash": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "asOfTimestamp": "1792300000",
    "snapshotRevision": "fixture-v2",
    "dataKind": "synthetic",
    "sync": {
      "status": "synced",
      "headBlock": "1002",
      "confirmedBlock": "1000",
      "indexedBlock": "1000",
      "lagBlocks": "0",
      "lagSeconds": null,
      "confirmations": "2",
    "lastIndexedAt": "2026-10-18T03:46:40Z"
    }
  },
  "data": []
}
```

Các con số trên chỉ minh họa envelope; mốc H thực tế của bộ mẫu nằm trong
fixture, không lấy ví dụ này làm chain receipt. Server trả `dataKind: "chain"`
và `stateSource: "contract"`; fixture vẫn dùng `synthetic`.

| Trường đồng bộ | Ý nghĩa |
|---|---|
| `status` | `synced`, `lagging` hoặc `not_ready`; `lagging` nếu heartbeat quá 30 giây, raw chưa tới confirmed block, hoặc publication chưa tới raw checkpoint |
| `headBlock` | Tip được BE03 ghi nhận ở lần sync gần nhất; không phải phép thăm dò RPC trực tiếp |
| `confirmedBlock` | Block cao nhất đủ K xác nhận, quy ước `max(headBlock-K, 0)`; testnet demo K=2 |
| `indexedBlock` | Checkpoint đã commit, không phải block đang xử lý dở |
| `lagBlocks` | `max(confirmedBlock-indexedBlock, 0)`; không tính K block đang chờ xác nhận |
| `lagSeconds` | Chuỗi số nguyên không âm: giá trị lớn nhất giữa tuổi heartbeat đã xác minh và chênh lệch timestamp của observed head với publication mới nhất. Nếu chưa giữ header của observed head, dùng raw checkpoint timestamp để đo projection delay và tuổi heartbeat làm tín hiệu freshness; null khi chưa có raw checkpoint. Fixture cũ vẫn có thể null |
| `confirmations` | K cấu hình, chuỗi số nguyên |
| `lastIndexedAt` | Heartbeat raw-sync đã xác minh canonical H thành công (`checkpoints.updated_at`), kể cả chu kỳ idle không có block mới; null nếu chưa từng có |

Mốc H là mốc dữ liệu đang xem; sync mô tả pipeline/publication gần nhất, có thể
mới hơn H. API không probe RPC và không biết RPC hiện tại còn truy cập được hay
không. `lagSeconds` là **chỉ báo freshness**, không phải độ trễ event chính xác,
không lấy tuổi wall-clock của một H lịch sử làm độ trễ pipeline. Timestamp delay
có thể gồm thời gian chờ K xác nhận. Các chênh lệch âm do clock skew được chặn
ở zero. Heartbeat hơn 30 giây hoặc timestamp delay hơn 30 giây luôn chuyển sync
thành `lagging`, ngay cả khi `lagBlocks="0"`; snapshot/cursor cũ vẫn giữ nguyên
số liệu tài chính tại H nhưng dùng trạng thái sync hiện tại.

Frontend tự kiểm tra health mỗi 5 giây, cảnh báo tiếng Việt khi sync `lagging`
hoặc `lagSeconds>30`, và bỏ cảnh báo khi heartbeat/publication phục hồi, không
cần tải lại trang. Dùng CLI `--watch` với `toBlock="latest"` để đồng bộ rồi
project tuần tự liên tục; `INDEXER_POLL_INTERVAL_MS` hoặc `--poll-interval-ms`
đặt chu kỳ 100–60000 ms (mặc định 5000 ms).
Health degraded là cảnh báo freshness, projection lag hoặc raw decode issue,
không tự chứng minh RPC đang down. Publication `rebuild_required` vẫn trả 503,
không che việc invalidation bằng dữ liệu snapshot cũ. Khi chưa có checkpoint,
H/hash/timestamp, indexedBlock và các độ trễ không biết được là null; không giả
mạo H bằng zero. Khi chưa có observed head, head/confirmedBlock cũng null.

List, votes và transfers dùng `limit` mặc định 20, phạm vi 1–100, cùng `cursor`:

```json
"pagination": { "limit": 20, "totalCount": 45, "nextCursor": "opaque-token" }
```

- `totalCount` là tổng kết quả **sau bộ lọc tại H**, không phải độ dài trang.
- Trang cuối/rỗng có `nextCursor: null`; không có prevCursor/offset.
- Proposal sắp giảm dần theo `(created.blockNumber, transactionIndex, logIndex, proposalId)`.
  Vote và transfer giảm dần theo `(blockNumber, transactionIndex, logIndex)`.
  So sánh số nguyên, không so sánh chuỗi theo bảng chữ cái.
- Cursor giữ chain/deployment, H/hash/revision, endpoint, bộ lọc chuẩn hóa,
  limit, thứ tự và khóa mục cuối. Trang kế dùng phép so sánh nhỏ hơn tuple cuối;
  giữ nguyên bộ lọc/limit/scope, không tự chuyển sang checkpoint mới.
- Server phải xác thực cursor trước khi dùng; bản triển khai có thể dùng HMAC
  hoặc token lưu phía server. Base64url trong fixture là token minh họa **chưa ký**,
  không phải cơ chế tin cậy để sao chép vào production.
  BE05 dùng HMAC-SHA256; cả payload lẫn signature phải là base64url canonical.
  Chuỗi đổi unused padding bits dù giải mã ra cùng signature bytes vẫn bị từ chối.
- Cursor malformed/hết hạn/không xác thực trả 400 `INVALID_CURSOR`.
  Thay H, deployment, endpoint, filter hoặc limit trả 400 `CURSOR_CONTEXT_MISMATCH`.
  Hash bị reorg hoặc revision bị rebuild thay thế trả 409 `SNAPSHOT_INVALIDATED`;
  frontend bỏ cursor và tải lại từ trang đầu.
- H lớn hơn checkpoint hoặc chưa rebuild đủ trả 503 `DATA_NOT_READY`;
  H ngoài cửa sổ lịch sử trả 409 `SNAPSHOT_UNAVAILABLE`. Không trả trang hiện tại
  dưới nhãn một H cũ không còn dựng được.

## 3. Các endpoint

### GET /api/summary

Ví dụ: `/api/summary?chainId=31337&deploymentId=synthetic-local-v1`.
Chấp nhận các tham số snapshot chung, không phân trang.
200 trả `data` có các trường sau, xem [summary.json](../fixtures/api/summary.json).

| Trường | Ý nghĩa |
|---|---|
| `treasury.address` | Địa chỉ Treasury thuộc deployment |
| `treasury.token` | `{address, symbol: "BUD", decimals: 18}` |
| `treasury.balance` | Số dư BUD tại H, đối chiếu balanceOf(H) ở bước chain integration |
| `treasury.totalIn`, `totalOut` | Tổng BUD vào/ra từ deployment đến H, **chỉ từ Transfer** |
| `proposalCounts.total`, `byState` | Tổng proposal và count của cả 7 state tại H |
| `governance.governor`, `timelock` | Địa chỉ dùng cho tích hợp ví |
| `governance.govToken` | `{address, symbol: "GOV", decimals: 18}` |
| `governance.clockMode` | `mode=timestamp`; thời điểm proposal tính bằng giây |
| `governance.proposalThreshold`, `totalSupply` | GOV đơn vị nguyên nhỏ nhất, ngưỡng tạo và tổng cung cấu hình |
| `governance.quorumNumerator`, `quorumDenominator` | Cấu hình quorum (demo 20/100); quorum thật mỗi proposal lấy tại snapshot |
| `governance.votingDelay`, `votingPeriod`, `timelockDelay` | Thời lượng giây dạng chuỗi; demo 60/300/120 |
| `recentActivity` | Tối đa 5 Transfer mới nhất tại H, `{type: "Transfer", ...Transfer}`; các trường Transfer mô tả ở endpoint treasury |

Transfer Treasury → Treasury hiển thị `direction: "self"` và không tăng totalIn
hoặc totalOut. Mint BUD vào Treasury tính là vào quỹ. Transfer token khác/native
coin không tính BUD. `BudgetDisbursed` chỉ nối request với Transfer, không là
một khoản trừ thứ hai. Đề xuất Pending/Active/Queued không giữ chỗ hay trừ số dư.

### GET /api/proposals

Ví dụ: `/api/proposals?chainId=31337&deploymentId=synthetic-local-v1&limit=20&state=Active`.

| Query thêm | Quy tắc |
|---|---|
| `state` | Tùy chọn, đúng một trong Pending/Active/Succeeded/Defeated/Queued/Executed/Canceled; phân biệt hoa thường |
| `proposalId` | Tùy chọn, tìm chính xác ID canonical decimal uint256; không tìm một phần chuỗi |
| `limit`, `cursor` | Phân trang như mục 2 |

Có cả hai filter thì áp dụng AND. State không hợp lệ trả 400 `INVALID_ARGUMENT`;
ID sai định dạng trả 400 `INVALID_PROPOSAL_ID`. ID đúng nhưng không có kết quả
trong **list** trả 200 với `data: []`, count 0, cursor null. Chi tiết của cùng ID
không tồn tại trả 404. Các trang chuẩn là
[trang 1](../fixtures/api/proposals-page-1.json),
[trang 2](../fixtures/api/proposals-page-2.json),
[trang 3](../fixtures/api/proposals-page-3.json).

200 trả envelope + `data: Proposal[]` + pagination. Shape Proposal đầy đủ giống
detail để TV3 dùng chung kiểu dữ liệu; đây là lựa chọn BE01 chờ TV3 review về
dung lượng response.

### GET /api/proposals/:id

`:id` là proposalId decimal uint256; cùng query snapshot chung.
200 trả `data: Proposal`; 400 nếu ID sai, 404 `PROPOSAL_NOT_FOUND` nếu proposal
không có trong deployment tại H (kể cả được tạo sau H).

| Trường Proposal | Ý nghĩa |
|---|---|
| `proposalId`, `requestId` | Hai định danh riêng biệt như mục 1 |
| `proposer`, `recipient`, `amount` | Người đề xuất, địa chỉ nhận và khoản chi BUD dương |
| `description`, `descriptionHash`, `title`, `body` | Nguyên văn để hash và các trường chỉ phục vụ hiển thị |
| `targets`, `values`, `calldatas` | Mảng đúng một lời gọi disburse Treasury; native `values: ["0"]`; không phải tiền BUD |
| `snapshot`, `deadline` | Mốc timestamp của Governor, chuỗi số nguyên |
| `state` | Một trong 7 state, được xác định tại H |
| `stateSource` | Chain: `contract`, được BE04 đối chiếu ở H; fixture dùng `synthetic` |
| `votes.against`, `for`, `abstain` | Tổng weight GOV của từng lựa chọn tại H |
| `votes.quorum` | Ngưỡng GOV tại snapshot; For + Abstain tham gia quorum; null khi snapshot chưa là quá khứ tại H, không giả nhận dữ liệu checkpoint tương lai |
| `operation` | null trước queue; sau queue là object bên dưới |
| `created` | `{blockNumber, blockHash, transactionHash, transactionIndex, logIndex}` của ProposalCreated |
| `transactions` | `{created, queued, executed, canceled}` hash giao dịch thành công hoặc null; created khớp `created.transactionHash` |

Operation có `{operationId, queuedAt, eta, status, predecessor, salt}`.
`status` là `Waiting`, `Ready`, `Done` hoặc `Canceled`; Ready thuộc operation của proposal
Queued. `predecessor`/`salt` phải lấy đúng cách Governor tích hợp Timelock,
**không giả định salt bằng descriptionHash**. Fixture tự chọn salt được ghi rõ
trong README, không khẳng định đó là thuật toán Governor thật.

State không chỉ được cập nhật khi nhận event. Với clock timestamp, tại H:

1. Xét các event execute/cancel/queue và trạng thái contract đến H, không dùng
   event sau H; Governor `state(..., blockTag=H)` là đối chiếu cuối cùng.
2. Khi chưa kết thúc/cancel/queue: `clock(H) <= snapshot` là Pending;
   `snapshot < clock(H) <= deadline` là Active.
3. Sau deadline: Succeeded nếu For + Abstain >= quorum và For > Against;
   còn lại Defeated. Quorum dựa tổng cung quá khứ tại snapshot.
4. Operation Queued chưa done là Ready khi timestamp(H) >= ETA, nếu chưa đến
   là Waiting. Execute revert không phát log thành công, không đổi thành Failed.

Pending (kể cả tại đúng snapshot) chưa đọc được `getPastTotalSupply(snapshot)`;
`votes.quorum` là null cho đến khi `clock(H) > snapshot`. Canceled cũng có thể
null nếu bị hủy trước mốc này. Cấu hình tỷ lệ quorum vẫn có trong summary để
hiển thị thông tin, không biến ước lượng thành ngưỡng đã đối chiếu on-chain.

Chi tiết có thể hiển thị transaction hash thành công và lịch sử phiếu qua
endpoint votes. Lỗi giao dịch chưa được đưa lên chain/revert do ví xử lý ở FR12,
không giả nhận raw event hoặc thêm state Failed vào read API.

### GET /api/proposals/:id/votes

Cùng snapshot, quy tắc ID, `limit`, `cursor`; không có bộ lọc `state`.
Phải kiểm tra proposal tồn tại tại H trước khi đọc votes. Proposal tồn tại chưa
có phiếu trả 200 trang rỗng; proposal không tồn tại trả 404.

200: `data: Vote[]` + pagination. Mỗi Vote có:

| Trường | Ý nghĩa |
|---|---|
| `proposalId`, `voter` | Proposal và ví bỏ phiếu, một lần/ví/proposal |
| `support` | 0 = Against, 1 = For, 2 = Abstain |
| `weight` | GOV voting power đã delegate **tại snapshot**, chuỗi nguyên; có thể bằng zero |
| `reason` | Chuỗi nguyên văn từ event, có thể rỗng |
| `blockNumber`, `blockHash`, `transactionHash`, `transactionIndex`, `logIndex` | Nguồn log và khóa thứ tự ổn định |

Tổng weight của mọi trang phải bằng ba tổng trong detail tại cùng H. Không thay
weight bằng balance hiện tại của ví. [Thư mục votes](../fixtures/api/votes/)
có ví dụ tương ứng từng proposal.

### GET /api/treasury/transfers

Cùng snapshot, `limit`, `cursor`, thêm `direction=in|out|self` tùy chọn;
bỏ direction nghĩa là tất cả. Giá trị khác trả 400 `INVALID_ARGUMENT`.
`proposalId` tùy chọn tìm chính xác các Transfer đã liên kết proposal đó;
áp dụng AND với direction, ID sai trả 400 `INVALID_PROPOSAL_ID`.
Proposal chưa giải ngân hoặc chưa có khoản liên kết trả 200 trang rỗng.
200: `data: Transfer[]` + pagination, chỉ BUD và có liên quan Treasury deployment.

| Trường | Ý nghĩa |
|---|---|
| `token`, `from`, `to`, `amount` | BUD address, bên gửi/nhận, lượng nguyên không âm (bao gồm zero) |
| `direction` | `in`, `out` hoặc `self` nhìn từ Treasury |
| `proposalId`, `requestId` | null với nạp quỹ/chưa liên kết; ID khi BudgetDisbursed được đối chiếu Transfer thành công |
| `blockNumber`, `blockHash`, `transactionHash`, `transactionIndex`, `logIndex` | Log Transfer nguồn, không dùng logIndex của BudgetDisbursed |

Đếm tổng từ dòng Transfer duy nhất. Event Treasury phải cùng transaction, đúng
token/recipient/amount và được đối chiếu chặt; không đoán liên kết chỉ bằng amount.
Nếu không đối chiếu được thì đánh dấu dữ liệu chưa sẵn sàng/đối soát, không tự
tạo khoản tiền. Fixture có Transfer zero để kiểm tra UI và schema.

### GET /api/health

Yêu cầu `chainId`, `deploymentId`; không phân trang, không nhận filter hoặc H
lịch sử. Trả tình trạng pipeline hiện tại, không gọi contract thay ví.

200 nếu database và snapshot phục vụ được; `data.status: "ok"` khi đồng bộ và
không còn raw decode issue, `"degraded"` khi publication còn dùng được nhưng
có lagBlocks, projection lag hoặc raw decode warning. API chỉ thấy lỗi RPC nếu
được lưu trong trạng thái checkpoint; BE03 không ghi trạng thái cho mọi lần RPC
thất bại nên health không tự probe hay khẳng định RPC hiện tại còn hoạt động.
503 nếu không có checkpoint đáng tin cậy, database down, metadata deployment không
được xác minh hoặc phải rebuild; `data.status: "unavailable"`.
`data.database` là `up|down`, `data.indexer` là `synced|lagging|not_ready`.
Các trường bổ sung trong fixture giải thích tình trạng vận hành. Health 503 vẫn
trả envelope health, còn endpoint dữ liệu 503 dùng envelope lỗi dưới đây.
Không lộ connection string, secret RPC hoặc stack trace.

## 4. Lỗi có cấu trúc

```json
{
  "context": null,
  "error": {
    "code": "INVALID_PROPOSAL_ID",
    "message": "proposalId phải là chuỗi số nguyên uint256 hợp lệ.",
    "details": { "field": "proposalId" },
    "retryable": false
  }
}
```

`context` là null khi chưa xác định được scope/snapshot; nếu đã biết thì dùng
cùng context như response thành công, với H null khi not_ready. `message` giúp
người dùng hiểu, frontend xử lý theo `code`. `details` là object không chứa secret;
không đồng thời trả `data` trong envelope lỗi. Health là ngoại lệ có status riêng.

| HTTP | code | Xử lý frontend |
|---|---|---|
| 400 | `INVALID_PROPOSAL_ID` | Sửa ID sai định dạng/ngoài miền uint256 |
| 400 | `INVALID_ARGUMENT` | Sửa query thiếu/sai, state/direction/limit không hợp lệ, tham số không hỗ trợ |
| 400 | `INVALID_CURSOR` | Bỏ cursor lỗi/hết hạn, tải trang đầu |
| 400 | `CURSOR_CONTEXT_MISMATCH` | Giữ scope/filter/limit của cursor hoặc bắt đầu lại |
| 404 | `DEPLOYMENT_NOT_FOUND` | Chọn cấu hình chain/deployment hợp lệ |
| 404 | `PROPOSAL_NOT_FOUND` | Hiển thị không tìm thấy tại H đang xem |
| 409 | `SNAPSHOT_INVALIDATED` | Chain reorg/rebuild: tải lại toàn bộ màn hình từ snapshot mới |
| 409 | `SNAPSHOT_UNAVAILABLE` | H ngoài lịch sử còn lưu: chọn checkpoint có thể phục vụ |
| 503 | `DATA_NOT_READY` | Đang đồng bộ/chưa có checkpoint/đang đối soát: hiện loading hoặc lỗi có thể retry |

`retryable: true` nghĩa có thể thử lại sau khi pipeline phục hồi; 400/404 mặc định
false; 409 cần bỏ snapshot/cursor cũ trước khi thử lại. Các tình huống rỗng và
lỗi mẫu được liệt kê với HTTP status trong [manifest](../fixtures/api/manifest.json).

## 5. Bàn giao bốn màn hình

| Màn hình | Dữ liệu và cách dùng |
|---|---|
| Tổng quan | summary lấy H, số dư/dòng tiền/count/recentActivity; health/sync để báo trễ |
| Danh sách | proposals dùng lại H/hash; state/proposalId + cursor; empty/error có thông báo riêng |
| Chi tiết | detail + votes + transfers tại cùng H/hash; hiển thị quorum, 3 nhóm phiếu, ETA, operation và transaction |
| Tạo proposal | summary.governance + Treasury/BUD cho cấu hình, form giữ nguyên description và requestId; ABI Treasury ở shared/abi |

Form tạo proposal nhập BUD thập phân bằng chuỗi rồi chuyển đơn vị chính xác;
chỉ một khoản chi, recipient khác zero/Treasury, amount > 0, native value 0.
Threshold/delegate/voting power cá nhân, mạng ví, state và số dư mới nhất phải
đọc contract qua ví/RPC trước thao tác; summary là read model tại H, không cấp
quyền hoặc bảo đảm đủ tiền khi execute. Các endpoint không cung cấp chữ ký,
khóa riêng hay endpoint POST tạo proposal. Nội dung hiển thị dưới dạng text an toàn.

TV1 cần review clock/quorum/ABI, salt operation và cách đối chiếu state tại H.
TV3 cần review shape, nullability, cursor/filter, lỗi, tên trường và thông tin
form. Chỉ chốt sau review; fixtures giúp phát triển UI trong thời gian chờ SC06.

## 6. Metadata phục vụ kiểm tra fixture

`fixtures/api/simulation.json` là dữ liệu tổng hợp offline, **không thêm endpoint**
và không thay response shape. `blocks` là lịch number/hash/timestamp dùng chung;
`sourceLogs` phân biệt log nguồn bằng sourceId, actor và thứ tự phát trong
transaction. Checker dùng lịch đó để kiểm tra `snapshot = timestamp(block tạo) + 60`,
`deadline = snapshot + 300`, vote đúng cửa sổ, queue sau kết quả, ETA và
execute/cancel hợp lệ tại H. Không suy timestamp bằng block number.

LogIndex là vị trí trên **toàn block**, khác transactionIndex. Hai log nguồn
khác nhau trong cùng chain/blockHash không được cùng logIndex; logIndex tăng
theo transactionIndex và thứ tự phát log trong transaction, có thể có khoảng
trống khi thiếu một phần log. Các bản sao của cùng log trong list/detail/summary
không phải log nguồn mới. Metadata chỉ mô hình hóa một phần event, không phải
receipt hoặc bằng chứng hành vi smart contract thật.

Sau sửa timeline/logIndex, fixture dùng revision `fixture-v2`; bỏ cursor v1.
Hash input/proposalId của 45 proposal và operationId/salt vẫn giữ nguyên.

## 7. Chạy API BE05

Áp dụng migration 004 một lần sau BE01–BE04 trên database đã cấu hình deployment
và có publication BE04. Nếu chạy worker/recovery BE07, áp dụng tiếp migration
005 trước khi khởi động worker/API (xem [BE07](be07.md)):

```sh
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f database/migrations/004_be05_api.sql
psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f database/migrations/005_be07.sql
npm ci
export API_CURSOR_SECRET="$(openssl rand -hex 32)"
npm run api
```

`DATABASE_URL` là bắt buộc; server mặc định bind `127.0.0.1:3000`. Có thể đặt
`API_HOST`, `API_PORT`, `API_SNAPSHOT_TTL_SECONDS` (60–86400 giây) và
`API_CORS_ORIGINS` (các origin chính xác, phân tách bằng dấu phẩy). API không tự
nạp `.env`. Pool giới hạn thời gian kết nối/truy vấn; SIGINT/SIGTERM đóng HTTP
server và pool.

Ví dụ đủ sáu endpoint:

```sh
BASE='http://127.0.0.1:3000/api'
SCOPE='chainId=31337&deploymentId=local-governance'
curl "$BASE/health?$SCOPE"
curl "$BASE/summary?$SCOPE"
curl "$BASE/proposals?$SCOPE&limit=20"
curl "$BASE/proposals/123?$SCOPE&asOfBlock=456&asOfBlockHash=0x<64-hex>"
curl "$BASE/proposals/123/votes?$SCOPE&asOfBlock=456&asOfBlockHash=0x<64-hex>&limit=20"
curl "$BASE/treasury/transfers?$SCOPE&asOfBlock=456&asOfBlockHash=0x<64-hex>&direction=out"
```

Lấy H/hash từ context response đầu rồi dùng lại cho các màn hình. Khi có
`nextCursor`, giữ nguyên endpoint, scope, filter và limit. API chỉ đọc về nghiệp
vụ: GET đầu tiên có thể sao chép publication sang `api_read_*` trong PostgreSQL;
các GET sau đọc bản cache bất biến. Không ghi raw/projection/business tables, gọi
indexer/projector, RPC, ký hoặc gửi transaction. Governance config phải có các giá trị từ manifest đã
xác minh và đúng ABI version; địa chỉ contract lấy từ `deployment_contracts`.
Thiếu metadata đó trả `DATA_NOT_READY`, không dùng địa chỉ hoặc config fixture.

Health trả 200 `ok`/`degraded` khi database và publication sẵn sàng, 503 khi
database/publication chưa phục vụ được. Response tách tình trạng DB, raw
indexer, publication và cảnh báo raw decode. BE05 không thăm dò RPC head; lag
theo giây chưa quan sát được là null. Health không gọi RPC.


## 8. BE07 — recovery và freshness của API runtime

[BE07](be07.md) bổ sung migration 005 và heartbeat canonical cho API. Enum
`sync.status` và error code BE05 giữ nguyên. Runtime thêm `recoveryStatus`
(unverified/ready/recovering/replaying/rebuild_required), `lastRpcCheckAt` và
`publicationBlock`. `lagSeconds` là chuỗi số tuổi quan sát theo wall clock,
null khi chưa có quan sát; `lagBlocks` so confirmed với publication đang phục vụ.
Quá 30000 ms chưa xác minh canonical, kể cả chain không có event, trạng thái là
lagging và health degraded. Cache snapshot/cursor dùng trạng thái hiện tại.

Recovering/replaying/rebuild_required chặn publication: health 503 với
`data.recoveryStatus`, endpoint dữ liệu 503 DATA_NOT_READY, cursor cũ 409
SNAPSHOT_INVALIDATED. Revision đổi ngay khi xác nhận mismatch, trước khi xóa
suffix. Chỉ publication BE04 đã đối chiếu lại tại H/hash mới mở gate.
Các giới hạn BE05 về lagSeconds=null/không ghi lần kiểm tra RPC trong các mục
trước chỉ mô tả nền BE05; runtime có migration 005 dùng semantics BE07 này.
