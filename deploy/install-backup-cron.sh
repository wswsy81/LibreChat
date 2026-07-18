#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ ${EUID:-$(id -u)} -eq 0 ]] || {
  echo 'run as root: sudo bash deploy/install-backup-cron.sh' >&2
  exit 1
}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP_DIR=${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}
BACKUP_DIR=${BACKUP_DIR:-/home/ubuntu/backups}
ENGINE_DIR=${ENGINE_DIR:-$(cd "$APP_DIR/../future-engine-shim" && pwd)}
CRON_FILE=${CRON_FILE:-/etc/cron.d/yiwei-backup}
LOG_FILE=${LOG_FILE:-$BACKUP_DIR/backup.log}

install -d -m 700 -o root -g root "$BACKUP_DIR"
if [[ -e "$LOG_FILE" ]]; then
  chown root:root "$LOG_FILE"
  chmod 600 "$LOG_FILE"
else
  install -m 600 -o root -g root /dev/null "$LOG_FILE"
fi

tmp=$(mktemp)
cleanup() {
  [[ -e "$tmp" ]] && find "$tmp" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

printf '%s\n' \
  '# 未来线每日 04:00 可验证备份；日志和产物默认仅 root 可读。' \
  "0 4 * * * root umask 077 && cd $APP_DIR && BACKUP_DIR=$BACKUP_DIR ENGINE_DIR=$ENGINE_DIR bash deploy/backup.sh >> $LOG_FILE 2>&1" \
  > "$tmp"

install -m 644 -o root -g root "$tmp" "$CRON_FILE"
echo "installed $CRON_FILE"
echo "log $LOG_FILE is $(stat -c '%a %U:%G' "$LOG_FILE")"
