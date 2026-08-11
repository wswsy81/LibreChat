const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const {
  checkEmailConfig,
  generateLifeInviteCode,
  formatLifeInviteCode,
} = require('@librechat/api');
const { createModels, hashToken } = require('@librechat/data-schemas');
const { User } = createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const { sendEmail } = require('~/server/utils');
const { createLifeInvitation } = require('~/models');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Invite a new user account!');
  console.purple('--------------------------');

  if (process.argv.length < 5) {
    console.orange('Usage: npm run invite-user <email>');
    console.orange('Note: if you do not pass in the arguments, you will be prompted for them.');
    console.purple('--------------------------');
  }

  // 邀请制:未配置邮件服务时不报错退出，改为在下方打印邀请链接由主理人手动发送。

  // Get the email of the user to be invited
  let email = '';
  if (process.argv.length >= 3) {
    email = process.argv[2];
  }
  if (!email) {
    email = await askQuestion('Email:');
  }
  // Validate the email
  if (!email.includes('@')) {
    console.red('Error: Invalid email address!');
    silentExit(1);
  }

  // Check if the user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    console.red('Error: A user with that email already exists!');
    silentExit(1);
  }

  const inviterEmail = process.env.LIFE_INVITER_EMAIL || '';
  const inviter = inviterEmail
    ? await User.findOne({ email: inviterEmail })
    : await User.findOne({ role: 'ADMIN' }).sort({ createdAt: 1 });
  if (!inviter || inviter.role !== 'ADMIN') {
    console.red(
      inviterEmail
        ? `Error: LIFE_INVITER_EMAIL is not an admin account: ${inviterEmail}`
        : 'Error: No admin account is available as the inviter.',
    );
    silentExit(1);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  let code;
  let invitation;
  for (let attempt = 0; attempt < 5 && !invitation; attempt += 1) {
    code = generateLifeInviteCode();
    try {
      invitation = await createLifeInvitation({
        codeHash: await hashToken(code),
        codeHint: code.slice(-4),
        codePlain: code,
        inviterUserId: inviter._id,
        expiresAt,
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
  if (!invitation || !code) {
    console.red('Error: Failed to generate a unique invitation code.');
    silentExit(1);
  }
  const base = (process.env.DOMAIN_CLIENT || 'http://localhost:3080').replace(/\/+$/, '');
  const inviteLink = `${base}/home#invite=${encodeURIComponent(formatLifeInviteCode(code))}`;

  const appName = process.env.APP_TITLE || 'LibreChat';

  if (!checkEmailConfig()) {
    console.green('Send this link to the user:', inviteLink);
    silentExit(0);
  }

  try {
    await sendEmail({
      email: email,
      subject: `Invite to join ${appName}!`,
      payload: {
        appName: appName,
        inviteLink: inviteLink,
        year: new Date().getFullYear(),
      },
      template: 'inviteUser.handlebars',
    });
  } catch (error) {
    console.error('Error: ' + error.message);
    silentExit(1);
  }

  // Done!
  console.green('Invitation sent successfully!');
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
