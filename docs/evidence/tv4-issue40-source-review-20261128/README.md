# TV4 CHANGES REQUESTED — EXACT DESCENDANT ba386dd6fa63eb55f2f9cc9e1c79696de5c9df26

Published disposition: [Issue40comment7240016843](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240016843).

[Machine review](review.json) · [108 regression raw log](focused-regressions.txt) · [syntax raw log](syntax.txt) · [diagnostic reproduction raw](repro-diagnostic.txt) · [partial-PG reproduction raw](repro-partial-postgres.txt) · [766-file actual-byte catalog](historical-bytes.json) · [packet checksums](SHA256SUMS.txt).

**Independent source review hoàn tất; có 2 actionable findings cần sửa.** Không giữ review PENDING và không source-approve từ108testsPASS. **#40 OPEN/HOLD, runtime SKIP; allocation/runtime authorization NOT GRANTED.** Không mở lại inventory/readiness/baselinepreflight đã accepted; không xử lý#20/Sepolia/PR64.

## Provenance/integrity và lượt TV4 thực sự chạy

Clean isolated checkout exact **ba386dd6fa63eb55f2f9cc9e1c79696de5c9df26**, tree **9ef02abba03a1612a9b6ecfd2ac443214df326aa**, direct parent **e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0**, baselinetree **4e69dbc53de4c8c5a90a0fbeb32d1c423e3adb6c**, không currentDev. Đọc AGENTS.md của đúng lineage, fullsource/helpers/callers/assertions/runbook/diff. Dependencylockfiles/gitlinkpins không đổi, recursive submodules đã init đúng5pins; freshroot `npm ci --ignore-scripts --no-audit --no-fund` exit0/30packages, privatecache. Node24.15.0/npm11.12.1/Foundry-Anvil1.8.5 actual; reviewer PG18.4 không nằm PATH, **không realPG/preflight/lifecycle**; testsPG làshims/Nodefixtures.

Independently actualbytes **20/20source +20/20payloadchecksums**, exactcoverage/noextra/missing; packetinventorySHA256 **1219ee02a77289c4c91afc6cc0e0d54a6d63c3b90e01cb147e65533f77cbdb4e**. Đối chiếu **766/766 actualhistoricalfilebytes** (57,812,373bytes) trực tiếp với baselineGitblobs; chỉ3executablehistoricaltests đã migrate, sealedresults không đổi. Retainedbefore-status2FAIL/exit1, before-binddesiredrefusalFAIL/exit1 (originalwait_rpc0≠failedchild1), before-registration1FAIL/exit1 vẫn nguyên; không regenerate.

**TV4 new runs UTC2026-11-28T13:31:28–13:31:45Z:**
```sh
node --test tests/be09-{rpc,registration,runner-allocation,metadata,status-safety,safety,ownership}.test.mjs docs/evidence/be09-20261106/{local-status,toolchain-preflight,readiness,live-test-classification}.test.mjs
```
**108PASS/0FAIL/0SKIP, exit0**,11files (~14.77s Node duration). `bash -n scripts/be09-local.sh` + `node --check`18helpers/tests **exit0**. Đã đọc assertions; safety fixtures thật dùng ownLinux/proc/highports60000–64999, registration/DB/network classification có shims, không Windows/WSL lifecycleproof. NoTS/frontenddelta nên không rerun rootcompile/frontend/fullcampaign. CIhook chứa commandđúngBash; **không GitHubActionsrun tại descendant này**, không dispatch/claimCIPASS.

## F40-1 — P1 BLOCKING: readiness-failure diagnostic probes API dù API ownership đã mất

- **File/function/lines:** `scripts/be09-local.sh:310–320` (`command_up`, đặc biệt316), `scripts/be09-diagnose.mjs:77–89` (`main`); contrast guard `be09-readiness.mjs:33–39`.
- **Preconditions:** authenticbootstrap/sealedruntime, privatePGowned; API captured rồi exit/bind/readinessfails, foreign/reclaimedlistener3300. Không cần metadataforgery/same-ownertampering hoặc racing sau successfulownershipcheck.
- **Expected:** API unowned ⇒ zeroHTTPprobe; giữ localfailurelogs, guardedDB-onlydiagnostic nếu cần. Frontend chưastart, không dùng full-tuplelive để che cả diagnostics.
- **Actual path:** waitOwnedHttp correctlyrefuses trướcfetch; failurebranch chỉ `owned postgres 55432 && metadata validate`, rồi gọi realdiagnostic. Staticmetadata validation không chứng minh APIliveness. Diagnostic vẫn GET `/api/health` và `/api/summary` tới persistedAPI3300, không `owned api 3300`.
- **Actual independent reproduction:** realinitialize/seal/metadata-validation + extractedverbatimrunnerfailurebranch + realdiagnosticCLI; readiness/PGownership simulated, fetch/pg blockedbyloader trướcinvocation. **2attemptedAPIrequests khi APIidentitymissing**,2blockedDBconnectattempts; **0realnetwork/DBconnections,0services,0signals**. Reproductionharness **exit0 vì assertđã táihiệnbug**; readinessbranch trả1, không gọi sourcePASS. Không bind/probe3300 haybấtkỳreceiver.
- **Gate affected:** P1 failclosed/no foreignprobe sau lostownership;108tests không coverbranch này.
- **Minimal required fix:** gate/skip HTTP diagnostics khi không chứng minh exact-run APIlistenerownership, trước HTTP; giữ canonicalsource/allocation/artifactvalidation và privatePGownership trướcDB. Có thể guard ởrunner + helperboundary hoặc splitoffline/DB-onlydiagnostic; không loosen guard/không require frontend live khi nó chưastart. Thêm isolated regression cho actualfailurebranch, không chỉ mockedhelperPASS.

