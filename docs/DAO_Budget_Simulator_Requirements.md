# DAO Budget Simulator

Đặc tả yêu cầu phần mềm cho nhóm 4 thành viên

Phiên bản 1.0  •  Ngày 11 tháng 10 năm 2026

Tài liệu xác định sản phẩm cần xây dựng, quy tắc nghiệp vụ, tiêu chí nghiệm thu và trách nhiệm của bốn thành viên. Hệ thống mô phỏng việc sử dụng ngân sách của một DAO trên mạng thử nghiệm và cho phép kiểm chứng toàn bộ quá trình từ đề xuất đến giải ngân.

## 1 Mục tiêu và phạm vi

Mục tiêu: một khoản chi chỉ được thực hiện khi đề xuất hợp lệ, kết quả bỏ phiếu đạt yêu cầu, đã được xếp lịch và hết thời gian timelock. Người xem phải truy xuất được ai đề xuất, ai bỏ phiếu, tiền đi đâu và giao dịch nào đã thực hiện khoản chi.

| Phạm vi | Nội dung |
| --- | --- |
| MVP bắt buộc | Proposal, voting, quorum, treasury mock, timelock, phân quyền, dashboard và event indexer. |
| Bằng chứng bắt buộc | Contract tests, invariant tests, attack scenarios, scripts và event reconstruction trong GitHub. |
| Môi trường | Một DAO, một treasury, một token biểu quyết, một token ngân sách; local chain và một EVM testnet. |
| Ngoài phạm vi | Mainnet, tiền thật, đa chuỗi, nâng cấp proxy, NFT, marketplace, chat, đăng nhập email và quản lý nhiều DAO. |



### Quy ước sử dụng tài liệu

FR là yêu cầu chức năng; BR là quy tắc nghiệp vụ; NFR là yêu cầu chất lượng; TC là kịch bản kiểm thử; INV là bất biến. Tất cả FR, BR và NFR trong bản này thuộc phạm vi cần nghiệm thu. Tên TV1 đến TV4 là vai trò trong nhóm phát triển, không phải role on-chain.

Các con số demo, cách phân công và kế hoạch 8 tuần là cấu hình đề xuất của nhóm dự án. Chúng có thể điều chỉnh khi bắt đầu nhưng phải được cập nhật nhất quán trong tài liệu, cấu hình deploy và test.

### Tác nhân sử dụng

| Tác nhân | Nhu cầu |
| --- | --- |
| Người xem | Xem quỹ, danh sách đề xuất, kết quả và lịch sử mà không cần kết nối ví. |
| Thành viên DAO | Kết nối ví, delegate, tạo đề xuất khi đủ ngưỡng và bỏ phiếu theo voting power. |
| Người vận hành | Khởi tạo môi trường, chạy indexer, kiểm tra đồng bộ và thực hiện demo. |
| Người chấm | Chạy lại dự án, kiểm tra test và đối chiếu bằng chứng GitHub với yêu cầu. |



## 2 Quy tắc nghiệp vụ và cấu hình demo

| Tham số | Giá trị đề xuất |
| --- | --- |
| Governance token | GOV, tổng cung cố định 1.000; phân bổ ví A/B/C/D lần lượt 400/300/200/100. |
| Budget token | BUD, ERC-20 mock không thu phí; mint một lần 20.000: 10.000 cho treasury, 10.000 cho ví nạp quỹ. |
| Ngưỡng tạo đề xuất | 50 GOV voting power đã delegate; sử dụng checkpoint quá khứ theo Governor. |
| Quorum | 20% tổng nguồn cung GOV tại snapshot, tương đương 200 với bộ dữ liệu demo. |
| Clock | GOV dùng ERC-6372 timestamp; Governor dùng cùng clock. Thời lượng bên dưới tính bằng giây. |
| Voting delay | 60 giây từ lúc tạo đến mốc snapshot. |
| Voting period | 300 giây tính từ snapshot. |
| Timelock delay | 120 giây tính từ giao dịch queue thành công. |



Các thời lượng ngắn chỉ phục vụ demo. Test local được phép tăng thời gian mô phỏng; testnet phải chờ thời gian thực. Token dùng 18 decimals và mọi phép tính on-chain dùng đơn vị nguyên nhỏ nhất.

### Các điều kiện bắt buộc

