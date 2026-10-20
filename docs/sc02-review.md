# TV4 — review token SC02

## Phạm vi và quyết định

Ngày kiểm tra: 20/10/2026. Source: `feature/tv1-sc02`, commit
[`9a890a2084f10876e580d24589fa6cb0829c11f3`](https://github.com/SE2026-21-1/dao-budget-simulator/tree/9a890a2084f10876e580d24589fa6cb0829c11f3).
Yêu cầu: FR02, BR01, QA02–QA03. Review source và kiểm chứng local độc lập;
không sửa nhánh TV1, không thay review/approval của một thành viên khác.

**Không phát hiện lỗi chặn trong phạm vi hai token SC02.** Đã chạy 24 token
tests và smoke deploy/giao dịch trên Anvil. Chưa nghiệm thu Treasury,
Governor, Timelock, quyền giải ngân, TC05 qua Governor hoặc INV04 toàn hệ thống.
SC02 chưa được tích hợp vào nhánh TV4; việc bàn giao được theo dõi ở
[issue #8](https://github.com/SE2026-21-1/dao-budget-simulator/issues/8).

## Kết quả review source

| Hạng mục | Bằng chứng và kết luận |
| --- | --- |
| GOV | `contracts/GovernanceToken.sol:15–22`: constructor `(a,b,c,d)` mint 400/300/200/100 × 10^18; tổng 1.000 GOV. |
| BUD | `contracts/BudgetToken.sol:9–10`: constructor `(initialHolder)` mint 20.000 × 10^18 một lần cho ví funding, không tự cấp vào Treasury. |
| Decimals/supply | Kế thừa ERC20 OpenZeppelin 5.4.0, 18 decimals; source hai token không thêm owner/public mint/burn, phí hoặc đường quản trị tăng cung. Kết luận này dựa cả source/inheritance, không chỉ selector mint bị revert. |
| Clock | `GovernanceToken.sol:26–31`: `Time.timestamp()`, `CLOCK_MODE() = mode=timestamp`; Governor sau này phải dùng cùng clock. |
| Delegation | Opt-in; balance khác voting power. `ERC20Votes._update` cập nhật voting units cho cả transfer và transferFrom; đổi delegate không chuyển token và không ủy quyền dây chuyền. |
| Lịch sử | OpenZeppelin `Votes` chỉ cho truy vấn timestamp quá khứ; cùng timestamp gộp vào checkpoint cuối. Không lấy receipt delegate làm bằng chứng timestamp đã thành quá khứ. |
| Địa chỉ constructor | ERC20 từ chối zero. GOV không cấm địa chỉ trùng, đúng giới hạn đã ghi trong tài liệu SC02; TV4 phải kiểm tra bốn ví được kiểm soát, đôi một khác nhau trước deploy. Không coi đây là lỗi token chưa được chứng minh. |
| BUD allowance | Hành vi ERC20 chuẩn, không phí. OpenZeppelin phiên bản pin không bắt buộc phát Approval khi transferFrom tiêu allowance; consumer không dựa riêng event đó để suy allowance. |

Dependency đối chiếu: OpenZeppelin 5.4.0 tại
`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`, theo lockfile.

## Kiểm chứng đã thực hiện

### Token tests

Môi trường: Linux x64, Foundry 1.8.5, Solidity 0.8.37, optimizer 200, EVM Osaka.
Chạy trong detached worktree SC02; remapping dùng dependency đã pin ở checkout TV4:

```bash
forge test --match-path 'tests/unit/*Token.t.sol' \
  --fuzz-runs 256 --fuzz-seed 0x20261020 \
  --remappings forge-std/=/home/ptdung/solidity-projects/dao-budget-simulator/lib/forge-std/src/ \
  --remappings @openzeppelin/contracts/=/home/ptdung/solidity-projects/dao-budget-simulator/lib/openzeppelin-contracts/contracts/ -vv
```

Kết quả quan sát: **GOV 15 passed, BUD 9 passed; tổng 24 passed, 0 failed**.
Ba fuzz tests chạy 256 trường hợp mỗi test. Có compiler warnings về tên keyword
trong OpenZeppelin; không sửa thư viện để giấu warning. Không chạy test selector
SC01 như bằng chứng bảo mật token.

Để chạy lại ở checkout SC02 khác, khởi tạo submodule theo lockfile rồi dùng cùng
filter/fuzz seed; remapping tương đối trong `foundry.toml` thay cho hai đường dẫn
máy kiểm tra ở trên.

### Smoke bằng contract được deploy thật trên local

Khởi chạy riêng:

```bash
anvil --host 127.0.0.1 --port 18545 --chain-id 31337 --hardfork osaka --silent
```

Dùng bytecode compiler SC02, ABI encode bằng `cast`, JSON-RPC và các account test
unlocked của Anvil; không dùng private key hoặc RPC bên ngoài. Các bước và assert:

1. Deploy GOV với account A/B/C/D, BUD với funding wallet; đối chiếu supply,
   phân bổ 400/300/200/100, 18 decimals, votes ban đầu bằng 0 và clock timestamp.
2. A/B self-delegate. Tại timestamp hiện tại, getPastVotes bị revert; mine sang
   timestamp kế tiếp rồi đối chiếu snapshot A/B = 400/300 GOV.
3. A approve B 100 GOV; B transferFrom A→B: votes hiện tại A/B = 300/400,
   allowance về 0; phiếu tại snapshot vẫn 400/300.
4. A delegate về zero: current votes A = 0, past votes vẫn 400, past supply = 1.000.
5. Ví funding chuyển 10.000 BUD tới **EOA nhận thử token**, còn 10.000;
   EOA nhận đủ 10.000, supply vẫn 20.000. Đây **không phải Treasury thật**.

Tất cả assert trên đã đạt. Đọc receipt chỉ sau khi transaction đã được mine;
RPC có thể trả `null` ngay sau khi gửi. Receipt metadata, địa chỉ local, block,
source SHA và danh sách assert nằm tại
[`evidence/sc02-local-smoke.json`](evidence/sc02-local-smoke.json).
Chain smoke là tạm, không có explorer/testnet; txHash không phải receipt testnet
và không được dùng để đánh dấu TC01/TC06/TC07/TC10 hoặc deploy toàn hệ thống đạt.

## Điểm bàn giao và regression nên bổ sung

- TV1 mở PR SC02 → Dev; TV4 review constructor/phân bổ, TV3 review read/delegate.
- Hai hành vi đã smoke độc lập nhưng chưa có regression tương ứng trong suite
  SC02: GOV transferFrom giữa ví đã delegate giữ lịch sử; undelegate về zero
  không sửa snapshot. TV1 cân nhắc giữ test cho hai hành vi này.
- TV4 truyền bốn ví khác nhau/khác zero và funding wallet được kiểm soát;
  lưu chainId, địa chỉ, deployment block, version và commit thực tế khi có deploy.
- Sau SC03, ví funding transfer trực tiếp 10.000 BUD vào Treasury thật;
  chờ constructor/roles từ TV1, không dựng địa chỉ hoặc role giả để chạy qua demo.
- Khi có Governor, kiểm tra clock chung, threshold 50 GOV, quorum 20%, delay60s,
  period300s và Timelock120s bằng triển khai thật. Hai token không áp đặt các chính sách đó.
- TV3 dùng integer strings/BigInt và 18 decimals, phân biệt balance/current votes/
  snapshot votes; không truy vấn getPastVotes khi `clock() <= snapshot`.

Full governance/role/attack/invariant acceptance vẫn bị chặn bởi SC03–SC05;
source review SC02 không mở khóa các mục đó.
