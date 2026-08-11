#!/usr/bin/env bash
set -euo pipefail
export DOCKER_BUILDKIT=${DOCKER_BUILDKIT:-1}
export COPYFILE_DISABLE=1

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
TARGET_PLATFORM=${TARGET_PLATFORM:-linux/amd64}
REGISTRY_PREFIX=${REGISTRY_PREFIX:-ghcr.io/wswsy81}
REGISTRY_PUSH=${REGISTRY_PUSH:-true}
AUTO_STAGE=${AUTO_STAGE:-true}
STAGE_GATE_MODE=${STAGE_GATE_MODE:-required}
CLIENT_ARTIFACT=${CLIENT_ARTIFACT:-true}
MAX_LIBRECHAT_IMAGE_BYTES=${MAX_LIBRECHAT_IMAGE_BYTES:-2100000000}
MAX_FUTURE_ENGINE_IMAGE_BYTES=${MAX_FUTURE_ENGINE_IMAGE_BYTES:-1000000000}
CORPUS_SCHEMA_REL=library/corpora/schemas/bank-item.schema.json
CORPUS_SCHEMA_IN_CONTEXT="$PROJECT_DIR/$CORPUS_SCHEMA_REL"
GENERATED_CORPUS_SCHEMA=false
BUILD_STARTED_EPOCH=$(date +%s)
TAR_CREATE=(tar)
tar --no-xattrs -cf /dev/null -T /dev/null 2>/dev/null && TAR_CREATE+=(--no-xattrs) || true

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
[[ "$REGISTRY_PUSH" == true || "$REGISTRY_PUSH" == false ]] || {
  echo "REGISTRY_PUSH must be true or false" >&2
  exit 1
}
[[ "$AUTO_STAGE" == true || "$AUTO_STAGE" == false ]] || {
  echo "AUTO_STAGE must be true or false" >&2
  exit 1
}
[[ "$STAGE_GATE_MODE" == required || "$STAGE_GATE_MODE" == not-required ]] || {
  echo "STAGE_GATE_MODE must be required or not-required" >&2
  exit 1
}
[[ "$CLIENT_ARTIFACT" == true || "$CLIENT_ARTIFACT" == false ]] || {
  echo "CLIENT_ARTIFACT must be true or false" >&2
  exit 1
}
[[ "$TARGET_PLATFORM" == linux/amd64 ]] || {
  echo "Future Lines production candidates must target linux/amd64" >&2
  exit 1
}
[[ "$REGISTRY_PREFIX" =~ ^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)*$ ]] || {
  echo "REGISTRY_PREFIX is invalid: $REGISTRY_PREFIX" >&2
  exit 1
}
[[ "$MAX_LIBRECHAT_IMAGE_BYTES" =~ ^[1-9][0-9]*$ && "$MAX_FUTURE_ENGINE_IMAGE_BYTES" =~ ^[1-9][0-9]*$ ]] || {
  echo "image byte budgets must be positive integers" >&2
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
API_REGISTRY_TAG="$REGISTRY_PREFIX/yiweilife-librechat:$RELEASE_ID"
ENGINE_REGISTRY_TAG="$REGISTRY_PREFIX/yiweilife-future-engine:$RELEASE_ID"

if [[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]]; then
  echo "Building immutable LibreChat release image: $API_TAG"
  mapfile -t API_CACHE_ARGS < <(cache_args api)
  "${DOCKER[@]}" build \
    ${BUILD_RESOURCE_ARGS[@]+"${BUILD_RESOURCE_ARGS[@]}"} \
    --platform "$TARGET_PLATFORM" \
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
    --platform "$TARGET_PLATFORM" \
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

image_size_bytes() {
  "${DOCKER[@]}" image inspect --format '{{.Size}}' "$1"
}

enforce_image_budget() {
  local image=$1
  local budget=$2
  local label=$3
  local size
  size=$(image_size_bytes "$image")
  [[ "$size" =~ ^[0-9]+$ ]] || {
    echo "$label image size is invalid: $size" >&2
    exit 1
  }
  [[ "$size" -le "$budget" ]] || {
    echo "$label image exceeds byte budget: size=$size budget=$budget" >&2
    exit 1
  }
  printf '%s' "$size"
}

push_registry_image() {
  local source_tag=$1
  local registry_tag=$2
  local output digest
  "${DOCKER[@]}" tag "$source_tag" "$registry_tag"
  if ! output=$("${DOCKER[@]}" push "$registry_tag" 2>&1); then
    printf '%s\n' "$output" >&2
    echo "registry push failed for $registry_tag" >&2
    exit 1
  fi
  digest=$(printf '%s\n' "$output" | sed -n 's/^.*digest: \(sha256:[0-9a-f]\{64\}\).*$/\1/p' | tail -n 1)
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "registry push did not return an immutable digest for $registry_tag" >&2
    exit 1
  }
  printf '%s@%s' "${registry_tag%:*}" "$digest"
}

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