BR01  Quyền biểu quyết lấy từ số token đã được delegate tại snapshot. Một người có thể self-delegate. Chuyển token hoặc đổi delegate sau snapshot không sửa trọng số của proposal đang xét.

BR02  Có ba lựa chọn For, Against, Abstain. Proposal chỉ thành công sau hạn bỏ phiếu khi For + Abstain đạt quorum và For lớn hơn Against. Hòa phiếu là thất bại. Một địa chỉ không đổi hoặc bỏ lại phiếu cho cùng proposal.

BR03  Một proposal chứa đúng một khoản chi BUD đến một địa chỉ khác zero address và khác treasury. Số tiền phải dương. Request ID được sinh trước khi tạo proposal và không được thanh toán thành công hai lần.

BR04  Governor chỉ chấp nhận lời gọi Treasury.disburse(requestId, recipient, amount), với native value bằng 0. Giới hạn target, selector và tham số phải được kiểm tra on-chain, kể cả khi người dùng bỏ qua dashboard.

BR05  Đề xuất không giữ chỗ ngân sách. Số dư được kiểm tra khi execute. Nếu không đủ quỹ, toàn bộ giao dịch revert; proposal chưa được đánh dấu Executed và có thể thử lại sau khi nạp thêm BUD.

BR06  Người tạo chỉ được hủy proposal ở trạng thái Pending. MVP không có quyền hủy khẩn cấp sau khi bắt đầu bỏ phiếu và không hỗ trợ proposal đổi role hoặc tham số. Muốn đổi cấu hình demo phải deploy lại.

BR07  Thành công không tự động chuyển tiền. Cần một giao dịch queue và một giao dịch execute sau timelock. Bất kỳ ví nào có gas đều có thể yêu cầu Governor thực hiện hai thao tác này khi đủ điều kiện.

Thiết kế clock, snapshot và cách tính quorum dựa trên các module governance của OpenZeppelin [1]. Quy tắc giới hạn loại khoản chi và các con số demo là lựa chọn của dự án.

## 3 Phân quyền và vòng đời đề xuất

### Quyền ở tầng ứng dụng

| Thao tác | Ai được thực hiện | Điều kiện |
| --- | --- | --- |
| Đọc dữ liệu | Mọi người | Không yêu cầu ví. |
| Delegate | Chủ ví | Chỉ tác động đến token của ví đó. |
| Tạo proposal | Ví đủ voting power | Đạt threshold và khoản chi hợp lệ. |
| Vote | Ví có quyền tại snapshot | Proposal Active, chưa bỏ phiếu. |
| Hủy proposal | Người tạo | Chỉ khi Pending. |
| Queue và execute | Mọi ví qua Governor | Governor và timelock kiểm tra trạng thái. |
| Nạp BUD | Ví đang có BUD | Chuyển BUD vào treasury. |



### Quyền tại smart contract

| Contract và role | Địa chỉ giữ quyền sau khởi tạo |
| --- | --- |
| Treasury SPENDER\_ROLE | Chỉ địa chỉ TimelockController. |
| Treasury DEFAULT\_ADMIN\_ROLE | TimelockController; deployer đã từ bỏ quyền. |
| Timelock PROPOSER\_ROLE | Chỉ BudgetGovernor. |
| Timelock EXECUTOR\_ROLE | Chỉ BudgetGovernor; không mở cho zero address. |
| Timelock CANCELLER\_ROLE | Chỉ BudgetGovernor. |
| Timelock DEFAULT\_ADMIN\_ROLE | Chính TimelockController; deployer đã từ bỏ quyền. |



Người dùng gọi Governor.execute; Governor gọi timelock; timelock gọi treasury. Quyền gọi hàm công khai trên Governor khác với role gọi trực tiếp vào timelock. Deployer không có đường chi tiền riêng sau khởi tạo [2][3].

### Các trạng thái phải hiển thị

Luồng thành công: Pending → Active → Succeeded → Queued → Executed. Từ Active, proposal trở thành Defeated khi hết hạn mà không đủ điều kiện. Từ Pending, người tạo có thể chuyển sang Canceled [4].

Ready là tình trạng operation trong timelock, không tạo thêm một proposal state. Dashboard hiển thị “Queued — sẵn sàng thực thi” khi đã đến ETA. Execute bị revert cũng không tạo trạng thái Failed mới cho proposal.

