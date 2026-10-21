# TV4 — Review SC03 và kiểm chứng Treasury độc lập

Ngày chạy: **21/10/2026**. Người vận hành: TV4 (`dung0611`). Chưa thay thế peer approval của TV1/TV2.

## Nguồn và kết luận

- SC03 của TV1: `f8d0fa56288d6f14647ac9627f3acd5111d5620e`, đã vào `Dev` qua [PR #11](https://github.com/SE2026-21-1/dao-budget-simulator/pull/11).
- SC02 đã vào `Dev` qua [PR #10](https://github.com/SE2026-21-1/dao-budget-simulator/pull/10).
- TV4 tích hợp `Dev` tại `1f40748` bằng `496a2f3`, BE02 `4c568d6` bằng `5cb8b7e`.
- Mã kiểm chứng đã chạy: **`7a0ab3315e56d476120b17f979dac7d634a481a5`**. Source hashes, artifact hashes, địa chỉ và receipt local nằm trong [evidence SC03](evidence/sc03-local-smoke.json).

**Kết luận trong phạm vi:** không phát hiện lỗi chặn ở đường Treasury dùng đúng BUD SC02 qua review và các bài đã thực thi. Đã quan sát phân quyền, chống trả lại request, rollback khi thiếu tiền, retry sau nạp quỹ và đối chiếu ledger. Đây không phải chứng nhận an toàn toàn hệ thống hoặc nghiệm thu governance/testnet.

Không sửa production contract của TV1. Không dùng mock token, fake Treasury hoặc impersonate Timelock trong smoke. Spender EOA được cấp có chủ đích trên chain tạm, được ghi nhãn **test spender**, không giả làm cấu hình deployment cuối.

## 1. Review source

| Điểm kiểm tra | Quan sát và ranh giới |
|---|---|
| Constructor | `Treasury(token, initialAdmin)` yêu cầu token có code và admin khác zero; `budgetToken` immutable. `code.length` không chứng minh đúng token: deployment phải đối chiếu manifest/source. |
| Quyền chi | `onlyRole(SPENDER_ROLE)` chạy trước thân `disburse`; admin không tự có spender nhưng có thể cấp quyền khi còn giữ admin. |
| Dữ liệu | Recipient không zero/không Treasury; amount dương; không tự cấm requestId zero. |
| Chống chi lặp | `paidRequests` kiểm tra trước, đặt true trước external token transfer; ID đã trả không dùng lại dù đổi amount/recipient. |
| Rollback | SafeERC20/revert hoàn tác cả paid flag và token state. Thiếu quỹ không tiêu thụ request; cùng request thử lại được. |
| Event/ledger | BUD phát `Transfer` trước `BudgetDisbursed`; Transfer dùng tính tiền, event Treasury dùng liên kết request. Không cộng cả hai vào tổng chi. |
| Giả định token | BUD SC02 không phí/callback, fixed supply. Không suy ra an toàn cho token độc hại hoặc token tính phí tùy ý. |
| Bàn giao quyền | Renounce admin không tự thu hồi spender. Cấu hình cuối phải đối chiếu toàn bộ RoleGranted/RoleRevoked từ deploy và hasRole, không chỉ vài địa chỉ. |
| Ngoài Treasury | Contract không kiểm proposal, quorum, payload whitelist hay delay; các điều kiện đó vẫn phụ thuộc SC04/SC05. |

Unit test gốc TV1 có callback đối kháng, false/revert transfer, role handoff và fuzz. TV4 không chép lại thành attack suite chỉ để tăng số test.

## 2. Kiểm thử stateful độc lập

File: [`tests/invariant/TreasuryAccounting.t.sol`](../tests/invariant/TreasuryAccounting.t.sol).

- Dùng BudgetToken/Treasury thật; 16 request ID (có zero), 4 người nhận, 3 spender luân phiên và một actor luôn không có quyền.
- Hành động: nạp quỹ, grant/revoke/self-renounce, thanh toán tùy ý và thanh toán với amount khả thi.
- Oracle ghi kết quả lời gọi thành công, amount và recipient; dự đoán bằng lịch sử quyền/số tiền độc lập, không lấy `paidRequests` hoặc số dư Treasury làm điều kiện dự đoán.
- Kiểm per-recipient balance, tổng vào/ra, tổng cung, mỗi request tối đa một lần và caller hiện có quyền. Cờ mismatch là sticky để không mất lỗi khi runner bỏ qua revert của handler.
- Mỗi reset có một giao dịch chi thật thành công qua handler. Regression nhiều bước chứng minh request sống qua thiếu quyền/thiếu tiền/revoke, thành công qua spender khác và không replay sau re-grant.

**Kết quả quan sát:** 3 invariant checks trong campaign **100 runs × 50 thao tác = 5.000 handler calls**, seed `0x20261021`; changeRole 1.254, fund 1.291, pay 1.234, payAvailable 1.221; handler reverts 0. Các Treasury revert dự kiến được handler bắt và đếm riêng, không phải không có negative calls. Regression assert 3 lần trả thành công, 5 lần từ chối. Toàn suite Foundry: **58 passed, 0 failed, 0 skipped**. Foundry nhóm invariant checks thành một campaign, không nhân 5.000 thành 15.000 calls.

[Stdout Foundry](evidence/tv4-foundry-20261021.txt). Đây là **Treasury-only invariant**, không đổi INV01–INV04 toàn hệ thống sang PASS; chưa có Governor execute hay timestamp/quorum oracle.

## 3. Smoke bằng giao dịch thật trên Anvil

Chạy lại từ root, với Foundry 1.8.5, Node 24.15.0 và dependency đã khóa:

```bash
npm ci
FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh
node --import tsx scripts/smoke_treasury.mjs --output /tmp/sc03-local-smoke.json
```

Runner sở hữu Anvil riêng, chỉ bind loopback và tự dừng sau chạy; không nhận RPC URL/private key, không đụng chain/database đang có. Không lấy artifact cũ thay cho bước build. Evidence chỉ được ghi sau khi assertions hoàn tất; khi runner lỗi phải kiểm exit code, không dùng file evidence của lần chạy trước.

**Đã quan sát 19 receipt: 13 status=1, 6 status=0.** Revert là giao dịch đã mine, có txHash và trace decoded custom error, không bịa receipt từ eth_call.

| Kịch bản | Kết quả thực tế |
|---|---|
| Deploy BUD/Treasury, kiểm token link | BUD runtime bytecode khớp artifact; Treasury có code, budgetToken đúng; supply 20.000 BUD. |
| Funding | Nạp 10.000 BUD vào Treasury. |
| Outsider và admin không spender | AccessControlUnauthorizedAccount đúng account/role; balances và paid flag không đổi; không log commit. |
| Chi lần đầu | 1.000 BUD đến recipient; Treasury còn 9.000; request paid. |
| Đổi amount/recipient nhưng giữ request | RequestAlreadyPaid; không trả thêm. |
| Chi 10.000 khi chỉ còn 9.000 | InsufficientBudget đúng args; request chưa bị tiêu thụ. |
| Nạp thêm rồi retry cùng request | Nạp 1.000; trả 10.000 thành công; recipient có 11.000. |
| Revoke spender khi Treasury có tiền | Bị từ chối, request giữ nguyên; sau grant lại, request đó trả 1.000 cho recipient khác. |
| Bỏ quyền trong môi trường tạm | Thu hồi spender, admin renounce; former admin không grant lại được. Đây không phải bàn giao Timelock cuối. |
| Ledger cuối | Tổng vào=12.000, tổng ra=12.000; Treasury=0, funding=8.000, recipient=11.000, alternate=1.000; supply vẫn 20.000. |
| BE02 đọc receipt thật | Decode 7 Transfer (có mint/funding) và 3 BudgetDisbursed bằng decoder hiện hữu; amount giữ chuỗi nguyên, payout IDs không trùng. Không chứng minh PostgreSQL projection/API. |

## 4. Điều kiện chưa đủ để nghiệm thu

- QA02/QA03 toàn hệ thống: SC04/SC05, constructor và role graph thực; manifest và check-roles phải xác nhận chỉ Timelock giữ Treasury admin/spender, Governor giữ đúng quyền Timelock, không còn bootstrap quyền.
- QA05/QA06 governance: propose/vote/queue/execute thật, boundary snapshot/deadline/ETA, whitelist, cancel và INV02/INV04.
- QA07: BE checkpoint/K-confirmations/reorg/resume/projections/API/rebuild, UI wallet/form thật và so cùng block H.
- QA08: testnet có RPC/faucet, xác minh hỗ trợ Osaka; chờ thời gian thật, không dùng time-warp.

Không funding môi trường vận hành theo role EOA của smoke. Không dùng việc admin bỏ hết quyền trong chain tạm làm mẫu deploy: môi trường sản phẩm cần Timelock nhận đúng quyền trước khi renounce.
