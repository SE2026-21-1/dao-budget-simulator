# PR60 / PR61 / Dev — đánh giá tích hợp tĩnh, 27/11/2026

## Phạm vi và kết luận

Đã đọc đầy đủ body/comments/reviews/inline trong `/tmp/tv4-review-20261127/scope-60.md` (740 dòng), `scope-61.md` (113 dòng), `scope-52.md` (83 dòng), và Git delta liên quan. Các file dài/truncated được đọc tiếp bằng raw ranges, không suy từ bản tóm tắt. Đây là **review tích hợp + patch chuẩn bị**, không phải merge, approval mới, release hay deployment acceptance.

**Hai PR đều conflict thật với Dev hiện hành, chỉ tại `indexer/abi-registry.ts`.** Không dùng `mergeable=false` của API làm bằng chứng conflict và không tái sử dụng danh sách năm conflict lịch sử 24/11. Patch bên cạnh là **full resolved Dev→head60 tree diff**, gồm 34 file / 1.832 additions / 60 deletions. Chỉ registry cần quyết định thủ công; 33 file còn lại là hợp nhất tự động/inherited Dev delta. Không có source deliver nào được áp dụng/thay đổi bởi báo cáo này.

Đề xuất **61 rồi 60**, bằng merge commit thông thường khi maintainer xác nhận các gate riêng: #61 có đúng bốn commit backend/oracle/clock và TV2 scoped approval; #60 giữ TC10/security/QA/evidence riêng. Không squash/rebase/force, không nhập PR21/55 hay nhánh personal/individual. Đây là thứ tự kỹ thuật đề xuất, **không yêu cầu thực hiện merge bây giờ**. Sau mỗi merge được ủy quyền phải fetch/pin Dev mới và tính lại `merge-tree`; không áp patch bound Dev dưới đây mù vào SHA trung gian. Chưa tạo synthetic intermediate commit nên không tuyên bố second-hop merge clean hoặc chỉ cần giải conflict một lần.

## 1. Nguồn đã fetch và pin

Remote: `https://github.com/SE2026-21-1/dao-budget-simulator.git`; Git 2.43.0, Linux x64. Chạy từ worktree bàn giao; không checkout/switch/reset/stash hoặc sửa user branch/index.

```sh
git fetch origin \
  refs/pull/60/head:refs/tv4-audit-20261127/pr60 \
  refs/pull/61/head:refs/tv4-audit-20261127/pr61 \
  refs/heads/Dev:refs/tv4-audit-20261127/dev
# exit 0
```

| Ref | Full SHA |
|---|---|
| PR60 | `d4d405f2ca64e1786b44c7d81354cbe2de18040f` |
| PR61 | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| Dev hiện hành | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| merge-base PR60 / Dev | `896f93ea282d76fa72339a97ea12339240c16da4` |
| merge-base PR61 / Dev và PR60 / PR61 | `6766e5ee2d8c466542687cbeb09677c4d11e5463` |

PR60 body/CI 26/11 còn nói Dev `3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e`: đó là nguồn lịch sử, không phải Dev hiện tại. Dev đã thêm pull-CD, administrative-event decoding và smoke/storage audit qua chuỗi **một parent mỗi commit**:

1. `3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e` ← `896f93ea282d76fa72339a97ea12339240c16da4` — inherited OpenStack/Anvil declarations.
2. `79bd0c2f1e5f3eb55289aee75b5ee8bb342a4327` ← `3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e` — inherited pull-CD.
3. `50a9a9025e2d3a656394df67578b046d50a119ce` ← `79bd0c2f1e5f3eb55289aee75b5ee8bb342a4327` — ancillary decoding/named tunnel.
4. `12b87e7fa429ebdc75d76b1bd8c7d618d2d1d4de` ← `50a9a9025e2d3a656394df67578b046d50a119ce` — reader comparison.
5. `d63842ae50dc9a29a42529ce7cd08ca7c569759e` ← `12b87e7fa429ebdc75d76b1bd8c7d618d2d1d4de` — storage replay audit.

Không fetch user feature/personal branches. `lsp status` trả **No language servers configured for this project**; dùng Git objects/diffs và source reads, không có LSP refactor/source edit.

## 2. Mergeability tái lập, không thay branch

Chạy đúng các full SHA sau (các ref pinned ở trên tương đương):

