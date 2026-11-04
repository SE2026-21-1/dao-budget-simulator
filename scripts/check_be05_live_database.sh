#!/usr/bin/env bash
# Full local-chain integration: fresh unforked Anvil, locked contracts, isolated PostgreSQL 18.4 and API.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# != 2 || "$1" != --output || -z "$2" ]]; then
  echo 'Usage: bash scripts/check_be05_live_database.sh --output <report.json>' >&2
  exit 1
fi
output="$2"
command -v docker >/dev/null || { echo 'Docker is required for the standard BE05 live database wrapper.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 is required.' >&2; exit 1; }
command -v anvil >/dev/null || { echo 'Anvil 1.8.5 is required.' >&2; exit 1; }
command -v forge >/dev/null || { echo 'Forge 1.8.5 is required.' >&2; exit 1; }
[[ -x "$repo_root/node_modules/.bin/tsx" ]] || { echo 'Run npm ci first.' >&2; exit 1; }
run_root="$(mktemp -d "${TMPDIR:-/tmp}/dao-be05-live.XXXXXXXX")"
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
for ((attempt=0; attempt<90; attempt++)); do
  health="$(docker inspect --format '{{.State.Health.Status}}' "$cid")"
  if [[ "$health" == healthy ]]; then ready=true; break; fi
  if [[ "$health" == unhealthy || "$(docker inspect --format '{{.State.Running}}' "$cid")" != true ]]; then break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Isolated PostgreSQL 18.4 did not become healthy.' >&2; exit 1; }
binding="$(docker port "$cid" 5432/tcp)"
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Refusing non-loopback PostgreSQL binding.' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
docker exec "$cid" createdb -U be04_test be04_live
unset DATABASE_URL PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
export BE04_LIVE_ISOLATED=1
export BE04_LIVE_DATABASE_URL="postgresql://be04_test:$password@127.0.0.1:$port/be04_live"
mkdir -p "$(dirname "$output")"
cd "$repo_root"
node --import tsx scripts/check_be04_live.mjs --output "$output" --api
