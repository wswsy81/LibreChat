#!/usr/bin/env bash
# 未来线 · 备份(两处命根子数据:Mongo 账号/对话 + shim 画像/报告/邀请码)
# 用法:bash deploy/backup.sh
# 挂 cron(每天 4 点):
#   0 4 * * * cd /home/ubuntu/未来线/librechat && bash deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
set -euo pipefail

# 目录:BACKUP_DIR 可用环境变量覆盖
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
SHIM_DATA_DIR="${SHIM_DATA_DIR:-$(cd "$(dirname "$0")/../../future-engine-shim/data" && pwd)}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] 备份开始 -> $BACKUP_DIR"

# 1) Mongo:容器内 mongodump 流式导出 + gzip
docker exec chat-mongodb sh -c 'mongodump --db=LibreChat --archive' 2>/dev/null \
  | gzip > "$BACKUP_DIR/mongo-LibreChat-$TS.archive.gz"
echo "  ✓ mongo: mongo-LibreChat-$TS.archive.gz ($(du -h "$BACKUP_DIR/mongo-LibreChat-$TS.archive.gz" | cut -f1))"

# 2) shim 用户数据打包
tar czf "$BACKUP_DIR/shim-data-$TS.tgz" -C "$(dirname "$SHIM_DATA_DIR")" "$(basename "$SHIM_DATA_DIR")"
echo "  ✓ shim: shim-data-$TS.tgz ($(du -h "$BACKUP_DIR/shim-data-$TS.tgz" | cut -f1))"

# 3) 清理超过 KEEP_DAYS 的旧备份
find "$BACKUP_DIR" -name 'mongo-LibreChat-*.archive.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'shim-data-*.tgz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[$(date)] 备份完成。恢复见 deploy/上线runbook 的『灾难恢复』节。"
