#!/usr/bin/env bash
# 未来线生产备份：可验证的本机恢复包 + 可选加密异机副本。
# 不得 source 生产 .env；本脚本只精确解析备份所需的键。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_DIR=${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}
ENGINE_DIR=${ENGINE_DIR:-$(cd "$APP_DIR/../future-engine-shim" && pwd)}
ENV_FILE=${ENV_FILE:-$APP_DIR/.env}
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
MONGO_CONTAINER=${MONGO_CONTAINER:-chat-mongodb}
POSTGRES_CONTAINER=${POSTGRES_CONTAINER:-umami-db}
API_CONTAINER=${API_CONTAINER:-LibreChat}
ENGINE_CONTAINER=${ENGINE_CONTAINER:-future-engine}
CADDY_CONTAINER=${CADDY_CONTAINER:-future-caddy}
UMAMI_CONTAINER=${UMAMI_CONTAINER:-umami}
DOCKER_BIN=${DOCKER_BIN:-docker}
OFFSITE_GPG_RECIPIENT=${OFFSITE_GPG_RECIPIENT:-}
OFFSITE_RSYNC_TARGET=${OFFSITE_RSYNC_TARGET:-}
GPG_BIN=${GPG_BIN:-gpg}
RSYNC_BIN=${RSYNC_BIN:-rsync}
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="yiweilife-$TS"
STAGING="$BACKUP_DIR/.$BACKUP_NAME.partial.$$"
FINAL="$BACKUP_DIR/$BACKUP_NAME"

die() {
  echo "backup failed: $*" >&2
  exit 1
}

