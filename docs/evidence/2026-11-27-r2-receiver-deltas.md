# TV4 R2 — #19 / #40 / PR62 receiver deltas, 27 November 2026

## Scope and disposition

Read-only review; no GitHub comment/review/approval, service action, deployment, transaction, build, test, formatter, commit or push was performed by this reviewer. Drafts below are **not posted**. Collection instructions are **not executed receiver results**.

| Scope | Fresh disposition | Kept separate |
| --- | --- | --- |
| #19 | Latest handoff remains `7198378527`; no newer artifact discovered. B-active/error/draft visual already accepted scoped; zero provider-send remains inference for this new run. Full acceptance pending. | Historical H26 functional/provenance acceptance is retained; its missing image/version are not repaired retrospectively. |
| #40 | **ACCESS / OWNERSHIP READINESS HOLD; lifecycle SKIP, not a runner test failure.** New Windows and sandbox observations do not establish an accessible isolated receiver. | BE09 offline accepted; historical lifecycle partial; no Linux substitute or BE09/governance rerun. |
| PR62 | Head, review state and seven CI conclusions unchanged; no new code delta requiring the historical 144 checks to be repeated. **Live snapshot acceptance SKIP.** | Synthetic tests, CI event identity, actual checkout identity and trusted live deployment evidence are different things. |

