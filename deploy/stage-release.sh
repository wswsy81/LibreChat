#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
PRODUCTION_SSH=${PRODUCTION_SSH:-tencentcloud2}
PRODUCTION_APP_DIR=${PRODUCTION_APP_DIR:-/home/ubuntu/app/librechat}
MIN_FREE_AFTER_STAGE_BYTES=${MIN_FREE_AFTER_STAGE_BYTES:-2147483648}
EXPANSION_PERCENT=${EXPANSION_PERCENT:-220}
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
[[ -s "$CANDIDATE" && -s "$MANIFEST" && -s "$EVIDENCE" ]] || {
  echo "candidate env, manifest, and evidence are required" >&2
  exit 1
}

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
IMAGE_PATTERN='^sha256:[0-9a-f]{64}$'
TAG_PATTERN='^[A-Za-z0-9._/-]+:[A-Za-z0-9._-]+$'
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

if [[ -n "$DOCKER_BIN" ]]; then
  DOCKER=("$DOCKER_BIN")
elif docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi
command -v "$ZSTD_BIN" >/dev/null 2>&1 || { echo "zstd is required locally" >&2; exit 1; }

remote() {
  "$SSH_BIN" "$PRODUCTION_SSH" "$@"
}

remote_image_id() {
  local tag=$1
  local revision=$2
  [[ "$tag" != reused-active ]] || return 1
  remote "set -e; id=\$(sudo docker image inspect '$tag' --format '{{.Id}}' 2>/dev/null || true); [[ -n \"\$id\" ]] || exit 1; test \"\$(sudo docker image inspect '$tag' --format '{{.Architecture}}')\" = amd64; user=\$(sudo docker image inspect '$tag' --format '{{.Config.User}}'); [[ \"\$user\" = node || \"\$user\" = 1000 ]]; test \"\$(sudo docker image inspect '$tag' --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}')\" = '$revision'; printf '%s' \"\$id\""
}

local_image_size() {
  local tag=$1
  local source_id=$2
  [[ "$tag" != reused-active ]] || { printf '0'; return; }
  [[ "$("${DOCKER[@]}" image inspect "$tag" --format '{{.Id}}')" == "$source_id" ]] || {
    echo "local tag does not match candidate image: $tag" >&2
    exit 1
  }
  "${DOCKER[@]}" image inspect "$tag" --format '{{.Size}}'
}

API_LOADED=$(remote_image_id "$API_TAG" "$API_REVISION" || true)
ENGINE_LOADED=$(remote_image_id "$ENGINE_TAG" "$ENGINE_REVISION" || true)
API_BYTES=0
ENGINE_BYTES=0
[[ -n "$API_LOADED" || "$API_TAG" == reused-active ]] || API_BYTES=$(local_image_size "$API_TAG" "$API_SOURCE")
[[ -n "$ENGINE_LOADED" || "$ENGINE_TAG" == reused-active ]] || ENGINE_BYTES=$(local_image_size "$ENGINE_TAG" "$ENGINE_SOURCE")
TRANSFER_BYTES=$((API_BYTES + ENGINE_BYTES))
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

remote "cd '$PRODUCTION_APP_DIR' && sudo bash deploy/backup.sh"
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
  local revision=$2
  local loaded=$3
  if [[ -n "$loaded" ]]; then
    printf '%s' "$loaded"
    return
  fi
  echo "staging image: $tag" >&2
  set -o pipefail
  "${DOCKER[@]}" save "$tag" | "$ZSTD_BIN" -1 -T0 | remote "'$ZSTD_BIN' -d | sudo docker load >/dev/null"
  remote_image_id "$tag" "$revision"
}

if [[ "$API_TAG" == reused-active ]]; then
  API_LOADED=$(remote "cd '$PRODUCTION_APP_DIR' && sed -n 's/^LIBRECHAT_RELEASE_IMAGE=//p' .release.env")
else
  API_LOADED=$(transfer_image "$API_TAG" "$API_REVISION" "$API_LOADED")
fi
if [[ "$ENGINE_TAG" == reused-active ]]; then
  ENGINE_LOADED=$(remote "cd '$PRODUCTION_APP_DIR' && sed -n 's/^FUTURE_ENGINE_RELEASE_IMAGE=//p' .release.env")
else
  ENGINE_LOADED=$(transfer_image "$ENGINE_TAG" "$ENGINE_REVISION" "$ENGINE_LOADED")
fi
[[ "$API_LOADED" =~ $IMAGE_PATTERN && "$ENGINE_LOADED" =~ $IMAGE_PATTERN ]] || {
  echo "staged images did not resolve to content-addressed IDs" >&2
  exit 1
}

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/yiwei-stage-release.XXXXXX")
trap 'rm -rf -- "$TMP_DIR"' EXIT
TRANSPORT_TMP="$TMP_DIR/$RELEASE_ID.transport"
{
  printf 'schema=yiwei.release-transport.v1\n'
  printf 'status=passed\n'
  printf 'candidate_env_sha256=%s\n' "$(sha256_file "$CANDIDATE")"
  printf 'candidate_manifest_sha256=%s\n' "$(sha256_file "$MANIFEST")"
  printf 'librechat_source_image=%s\n' "$API_SOURCE"
  printf 'future_engine_source_image=%s\n' "$ENGINE_SOURCE"
  printf 'librechat_loaded_image=%s\n' "$API_LOADED"
  printf 'future_engine_loaded_image=%s\n' "$ENGINE_LOADED"
  printf 'librechat_revision=%s\n' "$API_REVISION"
  printf 'future_engine_revision=%s\n' "$ENGINE_REVISION"
} > "$TRANSPORT_TMP"
chmod 600 "$TRANSPORT_TMP"

REMOTE_TMP="/tmp/yiwei-release-$RELEASE_ID-$$"
remote "install -d -m 700 '$REMOTE_TMP'"
"$SCP_BIN" -q "$CANDIDATE" "$MANIFEST" "$EVIDENCE" "$TRANSPORT_TMP" "$PRODUCTION_SSH:$REMOTE_TMP/"
remote "set -e; sudo install -d -m 700 '$PRODUCTION_APP_DIR/.releases'; for file in '$REMOTE_TMP'/*; do target='$PRODUCTION_APP_DIR/.releases'/\$(basename \"\$file\"); if sudo test -e \"\$target\"; then test \"\$(sha256sum \"\$file\" | awk '{print \$1}')\" = \"\$(sudo sha256sum \"\$target\" | awk '{print \$1}')\"; else sudo install -m 600 \"\$file\" \"\$target\"; fi; done; rm -rf -- '$REMOTE_TMP'"

printf 'staged_transport=%s\n' "$PRODUCTION_APP_DIR/.releases/$RELEASE_ID.transport"
printf 'next=sudo bash deploy/apply-release.sh .releases/%s.env\n' "$RELEASE_ID"
