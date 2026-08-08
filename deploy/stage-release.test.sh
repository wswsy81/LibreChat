#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

APP_DIR="$TEST_ROOT/app"
RELEASE_ROOT="$APP_DIR/.releases"
REMOTE_APP="$TEST_ROOT/remote/app"
FAKE_BIN="$TEST_ROOT/bin"
FAKE_STATE="$TEST_ROOT/state"
mkdir -p "$RELEASE_ROOT" "$REMOTE_APP/deploy" "$FAKE_BIN" "$FAKE_STATE"
printf 'LIBRECHAT_RELEASE_IMAGE=sha256:%064d\nFUTURE_ENGINE_RELEASE_IMAGE=sha256:%064d\n' 8 9 > "$REMOTE_APP/.release.env"
printf '#!/usr/bin/env bash\nexit 0\n' > "$REMOTE_APP/deploy/backup.sh"
chmod +x "$REMOTE_APP/deploy/backup.sh"

API_SOURCE="sha256:$(printf 'a%.0s' {1..64})"
ENGINE_SOURCE="sha256:$(printf 'b%.0s' {1..64})"
API_LOADED="sha256:$(printf 'c%.0s' {1..64})"
ENGINE_LOADED="sha256:$(printf 'd%.0s' {1..64})"
API_REVISION="$(printf '1%.0s' {1..40})"
ENGINE_REVISION="$(printf '2%.0s' {1..40})"
RELEASE_ID=STAGE-TEST
API_TAG="yiweilife/librechat:$RELEASE_ID"
ENGINE_TAG="yiweilife/future-engine:$RELEASE_ID"

EVIDENCE="$RELEASE_ROOT/$RELEASE_ID.evidence"
cat > "$EVIDENCE" <<EOF
schema=yiwei.release-test-evidence.v1
status=passed
scope=full
suite=stage-release-test
librechat_revision=$API_REVISION
future_engine_revision=$ENGINE_REVISION
finished_at=2026-08-08T00:00:00Z
EOF
EVIDENCE_SHA=$(shasum -a 256 "$EVIDENCE" | awk '{print $1}')
cat > "$RELEASE_ROOT/$RELEASE_ID.env" <<EOF
LIBRECHAT_RELEASE_IMAGE=$API_SOURCE
FUTURE_ENGINE_RELEASE_IMAGE=$ENGINE_SOURCE
EOF
cat > "$RELEASE_ROOT/$RELEASE_ID.manifest" <<EOF
release_id=$RELEASE_ID
manifest_schema=yiwei.release-manifest.v2
release_service=all
release_mode=full
selected_channel=full
selected_by=classifier
owner_override=false
tool_recommendation=not-run
built_at=2026-08-08T00:00:00Z
librechat_revision=$API_REVISION
future_engine_revision=$ENGINE_REVISION
librechat_image=$API_SOURCE
future_engine_image=$ENGINE_SOURCE
librechat_tag=$API_TAG
future_engine_tag=$ENGINE_TAG
test_evidence_status=passed
test_evidence_scope=full
test_evidence_sha256=$EVIDENCE_SHA
test_evidence_file=$RELEASE_ID.evidence
runtime_config_rules_sha256=not-applicable
build_seconds=1
EOF

cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  info) exit 0 ;;
  save)
    printf '%s\n' "${2:-}" >> "$FAKE_STATE/save.log"
    printf 'fake-image-archive'
    ;;
  load)
    cat >/dev/null
    touch "$FAKE_STATE/api.loaded" "$FAKE_STATE/engine.loaded"
    ;;
  image)
    [[ "${2:-}" == inspect ]]
    format=
    target=
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == --format ]]; then format=$2; shift 2; continue; fi
      target=$1
      shift
    done
    is_api=false
    [[ "$target" == "$FAKE_API_TAG" || "$target" == "$FAKE_API_SOURCE" || "$target" == "$FAKE_API_LOADED" ]] && is_api=true
    if [[ "${FAKE_REMOTE:-0}" == 1 ]]; then
      if $is_api; then [[ -e "$FAKE_STATE/api.loaded" ]] || exit 1; else [[ -e "$FAKE_STATE/engine.loaded" ]] || exit 1; fi
    fi
    case "$format" in
      '{{.Id}}') $is_api && printf '%s\n' "$([[ "${FAKE_REMOTE:-0}" == 1 ]] && printf '%s' "$FAKE_API_LOADED" || printf '%s' "$FAKE_API_SOURCE")" || printf '%s\n' "$([[ "${FAKE_REMOTE:-0}" == 1 ]] && printf '%s' "$FAKE_ENGINE_LOADED" || printf '%s' "$FAKE_ENGINE_SOURCE")" ;;
      '{{.Size}}') printf '1000\n' ;;
      '{{.Architecture}}') printf 'amd64\n' ;;
      '{{.Config.User}}') printf 'node\n' ;;
      *org.opencontainers.image.revision*) $is_api && printf '%s\n' "$FAKE_API_REVISION" || printf '%s\n' "$FAKE_ENGINE_REVISION" ;;
      '') exit 0 ;;
      *) exit 1 ;;
    esac
    ;;
  builder) exit 0 ;;
  *) exit 1 ;;
