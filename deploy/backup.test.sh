#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_source_contains() {
  local needle=$1
  grep -Fq -- "$needle" "$SCRIPT" || fail "backup.sh missing contract: $needle"
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

SCRIPT=$(cd "$(dirname "$0")" && pwd)/backup.sh
CRON_INSTALLER=$(cd "$(dirname "$0")" && pwd)/install-backup-cron.sh
bash -n "$SCRIPT"
bash -n "$CRON_INSTALLER"
grep -Fq 'BACKUP_DIR=${BACKUP_DIR:-/root/backups}' "$CRON_INSTALLER" ||
  fail 'cron installer must use the canonical root backup directory'

for contract in \
  'umask 077' \
  'MONGO_APP_PASSWORD' \
  'mongorestore' \
  'pg_dump' \
  'pg_restore' \
  'SHA256SUMS' \
  'VERIFIED' \
  'KEEP_COUNT' \
  'uploads' \
  '.env' \
  'OFFSITE_GPG_RECIPIENT' \
  'OFFSITE_RSYNC_TARGET'; do
  assert_source_contains "$contract"
done

tmp=$(mktemp -d)
cleanup() {
  find "$tmp" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

app="$tmp/app/librechat"
engine="$tmp/app/future-engine-shim"
backup_root="$tmp/backups"
fake_bin="$tmp/bin"
mkdir -p \
  "$app/deploy" \
  "$app/uploads" \
  "$app/images" \
  "$app/client/dist" \
  "$app/packages/api/dist" \
  "$app/packages/data-schemas/dist" \
  "$app/packages/data-provider/dist" \
  "$app/runtime-config/.last-good" \
  "$app/.releases/.build-cache/api" \
  "$engine/data" \
  "$fake_bin" \
  "$backup_root"

for old_backup in \
  yiweilife-20200101-000000 \
  yiweilife-20210101-000000 \
  yiweilife-20220101-000000; do
  mkdir -p "$backup_root/$old_backup"
  printf 'verified\n' > "$backup_root/$old_backup/VERIFIED"
  touch -t 202001010000 "$backup_root/$old_backup" "$backup_root/$old_backup/VERIFIED"
done

printf 'upload\n' > "$app/uploads/example.txt"
printf 'image\n' > "$app/images/example.txt"
printf 'client\n' > "$app/client/dist/index.html"
printf 'api\n' > "$app/packages/api/dist/index.js"
printf 'schemas\n' > "$app/packages/data-schemas/dist/index.js"
printf 'provider\n' > "$app/packages/data-provider/dist/index.js"
printf 'hot-copy\n' > "$app/runtime-config/runtime-copy.v1.json"
printf 'last-good-prompt\n' > "$app/runtime-config/.last-good/global-prompt.v1.md"
printf 'release metadata\n' > "$app/.releases/TEST.manifest"
printf 'rebuildable cache\n' > "$app/.releases/.build-cache/api/cache.bin"
printf 'profile\n' > "$engine/data/profile.json"
printf 'engine\n' > "$engine/server.js"
printf 'FROM scratch\n' > "$engine/Dockerfile"
printf 'services: {}\n' > "$app/docker-compose.prod.yml"
printf 'version: 1\n' > "$app/librechat.yaml"
printf ':443 {}\n' > "$app/deploy/Caddyfile"
cp "$SCRIPT" "$app/deploy/backup.sh"

cat > "$app/.env" <<'ENV'
MONGO_APP_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
UMAMI_DB_PASSWORD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
FUTURE_ENGINE_INTERNAL_TOKEN=cccccccccccccccccccccccccccccccccccccccccccccccc
FUTURE_ENGINE_IDENTITY_SECRET=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
MONGO_ROOT_PASSWORD=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
UMAMI_APP_SECRET=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
JWT_SECRET=1111111111111111111111111111111111111111111111111111111111111111
JWT_REFRESH_SECRET=2222222222222222222222222222222222222222222222222222222222222222
CREDS_KEY=3333333333333333333333333333333333333333333333333333333333333333
CREDS_IV=44444444444444444444444444444444
DOMAIN=example.test
ANALYTICS_DOMAIN=analytics.example.test
ENV
chmod 600 "$app/.env"

cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
case " $* " in
  *' mongodump '*) printf 'fake-mongodb-archive\n' | gzip ;;
  *' mongorestore '*) cat >/dev/null; printf '0 document(s) failed to restore\n' ;;
  *' pg_dump '*) printf 'fake-postgres-dump\n' ;;
  *' pg_restore '*) cat >/dev/null; printf '; Archive created at 2026-07-18\nTABLE DATA public event\n' ;;
  *' inspect '*) printf 'sha256:fake-image-id\n' ;;
  *) ;;
