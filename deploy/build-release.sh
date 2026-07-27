#!/usr/bin/env bash
set -euo pipefail
export DOCKER_BUILDKIT=${DOCKER_BUILDKIT:-1}

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
PROJECT_DIR=$(cd -- "$ENGINE_DIR/.." && pwd)
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
ACTIVE_RELEASE_ENV=${ACTIVE_RELEASE_ENV:-"$APP_DIR/.release.env"}
RELEASE_ID=${1:-"$(date -u +%Y%m%dT%H%M%SZ)"}
RELEASE_SERVICE=${RELEASE_SERVICE:-all}
RELEASE_MODE=${RELEASE_MODE:-full}
SELECTED_CHANNEL=${SELECTED_CHANNEL:-$RELEASE_MODE}
SELECTED_BY=${SELECTED_BY:-owner}
BUILD_CACHE_DIR=${BUILD_CACHE_DIR:-"$RELEASE_ROOT/.build-cache"}
CORPUS_SCHEMA_REL=library/corpora/schemas/bank-item.schema.json
CORPUS_SCHEMA_IN_CONTEXT="$PROJECT_DIR/$CORPUS_SCHEMA_REL"
GENERATED_CORPUS_SCHEMA=false
BUILD_STARTED_EPOCH=$(date +%s)

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "release id may contain only letters, numbers, dot, underscore, and dash" >&2
  exit 1
}
case "$RELEASE_SERVICE" in
  all|api|future-engine) ;;
  *)
    echo "RELEASE_SERVICE must be all, api, or future-engine" >&2
    exit 1
    ;;
esac
case "$RELEASE_MODE" in
  full|hotfix) ;;
  *)
    echo "RELEASE_MODE must be full or hotfix" >&2
    exit 1
    ;;
esac
case "$SELECTED_CHANNEL" in
  hotfix|full) ;;
  *)
    echo "SELECTED_CHANNEL must be hotfix or full for image releases" >&2
    exit 1
    ;;
esac
[[ "$SELECTED_BY" == owner ]] || {
  echo "SELECTED_BY must be owner" >&2
  exit 1
}

read_release_value() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "$file"
}

active_image() {
  local key=$1
  [[ -f "$ACTIVE_RELEASE_ENV" ]] || {
    echo "active release env is required for a single-service release: $ACTIVE_RELEASE_ENV" >&2
    exit 1
  }
  read_release_value "$key" "$ACTIVE_RELEASE_ENV"
}

# future-engine 的发布测试会对比 runtime schema 与仓库根 library/ 权威副本。
# 生产 staging 把它放在 PROJECT_DIR/library；本地则从仓库根临时注入构建上下文，
# 构建结束后删除临时副本，不在产品目录维护第三份 schema。
if [[ "$RELEASE_SERVICE" != api && -z "${CORPUS_SCHEMA_SOURCE:-}" ]]; then
  if [[ -f "$CORPUS_SCHEMA_IN_CONTEXT" ]]; then
    CORPUS_SCHEMA_SOURCE=$CORPUS_SCHEMA_IN_CONTEXT
  elif [[ -f "$PROJECT_DIR/../../$CORPUS_SCHEMA_REL" ]]; then
    CORPUS_SCHEMA_SOURCE="$PROJECT_DIR/../../$CORPUS_SCHEMA_REL"
  else
    echo "authoritative corpus schema is missing: $CORPUS_SCHEMA_REL" >&2
    exit 1
  fi
fi
if [[ "$RELEASE_SERVICE" != api ]]; then
  [[ -f "$CORPUS_SCHEMA_SOURCE" ]] || {
    echo "authoritative corpus schema is missing: $CORPUS_SCHEMA_SOURCE" >&2
    exit 1
  }
  if [[ "$CORPUS_SCHEMA_SOURCE" != "$CORPUS_SCHEMA_IN_CONTEXT" ]]; then
    [[ ! -e "$CORPUS_SCHEMA_IN_CONTEXT" ]] || {
      echo "refusing to overwrite existing corpus schema in build context" >&2
      exit 1
    }
    install -d -m 755 "$(dirname -- "$CORPUS_SCHEMA_IN_CONTEXT")"
    install -m 644 "$CORPUS_SCHEMA_SOURCE" "$CORPUS_SCHEMA_IN_CONTEXT"
    GENERATED_CORPUS_SCHEMA=true
  fi
fi

cleanup_build_context() {
  if [[ "$GENERATED_CORPUS_SCHEMA" == true ]]; then
    rm -f -- "$CORPUS_SCHEMA_IN_CONTEXT"
    rmdir -- "$PROJECT_DIR/library/corpora/schemas" "$PROJECT_DIR/library/corpora" "$PROJECT_DIR/library" 2>/dev/null || true
  fi
}
trap cleanup_build_context EXIT

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi
install -d -m 700 "$BUILD_CACHE_DIR"

git_revision() {
  local directory=$1
  git -C "$directory" rev-parse HEAD 2>/dev/null || printf 'unknown'
}

LIBRECHAT_REVISION=${LIBRECHAT_REVISION:-"$(git_revision "$APP_DIR")"}
ENGINE_REVISION=${ENGINE_REVISION:-"$(git_revision "$ENGINE_DIR")"}
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
API_TAG="yiweilife/librechat:$RELEASE_ID"
ENGINE_TAG="yiweilife/future-engine:$RELEASE_ID"

