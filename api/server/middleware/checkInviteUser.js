const { hashToken } = require('@librechat/data-schemas');
const { getInvite: getInviteFn } = require('@librechat/api');
const { createToken, findToken, deleteTokens } = require('~/models');

/** 未来线：不绑邮箱的一次性邀请用这个哨兵邮箱标记（gen-invite.sh 默认生成这种）。 */
const UNBOUND_INVITE_EMAIL = 'invite@future-lines.local';

const getInvite = (encodedToken, email) =>
  getInviteFn(encodedToken, email, { createToken, findToken });

async function checkInviteUser(req, res, next) {
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
