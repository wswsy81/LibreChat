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
SELECTED_BY=${SELECTED_BY:-classifier}
TEST_EVIDENCE_FILE=${TEST_EVIDENCE_FILE:-}
BUILD_CACHE_DIR=${BUILD_CACHE_DIR:-"$RELEASE_ROOT/.build-cache"}
BUILD_CPU_QUOTA=${BUILD_CPU_QUOTA:-}
BUILD_CPU_PERIOD=${BUILD_CPU_PERIOD:-100000}
CORPUS_SCHEMA_REL=library/corpora/schemas/bank-item.schema.json
CORPUS_SCHEMA_IN_CONTEXT="$PROJECT_DIR/$CORPUS_SCHEMA_REL"
GENERATED_CORPUS_SCHEMA=false
BUILD_STARTED_EPOCH=$(date +%s)

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "release id may contain only letters, numbers, dot, underscore, and dash" >&2
  exit 1
}
case "$RELEASE_SERVICE" in
  all|api|future-engine|config) ;;
  *)
    echo "RELEASE_SERVICE must be all, api, future-engine, or config" >&2
    exit 1
    ;;
esac
case "$RELEASE_MODE" in
  full|hotfix|config-only) ;;
  *)
    echo "RELEASE_MODE must be full, hotfix, or config-only" >&2
    exit 1
    ;;
esac
case "$SELECTED_CHANNEL" in
  config-only|engine-hotfix|api-hotfix|full) ;;
  *)
    echo "SELECTED_CHANNEL must be config-only, engine-hotfix, api-hotfix, or full" >&2
    exit 1
    ;;
esac
[[ "$SELECTED_BY" == classifier || "$SELECTED_BY" == owner ]] || {
  echo "SELECTED_BY must be classifier or owner" >&2
  exit 1
}
[[ -f "$TEST_EVIDENCE_FILE" ]] || {
  echo "TEST_EVIDENCE_FILE is required and must exist" >&2
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

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_revision() {
  local directory=$1
  local requested=$2
  local label=$3
  bash "$SCRIPT_DIR/verify-revision.sh" "$directory" "$requested" "$label"
}

read_evidence_value() {
  read_release_value "$1" "$TEST_EVIDENCE_FILE"
}

# future-engine 的发布测试会对比 runtime schema 与仓库根 library/ 权威副本。
# 生产 staging 把它放在 PROJECT_DIR/library；本地则从仓库根临时注入构建上下文，
# 构建结束后删除临时副本，不在产品目录维护第三份 schema。
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]] && [[ -z "${CORPUS_SCHEMA_SOURCE:-}" ]]; then
  if [[ -f "$CORPUS_SCHEMA_IN_CONTEXT" ]]; then
    CORPUS_SCHEMA_SOURCE=$CORPUS_SCHEMA_IN_CONTEXT
  elif [[ -f "$PROJECT_DIR/../../$CORPUS_SCHEMA_REL" ]]; then
    CORPUS_SCHEMA_SOURCE="$PROJECT_DIR/../../$CORPUS_SCHEMA_REL"
  else
    echo "authoritative corpus schema is missing: $CORPUS_SCHEMA_REL" >&2
    exit 1
  fi
fi
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]]; then
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
  PRIV=()
else
  DOCKER=(sudo docker)
  # buildx 的 --cache-to 由 docker 同权限写盘;轮转缓存必须用同一权限,
  # 否则 sudo 写出的 root 缓存会让后面的 rm -rf 在 set -e 下直接中断发布。
  PRIV=(sudo)
fi
install -d -m 700 "$BUILD_CACHE_DIR"

LIBRECHAT_REVISION_REQUESTED=${LIBRECHAT_REVISION:-HEAD}
ENGINE_REVISION_REQUESTED=${ENGINE_REVISION:-HEAD}
LIBRECHAT_REVISION=reused-active
ENGINE_REVISION=reused-active
if [[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]]; then
  LIBRECHAT_REVISION=$(verify_revision "$APP_DIR" "$LIBRECHAT_REVISION_REQUESTED" librechat_revision)
fi
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == config || "$RELEASE_SERVICE" == all ]]; then
  ENGINE_REVISION=$(verify_revision "$ENGINE_DIR" "$ENGINE_REVISION_REQUESTED" future_engine_revision)