API_IMAGE_BYTES=not-applicable
ENGINE_IMAGE_BYTES=not-applicable
API_REGISTRY_REF=not-applicable
ENGINE_REGISTRY_REF=not-applicable
STAGE_GATE=not-required
if [[ "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ]]; then
  STAGE_GATE=$STAGE_GATE_MODE
  API_IMAGE_BYTES=$(enforce_image_budget "$API_IMAGE" "$MAX_LIBRECHAT_IMAGE_BYTES" LibreChat)
  if [[ "$REGISTRY_PUSH" == true ]]; then
    API_REGISTRY_REF=$(push_registry_image "$API_TAG" "$API_REGISTRY_TAG")
  fi
fi
if [[ "$RELEASE_SERVICE" == future-engine || "$RELEASE_SERVICE" == all ]]; then
  STAGE_GATE=$STAGE_GATE_MODE
  ENGINE_IMAGE_BYTES=$(enforce_image_budget "$ENGINE_IMAGE" "$MAX_FUTURE_ENGINE_IMAGE_BYTES" future-engine)
  if [[ "$REGISTRY_PUSH" == true ]]; then
    ENGINE_REGISTRY_REF=$(push_registry_image "$ENGINE_TAG" "$ENGINE_REGISTRY_TAG")
  fi
fi

install -d -m 700 "$RELEASE_ROOT"
ENV_FILE="$RELEASE_ROOT/$RELEASE_ID.env"
MANIFEST_FILE="$RELEASE_ROOT/$RELEASE_ID.manifest"
EVIDENCE_ARTIFACT="$RELEASE_ROOT/$RELEASE_ID.evidence"
CLIENT_ARCHIVE_FILE="$RELEASE_ROOT/$RELEASE_ID.client.tar.zst"
STAGE_STATUS_FILE="$RELEASE_ROOT/$RELEASE_ID.stage-status"
[[ ! -e "$ENV_FILE" && ! -e "$MANIFEST_FILE" && ! -e "$EVIDENCE_ARTIFACT" && ! -e "$CLIENT_ARCHIVE_FILE" && ! -e "$STAGE_STATUS_FILE" ]] || {
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

CLIENT_ARCHIVE_NAME=not-applicable
CLIENT_ARCHIVE_SHA256=not-applicable
CLIENT_ARCHIVE_BYTES=not-applicable
if [[ "$CLIENT_ARTIFACT" == true && ( "$RELEASE_SERVICE" == api || "$RELEASE_SERVICE" == all ) ]]; then
  command -v zstd >/dev/null 2>&1 || { echo "zstd is required to create the immutable client artifact" >&2; exit 1; }
  CLIENT_TMP=$(mktemp -d "${TMPDIR:-/tmp}/yiwei-client-artifact.XXXXXX")
  CLIENT_CONTAINER=$("${DOCKER[@]}" create "$API_IMAGE")
  cleanup_client_artifact() {
    "${DOCKER[@]}" rm --force "$CLIENT_CONTAINER" >/dev/null 2>&1 || true
    rm -rf -- "$CLIENT_TMP"
  }
  trap 'cleanup_client_artifact; cleanup_build_context' EXIT
  "${DOCKER[@]}" cp "$CLIENT_CONTAINER:/app/client/dist" "$CLIENT_TMP/dist"
  if command -v xattr >/dev/null 2>&1; then
    xattr -cr "$CLIENT_TMP/dist"
  fi
  "${TAR_CREATE[@]}" -C "$CLIENT_TMP/dist" -cf - . | zstd -3 -T0 -o "$CLIENT_ARCHIVE_FILE" >/dev/null
  "$SCRIPT_DIR/verify-tar-provenance.sh" "$CLIENT_ARCHIVE_FILE"
  [[ -s "$CLIENT_ARCHIVE_FILE" ]] || { echo "client artifact archive is empty" >&2; exit 1; }
  CLIENT_ARCHIVE_NAME=$(basename -- "$CLIENT_ARCHIVE_FILE")
  CLIENT_ARCHIVE_SHA256=$(sha256_file "$CLIENT_ARCHIVE_FILE")
  CLIENT_ARCHIVE_BYTES=$(wc -c < "$CLIENT_ARCHIVE_FILE" | tr -d ' ')
  cleanup_client_artifact
  trap cleanup_build_context EXIT
fi

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
  printf 'librechat_registry_ref=%s\n' "$API_REGISTRY_REF"
  printf 'future_engine_registry_ref=%s\n' "$ENGINE_REGISTRY_REF"
  printf 'librechat_image_size_bytes=%s\n' "$API_IMAGE_BYTES"
  printf 'future_engine_image_size_bytes=%s\n' "$ENGINE_IMAGE_BYTES"
  printf 'target_platform=%s\n' "$TARGET_PLATFORM"
  printf 'stage_gate=%s\n' "$STAGE_GATE"
  printf 'data_backup_required=%s\n' "$([[ "$RELEASE_MODE" == full ]] && printf true || printf false)"
  printf 'client_artifact_file=%s\n' "$CLIENT_ARCHIVE_NAME"
  printf 'client_artifact_sha256=%s\n' "$CLIENT_ARCHIVE_SHA256"
  printf 'client_artifact_bytes=%s\n' "$CLIENT_ARCHIVE_BYTES"
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

{
  printf 'schema=yiwei.release-stage-status.v1\n'
  printf 'state=candidate_ready_local\n'
  printf 'release_id=%s\n' "$RELEASE_ID"
  printf 'candidate_env_sha256=%s\n' "$(sha256_file "$ENV_FILE")"
  printf 'candidate_manifest_sha256=%s\n' "$(sha256_file "$MANIFEST_FILE")"
  printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$STAGE_STATUS_FILE"
chmod 600 "$STAGE_STATUS_FILE"

echo "Release built without touching running containers."
echo "Scope: $RELEASE_SERVICE"
echo "Candidate: $ENV_FILE"
if [[ "$AUTO_STAGE" == true && "$STAGE_GATE" == required ]]; then
  bash "$SCRIPT_DIR/stage-release.sh" "$ENV_FILE"
else
  echo "Stage next: bash deploy/stage-release.sh .releases/$RELEASE_ID.env"
fi
echo "Apply only after state=deployable: bash deploy/apply-release.sh .releases/$RELEASE_ID.env"
