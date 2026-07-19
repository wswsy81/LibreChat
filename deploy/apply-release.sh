#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
ENGINE_DIR=$(cd -- "$APP_DIR/../future-engine-shim" && pwd)
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
CANDIDATE=${1:-}

[[ -n "$CANDIDATE" ]] || {
  echo "usage: bash deploy/apply-release.sh .releases/<release>.env" >&2
  exit 1
}
[[ -f "$APP_DIR/.env" ]] || {
  echo "production .env is missing" >&2
  exit 1
}

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
RELEASE_NAME=$(basename -- "$CANDIDATE" .env)
ROLLBACK_ENV="$RELEASE_ROOT/$RELEASE_NAME.rollback.env"
umask 077
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$CURRENT_API"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$CURRENT_ENGINE"
} > "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"

# 历史 future-engine 以 root 写 data；镜像降权前一次性迁到固定 node uid/gid。
"${DOCKER[@]}" run --rm \
  --user 0:0 \
  --volume "$ENGINE_DIR/data:/data" \
  --entrypoint sh \
  "$ENGINE_IMAGE" \
  -c 'chown -R 1000:1000 /data'

COMPOSE=(
  "${DOCKER[@]}" compose
  --file "$APP_DIR/docker-compose.prod.yml"
  --env-file "$APP_DIR/.env"
  --env-file "$CANDIDATE"
)
"${COMPOSE[@]}" config --quiet

echo "Switching future-engine and LibreChat to one content-addressed release..."
"${COMPOSE[@]}" up --detach --no-deps --force-recreate future-engine api

healthy=false
for _attempt in $(seq 1 45); do
  if "${DOCKER[@]}" exec future-engine node -e \
      "fetch('http://127.0.0.1:8899/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 \
    && "${DOCKER[@]}" exec LibreChat node -e \
      "fetch('http://127.0.0.1:3080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "release health check failed; rolling both services back" >&2
  ROLLBACK_COMPOSE=(
    "${DOCKER[@]}" compose
    --file "$APP_DIR/docker-compose.prod.yml"
    --env-file "$APP_DIR/.env"
    --env-file "$ROLLBACK_ENV"
  )
  "${ROLLBACK_COMPOSE[@]}" up --detach --no-deps --force-recreate future-engine api
  exit 1
fi

ACTIVE_TMP="$APP_DIR/.release.env.next"
install -m 600 "$CANDIDATE" "$ACTIVE_TMP"
mv "$ACTIVE_TMP" "$APP_DIR/.release.env"

echo "Release healthy and active: $RELEASE_NAME"
echo "Rollback manifest: $ROLLBACK_ENV"
