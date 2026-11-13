# Công việc thành viên 4

Kiểm thử bảo mật và triển khai

DAO Budget Simulator • Phân công phiên bản 1.0 • 11 tháng 10 năm 2026

Chứng minh hệ thống đáp ứng requirement và người khác có thể chạy lại. Bạn sở hữu kiểm thử xuyên suốt, attack/invariant tests, triển khai và CI; TV1, TV2, TV3 vẫn viết test và tài liệu cho phần của mình.

**Phạm vi sở hữu:** Chính: TC01–TC14 ở cấp nghiệm thu, INV01–INV04, NFR05, NFR07–NFR08. Phối hợp NFR02–NFR04, FR15. Thư mục đề xuất: tests/attacks/, tests/invariant/, tests/e2e/, scripts/, docs/evidence/.

## 1 Danh sách đầu việc

| **Mã task** | **Đầu việc**                              | **Tuần** |
|:-----------:|-------------------------------------------|:--------:|
|    QA01     | Dựng môi trường chung và CI               |    1     |
|    QA02     | Viết deploy seed và manifest              |   2–3    |
|    QA03     | Kiểm tra role và review contract          |   2–4    |
|    QA04     | Lập test matrix và dữ liệu nghiệm thu     |   1–3    |
|    QA05     | Viết kịch bản tấn công tái hiện được      |   3–5    |
|    QA06     | Viết stateful invariant tests             |   4–5    |
|    QA07     | Nghiệm thu E2E và dựng lại dữ liệu        |   5–6    |
|    QA08     | Kiểm tra chất lượng và triển khai testnet |   6–7    |
|    QA09     | Tổng hợp GitHub evidence và tài liệu      |   7–8    |
|    QA10     | Chốt bản nộp và diễn tập bảo vệ           |    8     |

**Bắt đầu ngay:** Tạo QA01 và test matrix; dựng local chain/DB, chuẩn hóa env.example. Review bảng role với TV1 và xác định điều kiện testnet/RPC từ tuần 1–2.

Các mốc tuần tính từ ngày nhóm bắt đầu dự án, theo kế hoạch tham khảo 8 tuần. Tên thư mục, endpoint và mẫu giao diện trong file là đề xuất triển khai, cần chốt chung ở tuần 1; chưa phải mã nguồn đã có.

### Quy tắc làm việc

Mỗi task tương ứng một GitHub Issue có assignee, requirement liên quan, checklist và bằng chứng hoàn thành. Mỗi PR có ít nhất một người khác review. Đổi ABI/API/event phải cập nhật consumer và test liên quan trong cùng đợt tích hợp.

## 2 Công việc nền tảng

### QA01 Dựng môi trường chung và CI

Tuần 1 \| Đối chiếu NFR05, NFR07–NFR08

1.  Chuẩn hóa lệnh cài, build, test, chạy local chain và database; khóa phiên bản cùng TV1/TV2/TV3.
2.  Tạo CI chạy build/typecheck, contract tests, indexer tests và frontend tests hiện có; bổ sung invariant khi sẵn sàng.

**Bàn giao:** Workflow CI, env.example và hướng dẫn setup ngắn.

**Hoàn thành khi:** Clone sạch chạy được; không commit secret; mỗi PR thấy kết quả test phần bị ảnh hưởng.

**Phối hợp:** Các thành viên cung cấp lệnh test của module; TV1 review toolchain.

### QA02 Viết deploy seed và manifest

Tuần 2–3 \| Đối chiếu NFR08; TC01

1.  Viết deploy theo phụ thuộc: GOV/BUD, Timelock/Treasury, Governor; cấp đúng roles rồi seed token/delegate và bỏ quyền deployer.
2.  Ghi chainId, địa chỉ, deployment block, cấu hình, compiler/dependency version và commit vào manifest; chỉ tăng thời gian trên local.

**Bàn giao:** Script deploy/seed, manifest local và kịch bản demo bằng script.

