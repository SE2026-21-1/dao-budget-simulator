#!/usr/bin/env bash
# Own both disposable databases; never use the caller's DATABASE_URL or chain.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# != 2 || "$1" != --output || -z "$2" ]]; then
  echo 'Usage: bash scripts/check_governance_database.sh --output <evidence.json>' >&2
  exit 1
fi
output="$2"
image='postgres:18.4'
run_root=''
container_id=''
cleanup() {
  local status=$?
  trap - EXIT
  trap '' INT TERM
  if [[ -n "$run_root" && -s "$run_root/container.cid" ]]; then
    container_id="$(<"$run_root/container.cid")"
  fi
  if [[ -n "$container_id" ]]; then
    if (( status != 0 )); then docker logs "$container_id" >&2 || true; fi
    if ! docker rm --force --volumes "$container_id" >/dev/null; then
      echo "Could not remove owned governance container/volume: $container_id" >&2
      status=1
    else
      echo 'Removed owned governance PostgreSQL container and anonymous volume.'
    fi
  fi
  if [[ -n "$run_root" ]] && ! rm -r -- "$run_root"; then
    echo "Could not remove governance runner directory: $run_root" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for executable in docker node anvil forge; do
  command -v "$executable" >/dev/null || { echo "Required tool unavailable: $executable" >&2; exit 1; }
done
[[ -x "$repo_root/node_modules/.bin/tsx" ]] || { echo 'Run npm ci and forge build first.' >&2; exit 1; }
run_root="$(mktemp -d "${TMPDIR:-/tmp}/dao-governance-docker.XXXXXXXX")"
password="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(24).toString('hex'));")"
docker create --cidfile "$run_root/container.cid" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=tv4_smoke --env POSTGRES_DB=tv4_smoke_live \
  --env "POSTGRES_PASSWORD=$password" \
  --health-cmd 'pg_isready -q -h 127.0.0.1 -U tv4_smoke -d tv4_smoke_live' \
  --health-interval 1s --health-timeout 3s --health-retries 60 \
  "$image" >/dev/null
container_id="$(<"$run_root/container.cid")"
echo "Governance temporary PostgreSQL container: $container_id ($image)"
docker image inspect "$image" --format 'PostgreSQL image ID: {{.Id}}'
docker start "$container_id" >/dev/null
ready=false
for (( attempt=0; attempt<90; attempt++ )); do
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
  if [[ "$health" == healthy ]]; then ready=true; break; fi
  if [[ "$health" == unhealthy || "$(docker inspect --format '{{.State.Running}}' "$container_id")" != true ]]; then
    echo 'Isolated governance PostgreSQL failed to become healthy.' >&2
    exit 1
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Timed out waiting for isolated governance PostgreSQL.' >&2; exit 1; }
binding="$(docker port "$container_id" 5432/tcp)"
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || { echo 'Refusing non-loopback PostgreSQL binding.' >&2; exit 1; }
port="${BASH_REMATCH[1]}"
echo "Governance PostgreSQL binding: 127.0.0.1:$port"
docker exec "$container_id" psql -X --no-password --username=tv4_smoke --dbname=tv4_smoke_live \
  --set=ON_ERROR_STOP=1 --command='SELECT version();'
docker exec "$container_id" createdb --username=tv4_smoke tv4_smoke_rebuild
(
  cd "$repo_root"
  unset DATABASE_URL RPC_URL
  export TV4_SMOKE_ISOLATED=1
  export TV4_SMOKE_DATABASE_URL="postgresql://tv4_smoke:$password@127.0.0.1:$port/tv4_smoke_live"
  export TV4_SMOKE_REBUILD_DATABASE_URL="postgresql://tv4_smoke:$password@127.0.0.1:$port/tv4_smoke_rebuild"
  node --import tsx scripts/smoke_governance.mjs --output "$output" --database
)
echo 'PASS: real governance chain to PostgreSQL, explicit restart and same-H raw replay. Not projection/API/reorg acceptance.'