Không yêu cầu Expired trong cấu hình TimelockController này. Mốc mở/đóng lấy từ contract; không dùng đồng hồ trình duyệt để tự quyết định quyền. Phải có test tại snapshot, ngay sau snapshot, deadline, ngay sau deadline và ETA.

## 4 Yêu cầu chức năng cho thành viên DAO

### FR01  Kết nối ví và chọn mạng

Phụ trách TV3. Dashboard phải hiển thị địa chỉ ví và mạng hiện tại; dữ liệu công khai vẫn xem được khi chưa kết nối.

Nghiệm thu: Ví đúng mạng thao tác được. Khi sai mạng, giao diện yêu cầu đổi mạng và không gửi giao dịch đến địa chỉ contract của mạng khác.

### FR02  Xem và kích hoạt quyền biểu quyết

Phụ trách TV3 phối hợp TV1. Hiển thị số dư GOV, delegate hiện tại, voting power hiện tại và quyền tại snapshot của proposal. Có nút self-delegate.

Nghiệm thu: Ví A sau self-delegate và khi checkpoint đã thành quá khứ có 400 voting power. Việc delegate sau snapshot không tăng phiếu cho proposal đó.

### FR03  Tạo đề xuất chi ngân sách

Phụ trách TV1 phối hợp TV3. Nhập tiêu đề 5–120 ký tự, mô tả 20–2.000 ký tự, địa chỉ nhận và số BUD. Hệ thống sinh requestId, encode calldata và giữ nguyên description để tính proposalId.

Nghiệm thu: Ví dưới threshold bị contract từ chối. Contract từ chối target/selector/native value sai, địa chỉ nhận không hợp lệ và amount bằng 0. ProposalCreated đủ dữ liệu dựng lại proposal; tiêu đề và mô tả nằm trong description dạng có cấu trúc.

### FR04  Tra cứu danh sách và chi tiết đề xuất

Phụ trách TV3 phối hợp TV2. Có phân trang 20 mục, lọc trạng thái và tra cứu proposalId. Chi tiết gồm nội dung khoản chi, người tạo, snapshot, deadline, phiếu, quorum, ETA và giao dịch.

Nghiệm thu: Bộ dữ liệu 45 proposal hiển thị qua 3 trang, không lặp hoặc mất mục với cùng bộ lọc. ID không tồn tại có thông báo rõ ràng.

### FR05  Bỏ phiếu

Phụ trách TV1 phối hợp TV3. Thành viên chọn For, Against hoặc Abstain khi proposal Active. Trọng số lấy từ checkpoint tại snapshot và không lấy từ số dư hiện tại.

Nghiệm thu: Mỗi địa chỉ bỏ phiếu tối đa một lần; gọi lần hai, trước khi mở hoặc sau khi đóng đều revert. Phiếu không có voting power không làm tăng kết quả.

### FR06  Tính kết quả và quorum

Phụ trách TV1. Kết quả phải tuân theo BR02. Dashboard hiển thị riêng quorum tiến độ và ba nhóm phiếu.

Nghiệm thu: For=100, Against=0, Abstain=0: thất bại. For=100, Against=0, Abstain=100: thành công. For=200, Against=200: thất bại. Mọi kết quả xét sau deadline.

## 5 Yêu cầu chức năng cho giải ngân và dashboard

### FR07  Đưa proposal vào timelock

Phụ trách TV1 phối hợp TV3. Proposal Succeeded được queue qua Governor. Dashboard hiển thị operationId, thời điểm queue và ETA lấy từ contract.

Nghiệm thu: Queue trước kết quả hoặc queue proposal Defeated bị từ chối. ETA không sớm hơn thời điểm queue cộng minDelay.

### FR08  Thực thi khoản chi

Phụ trách TV1 phối hợp TV3. Execute qua Governor chỉ thành công khi operation đã sẵn sàng. Treasury chuyển đúng BUD đến recipient và phát sự kiện chứa requestId, recipient, amount.

Nghiệm thu: Trước ETA bị từ chối; từ ETA được phép nếu đủ điều kiện khác. Thành công trừ đúng quỹ và cộng đúng người nhận. Thực thi lại cùng operation hoặc thanh toán lại requestId bị từ chối.

### FR09  Theo dõi và nạp ngân sách

