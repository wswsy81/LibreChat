#!/usr/bin/env bash
set -euo pipefail
export COPYFILE_DISABLE=1

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
BRAIN_DIR=$(cd -- "$APP_DIR/../../.." && pwd)
source "$SCRIPT_DIR/source-release-scope.sh"
TARGET=${TARGET:-tencentcloud2}
PRODUCTION_APP_DIR=${PRODUCTION_APP_DIR:-/home/ubuntu/app/librechat}
RELEASE_ID=${1:-"SOURCE-$(date -u +%Y%m%dT%H%M%SZ)"}

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "unsafe release id" >&2; exit 1; }
for command in git ssh scp tar zstd; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required" >&2; exit 1; }
done
TAR_CREATE=(tar)
tar --no-xattrs -cf /dev/null -T /dev/null 2>/dev/null && TAR_CREATE+=(--no-xattrs) || true

git -C "$APP_DIR" diff --quiet
git -C "$APP_DIR" diff --cached --quiet
git -C "$BRAIN_DIR" diff --quiet
git -C "$BRAIN_DIR" diff --cached --quiet

APP_REVISION=$(git -C "$APP_DIR" rev-parse HEAD)
BRAIN_REVISION=$(git -C "$BRAIN_DIR" rev-parse HEAD)
mapfile -t ACTIVE_REVISIONS < <(
  ssh -o BatchMode=yes "$TARGET" \
    "sudo -n docker inspect LibreChat future-engine --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'"
)
[[ ${#ACTIVE_REVISIONS[@]} -eq 2 ]] || { echo "expected two active image revisions" >&2; exit 1; }
APP_BASE=${ACTIVE_REVISIONS[0]}
BRAIN_BASE=${ACTIVE_REVISIONS[1]}
git -C "$APP_DIR" cat-file -e "$APP_BASE^{commit}"
git -C "$BRAIN_DIR" cat-file -e "$BRAIN_BASE^{commit}"
mapfile -t ACTIVE_SOURCE_REVISIONS < <(
  ssh -o BatchMode=yes "$TARGET" "set -e;
    source_env='$PRODUCTION_APP_DIR/.source-release.env';
    if test -s \"\$source_env\"; then
      sed -n 's/^LIBRECHAT_SOURCE_REVISION=//p; s/^FUTURE_ENGINE_SOURCE_REVISION=//p' \"\$source_env\";
    fi"
)
APP_CHANGE_BASE=$APP_BASE
BRAIN_CHANGE_BASE=$BRAIN_BASE
if [[ ${#ACTIVE_SOURCE_REVISIONS[@]} -eq 2 ]]; then
  git -C "$APP_DIR" cat-file -e "${ACTIVE_SOURCE_REVISIONS[0]}^{commit}"
  git -C "$BRAIN_DIR" cat-file -e "${ACTIVE_SOURCE_REVISIONS[1]}^{commit}"
  APP_CHANGE_BASE=${ACTIVE_SOURCE_REVISIONS[0]}
  BRAIN_CHANGE_BASE=${ACTIVE_SOURCE_REVISIONS[1]}
elif [[ ${#ACTIVE_SOURCE_REVISIONS[@]} -ne 0 ]]; then
  echo "expected zero or two active source revisions" >&2
  exit 1
fi
ssh -o BatchMode=yes "$TARGET" "set -e;
  app='$PRODUCTION_APP_DIR';
  owner=\$(stat -c '%U' \"\$app\");
  group=\$(stat -c '%G' \"\$app\");
  test \"\$(stat -c '%U' \"\$app/.release.env\")\" = \"\$owner\";
  test \"\$(stat -c '%a' \"\$app/.release.env\")\" = 600;
  test \"\$(stat -c '%U' \"\$app/.releases\")\" = \"\$owner\";
  test \"\$(stat -c '%a' \"\$app/.releases\")\" = 700;
  sudo -n docker info >/dev/null;
  test \"\$(df --output=avail -k \"\$app\" | tail -1)\" -gt 1048576;
  sudo -n install -d -o \"\$owner\" -g \"\$group\" -m 700 \"\$app/.release-src\";
  test \"\$(stat -c '%U' \"\$app/.release-src\")\" = \"\$owner\";
  test \"\$(stat -c '%a' \"\$app/.release-src\")\" = 700" \
  || { echo "source release preflight failed" >&2; exit 1; }

mapfile -t APP_CHANGED < <(git -C "$APP_DIR" -c core.quotePath=false diff --diff-filter=ACMRT --name-only "$APP_BASE" "$APP_REVISION")
mapfile -t BRAIN_CHANGED < <(git -C "$BRAIN_DIR" -c core.quotePath=false diff --diff-filter=ACMRT --name-only "$BRAIN_BASE" "$BRAIN_REVISION")
mapfile -t APP_RELEASE_CHANGED < <(git -C "$APP_DIR" -c core.quotePath=false diff --diff-filter=ACMRT --name-only "$APP_CHANGE_BASE" "$APP_REVISION")
mapfile -t BRAIN_RELEASE_CHANGED < <(git -C "$BRAIN_DIR" -c core.quotePath=false diff --diff-filter=ACMRT --name-only "$BRAIN_CHANGE_BASE" "$BRAIN_REVISION")

DELETED_RUNTIME=$(git -C "$APP_DIR" -c core.quotePath=false diff --diff-filter=D --name-only "$APP_BASE" "$APP_REVISION" \
  | grep -E '^(api/.+\.js|client/|packages/client/|packages/data-provider/)' || true)
DELETED_ENGINE=$(git -C "$BRAIN_DIR" -c core.quotePath=false diff --diff-filter=D --name-only "$BRAIN_BASE" "$BRAIN_REVISION" \
  | grep -E '^projects/未来线/future-engine-shim/.+\.js$' || true)
[[ -z "$DELETED_RUNTIME$DELETED_ENGINE" ]] || {
  echo "source release cannot safely hide deleted runtime files; use an image release" >&2
  exit 1
}

printf '%s\n' "${APP_CHANGED[@]}" | grep -Eq '(^|/)(package(-lock)?\.json|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml)$' \
  && { echo "dependency, image, or compose changes require an image release" >&2; exit 1; } || true
printf '%s\n' "${BRAIN_CHANGED[@]}" | grep -Eq '(^|/)(package(-lock)?\.json|Dockerfile[^/]*)$' \
  && { echo "future-engine dependency or image changes require an image release" >&2; exit 1; } || true
UNSUPPORTED_APP=$(printf '%s\n' "${APP_CHANGED[@]}" \
  | grep -E '^packages/data-schemas/' || true)
[[ -z "$UNSUPPORTED_APP" ]] || {
  echo "shared/backend package runtime changed and cannot use source release" >&2
  exit 1
}

mapfile -t API_FILES < <(printf '%s\n' "${APP_CHANGED[@]}" | grep -E '^api/.+\.js$' | grep -Ev '(^|/)(__tests__/|[^/]+\.test\.js$)' || true)
PACKAGE_API_CHANGED=false
printf '%s\n' "${APP_CHANGED[@]}" | grep -Eq '^packages/api/src/.+\.ts$' \
  && PACKAGE_API_CHANGED=true || true
DATA_PROVIDER_CHANGED=false
printf '%s\n' "${APP_CHANGED[@]}" | grep -Eq '^packages/data-provider/src/.+\.(ts|tsx)$' \
  && DATA_PROVIDER_CHANGED=true || true
mapfile -t ENGINE_FILES < <(printf '%s\n' "${BRAIN_CHANGED[@]}" \
  | grep -E '^projects/未来线/future-engine-shim/.+\.js$' \
  | grep -Ev '(^|/)(__tests__/|scripts/|[^/]+\.test\.js$)' || true)
classify_source_release_delta

[[ ${#API_RELEASE_FILES[@]} -gt 0 || "$PACKAGE_API_RELEASE_CHANGED" == true || "$DATA_PROVIDER_RELEASE_CHANGED" == true || ${#ENGINE_RELEASE_FILES[@]} -gt 0 || "$CLIENT_CHANGED" == true ]] || {
  echo "no deployable source or client changes relative to active release" >&2
  exit 1
}

TMP_DIR=$(mktemp -d)
cleanup() { rm -rf -- "$TMP_DIR"; }
trap cleanup EXIT
BUNDLE_DIR="$TMP_DIR/bundle"
mkdir -p "$BUNDLE_DIR/librechat" "$BUNDLE_DIR/brain" "$BUNDLE_DIR/client" "$BUNDLE_DIR/package-api-dist" "$BUNDLE_DIR/data-provider-dist"

if [[ ${#API_FILES[@]} -gt 0 ]]; then
  git -C "$APP_DIR" archive "$APP_REVISION" -- "${API_FILES[@]}" | tar -xf - -C "$BUNDLE_DIR/librechat"
fi
if [[ "$PACKAGE_API_CHANGED" == true ]]; then
  [[ -s "$APP_DIR/packages/api/dist/index.cjs" ]] || {
    echo "packages/api changed but packages/api/dist/index.cjs is missing; run the verified API build first" >&2
    exit 1
  }
  "${TAR_CREATE[@]}" -C "$APP_DIR/packages/api/dist" -cf - . | tar -xf - -C "$BUNDLE_DIR/package-api-dist"
fi
if [[ "$DATA_PROVIDER_CHANGED" == true ]]; then
  [[ -s "$APP_DIR/packages/data-provider/dist/index.js" ]] || {
    echo "packages/data-provider changed but packages/data-provider/dist/index.js is missing; run the verified data-provider build first" >&2
    exit 1
  }
  "${TAR_CREATE[@]}" -C "$APP_DIR/packages/data-provider/dist" -cf - . | tar -xf - -C "$BUNDLE_DIR/data-provider-dist"
fi
if [[ ${#ENGINE_FILES[@]} -gt 0 ]]; then
  git -C "$BRAIN_DIR" archive "$BRAIN_REVISION" -- "${ENGINE_FILES[@]}" | tar -xf - -C "$BUNDLE_DIR/brain"
fi
if [[ "$CLIENT_CHANGED" == true ]]; then
  [[ -s "$APP_DIR/client/dist/index.html" ]] || { echo "client/dist/index.html is missing; build the client first" >&2; exit 1; }
  "${TAR_CREATE[@]}" -C "$APP_DIR/client/dist" -cf - . | tar -xf - -C "$BUNDLE_DIR/client"
fi

OVERRIDE_FILE="$BUNDLE_DIR/source.override.yml"
{
  printf 'services:\n'
  if [[ ${#API_FILES[@]} -gt 0 || "$PACKAGE_API_CHANGED" == true || "$DATA_PROVIDER_CHANGED" == true ]]; then
    printf '  api:\n    volumes:\n'
    for file in "${API_FILES[@]}"; do
      printf '      - type: bind\n'
      printf '        source: %s/.release-src/current/librechat/%s\n' "$PRODUCTION_APP_DIR" "$file"
      printf '        target: /app/%s\n' "$file"
      printf '        read_only: true\n'
    done
    if [[ "$PACKAGE_API_CHANGED" == true ]]; then
      printf '      - type: bind\n'
      printf '        source: %s/.release-src/current/package-api-dist\n' "$PRODUCTION_APP_DIR"
      printf '        target: /app/packages/api/dist\n'
      printf '        read_only: true\n'
    fi
    if [[ "$DATA_PROVIDER_CHANGED" == true ]]; then
      printf '      - type: bind\n'
      printf '        source: %s/.release-src/current/data-provider-dist\n' "$PRODUCTION_APP_DIR"
      printf '        target: /app/packages/data-provider/dist\n'
      printf '        read_only: true\n'
    fi
  fi
  if [[ ${#ENGINE_FILES[@]} -gt 0 ]]; then
    printf '  future-engine:\n    volumes:\n'
    for file in "${ENGINE_FILES[@]}"; do
      target=${file#projects/未来线/future-engine-shim/}
      printf '      - type: bind\n'
      printf '        source: %s/.release-src/current/brain/%s\n' "$PRODUCTION_APP_DIR" "$file"
      printf '        target: /app/%s\n' "$target"
      printf '        read_only: true\n'
    done
  fi
} > "$OVERRIDE_FILE"

{
  printf 'schema=yiwei.ssh-source-release.v1\n'
  printf 'release_id=%s\n' "$RELEASE_ID"
  printf 'librechat_revision=%s\n' "$APP_REVISION"
  printf 'future_engine_revision=%s\n' "$BRAIN_REVISION"
  printf 'librechat_image_base_revision=%s\n' "$APP_BASE"
  printf 'future_engine_image_base_revision=%s\n' "$BRAIN_BASE"
  printf 'librechat_change_base_revision=%s\n' "$APP_CHANGE_BASE"
  printf 'future_engine_change_base_revision=%s\n' "$BRAIN_CHANGE_BASE"
  api_release_count=${#API_RELEASE_FILES[@]}
  [[ "$PACKAGE_API_RELEASE_CHANGED" == false ]] || ((api_release_count += 1))
  [[ "$DATA_PROVIDER_RELEASE_CHANGED" == false ]] || ((api_release_count += 1))
  api_mount_count=${#API_FILES[@]}
  [[ "$PACKAGE_API_CHANGED" == false ]] || ((api_mount_count += 1))
  [[ "$DATA_PROVIDER_CHANGED" == false ]] || ((api_mount_count += 1))
  printf 'api_file_count=%s\n' "$api_release_count"
  printf 'engine_file_count=%s\n' "${#ENGINE_RELEASE_FILES[@]}"
  printf 'api_mount_file_count=%s\n' "$api_mount_count"
  printf 'engine_mount_file_count=%s\n' "${#ENGINE_FILES[@]}"
  printf 'client_changed=%s\n' "$CLIENT_CHANGED"
} > "$BUNDLE_DIR/manifest"

ARCHIVE="$TMP_DIR/$RELEASE_ID.tar.zst"
if command -v xattr >/dev/null 2>&1; then
  xattr -cr "$BUNDLE_DIR"
fi
"${TAR_CREATE[@]}" -C "$BUNDLE_DIR" -cf - . | zstd -3 -T0 -o "$ARCHIVE" >/dev/null
"$SCRIPT_DIR/verify-tar-provenance.sh" "$ARCHIVE"
ARCHIVE_SHA=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
CLIENT_SHA=not-applicable
if [[ "$CLIENT_CHANGED" == true ]]; then
  CLIENT_SHA=$("${TAR_CREATE[@]}" -C "$BUNDLE_DIR/client" -cf - . | shasum -a 256 | awk '{print $1}')
fi

REMOTE_ARCHIVE="/tmp/$RELEASE_ID.$ARCHIVE_SHA.tar.zst"
scp -q "$ARCHIVE" "$TARGET:$REMOTE_ARCHIVE"
scp -q "$SCRIPT_DIR/compose.sh" "$SCRIPT_DIR/apply-release.sh" "$SCRIPT_DIR/stage-release.sh" "$TARGET:/tmp/"

ssh "$TARGET" bash -s -- \
  "$PRODUCTION_APP_DIR" "$RELEASE_ID" "$ARCHIVE_SHA" "$REMOTE_ARCHIVE" "$CLIENT_SHA" \
  "$api_release_count" "${#ENGINE_RELEASE_FILES[@]}" "$APP_REVISION" "$BRAIN_REVISION" <<'REMOTE'
set -euo pipefail
app=$1
release_id=$2
archive_sha=$3
archive=$4
client_sha=$5
api_count=$6
engine_count=$7
app_revision=$8
brain_revision=$9
owner=$(stat -c '%U' "$app")
group=$(stat -c '%G' "$app")
src_root="$app/.release-src"
release_root="$app/.releases"
target="$src_root/$archive_sha"
override="$app/.release-source.override.yml"
rollback="$release_root/$release_id.source-rollback"

actual_sha=$(sha256sum "$archive" | awk '{print $1}')
[[ "$actual_sha" == "$archive_sha" ]]
sudo -n install -d -o "$owner" -g "$group" -m 700 "$src_root" "$release_root"
if [[ ! -d "$target" ]]; then
  tmp="$src_root/.${archive_sha}.tmp.$$"
  sudo -n rm -rf -- "$tmp"
  sudo -n install -d -o "$owner" -g "$group" -m 755 "$tmp"
  sudo -n zstd -dc "$archive" | sudo -n tar -xf - -C "$tmp"
  sudo -n find "$tmp" -type d -exec chmod 755 {} +
  sudo -n find "$tmp" -type f -exec chmod 644 {} +
  sudo -n chown -R "$owner:$group" "$tmp"
  sudo -n mv "$tmp" "$target"
fi
rm -f -- "$archive"

previous_source=not-applicable
[[ ! -L "$src_root/current" ]] || previous_source=$(readlink "$src_root/current")
previous_client=not-applicable
[[ ! -L "$app/client-releases/current" ]] || previous_client=$(readlink "$app/client-releases/current")
previous_override=not-applicable
if [[ -s "$override" ]]; then
  previous_override="$release_root/$release_id.source-override.rollback.yml"
  sudo -n install -o "$owner" -g "$group" -m 600 "$override" "$previous_override"
fi

if [[ "$client_sha" != not-applicable ]]; then
  client_target="$app/client-releases/$client_sha"
  if [[ ! -s "$client_target/index.html" ]]; then
    client_tmp="$app/client-releases/.${client_sha}.tmp.$$"
    sudo -n rm -rf -- "$client_tmp"
    sudo -n install -d -m 755 "$client_tmp"
    sudo -n cp -a "$target/client/." "$client_tmp/"
    sudo -n find "$client_tmp" -type d -exec chmod 755 {} +
    sudo -n find "$client_tmp" -type f -exec chmod 644 {} +
    sudo -n mv "$client_tmp" "$client_target"
  fi
fi

{
  printf 'release_id=%s\n' "$release_id"
  printf 'previous_source=%s\n' "$previous_source"
  printf 'previous_client=%s\n' "$previous_client"
  printf 'previous_override=%s\n' "$previous_override"
} | sudo -n tee "$rollback" >/dev/null
sudo -n chown "$owner:$group" "$rollback"
sudo -n chmod 600 "$rollback"

ln_tmp="$src_root/.current.$$"
sudo -n ln -s "$archive_sha" "$ln_tmp"
sudo -n mv -Tf "$ln_tmp" "$src_root/current"
sudo -n install -o "$owner" -g "$group" -m 600 "$target/source.override.yml" "$override"
if [[ "$client_sha" != not-applicable ]]; then
  client_link_tmp="$app/client-releases/.current.$$"
  sudo -n ln -s "$client_sha" "$client_link_tmp"
  sudo -n mv -Tf "$client_link_tmp" "$app/client-releases/current"
fi

for script in compose.sh apply-release.sh stage-release.sh; do
  sudo -n install -o "$owner" -g "$group" -m 755 "/tmp/$script" "$app/deploy/$script"
  rm -f -- "/tmp/$script"
done

compose=(sudo -n docker compose --file "$app/docker-compose.prod.yml" --file "$override" --env-file "$app/.env" --env-file "$app/.release.env")
"${compose[@]}" config --quiet
services=()
[[ "$engine_count" == 0 ]] || services+=(future-engine)
[[ "$api_count" == 0 ]] || services+=(api)
if [[ ${#services[@]} -gt 0 ]]; then
  if ! "${compose[@]}" up --detach --no-deps --force-recreate "${services[@]}"; then
    failed=true
  else
    failed=false
  fi
else
  failed=false
fi

healthy=false
if [[ "$failed" == false ]]; then
  for _attempt in $(seq 1 45); do
    if sudo -n docker exec future-engine node -e "fetch('http://127.0.0.1:8899/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1 \
      && sudo -n docker exec LibreChat node -e "fetch('http://127.0.0.1:3080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      healthy=true
      break
    fi
    sleep 2
  done
fi

if [[ "$healthy" != true ]]; then
  if [[ "$previous_source" == not-applicable ]]; then
    sudo -n rm -f -- "$src_root/current"
  else
    old_link="$src_root/.current.rollback.$$"
    sudo -n ln -s "$previous_source" "$old_link"
    sudo -n mv -Tf "$old_link" "$src_root/current"
  fi
  if [[ "$previous_override" == not-applicable ]]; then
    sudo -n rm -f -- "$override"
  else
    sudo -n install -o "$owner" -g "$group" -m 600 "$previous_override" "$override"
  fi
  if [[ "$client_sha" != not-applicable ]]; then
    if [[ "$previous_client" == not-applicable ]]; then
      sudo -n rm -f -- "$app/client-releases/current"
    else
      old_client="$app/client-releases/.current.rollback.$$"
      sudo -n ln -s "$previous_client" "$old_client"
      sudo -n mv -Tf "$old_client" "$app/client-releases/current"
    fi
  fi
  rollback_compose=(sudo -n docker compose --file "$app/docker-compose.prod.yml")
  [[ ! -s "$override" ]] || rollback_compose+=(--file "$override")
  rollback_compose+=(--env-file "$app/.env" --env-file "$app/.release.env")
  [[ ${#services[@]} -eq 0 ]] || "${rollback_compose[@]}" up --detach --no-deps --force-recreate "${services[@]}"
  echo "source release health failed and was rolled back" >&2
  exit 1
fi

{
  printf 'SOURCE_RELEASE_ID=%s\n' "$release_id"
  printf 'SOURCE_RELEASE_SHA256=%s\n' "$archive_sha"
  printf 'LIBRECHAT_SOURCE_REVISION=%s\n' "$app_revision"
  printf 'FUTURE_ENGINE_SOURCE_REVISION=%s\n' "$brain_revision"
  printf 'CLIENT_RELEASE_SHA256=%s\n' "$client_sha"
} | sudo -n tee "$app/.source-release.env.next" >/dev/null
sudo -n chown "$owner:$group" "$app/.source-release.env.next"
sudo -n chmod 600 "$app/.source-release.env.next"
sudo -n mv "$app/.source-release.env.next" "$app/.source-release.env"
printf 'release=%s source_sha=%s client_sha=%s services=%s\n' "$release_id" "$archive_sha" "$client_sha" "${services[*]}"
REMOTE

for path in / /home /login /faq /health; do
  code=$(curl -L -sS -o /dev/null -w '%{http_code}' "https://yiweilife.com$path")
  [[ "$code" == 200 ]] || { echo "public canary failed: $path -> $code" >&2; exit 1; }
done

echo "SSH source release healthy: $RELEASE_ID"
echo "source_sha256=$ARCHIVE_SHA"
echo "librechat_revision=$APP_REVISION"
echo "future_engine_revision=$BRAIN_REVISION"
echo "client_sha256=$CLIENT_SHA"
