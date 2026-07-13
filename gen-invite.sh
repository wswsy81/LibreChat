#!/usr/bin/env bash
# 发一条一次性邀请链接（7 天有效，用一次即失效）。
#   ./gen-invite.sh                  → 不绑邮箱：链接发给谁都能注册（默认，推荐）
#   ./gen-invite.sh friend@mail.com  → 绑邮箱：只有该邮箱能用（更防转发）
# 本地 mac 用这个（绕开 Docker VirtioFS 单文件挂载的同步问题）。
set -euo pipefail

EMAIL="${1:-invite@future-lines.local}"
if [ "$EMAIL" != "invite@future-lines.local" ] && ! printf '%s' "$EMAIL" | grep -q '@'; then
  echo "用法: ./gen-invite.sh [email]" >&2
  exit 1
fi

CONTAINER="${LIBRECHAT_CONTAINER:-LibreChat}"

docker exec "$CONTAINER" node -e '
  const path = require("path");
  require("dotenv").config({ path: "/app/.env" });
  const mongoose = require("mongoose");
  require("@librechat/data-schemas").createModels(mongoose);
  require("module-alias")({ base: "/app/api" });
  const { createInvite } = require("@librechat/api");
  const { createToken } = require("~/models");
  const email = process.argv[1];
  const unbound = email === "invite@future-lines.local";
  (async () => {
    await mongoose.connect(process.env.MONGO_URI);
    if (!unbound) {
      const existing = await mongoose.models.User.findOne({ email });
      if (existing) {
        console.error("该邮箱已注册过账号，无需再邀请：" + email);
        process.exit(2);
      }
    }
    const token = await createInvite(email, { createToken });
    const base = process.env.DOMAIN_CLIENT || "http://localhost:3080";
    console.log("");
    if (unbound) {
      console.log("邀请链接（发给任何人，7 天有效、用一次即失效）：");
    } else {
      console.log("邀请链接（发给 " + email + "，7 天有效、一次性、须用此邮箱注册）：");
    }
    console.log(base + "/register?token=" + token);
    console.log("");
    process.exit(0);
  })().catch((e) => { console.error("发码失败：" + e.message); process.exit(1); });
' "$EMAIL" 2>&1 | grep -vE "mongoMeili|fetch failed"