read_exact_env() {
  local key=$1
  local line
  local value
  line=$(grep -m1 "^${key}=" "$ENV_FILE") || die "missing required env key: $key"
  value=${line#*=}
  [[ -n "$value" ]] || die "empty required env key: $key"
  printf '%s' "$value"
}

validate_hex() {
  local key=$1
  local value=$2
  local length=$3
  [[ ${#value} -eq $length ]] || die "$key must be $length hexadecimal characters"
  [[ "$value" != *[!0-9a-fA-F]* ]] || die "$key must be hexadecimal"
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

git_revision() {
  git -C "$1" rev-parse HEAD 2>/dev/null || printf 'unavailable'
}

on_error() {
  local rc=$?
  if [[ -d "$STAGING" ]]; then
    printf 'failed_at=%s\nexit_code=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc" > "$STAGING/FAILED"
    chmod 600 "$STAGING/FAILED"
  fi
  echo "[$(date)] 备份失败，未验证临时目录保留于 $STAGING" >&2
  exit "$rc"
}
trap on_error ERR

command -v "$DOCKER_BIN" >/dev/null 2>&1 || die "docker unavailable: $DOCKER_BIN"
command -v tar >/dev/null 2>&1 || die 'tar unavailable'
command -v gzip >/dev/null 2>&1 || die 'gzip unavailable'
command -v sha256sum >/dev/null 2>&1 || die 'sha256sum unavailable'
[[ -f "$ENV_FILE" ]] || die "environment file not found: $ENV_FILE"
[[ -d "$ENGINE_DIR/data" ]] || die "future-engine data directory not found: $ENGINE_DIR/data"
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die 'KEEP_DAYS must be a non-negative integer'

if [[ -n "$OFFSITE_GPG_RECIPIENT" || -n "$OFFSITE_RSYNC_TARGET" ]]; then
  [[ -n "$OFFSITE_GPG_RECIPIENT" && -n "$OFFSITE_RSYNC_TARGET" ]] ||
    die 'OFFSITE_GPG_RECIPIENT and OFFSITE_RSYNC_TARGET must be configured together'
  command -v "$GPG_BIN" >/dev/null 2>&1 || die "gpg unavailable: $GPG_BIN"
  command -v "$RSYNC_BIN" >/dev/null 2>&1 || die "rsync unavailable: $RSYNC_BIN"
  "$GPG_BIN" --batch --list-keys "$OFFSITE_GPG_RECIPIENT" >/dev/null 2>&1 ||
    die 'configured offsite GPG recipient is not available'
fi

MONGO_APP_PASSWORD=$(read_exact_env MONGO_APP_PASSWORD)
UMAMI_DB_PASSWORD=$(read_exact_env UMAMI_DB_PASSWORD)
validate_hex MONGO_APP_PASSWORD "$MONGO_APP_PASSWORD" 64

install -d -m 700 "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
[[ ! -e "$FINAL" ]] || die "backup already exists: $FINAL"
install -d -m 700 "$STAGING"

echo "[$(date)] 备份开始 -> $FINAL"

"$DOCKER_BIN" exec \
  -e MONGO_APP_PASSWORD="$MONGO_APP_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -lc 'mongodump --username librechat --password "$MONGO_APP_PASSWORD" --authenticationDatabase LibreChat --db LibreChat --archive --gzip' \
  > "$STAGING/mongodb-LibreChat.archive.gz"

"$DOCKER_BIN" exec \
  -e PGPASSWORD="$UMAMI_DB_PASSWORD" \
  "$POSTGRES_CONTAINER" \
  sh -lc 'pg_dump --username umami --dbname umami --format custom' \
  > "$STAGING/umami-postgres.dump"

tar -C "$ENGINE_DIR" -czf "$STAGING/future-engine-data.tgz" data
tar \
  --exclude='./data' \
  --exclude='./node_modules' \
  --exclude='./.git' \
  -C "$ENGINE_DIR" \
  -czf "$STAGING/future-engine-runtime.tgz" \
  .

user_file_paths=()
for path in uploads images; do
  [[ -e "$APP_DIR/$path" ]] && user_file_paths+=("$path")
done
[[ ${#user_file_paths[@]} -gt 0 ]] || die 'LibreChat uploads/images directories are missing'
tar -C "$APP_DIR" -czf "$STAGING/librechat-user-files.tgz" "${user_file_paths[@]}"

runtime_paths=()
for path in \
  .env \
  .release.env \
  .releases \
  docker-compose.prod.yml \
  Dockerfile \
  .dockerignore \
  librechat.yaml \
  deploy \
  client/dist \
  packages/api/dist \
  packages/data-schemas/dist \
  packages/data-provider/dist \
  api/server \
  api/strategies \
  config \
  runtime-config; do
  [[ -e "$APP_DIR/$path" ]] && runtime_paths+=("$path")
done
[[ ${#runtime_paths[@]} -ge 5 ]] || die 'LibreChat runtime/config coverage is unexpectedly small'
printf '%s\n' "${runtime_paths[@]}" > "$STAGING/runtime-paths.txt"
tar -C "$APP_DIR" -czf "$STAGING/librechat-runtime.tgz" "${runtime_paths[@]}"

{
  for container in \
    "$MONGO_CONTAINER" \
    "$POSTGRES_CONTAINER" \
    "$API_CONTAINER" \
    "$ENGINE_CONTAINER" \
    "$CADDY_CONTAINER" \
    "$UMAMI_CONTAINER"; do
    image=$("$DOCKER_BIN" inspect -f '{{.Image}}' "$container" 2>/dev/null || printf 'unavailable')
    printf '%s=%s\n' "$container" "$image"
  done
} > "$STAGING/images.txt"

{
  printf 'backup_name=%s\n' "$BACKUP_NAME"
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'hostname=%s\n' "$(hostname)"
  printf 'app_revision=%s\n' "$(git_revision "$APP_DIR")"
  printf 'engine_revision=%s\n' "$(git_revision "$ENGINE_DIR")"
  printf 'mongo_database=LibreChat\n'
  printf 'postgres_database=umami\n'
  printf 'local_retention_days=%s\n' "$KEEP_DAYS"
  if [[ -n "$OFFSITE_RSYNC_TARGET" ]]; then
    printf 'offsite=encrypted-rsync-configured\n'
  else
    printf 'offsite=not-configured\n'
  fi
  printf 'recovery_runbook=deploy/BACKUP-RESTORE.md\n'
} > "$STAGING/manifest.txt"

gzip -t "$STAGING/mongodb-LibreChat.archive.gz"
for archive in \
  future-engine-data.tgz \
  future-engine-runtime.tgz \
  librechat-user-files.tgz \
  librechat-runtime.tgz; do
  tar -tzf "$STAGING/$archive" >/dev/null
done

"$DOCKER_BIN" exec -i \
  -e MONGO_APP_PASSWORD="$MONGO_APP_PASSWORD" \
  "$MONGO_CONTAINER" \
  sh -lc 'mongorestore --username librechat --password "$MONGO_APP_PASSWORD" --authenticationDatabase LibreChat --archive --gzip --dryRun' \
  < "$STAGING/mongodb-LibreChat.archive.gz" \
  > "$STAGING/mongorestore-dry-run.txt" 2>&1

"$DOCKER_BIN" exec -i "$POSTGRES_CONTAINER" pg_restore --list \
  < "$STAGING/umami-postgres.dump" \
  > "$STAGING/postgres-restore-list.txt"
[[ -s "$STAGING/postgres-restore-list.txt" ]] || die 'Postgres restore list is empty'

payloads=(
  mongodb-LibreChat.archive.gz
  umami-postgres.dump
  future-engine-data.tgz
  future-engine-runtime.tgz
  librechat-user-files.tgz
  librechat-runtime.tgz
  runtime-paths.txt
  images.txt
  manifest.txt
  mongorestore-dry-run.txt
  postgres-restore-list.txt
)
find "$STAGING" -type f -exec chmod 600 {} +
(
  cd "$STAGING"
  sha256sum "${payloads[@]}" > SHA256SUMS
  chmod 600 SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)

for file in "${payloads[@]}" SHA256SUMS; do
  [[ $(file_mode "$STAGING/$file") == 600 ]] || die "backup artifact is not 0600: $file"
done
[[ $(file_mode "$STAGING") == 700 ]] || die 'backup staging directory is not 0700'

printf 'verified_at=%s\nlocal_restore_checks=passed\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$STAGING/VERIFIED"
chmod 600 "$STAGING/VERIFIED"
mv "$STAGING" "$FINAL"

if [[ -n "$OFFSITE_RSYNC_TARGET" ]]; then
  offsite_package="$BACKUP_DIR/$BACKUP_NAME.tar.gpg"
  offsite_checksum="$offsite_package.sha256"
  tar -C "$BACKUP_DIR" -cf - "$BACKUP_NAME" |
    "$GPG_BIN" --batch --yes --trust-model always --recipient "$OFFSITE_GPG_RECIPIENT" \
      --output "$offsite_package" --encrypt
  chmod 600 "$offsite_package"
  "$GPG_BIN" --batch --list-packets "$offsite_package" >/dev/null
  (
    cd "$BACKUP_DIR"
    sha256sum "$(basename "$offsite_package")" > "$(basename "$offsite_checksum")"
  )
  chmod 600 "$offsite_checksum"
  "$RSYNC_BIN" --archive --checksum --partial --chmod=F600 \
    "$offsite_package" "$offsite_checksum" "$OFFSITE_RSYNC_TARGET/"
  printf 'offsite_verified_at=%s\ntarget=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$OFFSITE_RSYNC_TARGET" > "$FINAL/OFFSITE_VERIFIED"
  chmod 600 "$FINAL/OFFSITE_VERIFIED"
fi

# 只有本次备份完成校验后才执行保留期清理。旧产物先收紧权限。
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'mongo-LibreChat-*.archive.gz' -o -name 'shim-data-*.tgz' \) \
  -exec chmod 600 {} + 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'mongo-LibreChat-*.archive.gz' -o -name 'shim-data-*.tgz' \) \
  -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'yiweilife-*' \
  -mtime +"$KEEP_DAYS" -print | while IFS= read -r candidate; do
  [[ "$candidate" == "$BACKUP_DIR"/yiweilife-* ]] || die "unsafe retention path: $candidate"
  [[ -f "$candidate/VERIFIED" ]] || continue
  find "$candidate" -depth -delete
done

trap - ERR
echo "[$(date)] 备份完成 -> $FINAL"
echo "  ✓ Mongo 认证导出 + dry-run restore"
echo "  ✓ Umami Postgres custom dump + restore list"
echo "  ✓ future-engine data/runtime + LibreChat uploads/images/runtime config"
echo "  ✓ 0700/0600 + SHA256 + VERIFIED"
if [[ -n "$OFFSITE_RSYNC_TARGET" ]]; then
  echo "  ✓ GPG 加密异机副本"
else
  echo "  ! 异机目标未配置；本机备份已验证，但仍与应用共故障域"
fi
