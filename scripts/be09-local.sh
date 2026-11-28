#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)"
STATE_ROOT="${BE09_STATE_ROOT:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/dao-budget-be09}"
RUN_DIR=""
UP_OK=0
RPC_URL=""
RPC_PORT=""
SCOPE="${BE09_SCOPE-ordinary}"

usage() {
  cat <<'USAGE'
Usage: bash scripts/be09-local.sh <preflight|up|serve|verify|status|down>

Optional:
  BE09_STATE_ROOT  External writable state directory
  BE09_RUN_DIR     Select a specific run for verify/status/down
  BE09_RPC_PORT    RPC decimal port; only unset defaults to 18545
  BE09_SCOPE       ordinary (default) or issue40 (requires RPC 28545/private root)
  BE09_NODE_DIR    Directory containing node and npm (otherwise PATH)
  BE09_FOUNDRY_DIR Directory containing forge and anvil (otherwise PATH)
  BE09_PG_DIR      Directory containing PostgreSQL binaries (otherwise PATH)
  BE09_LD_LIBRARY_PATH  Additional dynamic-library directories

Default URLs: RPC http://127.0.0.1:18545, API http://127.0.0.1:3300,
frontend http://127.0.0.1:5173, PostgreSQL 127.0.0.1:55432.
USAGE
}
fail() { printf 'BE09 ERROR: %s\n' "$*" >&2; return 1; }
note() { printf '%s\n' "$*"; }