```sh
git merge-tree --write-tree d4d405f2ca64e1786b44c7d81354cbe2de18040f d63842ae50dc9a29a42529ce7cd08ca7c569759e
# exit 1; tree 15934ea7e5a1409e7ff5848a648bf461cb30d0b3

git merge-tree --write-tree cba8b6c9eda65959d82250441b8eed131a1a5044 d63842ae50dc9a29a42529ce7cd08ca7c569759e
# exit 1; tree b8e5cfdd6ffe38c287e4683d02c87509147c15f0

git merge-tree --write-tree d4d405f2ca64e1786b44c7d81354cbe2de18040f cba8b6c9eda65959d82250441b8eed131a1a5044
# exit 0; tree b2e6bae067617003c21f68f250962126ffe629c7
```

Cả hai exit 1 là **conflict expected**, không phải tool crash. Cùng một path/stages:

| Path | Stage | Blob |
|---|---:|---|
| `indexer/abi-registry.ts` | 1 / base | `b3027e7059dd3eee18124bc9f9fdaebdd71a030e` |
| như trên | 2 / PR60 hoặc PR61 | `46b9a9527e728932b2943d96dc20af7c7908e199` |
| như trên | 3 / Dev | `331f99822483507634c038c84ad8dc513a1e463c` |

Auto-merge messages của PR60×Dev còn có `.gitignore`, `README.md`, `scripts/check_be04_live.mjs`, `tests/indexer/decoder.test.ts`, `tests/indexer/projection-storage.test.ts`; đó **không phải conflict paths**. PR61×Dev auto-merges ba script/test paths sau registry. Conflict tập trung hai hunk: import `EventFragment` đối lập import ancillary và registry `abi/interface/eventsByTopic`.

Tree PR60×PR61 trùng **đúng PR60 tree** `b2e6bae067617003c21f68f250962126ffe629c7`; `git diff --quiet PR60 <combined-tree>` exit 0. Hai PR không phải hai BE08 implementations cạnh tranh. Bằng chứng này chỉ so hai head gốc, không chứng minh merge sau khi Dev đổi sẽ sạch.

## 3. Duplicate blobs, fixes và regression được giữ

Toàn bộ 10 file net delta của PR61 từ common product base có **cùng blob ở head60 và head61**:

| File | Blob chung ở cả hai head |
|---|---|
| `docs/be08.md` | `c00f2bc0884cec271babba36a2cabf0147d79fa5` |
| `indexer/abi-registry.ts` | `46b9a9527e728932b2943d96dc20af7c7908e199` |
| `indexer/decoder.ts` | `88a8fce9355208194776b948ff7d956ddc039dec` |
| `indexer/projection/projector.ts` | `657263c53a34133502bc99690724c81576f7170b` |
| `scripts/be08_rpc_outage.mjs` | `6669cdb488d06ba6ffe874f86de8a3cdda1bee8a` |
| `scripts/be08_worker_probe.mjs` | `025b6a0d75c235be737e40646701aa6457719b85` |
| `scripts/check_be04_live.mjs` | `fb2399714c353109d3351de5d236afce264caa96` |
| `tests/indexer/be08-rpc-outage.test.mjs` | `72cc9922867b12b8f32d2981c1c155f3a7c59c66` |
| `tests/indexer/decoder.test.ts` | `55f1e9fcb8217d2e6a0c6cc9c08612edea26093b` |
| `tests/indexer/projection-storage.test.ts` | `627208b53bb21c01345acd00906ce4d1a0434a16` |

Lịch sử PR61 hẹp, có đủ parent chain:

| PR61 commit | PR60 port / ý nghĩa |
|---|---|
| `42518f76ab102e65f286e8c74fc66fdf4409a841` | `5c899976ac4de97434737493815e7ccbdcd13984`: cùng-ID lifecycle, bỏ miễn trừ gần biên 5s không có chứng cứ, sửa stdout counter |
| `72d08940d63b99ec4d8e4d49f463251d7a0c714c` | `375149a5d7e622bce7ad19b3eae39c9cb09536f1`: worker close → seal acceptance → drain pending async handlers → validate final trace |
| `a672fd229ed4ec1912fe11141d307fd0b1b9abaa` | `7141d731c10d1e64c81cc1736d21ba8dac16e2ea`: frozen topic index + set-based SQL publication |
| `cba8b6c9eda65959d82250441b8eed131a1a5044` | `96e46013e435e743e3d3df696255ab4864461bd5`: đúng sáu dòng owned-Anvil clock fix/header timestamp assertions |

Đối chiếu source tĩnh:

