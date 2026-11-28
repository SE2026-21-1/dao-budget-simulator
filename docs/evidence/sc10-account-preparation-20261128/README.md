# SC10 account preparation — TV1 evidence, 2026-11-28

**ACCOUNT PREPARATION TOOLKIT READY — TV4 LOCAL EXECUTION PENDING.**
Không phải custody/funding/deployment acceptance hoặc broadcast authorization.

## Source và scope

- Base Dev: `f15f19252957d9ca37b424facdbb13afc8da0b05`.
- Approved preparation source giữ nguyên: `e17ef61a8a51518005c38b0808cdc06fe7a68bbf`.
- New toolkit source được kiểm theo hashes của working tree trong
  [verification.json](verification.json). Commit toolkit công khai ở PR/Issue20
  là immutable binding của các bytes đã kiểm, không tự trở thành deployment pin.
- 10 reviewed deployment modules byte-equal pin trước import parser/loader;
  package-lock cũng byte-equal pin. Ethers6.17.0, Node24.15.0; reuse installed
  dependencies, không cài thêm hoặc thêm production dependency.
- Không thay Solidity/shared ABI/governance config, deployment sequencing/signing/
  journal/receipt/roles/guards, indexer, frontend, source PR65/66 hoặc sealed evidence.

## Reuse và phần bổ sung

