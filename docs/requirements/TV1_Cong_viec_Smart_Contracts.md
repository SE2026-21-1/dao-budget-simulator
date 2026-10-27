# Công việc thành viên 1 — Smart contracts và governance

DAO Budget Simulator • Phân công phiên bản 1.0 • 11 tháng 10 năm 2026

Xây dựng phần hợp đồng thông minh để khoản chi chỉ được thực hiện đúng quy trình, đúng quyền và đúng một lần. Bạn chịu trách nhiệm hành vi on-chain; TV4 viết script triển khai và kiểm thử bảo mật độc lập.

**Phạm vi sở hữu:** Chính: FR03, FR05–FR10, BR01–BR07 và NFR01. Phối hợp FR02, FR13, FR15 và NFR08. Thư mục đề xuất: contracts/, tests/unit/, shared/abi/, docs/contracts.md.

# 1 Danh sách đầu việc

| **Mã task** | **Đầu việc**                             | **Tuần** |
|-------------|------------------------------------------|----------|
| SC01        | Khởi tạo contract và chuẩn tích hợp      | 1        |
| SC02        | Viết hai token và cơ chế voting power    | 1–2      |
| SC03        | Viết Treasury và chống chi lặp           | 2        |
| SC04        | Viết Governor và giới hạn proposal       | 2–3      |
| SC05        | Chốt Timelock và quyền sau deploy        | 3        |
| SC06        | Xuất ABI và dữ liệu cho các phần khác    | 3        |
| SC07        | Hoàn thiện unit test và test biên        | 3–4      |
| SC08        | Tích hợp luồng local với ứng dụng        | 4–6      |
| SC09        | Review dữ liệu và viết tài liệu contract | 5–7      |
| SC10        | Chốt contract cho testnet và bài nộp     | 7–8      |

**Bắt đầu ngay:** Đọc BR01–BR07; tạo SC01; thống nhất chữ ký disburse và sự kiện giải ngân với TV2, TV3, TV4. Bàn giao bản ABI dự kiến cuối tuần 1.

Các mốc tuần tính từ ngày nhóm bắt đầu dự án, theo kế hoạch tham khảo 8 tuần. Tên thư mục, endpoint và mẫu giao diện trong file là đề xuất triển khai, cần chốt chung ở tuần 1; chưa phải mã nguồn đã có.

## Quy tắc làm việc

Mỗi task tương ứng một GitHub Issue có assignee, requirement liên quan, checklist và bằng chứng hoàn thành. Mỗi PR có ít nhất một người khác review. Đổi ABI/API/event phải cập nhật consumer và test liên quan trong cùng đợt tích hợp.

# 2 Công việc nền tảng

## SC01 Khởi tạo contract và chuẩn tích hợp

Tuần 1 \| Đối chiếu BR01–BR07; NFR05

1\. Chốt phiên bản Solidity, OpenZeppelin 5.x và Foundry; khóa dependency, tạo cấu trúc contract và unit test.

2\. Viết bảng hàm, event, lỗi và role dự kiến. Chốt disburse(bytes32 requestId, address recipient, uint256 amount) và format description v1.

**Bàn giao:** Cấu hình build, docs/contracts.md, ABI nháp và mẫu dữ liệu chung.

**Hoàn thành khi:** Clone sạch compile được; ba thành viên còn lại có đủ mẫu để làm fixture.

**Phối hợp:** TV4 review toolchain; TV2 và TV3 review dữ liệu cần đọc.

## SC02 Viết hai token và cơ chế voting power

Tuần 1–2 \| Đối chiếu FR02; BR01

1\. Viết GovernanceToken có ERC20Votes và clock timestamp; tổng cung cố định, hỗ trợ self-delegate và checkpoint.

2\. Viết BudgetToken ERC-20 không phí, mint một lần; đưa thông số cấp token cho TV4 để seed đúng bộ demo.

**Bàn giao:** GovernanceToken.sol, BudgetToken.sol và test supply, decimals, delegate, checkpoint.

