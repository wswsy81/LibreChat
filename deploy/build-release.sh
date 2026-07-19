#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
ENGINE_DIR=$(cd -- "$APP_DIR/../future-engine-shim" && pwd)
PROJECT_DIR=$(cd -- "$ENGINE_DIR/.." && pwd)
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
RELEASE_ID=${1:-"$(date -u +%Y%m%dT%H%M%SZ)"}

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "release id may contain only letters, numbers, dot, underscore, and dash" >&2
  exit 1
}

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi

git_revision() {
  local directory=$1
  git -C "$directory" rev-parse HEAD 2>/dev/null || printf 'unknown'
}

LIBRECHAT_REVISION=${LIBRECHAT_REVISION:-"$(git_revision "$APP_DIR")"}
ENGINE_REVISION=${ENGINE_REVISION:-"$(git_revision "$ENGINE_DIR")"}
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
API_TAG="yiweilife/librechat:$RELEASE_ID"
ENGINE_TAG="yiweilife/future-engine:$RELEASE_ID"

echo "Building immutable LibreChat release image: $API_TAG"
"${DOCKER[@]}" build \
  --build-arg "BUILD_COMMIT=$LIBRECHAT_REVISION" \
  --build-arg "BUILD_BRANCH=codex/unified-product-shell" \
  --build-arg "BUILD_DATE=$BUILD_DATE" \
  --tag "$API_TAG" \
  "$APP_DIR"

echo "Building immutable future-engine release image: $ENGINE_TAG"
"${DOCKER[@]}" build \
  --file "$ENGINE_DIR/Dockerfile" \
  --build-arg "BUILD_COMMIT=$ENGINE_REVISION" \
  --build-arg "BUILD_DATE=$BUILD_DATE" \
  --tag "$ENGINE_TAG" \
  "$PROJECT_DIR"

API_IMAGE=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$API_TAG")
ENGINE_IMAGE=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$ENGINE_TAG")
IMAGE_ID_PATTERN='^sha256:[0-9a-f]{64}$'
[[ "$API_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "invalid LibreChat image id: $API_IMAGE" >&2
  exit 1
}
[[ "$ENGINE_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "invalid future-engine image id: $ENGINE_IMAGE" >&2
  exit 1
}

API_USER=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "$API_IMAGE")
ENGINE_USER=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "$ENGINE_IMAGE")
[[ "$API_USER" == node || "$API_USER" == 1000 ]] || {
  echo "LibreChat image must run as node/1000, got: ${API_USER:-root}" >&2
  exit 1
}
[[ "$ENGINE_USER" == node || "$ENGINE_USER" == 1000 ]] || {
  echo "future-engine image must run as node/1000, got: ${ENGINE_USER:-root}" >&2
  exit 1
}

"${DOCKER[@]}" run --rm --entrypoint sh "$API_IMAGE" -c \
  'test -s /app/librechat.yaml && test -s /app/client/dist/index.html && test -s /app/api/server/index.js'
"${DOCKER[@]}" run --rm --entrypoint sh "$ENGINE_IMAGE" -c \
  'test -s /app/mcp-server.js && test -s /app/profile.js'

install -d -m 700 "$RELEASE_ROOT"
ENV_FILE="$RELEASE_ROOT/$RELEASE_ID.env"
MANIFEST_FILE="$RELEASE_ROOT/$RELEASE_ID.manifest"
[[ ! -e "$ENV_FILE" && ! -e "$MANIFEST_FILE" ]] || {
  echo "release already exists: $RELEASE_ID" >&2
  exit 1
}

umask 077
ENV_TMP="$RELEASE_ROOT/.$RELEASE_ID.env.tmp"
MANIFEST_TMP="$RELEASE_ROOT/.$RELEASE_ID.manifest.tmp"
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$API_IMAGE"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$ENGINE_IMAGE"
} > "$ENV_TMP"
{
  printf 'release_id=%s\n' "$RELEASE_ID"
  printf 'built_at=%s\n' "$BUILD_DATE"
  printf 'librechat_revision=%s\n' "$LIBRECHAT_REVISION"
  printf 'future_engine_revision=%s\n' "$ENGINE_REVISION"
  printf 'librechat_image=%s\n' "$API_IMAGE"
  printf 'future_engine_image=%s\n' "$ENGINE_IMAGE"
  printf 'librechat_tag=%s\n' "$API_TAG"
  printf 'future_engine_tag=%s\n' "$ENGINE_TAG"
} > "$MANIFEST_TMP"
chmod 600 "$ENV_TMP" "$MANIFEST_TMP"
mv "$ENV_TMP" "$ENV_FILE"
mv "$MANIFEST_TMP" "$MANIFEST_FILE"

echo "Release built without touching running containers."
echo "Candidate: $ENV_FILE"
echo "Apply once after a verified backup: bash deploy/apply-release.sh .releases/$RELEASE_ID.env"