Current Dev is **`d63842ae50dc9a29a42529ce7cd08ca7c569759e`** (fresh GitHub ref and Main's corrected fetch/`ls-remote` observation agree). The #42 restart receiver's **`896f93ea282d76fa72339a97ea12339240c16da4`** is a historical approved runtime source, **not current Dev**. Do not promote an old PR `base.sha` or runtime approval into a current branch identity.

## Inputs and completeness

Read fully: [existing #19 narrative](2026-11-27-issue19-review.md), [its complete JSON inventory](2026-11-27-issue19-review.json), [receiver readiness/checklists](2026-11-27-receiver-readiness.md), [PR62 review](2026-11-27-pr62-tv4-review.md), and the supplied fresh issue bodies and complete comment histories in `/tmp/tv4-r2/github`:

- #19: **10/10** comments, newest `7198378527`, last edited `2026-11-26T17:07:34Z`.
- #40: **28/28** comments, newest `7222076540`, created `2026-11-27T15:27:15Z`.
- PR62 body, zero reviews and zero inline comments; separately fetched `/issues/62/comments`, which contains **one Netlify bot comment**, not a human review. `/pulls/62/comments` alone does not provide issue comments.
- Fresh lists requested with `per_page=100&page=1`: PR62 issue comments **1**, reviews **0**, inline comments **0**, head-filtered workflow runs **7/7**, simulator jobs **2/2 per run**. Supplied issue comment totals are below 100 and complete; no 100-entry boundary or unconsumed page remains in these scopes.

API response `Date` headers for PR62 current state/runs and #19 evidence ref were `2026-11-27 15:50:42 GMT` and `15:51:15 GMT`, respectively. This is the observation window, not the producer run time. Temporary raw API files are audit working files, not public evidence attachments; immutable public sources are linked below.

## #19 — new versus already accepted

### Fresh artifact discovery and actual bytes

[TV3 handoff7198378527](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7198378527) is still the final comment in the fresh complete history. Its evidence branch still resolves to **`887c5ecafd79feaf64956b8e05e9d16576404d84`**. The [fixed directory](https://github.com/SE2026-21-1/dao-budget-simulator/tree/887c5ecafd79feaf64956b8e05e9d16576404d84/docs/evidence/tv3-metamask-negative-20261126-4cba99a0) still contains exactly **eight files**. There is **no newly discovered boundary trace, extension About/manifest capture or raw 503/log/context artifact** beyond the previous review.

R2 downloaded all eight actual files again from the full-SHA raw URL, not the moving branch URL: **8 HTTP200 / 8 curl exits0**. `sha256sum --check --strict SHA256SUMS.txt` returned **7 OK / 0 FAILED, exit0**. All eight sizes and hashes equal the previous inventory:

| File | Bytes | SHA-256 of delivered bytes |
| --- | ---: | --- |
| `SHA256SUMS.txt` | 656 | `9a6f1d46994c0eb9ad58ba986d5491d4cfad5a053c9e507e372594da77e21478` |
| `browser-eth-accounts-console.png` | 30,742 | `ba5d621a46002bdf84abb2c058cf46a218438a04198fe77b23e9c1e73632c85d` |
| `deployment-manifest.json` | 109,009 | `92f4149f540e3a23178bddb8ed8c5bc68cee0454d031b60257ce89d41aa0de83` |
| `rpc-state-after-repeat.json` | 573 | `b496fd0207fe0d24ebba75e29d1d02a21cfbec878ef9c7130f98b66bcf47e104` |
| `rpc-state-after-submit.json` | 623 | `c627728cef1be4914b64761dc1dc472e3a6c00160600955d48fab6f6c3b38556` |
| `rpc-state-before-repeat.json` | 466 | `274ac026c64c94df7d07b66bf02054051fbdaf9d9a4eb5a715918be920d61f76` |
| `run-summary.md` | 3,044 | `060b69799fd00a121fcd7c53b71a2035b0f7841bc60cc80a75107bf03b4d5f47` |
| `submit-blocked-account-b.png` | 179,732 | `7e44d2c7768e47e40e5f2bb12ea0e8ecc77a06949c3e52c276ce67abc03a5529` |

This is a fresh byte-integrity observation, not a new runtime observation or a repeat provenance demand. The prior review's CRLF-normalized 12 first-party / 51 dependency matches remain historical findings, **not raw LF Git-blob equality**; R2 did not repeat that source audit.

### Acceptance boundary retained

- New run `TV3-MM-negative-20261126-4cba99a0`, source **`4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`**, chain31337, producer deployment label `tv3-local-0xa6c8b5`, H19/hash `0x81a732f2b519c449c2d3b6babe165db663bb28c52a1a1f1b5d66d496e90efddf`. This is neither current Dev nor H26.
- **Already accepted scoped:** real B-active/error/draft visual, B/outsider `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f`, zero displayed voting power, B first in `eth_accounts`, retained visible requestId `0x91a42f170af13eb1806b31689e4e9f9dce97570c047b266232a6e3e2605480f5`. B is the manifest **outsider**, not `manifest.accounts.B`. Submit is enabled and errors after the attempt; do not rename it a disabled button.
- New-run MetaMask **13.58.0 is producer-declared**, not independently read from extension About/manifest. It is not H26's version. Historical H26 exact version stays **UNKNOWN**, historical B-active image stays **MISSING**; accepted H26 functional trace and [supplement provenance7184879061](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7184879061) are not re-requested.
- Guard ordering in source, no observed popup, unchanged B nonce/head and empty pool **support no broadcast only at sampled moments**. They cannot exclude an attempted/rejected/dropped send between snapshots. There is no pre-first-submit snapshot or A nonce in this new bundle. Do not turn these observations into `eth_sendTransaction = 0` at the provider boundary.
- `GET /api/proposals` **503 remains visible and unexplained**. A different-time health200/degraded, H17 publication or 16 unknown ancillary topics does not identify its cause. No raw response body/headers and correlated API/worker/PostgreSQL logs were delivered. Preserve UNKNOWN; do not infer schema, PG18.6, migration or unknown-topic causality.

### Minimal remaining collection — TV3 operator, TV2 backend, TV4 reviewer

Only if the stronger new-run zero-send gate is required: capture **one bounded draft/account-switch/blocked-submit interval**, not propose/vote/queue/execute. Reuse the [existing pass-through observer convention](../qa07-e2e.md#account-switch-phần-evidence-tối-thiểu-còn-thiếu-của-19); this executable extension records entry into all available request APIs without fabricating wallet results or modifying UI/app state.

**Prerequisites:** owned demo origin and disposable extension profile; independently establish that the app's selected provider is this real MetaMask instance. Pause startup before the app first acquires/binds that provider, then install the observer below after injection and before resuming. A late DevTools patch after the app cached an original request function is **not complete coverage**. Multiple providers, frozen methods, reload/navigation, an already-cached reference, hook replacement or lost log mean **incomplete capture**, not zero sends. If early interception cannot be established, retain inference-only status; do not substitute a fake provider or mutate hidden app/extension state.

```js
// DevTools on the owned demo page, before app provider acquisition; NOT run in R2.
const tv4Evidence = [];
const provider = window.ethereum; // only after selected-provider identity is verified
if (!provider || typeof provider.request !== "function") throw new Error("No provider");
const tv4Record = (kind, detail = {}) => tv4Evidence.push({
  seq: tv4Evidence.length, at: new Date().toISOString(),
  monotonicMs: performance.now(), kind, ...detail,
});
const tv4Mark = phase => tv4Record("marker", { phase });
const tv4PublicReads = new Set([
  "eth_accounts", "eth_chainId", "eth_call", "eth_getCode",
  "eth_getTransactionCount", "eth_blockNumber", "eth_getBlockByNumber", "txpool_status",
]);
const tv4Hooks = [];
for (const api of ["request", "send", "sendAsync"]) {
  const original = provider[api];
  if (typeof original !== "function") continue;
  const wrapped = function (...args) {
    const payload = typeof args[0] === "string"
      ? { method: args[0], params: args[1] } : args[0];
    for (const request of Array.isArray(payload) ? payload : [payload]) {
      const method = request?.method;
      tv4Record("call", {
        api, method,
        params: tv4PublicReads.has(method) ? structuredClone(request.params ?? []) : undefined,
        from: method === "eth_sendTransaction" ? request.params?.[0]?.from : undefined,
      });
    }
    // Exact arguments, receiver, return value and thrown error pass through unchanged.
    return Reflect.apply(original, this, args);
  };
  provider[api] = wrapped;
  if (provider[api] !== wrapped) throw new Error("Observer installation failed");
  tv4Hooks.push({ api, original, wrapped });
}
provider.on("accountsChanged", accounts =>
  tv4Record("accountsChanged", { accounts: [...accounts] }));
provider.on("chainChanged", chainId => tv4Record("chainChanged", { chainId }));
provider.on("disconnect", error => tv4Record("disconnect", { code: error?.code }));
tv4Mark("installed-before-A-control");
```

The observer records **attempts before forwarding**, including calls that later reject; it does not issue signing calls. It intentionally does not serialize raw signed transactions, signatures, arbitrary signing payloads or provider error messages. Legacy APIs may internally call `request`, so nonzero duplicate rows are possible; any send row disproves a zero-attempt claim. RPC outcomes/preflight reads are separate raw captures, not invented observer results.

1. Record full run/product/tooling SHA, served-frontend identity, public manifest+digest, chain/genesis/instance and deployment. Capture Chrome version plus actual extension ID and About screenshot / installed manifest `version` (and `version_name` if present), distribution/build and extension manifest checksum. Keep seed, key and profile directory private. These identify **this new session only**.
2. Start A valid control without sending a proposal. Save actual draft title/body/recipient/amount/requestId, active address, `eth_accounts` order and chain. Mark `tv4Mark("before-switch-to-B")`; use the real wallet chooser/permissions UI for site-authorized B, not just global wallet selection. Keep continuous event/method log.
3. Mark before B Submit; capture actual B-active UI/draft/error after the real click. Keep popup observation/video separate from boundary proof. Save read-only raw threshold/getVotes results with exact selector/clock-minus-one pin and request/response timestamps if claiming those numeric preconditions, not just a UI number.
4. At interval start/end, save **both A and B** latest/pending nonces, chain/head/hash and txpool pending/queued raw requests/responses. Return to A through the real wallet UI and compare all draft fields/requestId. Mark each transition and final settled error/return; do not collapse two runs into one interval. No proposal, delegation, funding, mining or governance campaign is needed for an already prepared fixture.
5. After the final observation, verify no navigation/log loss occurred and that the app still uses the same provider and hooks. Export from DevTools:

```js
if (window.ethereum !== provider || tv4Hooks.some(h => provider[h.api] !== h.wrapped)) {
  throw new Error("Coverage changed; do not claim zero sends");
}
tv4Mark("end-after-error-and-A-return");
copy(JSON.stringify({
  trace: tv4Evidence,
  sendAttemptRows: tv4Evidence.filter(e => e.kind === "call" &&
    ["eth_sendTransaction", "eth_sendRawTransaction"].includes(e.method)).length,
}, null, 2));
```

**Acceptance:** complete pre-acquisition coverage through end marker, genuine A→B→A events/account order and matching UI evidence, unchanged draft/requestId, B guard error, no send entries, supporting A/B nonce/head/pool captures, independent new-session extension identity, and run/source/manifest binding. A number `0` from an incomplete logger is not acceptance. Keep the already accepted B-active/provenance material; no demand to recreate H26.

**503 minimum, TV2:** ask for retained exact URL/query, UTC, HTTP status, raw headers/body and returned error/context; correlate the same interval's API, worker and PostgreSQL sanitized log excerpts and raw health/context. If gone, say so. Only on an already authorized owned stack may the operator make one bounded read-only capture of that same request; do not create a fresh deployment or rerun governance for it. Preserve curl exit, HTTP000/503, error body and failed attempts; no automatic retry, reload-to-green, latest/fixture fallback or unsupported root-cause assertion. Diagnose the actual branch before proposing a code regression.

## #40 — fresh access/ownership evidence, not a failed lifecycle run

Sources: [TV4 Option B7184789349](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7184789349), [TV2 source confirmation7206416095](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7206416095), [TV3 Windows hold7221841931](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7221841931), and [TV3 sandbox hold7222076540](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7222076540).

| Fresh report | What it establishes / does not establish |
| --- | --- |
| Windows session `7221841931` | Checkout4cba99a, dirty frontend working tree preserved; approved commit exists but no clean isolated checkout. Windows Node/npm24.21.0/11.19.0; other pinned tools absent from that PATH. `wsl --status` / `--list --verbose`: `E_ACCESSDENIED`. PID28832 reported listening on5432/13300/18545; task/process-command inspection Access Denied. Ownership unknown; **not safe targets**. |
| Sandbox session `7222076540` | Detached4cba99a in `/home/chung2k5/dao-budget-simulator-tv3-run-4cba99a0`; Node24.15.0/npm11.12.1 and required tool executables visible. Namespace/process isolation, `ss` netlink permission error, empty namespace TCP rows and curl permission errors/HTTP000 do **not** show host ports released. Windows/WSL bridge errors `UtilBindVsockAnyPort: socket failed 1` prevent inventory. |
| Neither session | No preregistered run ID, new manifest, before/shutdown/restoration evidence, HTTP recovery, foreground transcript or actual serve termination exit. Neither ran `preflight`/`serve` or changed services/tasks/transport. |

These different session/toolchain observations are compatible; the sandbox's executable visibility does not repair Windows/WSL access. The older report's Disabled task observation is historical; current Access Denied is **unknown state**, not confirmation of Disabled, stopped or restored. Local presence of #42 source896f93e also is not a copy or checksum verification of its restart archive.

TV2's exact approved #40 source is **clean `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`**, runner **`bash scripts/be09-local.sh preflight` then `bash scripts/be09-local.sh serve`** on an isolated TV3-owned Windows/WSL receiver. [Pinned runbook](https://github.com/SE2026-21-1/dao-budget-simulator/blob/e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0/docs/be09.md). TV2's own preflight0 is only a source/toolchain observation, not TV3 lifecycle proof. Do not use latest Dev, dirty4cba99a or borrowed scripts to bypass the registration guard.

### Narrow executable readiness and measurement checklist — not executed

**Access/receiver owner + TV2:** provide an accessible isolated Windows/WSL test receiver/session, not a new Linux substitute. Resolve the actual host permissions through its owner; do not weaken isolation, sudo/kill around it or infer ownership from a port. Protect the active #42 receiver, archive and transport. The latest #40 comments attribute #42 backend PASS to TV2 and TV4 review pending; this report does not sign #42. Main seals its bundle independently. An isolated receiver must be demonstrably disjoint; any shared receiver requires #42 collection/sealing and explicit owner coordination before lifecycle shutdown.

1. **Read-only inventory before approval to change anything.** Capture commands/errors/timestamps and actual native exits, then sanitize public copies. Windows:

   ```powershell
   wsl.exe --status; "wsl_status_exit=$LASTEXITCODE"
   wsl.exe --list --verbose; "wsl_list_exit=$LASTEXITCODE"
   Get-ScheduledTask -TaskName 'DAO Budget Simulator Web' -ErrorAction Stop |
     Select-Object TaskName,TaskPath,State,@{n='Enabled';e={$_.Settings.Enabled}},Actions
   Get-NetTCPConnection -State Listen -ErrorAction Stop |
     Where-Object LocalPort -in 5173,3300,18545,55432,13300,5432 |
     Select-Object LocalAddress,LocalPort,OwningProcess
   netsh.exe interface portproxy show all; "portproxy_exit=$LASTEXITCODE"
   ```

   For each candidate's verified listener PID, inspect `Get-CimInstance Win32_Process -Filter "ProcessId = $verifiedPid"` and its parent: PID/PPID, creation time, executable, sanitized command line and checkout. Retain task ErrorRecord on Access Denied; never use an old `$LASTEXITCODE` as a cmdlet exit. Record task exact path/actions and baseline enabled/running state, Windows Vite process/listener, forwarding/transport and HTTP UI status/body. Ports13300/5432 are **#42 protection inventory**, not #40 kill targets.

   In the authorized WSL receiver: `uname -srm`, `pwd -P`, `git rev-parse HEAD`, `git status --porcelain`, `git submodule status --recursive`, `realpath scripts/be09-register.mjs`, registration-root `git rev-parse HEAD`, `ss -ltnp`; record owned process PID/PPID/user/start time/executable/cwd/sanitized command and listeners. Resolve and record Node/npm, forge/anvil, psql/pg_ctl/initdb executable paths and actual versions. Required pinned toolchain: Node24.15.0/npm11.12.1, Foundry/Anvil1.8.5, PostgreSQL18.4. Do not dump environment, credentials or `/proc/*/environ`. Permission errors stop readiness; they do not prove absence.

2. **Preregister TV3 + TV2, TV4 checks before start.** New run/evidence ID, operator/host/OS/WSL/browser/tool versions; exact approved full SHA, clean clone/submodules and registration realpath/root/SHA consistency; fresh state root outside checkout; public endpoints/origin/CORS/ports; service/task/process/transport ownership and agreed shutdown/restoration window. Manifest path/digest and actual run directory/deployment/chain/addresses are filled from the actual new run before measurement, not copied from a historical manifest. TV2 confirms identity/backend scope; TV4 reviews this inventory. No changing the original frontend checkout, active #42 stack or unrelated listeners.

3. **Only after ownership is verified:** use the already approved [scoped task procedure7064213463](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7064213463). If Windows5173 must be interrupted, record original task/launcher/child identity; disable/stop only that exact task/path, verify launcher exited first to prevent restart, and recheck original child identity before any approved targeted fallback. Never kill by port/name or `taskkill /F`. An already Disabled/stopped baseline must not later be blindly enabled/started. Re-audit after at least10s, including Windows and WSL5173/3300/18545/55432. Ambiguous ownership or launcher restart means HOLD.

4. **Foreground only, exact clone:** `preflight`, then `serve`; no `verify`/full BE09/governance campaign. Keep the owning terminal open. For a captured pipeline, retain serve and tee exits separately:

   ```bash
   set +e
   bash scripts/be09-local.sh serve 2>&1 | tee "$SERVE_LOG"
   rcs=("${PIPESTATUS[@]}")
   printf 'serve_exit=%s tee_exit=%s\n' "${rcs[0]}" "${rcs[1]}"
   ```

   This runs on the future approved receiver, not in R2. Capture start/end UTC, raw sanitized stdout/stderr, terminal/shutdown mechanism and the **actual** termination exit. If no pipeline, save `$?` immediately in that owning shell. Do not infer0/130, use a different shell's `wait`, or substitute the exit of `tee`, `down`, `kill` or the terminal.

5. **TV4 checks before and after shutdown, TV3 captures:** exact-run `BE09_RUN_DIR="$RUN" bash scripts/be09-local.sh status` and actual exit; all five owned service identities/PIDs/listeners before shutdown; Windows UI/API health+context, RPC chain/H/hash/five code identities and CORS OPTIONS/GET against the actual new run, with raw requests/responses/status/exit. These are bounded read-only checks, not full `verify` or worker-restart testing. Coordinate, then real Ctrl+C at serve; capture actual exit and exact-run status/PID absence/listener release on both sides. Recheck start times against PID reuse. `not owned / left untouched` is not absence. Any required explicit exact-run `down` is separately logged and does not repair automatic shutdown evidence. Keep run data/manifest/logs, including failures.

6. **Restore only what was changed:** after BE09 releases5173, restore original task configuration and original enabled/running state. Record task/action, launcher/child executable/command/creation/PID, Windows transport/portproxy and Vite5173 listener. Capture actual HTTP recovery URL/UTC/status/raw body/curl exit; HTTP200 is necessary for a previously serving frontend, but not a replacement for process ownership. Preserve stopped/Disabled baselines; use reasoned N/A rather than manufacture a frontend recovery. Compare real API/context/CORS behavior with the agreed restoration design; do not claim API recovery200 if that service was intentionally shut down.

7. **Portable handoff:** sanitized file→step→run inventory, commands/errors/actual exits, public manifest, foreground transcript and before/after Windows/WSL evidence; checksum all delivered sanitized files and independently check coverage/bytes. No runtime.env, keys/seeds, password, DB dump, cursor secret, RPC credential or profile. **TV4 acceptance only after these new bytes exist and match the new preregistered run.** Missing historical outputs remain missing; no retroactive exit/PID reconstruction.

## PR62 — current delta only

[PR62](https://github.com/SE2026-21-1/dao-budget-simulator/pull/62) remains open at **`d4a0fb563e66be951760167a6f62b246821dc17c`**, base Dev **`d63842ae50dc9a29a42529ce7cd08ca7c569759e`**, merge metadata **`e604426703610b1a5bbdf07df0dddf8a9ac8f109`**, updated `2026-11-26T09:27:54Z`. Fresh reviews **0**, inline comments **0**. The separate issue comment [7188020047](https://github.com/SE2026-21-1/dao-budget-simulator/pull/62#issuecomment-7188020047) is a Netlify preview bot, not live adapter evidence, a human review or permission to use its endpoint. No human change request or new code delta was discovered.

Fresh head-filtered Actions API returns **seven completed/success runs, all attempt1**, the same IDs as the prior review:

| Event | Run IDs and conclusions |
| --- | --- |
| pull_request | Simulator [45792157503](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792157503), TV4 CI [45792157531](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792157531), fallback [45792157609](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792157609): success |
| push | Simulator [45792125336](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792125336), TV4 CI [45792125184](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792125184), fallback [45792125198](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792125198), infrastructure [45792125173](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45792125173): success |

Fresh simulator jobs API: PR **139813612607 / 139813613022**, push **139813505221 / 139813505814**, **4/4 success**, matching successful checkout/setup/npm/typecheck/build/unit or differential steps. These are remote recorded outcomes, not local execution by R2; conclusions for the other five workflows do not imply that every possible conditional job ran.

**Event head is not checkout proof.** The existing [log-backed checkout audit](2026-11-27-pr62-tv4-review.md#ci-từ-github-api--event-sha-khác-actual-checkout) established:

- PR simulator/differential actual checkout **`e604426703610b1a5bbdf07df0dddf8a9ac8f109`**, `refs/remotes/pull/62/merge`, merging the feature head into Devd63842.
- Push simulator/differential actual checkout **`d4a0fb563e66be951760167a6f62b246821dc17c`**.

R2 refreshed metadata/jobs, **did not download new job logs**, and retains those exact historical log observations rather than pretending the API `head_sha` re-proves them. Historical local **144 PASS / 0 FAIL / 0 SKIP** remains prior verification on the unchanged head; no local rerun or additional test count is claimed.

### Live read-only configuration/acceptance checklist — still SKIP

No current owner-approved endpoint, trusted deployment/runtime identity, exact historical pin or numeric chain policy was provided in this scope. No archived loopback/LAN/preview endpoint was probed. No new deployment, testnet broadcast or latest fallback is authorized. Use the [exact PR62 input contract](https://github.com/SE2026-21-1/dao-budget-simulator/blob/d4a0fb563e66be951760167a6f62b246821dc17c/docs/what-if-budget-snapshots.md), not a guessed deployment manifest conversion.

| Owner | Required concrete configuration / evidence before the single bounded live read |
| --- | --- |
| Deployment/chain owner + TV1 `nvdungmim` | Explicit read-only endpoint authorization and current chainId; network/genesis and local-instance/reset identity; direct nonproxy Treasury/BUD addresses. Independently verified deployed runtime bytes **after Treasury immutable BUD patching**, their Ethereum **keccak256** hashes and immutable provenance URL/run/digest. Never substitute SHA-256 artifact/source/ABI fingerprints, NIST SHA3-256, unpatched artifact runtime or expected hashes copied from the same untrusted observation. |
| Chain owner + TV2 `daongocuong` | Exact historical **H and full block hash**, selected from an approved source; **numeric** confirmation/finality and maximum-staleness policy, its clock/reference and reorg/reset handling. A label `safe`/`finalized` or canonical-at-read claim without the agreed numeric policy is not full acceptance. Canonical does not mean consensus-finalized forever. |
| TV2 transport + TV4 | Endpoint EIP-1898 and archive/retention support at **that H**, with raw sanitized JSON-RPC requests/responses/status/timestamps. Anchor `eth_chainId` and `eth_getBlockByNumber([Hhex,false])` before/after; every `eth_getCode`/`eth_call` uses **`{blockHash: approvedHash, requireCanonical: true}`**. Unsupported historical state/pin must reject without a partial scenario; no numeric state-read fallback or latest fallback. A disallowed/noncanonical-hash negative must be read-only and fail closed, not force a reorg. |
| TV1/TV2 caller | `snapshot: {chainId, blockNumber, blockHash}`; chainId/blockNumber passed as bigint (serialize as decimal strings outside JS); `contracts: {treasuryAddress, budgetTokenAddress, treasuryCodeHash, budgetTokenCodeHash}`. Validated proposals/steps, complete supplied proposal/requestId scope, including zero/shared IDs; retain `supplied-proposals-only` and queried distinct IDs. Newly added proposal IDs require a new scoped read, never assume unpaid from Transfer/API history. |
| TV2 transport + TV4 | One bounded whole-read deadline (`timeoutMs`, default30000, allowed1–120000ms), same cancellation signal wired to the HTTP client, transport timeout/response-size/redaction policy. Save actual completion/error/abort outcome. Cancellation is not proof that an already sent read stopped at the provider. Do not replay writes or add retries to disguise unsupported reads. |
| TV4 | Verify nonempty code and independently expected keccak hashes at H; `budgetToken()` binding and decimals18; exact bigint balance and each supplied ID's paid state; unchanged chain/H/hash anchors; paid-scope/source context retained beside simulation. Label assumptions about eligibility/top-up/concurrency/finality and never treat output as execute permission. Keep sanitized request/response/config inventory and checksums. |

Historical `4cba99a` wallet manifest SHA-256 fields are useful provenance, not the required pair of runtime keccak values or approval of a live PR62 endpoint. Synthetic adapter fixtures and Foundry differential semantics do not establish archive or EIP-1898 enforcement by a real provider. Until the table's owned configuration exists, **live SKIP is the correct result**, not a product defect or fabricated PASS.

## Draft comments — ready for owner review, not posted

### #19 — TV4 to TV3/TV2

> Reviewed the latest handoff7198378527 and freshly downloaded pinned887c5ec bytes: eight files unchanged, seven payload checksums OK. Keep the scoped B-active/error/draft visual acceptance and already accepted H26 provenance; no need to resubmit either or rerun governance. New-run source4cba99a and declared MetaMask13.58.0 are not H26/current-Dev evidence. Zero provider send remains inference: the missing narrow addition is a complete selected-provider interval installed before app acquisition, A→B→A/draft/requestId evidence and actual About/manifest identity for that new session. H26 version/image stay UNKNOWN/MISSING. TV2, please classify the retained proposals503 using exact request/status/raw body+headers/context and corresponding API/worker/PG timestamps/logs; if unavailable, keep cause UNKNOWN. Full acceptance remains pending; do not replace503 with latest/fixture or recreate historical evidence.

### #40 — TV4 to receiver owner/TV2/TV3

> The two fresh reports7221841931/7222076540 are an access/ownership readiness HOLD, not a failed lifecycle run. No run was started; sandbox socket errors/HTTP000 and Access Denied do not prove host ports free. Please provide an accessible isolated Windows/WSL test receiver and readable task/process/listener/transport inventory, with a clean approvede8e443c checkout and pinned toolchain. TV3 then preregisters the new run; TV2 checks source/backend identity; TV4 checks before/after bytes for scoped Option B only. Keep the active #42 receiver/transport/archive untouched while its evidence is sealed. Required outputs remain actual foreground serve transcript/exit, owned PID/listener shutdown and original-state task/transport/Vite restoration plus real HTTP recovery. No full verify/BE09/governance rerun, Linux substitute, latest-Dev substitution or retrospective exit reconstruction. Historical offline evidence stays accepted, lifecycle partial; #40 remains open.

### PR62 — TV4 to TV1/TV2/deployment owner

> Fresh head remains d4a0fb563e66be951760167a6f62b246821dc17c; no human reviews/inline comments, one preview bot comment, seven unchanged successful CI runs. Existing 144-check review is retained without rerun. Event head and checkout remain distinct: prior logs show PR jobs at mergee604426, push jobs at exact feature head. Live adapter acceptance is SKIP until owners approve an endpoint/chain-instance/deployment, independently trusted patched runtime keccak hashes, exact historical H/hash and numeric finality/staleness policy. Then collect a single bounded read-only EIP-1898 requireCanonical/archive interval with raw sanitized requests/responses and fail-closed behavior; no latest/numeric-state fallback, deployment or broadcast. This is neither GitHub approval nor merge permission.

## Commands, observed outcomes and limits

- Discussion read command: `python3 - <<'PY'` loaded `/tmp/tv4-r2/github/issues_{19,40}.json`, corresponding complete comments and PR62 body/reviews/inline JSON, printing full bodies and metadata; exit0. Elided/long output was consumed in explicit raw ranges. No test process was launched.
- Fresh API command form (GET only): `curl --silent --show-error --max-time 30 -D "$out/$name.headers" -o "$out/$name" -w '%{http_code}' "$base/$endpoint"`, with `base=https://api.github.com/repos/SE2026-21-1/dao-budget-simulator`, `out=/tmp/tv4-r2/github`. **Nine calls HTTP200/curl0**: `/issues/62/comments?per_page=100&page=1`, `/actions/runs?head_sha=d4a0fb563e66be951760167a6f62b246821dc17c&per_page=100&page=1`, `/pulls/62`, `/git/ref/heads/Dev`, `/git/ref/heads/evidence/tv3-metamask-negative-20261126-4cba99a0`, `/actions/runs/45792157503/jobs?per_page=100&page=1`, `/actions/runs/45792125336/jobs?per_page=100&page=1`, `/pulls/62/reviews?per_page=100&page=1`, `/pulls/62/comments?per_page=100&page=1`. No pagination was necessary at the observed counts.
- Artifact download command form: `curl --silent --show-error --max-time 30 -o "$out/$name" -w '%{http_code}' "$root/$name"`, for exactly the eight allowlisted filenames above; `out=/tmp/tv4-r2/issue19-887c5ec`, `root=https://raw.githubusercontent.com/SE2026-21-1/dao-budget-simulator/887c5ecafd79feaf64956b8e05e9d16576404d84/docs/evidence/tv3-metamask-negative-20261126-4cba99a0`. **8 HTTP200/curl0**. `(cd "$out" && sha256sum --check --strict SHA256SUMS.txt)` → **7 OK, exit0**; `wc -c "$out"/*` → **324845 total bytes**, exit0; `sha256sum "$out"/*` → table above, exit0. The checksum inventory itself is not self-authenticating; its observed SHA and payload coverage are recorded separately.
- Directory GET: `curl --silent --show-error --max-time 30 -o /tmp/tv4-r2/github/r2_issue19_evidence_contents.json -w 'CONTENTS_HTTP=%{http_code}\n' 'https://api.github.com/repos/SE2026-21-1/dao-budget-simulator/contents/docs/evidence/tv3-metamask-negative-20261126-4cba99a0?ref=887c5ecafd79feaf64956b8e05e9d16576404d84'` → **HTTP200/curl0**, exact eight-file inventory. Collector commands exited0.
- Current PR62 snapshot-contract document was read at its immutable raw URL; no code was edited. This report adds no runtime verifier and makes no fresh UI/receiver/live-chain claim. All browser, lifecycle and live-adapter instructions above remain unexecuted. Main owns independent #42 sealing and aggregate candidate verification; no #42 signoff is performed here.
- Final document-local link validation is the only requested final local check; its exact result is returned with this report. Build/lint/test/formatter/live smoke/BE09/BE06/remote service actions: **not run**.