**Hoàn thành khi:** Quỹ bắt đầu 10.000 BUD; A/B/C/D có 400/300/200/100 GOV; luồng local chi 1.000 BUD chạy được.

**Phối hợp:** TV1 cung cấp constructor/roles và review; TV2/TV3 dùng manifest chung.

### QA03 Kiểm tra role và review contract

Tuần 2–4 \| Đối chiếu BR03–BR07; NFR01, NFR08

1.  Viết check-roles kiểm tra holder từng role, minDelay, token/treasury/Governor addresses và việc deployer đã bỏ admin.
2.  Review đường vào proposal/cancel/execute, whitelist target/selector và thứ tự cập nhật requestId trước chuyển token.

**Bàn giao:** Script kiểm tra hậu triển khai và checklist review có link PR.

**Hoàn thành khi:** Cấu hình sai phải báo lỗi; không có ví thường được cấp spender/proposer/executor/canceller ngoài thiết kế.

**Phối hợp:** TV1 sửa contract; TV4 sửa script. TV1 review lại deployment.

## 3 Công việc xử lý chính

### QA04 Lập test matrix và dữ liệu nghiệm thu

Tuần 1–3 \| Đối chiếu TC01–TC14; FR01–FR16

1.  Ánh xạ mỗi TC tới requirement, fixture, người viết test module và bằng chứng kỳ vọng.
2.  Chuẩn bị các proposal đạt, thiếu quorum, thua/hòa, thiếu tiền, trùng requestId và hủy; thống nhất trạng thái khởi đầu cho từng test.

**Bàn giao:** docs/test-plan.md và bảng FR/TC/INV → test → evidence.

**Hoàn thành khi:** Không yêu cầu nào bị bỏ sót; có dữ liệu reset độc lập để test không ảnh hưởng nhau.

**Phối hợp:** TV1/TV2/TV3 chịu trách nhiệm test module; TV4 giữ bài nghiệm thu tổng thể.

### QA05 Viết kịch bản tấn công tái hiện được

Tuần 3–5 \| Đối chiếu TC05–TC08, TC10, TC14

1.  Viết test dùng token sau snapshot, gọi thẳng treasury/timelock, execute sớm/lặp, calldata ngoài phạm vi và requestId lặp.
2.  Thử dùng quyền deployer sau setup, hủy sai người/sai thời điểm; ghi trace và lý do contract chặn.

**Bàn giao:** tests/attacks/ và tài liệu mỗi kịch bản: mục tiêu, lệnh chạy, kỳ vọng, thực tế.

**Hoàn thành khi:** Mọi kịch bản có assert số dư/trạng thái và chạy lại được trong local/CI.

**Phối hợp:** TV1 review tính thực tế và sửa contract khi có lỗi; không cần chạy attack trên mạng ngoài dự án.

### QA06 Viết stateful invariant tests

Tuần 4–5 \| Đối chiếu INV01–INV04

1.  Tạo handler điều phối nhiều ví, delegate/transfer, propose/vote, tăng thời gian, queue/execute và nạp quỹ.
2.  Theo dõi khoản chi/requestId/số dư và kiểm tra bốn bất biến. Đường chi hợp lệ phải qua Governor/Timelock, không giả mạo timelock để bỏ qua luồng.

**Bàn giao:** tests/invariant/, cấu hình tối thiểu 100 chuỗi × 50 thao tác, seed và thống kê.

**Hoàn thành khi:** Handler đạt đến execute thành công; không lấy toàn bộ thao tác revert làm kết quả chứng minh.

**Phối hợp:** TV1 hỗ trợ fixture contract; TV4 giữ oracle và kiểm tra độc lập.

## 4 Tích hợp kiểm thử và bàn giao

### QA07 Nghiệm thu E2E và dựng lại dữ liệu

Tuần 5–6 \| Đối chiếu TC01–TC04, TC09, TC11–TC13