if [[ "$RELEASE_SERVICE" != future-engine ]]; then
  echo "Building immutable LibreChat release image: $API_TAG"
  "${DOCKER[@]}" build \
    --cache-from "type=local,src=$BUILD_CACHE_DIR/api" \
    --cache-to "type=local,dest=$BUILD_CACHE_DIR/api-next,mode=max" \
    --build-arg "BUILD_COMMIT=$LIBRECHAT_REVISION" \
    --build-arg "BUILD_BRANCH=$(git -C "$APP_DIR" branch --show-current 2>/dev/null || printf unknown)" \
    --build-arg "BUILD_DATE=$BUILD_DATE" \
    --tag "$API_TAG" \
    "$APP_DIR"
  rm -rf -- "$BUILD_CACHE_DIR/api"
  mv "$BUILD_CACHE_DIR/api-next" "$BUILD_CACHE_DIR/api"
  API_IMAGE=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$API_TAG")
else
  API_IMAGE=$(active_image LIBRECHAT_RELEASE_IMAGE)
fi

if [[ "$RELEASE_SERVICE" != api ]]; then
  if [[ "$RELEASE_MODE" == full ]]; then
    echo "Running future-engine full test stage"
    "${DOCKER[@]}" build \
      --file "$ENGINE_DIR/Dockerfile" \
      --target test \
      --cache-from "type=local,src=$BUILD_CACHE_DIR/engine" \
      --cache-to "type=local,dest=$BUILD_CACHE_DIR/engine-test-next,mode=max" \
      "$PROJECT_DIR"
    rm -rf -- "$BUILD_CACHE_DIR/engine-test-next"
  fi
  echo "Building immutable future-engine release image: $ENGINE_TAG"
  "${DOCKER[@]}" build \
    --file "$ENGINE_DIR/Dockerfile" \
    --target runtime \
    --cache-from "type=local,src=$BUILD_CACHE_DIR/engine" \
    --cache-to "type=local,dest=$BUILD_CACHE_DIR/engine-next,mode=max" \
    --build-arg "BUILD_COMMIT=$ENGINE_REVISION" \
    --build-arg "BUILD_DATE=$BUILD_DATE" \
    --tag "$ENGINE_TAG" \
    "$PROJECT_DIR"
  rm -rf -- "$BUILD_CACHE_DIR/engine"
  mv "$BUILD_CACHE_DIR/engine-next" "$BUILD_CACHE_DIR/engine"
  ENGINE_IMAGE=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$ENGINE_TAG")
else
  ENGINE_IMAGE=$(active_image FUTURE_ENGINE_RELEASE_IMAGE)
fi

IMAGE_ID_PATTERN='^sha256:[0-9a-f]{64}$'
[[ "$API_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "invalid LibreChat image id: $API_IMAGE" >&2
  exit 1
}
[[ "$ENGINE_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "invalid future-engine image id: $ENGINE_IMAGE" >&2
  exit 1
}

if [[ "$RELEASE_SERVICE" != future-engine ]]; then
  API_USER=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "$API_IMAGE")
  [[ "$API_USER" == node || "$API_USER" == 1000 ]] || {
    echo "LibreChat image must run as node/1000, got: ${API_USER:-root}" >&2
    exit 1
  }
  "${DOCKER[@]}" run --rm --entrypoint sh "$API_IMAGE" -c \
    'test -s /app/librechat.yaml && test -s /app/client/dist/index.html && test -s /app/api/server/index.js'
  "${DOCKER[@]}" run --rm --entrypoint node "$API_IMAGE" -e \
    "require('module-alias')({ base: '/app/api' }); require('/app/api/server/services/Files/process'); process.exit(0)"
fi
if [[ "$RELEASE_SERVICE" != api ]]; then
  ENGINE_USER=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "$ENGINE_IMAGE")
  [[ "$ENGINE_USER" == node || "$ENGINE_USER" == 1000 ]] || {
    echo "future-engine image must run as node/1000, got: ${ENGINE_USER:-root}" >&2
    exit 1
  }
  "${DOCKER[@]}" run --rm --entrypoint sh "$ENGINE_IMAGE" -c \
    'test -s /app/mcp-server.js && test -s /app/profile.js'
fi

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
  printf 'release_service=%s\n' "$RELEASE_SERVICE"
  printf 'release_mode=%s\n' "$RELEASE_MODE"
  printf 'selected_channel=%s\n' "$SELECTED_CHANNEL"
  printf 'selected_by=%s\n' "$SELECTED_BY"
  printf 'owner_override=%s\n' "${OWNER_OVERRIDE:-false}"
  printf 'tool_recommendation=%s\n' "${TOOL_RECOMMENDATION:-not-run}"
  printf 'built_at=%s\n' "$BUILD_DATE"
  printf 'librechat_revision=%s\n' "$LIBRECHAT_REVISION"
  printf 'future_engine_revision=%s\n' "$ENGINE_REVISION"
  printf 'librechat_image=%s\n' "$API_IMAGE"
  printf 'future_engine_image=%s\n' "$ENGINE_IMAGE"
  printf 'librechat_tag=%s\n' "$([[ "$RELEASE_SERVICE" == future-engine ]] && printf reused-active || printf '%s' "$API_TAG")"
  printf 'future_engine_tag=%s\n' "$([[ "$RELEASE_SERVICE" == api ]] && printf reused-active || printf '%s' "$ENGINE_TAG")"
  printf 'build_seconds=%s\n' "$(( $(date +%s) - BUILD_STARTED_EPOCH ))"
} > "$MANIFEST_TMP"
chmod 600 "$ENV_TMP" "$MANIFEST_TMP"
mv "$ENV_TMP" "$ENV_FILE"
mv "$MANIFEST_TMP" "$MANIFEST_FILE"

echo "Release built without touching running containers."
echo "Scope: $RELEASE_SERVICE"
echo "Candidate: $ENV_FILE"
echo "Apply once after a verified backup: bash deploy/apply-release.sh .releases/$RELEASE_ID.env"
