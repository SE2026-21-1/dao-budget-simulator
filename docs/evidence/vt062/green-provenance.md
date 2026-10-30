# VT-062 — GREEN provenance (2026-10-30 UTC)

## Checkout và commits

- Clone cá nhân bền vững: `/home/cuongdz/projects/dao-budget-vt062-individual`; branch `individual/23001841-vt062-idempotent-retry`.
- Baseline TV3: `ae8c3533e14a01f74ba4ea7b00c74365e1651be1`.
- Commit test-only trước production patch: `9a87741ae4728edb4092ece6d8d9e4c90f7650b7` (hai test RED, `happy-dom` test dependency và lockfile).
- Commit patch + test bổ sung: `8a4cb6474775d210d6126b9faa3fab87b4bc2d07`; tác giả commit là Codex, không quy kết code AI cho sinh viên.
- Patch đúng từ test-only commit tới code commit: `green-code-and-tests.diff`, SHA-256 `2a4e1f4ea98a7f49d58615c3907be9c6d4e415624335fa92d824271d208a6a36`. `git diff --cached --check` trước commit: exit 0.
- RED log gốc giữ nguyên: `red-targeted.txt` SHA-256 `0534b9dae921eb7c06d33cc738a28316d105a33e5699c19686ff3c3ed59ee791`; `red-ui.txt` SHA-256 `68a87a209dddc53c25bf7686eb6cd3e046e662c0d4f4f71b41e1a5f14f48c7ea`.
- Checkout ban đầu ở `/mnt/d/dao-budget-simulator`: branch `feature/tv2-be03`, HEAD `4b9f060e8e2bdef7849b09d55ddeaf6a90545d4d`; `git status --short --branch | cmp - opened-checkout-status-final.txt` cho exit 0 sau patch. Không sửa checkout này.

## Môi trường và lệnh thực chạy

`.nvmrc` = `24.15.0`; Node `v24.15.0`, npm `11.12.1`. Node Linux cho lượt này ở `/tmp/dao-node-24.15.0/bin`; `frontend/node_modules` cài từ committed lockfile. Mọi lệnh dưới đây chạy tại clone cá nhân; prefix PATH ghi đúng môi trường thực tế.

| Lệnh | Log raw cuối | Exit | Kết quả |
|---|---|---:|---|
| `PATH=/tmp/dao-node-24.15.0/bin:$PATH npm run test --prefix frontend -- src/chain/useTransaction.vt062.test.ts src/pages/CreateProposalPage.vt062.test.tsx` | `green-original-two.txt` | 0 | Hai file RED gốc qua; 10 test qua sau khi bổ sung cases. Oracle cũ send count = 1 giữ nguyên. |
| `PATH=/tmp/dao-node-24.15.0/bin:$PATH npm run test --prefix frontend` | `green-frontend-suite.txt` | 0 | 5 file / 29 test qua. |
| `PATH=/tmp/dao-node-24.15.0/bin:$PATH npm run lint --prefix frontend` | `green-frontend-lint.txt` | 0 | Còn 8 warning sẵn có ở `wallet.tsx`; không có warning mới từ patch. |
| `PATH=/tmp/dao-node-24.15.0/bin:$PATH npm run build --prefix frontend` | `green-frontend-build.txt` | 0 | TypeScript + Vite qua; warning chunk JS > 500 kB. |

Các log raw chứa output và `EXIT_CODE` thực của lần chạy cuối. Một lần gọi đầu tới `/home/cuongdz/.nvm/nvm.sh` exit 1 vì đường dẫn đó không tồn tại; sau đó dùng Node 24.15.0 đã tải. Build đầu sau patch exit 2 do TypeScript `erasableSyntaxOnly` không chấp nhận parameter property trong class; đã đổi sang khai báo field tường minh rồi chạy lại build thành công. Test mới về receipt từng fail do `beforeEach` trả về mock function như cleanup; đã sửa callback trả `void`, chạy lại 14/14 test VT-062. Đây là lỗi trong quá trình phát triển test/patch, không phải RED gốc.

## SHA-256 production source tại code commit

| File | SHA-256 |
|---|---|
| `frontend/src/chain/transactions.ts` | `5aed140355fb5f5cb427c90c7a174575c8f7e58759fe989878eff59abbf79f7e` |
| `frontend/src/chain/useTransaction.ts` | `4cb742fd8f10a08af84c9b5b678541d26070b9e52350b22ebd8213de970d258d` |
| `frontend/src/pages/CreateProposalPage.tsx` | `2a89dccea4f1700696f2de8fba6ae8fb6039420eb7d1abab06ba21edf8272c1b` |

Không có RPC, ví extension hoặc chain thật trong test này. Kết quả GREEN chứng minh hành vi component/hook với dependency kiểm soát được, chưa phải acceptance trên testnet.