**Hoàn thành khi:** A có 400 voting power sau self-delegate; dữ liệu quá khứ không đổi khi chuyển token sau snapshot.

**Phối hợp:** TV3 cần ABI delegate/read; TV4 cần constructor và phân bổ token.

## SC03 Viết Treasury và chống chi lặp

Tuần 2 \| Đối chiếu FR08–FR09; BR03; INV01, INV03

1\. Giữ địa chỉ BUD, dùng AccessControl; disburse chỉ dành cho SPENDER_ROLE. Kiểm tra amount dương và recipient khác zero/treasury.

2\. Theo dõi requestId đã thanh toán; cập nhật trạng thái trước chuyển token và dùng phép chuyển an toàn. Phát event chứa requestId, recipient, amount.

**Bàn giao:** Treasury.sol, ABI/event và test giải ngân thành công, thiếu tiền, sai quyền, requestId trùng.

**Hoàn thành khi:** Thiếu tiền revert cả dấu đã chi; nạp thêm có thể thử lại. Không thanh toán hai lần cùng requestId.

**Phối hợp:** Chốt event BudgetDisbursed với TV2; TV4 review luồng gọi ngoài.

# 3 Công việc xử lý chính

## SC04 Viết Governor và giới hạn proposal

Tuần 2–3 \| Đối chiếu FR03, FR05–FR06, FR10

1\. Ghép GovernorVotes, GovernorVotesQuorumFraction, GovernorCountingSimple và GovernorTimelockControl; cấu hình theo requirement.

2\. Chặn mọi proposal ngoài một lời gọi Treasury.disburse với native value = 0; kiểm tra cả điểm vào chuẩn. Chỉ creator hủy Pending.

**Bàn giao:** BudgetGovernor.sol và test threshold, kiểu khoản chi, quorum, thắng/thua/hòa, cancellation.

**Hoàn thành khi:** Gọi thẳng contract không bỏ qua được kiểm tra target/selector; proposal đổi role hoặc tham số bị chặn.

**Phối hợp:** TV4 review đường bypass; TV3 dùng lỗi contract để thông báo.

## SC05 Chốt Timelock và quyền sau deploy

Tuần 3 \| Đối chiếu FR07–FR08; NFR08; TC06, TC14

1\. Dùng TimelockController; Governor giữ proposer/executor/canceller. Treasury chỉ cấp spender cho timelock.

2\. Mô tả trình tự cấp quyền và bỏ quyền deployer; timelock tự quản lý admin. Kiểm tra mọi ví có thể gọi queue/execute qua Governor khi hợp lệ.

**Bàn giao:** Bảng role cuối cùng và test quyền; đầu vào cho script check-roles của TV4.

**Hoàn thành khi:** Ví thường không schedule/execute trực tiếp timelock và không chi trực tiếp treasury; deployer không lấy lại quyền.

**Phối hợp:** TV4 hiện thực deploy/check-roles; TV1 review trước khi chạy testnet.

## SC06 Xuất ABI và dữ liệu cho các phần khác

Tuần 3 \| Đối chiếu FR03–FR04; FR13–FR16

1\. Xuất ABI từ build, liệt kê custom errors và cấu trúc event. Lập ví dụ encode khoản chi và tính proposalId từ description nguyên bản.

2\. Cung cấp một bộ receipt/log thật cho create, vote, queue, execute, cancel; chỉ rõ cách nối proposalId, requestId và operationId.

**Bàn giao:** shared/abi/, docs/contracts.md và fixtures/chain/\*.json không có private key.

**Hoàn thành khi:** TV2 decode được log; TV3 dựng lại đúng calldata và proposalId để queue/execute.

**Phối hợp:** TV2 và TV3 xác nhận fixture; TV4 lưu commit tạo fixture.

# 4 Tích hợp kiểm thử và bàn giao

## SC07 Hoàn thiện unit test và test biên

Tuần 3–4 \| Đối chiếu TC01–TC10, TC14