Phụ trách TV1 phối hợp TV2. Hiển thị số dư BUD, tổng BUD vào quỹ, tổng chi thành công và lịch sử dòng tiền. Nạp quỹ bằng transfer BUD; token khác và native coin không được tính vào ngân sách.

Nghiệm thu: Tại cùng một block, số dư BUD bằng tổng vào trừ tổng ra từ thời điểm triển khai. Khoản chi thiếu quỹ revert toàn bộ và thử lại được sau khi nạp thêm.

### FR10  Hủy proposal đang chờ

Phụ trách TV1 phối hợp TV3. Người tạo hủy proposal Pending qua Governor. Lịch sử vẫn hiển thị proposal và transaction hủy.

Nghiệm thu: Người khác hoặc người tạo khi proposal Active trở đi không hủy được. Proposal đã Canceled không thể vote, queue hoặc execute.

### FR11  Dashboard tổng quan

Phụ trách TV3 phối hợp TV2. Hiển thị số dư treasury, số proposal theo trạng thái, tổng chi thành công và hoạt động gần nhất. Có bốn màn hình: tổng quan, danh sách, chi tiết và tạo proposal.

Nghiệm thu: Các tổng số khớp dữ liệu chain tại block đối chiếu. Không cộng giao dịch revert hoặc đếm trùng event. Giao diện ghi rõ đây là môi trường mô phỏng testnet.

### FR12  Phản hồi giao dịch và lỗi

Phụ trách TV3. Phân biệt chờ ký, đã gửi, đang chờ xác nhận, thành công, bị người dùng từ chối và revert. Nội dung proposal được hiển thị dạng văn bản an toàn.

Nghiệm thu: Không báo thành công trước receipt thành công. Từ chối ký không làm mất nội dung form. Có transaction hash, lý do lỗi dễ hiểu và trạng thái đồng bộ sau giao dịch.

## 6 Yêu cầu indexer và dữ liệu

### FR13  Thu thập sự kiện

Phụ trách TV2. Quét từ deployment block của Governor, Timelock, Treasury và BUD. Lưu log gốc cùng proposal, vote, operation, khoản chi và token transfer liên quan quỹ.

Nghiệm thu: Chống ghi trùng bằng chainId + transactionHash + logIndex; giữ blockHash để đối chiếu nhánh chain. Một khoản chi có cả Transfer và sự kiện treasury chỉ được tính một lần.

### FR14  Tiếp tục đồng bộ và xử lý reorg

Phụ trách TV2. Lưu checkpoint number/hash sau khi ghi xong mỗi batch. Chỉ nhận block đủ K xác nhận; K cấu hình được, testnet demo mặc định 2. Khởi động lại phải kiểm tra hash đã lưu.

Nghiệm thu: Dừng giữa batch rồi chạy lại không mất/trùng dữ liệu. Phát hiện reorg phải rollback đến tổ tiên chung rồi quét lại; nếu vượt cửa sổ lưu hash, dừng phục vụ dữ liệu mới và yêu cầu rebuild.

### FR15  Dựng lại dữ liệu từ chain

Phụ trách TV2 phối hợp TV4. Có lệnh rebuild để tạo database mới từ địa chỉ contract và deployment block; không phụ thuộc database cũ hoặc seed metadata riêng.

Nghiệm thu: Tại cùng checkpoint H, trước và sau rebuild có cùng proposal, phiếu, khoản chi và số dư. Trạng thái suy ra từ mốc thời gian ở H và đối chiếu state() ở H; log đơn thuần không đủ cho chuyển trạng thái theo thời gian.

### FR16  Cung cấp API đọc

Phụ trách TV2. API phục vụ tổng quan, danh sách, chi tiết, phiếu và lịch sử treasury. Có phân trang, kiểm tra đầu vào, health và thông tin block đồng bộ. API không giữ khóa để ký thay người dùng.

Nghiệm thu: Sai proposalId trả lỗi có cấu trúc; bộ lọc hợp lệ trả kết quả ổn định. Mỗi phản hồi dữ liệu có asOfBlock; UI có thể đối chiếu trạng thái mới nhất từ contract trước thao tác.

### Dữ liệu tối thiểu cần lưu