## F40-2 — P2 BLOCKING cho partial-bootstrap requirement: pg_ctl wait failure leaves capturable postmaster without identity

- **File/function/lines:** `scripts/be09-local.sh:265–270` (`command_up`), EXIT236/cleanup123–143; identitycapture `be09-safety.mjs:146–174`.
- **Preconditions:** canonicalprivatePGDATA/bootstrap đã tạo; pg_ctlspawnserver nhưng `-w start` timeout/nonzero khi postmaster vẫn còn, readablecanonicalpostmaster.pid. [PostgreSQL18manual](https://www.postgresql.org/docs/18/app-pg-ctl.html) xác nhận nonzerowait có thể vẫncontinuebackground. Không khẳng định mọistartfailure đều vậy.
- **Expected:** preserveoriginalstartupstatus, attempt existingfullownershipcapture từ exactprivatePGDATA/postmaster/executable/argv; nếu chứng minh được thì authenticatedSIGINTcleanup. Unknown/foreign phải giữ nguyên, không barePIDkill.
- **Actual path:** barepg_ctl undererrexit thoát trước ghi `pids/postgres.pid` và `capture_identity postgres`. EXITcleanup cần identitychưa từngtạo ⇒ `no authenticated live cluster; left untouched`; laterdown cũng không recover. Đây là mất cơ hội authenticate, không yêu cầu killunknown.
- **Actual independent reproduction:** exactextractedPGstartupblock + realbootstrap/cleanup; pg_ctl **timeoutshim**, directly-owned **Nodepostmasterfixture**, noDB/socket. Startup **exit1**, PID/identitymissing và fixture **sống sau automaticcleanup**. Explicitreviewer recovery sau đó dùng real `captureProcess` thành công và real guardedSIGINT chỉtớiownfixture; chứng minh capturable. Reproductionharness **exit0 vì assertbug**, fixturetermination **SIGINT**, không actualPGtermination/lifecycleclaim.
- **Gate affected:** legitimatepartialbootstrapcleanup trướcregistration; currentcleanup-without-runtime test bắtđầu SAU identitycapture nên không cover.
- **Minimal required fix:** handle pg_ctl nonzero withoutprematureerrexit, attemptsamecanonicalownershipcapture trên cảsuccess/failure, preservestartupfailuređểEXITcleanup dùngexistingguard. Capturefail vẫnleaveunknown; không dùng terminalpg_ctlstop/barePID/fallbackendpoint. Thêm timeout-with-liveownedpostmaster regression.

## Conditions đã đạt và giới hạn

| Scope | Source result |
|---|---|
| RPCunset-onlydefault/invalid/leadingzeros/collisions/Issue40RPC28545 trướcbootstrap; strictregistrationCLI | PASS |
| SinglecanonicalRPC xuyên portcheck/Anvil/readiness/deploy/role/seed/register/runtime/env/worker/indexer/frontend/reports | PASS |
| OriginalAnvilbindrace: childPID/PPID/startticks/bootID/exe/exactargv/socketinode/fdownership/exact127.0.0.1 beforeprobe/deploy/roles/seed | PASS under recordedidentity/check-use limits |
| Mainstatus/verify/live/restart persistedrun/source/tree/helperhashes/workingfingerprint/artifactseal/envconfig + boundedworkergrace/nonworkerownership | PASS guardedpaths; **F40-1diagnosticexception OPEN** |
| Canonicalrun/PGDATA/symlink/traversal/crossrun/PIDreuse/guardedTERM-KILL/PGSIGINT/oldrun-vs-newAPI-Vite | PASS coreguards; **F40-2pre-capturepartialcleanup OPEN** |
| RestorationB14-step futureWindowscontrolrunbook | DESIGNconditions retained; no actualWindowscontrol/toolapproval/runtimeproof |

PrivatePGsocket `/tmp/dao-be09-<runid>-pg` đượcmkdir700exclusive; không persistedfullsocketattestation, owner phảiapproveactualcanonicalpath. NoatomicPID/socketcapability: localcheck/use windows vàsame-ownerfiletamperingkhông bịclaimeliminated. Metadata seal pinsgeneratedbytes; fullworkerconfigschema trướcinitialseal chưa được validate đầy đủ, normalregistration tạo completeconfig và postsealmutationsfail—nonblocking limitation, không claimedordinaryexploit. Node/PGshims, injectedfetch/liveguard và mockedgrace không thay liveacceptance. Exact executable equality là recordedrealpath/argv, không immutablebinaryinode/hashsecurityboundary.

## Next action / runtime HOLD

TV3: sửa2narrowfailurepaths trên existingbranch, bổ sung đúng2regressions/giữassertions, resealnewpacket vànormal-push **fullnewdescendantSHA**, nộp TV2/TV4rereviewdelta. Không productionfix doTV4/không fullcampaign hoặc inventoryresubmit.

Sau source đạt vẫn cần **TV2sourceapproval + cùngfullSHA được TV2/TV4accept**, receiverownerconfirmation/fourportactualallocation/controller, canonicalcheckout/stateRoot/PGDATA/socket, approvedWindowsforegroundcontrolcommand/config/lockfile/actualNode-npmexecutable-versionproof, freshownership/availability/route, preregisteredattempt và explicitexecutionpermission. RestorationBkhôngenabletask/sharedlauncher/restartloop/transport; actualservewaitexit không tee/down/kill; temporarycontrolHTTP200 recovery không ScheduledTask/wallet/APIacceptance. Không tạo actualrunID/manifest/transcripttrước authorizedruntime.

**Project NOT UPDATED**: existing authenticatedbrowserrelay unavailable; API token lacksProjectscope. Chỉ cập nhật#40 bằng quyềnhiệncó, không sửaOAuth/settings. **Không lifecycle launch, no #42RPC18545/API13300/PG55442/system5432/candidateports bind/query, no foreignkill/task/WSL/transportaction.**

## Reviewer packet and RPC propagation source map

| Consumer | Reviewed exact-source lines | Result |
|---|---|---|
| Input/default/Issue40 scope | be09-rpc.mjs4–35; be09-local.sh68–83 | unset-only18545 ordinary; normalized boundeddecimal; strictURL/scope; Issue40requires28545 beforebootstrap |
| Port availability / Anvilbind | be09-local.sh181–191,281–287 | samecanonicalURLport / RPC_PORT; advisoryfreecheck plusownedlistenergate |
| Readiness / deployment / roles / seed | be09-readiness.mjs9–24; be09-local.sh287–295 | sameRPC_URL; freshownedlistenerchecks before each write helper |
| Required registration / report | be09-local.sh296–297; be09-register.mjs18–39,146 | exactrequiredcanonical --rpc-url, no missing/unknown/duplicate flags |
| runtime.urls.rpc | be09-register.mjs101–108 | explicitrpcUrl |
| runtime.env RPC_URL / BE05_LIVE_RPC_URL | be09-register.mjs110–118 | sameexplicitrpcUrl |
| worker.env / indexer JSONrpcUrl | be09-register.mjs120–133 | sameexplicitrpcUrl; env/config crossvalidated |
| frontend.env / VITE_RPC_URL | be09-register.mjs134–145 | sameexplicitrpcUrl; wallet acceptance excluded |
| Runtime up report | be09-local.sh329–353 | actualRPC_URL, not hardcoded18545 |
| Existing-run status | be09-local.sh394–408; be09-metadata.mjs157–174 | persisted exact-run validated/sealedRPC; whole-tupleguards beforeprobes |
| Verify / live / restart | be09-verify.mjs33–41,325–339; metadata bindings | persistedruntime equality/validatedenv; nonworkerownership survives boundedgrace; F40-1diagnostic exception remains |

Ordinary help/default18545 literals are not Issue40 runtime bugs. Full executable readiness caller preserves DBroles/fromBlock2/GOVmetadata1 and all output assertions; new registration test uses PGshim. Sealed historicalresults were not altered.

### Reproduction source and scope

- [diagnostic-repro.mjs](diagnostic-repro.mjs): actual executed source copied unchanged from reviewer private path; pass a clean exactdescendant checkout as firstarg. Reaches real metadata validation + extracted sourcebranch + real diagnostic, with readiness/PGownership/fetch/DB shims.
- [partial-postgres-repro.mjs](partial-postgres-repro.mjs): actual executed source copied unchanged; exactstartup/cleanupbranch, pg_ctltimeoutmodel + directownedNodefixture. SIGINT recovery belongs only to reviewerfixture and is not behavior credited to production.
- Raw logs preserve stdout/stderr separately verbatim inside labeled framing, UTCcommands/actualexits; relative temporary paths describe the actual review environment, not receiverpreregistration. Scripts were not added to productiontests or the candidate checkout.
- Source/header/initial tree/submodule preparation preserved existing checkouts. No productionfix or actual receiver lifecycle run ID/manifest/foreground serve exit was created; synthetic unit/model artifacts are identified as fixtures. Source approval remains denied until both findings corrected; runtime gates remain independently missing.

Final post-edit evidence/document check and pushed commit are reported in delivery chat. Packet inventory excludes itself; reviewed source and producer packet retain their original separate20/20 inventories.
