# VT-062 — Checkout, baseline và môi trường

Ngày khảo sát: 2026-10-30 UTC.

## Checkout mở ban đầu

Lệnh khảo sát đầu: pwd; git remote -v; git branch --show-current; git rev-parse HEAD; git status --short --branch.

Kết quả:
- Thư mục: /mnt/d/dao-budget-simulator
- origin fetch/push: https://github.com/SE2026-21-1/dao-budget-simulator.git
- branch: feature/tv2-be03
- HEAD: 4b9f060e8e2bdef7849b09d55ddeaf6a90545d4d
- upstream: origin/feature/tv2-be03, behind 7
- working tree có nhiều thay đổi tracked ở contracts, frontend, docs, scripts, migrations/fixtures/tests và hai thư mục untracked audit-be04-20261024/ và dao-bt3-vt062/. Bản status lúc khảo sát được lưu tại opened-checkout-status.txt.
- Không ghi/sửa bất kỳ file nào trong checkout mở. Thử git worktree add từ .git này exit 255: không tạo được refs/heads/individual/... vì .git bị giới hạn ghi. Không có reset, pull, merge, push hay PR.

## Lựa chọn baseline và nhánh cá nhân

- Nhánh source phù hợp: origin/feature/tv3-frontend, commit đầy đủ ae8c3533e14a01f74ba4ea7b00c74365e1651be1.
- Lý do: commit này có useTransaction, màn hình CreateProposalPage, wallet transaction helper và frontend Vitest. Checkout mở tại BE03 không có toàn bộ vertical slice frontend cần kiểm tra. Nhánh TV3 là baseline nhỏ nhất có luồng gửi proposal và test frontend đầy đủ; không lấy evidence lịch sử BE03/BE04/TV4 làm test mới.
- Clone dao-bt3-vt062 có branch feature/tv3-frontend sạch tại cùng SHA. Không thấy BT3_23001841_VT-062.md hoặc file *23001841*VT-062* trong các đường dẫn repo đã tìm.
- Clone làm việc cô lập: /tmp/dao-budget-vt062-individual. Branch cá nhân được tạo trong clone: individual/23001841-vt062-idempotent-retry, từ ae8c3533e14a01f74ba4ea7b00c74365e1651be1. Remote origin của clone trỏ về URL repository chính thức. Không push.
- Working tree trước khi thêm VT-062 artifacts sạch; hash SHA-256 của frontend/src/chain/useTransaction.ts tại baseline: 632249c8480d114bb6e7bbe05b9c2296072e30e2f05c6436fbfd888eafc32c7f. Sau khi viết test, diff/status xác nhận production files frontend/src/chain/useTransaction.ts, frontend/src/pages/CreateProposalPage.tsx, frontend/src/chain/transactions.ts không bị sửa.

## Hướng dẫn và phân công đã đọc

- Checkout mở không có AGENTS.md tại repo root/cha. Baseline branch TV3 có AGENTS.md; đã đọc toàn bộ. Hướng dẫn khóa Node 24.15.0, dùng npm lockfiles riêng root/frontend, test frontend bằng npm run test --prefix frontend, API chỉ đọc và wallet ký trực tiếp qua contract.
- Đọc docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md, docs/requirements/TV1_Cong_viec_Smart_Contracts.md, docs/test-plan.md, README và BE01–BE07 runbooks/checklists. Requirements §6/§9 giao TV2 FR13–FR16 (indexer/data/API) và TV3 FR01–FR04/FR11–FR12 (dashboard/wallet); đề nghị TV2 review tích hợp API, TV3 review end-to-end. Candidate branch nhắc BE08 là benchmark nhưng không có assignment/doc BE09 hoặc BE10.
- Đọc frontend/package.json, frontend/package-lock.json, frontend/vite.config.ts, frontend/tsconfig.app.json và source/test liên quan.
- Bản status gốc nằm ở opened-checkout-status.txt. Không mở, in hoặc ghi credential/connection string.

## Toolchain và cài đặt

- .nvmrc: 24.15.0. Shell node/npm ban đầu không chạy: node không có Linux executable trên PATH; Windows node.exe báo WSL interop socket error.
- Tải Node.js v24.15.0 Linux x64 vào /tmp/dao-node-24.15.0 sau sandbox DNS thất bại và user approval. Xác minh: node --version → v24.15.0; npm CLI → 11.12.1.
- npm ci --prefix frontend dùng đúng frontend/package-lock.json, cache/log tại /tmp; lần sandbox đầu registry trả EAI_AGAIN, sau user approval cài thành công 87 packages, audit 0 vulnerabilities. Không thêm dependency và không đổi package.json/package-lock.json.
- Cài/test dùng Node/NPM đã khóa. Lệnh đầy đủ và output frontend test/build/lint lưu ở các file cùng thư mục evidence.

## Test-first RED và kiểm tra nền mới nhất

- Unit hook: npm test --prefix frontend -- src/chain/useTransaction.vt062.test.ts; exit 1, 1 fail/2 pass. Assertion send-count expected 1, actual 2. Output: red-targeted.txt.
- Luồng UI thật của component: npm test --prefix frontend -- src/pages/CreateProposalPage.vt062.test.tsx; exit 1 ở assertion sendGovernor count expected 1, actual 2. Trang đã render trong happy-dom, summary làm nút sẵn sàng, form được điền, lần gửi trả H1, lần wait đầu reject RPC timeout, nút vẫn enabled và lần click thứ hai đi qua submit handler. Hash, nội dung form và request ID được assert. Output: red-ui.txt.
- Full frontend suite sau npm ci sạch theo lockfile cuối: 16 pass, 2 fail (hai test VT-062 nói trên), exit 1. Hai failure đều ở oracle send count, không phải import, selector, DOM, package hay module setup. Output: all-frontend-tests.txt.
- npm ci --prefix frontend --offline --no-audit theo lockfile cuối: exit 0, 93 packages cài sạch. Output: frontend-npm-ci-final.txt. happy-dom 21.0.4 là direct test-only dependency duy nhất mới; lockfile ghi các transitive dependency.
- npm run build --prefix frontend: exit 0, TypeScript và Vite build pass; Vite báo bundle JS >500 kB. Output: frontend-build.txt.
- npm run lint --prefix frontend: exit 0; còn 8 warning tại frontend/src/chain/wallet.tsx, không có warning từ hai test VT-062. Output: frontend-lint.txt.
- Dependency install happy-dom và audit: happy-dom-install.txt, exit 0, 94 packages audited, 0 vulnerabilities.
- Production diff vẫn rỗng; fingerprint và status: production-source-diff.txt, production-source.sha256, isolated-branch-status.txt.

## Hậu quả on-chain được rà lại

OpenZeppelin Governor cùng gitlink commit c64a1edb67b6e3f4a15cca8909c9482ad33a02b0 tính proposalId từ action + description hash rồi reject proposalId đã tồn tại trước event ProposalCreated. Với exact same draft, lỗi đã chứng minh là app gửi H2 không cần thiết; không tuyên bố H2 tạo thêm ProposalCreated/data. Nếu payload thay đổi mà reuse requestId, proposalId có thể khác. Treasury.paidRequests là lớp ngăn successful payout trùng theo requestId; raw event unique key là lớp indexer riêng. Chi tiết và dòng source ở source-review.txt và plan-review-v4.md.
