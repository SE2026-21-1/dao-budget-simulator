#!/usr/bin/env bash
# Run host-side BE02 storage/CLI tests against a new, owned Docker database only.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image='postgres:18.4'
run_root=''
container_id=''

cleanup() {
  local status=$?
  trap - EXIT
  trap '' INT TERM
  # The cidfile also covers interruption after Docker creates the container but
  # before the command returns. Never discover/delete containers by a broad name.
  if [[ -n "$run_root" && -s "$run_root/container.cid" ]]; then
    container_id="$(<"$run_root/container.cid")"
  fi
  if [[ -n "$container_id" ]]; then
    if (( status != 0 )); then
      docker logs "$container_id" >&2 || true
    fi
    if ! docker rm --force --volumes "$container_id" >/dev/null; then
      echo "Could not remove owned BE02 container and volumes: $container_id" >&2
      status=1
    else
      echo 'Removed owned BE02 container and anonymous database volume.'
    fi
  fi
  if [[ -n "$run_root" ]] && ! rm -r -- "$run_root"; then
    echo "Could not remove BE02 runner temporary directory: $run_root" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null || { echo 'Docker is required for the isolated BE02 database check.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 is required for the BE02 database check.' >&2; exit 1; }
[[ -x "$repo_root/node_modules/.bin/tsx" ]] || { echo 'Run npm ci before running the BE02 database tests.' >&2; exit 1; }
run_root="$(mktemp -d "${TMPDIR:-/tmp}/dao-be02-docker.XXXXXXXX")"
password="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(24).toString('hex'));")"
# Docker atomically allocates a host port; there is no free-port probe/race.
# No host bind mounts or reused/named volumes: rm --volumes owns all DB storage.
docker create --cidfile "$run_root/container.cid" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=be02_test --env POSTGRES_DB=be02_test \
  --env "POSTGRES_PASSWORD=$password" \
  --health-cmd 'pg_isready -q -h 127.0.0.1 -U be02_test -d be02_test' \
  --health-interval 1s --health-timeout 3s --health-retries 60 \
  "$image" >/dev/null
container_id="$(<"$run_root/container.cid")"
echo "BE02 temporary container: $container_id ($image; dynamic loopback port only)"
docker image inspect "$image" --format 'PostgreSQL image ID: {{.Id}}'
docker start "$container_id" >/dev/null

ready=false
for (( attempt=0; attempt<90; attempt++ )); do
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
  if [[ "$health" == healthy ]]; then
    ready=true
    break
  fi
  if [[ "$health" == unhealthy || "$(docker inspect --format '{{.State.Running}}' "$container_id")" != true ]]; then
    echo 'Isolated PostgreSQL failed to become healthy.' >&2
    exit 1
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'Timed out waiting for isolated PostgreSQL (90 readiness attempts).' >&2
  exit 1
fi

binding="$(docker port "$container_id" 5432/tcp)"
if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
  echo 'Refusing a PostgreSQL binding other than one IPv4 loopback port.' >&2
  exit 1
fi
port="${BASH_REMATCH[1]}"
echo "BE02 PostgreSQL binding: 127.0.0.1:$port"
docker exec "$container_id" psql -X --no-password --username=be02_test --dbname=be02_test \
  --set=ON_ERROR_STOP=1 --command='SELECT version();'
(
  cd "$repo_root"
  unset DATABASE_URL
  export BE02_TEST_DATABASE_URL="postgresql://be02_test:$password@127.0.0.1:$port/be02_test"
  export BE02_TEST_ISOLATED=1
  # Keep both the test RPC server and its child CLI on the host loopback.
  node --import tsx --test tests/indexer/storage.test.ts
)
echo 'PASS: BE01 migration/constraints and BE02 storage/CLI on isolated real PostgreSQL.'