- **Outage**: grouping bằng logical JSON-RPC ID, không stdout timing; method/params và ordered retry samples giữ nguyên; partial count phải có **same-ID observation ngoài measured window**; max 4 attempts, positive backoff. `outage()` chưa chốt PASS mà ghi `AWAITING_FINAL_TRACE`. `close()` memoizes promise, đợi clean worker exit và proxy/pending handlers trong deadline 10s, xóa stale retry summary trước kiểm toàn trace; late fifth làm cả outage/freshness FAIL và close reject kể cả gọi lại. Four shutdown/interleave/boundary regression variants vẫn có.
- **Topic index**: dựng một `Interface`/registration, precompute `eventsByTopic`, freeze bảng, decoder lookup topic lowercase; không cache decoded payload. Indexed-topic shape, complete decode/encode round-trip và malformed bytes rejection vẫn giữ. Regression uppercase topic/payload isolation ở `decoder.test.ts` còn nguyên.
- **SQL**: `jsonb_to_recordset` batch theo bảng vẫn giữ uint256 dưới dạng string/numeric, UTF-8/bytes/arrays và source-event IDs; thứ tự proposals → proposal_states → votes → operations → transfers → disbursements giữ FK. `publish` và projection checkpoint vẫn trong cùng BEGIN/COMMIT/ROLLBACK. Regression hai proposal/vote, Unicode/byte arrays, stable replay, trigger từ chối một vote → toàn publication/checkpoint rollback không bị thay bằng no-op.
- **Clock**: chỉ disposable owned Anvil đặt `anvil_setBlockTimestampInterval(0)` sau bootstrap; transaction có `at` phải đối chiếu mined receipt header timestamp. Không sửa product clocks, boundary assertions, K2, RPC retry/deadline hoặc timeout benchmark.
- Native history **không chạy lại**: report cũ bind PR61 `a672fd229ed4ec1912fe11141d307fd0b1b9abaa` và PR60 `7141d731c10d1e64c81cc1736d21ba8dac16e2ea` với 13 suites / 20 freshness samples PASS mỗi nguồn. Các normal-load FAIL cũ vẫn lịch sử; không gọi chúng là defect còn pending sau performance fix và không đổi nhãn thành run mới trên head docs.

## 4. Resolution cụ thể, vì sao không chọn nguyên ours/theirs

Artifact: [2026-11-27-pr60-dev-resolution.patch](2026-11-27-pr60-dev-resolution.patch).

- Base bắt buộc: head60 `d4d405f2ca64e1786b44c7d81354cbe2de18040f`.
- Dev input bắt buộc: `d63842ae50dc9a29a42529ce7cd08ca7c569759e`.
- Resolved tree object: `b54a97dd79dd2e5f31ab04fe724637f37ab5b06e` (tree, **không commit**, không branch ref).
- Resolved registry blob: `1cfa999aedae4e445b8259b1bd0bd5cbcb053c66`.
- Patch SHA-256: `9657cfa86d99463847ddd2a29f67ecbca01d4ed606e206812984e8d20c3c94cc`; 112.199 bytes; Git full-index/binary format có thể `git apply`.
- Patch không gồm chính nó/báo cáo này, không gồm edits đang làm của agent khác. Nó diễn tả **toàn bộ integration snapshot so với Git head60**, không phải patch để apply sau một merge index đã dirty/conflicted.

Giải pháp registry: giữ cả `EventFragment` và import `ANCILLARY_ABI`; tạo union **một lần mỗi registration** rồi dựng interface **và topic index từ đúng union đó**, publish frozen ABI/index cùng interface:

```ts
const registeredAbi = [...abi, ...ANCILLARY_ABI[role]];
const eventInterface = new Interface(registeredAbi);
const eventsByTopic: Record<string, EventFragment> = Object.create(null);
eventInterface.forEachEvent(fragment => { eventsByTopic[fragment.topicHash] = fragment; });
// return keeps role/version/source/integrationStatus
abi: Object.freeze(registeredAbi),
interface: eventInterface,
eventsByTopic: Object.freeze(eventsByTopic),
```

Chọn nguyên PR60 sẽ mất administrative-event recognition mới của Dev; chọn nguyên Dev sẽ mất `eventsByTopic` mà decoder BE08 hiện dùng. Chỉ ghép import/`abi` nhưng dựng index từ ABI business cũ cũng sai: admin logs vẫn unknown dù interface nhận chúng. Union duy nhất tránh mismatch và không thêm per-log interface/index allocation.

