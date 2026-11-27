# TV4 — receiver readiness #42 và lifecycle #40, 27/11/2026

> **Historical snapshot, superseded:** [r3 current handoff](2026-11-27-r3-dev-merge-handoff.md).
> #42 now independently PASS scoped via r2; no current receiver-NOT-READY blocker.
> Original observations/status/exits below are preserved; #40 is access/ownership HOLD, not a failed run.

## Kết luận và source

**#42 NOT READY / API-only restart SKIP; #40 lifecycle mới SKIP, vẫn PARTIAL.** Không có receiver TV3 được cấp quyền truy cập trong phiên này. Không dùng máy Linux TV4 làm receiver TV3; không SSH, rollout, deploy, restart/stop/start service, đổi task, nới TTL hoặc chạy lại BE06/BE09 đã được tiếp nhận.

Đã đọc toàn bộ body/comments của `scope-40.md` (737 dòng) và `scope-42.md` (328 dòng), bản tải API đầy đủ tại `/tmp/tv4-review-20261127`; đối chiếu runbook [#40](../indexer.md#lifecycle-receiver-cho-40), [#42](../indexer.md#api-only-restart), [API](../api.md#7-chạy-api-be05), schema/checkpoint và query read-only hiện có. Các bản scope là đầu vào review ngoài repository, không phải đường dẫn bundle công khai.

- Checkout tài liệu quan sát được: **`d4d405f2ca64e1786b44c7d81354cbe2de18040f`**, không phải approval runtime. Baseline #42 đã được TV2 duyệt là **`896f93ea282d76fa72339a97ea12339240c16da4`** ([7155554436](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7155554436)); không tự áp dụng approval này cho PR60 hay latest Dev.
- [TV2 7189768224](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7189768224) chưa xác nhận receiver phù hợp; cho phép kiểm chỉ đọc, đề xuất bootstrap riêng nhưng cần nhóm quyết định vì tạo deployment mới.
- **Thông tin mới hơn, quy đúng cho TV3, không phải quan sát TV4:** [TV3 7198985891](https://github.com/SE2026-21-1/dao-budget-simulator/issues/42#issuecomment-7198985891) báo NOT READY: stack ứng viên source **`4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44`**, khác approved896f93e; database không có proposal, không có snapshot API còn TTL để pin detail/votes. Health200/degraded, DB up/indexer synced/publication ready không giải quyết hai điều kiện thiếu này. TV3 không tác động services, API-only/digest SKIP.
- #40 giữ nguyên [quyết định B 7184789349](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7184789349): run ID mới, lifecycle hẹp trên receiver TV3 sở hữu; BE09 offline lịch sử ACCEPTED, lifecycle lịch sử PARTIAL. Source BE09 lịch sử `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0` không phải approval #42.

**Blocker/owner:** TV2 chỉ rõ receiver đang sống có đúng full source/manifest/database/worker/proposal và quyền TV3; hoặc TV2 đưa kế hoạch chuẩn bị cụ thể để **lead quyết định giữ no-redeploy hay cho phép bootstrap deployment mới ngoài cửa sổ đo**. Không tự bỏ no-redeploy, không đổi worker/DB để vượt readiness. TV3 preregister rồi vận hành; TV2 đối chiếu backend; TV4 kiểm bytes/signoff. Chưa có quyết định bootstrap đó trong scope đã đọc. Nếu dùng chung stack, hoàn tất thu #42 API-only **trước** shutdown #40; approval lifecycle không tự cho phép redeploy #42.

## Quan sát chỉ đọc trên môi trường được cấp quyền

Bash cwd `/tmp/dao-tv4-delivery-20261127`, user hiện tại; không đọc `/proc/*/environ`, env-file hay command line chưa lọc. Đồng hồ máy in UTC **2026-11-26T17:29:28Z** và **17:29:42Z**; ngày tài liệu theo lượt giao việc 27/11. Giữ chênh lệch này, không sửa timestamp thành thời gian receiver.

| Exact command / output liên quan | Actual exit | Phạm vi |
| --- | --- | --- |
| `uname -srm`; `id` → Linux7.0.0-43-generic x86_64, uid1000 | Không capture exit riêng | Output host TV4 Linux quan sát được, không phải WSL/Windows TV3 |
| `git rev-parse HEAD` → d4d405f2ca64e1786b44c7d81354cbe2de18040f | 0 | Identity checkout tài liệu, không runtime receiver |
| `ss -ltnp '( sport = :5173 or sport = :3300 or sport = :18545 or sport = :55432 )'` → chỉ header, không listener | 0 | Không có listener local trên bốn port handoff lúc kiểm; không suy ra máy TV3 không có service |
| `ps -u "$(id -u)" -o pid,ppid,lstart,comm \| awk 'NR == 1 \|\| $NF ~ /^(node\|npm\|postgres\|anvil\|powershell\|pwsh\|wsl)$/'` → chỉ header | ps0, awk0 | Không có process tương ứng của user hiện tại; không kết luận cho user/host khác |
| `node --version`; `npm --version` → v22.23.3; 10.9.9 | 0; 0 | Không phải toolchain BE09 pinned Node24.15.0/npm11.12.1 |
| `forge --version`; `anvil --version` → 1.8.5, commit51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f | 0; 0 | Chỉ version executable, không khởi chạy chain |
| `command -v psql`; `command -v pg_ctl` | 1; 1 | Không có trên PATH hiện tại, không khẳng định chưa cài nơi khác |
| `command -v powershell.exe`; `command -v pwsh`; `command -v wsl.exe` | 1; 1; 1 | Không có transport Windows/WSL được cấp cho phiên này |
| `command -v jq`; `command -v curl` | 0; 0 | Có công cụ thu/đọc evidence, không là receiver readiness |
| `test -f scripts/be09-register.mjs`; `test -f scripts/be09-local.sh` | 1; 1 | Hai runner BE09 không tồn tại trong checkout bàn giao; không copy script checkout khác để vượt guard |

Lệnh inventory tổng `ss -ltnp` exit0 có listener khác nhưng không có handoff ports; không probe/tác động chúng. Không curl endpoint archived hoặc LAN không được giao. Không có manifest/runtime config live đã xác minh ownership để đọc tiếp. **PASS** ở đây chỉ là thu inventory read-only thành công; **receiver NOT READY**, không phải test FAIL backend. Windows transport/task/Vite recovery và actual foreground exit **SKIP/unobserved**. Không chạy build/lint/tests/formatter/smoke/BE06; tài liệu-only nên không thêm verifier hoặc regression giả. Phần dưới là checklist có lệnh cho receiver đủ quyền, **chưa thực thi trong phiên này**; không có response/digest/PID/exit receiver được tạo giả.

## Prerequisites bắt buộc trước mọi phép đo

- [ ] TV2 xác nhận exact full SHA của **cả API và worker**; nếu khác896f93e thì review đúng revision trước chạy. Không checkout/upgrade stack đang chạy để làm phép đo.
- [ ] TV3 ghi run/evidence ID mới, người/máy/OS/WSL/browser/Node/npm/Foundry/PostgreSQL thực tế, root checkout, `git rev-parse HEAD`, `git submodule status --recursive`; manifest public + `sha256sum "$MANIFEST"`, chain ID, deployment name/API ID, numeric DB deployment ID (không nhầm hai ID), API/RPC/UI URL, CORS origin, proposal ID thật tồn tại ở snapshot.
- [ ] RPC read-only `eth_chainId`, `eth_getBlockByNumber` tại H và `eth_getCode` tại H cho **năm** địa chỉ manifest Governor/Timelock/Treasury/GOV/BUD; giữ request/response/status/exit, so chain/hash/code identity. Manifest archived không chứng minh deployment sống; không gửi giao dịch để tạo proposal khi chưa có quyết định bootstrap.
- [ ] API/worker/PG/chain thuộc test receiver, không shared, biết supervisor behavior; API stop không khiến supervisor restart/teardown worker/PG. Shell/process owner có thể capture exit API thực. Nếu không, dừng readiness, không dùng exit của `kill` thay exit process.
- [ ] Ghi PID, PPID, user, start time, executable, cwd, **command line đã lọc secret**, listeners và ownership mỗi service. Linux: `ps -p "$API_PID,$WORKER_PID,$PG_PID,$CHAIN_PID" -o pid,ppid,user,lstart,etimes,comm`; `readlink "/proc/$API_PID/exe"`; `readlink "/proc/$API_PID/cwd"`; `ss -ltnp`. Kiểm tại chỗ command line/config và map owner/checkout/DB/manifest; chỉ giao bản sanitized, không dump env/credentials. PID đơn lẻ hoặc listener đơn lẻ không đủ; kiểm PID reuse qua start time/identity.
- [ ] Lưu worker/PG/chain identity + log boundaries/timestamps trước–sau, config public và bằng chứng cùng DB/deployment. Không rotate cursor-secret, đổi TTL/CORS/config, migration, restart/pause worker/PG/chain trong cửa sổ #42. Checkpoint/heartbeat được tiến hợp lệ.

## #42 — collection cụ thể sau khi readiness được chốt

Chạy Bash tại checkout receiver đã duyệt; không dùng BE09 `up/serve/verify/down` cho API-only. Các biến `API`, `CID`, `DEP`, `PROPOSAL`, `OUT` do TV3 đặt bằng giá trị **đã xác minh**, không dùng ví dụ archived. `API` là base URL không credential, không dấu `/` cuối; `OUT` là đường dẫn tuyệt đối mới ngoài checkout. Không bật `set -x`. Precondition thiếu biến/directory tồn tại thì dừng, không overwrite attempt.

```bash
set -o pipefail
: "${API:?}" "${CID:?}" "${DEP:?}" "${PROPOSAL:?}" "${OUT:?}"
mkdir -- "$OUT" || exit 1
uri() { jq -nr --arg s "$1" '$s|@uri'; }
capture() {
  local stem=$1 url=$2 rc
  printf '%s\n' "$url" > "$stem.url"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$stem.started"
  curl --silent --show-error --max-time 10 --dump-header "$stem.headers" \
    --output "$stem.body.json" --write-out '%{http_code}\n' "$url" \
    > "$stem.status" 2> "$stem.stderr"
  rc=$?
  printf '%s\n' "$rc" > "$stem.curl-exit"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$stem.finished"
  return "$rc"
}
scope="chainId=$(uri "$CID")&deploymentId=$(uri "$DEP")"
capture "$OUT/materialize" "$API/api/summary?$scope" || exit 1
test "$(cat "$OUT/materialize.status")" = 200 || exit 1
H=$(jq -er '.context.asOfBlock | strings | select(test("^[0-9]+$"))' \
  "$OUT/materialize.body.json") || exit 1
HASH=$(jq -er '.context.asOfBlockHash | strings | select(test("^0x[0-9a-fA-F]{64}$"))' \
  "$OUT/materialize.body.json") || exit 1
REV=$(jq -er '.context.snapshotRevision | strings | select(length>0)' \
  "$OUT/materialize.body.json") || exit 1
pin="$scope&asOfBlock=$(uri "$H")&asOfBlockHash=$(uri "$HASH")"
printf '%s\n' "$API/api/summary?$pin" > "$OUT/summary.url"
printf '%s\n' "$API/api/proposals?$pin&limit=20" > "$OUT/proposals.url"
printf '%s\n' "$API/api/proposals/$(uri "$PROPOSAL")?$pin" > "$OUT/detail.url"
printf '%s\n' "$API/api/proposals/$(uri "$PROPOSAL")/votes?$pin&limit=20" > "$OUT/votes.url"
printf '%s\n' "$API/api/treasury/transfers?$pin&limit=20" > "$OUT/transfers.url"
printf '%s\n' "$API/api/health?$scope" > "$OUT/health.url"
collect_round() {
  local round=$1 name failed=0
  mkdir -- "$OUT/$round" || return 1
  for name in summary proposals detail votes transfers health; do
    capture "$OUT/$round/$name" "$(cat "$OUT/$name.url")" || failed=1
  done
  return "$failed"
}
collect_round before || exit 1
```

Đây là lựa chọn filter **không filter**, `limit=20` trên list/votes/transfers, trang đầu **không cursor**; nếu cần filter khác, preregister và đóng băng URL trước collection, dùng nguyên URL trước–sau. Không có query `snapshotRevision`; `REV` chỉ đối chiếu response. Summary materialize là capture bổ sung, **không thay** summary đã pin trong sáu responses. Giữ sáu status/raw bodies kể cả409/503/curl000, không `curl -f`, không retry/fallback latest/repin trong cùng attempt. Kiểm đủ sáu HTTP200 và context năm data endpoints đúng scope/H/hash/REV **trước khi stop API**; nếu không đủ thì attempt chưa đạt, không restart để né lỗi.

Tại mỗi mốc `before`/`after`, ghi audit identity/listener/log nêu trên và raw checkpoint/publication. Dùng auth PostgreSQL **đã có** qua PG service/env riêng (không in hoặc đưa credential vào command line); không provision DB. Từ shell đã có `CID/DEP/OUT`, thay `round` đúng mốc:

```bash
round=before  # chạy lại với after sau API restart, không đổi scope
psql -X --no-password -v ON_ERROR_STOP=1 -At -v cid="$CID" -v dep="$DEP" \
  > "$OUT/$round/checkpoint-publication.log" \
  2> "$OUT/$round/checkpoint-publication.stderr" <<'SQL'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
  'capturedAt', clock_timestamp(), 'chainId', d.chain_id::text,
  'deploymentId', d.deployment_name, 'databaseDeploymentId', d.deployment_id::text,
  'rawCheckpoint', to_jsonb(c), 'publication', to_jsonb(p),
  'indexerPhase', d.indexer_state->>'phase')
FROM deployments d
LEFT JOIN checkpoints c USING (deployment_id)
LEFT JOIN projection_checkpoints p USING (deployment_id)
WHERE d.chain_id=:'cid'::numeric AND d.deployment_name=:'dep';
COMMIT;
SQL
rc=$?; printf '%s\n' "$rc" > "$OUT/$round/checkpoint-publication.exit"
```

`psql -At` vẫn có transaction command tags; tệp `.log` trên là **raw transcript**, không parse như JSON envelope. Đòi hỏi một row đúng deployment, checkpoint/publication không null, phase đúng và ghi cả timestamp/canonical H/hash/revision. Có thể dùng [query read-model hiện có](../../database/queries/be04_read_model.sql) để đối chiếu bổ sung với numeric deployment ID đúng; không rebuild. Read raw JSON/checkpoint riêng, không đưa toàn DB vào invariant digest.

**API stop/start (chỉ sau trước-snapshot hợp lệ):** TV3 ghi exact signal/command và PID đã recheck identity. Chỉ API cũ nhận SIGINT/SIGTERM; không kill theo port/tên, không dùng supervisor BE09. Shell đang sở hữu API cũ ghi `wait "$API_PID"; api_rc=$?; printf 'api_exit=%s\n' "$api_rc"` nếu API là child shell đó; nếu API chạy foreground thì capture `$?` ngay sau nó trả về. `wait` từ shell khác không phải proof exit. Lưu raw stdout/stderr, timestamps và actual signal-command exit **riêng** với API process exit. Xác minh identity/PID cũ đã dừng và listener nhả, rồi shell owner chạy exact `npm run api` từ approved checkout với **cùng config hiện có**, giữ terminal/log, ghi PID/PPID/start time/command/listener của HTTP process thực (không nhầm npm wrapper). Không chạy phần migration/npm ci/secret-generation của ví dụ bootstrap trong docs/API. API mới còn chạy thì ghi `running/readiness`, không bịa final exit0. Startup failure giữ actual exit/log.

Sau recovery, trong TTL gốc: `collect_round after` (capture exit thật); chụp lại checkpoint/publication với `round=after`, worker/PG/chain PID/start time/log/listener. Không đổi sáu URL. Nếu timeout/TTL/409/503/revision mismatch thì giữ snapshot gốc và kết luận **chưa đạt**; không tăng TTL/đổi latest để lấy PASS.

## #42 — offline comparison invocation (không thao tác services)

Checklist bên dưới thay vì thêm script verifier mới: reuse `jq`, `sha256sum`, `cmp` và raw artifacts; không thêm mock PASS receiver. TV3/TV2 chạy với `OUT` là bundle thật, các file do collector tạo; invocation không chứng minh lifecycle/process ownership, các mục đó vẫn phải review raw.

```bash
set -o pipefail
ctx='.context | {chainId,deploymentId,asOfBlock,asOfBlockHash,snapshotRevision}'
jq -ceS "$ctx" "$OUT/materialize.body.json" > "$OUT/expected.context.json" || exit 1
for round in before after; do
  for name in summary proposals detail votes transfers health; do
    test "$(cat "$OUT/$round/$name.curl-exit")" = 0 || exit 1
    test "$(cat "$OUT/$round/$name.status")" = 200 || exit 1
    cmp "$OUT/$name.url" "$OUT/$round/$name.url" || exit 1
  done
  for name in summary proposals detail votes transfers; do
    body="$OUT/$round/$name.body.json"
    jq -e --arg cid "$CID" --arg dep "$DEP" --arg h "$H" \
      --arg hash "$HASH" --arg rev "$REV" '
      has("data") and (.data != null) and
      (.context.chainId == $cid) and (.context.deploymentId == $dep) and
      (.context.asOfBlock == $h) and (.context.asOfBlockHash == $hash) and
      (.context.snapshotRevision == $rev)' "$body" > /dev/null || exit 1
    jq -ceS "$ctx" "$body" > "$OUT/$round/$name.context.json" || exit 1
    cmp "$OUT/expected.context.json" "$OUT/$round/$name.context.json" || exit 1
    jq -cS '{data, pagination: (if .pagination then (.pagination | {limit,totalCount}) else null end)}' \
      "$body" | sha256sum > "$OUT/$round/$name.semantic.sha256" || exit 1
  done
  jq -e '.data.proposalId == $proposal' --arg proposal "$PROPOSAL" \
    "$OUT/$round/detail.body.json" > /dev/null || exit 1
  jq -e . "$OUT/$round/health.body.json" > /dev/null || exit 1
 done
for name in summary proposals detail votes transfers; do
  cmp "$OUT/before/$name.semantic.sha256" "$OUT/after/$name.semantic.sha256" || exit 1
 done
```

Quy tắc digest **đúng TV2**, UTF-8 compact/sorted keys, giữ **thứ tự array và newline cuối của jq**, gồm `data` và `pagination.limit/totalCount`; thiếu pagination → null. Không `jq -j`, không trim newline, không sort array hoặc bỏ limit/count. Không đưa `pagination.nextCursor`, `context.sync`, health/checkpoint vào semantic digest, nhưng **không xóa khỏi raw evidence**. Health đọc riêng theo trạng thái hiện tại; xem HTTP/body/recovery và giải thích checkpoint/heartbeat/sync chuyển động bằng timestamps/logs. Five digests bằng nhau mà context/revision/PID evidence thiếu vẫn chưa đủ PASS. Khi chạy verifier ở shell mới phải lấy `CID/DEP/H/HASH/REV/PROPOSAL` từ preregistration/materialize gốc, không sửa expected theo after.

Lập inventory `file → step → run → owner`, ghi exact command/actual exit từng bước; review/redact trước khi giao. Lập SHA256SUMS trên **allowlist tên tệp sanitized thực giao** (không glob cả run): `sha256sum -- <danh-sách-tệp-đã-duyệt> > SHA256SUMS`, rồi `sha256sum --check --strict SHA256SUMS`; giữ original riêng và checksum bản redacted nếu cần. Không giao runtime.env/worker.env/DB dump/password/private key/seed/cursor secret/RPC credential. Không tuyên bố receiver PASS chỉ vì verifier digest exit0.

## #40 — checklist lifecycle mới sau #42 nếu dùng cùng stack

Không chạy phần này trong phiên TV4. TV3 chốt test receiver mới/approved source/runner với TV2, giữ BE09 offline đã ACCEPTED và không chạy full verify/rebuild/governance chỉ để lấy lifecycle proof.

1. **Preregister** run ID mới, full source/toolchain, checkout/registration realpath+SHA khớp, state root mới, manifest digest/five addresses, endpoints/CORS, owners và cửa sổ shutdown. Chưa có manifest thì ghi preregistration dự kiến rồi bổ sung bytes actual trước phép đo; không mượn manifest lịch sử. Không mặc định BE09 runner có trong common checkout này.
2. **Windows baseline do TV3 thu**, chưa stop gì: `Get-ScheduledTask -TaskName 'DAO Budget Simulator Web' | Select TaskName,TaskPath,State,@{n='Enabled';e={$_.Settings.Enabled}},Actions`; `Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 5173,3300,18545,55432 | Select LocalAddress,LocalPort,OwningProcess`; `Get-CimInstance Win32_Process -Filter "ProcessId = $verifiedPid" | Select ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine`. Lưu task action/launcher+child identity đã sanitized, đúng TaskPath, nguyên enabled/running state. Dùng `Start-Transcript -Path <new-sanitized-evidence-path>` nếu phù hợp, ghi PowerShell errors và `$LASTEXITCODE` ngay sau **native command**; không dùng `$LASTEXITCODE` cũ làm exit cmdlet. Cmdlet error phải giữ ErrorRecord, success bằng trạng thái thực quan sát.
3. **Chỉ sau ownership/approval** áp dụng [TV2 scoped procedure7064213463](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7064213463): `Disable-ScheduledTask -TaskName 'DAO Budget Simulator Web' -TaskPath $taskPath`, rồi `Stop-ScheduledTask` đúng name/path. Xác minh launcher tắt trước child vì restart loop. Nếu child sống, chỉ scoped `Stop-Process -InputObject $verifiedProcess -Confirm` sau recheck PID/start time/executable/command/listener và theo approval TV2; không taskkill/F, kill Node theo tên, hay kill chỉ vì port. Ownership mơ hồ/launcher còn thì dừng, báo blocker. Audit Windows/WSL bốn ports, original PID absence và task disabled; `Start-Sleep -Seconds 10` rồi audit lại để phát hiện auto-restart.
4. **Foreground thật**, tại đúng checkout/root/toolchain: `bash scripts/be09-local.sh preflight` rồi `bash scripts/be09-local.sh serve`, giữ terminal mở. Lưu raw sanitized transcript stdout/stderr/exact command/start-end/shutdown mechanism. Nếu ghi bằng pipeline, dùng `set +e; bash scripts/be09-local.sh serve 2>&1 | tee "$SERVE_LOG"; rcs=("${PIPESTATUS[@]}"); printf 'serve_exit=%s tee_exit=%s\n' "${rcs[0]}" "${rcs[1]}"` trong shell owner; hoặc ngay sau foreground trả về `serve_rc=$?; printf 'serve_exit=%s\n' "$serve_rc"`. Không suy0/130, không lấy exit của tee/down/terminal/kill. Ctrl+C phải thực sự vào foreground process; transcript và actual exit là proof, không là kết quả dự kiến.
5. **Trước shutdown**, terminal khác dùng exact run directory thực: `BE09_RUN_DIR="$RUN" bash scripts/be09-local.sh status`, lưu exit ngay; audit cả năm owned PID/identity/start time/listeners. Windows thu raw API health/context, RPC chain/H/hash, HTTP UI và CORS OPTIONS/GET cùng actual new run. Ví dụ native: `curl.exe --silent --show-error --max-time 10 --dump-header health.headers --output health.body --write-out '%{http_code}' $healthUrl`; ghi `$LASTEXITCODE` ngay sau và timestamp. RPC `eth_chainId`/`eth_getBlockByNumber`/`eth_getCode` là read-only; giữ JSON request/response. CORS `curl.exe ... -X OPTIONS -H "Origin: $origin" -H 'Access-Control-Request-Method: GET' $healthUrl`, kèm GET Origin; kiểm204/allow-origin đúng, không coi HTTP200 là process ownership.
6. **Shutdown** sau cửa sổ các bên đã chốt: Ctrl+C terminal serve, capture actual exit/transcript. Lưu exact-run status, raw original PID identity/absence và listeners Windows/WSL sau stop cho PostgreSQL/Anvil/worker/API/frontend, ports5173/3300/18545/55432. PID reuse hoặc `left untouched/not owned` không chứng minh port nhả. Còn owned service mới dùng `BE09_RUN_DIR="$RUN" bash scripts/be09-local.sh down`; command/exit/log riêng và audit lại, không gọi automatic cleanup PASS bằng kết quả explicit down. Giữ data directory/manifest/runtime/logs, không reset.
7. **Restore Windows** chỉ sau BE09 nhả5173: phục hồi đúng task configuration/enabled/running state ban đầu, không enable/start cái vốn disabled/stopped. `Enable-ScheduledTask` chỉ nếu baseline enabled; `Start-ScheduledTask` chỉ nếu baseline running và chưa tự restart. Audit exact task/action, launcher/child PID/creation/executable/cmdline mới, `Get-NetTCPConnection -LocalPort 5173 -State Listen`, và HTTP UI recovery **raw status/body + actual curl exit**. Phải có HTTP200 recovery nếu baseline là frontend running; baseline vốn stopped thì giữ stopped, ghi N/A với lý do, không dựng HTTP recovery giả. Lưu transport/API/context/CORS sau restoration theo endpoint handoff thực; nếu API đã tắt theo design thì ghi kết quả thực, không gọi health phục hồi200 giả. So trạng thái trước/sau và giải thích khác biệt được duyệt.
8. **Bàn giao** sanitized inventory/SHA256SUMS/file→step→run, raw commands/errors/exits/PIDs/listeners/Windows task+transport+Vite+HTTP và foreground transcript. TV4 kiểm bytes mới rồi mới signoff scoped. Không bổ sung hồi tố exit/PID audit cho run lịch sử.

## Trạng thái bàn giao

| Hạng mục | Kết quả lượt này |
| --- | --- |
| Đọc đầy đủ scopes/runbook, thu local read-only inventory | PASS scoped, commands/exits ở trên |
| Receiver TV3 compatible source + proposal + snapshot TTL | NOT READY theo TV3; TV4 không có access trực tiếp để tự xác minh |
| No-redeploy | Giữ nguyên; TV2 + lead quyết định receiver/bootstrap, chưa tự nới |
| #42 sáu cặp responses, năm digest/context, API-only PID/log/exit | SKIP vì prerequisite thiếu; checklist/invocation đã bàn giao, không fake PASS |
| #40 narrow lifecycle/Windows restoration/HTTP/actual serve exit | SKIP trong phiên; historical lifecycle PARTIAL, không thay bằng Linux TV4 |
| BE06 rebuild/BE09 offline đã accepted | Giữ nguyên, không rerun |
| Build/lint/tests/formatter/remote actions/commit/push | SKIP, không thực hiện trong assignment tài liệu này |