1\. Bổ sung test tại snapshot, ngay sau snapshot, deadline, ngay sau deadline và ETA.

2\. Kiểm tra một ví vote hai lần, thiếu quỹ, hai proposal tranh số dư và hai proposal dùng chung requestId.

**Bàn giao:** tests/unit/ và bảng nối test với FR/TC.

**Hoàn thành khi:** Test có assert số dư, trạng thái và lỗi; chạy xanh trong CI.

**Phối hợp:** TV4 viết attack/invariant riêng; TV1 sửa lỗi contract phát hiện được.

## SC08 Tích hợp luồng local với ứng dụng

Tuần 4–6 \| Đối chiếu FR02–FR10; TC01

1\. Cùng TV3 chạy propose/vote/queue/execute bằng ví; cùng TV2 đối chiếu phiếu và số dư tại một block.

2\. Sửa lỗi ABI, decimals, clock hoặc receipt; mọi thay đổi cập nhật consumer và fixture cùng PR.

**Bàn giao:** Luồng local hoạt động và danh sách lỗi tích hợp đã xử lý.

**Hoàn thành khi:** Chi 1.000 BUD thành công, quỹ còn 9.000; không dựa vào sửa database thủ công.

**Phối hợp:** TV4 điều phối bài demo; TV2/TV3 review thay đổi ảnh hưởng consumer.

## SC09 Review dữ liệu và viết tài liệu contract

Tuần 5–7 \| Đối chiếu FR15; NFR01, NFR05

1\. Review cách TV2 lấy snapshot/state tại block H và tránh tính đôi dòng tiền.

2\. Viết phần kiến trúc contract, bảng quyền, vòng đời proposal và giới hạn mô phỏng trong báo cáo.

**Bàn giao:** docs/contracts.md hoàn chỉnh; nhận xét review và phần slide kỹ thuật.

**Hoàn thành khi:** Người khác giải thích được tại sao Governor gọi timelock rồi mới đến treasury.

**Phối hợp:** TV2 sửa phần indexer; TV4 review nội dung bảo mật.

## SC10 Chốt contract cho testnet và bài nộp

Tuần 7–8 \| Đối chiếu NFR05, NFR07–08

1\. Review deployment của TV4, sửa lỗi nghiệm thu và chạy lại test liên quan; chốt ABI/version của bản nộp.

2\. Gắn link PR, commit và transaction vào bằng chứng; chuẩn bị trả lời phần governance khi bảo vệ.

**Bàn giao:** Contract release, test xanh và phần báo cáo cá nhân.

**Hoàn thành khi:** Không còn lỗi chi trái quyền/chi lặp; testnet demo dùng đúng contract đã test.

**Phối hợp:** TV4 tổng hợp bản nộp; TV2/TV3 cập nhật địa chỉ theo manifest.

# 5 Tiến độ phối hợp và nghiệm thu

| **Tuần** | **Task tập trung**           | **Đầu ra cần đạt**                                  |
|----------|------------------------------|-----------------------------------------------------|
| 1        | SC01 và bắt đầu SC02         | ABI nháp, role, toolchain và format dữ liệu.        |
| 2        | Hoàn tất SC02–SC03; làm SC04 | Token/treasury chạy được; Governor có khung đầy đủ. |
| 3        | SC04–SC06; bắt đầu SC07      | Luồng script local hoàn chỉnh, ABI và log thật.     |
| 4        | SC07 và SC08                 | Test biên và điều kiện bảo vệ đều chạy.             |
| 5        | SC08–SC09                    | Hỗ trợ invariant, đối chiếu dữ liệu cùng TV2.       |
| 6        | SC08 và xử lý lỗi            | Ứng dụng local thao tác được bằng ví.               |
| 7        | SC09–SC10                    | Review roles/testnet, sửa lỗi nghiệm thu.           |
| 8        | SC10                         | Chốt contract, evidence và phần báo cáo.            |

## Bàn giao giữa các thành viên