esac
FAKE_DOCKER
chmod 700 "$fake_bin/docker"

fake_docker_log="$tmp/docker.log"
FAKE_DOCKER_LOG="$fake_docker_log" \
PATH="$fake_bin:$PATH" \
DOCKER_BIN="$fake_bin/docker" \
APP_DIR="$app" \
ENGINE_DIR="$engine" \
ENV_FILE="$app/.env" \
BACKUP_DIR="$backup_root" \
KEEP_DAYS=14 \
KEEP_COUNT=2 \
bash "$SCRIPT" >/dev/null

backup_count=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'yiweilife-*' | wc -l | tr -d ' ')
[[ $backup_count -eq 2 ]] || fail "expected two retained backup directories"
[[ -d "$backup_root/yiweilife-20220101-000000" ]] || fail 'newest prior verified backup was not retained'
[[ ! -e "$backup_root/yiweilife-20210101-000000" ]] || fail 'older verified backup was not pruned'
[[ ! -e "$backup_root/yiweilife-20200101-000000" ]] || fail 'oldest verified backup was not pruned'
backup=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'yiweilife-*' | sort -r | head -1)

for file in \
  mongodb-LibreChat.archive.gz \
  umami-postgres.dump \
  future-engine-data.tgz \
  future-engine-runtime.tgz \
  librechat-user-files.tgz \
  librechat-runtime.tgz \
  manifest.txt \
  images.txt \
  SHA256SUMS \
  mongorestore-dry-run.txt \
  postgres-restore-list.txt \
  VERIFIED; do
  [[ -s "$backup/$file" ]] || fail "missing or empty backup artifact: $file"
  [[ $(file_mode "$backup/$file") == 600 ]] ||
    fail "artifact is not 0600: $file"
done

[[ $(file_mode "$backup") == 700 ]] ||
  fail "backup directory is not 0700"

(cd "$backup" && sha256sum -c SHA256SUMS >/dev/null)
tar -tzf "$backup/librechat-runtime.tgz" | grep -Fq 'runtime-config/runtime-copy.v1.json' ||
  fail 'runtime-config hot copy missing from runtime backup'
tar -tzf "$backup/librechat-runtime.tgz" | grep -Fq 'runtime-config/.last-good/global-prompt.v1.md' ||
  fail 'runtime-config last-known-good prompt missing from runtime backup'
tar -tzf "$backup/librechat-runtime.tgz" | grep -Fq '.releases/TEST.manifest' ||
  fail 'release metadata missing from runtime backup'
if tar -tzf "$backup/librechat-runtime.tgz" | grep -Fq '.releases/.build-cache'; then
  fail 'rebuildable release build cache leaked into runtime backup'
fi
grep -Fq -- '--username librechat' "$fake_docker_log" || fail 'Mongo dump did not authenticate'
grep -Fq -- 'pg_dump' "$fake_docker_log" || fail 'Umami Postgres was not dumped'
find "$backup_root" -maxdepth 1 -type d -name '*.partial.*' | grep -q . &&
  fail 'partial backup directory remained after success'

echo 'backup contract: PASS'