1.  Chạy luồng bằng UI và script; đối chiếu số dư receipt với dashboard. Thử ngắt indexer giữa batch và reorg trên local/fixture.
2.  Cùng TV2 dựng database mới tại H rồi so dữ liệu; kiểm tra sai mạng, từ chối ký và mô tả HTML trên UI.

**Bàn giao:** Test E2E, báo cáo replay và lỗi có bước tái hiện.

**Hoàn thành khi:** Không mất/trùng dữ liệu; hệ thống giải thích lỗi đúng; mọi so sánh dùng cùng block.

**Phối hợp:** TV2 sở hữu rebuild/reorg code; TV3 sở hữu sửa UI.

### QA08 Kiểm tra chất lượng và triển khai testnet

Tuần 6–7 \| Đối chiếu NFR02–NFR06, NFR08

1.  Review phép đo API và độ trễ indexer của TV2; kiểm tra 390px/1366px và bàn phím cùng TV3.
2.  Kiểm tra RPC/faucet, deploy testnet, chạy check-roles và demo một proposal giải ngân, một proposal thất bại.

**Bàn giao:** Manifest testnet, test report và transaction hash.

**Hoàn thành khi:** Demo dùng đúng commit đã test; testnet chờ thời gian thực và không dùng lệnh tăng giờ.

**Phối hợp:** TV1 review contract/role; TV2/TV3 cập nhật cấu hình, chạy tích hợp.

### QA09 Tổng hợp GitHub evidence và tài liệu

Tuần 7–8 \| Đối chiếu NFR05, NFR07; yêu cầu bài nộp

1.  Thu link PR/test/receipt/replay từ từng thành viên và gắn requirement, commit SHA, môi trường, lệnh chạy.
2.  Hoàn thiện README, kịch bản demo và mục đóng góp; kiểm tra setup trên clone sạch.

**Bàn giao:** docs/evidence/, README và checklist bài nộp.

**Hoàn thành khi:** Người khác chạy lại được mà không hỏi biến môi trường hoặc thứ tự bước còn thiếu.

**Phối hợp:** Mỗi thành viên viết phần báo cáo của mình; TV4 ghép bằng chứng và kiểm tra nhất quán.

### QA10 Chốt bản nộp và diễn tập bảo vệ

Tuần 8 \| Đối chiếu Toàn bộ tiêu chí nghiệm thu

1.  Chạy regression theo test matrix, đóng lỗi chi sai tiền/bypass/quyền và ghi rõ hạn chế còn lại.
2.  Chốt commit/tag bài nộp, quay demo, diễn tập mỗi người giải thích phần mình và vòng đời proposal.

**Bàn giao:** Bản release, bộ evidence cuối và video/demo checklist.

**Hoàn thành khi:** CI xanh, đủ bốn nhóm bằng chứng test/attack/scripts/reconstruction; cả bốn thành viên demo được phần mình.

**Phối hợp:** Cả nhóm review; TV4 kiểm tra tính đầy đủ, không tự sửa thay mọi module.

## 5 Tiến độ phối hợp và nghiệm thu

| **Tuần** | **Task tập trung** | **Đầu ra cần đạt** |
|:--:|----|----|
| 1 | QA01 và QA04 | CI, setup và test matrix. |
| 2 | QA02–QA04 | Deploy/seed khung, role checks và thử RPC/testnet. |
| 3 | QA02–QA05 | Script local end-to-end; attack cases đầu tiên. |
| 4 | QA03, QA05–QA06 | Review contract; test âm và invariant handler. |
| 5 | QA05–QA07 | Invariant đi tới execute; replay/resume/reorg evidence. |
| 6 | QA07–QA08 | E2E local, kiểm tra hiệu năng và giao diện. |
| 7 | QA08–QA09 | Deploy testnet, demo thật và thu evidence. |
| 8 | QA09–QA10 | Clone sạch, regression, báo cáo và diễn tập. |

### Bàn giao giữa các thành viên