Các overlap tự động cần reviewer nhìn đúng delta:

| File | Intent PR60/61 giữ | Intent Dev giữ |
|---|---|---|
| `tests/indexer/decoder.test.ts` | uppercase topic + độc lập payload + malformed bytes | 13 admin layouts so compiler ABI, malformed admin encoding, 16 historical bootstrap raw logs không đổi bytes |
| `tests/indexer/projection-storage.test.ts` | multi-row exact fields / full rollback | admin raw `decoded`, CLI exit0, simulated old unknown metadata được redecode không đổi raw bytes/context/treasury |
| `scripts/check_be04_live.mjs` | owned-clock freeze / header timestamps | canonical bootstrap admin logs unknown count 16→0, rawDecodeComplete false→true cho **nguồn mới** |
| `indexer/projection/model.ts` | projector batch path không đổi | ancillary decode valid nhưng classify trả null, không biến thành business proposal/vote/transfer |
| `scripts/governance_storage.mjs`, `scripts/smoke_governance.mjs` | existing canonical/ledger assertions | admin receipt provenance và source hash bổ sung `ancillary-abi.ts`, expected supported raw decode/CLI exit0 |
| README/.gitignore | PR60 acceptance/retirement history | inherited Dev demo/tunnel references/ignore rules |

Historical PR60 evidence còn 16 ancillary unknown / 0 decode errors **không bị sửa thành full decode**. Nguồn Dev mới và patch có supported admin ABI, nên mới kỳ vọng 0 unknown; đó là source change cần review, không phải relabel historical CI/evidence.

### Ranh giới inherited infrastructure

Các path `.github/workflows/anvil-demo-infra.yml`, `infra/**`, `deploy/anvil-demo/**`, `docs/openstack-anvil-demo.md`, `docs/stable-api-tunnel.md` đến nguyên từ Dev. Patch full integration chứa chúng để không âm thầm bỏ Dev intent/history, **không phải đề nghị khôi phục #56 hoặc rollout**. Không audit lại toàn CD/IaC như feature mới trong assignment này. Workflow mới có `terraform init -backend=false`/validate, Compose render và unit test definitions; không có apply/SSH/deploy job. Không chạy workflow, Terraform, agent/service, Docker, tunnel hay bootstrap. Runbooks/CD implementation là inherited review delta, không deployment permission. Nếu maintainer không chấp nhận Dev infrastructure scope, đó là quyết định riêng trên Dev, không sửa ngầm trong conflict resolution.

### Cách dùng không mất lịch sử

Để review patch trên **disposable clean head60**: `git apply --check --index <patch>` rồi (nếu người dùng sau này cho phép) apply để xem đúng resolved snapshot. Trong assignment này chỉ apply **cached** vào throwaway index, không checkout hay actual merge. Không dùng snapshot patch làm squash thay merge history.

Khi thực sự được phép tích hợp, maintainer tạo merge commit hai parent đúng source mới nhất; khi registry conflict thì giữ union/interface/index như trên. Nếu #61 được merge trước, Dev SHA đã đổi và phải tính lại patch/merge-tree, không mặc định artifact full-delta này còn là exact-base patch. Giữ nguyên bốn original BE08 commits, các scoped PR60 ports/security/QA commits và Dev ancestry; không cherry-pick cả PR21/55 hoặc personal refs.

## 5. Security, receipt/funding, migration và verify-only không bị lùi

Source blob identities đã đối chiếu `b186844d1ff19ef26dfd83a060e7584bb6e0c419` → head60 → auto-merged tree; registry resolution không đụng các path dưới:

| Path | Blob giữ nguyên |
|---|---|
| `scripts/governance_sepolia.mjs` | `68f8806191601b26dcd443c8a740009bfa5441a1` |
| `scripts/deploy_sepolia.mjs` | `811ddf55fdf177094f98c3f58bb888e57ef92fc4` |
| `scripts/sepolia_cli.mjs` | `877f09e132485c357ef120dcfdc5efabafab9c7d` |
| `tests/smoke/sepolia.test.mjs` | `0fc1f38b0cfdf0cca114b028b3a5495a80df10f1` |
| `deploy/operations.test.mjs` | `25bd0cdd80d478ed7cb326654e6863c910584ee5` |
| `.github/workflows/verify-release.yml` | `4582955ed2480f9b4f499b2c91b9b4ba59545e59` |