| Thực thể | Các trường chính |
| --- | --- |
| Deployment | chainId, contract addresses, deploymentBlock, ABI version, cấu hình governance. |
| Proposal | proposalId, requestId, proposer, recipient, amount, description nguyên bản, targets/values/calldatas, snapshot, deadline. |
| Vote và operation | proposalId, voter, support, weight; operationId, queue time, ETA, executed/canceled transaction. |
| Event và checkpoint | chainId, address, txHash, logIndex, blockNumber, blockHash, eventName, payload; checkpoint number/hash. |



Số tiền và uint256 đi qua API dưới dạng chuỗi số nguyên, không dùng JavaScript Number để tính tiền. BUD Transfer là nguồn tính dòng tiền; event treasury dùng để liên kết requestId với khoản giải ngân.

## 7 Yêu cầu chất lượng và phương án kỹ thuật

| Mã | Yêu cầu | Tiêu chí đo được |
| --- | --- | --- |
| NFR01 | Tính đúng và toàn vẹn | Mọi điều kiện chi tiền, role, quorum và timelock được kiểm tra on-chain; database không có quyền thay đổi chúng. |
| NFR02 | Hiệu năng đọc | Với bộ dữ liệu test gồm 100 proposal và 1.000 vote đã index, API đọc có p95 dưới 1 giây ở 10 client đồng thời trong 60 giây; ghi cấu hình máy và cách đo. |
| NFR03 | Độ mới dữ liệu | Trong điều kiện RPC hoạt động bình thường, xử lý event đủ K xác nhận trong 30 giây; UI báo chậm đồng bộ khi vượt ngưỡng. |
| NFR04 | Khả năng phục hồi | Lỗi RPC được retry có backoff; checkpoint không vượt dữ liệu đã commit. Rebuild qua FR15 chạy thành công. |
| NFR05 | Tái lập môi trường | Clone sạch, dùng phiên bản và lockfile đã chốt, làm theo README phải chạy được local demo và bộ test. |
| NFR06 | Trải nghiệm sử dụng | Giao diện tiếng Việt, thao tác được ở chiều rộng 390px và 1366px; có nhãn trường, trạng thái loading/empty/error và dùng bàn phím cho form. |
| NFR07 | Kiểm thử và CI | CI chạy build, kiểm tra kiểu, contract/invariant tests và indexer tests; mọi yêu cầu an toàn có test âm. Không còn lỗi mở gây chi sai tiền hoặc bỏ qua quyền. |
| NFR08 | Quản lý cấu hình | Không commit private key hoặc RPC secret. Có env.example, địa chỉ/chainId/deploymentBlock và script kiểm tra role sau deploy. |



### Cấu trúc triển khai đề xuất

Smart contracts: Solidity và OpenZeppelin Contracts 5.x. Dùng GovernanceToken, BudgetToken, BudgetGovernor, TimelockController và Treasury. Chốt một phiên bản cụ thể cùng compiler trong tuần 1, không dùng dependency trôi theo nhánh master.

Kiểm thử: Foundry cho contract, fuzz và stateful invariant. Ứng dụng: TypeScript, giao diện React và ví tương thích EVM. Indexer/API: Node.js với PostgreSQL. Cấu trúc này là phương án triển khai đề xuất; không làm thay đổi các tiêu chí nghiệm thu nếu nhóm đổi framework.

Giao diện gửi giao dịch qua ví đến blockchain. Indexer chỉ đọc chain và ghi database. API chỉ phục vụ dữ liệu đọc. ABI, địa chỉ contract, chainId và quy ước event là giao diện tích hợp chung, cần chốt sớm để các thành viên làm song song.

### Giới hạn mô phỏng

MVP không chống việc một người sở hữu nhiều ví, không khẳng định chống mọi hình thức mua quyền biểu quyết trước snapshot và không đảm bảo ngân sách cho proposal chưa execute. Giao dịch hoàn tất còn phụ thuộc xác nhận của testnet, không tính vào chỉ tiêu độ trễ API.

## 8 Kế hoạch kiểm thử và kịch bản tấn công

