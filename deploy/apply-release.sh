#!/usr/bin/env bash
set -euo pipefail
APPLY_STARTED_EPOCH=$(date +%s)

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
RUNTIME_CONFIG_DIR=${RUNTIME_CONFIG_DIR:-"$APP_DIR/runtime-config"}
ENGINE_LAST_GOOD_DIR=${ENGINE_LAST_GOOD_DIR:-"$ENGINE_DIR/data/runtime-last-good"}
CANDIDATE=${1:-}

[[ -n "$CANDIDATE" ]] || {
  echo "usage: bash deploy/apply-release.sh .releases/<release>.env" >&2
  exit 1
}
[[ -f "$APP_DIR/.env" ]] || {
  echo "production .env is missing" >&2
  exit 1
}

install -d -m 700 "$RUNTIME_CONFIG_DIR" "$RUNTIME_CONFIG_DIR/.last-good" "$ENGINE_LAST_GOOD_DIR"
for file in runtime-policy.v1.json security-contract.v1.json product-catalog.v1.json product-experiments.v1.json rules.v1.json; do
  if [[ ! -f "$RUNTIME_CONFIG_DIR/$file" ]]; then
    install -m 600 "$ENGINE_DIR/../config/$file" "$RUNTIME_CONFIG_DIR/$file"
  fi
done

if [[ ! -f "$RUNTIME_CONFIG_DIR/global-prompt.v1.md" ]]; then
  install -m 600 "$ENGINE_DIR/../config/global-prompt.v1.md" "$RUNTIME_CONFIG_DIR/global-prompt.v1.md"
fi
for file in \
  runtime-copy.v1.json \
  rescue-bank.v1.json \
  topics-bank.v1.json \
  house-entry-options-bank.v1.json \
  reveal-scenario-registry.v1.json \
  reveal-common-variables.v1.json \
  house-opening-bank.v1.json \
  house-opening-bank.v2.json \
  constitution.v1.json; do
  if [[ ! -f "$RUNTIME_CONFIG_DIR/$file" ]]; then
    install -m 600 "$ENGINE_DIR/banks/$file" "$RUNTIME_CONFIG_DIR/$file"
  fi
done

if [[ ! -f "$RUNTIME_CONFIG_DIR/.last-good/global-prompt.v1.md" ]]; then
  install -m 600 "$RUNTIME_CONFIG_DIR/global-prompt.v1.md" "$RUNTIME_CONFIG_DIR/.last-good/global-prompt.v1.md"
fi
for file in runtime-copy.v1.json rescue-bank.v1.json topics-bank.v1.json; do
  if [[ ! -f "$ENGINE_LAST_GOOD_DIR/$file" ]]; then
    install -m 600 "$RUNTIME_CONFIG_DIR/$file" "$ENGINE_LAST_GOOD_DIR/$file"
  fi
done

