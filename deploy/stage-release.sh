#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
PRODUCTION_SSH=${PRODUCTION_SSH:-tencentcloud2}
PRODUCTION_APP_DIR=${PRODUCTION_APP_DIR:-/home/ubuntu/app/librechat}
MIN_FREE_AFTER_STAGE_BYTES=${MIN_FREE_AFTER_STAGE_BYTES:-2147483648}
EXPANSION_PERCENT=${EXPANSION_PERCENT:-220}
PRODUCTION_BACKUP_DIR=${PRODUCTION_BACKUP_DIR:-/root/backups}
SSH_BIN=${SSH_BIN:-ssh}
SCP_BIN=${SCP_BIN:-scp}
ZSTD_BIN=${ZSTD_BIN:-zstd}
DOCKER_BIN=${DOCKER_BIN:-}
PREFLIGHT_ONLY=false
CANDIDATE=

usage() {
  echo "usage: bash deploy/stage-release.sh [--preflight-only] .releases/<release>.env" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight-only) PREFLIGHT_ONLY=true ;;
    -h|--help) usage; exit 0 ;;
    *)
      [[ -z "$CANDIDATE" ]] || { usage; exit 2; }
      CANDIDATE=$1
      ;;
  esac
  shift
done
[[ -n "$CANDIDATE" ]] || { usage; exit 2; }

