# Database BE01

PostgreSQL lưu một bản đọc có thể dựng lại từ chain cho FR13–FR16. Contract vẫn quyết định quyền, phiếu hợp lệ và điều kiện chi tiền; database/API không ký giao dịch và không giữ private key. BE01 chỉ cung cấp schema và kiểm tra ràng buộc, chưa có indexer, thuật toán reorg hay API server.

## Cài đặt và kiểm tra

Mục tiêu kiểm chứng là PostgreSQL 18.4, encoding UTF-8. `gen_random_uuid()` dùng hàm lõi, không cần extension (có từ PostgreSQL 13); test giá trị NUMERIC vô cực cần PostgreSQL 14 trở lên. Tạo database tạm riêng. Chạy từ gốc repo bằng `psql` trên PATH, thay `<database-tam>` bằng database đã tạo:

```powershell
psql -X -v ON_ERROR_STOP=1 -d <database-tam> -f database/migrations/001_initial.sql
psql -X -v ON_ERROR_STOP=1 -d <database-tam> -f database/tests/001_initial_checks.sql
```

Trên Windows có PostgreSQL binaries, runner tự tạo cluster/database tạm độc lập, chọn cổng localhost còn trống, chạy cả migration/test và dừng cluster sau khi xong:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_be01_database.ps1
```

Nếu PostgreSQL không ở vị trí mặc định, truyền `-PostgresBin 'D:\duong-dan\PostgreSQL\bin'`. Runner không dùng hay xóa database đang có. Bộ kiểm tra bao phủ miền uint256, bytes description, Transfer 0/self-transfer, raw log dedup, khóa chain/deployment, serving revision và quan hệ payout/checkpoint; không phải bằng chứng indexer/reorg thật đã chạy.

Kết quả thực tế ngày 18/10/2026: runner đã chạy thành công trên PostgreSQL 18.4 trong cluster tạm độc lập; migration COMMIT, toàn bộ SQL checks đạt rồi ROLLBACK và cluster đã dừng. Chi tiết bằng chứng nằm trong `docs/be01-checklist.md`.

Migration có `BEGIN`/`COMMIT`, chỉ tạo đối tượng mới, không xóa hay sửa dữ liệu cũ và không dùng extension. Chạy **một lần trên database mới**; lỗi tên đã tồn tại phải được kiểm tra, không khắc phục bằng cách xóa database đang dùng. SQL test tự bọc trong transaction và `ROLLBACK`; thông báo `BE01 checks passed` chỉ xuất hiện khi các kiểm tra thực sự đạt. Identity sequence có thể tăng khi chạy test, nên chỉ dùng database tạm như hướng dẫn.

## Kiểu dữ liệu và định danh

`evm_uint256` là domain trên `NUMERIC` **không khai báo precision/scale**. Check yêu cầu số nguyên trong `[0, 2^256 − 1]`, trong đó giá trị lớn nhất là `115792089237316195423570985008687907853269984665640564039457584007913129639935`. Không dùng `NUMERIC(78,0)`: PostgreSQL sẽ làm tròn phần lẻ trước khi check miền. Domain hiện tại loại âm, phần lẻ, tràn miền, NaN và vô cực; `1.0` vẫn là số nguyên có giá trị 1.

Chain ID, proposal ID, amount, weight và các clock/block value dùng domain này. Index/log position, khóa nội bộ dùng `BIGINT` không âm khi thích hợp. Chúng là số thứ tự kỹ thuật, không dùng để tính tiền. Adapter PostgreSQL phải đọc `NUMERIC` dưới dạng chuỗi/BigInt, tuyệt đối không đổi sang JavaScript Number. Khi phát JSON, chuẩn hóa số nguyên bằng `trunc(value)::text` hoặc bộ chuyển đổi số nguyên tương đương thành chuỗi thập phân không dấu/chấm/số mũ; không phát trực tiếp text còn scale `.0` của NUMERIC. Phép cộng tổng có thể lớn hơn một uint256 nên giữ `NUMERIC` không giới hạn ở biểu thức tổng, không ép tổng về domain.

`evm_address` là chuỗi `0x` + 40 ký tự hex thường; `evm_hash32` là `0x` + 64 ký tự; `evm_hex_data` giữ số byte bất kỳ, kể cả `0x`. Indexer phải chuẩn hóa chữ hoa/thường trước khi ghi. `proposal_id` là uint256 của Governor; `request_id` là bytes32 của khoản chi; `operation_id` là bytes32 của Timelock. Ba ID không thay thế nhau. `bytes32(0)` là request ID hợp lệ, không tự thêm lệnh cấm.

GOV/BUD có 18 decimals. `amount = "1000000000000000000000"` biểu diễn 1.000 BUD; việc chèn dấu thập phân chỉ phục vụ hiển thị. Giá trị cấu hình uint256 trong `governance_config` cũng phải dùng chuỗi; JSONB không phải nơi tính tiền hoặc xác thực ABI.

## Bảng và quan hệ

| Bảng | Mục đích và khóa chính |
| --- | --- |
| `deployments` | Một bộ contract/config đã xác minh: chain ID, block bắt đầu, ABI version, decimals, K xác nhận và cấu hình governance. Khóa nội bộ `deployment_id`; tên duy nhất trong chain; `snapshot_revision` UUID tạo mới để quản lý hiệu lực cursor/snapshot. |
| `deployment_contracts` | Bảng phụ lưu năm role Governor/Timelock/Treasury/BUD/GOV với địa chỉ, deployment block và ABI riêng. Các FK kiểm tra đúng địa chỉ/role trong cùng deployment. |
| `indexed_blocks` | Bảng phụ lưu number/hash/parentHash/timestamp, kể cả block không có event. Khóa `(deployment_id, block_number)`; cung cấp timestamp tại H và chuỗi hash cho kiểm tra reorg. |
| `raw_events` | Log xác nhận thuộc nhánh canonical: contract, block number/hash, tx hash/index, log index, topics, data, log RPC gốc và dữ liệu decode tùy chọn. Khóa chống trùng **toàn chain** `(chain_id, transaction_hash, log_index)`. |
| `proposals` | Khóa `(deployment_id, proposal_id)`. Lưu request/proposer/recipient/amount, bytes description, descriptionHash, mảng targets/native_values/calldatas, snapshot/deadline và tham chiếu event tạo/hủy/thực thi. Không lưu `current_state`. |
| `votes` | Khóa `(deployment_id, proposal_id, voter)`, một phiếu mỗi địa chỉ. `support`: 0 Against, 1 For, 2 Abstain; weight dùng đơn vị GOV nguyên. Có event gốc. |
| `operations` | Khóa `(deployment_id, operation_id)`, một operation mỗi proposal trong MVP. Lưu predecessor/salt thực tế, queue time, ETA và event queue/schedule/execute/cancel. |
| `transfers` | Chỉ projection BUD Transfer liên quan Treasury đã cấu hình. Lưu from/to/amount và event gốc; chấp nhận amount 0, mint/burn với zero address, và self-transfer. |
| `disbursements` | Bảng phụ nối BudgetDisbursed với đúng BUD Transfer đã có. Uniqueness `(chain_id, treasury_address, request_id)` đảm bảo cùng Treasury không có hai khoản trả thành công, kể cả địa chỉ đó được đăng ký trong nhiều cấu hình deployment. |
| `checkpoints` | Một checkpoint number/hash cho mỗi deployment, cùng observed head, K tại batch, trạng thái sync và mã lỗi an toàn. FK yêu cầu block H đã được ghi; check yêu cầu head ≥ H + K. |

Các projection khóa theo `deployment_id`; deployment đó có đúng một chain ID. FK composite ngăn dùng proposal, raw event, địa chỉ contract hay block hash của deployment khác. Hai deployment có thể cùng proposal ID hoặc request ID mà không lẫn dữ liệu. Không tạo uniqueness request ID trên `proposals`: hai proposal dùng cùng request vẫn được lưu, chỉ khoản thanh toán thành công bị giới hạn. `disbursements` yêu cầu Transfer đi từ đúng Treasury đến đúng recipient với cùng amount; khi đã liên kết proposal/operation, FK cũng kiểm tra request/recipient/amount và operation thuộc proposal đó.

API `deploymentId` là mã cấu hình ổn định, ánh xạ vào **`deployment_name`**, ví dụ `synthetic-local-v1`; nó không phải BIGINT `deployment_id` của SQL. Luôn lookup bằng cả `(chain_id, deployment_name)` rồi dùng khóa nội bộ cho join. API `snapshotRevision` là biểu diễn text của UUID `snapshot_revision`; giá trị `fixture-v1` trong bộ mẫu chỉ là nhãn tổng hợp. Database rebuild mới tự sinh revision mới; reorg/rebuild trên database hiện tại phải đổi revision bằng `gen_random_uuid()` trong cùng transaction rollback/publish, không đổi khi chỉ thêm batch bình thường.

`deployment_contracts` phải được nạp đủ năm role và xác minh với chain trước khi indexer đánh dấu ready. `deployment_block` của deployment là block bắt đầu quét sớm nhất, không muộn hơn block của từng contract. Hai deployment cần được cấu hình tách biệt; nếu cùng chain/địa chỉ bị cấu hình quét chồng, khóa raw event sẽ phát hiện xung đột, không âm thầm tạo hai bản sao.

## Description, log gốc và trách nhiệm decoder

`description_bytes BYTEA` là bản chính xác của Solidity string. `description TEXT` giữ nguyên văn khi bytes là UTF-8 hợp lệ và PostgreSQL chấp nhận; check đảm bảo text không làm đổi bytes. Không parse rồi stringify description để tính hash/queue/execute. Với Solidity string chứa NUL hoặc UTF-8 hỏng, giữ nguyên bytes và log, để `description` NULL; không thay ký tự hay bỏ bytes để tính hash. Chính sách API cho metadata không hiển thị được cần TV1/TV3 review; trước khi có chính sách, trả lỗi dữ liệu có cấu trúc thay vì giả có description hợp lệ. Fixture SC01 dùng description UTF-8 bình thường.

Raw topics/data và `rpc_log` là cơ sở decode lại; `event_name`/`decoded_payload` chỉ là kết quả decode, có thể NULL nếu chưa biết ABI. `removed = true` không được đưa vào bộ raw canonical; reorg phải rollback nhánh cũ. Schema không thực thi EVM và không chứng minh JSON `rpc_log` khớp các cột. Decoder ở bước sau phải xác minh địa chỉ, topics/data, đúng ABI/version, tên event, số thứ tự, transaction/block và bytes description/hash trước khi dựng projection. Các FK nguồn kiểm tra role nhưng không thay bước xác minh event signature.

Liên kết BudgetDisbursed–Transfer phải có cùng transaction/block và đúng token, from/to/amount; không ghép chỉ theo amount khi một transaction có nhiều log. Decoder lấy proposal/operation từ calldata/event và ABI/receipt thật; không giả định salt bằng descriptionHash. Hai trường liên kết proposal/operation của `disbursements` được phép tạm NULL khi chưa chứng minh được quan hệ; metadata chưa đầy đủ không được trình bày như liên kết đã xác minh. Log thất bại do transaction revert không có projection thành công.

## Dòng tiền và index truy vấn

Chỉ cộng các hàng `transfers` có event block ≤ H. Công thức hiển thị dòng tiền:

```sql
SELECT
    COALESCE(sum(t.amount) FILTER (
        WHERE t.to_address = t.treasury_address
          AND t.from_address <> t.treasury_address), 0) AS total_in,
    COALESCE(sum(t.amount) FILTER (
        WHERE t.from_address = t.treasury_address
          AND t.to_address <> t.treasury_address), 0) AS total_out
