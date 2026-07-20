const { randomUUID } = require('node:crypto');
const { hashToken, logger } = require('@librechat/data-schemas');
const { getInvite: getInviteFn, normalizeLifeInviteCode } = require('@librechat/api');
const { createToken, findToken, deleteTokens, reserveLifeInvitation } = require('~/models');

/** 未来线：不绑邮箱的一次性邀请用这个哨兵邮箱标记（gen-invite.sh 默认生成这种）。 */
const UNBOUND_INVITE_EMAIL = 'invite@future-lines.local';
const RESERVATION_MS = 5 * 60 * 1000;

const getInvite = (encodedToken, email) =>
  getInviteFn(encodedToken, email, { createToken, findToken });

async function checkInviteUser(req, res, next) {
  const rawInviteCode = String(req.body.inviteCode || '').trim();
  const inviteCode = normalizeLifeInviteCode(rawInviteCode);
  if (rawInviteCode && !inviteCode) {
    return res.status(400).json({ message: '邀请码格式不正确' });
  }
  if (inviteCode) {
    try {
      const reservationId = randomUUID();
      const invitation = await reserveLifeInvitation({
        codeHash: await hashToken(inviteCode),
        reservationId,
        reservationExpiresAt: new Date(Date.now() + RESERVATION_MS),
      });
      if (!invitation) {
        return res.status(400).json({ message: '邀请码无效、已使用或已过期' });
      }
      req.invite = invitation;
      req.lifeInvitation = { invitation, reservationId };
      next();
      return;
    } catch (error) {
      logger.error('[checkInviteUser] Failed to reserve life invitation', error);
      return res.status(500).json({ message: '邀请码暂时无法验证，请稍后再试' });
    }
  }

  const token = req.body.token;

  if (!token || token === 'undefined') {
    next();
    return;
  }

  try {
    const hash = await hashToken(decodeURIComponent(token));
    const unbound = await findToken({ token: hash, email: UNBOUND_INVITE_EMAIL });
    const invite = unbound || (await getInvite(token, req.body.email));

    if (!invite || invite.error === true) {
      return res.status(400).json({ message: 'Invalid invite token' });
    }

    await deleteTokens({ token: invite.token });
    req.invite = invite;
    next();
  } catch (error) {
    return res.status(429).json({ message: error.message });
  }
}

module.exports = checkInviteUser;