if [[ "$CANDIDATE" != /* ]]; then
  CANDIDATE="$APP_DIR/$CANDIDATE"
fi
case "$(cd -- "$(dirname -- "$CANDIDATE")" && pwd)/$(basename -- "$CANDIDATE")" in
  "$RELEASE_ROOT"/*.env) ;;
  *) echo "candidate must live under $RELEASE_ROOT" >&2; exit 1 ;;
esac

MANIFEST=${CANDIDATE%.env}.manifest
EVIDENCE=${CANDIDATE%.env}.evidence
TRANSPORT=${CANDIDATE%.env}.transport
STAGE_STATUS=${CANDIDATE%.env}.stage-status
[[ -s "$CANDIDATE" && -s "$MANIFEST" && -s "$EVIDENCE" ]] || {
  echo "candidate env, manifest, and evidence are required" >&2
  exit 1
}

read_value() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "$file"
}

read_optional() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) print "" }' "$file"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

write_stage_status() {
  local state=$1
  local detail=${2:-}
  local tmp="${STAGE_STATUS}.tmp.$$"
  {
    printf 'schema=yiwei.release-stage-status.v1\n'
    printf 'state=%s\n' "$state"
    printf 'release_id=%s\n' "$RELEASE_ID"
    printf 'candidate_env_sha256=%s\n' "$(sha256_file "$CANDIDATE")"
    printf 'candidate_manifest_sha256=%s\n' "$(sha256_file "$MANIFEST")"
    printf 'detail=%s\n' "$detail"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$STAGE_STATUS"
}

[[ "$(read_value manifest_schema "$MANIFEST")" == yiwei.release-manifest.v2 ]] || {
  echo "only yiwei.release-manifest.v2 candidates can be staged" >&2
  exit 1
}
[[ "$(read_value test_evidence_status "$MANIFEST")" == passed ]] || {
  echo "candidate test evidence is not passed" >&2
  exit 1
}
[[ "$(sha256_file "$EVIDENCE")" == "$(read_value test_evidence_sha256 "$MANIFEST")" ]] || {
  echo "candidate evidence SHA mismatch" >&2
  exit 1
}
[[ "$(basename -- "$EVIDENCE")" == "$(read_value test_evidence_file "$MANIFEST")" ]] || {
  echo "candidate evidence filename does not match manifest" >&2
  exit 1
}

RELEASE_ID=$(read_value release_id "$MANIFEST")
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "unsafe release id" >&2; exit 1; }
API_SOURCE=$(read_value LIBRECHAT_RELEASE_IMAGE "$CANDIDATE")
ENGINE_SOURCE=$(read_value FUTURE_ENGINE_RELEASE_IMAGE "$CANDIDATE")
API_TAG=$(read_value librechat_tag "$MANIFEST")
ENGINE_TAG=$(read_value future_engine_tag "$MANIFEST")
API_REVISION=$(read_value librechat_revision "$MANIFEST")
ENGINE_REVISION=$(read_value future_engine_revision "$MANIFEST")
API_REGISTRY_REF=$(read_optional librechat_registry_ref "$MANIFEST")
ENGINE_REGISTRY_REF=$(read_optional future_engine_registry_ref "$MANIFEST")
CLIENT_ARTIFACT_NAME=$(read_optional client_artifact_file "$MANIFEST")
CLIENT_ARTIFACT_SHA256=$(read_optional client_artifact_sha256 "$MANIFEST")
CLIENT_ARTIFACT_BYTES=$(read_optional client_artifact_bytes "$MANIFEST")
DATA_BACKUP_REQUIRED=$(read_optional data_backup_required "$MANIFEST")
[[ -n "$DATA_BACKUP_REQUIRED" ]] || DATA_BACKUP_REQUIRED=true
[[ "$DATA_BACKUP_REQUIRED" == true || "$DATA_BACKUP_REQUIRED" == false ]] || {
  echo "data_backup_required must be true or false" >&2
  exit 1
}
IMAGE_PATTERN='^sha256:[0-9a-f]{64}$'
TAG_PATTERN='^[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$'
REGISTRY_REF_PATTERN='^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+@sha256:[0-9a-f]{64}$'
REVISION_PATTERN='^([0-9a-f]{40}|reused-active)$'
[[ "$API_SOURCE" =~ $IMAGE_PATTERN && "$ENGINE_SOURCE" =~ $IMAGE_PATTERN ]] || {
  echo "candidate env must contain content-addressed image IDs" >&2
  exit 1
}
[[ "$API_TAG" == reused-active || "$API_TAG" =~ $TAG_PATTERN ]] || { echo "unsafe LibreChat tag" >&2; exit 1; }
[[ "$ENGINE_TAG" == reused-active || "$ENGINE_TAG" =~ $TAG_PATTERN ]] || { echo "unsafe future-engine tag" >&2; exit 1; }
[[ "$API_REVISION" =~ $REVISION_PATTERN && "$ENGINE_REVISION" =~ $REVISION_PATTERN ]] || {
  echo "candidate revisions are invalid" >&2
  exit 1
}
[[ -z "$API_REGISTRY_REF" || "$API_REGISTRY_REF" == not-applicable || "$API_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN ]] || {
  echo "invalid LibreChat registry ref" >&2
  exit 1
}
[[ -z "$ENGINE_REGISTRY_REF" || "$ENGINE_REGISTRY_REF" == not-applicable || "$ENGINE_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN ]] || {
  echo "invalid future-engine registry ref" >&2
  exit 1
}
USE_REGISTRY=false
if [[ "$API_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN || "$ENGINE_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN ]]; then
  USE_REGISTRY=true
fi
if [[ "$USE_REGISTRY" == true ]]; then
  [[ "$API_TAG" == reused-active || "$API_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN ]] || {
    echo "changed LibreChat image is missing an immutable registry ref" >&2
    exit 1
  }
  [[ "$ENGINE_TAG" == reused-active || "$ENGINE_REGISTRY_REF" =~ $REGISTRY_REF_PATTERN ]] || {
    echo "changed future-engine image is missing an immutable registry ref" >&2
    exit 1
  }
fi
CLIENT_ARTIFACT=
CLIENT_TRANSFER_BYTES=0
if [[ -n "$CLIENT_ARTIFACT_NAME" && "$CLIENT_ARTIFACT_NAME" != not-applicable ]]; then
  case "$CLIENT_ARTIFACT_NAME" in
    */*|*..*) echo "client artifact file must be a basename" >&2; exit 1 ;;
  esac
  [[ "$CLIENT_ARTIFACT_SHA256" =~ ^[0-9a-f]{64}$ && "$CLIENT_ARTIFACT_BYTES" =~ ^[1-9][0-9]*$ ]] || {
    echo "client artifact metadata is invalid" >&2
    exit 1
  }
  CLIENT_ARTIFACT="$RELEASE_ROOT/$CLIENT_ARTIFACT_NAME"
  [[ -s "$CLIENT_ARTIFACT" ]] || { echo "client artifact is missing: $CLIENT_ARTIFACT" >&2; exit 1; }
  [[ "$(sha256_file "$CLIENT_ARTIFACT")" == "$CLIENT_ARTIFACT_SHA256" ]] || {
    echo "client artifact SHA mismatch" >&2
    exit 1
  }
  [[ "$(wc -c < "$CLIENT_ARTIFACT" | tr -d ' ')" == "$CLIENT_ARTIFACT_BYTES" ]] || {
    echo "client artifact byte size mismatch" >&2
    exit 1
  }
  CLIENT_TRANSFER_BYTES=$CLIENT_ARTIFACT_BYTES
fi

if [[ -n "$DOCKER_BIN" ]]; then
  DOCKER=("$DOCKER_BIN")
elif docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi
if [[ "$USE_REGISTRY" == false ]]; then
  command -v "$ZSTD_BIN" >/dev/null 2>&1 || { echo "zstd is required locally for legacy image transfer" >&2; exit 1; }
fi

remote() {
  "$SSH_BIN" "$PRODUCTION_SSH" "$@"
}

production_permission_preflight() {
  remote "set -e;
    app='$PRODUCTION_APP_DIR';
    test -d \"\$app\";
    app_uid=\$(stat -c %u \"\$app\");
    app_gid=\$(stat -c %g \"\$app\");
    test \"\$(id -u)\" = \"\$app_uid\";
    test \"\$(id -g)\" = \"\$app_gid\";
    test -f \"\$app/.release.env\";
    test \"\$(stat -c %a \"\$app/.release.env\")\" = 600;
    test \"\$(stat -c %u \"\$app/.release.env\")\" = \"\$app_uid\";
    test \"\$(stat -c %g \"\$app/.release.env\")\" = \"\$app_gid\";
    test -r \"\$app/.release.env\";
    sudo -n true;
    sudo -n docker info >/dev/null;
    sudo -n install -d -o \"\$app_uid\" -g \"\$app_gid\" -m 700 \"\$app/.releases\";
    sudo -n install -d -m 755 \"\$app/client-releases\";
    test \"\$(stat -c %u \"\$app/.releases\")\" = \"\$app_uid\";
    test \"\$(stat -c %g \"\$app/.releases\")\" = \"\$app_gid\";
    test \"\$(stat -c %a \"\$app/.releases\")\" = 700;
    sudo -n test -w \"\$app/client-releases\""
}

production_permission_preflight
REMOTE_APP_UID=$(remote "stat -c %u '$PRODUCTION_APP_DIR'")
REMOTE_APP_GID=$(remote "stat -c %g '$PRODUCTION_APP_DIR'")
printf 'permission_preflight=passed\n'

CANDIDATE_ENV_SHA=$(sha256_file "$CANDIDATE")
CANDIDATE_MANIFEST_SHA=$(sha256_file "$MANIFEST")
if remote "set -e; root='$PRODUCTION_APP_DIR/.releases'; status=\"\$root/$RELEASE_ID.stage-status\"; transport=\"\$root/$RELEASE_ID.transport\"; test -s \"\$status\" -a -s \"\$transport\"; grep -qx 'schema=yiwei.release-stage-status.v1' \"\$status\"; grep -qx 'state=deployable' \"\$status\"; grep -qx 'candidate_env_sha256=$CANDIDATE_ENV_SHA' \"\$status\"; grep -qx 'candidate_manifest_sha256=$CANDIDATE_MANIFEST_SHA' \"\$status\"; grep -qx 'status=passed' \"\$transport\"; grep -qx 'candidate_env_sha256=$CANDIDATE_ENV_SHA' \"\$transport\"; grep -qx 'candidate_manifest_sha256=$CANDIDATE_MANIFEST_SHA' \"\$transport\"" >/dev/null 2>&1; then
  write_stage_status deployable already-staged
  printf 'already_deployable=true\n'
  printf 'next=sudo bash deploy/apply-release.sh .releases/%s.env\n' "$RELEASE_ID"
  exit 0
fi

remote_image_id() {
  local reference=$1
  local revision=$2
  [[ "$reference" != reused-active ]] || return 1
  remote "set -e; id=\$(sudo docker image inspect '$reference' --format '{{.Id}}' 2>/dev/null || true); [[ -n \"\$id\" ]] || exit 1; test \"\$(sudo docker image inspect '$reference' --format '{{.Architecture}}')\" = amd64; user=\$(sudo docker image inspect '$reference' --format '{{.Config.User}}'); [[ \"\$user\" = node || \"\$user\" = 1000 ]]; test \"\$(sudo docker image inspect '$reference' --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}')\" = '$revision'; printf '%s' \"\$id\""
}

local_image_size() {
  local reference=$1
  local source_id=$2
  [[ "$reference" != reused-active ]] || { printf '0'; return; }
  [[ "$("${DOCKER[@]}" image inspect "$reference" --format '{{.Id}}')" == "$source_id" ]] || {
    echo "local image does not match candidate image: $reference" >&2
    exit 1
  }
  "${DOCKER[@]}" image inspect "$reference" --format '{{.Size}}'
}

API_REMOTE_REF=$API_TAG
ENGINE_REMOTE_REF=$ENGINE_TAG
[[ "$USE_REGISTRY" == false || "$API_TAG" == reused-active ]] || API_REMOTE_REF=$API_REGISTRY_REF
[[ "$USE_REGISTRY" == false || "$ENGINE_TAG" == reused-active ]] || ENGINE_REMOTE_REF=$ENGINE_REGISTRY_REF
API_LOADED=$(remote_image_id "$API_REMOTE_REF" "$API_REVISION" || true)
ENGINE_LOADED=$(remote_image_id "$ENGINE_REMOTE_REF" "$ENGINE_REVISION" || true)
API_BYTES=0
ENGINE_BYTES=0
[[ -n "$API_LOADED" || "$API_TAG" == reused-active ]] || API_BYTES=$(local_image_size "$API_TAG" "$API_SOURCE")
[[ -n "$ENGINE_LOADED" || "$ENGINE_TAG" == reused-active ]] || ENGINE_BYTES=$(local_image_size "$ENGINE_TAG" "$ENGINE_SOURCE")
TRANSFER_BYTES=$((API_BYTES + ENGINE_BYTES + CLIENT_TRANSFER_BYTES))
REQUIRED_BYTES=$((TRANSFER_BYTES * EXPANSION_PERCENT / 100 + MIN_FREE_AFTER_STAGE_BYTES))
AVAILABLE_BYTES=$(remote "df -Pk '$PRODUCTION_APP_DIR' | awk 'NR == 2 { printf \"%.0f\\n\", \$4 * 1024 }'")

printf 'release_id=%s\n' "$RELEASE_ID"
printf 'transfer_bytes=%s\n' "$TRANSFER_BYTES"
printf 'required_free_bytes=%s\n' "$REQUIRED_BYTES"
printf 'available_free_bytes=%s\n' "$AVAILABLE_BYTES"
printf 'api_already_staged=%s\n' "$([[ -n "$API_LOADED" || "$API_TAG" == reused-active ]] && printf true || printf false)"
printf 'engine_already_staged=%s\n' "$([[ -n "$ENGINE_LOADED" || "$ENGINE_TAG" == reused-active ]] && printf true || printf false)"

if [[ "$PREFLIGHT_ONLY" == true ]]; then
  [[ "$AVAILABLE_BYTES" -ge "$REQUIRED_BYTES" ]] || exit 3
  exit 0
fi

TRANSPORT_MODE=legacy-save-load
[[ "$USE_REGISTRY" == false ]] || TRANSPORT_MODE=registry-pull
if [[ "$API_TAG" == reused-active && "$ENGINE_TAG" == reused-active && -n "$CLIENT_ARTIFACT" ]]; then
  TRANSPORT_MODE=artifact-only
fi
write_stage_status staging "$TRANSPORT_MODE"
TMP_DIR=
stage_failed() {
  local status=$?
  trap - EXIT
  [[ -z "$TMP_DIR" ]] || rm -rf -- "$TMP_DIR"
  if [[ $status -ne 0 ]]; then
    write_stage_status failed "stage_exit_$status" || true
  fi
  exit "$status"
}
trap stage_failed EXIT

if [[ "$DATA_BACKUP_REQUIRED" == true ]]; then
  remote "cd '$PRODUCTION_APP_DIR' && sudo bash deploy/backup.sh"
  BACKUP_REFERENCE=$(remote "set -e; latest=\$(sudo find '$PRODUCTION_BACKUP_DIR' -mindepth 2 -maxdepth 2 -type f -name VERIFIED -size +0c -print | sort | tail -n 1); test -n \"\$latest\"; printf '%s' \"\${latest%/VERIFIED}\"")
else
  BACKUP_REFERENCE=$(remote "set -e; latest=\$(sudo find '$PRODUCTION_BACKUP_DIR' -mindepth 2 -maxdepth 2 -type f -name VERIFIED -size +0c -print | sort | tail -n 1); test -n \"\$latest\"; printf '%s' \"\${latest%/VERIFIED}\"")
  echo "code/config staging reuses verified backup: $BACKUP_REFERENCE" >&2
fi
if [[ "$AVAILABLE_BYTES" -lt "$REQUIRED_BYTES" ]]; then
  remote "sudo docker image prune --force >/dev/null; sudo docker builder prune --force >/dev/null"
  AVAILABLE_BYTES=$(remote "df -Pk '$PRODUCTION_APP_DIR' | awk 'NR == 2 { printf \"%.0f\\n\", \$4 * 1024 }'")
fi
[[ "$AVAILABLE_BYTES" -ge "$REQUIRED_BYTES" ]] || {
  echo "insufficient production disk after safe cache cleanup: required=$REQUIRED_BYTES available=$AVAILABLE_BYTES" >&2
  exit 1
}

transfer_image() {
  local tag=$1
  local registry_ref=$2
  local revision=$3
  local loaded=$4
  if [[ -n "$loaded" ]]; then
    printf '%s' "$loaded"
    return
  fi
  if [[ "$USE_REGISTRY" == true ]]; then
    echo "pulling immutable image: $registry_ref" >&2
    remote "sudo docker pull '$registry_ref' >/dev/null"
    remote_image_id "$registry_ref" "$revision"
    return
  fi
  echo "staging legacy image archive: $tag" >&2
  set -o pipefail
  "${DOCKER[@]}" save "$tag" | "$ZSTD_BIN" -1 -T0 | remote "'$ZSTD_BIN' -d | sudo docker load >/dev/null"
  remote_image_id "$tag" "$revision"
}

if [[ "$API_TAG" == reused-active ]]; then
  API_LOADED=$(remote "cd '$PRODUCTION_APP_DIR' && sed -n 's/^LIBRECHAT_RELEASE_IMAGE=//p' .release.env")
else
  API_LOADED=$(transfer_image "$API_TAG" "$API_REGISTRY_REF" "$API_REVISION" "$API_LOADED")
fi
if [[ "$ENGINE_TAG" == reused-active ]]; then
  ENGINE_LOADED=$(remote "cd '$PRODUCTION_APP_DIR' && sed -n 's/^FUTURE_ENGINE_RELEASE_IMAGE=//p' .release.env")
else
  ENGINE_LOADED=$(transfer_image "$ENGINE_TAG" "$ENGINE_REGISTRY_REF" "$ENGINE_REVISION" "$ENGINE_LOADED")
fi
[[ "$API_LOADED" =~ $IMAGE_PATTERN && "$ENGINE_LOADED" =~ $IMAGE_PATTERN ]] || {
  echo "staged images did not resolve to content-addressed IDs" >&2
  exit 1
}

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/yiwei-stage-release.XXXXXX")
TRANSPORT_TMP="$TMP_DIR/$RELEASE_ID.transport"
{
  printf 'schema=yiwei.release-transport.v1\n'
  printf 'status=passed\n'
  printf 'transport_mode=%s\n' "$TRANSPORT_MODE"
  printf 'candidate_env_sha256=%s\n' "$(sha256_file "$CANDIDATE")"
  printf 'candidate_manifest_sha256=%s\n' "$(sha256_file "$MANIFEST")"
  printf 'librechat_source_image=%s\n' "$API_SOURCE"
  printf 'future_engine_source_image=%s\n' "$ENGINE_SOURCE"
  printf 'librechat_loaded_image=%s\n' "$API_LOADED"
  printf 'future_engine_loaded_image=%s\n' "$ENGINE_LOADED"
  printf 'librechat_revision=%s\n' "$API_REVISION"
  printf 'future_engine_revision=%s\n' "$ENGINE_REVISION"
  printf 'librechat_registry_ref=%s\n' "${API_REGISTRY_REF:-not-applicable}"
  printf 'future_engine_registry_ref=%s\n' "${ENGINE_REGISTRY_REF:-not-applicable}"
  printf 'client_artifact_sha256=%s\n' "${CLIENT_ARTIFACT_SHA256:-not-applicable}"
  printf 'client_staged_dir=%s\n' "$([[ -n "$CLIENT_ARTIFACT" ]] && printf 'client-releases/%s' "$CLIENT_ARTIFACT_SHA256" || printf not-applicable)"
  printf 'backup_reference=%s\n' "$BACKUP_REFERENCE"
} > "$TRANSPORT_TMP"
chmod 600 "$TRANSPORT_TMP"

REMOTE_TMP="/tmp/yiwei-release-$RELEASE_ID-$$"
remote "install -d -m 700 '$REMOTE_TMP'"
FILES_TO_COPY=("$CANDIDATE" "$MANIFEST" "$EVIDENCE" "$TRANSPORT_TMP")
[[ -z "$CLIENT_ARTIFACT" ]] || FILES_TO_COPY+=("$CLIENT_ARTIFACT")
"$SCP_BIN" -q "${FILES_TO_COPY[@]}" "$PRODUCTION_SSH:$REMOTE_TMP/"
remote "set -e; sudo install -d -o '$REMOTE_APP_UID' -g '$REMOTE_APP_GID' -m 700 '$PRODUCTION_APP_DIR/.releases'; for file in '$REMOTE_TMP'/*; do name=\$(basename \"\$file\"); target='$PRODUCTION_APP_DIR/.releases'/\$name; if sudo test -e \"\$target\"; then test \"\$(sha256sum \"\$file\" | awk '{print \$1}')\" = \"\$(sudo sha256sum \"\$target\" | awk '{print \$1}')\"; sudo chown '$REMOTE_APP_UID:$REMOTE_APP_GID' \"\$target\"; sudo chmod 600 \"\$target\"; else sudo install -o '$REMOTE_APP_UID' -g '$REMOTE_APP_GID' -m 600 \"\$file\" \"\$target\"; fi; done"
if [[ -n "$CLIENT_ARTIFACT" ]]; then
  remote "set -e; root='$PRODUCTION_APP_DIR/client-releases'; target=\"\$root/$CLIENT_ARTIFACT_SHA256\"; sudo install -d -m 755 \"\$root\"; if ! sudo test -s \"\$target/index.html\"; then tmp=\"\$root/.${CLIENT_ARTIFACT_SHA256}.tmp.$$\"; sudo rm -rf -- \"\$tmp\" \"\$target\"; sudo install -d -m 755 \"\$tmp\"; sudo '$ZSTD_BIN' -dc '$PRODUCTION_APP_DIR/.releases/$CLIENT_ARTIFACT_NAME' | sudo tar -xf - -C \"\$tmp\"; sudo find \"\$tmp\" -type d -exec chmod 755 {} +; sudo find \"\$tmp\" -type f -exec chmod 644 {} +; sudo test -s \"\$tmp/index.html\"; sudo mv \"\$tmp\" \"\$target\"; fi"
fi
write_stage_status deployable "$TRANSPORT_MODE"
"$SCP_BIN" -q "$STAGE_STATUS" "$PRODUCTION_SSH:$REMOTE_TMP/"
remote "set -e; sudo install -o '$REMOTE_APP_UID' -g '$REMOTE_APP_GID' -m 600 '$REMOTE_TMP/$(basename -- "$STAGE_STATUS")' '$PRODUCTION_APP_DIR/.releases/$(basename -- "$STAGE_STATUS")'; rm -rf -- '$REMOTE_TMP'"

trap - EXIT
rm -rf -- "$TMP_DIR"

printf 'staged_transport=%s\n' "$PRODUCTION_APP_DIR/.releases/$RELEASE_ID.transport"
printf 'next=sudo bash deploy/apply-release.sh .releases/%s.env\n' "$RELEASE_ID"
