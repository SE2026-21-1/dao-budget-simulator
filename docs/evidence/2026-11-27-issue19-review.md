# #19 — TV4 review lượt MetaMask hẹp mới, 27/11/2026

## Verdict

**SCOPED VISUAL/PREFLIGHT ACCEPTED; NO-SEND SUPPORTED BY INFERENCE ONLY; FULL_ACCEPTANCE_PENDING.**

Gói mới bổ sung được ảnh **B-active có lỗi sau Submit** còn thiếu trong handoff trước. Không tiếp tục ghi “TV3 chưa giao ảnh B-active” như blocker chung. Đây là lượt mới trên source cũ `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`, không current Dev/PR60 acceptance, không bản phục hồi phiên H26. Không đủ chứng minh tại provider boundary rằng `eth_sendTransaction` chưa từng được gọi; API 503 chưa được giải thích bằng raw response/log. Không gọi full E2E PASS hoặc đóng #19/#41.

## Nguồn cố định và phương pháp

- Handoff: [comment7198378527](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7198378527).
- Branch producer `evidence/tv3-metamask-negative-20261126-4cba99a0` resolve thành **`887c5ecafd79feaf64956b8e05e9d16576404d84`**. Toàn bộ downloads dùng SHA này, không URL nhánh động.
- [Thư mục bytes cố định](https://github.com/SE2026-21-1/dao-budget-simulator/tree/887c5ecafd79feaf64956b8e05e9d16576404d84/docs/evidence/tv3-metamask-negative-20261126-4cba99a0): 8 files gồm checksum inventory và 7 payloads. TV4 tải từng file thật qua raw.githubusercontent.com; `sha256sum --check --strict SHA256SUMS.txt`: **7 OK, 0 FAILED, exit 0**. [Inventory và source comparisons](2026-11-27-issue19-review.json).
- TV4 xem trực tiếp cả hai PNG; chỉ crop để đọc requestId, không sửa ảnh gốc. Không chạy lại MetaMask/chain/API và không attestation thời điểm producer chụp.
- Review checkout PR60 **`d4d405f2ca64e1786b44c7d81354cbe2de18040f`**; Linux x64, Python 3.12.3, sha256sum/coreutils. Toolchain của run do TV3 khai báo: Node24.15.0, Anvil1.8.5, PostgreSQL18.6; không tự đổi thành PG18.4.

## Identity / bindings

| Thuộc tính | Đối chiếu từ bytes |
|---|---|
| Run | `TV3-MM-negative-20261126-4cba99a0` trong summary và cả 3 RPC snapshots |
| Product source | `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44` trong summary, after-submit, manifest, provenance và role audits |
| Chain | manifest `31337`; snapshots `0x7a69`; ảnh app `31337`, MetaMask Local Anvil |
| Deployment label | summary `tv3-local-0xa6c8b5`; console URL rút gọn có suffix `0xa6c8b5`. Manifest không có deployment_name/DB lookup; label là producer binding, không tự chứng minh tên deployment SQL |
| Chain identity | manifest instance `0xa6c8b5555bbf8da36562bbc8186509ae8f6dcc5527c47f39fb35dc3735f1e943`, genesis `0x14ff4e64087ec8719e06e214d4c41b5fc435ac9c7130b9a418a659f6c400086c`; snapshots không chứa genesis/instance để độc lập kiểm lại |
| Manifest | SHA256 `92f4149f540e3a23178bddb8ed8c5bc68cee0454d031b60257ce89d41aa0de83`; roleCheck H19/hash trùng cả 3 RPC snapshots; config threshold `50000000000000000000`, K2 |
| Account mapping | **B của case là manifest.outsider** `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f`, KHÔNG manifest.accounts.B=`0x7099…79C8` (300 GOV). A=`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| MetaMask | `13.58.0` được TV3 khai báo cho lượt mới trong summary/comment; không có extension manifest/About screenshot trong 8 files để TV4 kiểm độc lập exact version/build/extension ID. Ảnh thể hiện extension thật, không thể đọc version từ ảnh |

Manifest ghi compiler `0.8.37+commit.f401782d`, Osaka, optimizer200, năm ABI/artifact fingerprints và 17 bootstrap/delegation/funding receipts; không có proposal receipt của blocked attempt. Năm artifact normalized-runtime hashes khớp năm identities trong roleCheck; đây là **internal consistency**, không live code-hash audit hoặc rebuild artifact độc lập. Receipt deployments năm contract khớp address/block/tx của manifest.

**Lưu ý newline:** 12/12 first-party `provenance.sourceHashes` **không bằng raw LF Git blob hashes**. Tái tạo CRLF từ đúng Git source thì **12/12 khớp**; 51/51 dependency files cũng khớp CRLF tại OpenZeppelin gitlink **`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`** của source. Không gọi 63/63 là byte-identical Git LF hashes; không sửa manifest để giấu khác biệt. Artifact metadata có compilerSourceNormalizations. Manifest không có frontend source/bundle hashes; producer source declaration không attestation toàn served frontend.

## Ảnh và guard

[Ảnh B-active](https://raw.githubusercontent.com/SE2026-21-1/dao-budget-simulator/887c5ecafd79feaf64956b8e05e9d16576404d84/docs/evidence/tv3-metamask-negative-20261126-4cba99a0/submit-blocked-account-b.png) có app `127.0.0.1:5174/proposals/new`, active address `0x23618…21E8f`, balance/voting power **0 GOV**, delegate zero; MetaMask Imported Account2 cùng address và Local Anvil. Form còn nguyên:

- title `TV3 evidence: insufficient voting power`;
- body `Local Anvil check for the proposal threshold guard.`;
- recipient đúng outsider, amount `1` BUD, native0;
- requestId **`0x91a42f170af13eb1806b31689e4e9f9dce97570c047b266232a6e3e2605480f5`**;
- TransactionStatus “Không gửi được giao dịch.” / “Chưa đủ voting power đã delegate tại checkpoint quá khứ để tạo proposal.”

Nút **Tạo đề xuất vẫn enabled**, không mô tả là disabled. Ảnh trực tiếp chứng minh B-active + draft + trạng thái lỗi phù hợp post-submit; thao tác click và việc không popup trong toàn interval là lời producer, không video/continuous event trace. [Ảnh console](https://raw.githubusercontent.com/SE2026-21-1/dao-budget-simulator/887c5ecafd79feaf64956b8e05e9d16576404d84/docs/evidence/tv3-metamask-negative-20261126-4cba99a0/browser-eth-accounts-console.png) ghi `eth_accounts` trả **[outsider, A]**, chứng minh site account order tại thời điểm query; A vẫn thứ hai không tự là bug. Không chứa accountsChanged sequence A→B→A hoặc before/after requestId để tự chứng minh retention qua switch của riêng lượt mới. Functional transition/retention trace của H26 đã được review trước giữ nguyên source/scope, không ghép hai run thành một trace.

Đọc exact source [CreateProposalPage.tsx L39–55](https://github.com/SE2026-21-1/dao-budget-simulator/blob/4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44/frontend/src/pages/CreateProposalPage.tsx#L39-L55): `assertWritable`/validation → `assertCanPropose(account)` **L48** → `sendGovernor` **L49**. Summary ghi L51–52 không đúng numbering Git source này. [transactions.ts L80–88](https://github.com/SE2026-21-1/dao-budget-simulator/blob/4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44/frontend/src/chain/transactions.ts#L80-L88) đọc clock, threshold và `getVotes(account, clock−1)` rồi throw đúng message. Threshold50 GOV được manifest/summary hỗ trợ; voting power0 được UI trực tiếp hỗ trợ, **không có raw eth_call threshold/getVotes responses** của interval. Source path giải thích lỗi quan sát, không tự chứng minh served bytes hoặc mọi provider request runtime.

## RPC interval

| Snapshot UTC | H/hash | B latest/pending | txpool pending/queued |
|---|---|---|---|
| after-submit `16:40:14.3193375Z` | H19 / `0x81a732f2b519c449c2d3b6babe165db663bb28c52a1a1f1b5d66d496e90efddf` | 0/0 | 0/0 |
| before-repeat `16:41:54.5152071Z` | H19 / cùng hash | 0/0 | 0/0 |
| after-repeat `16:44:45.2779748Z` | H19 / cùng hash | 0/0 | 0/0 |

Ba JSON là producer-captured state summaries, không raw request/response provider log. Chỉ cặp before-repeat→after-repeat bao quanh lần lặp; không có pre-first-submit snapshot trong gói. Không có A latest/pending trong lượt mới. Không đổi B nonce/head và pool rỗng hỗ trợ không có tx được mine/đang chờ **ở các mốc chụp**; không loại trừ request bị wallet từ chối, RPC từ chối hoặc tx bị drop giữa mốc. **Chưa instrument provider boundary: nonce/txpool không đổi và không popup chưa tự chứng minh `eth_sendTransaction` chưa từng được gọi.**

## API503 — lỗi được giữ nguyên, nguyên nhân CHƯA XÁC ĐỊNH

Console trực tiếp ghi `GET :3000/api/proposals?...0xa6c8b5&limit=20` → **503 Service Unavailable**. Summary nói health DBup/indexersynced/publicationready H17/recoveryready,16unknown ancillary topics/0decodeerrors. Không có raw health JSON/status/timestamp hoặc proposals503 body/headers/server/worker/PG log trong gói; không xác nhận hai request cùng thời điểm/snapshot. H17 so head19 phù hợp số học K2, không proof health toàn hệ thống.

Exact [server.ts](https://github.com/SE2026-21-1/dao-budget-simulator/blob/4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44/indexer/api/server.ts) có nhiều đường503:

- L138–172: health read-only transaction; publication available có thể HTTP200 **degraded** khi unresolved topics. 16unknown **không tự là nguyên nhân proposals503**.
- L478–481: publication not ready trả503 cho request không cursor; trạng thái có thể khác lúc health được đọc.
- L556–563: materialize/getSnapshot hoặc lỗi PostgreSQL nhất quán thành503; L662–665 page read cũng có generic503.
- L729–730: Summary trả ngay sau getSnapshot; L756 proposals đi thêm `page(...)`; L757–759 còn generic catch. Summary usable/health200 không chứng minh proposals query thành công hoặc database down.

Không đủ bytes chọn một đường làm root cause; không kết luận schema/migration/PG18.6/unknown-topics là lỗi gây503, không che bằng latest/fixture hoặc gọi full E2E PASS. TV2 cần **đúng request URL/status/raw error body+context, timestamp và API/worker/PG log tương ứng nếu còn giữ** để phân loại rồi mới sửa/regression. Không yêu cầu rerun toàn governance hoặc provenance đã được nghiệm thu.

## Ảnh hưởng acceptance và handoff tối thiểu

1. Tiếp nhận scoped B-active/error/draft visual của run mới, không đòi chụp lại toàn bộ governance. Version13.58.0 chỉ thuộc lời khai lượt mới; **H26 historical version vẫn UNKNOWN, ảnh H26 vẫn MISSING**. Không dùng profile13.57.0.0 hoặc hai ảnh mới để sửa lịch sử.
2. Nếu nhóm cần đóng gate mạnh “zero provider send” bằng lượt thay thế: TV3 chỉ bổ sung một interval draft/account-switch/blocked-submit có provider method trace đầy đủ từ trước thao tác tới sau lỗi, accounts order/from, draft/requestId trước–sau, exact extension identity/version capture. Giữ source/run/manifest riêng, nonces/head/pool riêng; không cần proposal/vote/queue/execute mới, không yêu cầu nộp lại provenance H26 đã đạt.
3. TV2 phân loại503 từ raw request/log tối thiểu nêu trên; thiếu logs thì ghi UNKNOWN, không invented root cause. Gói mới không chứng minh live API healthy.
4. #19 vẫn **FULL_ACCEPTANCE_PENDING / documentary partial**, đã tiến bộ thật ở B-active visual; #41 local pipeline accepted/product6766e5e/H52 không mở lại. #18/#36/BE06/bounded invariants giữ kết luận cũ. Receiver #40/#42 và testnet #20 không được gộp thành case ví đã PASS.