fi

[[ "$(read_evidence_value schema)" == yiwei.release-test-evidence.v1 ]] || {
  echo "unsupported test evidence schema" >&2
  exit 1
}
[[ "$(read_evidence_value status)" == passed ]] || {
  echo "test evidence is not passed" >&2
  exit 1
}
EVIDENCE_SCOPE=$(read_evidence_value scope)
case "$RELEASE_SERVICE:$EVIDENCE_SCOPE" in
  config:config-only|future-engine:engine-hotfix|api:api-hotfix|all:full) ;;
  *)
    echo "test evidence scope $EVIDENCE_SCOPE does not match release service $RELEASE_SERVICE" >&2
    exit 1
    ;;
esac
if [[ "$LIBRECHAT_REVISION" != reused-active ]]; then
  [[ "$(read_evidence_value librechat_revision)" == "$LIBRECHAT_REVISION" ]] || {
    echo "test evidence LibreChat revision does not match candidate revision" >&2
    exit 1
  }
fi
if [[ "$ENGINE_REVISION" != reused-active ]]; then
  [[ "$(read_evidence_value future_engine_revision)" == "$ENGINE_REVISION" ]] || {
    echo "test evidence future-engine revision does not match candidate revision" >&2
    exit 1
  }
fi
TEST_EVIDENCE_SHA256=$(sha256_file "$TEST_EVIDENCE_FILE")
RULES_SOURCE="$PROJECT_DIR/config/rules.v1.json"
RULES_SHA256=not-applicable
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == config || "$RELEASE_SERVICE" == all ]]; then
  [[ -s "$RULES_SOURCE" ]] || {
    echo "rules config is missing: $RULES_SOURCE" >&2
    exit 1
  }
  python3 -m json.tool "$RULES_SOURCE" >/dev/null
  RULES_SHA256=$(sha256_file "$RULES_SOURCE")
fi
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# 本地缓存导入/导出不仅需要 buildx 插件，还要求当前 builder 支持外部缓存。
# Docker Desktop 的 docker driver 即使装了 buildx，也可能拒绝 --cache-to；这时降级成
# 普通构建，只影响速度，不影响不可变产物。
BUILD_CACHE_AVAILABLE=false
if [[ "$DOCKER_BUILDKIT" != 0 ]] && "${DOCKER[@]}" buildx version >/dev/null 2>&1; then
  BUILDX_DRIVER=
  if BUILDX_DRIVER=$("${DOCKER[@]}" buildx inspect --bootstrap 2>/dev/null | awk -F: '$1 == "Driver" { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit }'); then
    if [[ -n "$BUILDX_DRIVER" && "$BUILDX_DRIVER" != docker ]]; then
      BUILD_CACHE_AVAILABLE=true
    fi
  fi
fi

BUILD_RESOURCE_ARGS=()
if [[ -n "$BUILD_CPU_QUOTA" ]]; then
  [[ "$BUILD_CPU_QUOTA" =~ ^[1-9][0-9]*$ && "$BUILD_CPU_PERIOD" =~ ^[1-9][0-9]*$ ]] || {
    echo "BUILD_CPU_QUOTA and BUILD_CPU_PERIOD must be positive integers" >&2
    exit 1
  }
  [[ "$DOCKER_BUILDKIT" == 0 ]] || {
    echo "BUILD_CPU_QUOTA requires DOCKER_BUILDKIT=0 because buildx has no cpu-quota flag" >&2
    exit 1
  }
  BUILD_RESOURCE_ARGS=(--cpu-period "$BUILD_CPU_PERIOD" --cpu-quota "$BUILD_CPU_QUOTA")
fi

cache_args() {
  local name=$1
  $BUILD_CACHE_AVAILABLE || return 0
  printf '%s\n' \
    "--cache-from" "type=local,src=$BUILD_CACHE_DIR/$name" \
    "--cache-to" "type=local,dest=$BUILD_CACHE_DIR/$name-next,mode=max"
}

promote_cache() {
  local name=$1
  $BUILD_CACHE_AVAILABLE || return 0
  ${PRIV[@]+"${PRIV[@]}"} rm -rf -- "$BUILD_CACHE_DIR/$name"
  ${PRIV[@]+"${PRIV[@]}"} mv "$BUILD_CACHE_DIR/$name-next" "$BUILD_CACHE_DIR/$name"
}

