#!/usr/bin/env bash
# 为已有 yiweilife Mongo 数据目录创建认证账号。
# 首次在旧的无 --auth 容器上运行，成功后再部署带 --auth 的 compose。
# 重跑时若容器已开启 --auth，会使用 root 凭据幂等更新账号。
set -euo pipefail
umask 077

CONTAINER=${MONGO_CONTAINER:-chat-mongodb}
ENV_FILE=${ENV_FILE:-.env}

command -v docker >/dev/null 2>&1 || { echo "docker 不可用" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "找不到 $ENV_FILE" >&2; exit 1; }

for name in MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD; do
  value=$(sed -n "s/^${name}=//p" "$ENV_FILE" | tail -1)
  [[ "$value" =~ ^[A-Fa-f0-9]{64}$ ]] || {
    echo "$name 未设置或不是 64 位十六进制密钥" >&2
    exit 1
  }
  printf -v "$name" '%s' "$value"
  export "$name"
done

auth_enabled=$(docker inspect -f '{{json .Config.Cmd}}' "$CONTAINER" | grep -c -- '--auth' || true)
mongo_args=(mongosh --quiet LibreChat)
if [[ "$auth_enabled" != "0" ]]; then
  mongo_args=(sh -lc 'mongosh --quiet --username root --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin LibreChat')
fi

docker exec -i \
  -e MONGO_ROOT_PASSWORD \
  -e MONGO_APP_PASSWORD \
  "$CONTAINER" "${mongo_args[@]}" <<'MONGO_JS'
const rootPassword = process.env.MONGO_ROOT_PASSWORD;
const appPassword = process.env.MONGO_APP_PASSWORD;
const adminDb = db.getSiblingDB('admin');
const appDb = db.getSiblingDB('LibreChat');

if (adminDb.getUser('root')) {
  adminDb.updateUser('root', { pwd: rootPassword, roles: [{ role: 'root', db: 'admin' }] });
} else {
  adminDb.createUser({ user: 'root', pwd: rootPassword, roles: [{ role: 'root', db: 'admin' }] });
}

if (appDb.getUser('librechat')) {
  appDb.updateUser('librechat', {
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: 'LibreChat' }],
  });
} else {
  appDb.createUser({
    user: 'librechat',
    pwd: appPassword,
    roles: [{ role: 'readWrite', db: 'LibreChat' }],
  });
}

print(JSON.stringify({
  rootUser: Boolean(adminDb.getUser('root')),
  appUser: Boolean(appDb.getUser('librechat')),
  appRoles: appDb.getUser('librechat').roles,
}));
MONGO_JS

echo "Mongo 账号已就绪；现在可部署带 --auth 的 docker-compose.prod.yml。"