FROM transfers t
JOIN raw_events e ON e.deployment_id = t.deployment_id
                 AND e.raw_event_id = t.source_event_id
WHERE t.deployment_id = $1 AND e.block_number <= $2;
```

Số dư tại H = total_in − total_out và phải đối chiếu `BUD.balanceOf(Treasury)` tại chính H. Self-transfer giữ nguyên trong lịch sử nhưng loại khỏi cả hai tổng, nên không làm tăng dòng tiền hiển thị. Nguồn quét phải bao gồm transfer cấp BUD đầu tiên cho Treasury; nếu có số dư trước mốc quét, phải lùi về block đủ dữ liệu hoặc xác minh số dư mở đầu từ chain, không tự seed số dư để che thiếu log. GOV, token khác và native coin không được cộng. `disbursements` chỉ cung cấp nhãn/request ID, **không cộng thêm một lần chi**. Proposal chưa execute không giữ chỗ hay trừ số dư.

Các index hỗ trợ replay theo deployment/block/tx/log, lookup request/proposer, danh sách proposal, phiếu, operation theo proposal/ETA và transfers theo nguồn/from/to. Khi phân trang API, lọc event block ≤ H và sắp theo tọa độ chain `(block_number, transaction_index, log_index, ID)`; `raw_event_id` chỉ là khóa nội bộ, không được coi như thứ tự chain. Trạng thái theo thời gian được suy ra tại H rồi mới lọc, không lọc theo một cache trạng thái hiện tại.

## Ghi batch và checkpoint ở bước indexer sau

Mỗi deployment có một writer. Dùng transaction và khóa dòng checkpoint `SELECT ... FOR UPDATE`; với deployment chưa có checkpoint, khóa transaction advisory theo deployment hoặc tạo cơ chế writer duy nhất. Chuẩn bị RPC ngoài transaction nhưng kiểm tra lại hash trước khi commit:

1. Đọc checkpoint cũ, kiểm tra hash trên RPC và chọn cuối batch H không vượt head − K. Xác minh các block liên tiếp/parent hash; lấy timestamp dù block không có log.
2. `BEGIN`, khóa writer/checkpoint và xác nhận checkpoint vẫn đúng phiên bản đã đọc. Ghi headers, raw logs, rồi toàn bộ projection và liên kết cho **đủ batch**.
3. Dedup raw event bằng khóa toàn chain. Khi conflict, so sánh deployment/address/blockHash/topics/data với bản đã lưu; bản khác là lỗi scope/reorg cần xử lý, không dùng `DO NOTHING` để che xung đột. Chỉ skip projection khi log cũ và projection tương ứng đã được kiểm tra nhất quán.
4. Sau khi hoàn tất dữ liệu, ghi/upsert checkpoint number/hash H, observed head, K và status; `COMMIT`. Exception trước commit phải rollback cả batch và checkpoint. Không ghi checkpoint trong transaction riêng và không nhảy qua log decode lỗi để báo ready.

FK checkpoint chỉ chứng minh có header H; SQL không tự chứng minh mọi log trong batch đã đủ. Indexer phải kiểm soát phạm vi quét, decode và ghi đủ dữ liệu. API đọc một snapshot transaction nhất quán, luôn trả chain/deployment + asOfBlock H/hash và trạng thái đồng bộ. Không có checkpoint đồng nghĩa chưa sẵn sàng, không giả định block 0 đã đồng bộ.

`checkpoints.sync_status` mô tả trạng thái lưu trữ (`syncing`, `ready`, `rebuild_required`); API suy ra `synced`, `lagging`, `not_ready` từ đó cùng head/K/độ trễ/RPC. Snapshot hợp lệ đã bắt kịp được báo synced; snapshot hợp lệ nhưng pipeline chậm/lỗi RPC được báo lagging theo `docs/api.md`; không có snapshot đáng tin cậy hoặc rebuild_required được báo not_ready. Không ánh xạ `ready` thành synced mà bỏ qua lag. `lagSeconds` là thời gian chờ của dữ liệu chưa index, không phải tuổi timestamp của H lịch sử; bước indexer phải đo thêm dữ liệu này, schema BE01 chưa ghi bộ đo runtime riêng.

## Trạng thái và lịch sử tại block H

Clock Governor/GOV là timestamp ERC-6372. Lấy `indexed_blocks.block_timestamp` của **H**, không dùng thời gian máy hoặc timestamp hiện tại. Proposal tồn tại tại H chỉ khi event tạo có block ≤ H. Phiếu và các dấu queue/execute/cancel cũng chỉ có hiệu lực nếu event nguồn có block ≤ H. Một cột `executed_event_id` mới nhất không được làm proposal tại H cũ trở thành Executed.

Snapshot/deadline giữ nguyên; replay chỉ các raw event đến H để tính ba tổng phiếu/lifecycle và dựng operation tại H. Proposal có thể chuyển Pending → Active hoặc hết voting mà không có event mới, nên không thể suy trạng thái chỉ từ event cuối. Dùng các biên thời gian đúng implementation Governor đã build, rồi đối chiếu `Governor.state(proposalId)`, `quorum(snapshot)`, các hàm proposal cần thiết và số dư bằng `eth_call` cùng block tag H (và kiểm tra hash H). Không chốt thuật toán biên chỉ bằng so sánh tự đoán; test tại snapshot/deadline thuộc bước indexer.

Ready là cờ của operation đang Queued khi đủ ETA, đối chiếu `isOperationReady` tại H; không thêm proposal state Ready. Execute revert không đổi proposal thành Failed. Các state phục vụ API MVP: Pending, Active, Succeeded, Defeated, Queued, Executed, Canceled. Nếu ABI trả state khác ngoài MVP, báo không hỗ trợ/dữ liệu chưa sẵn sàng thay vì ánh xạ thành Failed.

Cursor API phải cố định chain/deployment/H/hash/revision. Trong thời gian giữ cursor, giữ raw logs/headers đến H; dựng lại từ chúng và các lời gọi historical RPC, không chỉ lấy bảng projection hiện tại. Nếu RPC không có state lịch sử cần thiết, trả lỗi dữ liệu chưa sẵn sàng thay vì lấy latest. Nếu hash H bị reorg, revision đổi hoặc snapshot cursor hết hạn, từ chối cursor để client bắt đầu trang mới. BE01 chưa triển khai cache snapshot hay giới hạn tuổi cursor.

## Reorg và rebuild dự kiến

BE01 giữ headers/raw log cần thiết, chưa hiện thực worker rollback. Writer khởi động lại phải so hash checkpoint và parent chain; K giảm rủi ro nhưng không loại reorg. Khi phát hiện nhánh khác, ngừng advance và ngừng trả snapshot mới; API không tiếp tục gọi dữ liệu cũ là ready.

Trong cửa sổ headers còn giữ, tìm tổ tiên chung A. Trong **một transaction** có khóa writer, đổi `deployments.snapshot_revision = gen_random_uuid()` để vô hiệu hóa cursor cũ; xóa các projection của deployment theo thứ tự phụ thuộc (`disbursements`, `operations`, `votes`, `proposals`, `transfers`), rollback checkpoint về A, loại raw events/headers sau A, rồi dựng lại projection từ raw còn canonical đến A và đối chiếu state/số dư tại A. Các FK mặc định RESTRICT tránh xóa nhầm âm thầm; thực hiện đúng thứ tự. Sau commit mới quét nhánh mới. Đây là chiến lược dựng lại projection đơn giản cho MVP, chưa phải script BE01.

Nếu không tìm được tổ tiên trong cửa sổ còn lưu hoặc không đủ dữ liệu/RPC lịch sử, đặt `rebuild_required` và yêu cầu rebuild; không đoán checkpoint. Rebuild tạo **database mới riêng**, nạp cấu hình deployment đã xác minh và quét lại từ deployment block của từng contract đến H. Không phụ thuộc database cũ hay seed metadata ngoài chain. So sánh tại cùng H/hash: ID/nội dung proposal, phiếu, operation, request đã trả, transfers, tổng tiền và `state()`/balance on-chain, rồi mới chuyển API sang database mới. Không xóa database đang phục vụ trước khi bản mới được kiểm chứng.

## Điểm cần review

TV1 xác nhận ABI đầy đủ ngoài ITreasury, deployment block/address, event dùng liên kết ba ID, predecessor/salt và biên clock/state/quorum theo contract triển khai. TV3 review cách hiển thị uint256/18 decimals, description UTF-8 lỗi và trạng thái/độ trễ tại H. Description JSON v1, độ dài Unicode và request ID CSPRNG trong `docs/contracts.md` vẫn là **đề xuất chờ nhóm review**. Schema không tự coi chúng là chuẩn đã duyệt, cũng không dựa vào receipt giả của fixture SC01.
