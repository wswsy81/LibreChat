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
bash -n "$SCRIPT"

for contract in \
  'umask 077' \
  'MONGO_APP_PASSWORD' \
  'mongorestore' \
  'pg_dump' \
  'pg_restore' \
  'SHA256SUMS' \
  'VERIFIED' \
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
  "$engine/data" \
  "$fake_bin" \
  "$backup_root"

printf 'upload\n' > "$app/uploads/example.txt"
printf 'image\n' > "$app/images/example.txt"
printf 'client\n' > "$app/client/dist/index.html"
printf 'api\n' > "$app/packages/api/dist/index.js"
printf 'schemas\n' > "$app/packages/data-schemas/dist/index.js"
printf 'provider\n' > "$app/packages/data-provider/dist/index.js"
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
bash "$SCRIPT" >/dev/null

backup_count=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'yiweilife-*' | wc -l | tr -d ' ')
[[ $backup_count -eq 1 ]] || fail "expected one atomic backup directory"
backup=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'yiweilife-*' | head -1)

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
grep -Fq -- '--username librechat' "$fake_docker_log" || fail 'Mongo dump did not authenticate'
grep -Fq -- 'pg_dump' "$fake_docker_log" || fail 'Umami Postgres was not dumped'
find "$backup_root" -maxdepth 1 -type d -name '*.partial.*' | grep -q . &&
  fail 'partial backup directory remained after success'

echo 'backup contract: PASS'