API_TAG="yiweilife/librechat:$RELEASE_ID"
ENGINE_TAG="yiweilife/future-engine:$RELEASE_ID"

if [[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]]; then
  echo "Building immutable LibreChat release image: $API_TAG"
  mapfile -t API_CACHE_ARGS < <(cache_args api)
  "${DOCKER[@]}" build \
    ${BUILD_RESOURCE_ARGS[@]+"${BUILD_RESOURCE_ARGS[@]}"} \
    ${API_CACHE_ARGS[@]+"${API_CACHE_ARGS[@]}"} \
    --build-arg "BUILD_COMMIT=$LIBRECHAT_REVISION" \
    --build-arg "BUILD_BRANCH=$(git -C "$APP_DIR" branch --show-current 2>/dev/null || printf unknown)" \
    --build-arg "BUILD_DATE=$BUILD_DATE" \
    --tag "$API_TAG" \
    "$APP_DIR"
  promote_cache api
  API_IMAGE=$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$API_TAG")
else
  API_IMAGE=$(active_image LIBRECHAT_RELEASE_IMAGE)
fi

if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]]; then
  mapfile -t ENGINE_CACHE_ARGS < <(cache_args engine)
  echo "Building immutable future-engine release image: $ENGINE_TAG"
  "${DOCKER[@]}" build \
    ${BUILD_RESOURCE_ARGS[@]+"${BUILD_RESOURCE_ARGS[@]}"} \
    --file "$ENGINE_DIR/Dockerfile" \
    --target runtime \
    ${ENGINE_CACHE_ARGS[@]+"${ENGINE_CACHE_ARGS[@]}"} \
    --build-arg "BUILD_COMMIT=$ENGINE_REVISION" \
    --build-arg "BUILD_DATE=$BUILD_DATE" \
    --tag "$ENGINE_TAG" \
    "$PROJECT_DIR"
  promote_cache engine
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

if [[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]]; then
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
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]]; then
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
EVIDENCE_ARTIFACT="$RELEASE_ROOT/$RELEASE_ID.evidence"
[[ ! -e "$ENV_FILE" && ! -e "$MANIFEST_FILE" && ! -e "$EVIDENCE_ARTIFACT" ]] || {
  echo "release already exists: $RELEASE_ID" >&2
  exit 1
}
if [[ "$TEST_EVIDENCE_FILE" != "$EVIDENCE_ARTIFACT" ]]; then
  install -m 600 "$TEST_EVIDENCE_FILE" "$EVIDENCE_ARTIFACT"
else
  chmod 600 "$EVIDENCE_ARTIFACT"
fi
[[ "$(sha256_file "$EVIDENCE_ARTIFACT")" == "$TEST_EVIDENCE_SHA256" ]] || {
  echo "failed to bind test evidence artifact to candidate" >&2
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
  printf 'manifest_schema=yiwei.release-manifest.v2\n'
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
  printf 'librechat_tag=%s\n' "$([[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]] && printf '%s' "$API_TAG" || printf reused-active)"
  printf 'future_engine_tag=%s\n' "$([[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]] && printf '%s' "$ENGINE_TAG" || printf reused-active)"
  printf 'test_evidence_status=passed\n'
  printf 'test_evidence_scope=%s\n' "$EVIDENCE_SCOPE"
  printf 'test_evidence_sha256=%s\n' "$TEST_EVIDENCE_SHA256"
  printf 'test_evidence_file=%s.evidence\n' "$RELEASE_ID"
  printf 'runtime_config_rules_sha256=%s\n' "$RULES_SHA256"
  printf 'build_seconds=%s\n' "$(( $(date +%s) - BUILD_STARTED_EPOCH ))"
} > "$MANIFEST_TMP"
chmod 600 "$ENV_TMP" "$MANIFEST_TMP"
mv "$ENV_TMP" "$ENV_FILE"
mv "$MANIFEST_TMP" "$MANIFEST_FILE"

echo "Release built without touching running containers."
echo "Scope: $RELEASE_SERVICE"
echo "Candidate: $ENV_FILE"
echo "Apply once after a verified backup: bash deploy/apply-release.sh .releases/$RELEASE_ID.env"