esac
EOF

cat > "$FAKE_BIN/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
shift
FAKE_REMOTE=1 bash -c "$*"
EOF

cat > "$FAKE_BIN/scp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == -q ]] && shift
destination=${*: -1}
destination=${destination#*:}
mkdir -p "$destination"
while [[ $# -gt 1 ]]; do
  cp "$1" "$destination/"
  shift
done
EOF

cat > "$FAKE_BIN/sudo" <<'EOF'
#!/usr/bin/env bash
exec "$@"
EOF

cat > "$FAKE_BIN/zstd" <<'EOF'
#!/usr/bin/env bash
cat
EOF
chmod +x "$FAKE_BIN"/*

export PATH="$FAKE_BIN:$PATH"
export FAKE_STATE
export FAKE_API_TAG="$API_TAG"
export FAKE_ENGINE_TAG="$ENGINE_TAG"
export FAKE_API_SOURCE="$API_SOURCE"
export FAKE_ENGINE_SOURCE="$ENGINE_SOURCE"
export FAKE_API_LOADED="$API_LOADED"
export FAKE_ENGINE_LOADED="$ENGINE_LOADED"
export FAKE_API_REVISION="$API_REVISION"
export FAKE_ENGINE_REVISION="$ENGINE_REVISION"

APP_DIR_OVERRIDE="$APP_DIR" \
RELEASE_ROOT="$RELEASE_ROOT" \
PRODUCTION_SSH=fake \
PRODUCTION_APP_DIR="$REMOTE_APP" \
DOCKER_BIN="$FAKE_BIN/docker" \
SSH_BIN="$FAKE_BIN/ssh" \
SCP_BIN="$FAKE_BIN/scp" \
ZSTD_BIN="$FAKE_BIN/zstd" \
MIN_FREE_AFTER_STAGE_BYTES=1 \
EXPANSION_PERCENT=1 \
  bash "$SCRIPT_DIR/stage-release.sh" "$RELEASE_ROOT/$RELEASE_ID.env" >/dev/null

[[ $(wc -l < "$FAKE_STATE/save.log") -eq 2 ]]
TRANSPORT="$REMOTE_APP/.releases/$RELEASE_ID.transport"
[[ -s "$TRANSPORT" ]]
grep -qx "librechat_loaded_image=$API_LOADED" "$TRANSPORT"
grep -qx "future_engine_loaded_image=$ENGINE_LOADED" "$TRANSPORT"
grep -qx "candidate_env_sha256=$(shasum -a 256 "$RELEASE_ROOT/$RELEASE_ID.env" | awk '{print $1}')" "$TRANSPORT"
grep -qx "candidate_manifest_sha256=$(shasum -a 256 "$RELEASE_ROOT/$RELEASE_ID.manifest" | awk '{print $1}')" "$TRANSPORT"

APP_DIR_OVERRIDE="$APP_DIR" \
RELEASE_ROOT="$RELEASE_ROOT" \
PRODUCTION_SSH=fake \
PRODUCTION_APP_DIR="$REMOTE_APP" \
DOCKER_BIN="$FAKE_BIN/docker" \
SSH_BIN="$FAKE_BIN/ssh" \
SCP_BIN="$FAKE_BIN/scp" \
ZSTD_BIN="$FAKE_BIN/zstd" \
MIN_FREE_AFTER_STAGE_BYTES=1 \
EXPANSION_PERCENT=1 \
  bash "$SCRIPT_DIR/stage-release.sh" "$RELEASE_ROOT/$RELEASE_ID.env" >/dev/null

[[ $(wc -l < "$FAKE_STATE/save.log") -eq 2 ]]
printf 'stage release tests passed\n'