| **Phối hợp** | **Bạn bàn giao**                          | **Bạn nhận**                                    |
|--------------|-------------------------------------------|-------------------------------------------------|
| TV2          | ABI, events, receipt mẫu; quy tắc nối ID  | Nhận lỗi đối chiếu tại H và test replay.        |
| TV3          | Hàm, custom errors, decimals và clock     | Nhận lỗi thao tác ví và encode calldata.        |
| TV4          | Constructor, thứ tự role và fixture token | Nhận trace attack/invariant và manifest deploy. |

## Điều kiện hoàn thành phần việc

1\. Có unit test cho mọi nhánh chi tiền, bỏ phiếu và kiểm tra quyền.

2\. ABI, event, custom errors và dữ liệu demo được cập nhật cùng code.

3\. Contract testnet khớp source commit, cấu hình và phiên bản dependency.

4\. Tài liệu có bảng role và giải thích rõ các giới hạn mô phỏng.

**Người review:** TV4 review thay đổi bảo mật; TV2/TV3 review thay đổi ABI có ảnh hưởng tích hợp.

Bằng chứng cá nhân gồm: issue/PR, commit, mã test và kết quả, hướng dẫn chạy, phần báo cáo. Với giao dịch, bổ sung chainId và transaction hash; với replay, bổ sung block H và kết quả so sánh.

# 6 Thông số chung và checklist bàn giao

Cấu hình demo dùng chung: 1.000 GOV chia A/B/C/D = 400/300/200/100; 20.000 BUD, trong đó treasury bắt đầu với 10.000. Cả hai token có 18 decimals. Threshold 50 GOV, quorum 20%, voting delay 60 giây, voting period 300 giây, timelock 120 giây; clock timestamp.

Một proposal có một khoản chi. For + Abstain được tính vào quorum; cần For \> Against. Quyền biểu quyết chốt tại snapshot. Chỉ timelock chi tiền; mỗi requestId thanh toán tối đa một lần. Queue và execute là giao dịch do người dùng gửi qua Governor.

## Các điều kiện không được làm sai khi tích hợp

• Giữ nguyên description dùng tạo proposal. Không dựng lại bằng một chuỗi khác khi tính descriptionHash cho queue hoặc execute.

• UI hiển thị Ready như điều kiện của operation Queued. Một lần execute revert không có nghĩa proposal chuyển sang trạng thái Failed.

• Đề xuất không giữ chỗ ngân sách. Treasury kiểm tra số dư khi execute; thiếu tiền phải revert toàn bộ và cho thử lại sau khi nạp.

• Chỉ creator hủy được Pending. MVP không hỗ trợ proposal thay đổi role hoặc tham số; muốn đổi cấu hình demo phải deploy lại.

• BUD Transfer là nguồn tính dòng tiền; event treasury dùng để liên kết khoản chi. Không cộng cả hai thành hai lần giải ngân.

• Dữ liệu API gồm asOfBlock; số tiền/uint256 là chuỗi nguyên. So sánh số liệu và replay phải dùng cùng block H.

## Checklist cho từng pull request

• Gắn mã task và mã FR/BR/NFR hoặc TC/INV liên quan.

• Mô tả thay đổi, cách chạy, test đã chạy và kết quả thực tế.

• Cập nhật ABI/API/event, fixture, env.example hoặc tài liệu khi có thay đổi.

• Có người review phù hợp; không đưa secret hoặc dữ liệu ví nhạy cảm vào log/evidence.

• Ghi rõ phần còn phụ thuộc thành viên khác và thời điểm dự kiến tích hợp.

## Căn cứ và phạm vi áp dụng

Phân rã từ DAO_Budget_Simulator_Requirements_Nhom_4.docx phiên bản 1.0 ngày 11 tháng 10 năm 2026. Mã FR01–FR16, BR01–BR07, NFR01–NFR08, TC01–TC14 và INV01–INV04 giữ nguyên theo bản requirement. File này giao việc triển khai và nghiệm thu, không phải báo cáo các tác vụ đã hoàn thành.
