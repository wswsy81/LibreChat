#!/usr/bin/env bash
# 发一条未来线邀请码（7 天有效，用一次即失效）。
#   ./gen-invite.sh                   → 使用最早创建的管理员作为邀请人
#   ./gen-invite.sh admin@example.com → 指定邀请人管理员邮箱
# 本地 mac 用这个（绕开 Docker VirtioFS 单文件挂载的同步问题）。
set -euo pipefail

INVITER_EMAIL="${1:-}"
if [ -n "$INVITER_EMAIL" ] && ! printf '%s' "$INVITER_EMAIL" | grep -q '@'; then
  echo "用法: ./gen-invite.sh [inviter-email]" >&2
  exit 1
fi

CONTAINER="${LIBRECHAT_CONTAINER:-LibreChat}"

docker exec "$CONTAINER" node -e '
  const path = require("path");
  require("dotenv").config({ path: "/app/.env" });
  const crypto = require("node:crypto");
  const mongoose = require("mongoose");
  const CODE_PREFIX = "YW";
  const CODE_LENGTH = 8;
  const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const generateLifeInviteCode = () => {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    const body = Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
    return CODE_PREFIX + body;
  };
  const formatLifeInviteCode = (value) =>
    value.slice(0, 2) + "-" + value.slice(2, 6) + "-" + value.slice(6);
  const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const inviterEmail = process.argv[1];
  (async () => {
    await mongoose.connect(process.env.MONGO_URI);
    const users = mongoose.connection.collection("users");
    const invitations = mongoose.connection.collection("lifeinvitations");
    const inviter = inviterEmail
      ? await users.findOne({ email: inviterEmail })
      : await users.findOne({ role: "ADMIN" }, { sort: { createdAt: 1 } });
    if (!inviter || inviter.role !== "ADMIN") {
      console.error(inviterEmail
        ? "没有找到这个管理员账号：" + inviterEmail
        : "没有找到可作为邀请人的管理员账号");
      process.exit(2);
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    let code;
    let invitation;
    for (let attempt = 0; attempt < 5 && !invitation; attempt += 1) {
      code = generateLifeInviteCode();
      try {
        const now = new Date();
        invitation = await invitations.insertOne({
          codeHash: hashToken(code),
          codeHint: code.slice(-4),
          codePlain: code,
          inviterUserId: inviter._id,
          status: "pending",
          expiresAt,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
      }
    }
    if (!invitation || !code) {
      throw new Error("连续生成邀请码冲突，请重试");
    }
    const base = process.env.DOMAIN_CLIENT || "http://localhost:3080";
    const displayCode = formatLifeInviteCode(code);
    console.log("");
    console.log("邀请人：" + inviter.email);
    console.log("邀请链接（7 天有效、用一次即失效）：");
    console.log(base.replace(/\/+$/, "") + "/home#invite=" + encodeURIComponent(displayCode));
    console.log("");
    process.exit(0);
  })().catch((e) => { console.error("发码失败：" + e.message); process.exit(1); });
' "$INVITER_EMAIL" 2>&1 | grep -vE "mongoMeili|fetch failed"
