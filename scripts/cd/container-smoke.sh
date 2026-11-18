#!/usr/bin/env bash
set -Eeuo pipefail
# Requires Docker Compose >=2.24.4 (!override), Node 24, npm ci, forge and
# initialized Foundry submodules. No caller database/RPC/config is ever used.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
unset DATABASE_URL RPC_URL NODE_OPTIONS NODE_PATH COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
export LC_ALL=C
state=$(mktemp -d "${TMPDIR:-/tmp}/dao-container-smoke.XXXXXXXX")
nonce=$(basename "$state" | tr '[:upper:].' '[:lower:]-')
project="tv4-${nonce}"
prebuilt=${IMAGE_TAG:+1}
export IMAGE_TAG=${IMAGE_TAG:-$nonce}
[[ $IMAGE_TAG =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { echo 'Invalid IMAGE_TAG' >&2; exit 1; }
export POSTGRES_USER=dao_smoke POSTGRES_DB=tv4_container_smoke
export POSTGRES_PASSWORD=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
export API_CURSOR_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
export CHAIN_ID=31337 DEPLOYMENT_ID=container-smoke RPC_URL=http://anvil:8545 DEPLOY_SHARED_DIR="$state"
export API_CORS_ORIGINS= FRONTEND_PORT=8080
export FRONTEND_IMAGE="dao-frontend:$IMAGE_TAG" API_IMAGE="dao-api:$IMAGE_TAG" INDEXER_IMAGE="dao-indexer:$IMAGE_TAG"
# An explicit empty env file prevents automatic repository .env loading.
: > "$state/smoke.env"
compose=(docker compose --env-file "$state/smoke.env" --project-name "$project" -f "$root/deploy/compose.smoke.yml")
variants=()
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if (( code != 0 )); then "${compose[@]}" logs --no-color --tail 100 >&2 || true; fi
  docker rm -f "$project-missing" "$project-fixture" >/dev/null 2>&1 || true
  "${compose[@]}" down --volumes --remove-orphans --timeout 15 || code=1
  if ((${#variants[@]})); then docker image rm "${variants[@]}" >/dev/null || code=1; fi
  rm -rf -- "$state"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Directories/files contain only disposable data; allow the container's nonroot
# runtime to traverse the bind-mounted directory, but keep deployment/env secrets private.
chmod 755 "$state"
if [[ -z $prebuilt ]]; then "${compose[@]}" build frontend api indexer; fi
for image in "$FRONTEND_IMAGE" "$API_IMAGE" "$INDEXER_IMAGE"; do docker image inspect "$image" >/dev/null; done
# Genuine caller-owned unforked Anvil. Only Anvil is loopback-published; PostgreSQL
# is never exposed, and psql executes exclusively in this unique Compose project.
"${compose[@]}" up -d --wait --wait-timeout 120 postgres anvil
anvil_address=$("${compose[@]}" port anvil 8545)
[[ $anvil_address =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected Anvil bind' >&2; exit 1; }
forge build
node scripts/deploy_local.mjs --rpc "http://$anvil_address" --output "$state/deployment.json"
node --import tsx scripts/cd/container-smoke-prepare.mjs "$state"
"${compose[@]}" exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$state/before.dump"
backup_hash=$(sha256sum "$state/before.dump" | cut -d ' ' -f1)
"${compose[@]}" run --rm --no-deps -T -v "$state:/run/release:ro" --entrypoint node indexer /app/deploy/migrate.mjs \
  --approve --manifest /run/release/manifest.json --backup /run/release/before.dump --backup-sha256 "$backup_hash"
# Reapplying a fully tracked migration set must preserve schema and existing data.
"${compose[@]}" run --rm --no-deps -T -v "$state:/run/release:ro" --entrypoint node indexer /app/deploy/migrate.mjs \
  --approve --manifest /run/release/manifest.json --backup /run/release/before.dump --backup-sha256 "$backup_hash"
"${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$state/metadata.sql"
"${compose[@]}" run --rm --no-deps -T -v "$state:/run/release:ro" --entrypoint node indexer /app/deploy/preflight.mjs --manifest /run/release/manifest.json
# Startup must fail without a mounted public config and must reject fixture mode.
negative_status=0
timeout 15 docker run --rm --name "$project-missing" --network none "$FRONTEND_IMAGE" > "$state/missing-config.log" 2>&1 || negative_status=$?
if [[ $negative_status != 1 ]] || ! grep -q 'ENOENT' "$state/missing-config.log"; then
  echo 'Frontend must reject missing live config with a startup error' >&2; exit 1
fi
printf '%s\n' '{"VITE_API_BASE_URL":"/backend","VITE_CHAIN_ID":"31337","VITE_DEPLOYMENT_ID":"1","VITE_DATA_SOURCE":"fixture"}' > "$state/invalid.json"
chmod 644 "$state/invalid.json"
negative_status=0
timeout 15 docker run --rm --name "$project-fixture" --network none --mount "type=bind,src=$state/invalid.json,dst=/run/dao/frontend.json,readonly" "$FRONTEND_IMAGE" > "$state/fixture-config.log" 2>&1 || negative_status=$?
if [[ $negative_status != 1 ]] || ! grep -q 'Container requires live data' "$state/fixture-config.log"; then
  echo 'Frontend must reject fixture configuration with a startup error' >&2; exit 1
fi
check_live() {
  "${compose[@]}" up -d --pull never --wait --wait-timeout 180 api indexer frontend
  local address
  address=$("${compose[@]}" port frontend 8080)
  [[ $address =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected frontend bind' >&2; return 1; }
  node scripts/cd/container-smoke-check.mjs "http://$address"
  local proof
  proof=$("${compose[@]}" exec -T postgres psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT deployment_name FROM deployments WHERE deployment_id=1")
  [[ $proof == container-smoke ]]
}
check_live
# Proxy failures must retain the API error contract, not show undefined UI errors.
"${compose[@]}" stop api
node --input-type=module - "http://$("${compose[@]}" port frontend 8080)" <<'JS'
import assert from 'node:assert/strict';
const response = await fetch(process.argv[2] + '/backend/api/health?chainId=31337&deploymentId=container-smoke');
assert.equal(response.status, 502);
const body = await response.json();
assert.equal(body.error.code, 'API_UNAVAILABLE');
assert.equal(body.error.message, 'Read API upstream is unavailable.');
assert.equal(body.error.retryable, true);
JS
check_live
# A living container is insufficient: stale canonical validation must fail readiness.
"${compose[@]}" stop indexer
"${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "UPDATE deployments SET indexer_state=jsonb_set(indexer_state,'{lastCheckedAt}','\"2000-01-01T00:00:00Z\"'::jsonb) WHERE deployment_id=1"
stale_status=0
"${compose[@]}" run --rm --no-deps --entrypoint node indexer /app/deploy/worker-health.mjs || stale_status=$?
[[ $stale_status == 1 ]] || { echo 'Stale worker heartbeat must fail readiness' >&2; exit 1; }
check_live
# Check actual runtime ownership and PG18's parent-volume mount, not just YAML.
for service in api indexer frontend; do
  [[ $("${compose[@]}" exec -T "$service" node -e 'console.log(process.getuid())') != 0 ]]
done
pg_id=$("${compose[@]}" ps -q postgres)
docker inspect "$pg_id" | node --input-type=module -e 'import assert from "node:assert/strict";let s="";for await(const x of process.stdin)s+=x;assert.ok(JSON.parse(s)[0].Mounts.some(m=>m.Type==="volume"&&m.Destination==="/var/lib/postgresql"));'
# Recreate the database container while retaining its named PG18 data volume.
"${compose[@]}" stop frontend api indexer
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 120 postgres
check_live
# Distinct image configurations derived from the exact tested release exercise
# A -> B -> A switching without inventing cross-revision schema compatibility.
base_frontend=$FRONTEND_IMAGE; base_api=$API_IMAGE; base_indexer=$INDEXER_IMAGE
declare -A base_ids
for service in frontend api indexer; do
  variable="${service^^}_IMAGE"
  base_ids[$service]=$(docker image inspect --format '{{.Id}}' "${!variable}")
  variant="dao-smoke-${nonce}-${service}:b"
  docker build --quiet --tag "$variant" - <<EOF
FROM ${!variable}
LABEL dao.container-smoke.version="b-${nonce}"
EOF
  variants+=("$variant")
  [[ $(docker image inspect --format '{{.Id}}' "$variant") != "${base_ids[$service]}" ]]
  printf -v "$variable" '%s' "$variant"
  export "$variable"
done
check_live
for service in frontend api indexer; do
  [[ $(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps -q "$service")") != "${base_ids[$service]}" ]]
done
export FRONTEND_IMAGE=$base_frontend API_IMAGE=$base_api INDEXER_IMAGE=$base_indexer
check_live
for service in frontend api indexer; do
  [[ $(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps -q "$service")") == "${base_ids[$service]}" ]]
done
printf '%s\n' 'Container smoke PASS: genuine temporary Anvil metadata; nonroot runtime; live public config; API/worker/Postgres; PG18 volume recreation; distinct-image A->B->A rollback; no host database used.'