Đã đọc exact pinned deploy/check_roles/governance_sepolia, transitive local/
operations/receipt modules, account parser, keystoreSigners/password FD contract,
existing smoke tests, package/lock và runbook. Tìm repository không có standalone
map export/offline unlock validator. TV4 đã có hướng dẫn `cast wallet new` tại
[261ffa9c](https://github.com/SE2026-21-1/dao-budget-simulator/blob/261ffa9c33098e92edda3215ac10a3f04c42b895/docs/sepolia-deployment.md).
Không tạo generator/encryption mới; dùng standard cast do TV4 tự chạy.

Ba scripts mới reserve private layout, xuất đúng public map + **six-entry** bundle,
validate bằng existing `validateRoleMap`/`keystoreSigners`; discard signing closure.
Demo caller/recipient/outsider giữ tách, decrypt/address-check bằng ethers.
[Guide](../../sepolia-account-preparation.md) có commands, hidden prompts, anonymous
password pipes, actual custody/funder/authorization gates và Windows/WSL limits.
Template cố ý null, bị original parser từ chối, không giả actual Sepolia addresses.

Schema: đúng `format`, string `chainId`, `approvedSourceCommit`, `signerOwner`,
`accounts`; roles exact A/B/C/D/funding/deployer/caller/recipient/outsider.
Bootstrap config đúng deployer/funding/A/B/C/D `{path,passwordFd:3}`, caller không
nằm trong bundle. Native ETH funder không đồng nghĩa role funding BUD.

## Actual verification

| Command/check | Exit | Result |
|---|---:|---|
| node --check, 3 CLI/module + test + guard | 0 | 5 syntax checks PASS |
| node --test --test-reporter=tap tests/sepolia-account-preparation.test.mjs | 0 | **22 PASS / 0 FAIL / 0 SKIP** |
| Existing smoke test filtered to public-role-map, with no-network/no-signing preload | 0 | **1 PASS / 0 FAIL / 0 SKIP**; không execute signing tests |
| git-show comparison + original parser rejects null template | 0 | **10/10 modules match**, template intentionally not executable |
| bash -n guide code blocks | 0 | 4 blocks PASS |
| JSON parse/template fields + relative guide links | 0 | PASS |
| actionlint -shellcheck= .github/workflows/sepolia-account-preparation.yml | 0 | Workflow syntax PASS; external shellcheck NOT RUN |
| git diff --check/protected-subtree comparison | 0 | Source scope PASS; final staged check recorded at commit |

**Final focused suites: 23 PASS / 0 FAIL / 0 SKIP.**
These are disposable local/offline checks. No live RPC/balance/native funding or
Sepolia deployment PASS. New focused GitHub workflow executes only this account
suite; existing repository workflows may run automatically on PR creation.

Focused coverage: nine distinct/nonzero accounts; exact map and six bootstrap
roles; demo separation; standard V3 encrypted JSON/default ethers scrypt;
successful existing-loader unlock/address checks; wrong password; forged public
metadata vs encrypted key; missing/extra/duplicate/zero/malformed roles/addresses;
wrong chain type/value/source/owner/private fields; missing/extra keystores; no
overwrite; directory/file ownership/mode; component/final symlinks, hardlinks,
FIFO, Git/Windows paths; partial/missing/truncated output; unwritable parent;
KDF/cipher structure and password FD boundaries. Guards terminate on HTTP/HTTPS/
net/TLS/DNS/fetch/signTransaction/signMessage/signTypedData calls. Output assertions
check passwords, prefixed/unprefixed disposable keys and mnemonic phrases never
appear in stdout/stderr. No generated encrypted test keystore is committed.

No custom cryptography, KDF tuning/generation switch or password default exists
in production utilities. KDF checks are supported-format/resource bounds, not
password entropy/KDF-strength certification. Operator must preserve standard
tool defaults and choose strong passwords privately. Validation decrypts keys in
JS memory; no claim of guaranteed zeroization or hardware/distributed custody.

## Failures retained; what changed

[execution-logs.json](execution-logs.json) preserves all returned test logs with
original-byte SHA256/length and collection UTC time, including initial failures.

1. Two sandbox attempts exited at test-module level (0 PASS/1 FAIL each), without
   individual cases or useful cause; not declared successful. Escalated focused
   run was used for inherited FDs/subprocesses, with network/signing denied.
2. First full run **19 PASS/2 FAIL**: positive unlock caught Node extra stdio being
   a Unix socket not reopenable through `/proc/self/fd`; one mutation accessed
   lowercase crypto while ethers output uses Crypto. Harness now uses actual
   Bash anonymous pipes matching the guide; mutation supports both variants.
3. Next run **20 PASS/1 FAIL**: forged metadata was rejected *inside ethers*
   before the loader's own address assertion. Classifier now recognizes that
   exact address-mismatch error, preserves required specific negative assertion
   and emits only a fixed safe code. No reviewed loader change or assertion weakening.
4. Final **22/22 PASS** after fixes plus truncated/partial-export coverage.

No prior failure was deleted or transformed into a PASS count. The finished
suite is small and was rerun only after substantive fixes/coverage changes.

## Standard tool / platform limitations

`cast wallet new --help`1.8.5 exit0 confirms existing directory/account-name syntax,
encrypted JSON output and hidden-password default. Disposable interactive probes
in agent terminal failed due unusable controlling TTY (exit1; one bounded owned
process stopped with SIGTERM); no success claim or actual TV4 wallet creation.
**Cast interactive generation end-to-end NOT VERIFIED** here. TV4 must execute
the standard commands in their private trusted terminal; ethers V3 loader tests
are not a replacement claim for that manual step. Test encryption uses standard
ethers6.17.0 default scrypt N131072/r8/p1; no fast KDF test override.

Linux/WSL Linux filesystem only; native Windows/NTFS ACL validation NOT RUN and
unsupported by these CLIs. Owner-only0700/0600/no-symlink/hardlink/static checks
do not prove trusted host/ACL/security against concurrent malicious same-user
processes. Do not modify/move files or run another process during preparation.
Interrupted on-disk partial states are tested; this is not a full power-loss or
every SIGINT timing campaign. No auto deletion/recovery of user key material.

Shared-bootstrap-password/single-custodian workflow is explicit opt-in, not an
assignment of keys to owner/operator by assumption. Distributed custody/hardware
and actual caller demo signing require separate TV4 review. Online installation
or git fetch is distinct from the fully offline utility operations.

## GitHub handoff and remaining gates

Issue20 remains OPEN/BLOCKED/live testnet SKIP. Owner/operator dung0611 and source
pin already confirmed; no repeat appoint-owner request. Public addresses, actual
six-signer custody/exclusive-use, caller path, native funder/balances/nonces/gas,
final fee/budget and separate user+owner signing/funding/broadcast authorization
remain outstanding. Planning0.12ETH/1gwei is not funded/final authorization.
Issue44 remains not release-ready; no unrelated receiver/UI/infra work performed.

PR65 review evidence task completed separately: normal-pushed remote
`56426ee91f5993e6aacfb159f67de981c138d25a`,22files/21checksums verified, initial
PostgreSQL timeout retained; [immutable evidence](https://github.com/SE2026-21-1/dao-budget-simulator/blob/56426ee91f5993e6aacfb159f67de981c138d25a/docs/evidence/tv1-pr65-governance-review-20261128/README.md)
and [one handoff comment](https://github.com/SE2026-21-1/dao-budget-simulator/pull/65#issuecomment-7241651232).
No duplicate review/PR or evidence merge. PR66 remains513dc821, SC0683301112,
What-ifd4a0fb56 preserved clean; separate toolkit worktree/branch only.
