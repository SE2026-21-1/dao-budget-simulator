# Issue40 final runtime readiness — supplemental delta

**ISSUE40 FINAL RUNTIME READINESS PARTIAL — REMAINING GATES DOCUMENTED**  
**ISSUE40 OPEN / HOLD — RUNTIME SKIP**

## Scope and source

This packet supplements, never rewrites, the [published preparation packet](https://github.com/SE2026-21-1/dao-budget-simulator/tree/bf4ccb396c1dcb8ea3f9d5074071db4be73b8634/docs/evidence/tv3-issue40-runtime-readiness-20261128). Source remains **`7526e045753707599e98d08d69f1b64380027291`**, tree **`0c2e643f4b73fb72023f9a733973343deb83a40e`**, executable branch `tv3/issue40-rpc-isolation-20261128`. [TV2 source approval](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7242429710) and [TV4 source approval](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240899580) both match this SHA: **TV2 + TV4 SOURCE APPROVED — F40-1/F40-2 FIXED**. Old issue-description TV2-pending wording is superseded by actual TV2 approval. Evidence branch/commit are documentation only, not executable-source pins. No Dev merge.

Historical offline/readiness/design acceptance and F40-1/F40-2 packets are unchanged. No source regression rerun. TV4's126 distinct tests were108+11+7 nonoverlapping batches, not combined CI PASS; TV2's66 final passing cases and synthetic PostgreSQL fixtures are not actual receiver lifecycle proof.

## Owner decisions received

- Retained: TV3 receiver owner; Windows Thuc/WSL chung2k5 owner/controller; TV3 runtime and temporary Windows-control responsibility; attempt label `issue40-lifecycle-01`; approved canonical paths.
- **Window:** 2026-11-29 **09:00–12:00 UTC+7**, exactly **02:00–05:00 UTC**. User confirmed; [TV2/group confirmed allocation](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7242660382).
- **Actual allocation:**127.0.0.1 RPC28545/API3300/privatePG55432/Vite5173 in that window. Vite5173 sequential Windows control → WSL frontend → Windows control, never concurrent. Allocation is not reservation, current availability, verified process ownership or execution permission.
- Owner authorized dependency-only `npm ci` at both dedicated checkouts, private preparation cache/log/control directories and exact nonsecret control env. No permission to launch/stop services, bind/query endpoints, create runtime state/PGDATA/socket or execute lifecycle.

## Completed delta

Four locked installations completed: Windows root/frontend and WSL root/frontend, all **actual npm exit0**, each audit reported0 vulnerabilities. No `npm install`, force/ignore-scripts/security override, source/lock change, global Vite or global toolchain update. Root esbuild install source and Darwin-only fsevents metadata were reviewed from integrity-verified lockfile tarballs before installation. Windows npm warned esbuild was not covered by allowScripts; warning retained and no allowScripts setting changed. [Results and controls](dependencies.json), [raw records](preflight-inventory.json).

Actual local **Vite8.3.4**, entrypoint `D:\DAO-Issue40-7526e04\frontend\node_modules\vite\bin\vite.js`; SHA256 **`de5833362e640673962f16e255bf8738d4380a68601b9af26217eee4e1bac36d`**. Version came from offline package metadata, not Vite launch. Windows Node24.21.0/npm11.19.0 and WSL Node24.15.0/npm11.12.1 observed again. Private PostgreSQL18.4 direct-bin/library proposal remains distinct from system18.6, which was not queried as a service.

Both dedicated checkouts remained clean at exact source/tree with five initialized recursive pins; actual root/frontend lockfile bytes unchanged before/after installation. Windows source/config CRLF byte hashes remain distinct from LF Git/WSL blobs as recorded, not source drift. Existing old Windows/WSL checkouts and historical evidence untouched.

Created only owned private control preparation tree `D:\DAO-Issue40-Control\issue40-lifecycle-01` (npm-cache/vite-cache/evidence/env) and WSL dependency cache `/home/chung2k5/.cache/dao-budget-issue40/issue40-lifecycle-01/npm`. Private Windows ACL grants Thuc/SYSTEM/Administrators only, no shared parent/source ACL change. Initial private-parent SID string conversion failed before ACL application; scoped inspection and corrected SecurityIdentifier setup retained in path/provenance records. No state root/PGDATA/socket/runtime metadata created.

## Exact approved configuration policy; final bytes gate

[Owner-displayed proposal](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7242632032) now has **[TV2 CONFIGURATION POLICY APPROVED](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7242660382)**. It is transport-only: API3300/RPC28545/chain31337/NODE_ENV=development, private Vite cache, explicit empty deployment/address/explorer/name variables. No manifest or fake/historical deployment. `apiScope`/`deployment` null and missing-deployment config error are expected; curl HTML200 is not API/wallet/governance/full frontend acceptance. WSL live env/manifest remain runner-generated and separate.

The actual private `frontend-control.env` is materialized with UTF-8/no-BOM/sorted keys/LF; SHA256 **`c934d30191c4b7c9c4b829189f00f1564a2dfe1da9ff6962d0529efa4e538d5b`**. Exact values, command/argv/cwd/tool/source/lock/config/entrypoint hashes, paths and window are bound in [configuration candidate](configuration-candidate.json).

**Deterministic full candidate SHA256:** `c06c8f97e9b7105a992b895f537f71bc13140d36b7250a981e7a99d839533a83`. Hash only `/configuration`, using sorted-key compact ASCII JSON + one LF; [digest record](configuration-candidate.sha256). This is not the prior proposal digest, raw JSON-file checksum, or final independently approved configuration seal. **Final configuration bytes PENDING REVIEW**; approved-final digest stays null. Owner policy approval did not automatically approve newly computed invisible bytes.

Future dedicated control shell removes inherited VITE_*/DOTENV_CONFIG_* and listed Node/cache overrides before the exact env-file command; no global/shared environment change. Only `.env.example` was observed in frontend; any new auto-loaded `.env*` collision causes HOLD. Safe npm environment-name/effective-settings inspection found no NPM_CONFIG_* names, audit=true/ignore-scripts=false/public registry; this inspection was after installation, not fabricated pre-install capture. Future dependency preparation must clear/reconcile npm overrides before use.

## Gates

| Gate | Status | Evidence | Owner / next action |
|---|---|---|---|
| Same-SHA source | APPROVED | TV2 + TV4 links above | Preserve exact source |
| Receiver/controllers | USER-CONFIRMED | [Confirmations](confirmations.json) | TV3 responsibility; no current signal authority |
| Window | USER-CONFIRMED | Local+UTC window above | Near-window reconfirmation |
| Four-port actual allocation | APPROVED | User + TV2/group, [tuple](confirmations.json) | No reservation or execution inferred |
| Locked dependencies/tools/Vite | VERIFIED | [Dependency metadata](dependencies.json), raw records | Recheck drift before use |
| Control policy | APPROVED | Owner + TV2 exact policy | No source review requested |
| Final control bytes/seal | PENDING | Candidate hash; approved-final digest null | Owner/TV2/TV4 review actual bytes |
| Canonical preparation paths/ACL | VERIFIED | [Path delta](canonical-paths.json) | Future concrete runtime path checks pending |
| Candidate availability/routes/task | OBSERVED ONLY | Windows+WSL OS inventories; no candidate listeners | Not reachability/reservation/ownership proof |
| Final fresh runtime preflight | PENDING | Current observations are preparation-time, not near-run | Recollect near approved window |
| Preregistration | PENDING | [Updated draft](preregistration.json) | Finalize after byte review + final preflight |
| TV4 supplemental packet review | PENDING | This newly published packet | Independent byte/scope review only |
| Execution | NOT AUTHORIZED | User + TV2 explicitly withhold launch/stop | Separate later explicit grant |
| Runtime acceptance | NOT CHECKED | No service/control launched | Future authorized evidence only |

Scoped inventories again saw protected5432 only (Windows wslrelay PID17564); no protected requests/operations. Task remains Disabled/Enabled=false; WslService/iphlpsvc Running, LxssManager Stopped; portproxy output empty, scoped route observations retained. No transport/settings change. These observations do not prove Windows→WSL HTTP/RPC reachability. Actual runtime/control ownership, HTTP200 and foreground serve exit are execution-stage evidence, not missing preparation checks to bypass by launching now.

## Accepted execution sequence and remaining requests

Use the unchanged [exact accepted runbook](https://github.com/SE2026-21-1/dao-budget-simulator/blob/7526e045753707599e98d08d69f1b64380027291/docs/issue40-restoration-b.md) steps1–14 and [expanded prior checklist](https://github.com/SE2026-21-1/dao-budget-simulator/tree/bf4ccb396c1dcb8ea3f9d5074071db4be73b8634/docs/evidence/tv3-issue40-runtime-readiness-20261128/restoration-b-checklist.md). They cover original Disabled/no5173 → authenticate Windows baseline control/rawHTTP200 → owned stop → preregister/WSL foreground serve/exact actual run/Windows API-RPC/chain-manifest evidence → actual serve termination and its own exit → narrow exact-run status/down owned residuals → identical Windows restore/new identity/rawHTTP200 → owned stop → original Disabled/no5173. Tee/wrapper/kill/down exits never substitute for actual serve exit. No full BE09/verify/wallet campaign.

[Remaining authorization request](authorization-request.md): TV2/TV4 review final candidate bytes/packet; owner confirms final byte record as needed; near-window source/config/paths/listeners/routes/task recheck and final preregistration; separate explicit execution authorization in a later turn. Actual runtime run/deployment/manifest/transaction fields remain null. Abort on missing approvals/window/allocation/identity, drift/collision/path/config mismatch, preflight failure or risk to protected resources; no fallback port/service/receiver.

`SHA256SUMS` covers all nine payload files exactly, excluding itself. Final validation result and inventory hash are published outside the payload to avoid self-reference. No lifecycle, service launch/stop, endpoint bind/query, deploy/seed, shared task/launcher/service/firewall/portproxy/.wslconfig/WSL shutdown, wallet or protected receiver42 operation occurred.
