#!/usr/bin/env bash
set -euo pipefail
export COPYFILE_DISABLE=1

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
ACTIVE_RELEASE_ENV=${ACTIVE_RELEASE_ENV:-"$APP_DIR/.release.env"}
RELEASE_ID=${1:-"CLIENT-$(date -u +%Y%m%dT%H%M%SZ)"}
AUTO_STAGE=${AUTO_STAGE:-true}
TAR_CREATE=(tar)
tar --no-xattrs -cf /dev/null -T /dev/null 2>/dev/null && TAR_CREATE+=(--no-xattrs) || true

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "unsafe release id" >&2; exit 1; }
[[ "$AUTO_STAGE" == true || "$AUTO_STAGE" == false ]] || { echo "AUTO_STAGE must be true or false" >&2; exit 1; }
[[ -s "$ACTIVE_RELEASE_ENV" ]] || { echo "active release env is required" >&2; exit 1; }

read_value() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "$file"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

LIBRECHAT_REVISION=$(bash "$SCRIPT_DIR/verify-revision.sh" "$APP_DIR" HEAD librechat_revision)
API_IMAGE=$(read_value LIBRECHAT_RELEASE_IMAGE "$ACTIVE_RELEASE_ENV")
ENGINE_IMAGE=$(read_value FUTURE_ENGINE_RELEASE_IMAGE "$ACTIVE_RELEASE_ENV")
IMAGE_PATTERN='^sha256:[0-9a-f]{64}$'
[[ "$API_IMAGE" =~ $IMAGE_PATTERN && "$ENGINE_IMAGE" =~ $IMAGE_PATTERN ]] || {
  echo "active release env must contain two content-addressed image IDs" >&2
  exit 1
}

install -d -m 700 "$RELEASE_ROOT/.test-evidence"
EVIDENCE_SOURCE="$RELEASE_ROOT/.test-evidence/$RELEASE_ID.evidence"
TEST_EVIDENCE_OUTPUT="$EVIDENCE_SOURCE" TEST_EVIDENCE_SCOPE=client-static \
  bash "$SCRIPT_DIR/verify-hotfix.sh" client

ENV_FILE="$RELEASE_ROOT/$RELEASE_ID.env"
MANIFEST_FILE="$RELEASE_ROOT/$RELEASE_ID.manifest"
EVIDENCE_FILE="$RELEASE_ROOT/$RELEASE_ID.evidence"
ARCHIVE_FILE="$RELEASE_ROOT/$RELEASE_ID.client.tar.zst"
STAGE_STATUS_FILE="$RELEASE_ROOT/$RELEASE_ID.stage-status"
for output in "$ENV_FILE" "$MANIFEST_FILE" "$EVIDENCE_FILE" "$ARCHIVE_FILE" "$STAGE_STATUS_FILE"; do
  [[ ! -e "$output" ]] || { echo "release artifact already exists: $output" >&2; exit 1; }
done

command -v zstd >/dev/null 2>&1 || { echo "zstd is required" >&2; exit 1; }
[[ -s "$APP_DIR/client/dist/index.html" ]] || { echo "client build did not produce index.html" >&2; exit 1; }
if command -v xattr >/dev/null 2>&1; then
  xattr -cr "$APP_DIR/client/dist"
fi
"${TAR_CREATE[@]}" -C "$APP_DIR/client/dist" -cf - . | zstd -3 -T0 -o "$ARCHIVE_FILE" >/dev/null
"$SCRIPT_DIR/verify-tar-provenance.sh" "$ARCHIVE_FILE"
install -m 600 "$EVIDENCE_SOURCE" "$EVIDENCE_FILE"

EVIDENCE_SHA=$(sha256_file "$EVIDENCE_FILE")
ARCHIVE_SHA=$(sha256_file "$ARCHIVE_FILE")
ARCHIVE_BYTES=$(wc -c < "$ARCHIVE_FILE" | tr -d ' ')
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

umask 077
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$API_IMAGE"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$ENGINE_IMAGE"
} > "$ENV_FILE"
{
  printf 'release_id=%s\n' "$RELEASE_ID"
  printf 'manifest_schema=yiwei.release-manifest.v2\n'
  printf 'release_service=client\n'
  printf 'release_mode=static\n'
  printf 'selected_channel=client-static\n'
  printf 'selected_by=classifier\n'
  printf 'built_at=%s\n' "$BUILT_AT"
  printf 'librechat_revision=%s\n' "$LIBRECHAT_REVISION"
  printf 'future_engine_revision=reused-active\n'
  printf 'librechat_image=%s\n' "$API_IMAGE"
  printf 'future_engine_image=%s\n' "$ENGINE_IMAGE"
  printf 'librechat_tag=reused-active\n'
  printf 'future_engine_tag=reused-active\n'
  printf 'librechat_registry_ref=not-applicable\n'
  printf 'future_engine_registry_ref=not-applicable\n'
  printf 'stage_gate=required\n'
  printf 'data_backup_required=false\n'
  printf 'test_evidence_status=passed\n'
  printf 'test_evidence_scope=client-static\n'
  printf 'test_evidence_sha256=%s\n' "$EVIDENCE_SHA"
  printf 'test_evidence_file=%s\n' "$(basename -- "$EVIDENCE_FILE")"
  printf 'runtime_config_rules_sha256=not-applicable\n'
  printf 'client_artifact_file=%s\n' "$(basename -- "$ARCHIVE_FILE")"
  printf 'client_artifact_sha256=%s\n' "$ARCHIVE_SHA"
  printf 'client_artifact_bytes=%s\n' "$ARCHIVE_BYTES"
} > "$MANIFEST_FILE"
{
  printf 'schema=yiwei.release-stage-status.v1\n'
  printf 'state=candidate_ready_local\n'
  printf 'release_id=%s\n' "$RELEASE_ID"
  printf 'candidate_env_sha256=%s\n' "$(sha256_file "$ENV_FILE")"
  printf 'candidate_manifest_sha256=%s\n' "$(sha256_file "$MANIFEST_FILE")"
  printf 'updated_at=%s\n' "$BUILT_AT"
} > "$STAGE_STATUS_FILE"
chmod 600 "$ENV_FILE" "$MANIFEST_FILE" "$ARCHIVE_FILE" "$STAGE_STATUS_FILE"

echo "Client-only candidate: $ENV_FILE"
if [[ "$AUTO_STAGE" == true ]]; then
  bash "$SCRIPT_DIR/stage-release.sh" "$ENV_FILE"
else
  echo "Stage next: bash deploy/stage-release.sh .releases/$RELEASE_ID.env"
fi