if [[ "$CANDIDATE" != /* ]]; then
  CANDIDATE="$APP_DIR/$CANDIDATE"
fi
[[ -f "$CANDIDATE" ]] || {
  echo "release env is missing: $CANDIDATE" >&2
  exit 1
}

case "$(cd -- "$(dirname -- "$CANDIDATE")" && pwd)/$(basename -- "$CANDIDATE")" in
  "$RELEASE_ROOT"/*.env) ;;
  *)
    echo "release env must live under $RELEASE_ROOT" >&2
    exit 1
    ;;
esac

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi

read_release_value() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "$file"
}

API_IMAGE=$(read_release_value LIBRECHAT_RELEASE_IMAGE "$CANDIDATE")
ENGINE_IMAGE=$(read_release_value FUTURE_ENGINE_RELEASE_IMAGE "$CANDIDATE")
IMAGE_ID_PATTERN='^sha256:[0-9a-f]{64}$'
[[ "$API_IMAGE" =~ $IMAGE_ID_PATTERN && "$ENGINE_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "release env must contain two content-addressed sha256 image IDs" >&2
  exit 1
}
"${DOCKER[@]}" image inspect "$API_IMAGE" "$ENGINE_IMAGE" >/dev/null

CURRENT_API=$("${DOCKER[@]}" inspect --format '{{.Image}}' LibreChat)
CURRENT_ENGINE=$("${DOCKER[@]}" inspect --format '{{.Image}}' future-engine)
CHANGED_SERVICES=()
[[ "$ENGINE_IMAGE" == "$CURRENT_ENGINE" ]] || CHANGED_SERVICES+=(future-engine)
[[ "$API_IMAGE" == "$CURRENT_API" ]] || CHANGED_SERVICES+=(api)
[[ ${#CHANGED_SERVICES[@]} -gt 0 ]] || {
  echo "candidate is identical to the running release; nothing to switch" >&2
  exit 1
}
RELEASE_NAME=$(basename -- "$CANDIDATE" .env)
ROLLBACK_ENV="$RELEASE_ROOT/$RELEASE_NAME.rollback.env"
umask 077
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$CURRENT_API"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$CURRENT_ENGINE"
} > "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"

if [[ " ${CHANGED_SERVICES[*]} " == *" future-engine "* ]]; then
  # 历史 future-engine 以 root 写 data；镜像降权前一次性迁到固定 node uid/gid。
  "${DOCKER[@]}" run --rm \
    --user 0:0 \
    --volume "$ENGINE_DIR/data:/data" \
    --entrypoint sh \
    "$ENGINE_IMAGE" \
    -c 'chown -R 1000:1000 /data'
fi

COMPOSE=(
  "${DOCKER[@]}" compose
  --file "$APP_DIR/docker-compose.prod.yml"
  --env-file "$APP_DIR/.env"
  --env-file "$CANDIDATE"
)
"${COMPOSE[@]}" config --quiet

echo "Switching content-addressed service(s): ${CHANGED_SERVICES[*]}"
"${COMPOSE[@]}" up --detach --no-deps --force-recreate "${CHANGED_SERVICES[@]}"

healthy=false
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-45}
HEALTH_SLEEP_SECONDS=${HEALTH_SLEEP_SECONDS:-2}
for _attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if "${DOCKER[@]}" exec future-engine node -e \
      "fetch('http://127.0.0.1:8899/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 \
    && "${DOCKER[@]}" exec LibreChat node -e \
      "fetch('http://127.0.0.1:3080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep "$HEALTH_SLEEP_SECONDS"
done

if [[ "$healthy" != true ]]; then
  echo "release health check failed; rolling changed service(s) back: ${CHANGED_SERVICES[*]}" >&2
  ROLLBACK_COMPOSE=(
    "${DOCKER[@]}" compose
    --file "$APP_DIR/docker-compose.prod.yml"
    --env-file "$APP_DIR/.env"
    --env-file "$ROLLBACK_ENV"
  )
  "${ROLLBACK_COMPOSE[@]}" up --detach --no-deps --force-recreate "${CHANGED_SERVICES[@]}"
  MANIFEST_FILE="${CANDIDATE%.env}.manifest"
  if [[ -f "$MANIFEST_FILE" ]]; then
    printf 'apply_result=rolled_back\napply_seconds=%s\n' "$(( $(date +%s) - APPLY_STARTED_EPOCH ))" >> "$MANIFEST_FILE"
  fi
  exit 1
fi

ACTIVE_TMP="$APP_DIR/.release.env.next"
install -m 600 "$CANDIDATE" "$ACTIVE_TMP"
mv "$ACTIVE_TMP" "$APP_DIR/.release.env"

MANIFEST_FILE="${CANDIDATE%.env}.manifest"
if [[ -f "$MANIFEST_FILE" ]]; then
  printf 'apply_result=healthy\napply_seconds=%s\nchanged_services=%s\n' \
    "$(( $(date +%s) - APPLY_STARTED_EPOCH ))" "${CHANGED_SERVICES[*]}" >> "$MANIFEST_FILE"
fi

echo "Release healthy and active: $RELEASE_NAME"
echo "Rollback manifest: $ROLLBACK_ENV"