configure_toolchain() {
  local dir
  for dir in "${BE09_PG_DIR:-}" "${BE09_FOUNDRY_DIR:-}" "${BE09_NODE_DIR:-}"; do
    if [[ -n "$dir" ]]; then
      [[ "$dir" = /* && -d "$dir" ]] || fail "Tool directory must be an existing absolute path: $dir"
      PATH="$dir:$PATH"
    fi
  done
  export PATH
  if [[ -n "${BE09_LD_LIBRARY_PATH:-}" ]]; then
    LD_LIBRARY_PATH="$BE09_LD_LIBRARY_PATH${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
  export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
  NODE_BIN="${BE09_NODE_DIR:+$BE09_NODE_DIR/node}"; NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
  NPM_BIN="${BE09_NODE_DIR:+$BE09_NODE_DIR/npm}"; NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
  ANVIL_BIN="${BE09_FOUNDRY_DIR:+$BE09_FOUNDRY_DIR/anvil}"; ANVIL_BIN="${ANVIL_BIN:-$(command -v anvil || true)}"
  FORGE_BIN="${BE09_FOUNDRY_DIR:+$BE09_FOUNDRY_DIR/forge}"; FORGE_BIN="${FORGE_BIN:-$(command -v forge || true)}"
  INITDB_BIN="${BE09_PG_DIR:+$BE09_PG_DIR/initdb}"; INITDB_BIN="${INITDB_BIN:-$(command -v initdb || true)}"
  PG_CTL_BIN="${BE09_PG_DIR:+$BE09_PG_DIR/pg_ctl}"; PG_CTL_BIN="${PG_CTL_BIN:-$(command -v pg_ctl || true)}"
  CREATEDB_BIN="${BE09_PG_DIR:+$BE09_PG_DIR/createdb}"; CREATEDB_BIN="${CREATEDB_BIN:-$(command -v createdb || true)}"
  PSQL_BIN="${BE09_PG_DIR:+$BE09_PG_DIR/psql}"; PSQL_BIN="${PSQL_BIN:-$(command -v psql || true)}"
}

ensure_external_state() {
  [[ -n "${BE09_STATE_ROOT:-}${XDG_STATE_HOME:-}${HOME:-}" ]] || fail 'Set HOME, XDG_STATE_HOME or an absolute BE09_STATE_ROOT.'
  [[ "$STATE_ROOT" = /* ]] || fail 'BE09_STATE_ROOT must be absolute.'
  case "$STATE_ROOT/" in "$ROOT/"*) fail 'BE09 state directory must be outside the worktree.' ;; esac
}

validate_state_paths() {
  "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" paths "$ROOT" "$STATE_ROOT" "$STATE_ROOT/runs/prelaunch" >/dev/null
  STATE_ROOT="$(realpath -m -- "$STATE_ROOT")"
}
configure_rpc() {
  RPC_PORT="$("$NODE_BIN" --input-type=module - "$ROOT" "$STATE_ROOT" "$SCOPE" <<'NODE'
import { pathToFileURL } from 'node:url';
const [root,stateRoot,requested]=process.argv.slice(2);
const {parseRpcPort,validateRpcAllocation}=await import(pathToFileURL(root+'/scripts/be09-rpc.mjs'));
const {runScope}=await import(pathToFileURL(root+'/scripts/be09-metadata.mjs'));
const scope=runScope(stateRoot,requested);
if(scope==='issue40'&&!/\/dao-budget-issue40-lifecycle-[A-Za-z0-9-]+$/.test(stateRoot))throw Error('Issue40 requires an explicit private per-attempt state root');
const port=parseRpcPort(process.env.BE09_RPC_PORT);
validateRpcAllocation('http://127.0.0.1:'+port,scope);
console.log(port);
NODE
)"
  RPC_URL="http://127.0.0.1:$RPC_PORT"
  [[ "$(basename -- "$STATE_ROOT")" != dao-budget-issue40-lifecycle-* ]] || SCOPE=issue40
}
metadata() { "$NODE_BIN" "$ROOT/scripts/be09-metadata.mjs" "$1" "$ROOT" "$STATE_ROOT" "$RUN_DIR" "${RPC_URL:-}" "$SCOPE"; }
owned() {
  if [[ -n "${2:-}" ]]; then "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" owned "$RUN_DIR" "$1" "$2" >/dev/null
  else "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" owned "$RUN_DIR" "$1" >/dev/null; fi
}
capture_identity() {
  local label="$1" executable="$2" marker="$3" parent="${4:-}" attempt
  for attempt in {1..20}; do
    if "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" capture "$RUN_DIR" "$label" "$(cat "$RUN_DIR/pids/$label.pid")" "$executable" "$marker" ${parent:+"$parent"} 2>"$RUN_DIR/logs/$label-identity.log"; then return; fi
    sleep 0.05
  done
  fail "Cannot authenticate $label child; see $RUN_DIR/logs/$label-identity.log"
}

resolve_run_dir() {
  validate_state_paths
  local candidate="${BE09_RUN_DIR:-}"
  if [[ -z "$candidate" ]]; then
    candidate="$(find "$STATE_ROOT/runs" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | LC_ALL=C sort -r | head -n 1 || true)"
  fi
  [[ -n "$candidate" && "$candidate" = /* && -d "$candidate" ]] || fail 'No canonical BE09 run directory selected.'
  "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" paths "$ROOT" "$STATE_ROOT" "$candidate" >/dev/null
  RUN_DIR="$(realpath -e -- "$candidate")"
}

stop_pidfile() {
  local label="$1" key="$2" attempt
  [[ -f "$RUN_DIR/pids/$key.pid" ]] || { note "$label: no PID file"; return 0; }
  if ! owned "$key" 2>/dev/null; then
    note "$label: PID is not a live process owned by this run; left untouched"
    return 0
  fi
  "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" signal "$RUN_DIR" "$key" TERM
  for attempt in {1..60}; do
    if ! owned "$key" 2>/dev/null; then note "$label: stopped"; return 0; fi
    sleep 0.2
  done
  "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" signal "$RUN_DIR" "$key" KILL
}
stop_owned_services() {
  local run="$1"
  "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" paths "$ROOT" "$STATE_ROOT" "$run" >/dev/null || return 1
  RUN_DIR="$run"
  # Bootstrap identity precedes every child; full runtime may still be incomplete.
  if [[ -f "$run/run-identity.json" ]]; then metadata cleanup >/dev/null || return 1
  else note 'No authenticated bootstrap; no processes may be signalled.'; return 0; fi
  stop_pidfile 'Vite' frontend
  stop_pidfile 'API' api
  stop_pidfile 'Indexer worker' worker
  stop_pidfile 'Anvil' anvil
  if owned postgres 2>/dev/null; then
    note 'PostgreSQL: stopping authenticated private cluster'
    "$NODE_BIN" "$ROOT/scripts/be09-safety.mjs" signal "$RUN_DIR" postgres INT
    local attempt
    for attempt in {1..60}; do
      if ! owned postgres 2>/dev/null; then note 'PostgreSQL: stopped'; return 0; fi
      sleep 0.2
    done
    fail 'Owned PostgreSQL did not finish fast shutdown; retained for explicit inspection.'
  else note 'PostgreSQL: no authenticated live cluster; left untouched'; fi
}

check_source_and_toolchain() {
  local actual submodules line untracked
  actual="$(git -C "$ROOT" rev-parse HEAD)"
  git -C "$ROOT" diff --quiet || fail 'Tracked worktree has unstaged changes; refusing to build another source tree.'
  git -C "$ROOT" diff --cached --quiet || fail 'Git index has staged changes; refusing to build another source tree.'
  while IFS= read -r untracked; do
    [[ -z "$untracked" ]] || fail "Untracked file in checkout; move or commit it before running: $untracked"
  done < <(git -C "$ROOT" ls-files --others --exclude-standard)
  submodules="$(git -C "$ROOT" submodule status --recursive)"
  while IFS= read -r line; do
    if [[ "$line" = [-+U]* ]]; then fail 'A submodule is missing, modified, or conflicted.'; fi
  done <<< "$submodules"
  local spec name binary
  for spec in "node:$NODE_BIN" "npm:$NPM_BIN" "anvil:$ANVIL_BIN" "forge:$FORGE_BIN" "initdb:$INITDB_BIN" "pg_ctl:$PG_CTL_BIN" "createdb:$CREATEDB_BIN" "psql:$PSQL_BIN"; do
    name="${spec%%:*}"; binary="${spec#*:}"
    [[ -n "$binary" && -x "$binary" ]] || fail "Missing executable $name; configure BE09_NODE_DIR, BE09_FOUNDRY_DIR, BE09_PG_DIR or PATH."
  done
  [[ "$("$NODE_BIN" --version)" = 'v24.15.0' ]] || fail 'Node must be v24.15.0 from the verified toolchain.'
  [[ "$("$NPM_BIN" --version)" = '11.12.1' ]] || fail 'npm must be 11.12.1 from the verified toolchain.'
  local anvil_version forge_version postgres_version
  anvil_version="$("$ANVIL_BIN" --version)"
  forge_version="$("$FORGE_BIN" --version)"
  postgres_version="$("$PG_CTL_BIN" --version)"
  [[ "$anvil_version" =~ (^|[^0-9.])1\.8\.5([^0-9.]|$) ]] || fail 'Anvil must be 1.8.5 from the verified toolchain.'
  [[ "$forge_version" =~ (^|[^0-9.])1\.8\.5([^0-9.]|$) ]] || fail 'Foundry must be 1.8.5 from the verified toolchain.'
  [[ "$postgres_version" =~ (^|[^0-9.])18\.4([^0-9.]|$) ]] || fail 'PostgreSQL must be 18.4 from the verified toolchain.'
  for binary in "$INITDB_BIN" "$CREATEDB_BIN" "$PSQL_BIN"; do
    [[ "$("$binary" --version)" =~ (^|[^0-9.])18\.4([^0-9.]|$) ]] || fail "PostgreSQL binary must be 18.4: $binary"
  done
  note "Revision: $actual"
  note "Node: $("$NODE_BIN" --version); npm: $("$NPM_BIN" --version)"
  note "Anvil: $anvil_version"
  note "PostgreSQL: $postgres_version"
}

check_ports_free() {
  "$NODE_BIN" --input-type=module -e '
    import net from "node:net";
    for (const port of [Number(new URL(process.argv[1]).port),55432,3300,5173]) {
      await new Promise((resolve,reject) => {
        const server=net.createServer();
        server.once("error",error=>reject(new Error("127.0.0.1:"+port+" unavailable: "+(error.code??error.message))));
        server.listen({host:"127.0.0.1",port,exclusive:true},()=>server.close(error=>error?reject(error):resolve()));
      });
      process.stdout.write("Port free: 127.0.0.1:"+port+"\n");
    }' "$RPC_URL"
}

wait_rpc() {
  "$NODE_BIN" "$ROOT/scripts/be09-readiness.mjs" "$RUN_DIR" "$1"
}
wait_api_ready() {
  "$NODE_BIN" "$ROOT/scripts/be09-readiness.mjs" http "$RUN_DIR" "$1" api "$2"
}
wait_http() {
  "$NODE_BIN" "$ROOT/scripts/be09-readiness.mjs" http "$RUN_DIR" "$1" frontend
}
start_service() {
  local label="$1" pidfile="$2" logfile="$3"
  shift 3
  [[ ! -e "$pidfile" ]] || fail "$label PID file already exists; refusing to overwrite: $pidfile"
  ( cd "$ROOT"; nohup env -i PATH="$PATH" LD_LIBRARY_PATH="$LD_LIBRARY_PATH" HOME="${HOME:-}" "$@" > "$logfile" 2>&1 < /dev/null & echo $! > "$pidfile" )
  chmod 600 "$pidfile"
  local key
  key="$(basename -- "$pidfile" .pid)"
  local marker="$RUN_DIR/indexer-config.json"
  [[ "$key" != api ]] || marker="--env-file=$RUN_DIR/runtime.env"
  [[ "$key" != frontend ]] || marker="--env-file=$RUN_DIR/frontend.env"
  capture_identity "$key" "$1" "$marker"
  note "$label started with PID $(cat "$pidfile"); log: $logfile"
}

command_up() {
  ensure_external_state
  configure_rpc
  validate_state_paths
  check_source_and_toolchain
  check_ports_free
  mkdir -p -m 700 "$STATE_ROOT/runs"
  local stamp random run_id pgdata socket_dir db_url manifest seed_report deployment_name source_revision
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  random="$(openssl rand -hex 6)"
  run_id="$stamp-$random"
  RUN_DIR="$STATE_ROOT/runs/$run_id"
  mkdir -m 700 "$RUN_DIR"
  mkdir -m 700 "$RUN_DIR/cache" "$RUN_DIR/logs" "$RUN_DIR/pids" "$RUN_DIR/reports" "$RUN_DIR/public" "$RUN_DIR/postgres"
  mkdir -m 700 "$RUN_DIR/postgres/data" "$RUN_DIR/postgres/socket"
  printf '%s\n' "$run_id" > "$RUN_DIR/run-id"
  metadata init
  exec > >(tee -a "$RUN_DIR/logs/setup.log") 2>&1
  trap 'status=$?; if [[ "$UP_OK" != 1 ]]; then note "Setup did not complete; stopping only processes created for this run. Data/logs retained at $RUN_DIR"; stop_owned_services "$RUN_DIR" || true; fi; exit "$status"' EXIT
  note "BE09 run: $run_id"
  note "External run directory: $RUN_DIR"
  source_revision="$(git -C "$ROOT" rev-parse HEAD)"
  "$NODE_BIN" "$ROOT/scripts/be09-provenance.mjs" "$ROOT" "$RUN_DIR/reports/source-provenance.json" "$source_revision"
  note 'Installing clean dependencies from the root and frontend lockfiles with this run private npm cache.'
  if ! (cd "$ROOT" && "$NPM_BIN" ci --cache "$RUN_DIR/cache/npm" --no-audit --no-fund); then
    fail "root npm ci failed; see $RUN_DIR/logs/setup.log. No deployment was created."
  fi
  if ! (cd "$ROOT" && "$NPM_BIN" ci --prefix frontend --cache "$RUN_DIR/cache/npm" --no-audit --no-fund); then
    fail "frontend npm ci failed; see $RUN_DIR/logs/setup.log. No deployment was created."
  fi
  (cd "$ROOT" && "$NPM_BIN" run typecheck)
  (cd "$ROOT" && "$NPM_BIN" run build)
  (cd "$ROOT" && "$NPM_BIN" run build --prefix frontend)
  (cd "$ROOT" && "$FORGE_BIN" build)
  [[ -f "$ROOT/frontend/node_modules/vite/bin/vite.js" ]] || fail 'Vite CLI is absent after frontend npm ci.'

  pgdata="$RUN_DIR/postgres/data"
  socket_dir="/tmp/dao-be09-$run_id-pg"
  mkdir -m 700 "$socket_dir"
  db_url='postgresql://be09@127.0.0.1:55432/dao_budget_be09'
  manifest="$RUN_DIR/public/manifest.json"
  seed_report="$RUN_DIR/reports/governance-seed.json"
  deployment_name="be09-local-$stamp-$(openssl rand -hex 6)"

  "$INITDB_BIN" -D "$pgdata" --username=be09 --auth-local=trust --auth-host=trust --encoding=UTF8 --no-instructions > "$RUN_DIR/logs/initdb.log" 2>&1 || {
    note "initdb failed; see $RUN_DIR/logs/initdb.log"; return 1;
  }
  "$PG_CTL_BIN" -D "$pgdata" -l "$RUN_DIR/logs/postgres.log" \
    -o "-h 127.0.0.1 -p 55432 -k $socket_dir -c listen_addresses=127.0.0.1" -w start
  head -n 1 "$pgdata/postmaster.pid" > "$RUN_DIR/pids/postgres.pid"
  chmod 600 "$RUN_DIR/pids/postgres.pid"
  capture_identity postgres "$(dirname -- "$PG_CTL_BIN")/postgres" "$pgdata"
  owned postgres 55432
  note "Isolated PostgreSQL started at 127.0.0.1:55432; data directory: $pgdata"
  "$CREATEDB_BIN" -h 127.0.0.1 -p 55432 -U be09 dao_budget_be09
  export BE09_DATABASE_URL="$db_url"
  for migration in 001_initial.sql 002_be03.sql 003_be04.sql 004_be05_api.sql 005_be07.sql; do
    if ! "$PSQL_BIN" -X -v ON_ERROR_STOP=1 "$db_url" -f "$ROOT/database/migrations/$migration" >> "$RUN_DIR/logs/migrations.log" 2>&1; then
      note "Migration $migration failed; see $RUN_DIR/logs/migrations.log"; return 1
    fi
    note "Applied migration $migration"
  done

  ( exec -a "be09-anvil-$run_id" "$ANVIL_BIN" --host 127.0.0.1 --port "$RPC_PORT" --chain-id 31337 --hardfork osaka --timestamp 1800000000 --silent ) \
    > "$RUN_DIR/logs/anvil.log" 2>&1 < /dev/null &
  printf '%s\n' "$!" > "$RUN_DIR/pids/anvil.pid"
  chmod 600 "$RUN_DIR/pids/anvil.pid"
  note "Anvil starting with PID $(cat "$RUN_DIR/pids/anvil.pid"); log: $RUN_DIR/logs/anvil.log"
  capture_identity anvil "$ANVIL_BIN" "be09-anvil-$run_id" "$$"
  wait_rpc "$RPC_URL"
  owned anvil "$RPC_PORT"
  (cd "$ROOT" && "$NODE_BIN" "$ROOT/scripts/deploy_local.mjs" --rpc "$RPC_URL" --output "$manifest") 2>&1 | tee "$RUN_DIR/logs/deploy.log"
  owned anvil "$RPC_PORT"
  (cd "$ROOT" && "$NODE_BIN" "$ROOT/scripts/check_roles.mjs" --rpc "$RPC_URL" --manifest "$manifest") 2>&1 | tee "$RUN_DIR/logs/role-check.log"
  owned anvil "$RPC_PORT"
  (cd "$ROOT" && "$NODE_BIN" --import tsx "$ROOT/scripts/be09-seed.mjs" --rpc "$RPC_URL" --manifest "$manifest" --output "$seed_report") 2>&1 | tee "$RUN_DIR/logs/governance-seed.log"
  owned anvil "$RPC_PORT"
  owned postgres 55432
  BE09_SCOPE="$SCOPE" BE09_DATABASE_URL="$db_url" "$NODE_BIN" "$ROOT/scripts/be09-register.mjs" --manifest "$manifest" --runtime "$RUN_DIR" \
    --rpc-url "$RPC_URL" --deployment-name "$deployment_name" --seed-report "$seed_report" 2>&1 | tee "$RUN_DIR/logs/register.log"
  "$NODE_BIN" --input-type=module -e '
    import {readFileSync,writeFileSync} from "node:fs";
    const p=process.argv[1],r=JSON.parse(readFileSync(p,"utf8"));
    if(!r.deploymentName.startsWith("be09-local-")||!/^[0-9]+$/.test(r.proposalId))process.exit(1);
    r.runId=process.argv[2];writeFileSync(p,JSON.stringify(r,null,2)+"\n",{flag:"w",mode:0o600});' "$RUN_DIR/runtime.json" "$run_id"
  metadata seal

  start_service 'Indexer worker' "$RUN_DIR/pids/worker.pid" "$RUN_DIR/logs/worker.log" \
    "$NODE_BIN" "--env-file=$RUN_DIR/worker.env" --import tsx "$ROOT/indexer/cli.ts" --config "$RUN_DIR/indexer-config.json" --worker
  start_service 'HTTP API' "$RUN_DIR/pids/api.pid" "$RUN_DIR/logs/api.log" \
    "$NODE_BIN" "--env-file=$RUN_DIR/runtime.env" --import tsx "$ROOT/indexer/api/main.ts"
  owned postgres 55432
  if ! wait_api_ready 'http://127.0.0.1:3300' "$deployment_name"; then
    local diagnostic_dir="$RUN_DIR/reports/readiness-timeout"
    mkdir -m 700 "$diagnostic_dir"
    for service in worker api; do
      if [[ -f "$RUN_DIR/logs/$service.log" ]]; then cp -- "$RUN_DIR/logs/$service.log" "$diagnostic_dir/$service.log"; fi
    done
    if ! (owned postgres 55432 && metadata validate >/dev/null && cd "$ROOT" && env -u BE09_DIAGNOSTIC_DATABASE_URL "$NODE_BIN" "$ROOT/scripts/be09-diagnose.mjs" "$RUN_DIR" "$diagnostic_dir/diagnostic.json"); then
      note "Readiness diagnostic could not complete; logs retained in $diagnostic_dir"
    fi
    note "Readiness timeout evidence retained in $diagnostic_dir"
    return 1
  fi
  start_service 'Frontend Vite' "$RUN_DIR/pids/frontend.pid" "$RUN_DIR/logs/frontend.log" \
    "$NODE_BIN" "--env-file=$RUN_DIR/frontend.env" "$ROOT/frontend/node_modules/vite/bin/vite.js" "$ROOT/frontend" --host 127.0.0.1 --port 5173 --strictPort
  wait_http 'http://127.0.0.1:5173/' 200 'Frontend Vite'

  local proposal_id postgres_pid
  proposal_id="$("$NODE_BIN" --input-type=module -e 'import{readFileSync}from"node:fs";process.stdout.write(JSON.parse(readFileSync(process.argv[1],"utf8")).proposalId)' "$RUN_DIR/runtime.json")"
  postgres_pid="$(cat "$RUN_DIR/pids/postgres.pid")"
  cat > "$RUN_DIR/reports/up-report.md" <<EOF
# BE09 local services started

- Revision: $source_revision
- Script checksums: $RUN_DIR/reports/source-provenance.json
- Run ID: $run_id
- Deployment name: $deployment_name
- Real proposal ID: $proposal_id
- Anvil RPC: $RPC_URL
- API: http://127.0.0.1:3300
- Frontend: http://127.0.0.1:5173
- Access: all services bind to loopback and are intended for this machine only; other devices cannot connect directly.
- PostgreSQL: 127.0.0.1:55432 (isolated data: $pgdata)
- PIDs: PostgreSQL $postgres_pid; Anvil $(cat "$RUN_DIR/pids/anvil.pid"); worker $(cat "$RUN_DIR/pids/worker.pid"); API $(cat "$RUN_DIR/pids/api.pid"); frontend $(cat "$RUN_DIR/pids/frontend.pid")
- Manifest: $manifest
- Runtime directory: $RUN_DIR
- Logs: $RUN_DIR/logs/
- Stop command: bash scripts/be09-local.sh down

Runtime verification remains pending until verify is run.
This local run does not attest CI, testnet, browser/wallet E2E, or separate TV3/TV4 review.
EOF
  chmod 600 "$RUN_DIR/reports/up-report.md"
  note "BE09 local services running: RPC $RPC_URL | API http://127.0.0.1:3300 | Frontend http://127.0.0.1:5173"
  note "Deployment: $deployment_name; PIDs: PostgreSQL $postgres_pid, Anvil $(cat "$RUN_DIR/pids/anvil.pid"), worker $(cat "$RUN_DIR/pids/worker.pid"), API $(cat "$RUN_DIR/pids/api.pid"), frontend $(cat "$RUN_DIR/pids/frontend.pid")"
  note "Manifest: $manifest"
  note "Report: $RUN_DIR/reports/up-report.md"
  note "Logs: $RUN_DIR/logs/"
  UP_OK=1
  trap - EXIT
}

check_service_health() {
  if metadata live >/dev/null; then return 0; fi
  # Retain the existing bounded worker-restart grace, but never grant it to a
  # changed source/allocation or an unowned RPC/API/PG/frontend listener.
  metadata validate >/dev/null || return 1
  owned anvil "$RPC_PORT" || return 1
  owned postgres 55432 || return 1
  owned api 3300 || return 1
  owned frontend 5173 || return 1
  sleep 5
  metadata live >/dev/null
}

# Keep the caller (including a Windows wsl.exe invocation) alive for the demo.
# nohup alone cannot keep the WSL VM alive after its last foreground session exits.
command_serve() {
  command_up
  export BE09_RUN_DIR="$RUN_DIR"
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'status=$?; trap - EXIT INT TERM; stop_owned_services "$RUN_DIR" || true; exit "$status"' EXIT
  note "Foreground session active for $RUN_DIR. Keep this terminal open."
  note 'Use a second terminal for status/verify. Ctrl+C stops this run and preserves data/logs.'
  while true; do
    sleep 5 &
    wait "$!" || true
    check_service_health || {
      fail 'A service lost authenticated process/listener ownership; stopping this run.'
      return 1
    }
  done
}

command_status() {
  [[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || fail 'Missing node; configure BE09_NODE_DIR or PATH.'
  resolve_run_dir
  note "BE09 run directory: $RUN_DIR"
  local key label
  for key in anvil worker api frontend postgres; do
    case "$key" in anvil) label=Anvil;; worker) label='Indexer worker';; api) label='HTTP API';; frontend) label='Frontend Vite';; postgres) label='PostgreSQL cluster';; esac
    if owned "$key" 2>/dev/null; then note "$label: LIVE (PID $(cat "$RUN_DIR/pids/$key.pid"))"
    else note "$label: DOWN"; fi
  done
  # Never probe a stopped/partial run or any unowned member of the tuple.
  RPC_URL="$(metadata rpc-url)" || return 1
  metadata live >/dev/null || return 1
  note "URLs: RPC $RPC_URL | API http://127.0.0.1:3300 | Frontend http://127.0.0.1:5173"
  metadata probe
}

command_verify() {
  resolve_run_dir
  [[ -f "$RUN_DIR/runtime.json" ]] || fail 'Runtime metadata is missing; up did not finish.'
  check_source_and_toolchain
  metadata live >/dev/null
  local report_dir
  report_dir="$RUN_DIR/reports/verify-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
  mkdir -m 700 "$report_dir"
  note "Verifying run: $RUN_DIR"
  note "Report directory: $report_dir"
  if (cd "$ROOT" && BE09_STATE_ROOT="$STATE_ROOT" BE09_SCOPE="$SCOPE" "$NODE_BIN" --import tsx "$ROOT/scripts/be09-verify.mjs" --runtime "$RUN_DIR" --report "$report_dir"); then
    note "Verification report: $report_dir/report.md"
  else
    note "Verification did not PASS; retained report: $report_dir/report.md when generated."
    return 1
  fi
}
command_down() {
  [[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || fail 'Missing node; configure BE09_NODE_DIR or PATH.'
  resolve_run_dir
  stop_owned_services "$RUN_DIR"
  note "Stopped only processes owned by this run. Database, manifest and logs remain at $RUN_DIR."
}

ensure_external_state
configure_toolchain
case "${1:-}" in
  preflight) [[ $# = 1 ]] || { usage; exit 2; }; check_source_and_toolchain ;;
  up) [[ $# = 1 ]] || { usage; exit 2; }; command_up ;;
  serve) [[ $# = 1 ]] || { usage; exit 2; }; command_serve ;;
  verify) [[ $# = 1 ]] || { usage; exit 2; }; command_verify ;;
  status) [[ $# = 1 ]] || { usage; exit 2; }; command_status ;;
  down) [[ $# = 1 ]] || { usage; exit 2; }; command_down ;;
  -h|--help|help|'') usage ;;
  *) usage >&2; exit 2 ;;
esac
