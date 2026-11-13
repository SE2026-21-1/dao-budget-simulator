#!/usr/bin/env bash
# Each invocation owns one new PostgreSQL container and its anonymous volume.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode='db'
if (( $# )); then
  if [[ $# != 3 || "$1" != --live || "$2" != --output || -z "$3" ]]; then
    echo 'Usage: bash scripts/check_be04_database.sh [--live --output <report.json>]' >&2
    exit 1
  fi
  mode='live'
  output="$3"
fi
command -v docker >/dev/null
command -v node >/dev/null
[[ -x "$repo_root/node_modules/.bin/tsx" ]]
run_root="$(mktemp -d "${TMPDIR:-/tmp}/dao-be04-docker.XXXXXXXX")"
cleanup() {
  local status=$?
  trap - EXIT
  trap '' INT TERM
  if [[ -s "$run_root/container.cid" ]]; then
    local cid
    cid="$(<"$run_root/container.cid")"
    if (( status )); then docker logs "$cid" >&2 || true; fi
    if ! docker rm --force --volumes "$cid" >/dev/null; then status=1; fi
  fi
  if ! rm -r -- "$run_root"; then status=1; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
password="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(24).toString('hex'))")"
docker create --cidfile "$run_root/container.cid" --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=be04_test --env POSTGRES_DB=be04_test --env "POSTGRES_PASSWORD=$password" \
  --health-cmd 'pg_isready -q -h 127.0.0.1 -U be04_test -d be04_test' \
  --health-interval 1s --health-timeout 3s --health-retries 60 postgres:18.4 >/dev/null
cid="$(<"$run_root/container.cid")"
docker start "$cid" >/dev/null
ready=false
for (( attempt=0; attempt<90; attempt++ )); do
  health="$(docker inspect --format '{{.State.Health.Status}}' "$cid")"
  if [[ "$health" == healthy ]]; then ready=true; break; fi
  if [[ "$health" == unhealthy || "$(docker inspect --format '{{.State.Running}}' "$cid")" != true ]]; then break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Isolated BE04 PostgreSQL did not become healthy.' >&2; exit 1; }
binding="$(docker port "$cid" 5432/tcp)"
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Refusing non-loopback PostgreSQL binding.' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
cd "$repo_root"
unset DATABASE_URL
if [[ "$mode" == live ]]; then
  docker exec "$cid" createdb -U be04_test be04_live
  export BE04_LIVE_ISOLATED=1
  export BE04_LIVE_DATABASE_URL="postgresql://be04_test:$password@127.0.0.1:$port/be04_live"
  node --import tsx scripts/check_be04_live.mjs --output "$output"
else
  export BE04_TEST_ISOLATED=1
  export BE04_TEST_DATABASE_URL="postgresql://be04_test:$password@127.0.0.1:$port/be04_test"
  node --import tsx --test tests/indexer/projection-storage.test.ts
fi
