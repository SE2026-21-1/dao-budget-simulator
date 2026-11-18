#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# Manual server-side operations only. Never deploy contracts, migrate during an
# application rollout, remove PostgreSQL volumes, or accept mutable image tags.
ROOT=${DAO_ROOT:-/srv/dao}
SHARED=${DEPLOY_SHARED_DIR:-$ROOT/shared}
PROJECT=${DAO_COMPOSE_PROJECT:-dao}
SELF=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STATE="$SELF/state.mjs"
fail() { printf 'Deployment refused: %s\n' "$*" >&2; exit 1; }
for command in node docker flock timeout realpath stat cmp id date; do command -v "$command" >/dev/null || fail "Required command missing: $command"; done
[[ "$ROOT" = /* && "$SHARED" = /* ]] || fail 'DAO_ROOT and DEPLOY_SHARED_DIR must be absolute paths.'
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid Compose project name.'
mkdir -p -- "$ROOT"
exec 8>"$ROOT/operation.lock"
flock -n 8 || fail 'Another server deployment or migration is running.'
MODE=${1:-}; shift || true
[[ "$MODE" = deploy || "$MODE" = rollback || "$MODE" = migrate ]] || fail 'Usage: deploy.sh deploy RELEASE_DIR SHA | rollback | migrate RELEASE_DIR SHA --approve --backup FILE --backup-sha256 HASH [--baseline LAST.sql --schema-fingerprint HASH]'
for file in runtime.env indexer.json frontend.json github.env; do [[ -f "$SHARED/$file" ]] || fail "Missing server-managed shared/$file"; done
for file in runtime.env github.env; do
  mode=$(stat -c '%a' "$SHARED/$file")
  [[ "$mode" = 600 || "$mode" = 400 ]] || fail "shared/$file must have mode 0600 or 0400."
done
# A credential file is data, never shell code. No sourcing of runtime.env.
GH_TOKEN=
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" = \#* ]] && continue
  [[ "$line" = GH_TOKEN=* ]] || fail 'github.env must contain only GH_TOKEN=VALUE.'
  GH_TOKEN=${line#GH_TOKEN=}
done < "$SHARED/github.env"
[[ -n "$GH_TOKEN" && "$GH_TOKEN" != *[[:space:]]* ]] || fail 'github.env needs a nonempty raw GH_TOKEN value.'
export GH_TOKEN
value() { node "$STATE" value "$ROOT" "$1" "$2"; }
if [[ "$MODE" = rollback ]]; then
  [[ $# = 0 && -f "$ROOT/previous/manifest.json" && -f "$ROOT/current/manifest.json" ]] || fail 'Rollback requires recorded current and previous releases and takes no arguments.'
  RELEASE=$(value previous releaseDir); SHA=$(value previous sha)
  [[ "$(value previous migrationSet)" = "$(value current migrationSet)" && "$(value previous schemaFingerprint)" = "$(value current schemaFingerprint)" ]] || fail 'Rollback schema safety differs. Operator migration/recovery is required; no image rollback performed.'
else
  [[ $# -ge 2 ]] || fail 'Release directory and full commit SHA are required.'
  RELEASE=$1; SHA=$2; shift 2
fi
[[ "$SHA" =~ ^[a-f0-9]{40}$ && "$RELEASE" = /* ]] || fail 'Use an absolute release directory and full lowercase commit SHA.'
RELEASE=$(realpath -e -- "$RELEASE")
[[ "$RELEASE" != *$'\n'* ]] || fail 'Invalid release directory.'
[[ -f "$RELEASE/deploy/compose.yml" && -f "$RELEASE/scripts/cd/release.mjs" && -f "$RELEASE/manifest.json" ]] || fail 'Incomplete release directory.'
verify_release() { timeout 120 node "$1/scripts/cd/release.mjs" verify --sha "$2" --manifest "$1/manifest.json"; }
verify_release "$RELEASE" "$SHA"
if [[ "$MODE" = rollback ]]; then cmp -s "$ROOT/previous/manifest.json" "$RELEASE/manifest.json" || fail 'Previous release directory no longer matches the recorded running manifest.'; fi
compose() {
  # The manifest-generated file overrides runtime image variables. Clearing the
  # ambient environment prevents a shell image tag/config from taking priority.
  timeout "${COMPOSE_DEADLINE:-900}" env -i PATH="$PATH" HOME="${HOME:-/root}" DEPLOY_SHARED_DIR="$SHARED" \
    docker compose --project-name "$PROJECT" --env-file "$SHARED/runtime.env" --env-file "$RELEASE/release.env" -f "$RELEASE/deploy/compose.yml" "$@"
}
compose config --quiet
# Pull every application digest before any running service is changed.
timeout 20 docker version --format '{{.Server.Version}}' >/dev/null
COMPOSE_DEADLINE=300 compose pull frontend api indexer
if [[ "$MODE" = migrate ]]; then
  APPROVE=; BACKUP=; HASH=; BASELINE=; SCHEMA_APPROVAL=
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --approve) APPROVE=1; shift ;;
      --backup) [[ $# -ge 2 ]] || fail 'Missing backup path.'; BACKUP=$2; shift 2 ;;
      --backup-sha256) [[ $# -ge 2 ]] || fail 'Missing backup hash.'; HASH=$2; shift 2 ;;
      --baseline) [[ $# -ge 2 ]] || fail 'Missing baseline filename.'; BASELINE=$2; shift 2 ;;
      --schema-fingerprint) [[ $# -ge 2 ]] || fail 'Missing approved schema fingerprint.'; SCHEMA_APPROVAL=$2; shift 2 ;;
      *) fail 'Unknown migration option.' ;;
    esac
  done
  [[ "$APPROVE" = 1 && "$BACKUP" = /* && -s "$BACKUP" && "$HASH" =~ ^[a-f0-9]{64}$ ]] || fail 'Explicit --approve and an existing absolute --backup with --backup-sha256 are required.'
  [[ -n "$BASELINE" || -z "$SCHEMA_APPROVAL" ]] || fail '--schema-fingerprint requires --baseline.'
  BACKUP=$(realpath -e -- "$BACKUP")
  args=(--approve --manifest /run/release/manifest.json --backup /run/backup/database.dump --backup-sha256 "$HASH")
  [[ -z "$BASELINE" ]] || args+=(--baseline "$BASELINE" --schema-fingerprint "$SCHEMA_APPROVAL")
  compose run --rm --no-deps -T --user "$(id -u):$(id -g)" -v "$RELEASE:/run/release:ro" -v "$BACKUP:/run/backup/database.dump:ro" --entrypoint node indexer /app/deploy/migrate.mjs "${args[@]}"
  exit $?
fi
[[ $# = 0 ]] || fail 'Unexpected deployment arguments.'
# Image identity must agree with both the configured digest and Docker's local
# content ID. Mere healthy state or a Compose label is not release identity.
identities() {
  local manifest=$1 allow_stopped=${2:-no} service reference id expected actual
  for service in frontend api indexer; do
    reference=$(node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1])).images[process.argv[2]])' "$manifest" "$service") || return 1
    id=$(compose ps --all --quiet "$service") || return 1
    [[ -n "$id" && "$id" != *$'\n'* ]] || return 1
    expected=$(docker image inspect --format '{{.Id}}' "$reference") || return 1
    actual=$(docker inspect --format '{{.State.Running}} {{.Config.Image}} {{.Image}}' "$id") || return 1
    [[ "$actual" = "true $reference $expected" || ( "$allow_stopped" = yes && "$actual" = "false $reference $expected" ) ]] || return 1
  done
}
if [[ -f "$ROOT/current/manifest.json" ]]; then
  allow_stopped=no
  [[ "$MODE" != rollback ]] || allow_stopped=yes
  identities "$ROOT/current/manifest.json" "$allow_stopped" || fail 'Existing service image identities differ from recorded current release.'
else
  existing=$(compose ps --all --quiet frontend api indexer)
  [[ -z "$existing" ]] || fail 'Application containers exist without a recorded current manifest. Explicit operator adoption/recovery is required; refusing first-deploy replacement.'
fi
session_pid=; IN=; OUT=; CHANGED=; COMPLETE=
close_session() {
  if [[ -n "$IN" ]]; then printf 'RELEASE\n' >&"$IN" 2>/dev/null || true; exec {IN}>&-; fi
  if [[ -n "$session_pid" ]]; then wait "$session_pid" 2>/dev/null || true; fi
}
request() {
  local command=$1 expected=$2 line
  printf '%s\n' "$command" >&"$IN" || return 1
  IFS= read -r -t 180 -u "$OUT" line || return 1
  [[ "$line" = "$expected" ]]
}
recover() {
  local old_release old_sha old_schema old_set new_set since
  [[ -f "$ROOT/current/manifest.json" ]] || return 1
  old_release=$(value current releaseDir) || return 1
  old_sha=$(value current sha) || return 1
  old_schema=$(value current schemaFingerprint) || return 1
  old_set=$(value current migrationSet) || return 1
  new_set=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).migrationSet)' "$RELEASE/manifest.json") || return 1
  [[ "$old_set" = "$new_set" && "$old_schema" = "$SCHEMA" ]] || return 1
  request SCHEMA "SCHEMA $old_schema" || return 1
  verify_release "$old_release" "$old_sha" || return 1
  cmp -s "$ROOT/current/manifest.json" "$old_release/manifest.json" || return 1
  RELEASE=$old_release
  compose config --quiet || return 1
  COMPOSE_DEADLINE=300 compose pull frontend api indexer || return 1
  since=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  COMPOSE_DEADLINE=180 compose up -d --no-deps --pull never api indexer frontend || return 1
  identities "$ROOT/current/manifest.json" || return 1
  request "SMOKE $since" 'SMOKE OK' || return 1
  printf 'Previous application images restored and smoke passed; current manifest was not advanced.\n' >&2
}
finish() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "$CHANGED" && -z "$COMPLETE" ]]; then
    printf 'Application update failed; evaluating schema-safe image rollback.\n' >&2
    if ! recover; then
      printf 'Automatic rollback is unsafe or failed. Stopping application services; PostgreSQL and its volume are retained. Operator recovery required.\n' >&2
      COMPOSE_DEADLINE=60 compose stop frontend api indexer >/dev/null 2>&1 || true
    fi
    code=1
  fi
  close_session
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
coproc SESSION { compose run --rm --no-deps -T --user "$(id -u):$(id -g)" -v "$RELEASE:/run/release:ro" --entrypoint node indexer /app/deploy/control.mjs --manifest /run/release/manifest.json; }
session_pid=${SESSION_PID:-}
exec {IN}>&"${SESSION[1]}"
exec {OUT}<&"${SESSION[0]}"
IFS= read -r -t 90 -u "$OUT" ready || fail 'Database advisory lock or release preflight failed.'
[[ "$ready" =~ ^READY\ ([a-f0-9]{64})$ ]] || fail 'Database/configuration/RPC/schema preflight did not approve this release.'
SCHEMA=${BASH_REMATCH[1]}
if [[ "$MODE" = rollback ]]; then [[ "$SCHEMA" = "$(value previous schemaFingerprint)" ]] || fail 'Live database schema differs from the recorded rollback schema.'; fi
if [[ -f "$ROOT/current/manifest.json" ]]; then node "$STATE" previous "$ROOT"; fi
since=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
CHANGED=1
COMPOSE_DEADLINE=180 compose up -d --no-deps --pull never api indexer frontend
identities "$RELEASE/manifest.json" || fail 'Updated service image identity verification failed.'
request "SMOKE $since" 'SMOKE OK' || fail 'Frontend/API/worker/database smoke did not pass.'
request SCHEMA "SCHEMA $SCHEMA" || fail 'Schema changed during rollout; current manifest was not advanced.'
# Every check has passed. Do not interrupt the tiny atomic state cutover.
trap '' INT TERM
node "$STATE" activate "$ROOT" "$RELEASE" "$SCHEMA"
COMPLETE=1
printf 'Release %s activated after image, schema and end-to-end smoke verification.\n' "$SHA"