| **Phối hợp** | **Bạn bàn giao** | **Bạn nhận** |
|:--:|----|----|
| TV1 | Gửi trace attack/invariant, kiểm tra role | Nhận constructor, ABI, fixture và sửa lỗi contract. |
| TV2 | Gửi bài test restart/reorg/replay và benchmark | Nhận script rebuild/compare, API/test report. |
| TV3 | Gửi account/chain config, E2E lỗi và demo flow | Nhận bản UI, test frontend và hướng dẫn thao tác. |

### Điều kiện hoàn thành phần việc

1.  Test matrix có FR/TC/INV, kết quả và evidence liên kết được.
2.  Invariant có thao tác thành công, seed và thống kê; attack có trace và giải thích.
3.  Manifest/roles/testnet khớp commit; private key không có trong repo hoặc evidence.
4.  Clone sạch chạy được và có demo thành công, demo thất bại, replay dữ liệu.

**Người review:** TV1 review deploy và test contract; TV2 review kiểm tra replay; TV3 review E2E từ góc người dùng.

Bằng chứng cá nhân gồm: issue/PR, commit, mã test và kết quả, hướng dẫn chạy, phần báo cáo. Với giao dịch, bổ sung chainId và transaction hash; với replay, bổ sung block H và kết quả so sánh.

## 6 Thông số chung và checklist bàn giao

Cấu hình demo dùng chung: 1.000 GOV chia A/B/C/D = 400/300/200/100; 20.000 BUD, trong đó treasury bắt đầu với 10.000. Cả hai token có 18 decimals. Threshold 50 GOV, quorum 20%, voting delay 60 giây, voting period 300 giây, timelock 120 giây; clock timestamp.

Một proposal có một khoản chi. For + Abstain được tính vào quorum; cần For \> Against. Quyền biểu quyết chốt tại snapshot. Chỉ timelock chi tiền; mỗi requestId thanh toán tối đa một lần. Queue và execute là giao dịch do người dùng gửi qua Governor.

### Các điều kiện không được làm sai khi tích hợp

- Giữ nguyên description dùng tạo proposal. Không dựng lại bằng một chuỗi khác khi tính descriptionHash cho queue hoặc execute.
- UI hiển thị Ready như điều kiện của operation Queued. Một lần execute revert không có nghĩa proposal chuyển sang trạng thái Failed.
- Đề xuất không giữ chỗ ngân sách. Treasury kiểm tra số dư khi execute; thiếu tiền phải revert toàn bộ và cho thử lại sau khi nạp.
- Chỉ creator hủy được Pending. MVP không hỗ trợ proposal thay đổi role hoặc tham số; muốn đổi cấu hình demo phải deploy lại.
- BUD Transfer là nguồn tính dòng tiền; event treasury dùng để liên kết khoản chi. Không cộng cả hai thành hai lần giải ngân.
- Dữ liệu API gồm asOfBlock; số tiền/uint256 là chuỗi nguyên. So sánh số liệu và replay phải dùng cùng block H.

### Checklist cho từng pull request

- Gắn mã task và mã FR/BR/NFR hoặc TC/INV liên quan.
- Mô tả thay đổi, cách chạy, test đã chạy và kết quả thực tế.
- Cập nhật ABI/API/event, fixture, env.example hoặc tài liệu khi có thay đổi.
- Có người review phù hợp; không đưa secret hoặc dữ liệu ví nhạy cảm vào log/evidence.
- Ghi rõ phần còn phụ thuộc thành viên khác và thời điểm dự kiến tích hợp.

### Căn cứ và phạm vi áp dụng

Phân rã từ DAO_Budget_Simulator_Requirements_Nhom_4.docx phiên bản 1.0 ngày 11 tháng 10 năm 2026. Mã FR01–FR16, BR01–BR07, NFR01–NFR08, TC01–TC14 và INV01–INV04 giữ nguyên theo bản requirement. File này giao việc triển khai và nghiệm thu, không phải báo cáo các tác vụ đã hoàn thành.
