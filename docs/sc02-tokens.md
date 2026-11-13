# SC02 — token và hướng dẫn bàn giao TV4

Căn cứ: FR02, BR01 và SC02 trong tài liệu requirements phiên bản 1.0.
Giữ nguyên Solidity 0.8.37, OpenZeppelin 5.4.0, EVM osaka và cấu hình SC01.

## Constructor và phân bổ

`new GovernanceToken(a, b, c, d)` tạo Governance Token (GOV), 18 decimals.
Constructor mint lần lượt 400/300/200/100 GOV, tổng cố định 1.000 GOV.
TV4 truyền bốn ví demo khác nhau, khác zero. OpenZeppelin từ chối zero;
constructor không cấm địa chỉ trùng (nếu truyền trùng thì số dư cộng dồn),
vì vậy TV4 phải kiểm tra danh sách ví và phân bổ sau deploy.
Không có public mint, owner hoặc quyền tăng nguồn cung.

`new BudgetToken(fundingWallet)` tạo Budget Token (BUD), 18 decimals,
mint đúng một lần 20.000 BUD cho ví nạp quỹ khác zero.
TV4 thực hiện theo thứ tự:

1. Deploy BUD với fundingWallet, chưa cần địa chỉ Treasury.
2. Ở SC03, deploy Treasury với địa chỉ BUD và tham số quyền đã chốt.
3. Ví fundingWallet gọi BUD.transfer(treasury, 10000 * 10^18).
4. Kiểm tra Treasury có 10.000, fundingWallet còn 10.000, totalSupply là 20.000 BUD.

BUD không có phí chuyển hay public mint. Không cần approve để transfer trực tiếp.
Phân bổ vào Treasury không diễn ra tự động; test SC02 dùng địa chỉ giả đại diện Treasury,
không phải kiểm thử quyền chi hoặc giải ngân. TV4 sở hữu script deploy/seed/check-roles.

## Kế thừa và voting

GovernanceToken kế thừa ERC20Votes; module này đã kế thừa ERC20 và Votes.
Constructor khởi tạo ERC20(name,symbol) và EIP712(name,"1") cho cơ chế chữ ký delegation.
Không thêm ERC20Permit vì SC02 không yêu cầu permit; không cần override _update/nonces
khi không có nhánh kế thừa gây xung đột. ERC20Votes tự cập nhật checkpoint khi chuyển token.
BudgetToken kế thừa ERC20, dùng transfer/approve/transferFrom/allowance chuẩn OpenZeppelin.

`_mint` là hàm internal của thư viện: tạo token, tăng totalSupply và phát Transfer từ zero.
Chỉ constructor gọi nó ở hai contract này; không có điểm vào bên ngoài để mint thêm.
`ether` trong biểu thức lượng token là hệ số 10^18 của Solidity, không phải gửi ETH.

A có số dư 400 GOV nhưng ban đầu getVotes(A) = 0. A gọi delegate(A) để có 400 voting power.
Nếu A delegate(B), B có 400 quyền từ A; token vẫn ở A. Nếu B cũng self-delegate,
B có tổng 700. Delegation không chuyển token và không có tính ủy quyền dây chuyền.

Checkpoint ghi voting power tại một timestamp. Ví dụ A self-delegate ở t=1000,
sau t=1000 getPastVotes(A,1000)=400 GOV. A chuyển 100 GOV ở t=1001 thì voting power
hiện tại còn 300, nhưng lịch sử ở 1000 vẫn là 400. Đổi delegate sau snapshot cũng vậy.
Các cập nhật cùng timestamp gộp vào checkpoint cuối cùng của timestamp đó.
Không truy vấn lịch sử tại timestamp hiện tại hoặc tương lai: phải vm.warp sang giây tiếp theo trong test.

clock() dùng Time.timestamp() của OpenZeppelin, CLOCK_MODE() trả mode=timestamp.
Governor ở SC04 phải dùng clock của GOV; voting delay/period tính theo giây.
Threshold dùng checkpoint quá khứ: self-delegate rồi tạo proposal cùng timestamp có thể chưa đủ
quyền lịch sử; UI/script phải đối chiếu contract khi tích hợp. getPastTotalSupply hỗ trợ quorum snapshot.

## Kiểm tra và phạm vi

```bash
forge fmt --check
forge build
forge test --match-path 'tests/unit/GovernanceToken.t.sol' -vv
forge test --match-path 'tests/unit/BudgetToken.t.sol' -vv
forge test
python3 scripts/check.py
git diff --check
```

Unit test kiểm tra metadata, phân bổ, delegation, checkpoint, lịch sử, clock,
lookup current/future bị từ chối, public mint bị từ chối, zero recipient,
transfer không phí, allowance, lỗi thiếu tiền/allowance và fuzz bảo toàn nguồn cung.
Test public mint thử selector mint(address,uint256); việc không có đường mint khác còn được
đối chiếu source/ABI, không coi một lời gọi revert là chứng minh mọi selector.
SC02 và Treasury SC03 đã tích hợp vào TV4 từ `Dev` ngày21/10; xem [review SC03](sc03-review.md). Governor/Timelock, deployment toàn hệ thống và frontend thật vẫn chưa có; BE02 reader/raw storage đã tích hợp nhưng không phải projection/API.
ABI phát hành toàn hệ thống vẫn chờ SC06; ABI hiện tại có trong artifact build và ABI Treasury trong `shared/abi/`.
TV4 review constructor/phân bổ; TV3 review delegate/read; điều kiện review nhóm vẫn áp dụng.

## Kết quả kiểm tra ngày 18/10/2026

Đây là kết quả lịch sử trên nhánh SC02; lệnh checker cũ trong báo cáo nguồn đã được thay bằng `scripts/check.py` trong nhánh TV4. Kết quả tích hợp mới ghi tại [evidence TV4 ngày21/10](evidence/tv4-local-verification-20261021.json).

- Nhánh: feature/tv1-sc02, tạo từ feature/tv1-sc01; không commit/push.
- forge build: thành công; compiler cảnh báo tên keyword tương lai trong OpenZeppelin, không sửa thư viện.
- Test SC02: 24 passed (GOV 15, BUD 9); ba fuzz test chạy 256 trường hợp mỗi test.
- Toàn bộ forge test: 25 passed, 0 failed, gồm test selector SC01.
- forge fmt --check, kiểm tra ABI/fixture SC01 và git diff --check: đạt.
- Đối chiếu ABI của hai token: không có hàm mint công khai; source chỉ gọi _mint trong constructor.
- Chỉ tạo năm file SC02; các file đã theo dõi của SC01 không thay đổi.

SC02 đạt tiêu chí unit test về supply, decimals, delegation và lịch sử checkpoint.
Còn review nhóm và tích hợp Treasury/Governor thật ở SC03/SC04; TV4 hiện thực phân bổ sau deploy.