| Mã | Kịch bản | Kết quả mong đợi |
| --- | --- | --- |
| TC01 | Luồng thành công với A và B | 700 For; chi 1.000 BUD; treasury còn 9.000 sau execute. |
| TC02 | Chỉ D bỏ 100 For | Không đạt quorum; không queue được. |
| TC03 | Đạt quorum nhưng hòa hoặc thua | Proposal Defeated; không thực thi được. |
| TC04 | Vote hai lần và tại các biên thời gian | Chặn lần hai và ngoài cửa sổ; đúng tại snapshot/deadline theo contract. |
| TC05 | Chuyển token hoặc delegate sau snapshot | Không tăng tổng voting power của proposal đang xét. |
| TC06 | Gọi thẳng treasury/timelock bằng ví thường | Không chi tiền, không schedule hoặc execute trực tiếp trái quyền. |
| TC07 | Execute sớm hoặc execute lặp | Bị từ chối; số dư và requestId không bị thay đổi lần hai. |
| TC08 | Đề xuất calldata độc hại hoặc cấp role | Chặn target, selector, native value và tham số ngoài BR03–BR04. |
| TC09 | Hai khoản chi cùng tranh số dư | Khoản vượt số dư revert toàn bộ; nạp thêm thì thử lại được. |
| TC10 | Hai proposal dùng cùng requestId | Chỉ một khoản thanh toán thành công dù proposalId khác nhau. |
| TC11 | Indexer dừng giữa batch và xử lý reorg | Tiếp tục không mất/trùng log; loại dữ liệu thuộc nhánh bị thay. |
| TC12 | Database trống và rebuild tại H | Dữ liệu trước/sau khớp, đối chiếu state và số dư cùng block H. |
| TC13 | Sai mạng, từ chối ký, nội dung HTML | Không gửi sai mạng, giữ form, không thực thi script từ mô tả. |
| TC14 | Deployer sau khi bỏ quyền và thử hủy | Deployer không lấy lại quyền/chi quỹ; chỉ creator hủy Pending. |



### Bất biến cần kiểm tra qua nhiều chuỗi thao tác

INV01  Mỗi requestId giải ngân thành công tối đa một lần. INV02  Mọi lần chi thành công phải đến từ timelock qua một proposal hợp lệ đã hết delay. INV03  Số dư BUD của treasury bằng tổng vào trừ tổng ra. INV04  Thay đổi token sau snapshot không làm tổng trọng số phiếu của proposal vượt tổng cung tại snapshot.

Chạy tối thiểu 100 chuỗi, mỗi chuỗi 50 thao tác trong CI; lưu seed và thống kê. Handler phải đi được qua các trạng thái đến execute thành công, không được coi toàn bộ lời gọi revert là bằng chứng bất biến có ích [5].

TC05–TC08, TC10 và TC14 phải có bằng chứng attack scenario: mục tiêu, thiết lập, lệnh chạy, kết quả kỳ vọng, trace hoặc receipt và giải thích cơ chế chặn. Đây là kế hoạch test, chưa phải kết quả đã chạy.

## 9 Phân công bốn thành viên và tiến độ

| Thành viên | Trách nhiệm chính | Sản phẩm và review chéo |
| --- | --- | --- |
| TV1 | Smart contracts và governance | FR03, FR05–FR10; token, roles, unit tests. TV4 review bảo mật; TV1 review ABI và phép tính của indexer. |
| TV2 | Indexer, dữ liệu và API | FR13–FR16; schema, replay, resume/reorg tests. TV1 review đối chiếu on-chain; TV2 review tính nhất quán dashboard. |
| TV3 | Dashboard và ví | FR01–FR04, FR11–FR12; hỗ trợ UI cho vote/queue/execute/cancel. TV2 review tích hợp API; TV3 review kịch bản end-to-end. |
| TV4 | Kiểm thử bảo mật và vận hành | Invariant/attack/E2E tests, deploy/seed/demo, CI, kiểm tra role, tổng hợp evidence. TV1 review deployment; TV4 review phần chi tiền của TV1. |



Mỗi người viết test cho phần mình sở hữu và viết phần báo cáo tương ứng. TV4 không gánh toàn bộ test hoặc tài liệu. Mỗi issue có một người chịu trách nhiệm chính; mỗi PR có ít nhất một người khác review. TV4 giữ checklist tích hợp, không có đặc quyền on-chain riêng.