- `submitSignedTransaction`: `keccak256(signedRaw)` → await persistent SIGNED identity → eth_sendRawTransaction → strict returned 32-byte hash equality (case-normalized) → return local expected hash. Không đổi local identity theo RPC response sai/mất response, không resend.
- Journal: reserve exclusive output, mode0600 temporary file, write/fsync/close/rename/directory fsync. Không lưu signed raw/private material. Không suy thành proof mọi crash/power-loss window; SIGNED sau fail có thể đã broadcast và cần custodian reconcile thủ công.
- `waitConfirmed`: hai receipt đều bound submitted transaction, canonical block number/hash, stable transaction index và canonical membership, status và hai descendants K2. Misrouted initial/final receipt không được ghi funding success.
- Funding regressions vẫn gồm confirmed-receipt substitution và signed-submission-result substitution: actual funding zero descendants; cái sau assert identity trên disk trước send, SIGNED/FAIL_STOP_NO_AUTOMATIC_RETRY, không funding receipt/K2 và đúng một funding send. Six signed-response cases vẫn có.
- Ba operations tests đúng tên: **all existing SQL migrations retain their bodies without nested transaction wrappers**; **migration set hashes exact contents in sorted filename order**; **manifest rejects tags, cross-service digests, foreign registries and numeric run IDs**. Không hồi sinh rollout harness.
- `.github/workflows/ci.yml` head60/resolved blob `20ba7c86c69a1b55f16d5d4106ac7078551f1439`: vẫn chạy bắt buộc `node --test scripts/cd/release.test.mjs deploy/operations.test.mjs` (4 release + 3 operations). Nó không byte-identical b186844 toàn file vì các QA changes sau đó; không khẳng định sai sự đồng nhất toàn CI file.
- verify-release chỉ workflow_dispatch/verify source+manifest+images, read permissions, không deploy job/credentials. New inherited infra-validation workflow là file riêng, không biến verify-release thành rollout.

## 6. Review đúng SHA / scope, không blanket approval

