# R2 PR60 / PR61 / current Dev candidate — 27 November 2026

## Sources and authority

This is an actual integration candidate, not a merge into Dev/main, release, deployment, approval, or a rerun of historical acceptance. Original checkout and delivery worktree are untouched. Candidate worktree: `/tmp/dao-tv4-integration-r2`; branch: `tv4/integration-20261127-r2`.

Read the earlier [static integration report](2026-11-27-pr60-pr61-integration.md) and its [resolution patch](2026-11-27-pr60-dev-resolution.patch). The old full-snapshot patch was **not applied**: its PR60 input `d4d405f2ca64e1786b44c7d81354cbe2de18040f` is superseded.

Fresh fetch, exit 0:

```sh
git fetch origin \
  refs/pull/60/head:refs/tv4-r2-integrate/pr60 \
  refs/pull/61/head:refs/tv4-r2-integrate/pr61 \
  refs/heads/Dev:refs/tv4-r2-integrate/dev
```

| Source | Pinned SHA |
|---|---|
| PR60 | `24f66b6cae0f13651c622625adcc687e6d11fffd` |
| PR61 | `cba8b6c9eda65959d82250441b8eed131a1a5044` |
| Fetched current Dev | `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| PR60 / Dev merge base | `896f93ea282d76fa72339a97ea12339240c16da4` |
| PR60 / PR61 merge base | `6766e5ee2d8c466542687cbeb09677c4d11e5463` |

The initial restart context and fresh PR60 API `.base.sha` reported `896f93e`; fresh Git branch fetch reports `d63842`. PR61 API base still reports `6766e5e`. Treat these as stale/cached PR metadata, not the authoritative current branch tip. This candidate uses **actual fetched Dev `d63842`**, which already contains the requested administrative ABI. No substitute historical source, cherry-pick, excluded PR21/55 ancestry or personal/individual ref is needed. The exact shared Dev five-commit chain documented previously is retained intact, including inherited infrastructure declarations, but no infrastructure action is authorized or performed.

## Recomputed merge and history

All operations are on the new candidate only. Original PR61 commits are retained, not merely their already-ported source blobs.

| Operation | Exit | Tree / result |
|---|---:|---|
| `git merge-tree --write-tree <PR60> <PR61>` | 0 | `8ad2e13fb459bdada23bad2801d8d6ca633931f8`, equal to fresh PR60 tree |
| `git merge-tree --write-tree <PR60> <Dev>` | 1, expected conflict | `88b350f9ecbce4626ba94bacb8d080889519cd2d`; only `indexer/abi-registry.ts` conflicted |
| PR61 history merge | 0 | `a84fb234f9bf76e70aadac6894ec56ff0bde3c20`; parents PR60 then PR61 |
| `git merge-tree --write-tree a84fb234... <Dev>` | 1, expected conflict | `ad5bfcadb844abee717210bc5704261bb1a6d367`; same registry-only conflict |
| Resolved current Dev history merge | 0 | `9417d4cecb774b301e29e2ed7fe6cb3c7e28f308`; parents `a84fb234f9bf76e70aadac6894ec56ff0bde3c20`, `d63842ae50dc9a29a42529ce7cd08ca7c569759e` |
| Resolved runtime tree | 0 | `e453211f21facd50851d8130971a3da625313e03` |

Merge commits use `git commit-tree <tree> -p <first> -p <second>` with explicit source parents, following `git merge --no-ff --no-commit`, `git merge --quit`, and an expected-old-SHA `git update-ref` on the candidate branch. For the conflicted merge, only the resolved registry blob was installed with `git update-index --cacheinfo` before `git write-tree`. No `git add`, squash, rebase, force push, or merge into a protected branch. The merge-operation exception is necessary because the selective commit helper refuses an active merge; the evidence commit uses the selective eval `commit` namespace.

## Conflict decision and preserved behavior

`lsp --help`, `lsp status`, and `lsp references --file indexer/abi-registry.ts --line 39 --symbol ABI_REGISTRY` were attempted before source edits. No configured server; TypeScript language server is absent, and biome/eslint/deno/tailwind configurations are unavailable. No exported signature is changed.

The registry keeps `EventFragment` and `ANCILLARY_ABI`. Exactly one union `registeredAbi = [...abi, ...ANCILLARY_ABI[role]]` is built per registration. The same union feeds the `Interface`, frozen published ABI, and frozen precomputed topic index. Resolved registry blob: `1cfa999aedae4e445b8259b1bd0bd5cbcb053c66`. No per-log union/interface/index allocation, decoded-payload cache, or decoder validation shortcut is introduced.

The inherited runtime tests already cover the actual conflict edge: all 13 compiler administrative layouts must decode through the real registry/topic index, reject malformed encoding, stay outside business projection; all 16 historical bootstrap administrative logs decode without raw-byte mutation. Therefore no redundant new synthetic runtime test was added. Existing case-insensitive topic, independent payload, malformed/canonical/unknown checks remain.

Automatic merges preserve set-based publication, FK order, uint256/string/Unicode/bytes/array/source-event values, atomic rollback with projection checkpoint, multi-row replay and trigger rejection. Late-fifth/interleaved/boundary/final-shutdown guards and owned-Anvil clock freeze/receipt-header assertions are unchanged. Signing identity derived from raw transaction, durable SIGNED journal before send, strict response binding, canonical initial/final receipts, K2, no automatic resend, and both zero-descendant funding regressions remain. Three migration/manifest tests and four release tests remain wired together in CI. `verify-release.yml` is unchanged, manual and verify-only.

Inherited Dev delta includes `.github/workflows/anvil-demo-infra.yml`, `infra/**`, `deploy/anvil-demo/**` and infrastructure runbooks; these are source history, not revived #56 rollout permission. No timer, service, tunnel, Compose stack, Terraform, remote server or Sepolia action was performed.

## Fresh GitHub review histories and unchanged scopes

Fetched public API PR bodies, reviews, inline comments **and issue comments on both PRs**, `per_page=100`, pagination continued whenever a page had 100 entries. All endpoints fit one page: PR60 15 reviews / 10 inline / 8 issue comments; PR61 4 reviews / 3 inline / 0 issue comments. Raw responses are under `/tmp/tv4-r2/integration-api/`. Read the current bodies, not only review state labels; inline `commit_id` can show the current head for old discussions and does not supersede the review's original `commit_id`.

| Review | Actual accepted scope and remaining boundary |
|---|---|
| [TV1 6011704131](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6011704131), APPROVED `c1ffb9e` | Contracts/TC10/contract CI only; no new runtime approval inferred |
| [TV1 6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460), APPROVED `b186844` | Signing/submission/receipt/journal/roles; sources remain unchanged |
| [TV2 6053195381](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6053195381), APPROVED `0a5cc5c` | BE08 final trace/topic index/SQL batch+rollback; not this new admin integration |
| [TV2 6053196499](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#pullrequestreview-6053196499), APPROVED `cba8b6c` | Same narrow BE08 scope; supersedes late-fifth request on `42518f7` |
| [TV3 6055560601](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6055560601), COMMENTED `b92bef5` | QA07 pinning P2 resolved, packet checked by reviewer; not whole-PR approval. TTL case is a nonblocking observation |

No reviewer request, thread, approval, dismissal, GitHub post, Project field, PR state or CI workflow definition was changed. Existing successful historical CI remains bound to its own SHA/merge-ref; it is **not candidate CI**. The candidate still requires narrow reviewer acceptance of this registry union/current-Dev admin integration and inherited Dev review delta, not reopening already accepted unchanged security/BE08 campaigns. Receiver #40/#42, documentary #19, owner-authorized #20 and group #44 remain separately scoped. No full historical BE06/BE09/native benchmark or browser campaign is claimed.

## Isolated verification prerequisites

Node24.15.0 is explicitly selected from `/home/ptdung/.nvm/versions/node/v24.15.0/bin`. Candidate uses original installed `node_modules` and existing compiler `out` through local untracked symlinks; recursive Git submodules were initialized at their pinned commits. Runtime artifact loader verifies compiler settings, ABI and source hashes; no contract rebuild or entire contract suite is required.

Docker discovery fails with socket permission denied; `sudo -n docker` requires a password. No daemon/group/permission change was made. Previous portable PostgreSQL path is absent. Installed outside all repositories with `npm install --prefix /tmp/tv4-r2-postgres.VVxEihpT --ignore-scripts --no-audit --no-fund --save-exact @embedded-postgres/linux-x64@18.4.0-beta.17` (exit 0); inspected and ran only its packaged symlink hydration script. PostgreSQL reports **18.4** with packaged `native/lib` in `LD_LIBRARY_PATH`. Initial pre-hydration version probes failed for missing ICU soname; hydration fixes packaged symlinks without changing system libraries. Package does not ship `psql`; database setup uses the installed project `pg` driver.

Package [registry tarball](https://registry.npmjs.org/@embedded-postgres/linux-x64/-/linux-x64-18.4.0-beta.17.tgz), npm-lock verified integrity `sha512-jVw/MdDtIX/vICH/DKIe6/mHpiCggdx6QVyza4vt/NbcZFsL0KhwglF6F1Koqx3gRBZ9XtN+vi63EsqSyqOSxA==`; registry SHA1 `93ec75a1247b30f1a0a43c14328356cadbc7569d`. Binary SHA256: postgres `de0a4a7646c51f032e0088ae6fe9d0833fa280b78d4455681574a32937b32838`, initdb `515186eed81a1f2741bdcbfeb080af093a59a27fb2896237b04dd6c48bae349d`, pg_ctl `6beab6014ea28dcc78b8c6a43ec9e3e20536e13a175d75151107410ac866c481`.

## Source-boundary checks

`git merge-base --is-ancestor <source> 9417d4ce...` returned exit 0 for each pinned PR60, PR61 and current Dev. It returned exit 1 (not ancestor, expected) for all six known excluded markers: `94d5367c8d60326b9b9f7de09265be531743f3b8`, `faf10c7da67f53f1d918b5150c862e21af1b0d44`, `148f8e9b59e3413df9523fabfda9c041d6b12d5e`, `b67611e3a7c2f0f1a827b2fbffcb921b27d011c3`, `c94755334b39162d679965f7f078c97e03ddd9d5`, `ac40c355`. This proves exclusion of those known source/history markers, not a universal classification of every historical branch name.

Git object identities match fresh PR60 exactly for decoder `88a8fce9`, projector `657263c5`, outage helper `6669cdb4`, worker probe `025b6a0d`, signing/receipt helper `68f88061`, deploy helper `811ddf55`, journal CLI `877f09e1`, Sepolia/funding tests `0fc1f38b`, operations tests `25bd0cdd`, release tests `95c4c7ad`, CI `20ba7c86`, and verify-only workflow `4582955e`. The registry and automatically merged admin decoder/storage tests are the intentionally changed integration surface.

## Final narrow execution

All runtime edits were complete before execution; no lint/formatter, full suite, native benchmark, historical BE06/BE09, or old reported-failure reproduction was run. Raw command logs and live JSON are retained locally under `/tmp/tv4-r2/integration-checks/`, not represented as public archived evidence.

The disposable PostgreSQL cluster was initialized with `initdb -D <new-dir>/data -A trust -U postgres --encoding=UTF8 --locale=C` (exit 0), started by `pg_ctl` on numeric loopback ephemeral port 35139 (exit 0), and populated via `pg` with new isolated `be02_test`, `be04_test`, `be04_live` databases and dedicated role names (exit 0). No caller database or external stack was used.

| Exact check | Exit | Observed result |
|---|---:|---|
| `node --import tsx --test tests/indexer/storage.test.ts` with `BE02_TEST_ISOLATED=1` and the new BE02 DB | 0 | 21 tests / 21 pass / 0 fail / 0 skip, 12.907 s |
| `node --import tsx --test tests/indexer/projection-storage.test.ts` with `BE04_TEST_ISOLATED=1` and the new BE04 DB | 0 | 11 tests / 11 pass / 0 fail / 0 skip, 19.329 s |
| `node --import tsx scripts/check_be04_live.mjs --output /tmp/tv4-r2/integration-checks/live-be04.json` with `BE04_LIVE_ISOLATED=1` and new live DB | 0 | PASS, 10 phases / 8 checks / 24 receipts; default BE04 only, no API/BE06/BE07 flags |
| Owned-cluster `pg_ctl -D <new-dir>/data -m immediate -w stop` | 0 | Cluster stopped and owned data directory removed; live runner also awaited owned Anvil exit |

The live report is bound to runtime commit `9417d4cecb774b301e29e2ed7fe6cb3c7e28f308`, Node24.15.0 / PostgreSQL18.4 / Anvil1.8.5. It exercises the actual exact-time clock/receipt checks, six proposals, nine votes, three operations, four transfers and two disbursements by H67/hash `0x9cc76026f08a53a420c10e21ab8f3ad471377a835e44e0319a7f6706f8da7603`. The final raw decode is complete, unknown topics 0, decode issues 0, and 16 decoded administrative events are deliberately ignored by business projection. Treasury balance is exactly 1,000 BUD after the underfunded revert/top-up/retry. Historical evidence that had 16 unknown topics is not relabeled.

Live JSON SHA256 `86683bb235f61fe8f825e02320631299f3371a78293e8dd29348bcf1cb80e6bb`; raw-storage log `8091722ff148e92c9a4c77badd92f4c1f4e77d3b85a060fff422e464172ea03c`; projection-storage log `cbb5a0f16c627d49bc6493939e0af1ff1311ccc41fbc1926e7e38ff2cc38825f`.

Additional completed checks, each executed once after the final runtime edit:

```sh
npm run typecheck
npm run build
node --import tsx --test \
  tests/indexer/decoder.test.ts tests/indexer/projection.test.ts \
  tests/indexer/be04-live-receipt.test.mjs \
  tests/indexer/be08-measurement.test.mjs \
  tests/indexer/be08-postgres-identity.test.mjs \
  tests/indexer/be08-rpc-outage.test.mjs \
  tests/smoke/qa07-snapshot.test.mjs \
  scripts/cd/release.test.mjs deploy/operations.test.mjs
node --test tests/smoke/bootstrap.test.mjs \
  tests/smoke/dependency-provenance.test.mjs tests/smoke/sepolia.test.mjs
```

Typecheck and build both exit 0. The combined decoder/model/admin/receipt/BE08/QA07/release/operations command exits 0: **108 pass / 0 fail / 0 skip**, 13.398 s, including all four final-trace interleaving/late-fifth variants, the compiler-admin and 16-raw-log regressions, all 23 QA07 controls, and exactly four release plus three migration/manifest tests. The signing/funding/bootstrap/provenance caller command exits 0: **44 pass / 0 fail / 0 skip**, 92.979 s. Both real isolated-Anvil unconfirmed-funding regressions pass, together with all six signed-response/journal cases. This narrow security regression set is not a Sepolia broadcast or historical native acceptance campaign.

Total automated tests: **184 pass / 0 fail / 0 skip** (108 + 44 + 21 + 11), plus typecheck/build and the separate 10-phase live BE04 run. No assertion, threshold, timeout or load setting was weakened. Documentation-only evidence completion and history finalization do not change the checked runtime bytes.

Final history packaging retains the checked runtime source tree above, then uses the selective eval commit helper for the authored registry resolution, known inherited Dev integration delta and this report from the unpublished candidate's PR61-history merge base. Only this candidate ref is moved; worktree contents are retained. The helper's exact tree is then recorded with explicit current-Dev merge ancestry. Exact final candidate/helper SHAs and parents are reported in the handoff rather than embedding a self-referential SHA in this document.

Packaging detail: a merge-tree between the selectively committed integration snapshot and Dev still reports the same single registry conflict (exit 1): Git has not yet recorded Dev ancestry, and cannot infer that the snapshot's union is the intended resolution. The first packaging probe produced marker tree `58ab719907b5f1613c1f692212b0ea8ad732928f`, with registry stages base `b3027e70`, resolved snapshot `1cfa999a`, Dev `331f9982`. That marker tree is **not used**. Final explicit-parent `commit-tree` uses the selective helper's already-resolved, checked tree. Its first parent is the helper snapshot (whose parent is `a84fb234...`); its second is current Dev `d63842...`, preserving both original source histories and the selective authored commit. The temporary local `out` artifact symlink was removed and excluded by helper amendment before final history sealing; it is not delivered.