| Tuần | Trọng tâm | Điều kiện kết thúc |
| --- | --- | --- |
| 1 | Yêu cầu và chuẩn tích hợp | Chốt BR, phân quyền, ABI/event/API mẫu, môi trường và backlog. |
| 2 | Lát cắt đầu tiên | Có token/treasury/Governor tối thiểu; UI và indexer chạy với fixture chung. |
| 3 | Luồng governance local | Script hoàn tất propose, vote, queue, execute; UI kết nối local; indexer đọc event thật. |
| 4 | Điều kiện bảo vệ | Unit tests và attack cases chính; API và dashboard hiển thị trạng thái thật. |
| 5 | Khôi phục và bất biến | Rebuild, resume, reorg test; handler invariant đi tới giải ngân thành công. |
| 6 | Tích hợp giao diện | Tất cả FR chạy end-to-end trên local; xử lý lỗi và kiểm tra hiệu năng. |
| 7 | Testnet và sửa lỗi | Deploy, kiểm tra roles, demo thành công/thất bại; đóng lỗi ảnh hưởng nghiệm thu. |
| 8 | Đóng gói bài nộp | CI xanh, clone sạch chạy lại được; hoàn thiện báo cáo, slide, video và evidence. |



### Phụ thuộc cần quản lý

TV1 phải cung cấp ABI và schema event từ tuần 1–2; TV2 và TV3 dùng fixture thống nhất trong lúc chờ contract. Mọi thay đổi ABI, decimals hoặc cấu trúc description phải có PR cập nhật consumer và test liên quan. Testnet/RPC/faucet cần được thử từ tuần 2.

## 10 Tiêu chí hoàn thành và bằng chứng GitHub

| Yêu cầu đề bài | Yêu cầu liên quan | Bằng chứng phải nộp |
| --- | --- | --- |
| Proposal, voting, quorum | FR02–FR06, FR10 | Contract, unit tests và demo các kết quả bỏ phiếu. |
| Treasury mock, timelock, roles | BR03–BR07, FR07–FR09 | Kiểm tra role, receipt giải ngân, test âm và invariant. |
| Dashboard | FR01, FR04, FR11–FR12 | Giao diện hoạt động, checklist E2E và video thao tác. |
| Event indexer và reconstruction | FR13–FR16 | Script rebuild và bản so sánh trước/sau tại checkpoint H. |
| Contract và invariant tests | NFR07, TC01–TC14, INV01–04 | Mã test, cấu hình fuzz, seed, kết quả CI và trace khi lỗi. |
| Attack scenarios và scripts | TC05–TC08, TC10, TC14 | Tài liệu tấn công; deploy, seed, demo, check-roles và replay scripts. |



### Điều kiện nghiệm thu cuối cùng

Toàn bộ FR và NFR có bằng chứng đạt; không còn lỗi cho phép bỏ qua voting, timelock, role hoặc chi lặp. Local demo chạy lại từ clone sạch; testnet có tối thiểu một proposal giải ngân và một proposal thất bại. Database dựng lại được. Thành viên bất kỳ giải thích được vòng đời proposal và quyền chi tiền.

Repo cần có README; contracts; tests chia unit/invariant/attacks; frontend; indexer/API; scripts; deployment metadata; docs cho requirements, kiến trúc, test plan, attack scenarios và phân công. Evidence phải gắn commit SHA và transaction hash khi liên quan on-chain.

### Việc mở issue ngay khi bắt đầu

TV1: token, clock, Governor và bảng roles. TV2: schema, format event và hợp đồng API. TV3: bốn màn hình và kết nối ví. TV4: CI, môi trường local, deploy/seed và bộ acceptance test. Nhóm review BR01–BR07 trước khi chia các issue triển khai tiếp theo.

### Tài liệu kỹ thuật tham chiếu

Đối chiếu ngày 11 tháng 10 năm 2026. Tham chiếu giải thích cơ chế thư viện; các ngưỡng, cấu hình demo, chỉ tiêu chất lượng và phân công là yêu cầu đề xuất cho dự án.

[1] OpenZeppelin — How to set up on-chain governance<br>https://docs.openzeppelin.com/contracts/5.x/governance

[2] OpenZeppelin — Governance API<br>https://docs.openzeppelin.com/contracts/5.x/api/governance

[3] OpenZeppelin — Access Control<br>https://docs.openzeppelin.com/contracts/5.x/access-control

[4] OpenZeppelin — Governor contract source<br>https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/Governor.sol

[5] Foundry — Invariant Testing<br>https://getfoundry.sh/forge/invariant-testing?highlight=invariant

DAO Budget Simulator  \|  