| Review | Trạng thái / exact SHA | Kết luận dùng được |
|---|---|---|
| [TV1 6011704131](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6011704131) | APPROVED `c1ffb9ee0f661d095cba92d20855295e7a3d3f26` | Contracts/Governance/TC10 và contract-CI only; không backend/deployment-helper approval |
| [TV1 6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460) | APPROVED `b186844d1ff19ef26dfd83a060e7584bb6e0c419` | Signing/submission/receipt/journal/role-audit security; fixes findings 6018122562/6024264352, không cấp broadcast/release/BE08 approval |
| [TV2 6037802801](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037802801) | CHANGES_REQUESTED `b186844d1ff19ef26dfd83a060e7584bb6e0c419` | Delivery/CI 4+3/Compose/verify-only được chấp nhận trong body; BE08 late-fifth finding riêng, đã có review sau |
| [TV2 6053195381](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6053195381) | APPROVED `0a5cc5cfda29a92df4ab4498e1cd72cd57023088` | BE08 sealed-final-trace, topic index, SQL batch/atomic rollback only |
| [TV2 6053196499](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#pullrequestreview-6053196499) | APPROVED `cba8b6c9eda65959d82250441b8eed131a1a5044` | Cùng BE08 scope; supersedes late-fifth request 6037801610 ở 42518f7 |
| [TV3 6041875677](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6041875677) | CHANGES_REQUESTED `59426fb50607583b1bec77ec9d998a8fd0410cf5` | Revision oracle finding; được fix16e4a7d, rồi reviewer xác nhận ở review6053667048 |
| [TV3 6053667048](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6053667048) | CHANGES_REQUESTED `0a5cc5cfda29a92df4ab4498e1cd72cd57023088` | New distinct final-reads pinning finding, không reopen BE08 |
| [TV3 6055560601](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6055560601) | COMMENTED `b92bef5409d6478de97efbc8209241620967d18a` | Pinning P2 resolved; **không APPROVED whole PR**; TTL observation nonblocking |

Bảng blob cho phép giữ accepted unchanged scope, không gửi reviewer lại full campaign hoặc tự dismiss/resolve threads. **Registry union mới chưa có reviewer approval hay runtime execution trong audit này**; cần narrow review chính conflict resolution + Dev admin integration, không gọi cũ là approve toàn tree mới. QA07 pinning/23 controls thuộc code `bbe6fa47cc9d9f9c49a60330bc48d910724fb517`, không gán lại thành run mới trên docs head.

## 7. Provenance / PR52 và thứ tự không nhập lịch sử ngoài scope

`git merge-base --is-ancestor <excluded-source> <pinned-ref>` đều exit **1** (not ancestor) cho cả ba refs PR60/PR61/Dev đối với:

- `94d5367c8d60326b9b9f7de09265be531743f3b8` và `faf10c7da67f53f1d918b5150c862e21af1b0d44` (PR21 source/history markers).
- `148f8e9b59e3413df9523fabfda9c041d6b12d5e`, `b67611e3a7c2f0f1a827b2fbffcb921b27d011c3`, `c94755334b39162d679965f7f078c97e03ddd9d5` (original excluded source markers trong PR60 evidence).
- `ac40c355` original IPC-free source không là ancestor (exit1), trong khi scoped port `f2b28294a45cd751b91f853f8c856ebb0de9528b` là ancestor cả ba (exit0). Đây là ví dụ đã dùng source-only port, không nhập cả mixed history.

Giới hạn: đây là **known marker + parent-chain evidence**, không assertion rằng mọi commit từng có tên branch personal trên remote đều không là ancestor Dev (branch labels không phân loại nội dung lịch sử). Không đọc nội dung cá nhân; không fetch/merge bất kỳ personal/individual ref mới nào. Resolution tạo blob/tree/index tạm, không commit nào hoặc ancestry mới. Trong thứ tự61→60 đề xuất, chỉ giữ shared parents đã pin; không kéo #21/#55 để giải conflict.

`scope-52.md` là Dev→main comparison/draft history; body assessment ở `43acfbdec3470f9a94c70d5a2700722cba6d3852` và base main `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` đã cũ. Bot comment26/11 nêu Dev `d63842ae50dc9a29a42529ce7cd08ca7c569759e`, khớp fetch mới; không dùng historical 9/9 CI hoặc merge-tree clean ở Dev46287df làm proof current promotion. Giữ eventual merge-history policy, main requirements và các acceptance gates. Không promote Dev→main, không merge PR52 hoặc đổi draft/state. CI hiện hành60/61/52 do parent thu riêng; audit này không claim đã xem current run logs.

## 8. Kiểm tra cuối đã thực chạy và giới hạn

Chỉ một lượt static/check patch sau khi patch đã hoàn chỉnh; dùng index file tạm `/tmp/tv4-patch-check-index-*` qua `GIT_INDEX_FILE`, cleanup trong finally. Không đổi index/worktree bàn giao. Kết quả:

| Command/check | Exit | Verdict | Output |
|---|---:|---|---|
| `read-tree exact head60` | 0 | PASS | `không output` |
| `git apply --cached --check resolution.patch` | 0 | PASS | `không output` |
| `git apply --cached resolution.patch` | 0 | PASS | `không output` |
| `git write-tree` | 0 | PASS | `b54a97dd79dd2e5f31ab04fe724637f37ab5b06e` |
| `applied tree equals prepared resolved tree` | 0 | PASS | `b54a97dd79dd2e5f31ab04fe724637f37ab5b06e` |
| `git diff --check head60 resolved-tree` | 0 | PASS | `không output` |
| `resolved registry has no conflict markers` | 0 | PASS | `không output` |

Quy trình tính tree trước đó: `git hash-object -w --stdin` registry đã resolve (exit0), throwaway-index `git read-tree 15934ea7e5a1409e7ff5848a648bf461cb30d0b3` (exit0), `git update-index --cacheinfo 100644,<registry-blob>,indexer/abi-registry.ts` (exit0), `git write-tree` (exit0); xóa index tạm. Đây chỉ tạo Git blob/tree, không actual branch merge hoặc commit. `git diff --binary --full-index <head60> <resolved-tree>` exit0 tạo artifact.

**SKIP theo scope:** build/lint/formatter/unit/native benchmark/DB/browser/receiver/governance/Sepolia; không smoke-run source mới. Không xác nhận runtime union/admin/SQL bằng test mới; static PASS không thay CI hoặc reviewer acceptance. Lệnh trợ giúp `git merge-tree -h` exit129 là usage-only, không phải merge failure. Không OAuth/token/key output, không GitHub post/review/dismiss/merge, không deploy/broadcast/push/commit.

Các gate #19 documentary, #40 new receiver lifecycle, #42 receiver readiness/API-only, #20 owner SHA/public map/signer custody/gas authorization/testnet receipts, #44 group demo vẫn riêng; #41 local worker/SQL pipeline acceptance đã có, không đòi chạy lại. Không gọi PR60/61/52 hay overall release READY/DONE chỉ vì patch áp dụng được.
