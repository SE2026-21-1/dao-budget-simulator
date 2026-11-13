#!/usr/bin/env bash
# Run BE01 SQL only in a new Docker container; never connect to a host database.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image='postgres:18.4'
container_id=''

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$container_id" ]]; then
    if (( status != 0 )); then
      docker logs "$container_id" >&2 || true
    fi
    if ! docker rm --force --volumes "$container_id" >/dev/null; then
      echo "Could not remove owned BE01 container: $container_id" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null || { echo 'Docker is required for the isolated BE01 database check.' >&2; exit 1; }
container_id="$(docker run --detach --network none \
  --env POSTGRES_USER=be01_test --env POSTGRES_DB=be01_test \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --mount "type=bind,source=$repo_root/database,target=/checks,readonly" \
  --health-cmd 'pg_isready -q -h 127.0.0.1 -U be01_test -d be01_test' \
  --health-interval 1s --health-timeout 3s --health-retries 60 \
  "$image")"
echo "BE01 temporary container: $container_id ($image; no network or published ports)"
docker image inspect "$image" --format 'PostgreSQL image ID: {{.Id}}'

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
  echo 'Timed out waiting for isolated PostgreSQL.' >&2
  exit 1
fi

psql_args=(-X --no-password --username=be01_test --dbname=be01_test --set=ON_ERROR_STOP=1)
docker exec "$container_id" psql "${psql_args[@]}" --command='SELECT version();'
docker exec "$container_id" psql "${psql_args[@]}" --file=/checks/migrations/001_initial.sql
docker exec "$container_id" psql "${psql_args[@]}" --file=/checks/tests/001_initial_checks.sql
echo 'PASS: BE01 migration and database constraints on isolated PostgreSQL.'
