#!/usr/bin/env bash
# 未来线 · 生成全新生产密钥(不复用开发机)
# 用法:bash deploy/gen-secrets.sh
# 输出 4 行 KEY=VALUE,复制粘到 .env 对应行。
set -euo pipefail

command -v openssl >/dev/null 2>&1 || { echo "需要 openssl" >&2; exit 1; }

echo "# ── 把下面 5 行粘到 .env(覆盖同名空行)──"
echo "CREDS_KEY=$(openssl rand -hex 32)"                     # AES-256 32字节
echo "CREDS_IV=$(openssl rand -hex 16)"                      # 16字节
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "FUTURE_ENGINE_INTERNAL_TOKEN=$(openssl rand -hex 24)"
echo "UMAMI_DB_PASSWORD=$(openssl rand -hex 16)"
echo "UMAMI_APP_SECRET=$(openssl rand -hex 32)"
echo "# ── 生成完毕。别把这些贴进聊天/git ──"
