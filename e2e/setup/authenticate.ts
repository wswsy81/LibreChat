import { chromium } from '@playwright/test';
import type { FullConfig, Page } from '@playwright/test';
import type { User } from '../types';
import cleanupUser from './cleanupUser';
import dotenv from 'dotenv';
dotenv.config();

const timeout = Number(process.env.E2E_AUTH_TIMEOUT ?? 15000);
const chromiumChannel = process.env.E2E_CHROMIUM_CHANNEL || undefined;

async function register(page: Page, user: User) {
  await page.getByRole('link', { name: /Sign up|注册/ }).click();
  await page.getByLabel(/Full name|姓名/).click();
  await page.getByLabel(/Full name|姓名/).fill(user.name);
  await page.getByLabel(/Email|邮箱/).click();
  await page.getByLabel(/Email|邮箱/).fill(user.email);
  await page.getByLabel(/Email|邮箱/).press('Tab');
  await page.getByTestId('password').click();
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('confirm_password').click();
  await page.getByTestId('confirm_password').fill(user.password);
  await page.getByLabel(/Submit registration|注册提交/).click();
}

async function registrationErrorIsVisible(page: Page) {
  return page
    .getByTestId('registration-error')
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

async function login(page: Page, user: User) {
  await page.getByLabel(/Email|邮箱/).fill(user.email);
  await page.getByLabel(/Password|密码/).fill(user.password);
  await page.getByTestId('login-button').click();
}

function appURL(baseURL: string, pathname = '') {
  const normalizedBaseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return new URL(pathname.replace(/^\/+/, ''), normalizedBaseURL).toString();
}

function isLoginPage(page: Page) {
  return new URL(page.url()).pathname === '/login';
}

async function authenticate(config: FullConfig, user: User) {
  console.log('🤖: global setup has been started');
  const { baseURL, storageState } = config.projects[0].use;
  console.log('🤖: using baseURL', baseURL);
  console.log('🤖: using E2E user:', user.email);
  if (typeof storageState !== 'string') {
    throw new Error('🤖: storageState must be a file path');
  }

  const browser = await chromium.launch({
    headless: config.projects[0].use.headless ?? true,
    ...(chromiumChannel ? { channel: chromiumChannel } : {}),
  });
  try {
    const page = await browser.newPage();
    console.log('🤖: 🗝  authenticating user:', user.email);

    if (typeof baseURL !== 'string') {
      throw new Error('🤖: baseURL is not defined');
    }
    const loginURL = appURL(baseURL, 'login');

    // Set localStorage before navigating to the page
    await page.context().addInitScript(() => {
      localStorage.setItem('navVisible', 'true');
    });
    console.log('🤖: ✔️  localStorage: set Nav as Visible', storageState);

    await page.goto(loginURL, { timeout });
    await register(page, user);
    try {
      await page.waitForURL(/\/(?:home|c\/new)(?:[?#].*)?$/, { timeout });
    } catch (error) {
      console.error('Error:', error);
      if (await registrationErrorIsVisible(page)) {
        console.log('🤖: 🚨  user already exists');
        await cleanupUser(user);
        await page.goto(loginURL, { timeout });
        await register(page, user);
        await page.waitForURL(/\/(?:home|c\/new)(?:[?#].*)?$/, { timeout });
      } else {
        throw new Error('🤖: 🚨  user failed to register');
      }
    }
    console.log('🤖: ✔️  user successfully registered');

    if (isLoginPage(page)) {
      await login(page, user);
      await page.waitForURL(/\/(?:home|c\/new)(?:[?#].*)?$/, { timeout });
    }
    console.log('🤖: ✔️  user successfully authenticated');

    await page.context().storageState({ path: storageState });
    console.log('🤖: ✔️  authentication state successfully saved in', storageState);
    // await browser.close();
    // console.log('🤖: global setup has been finished');
  } finally {
    await browser.close();
    console.log('🤖: global setup has been finished');
  }
}

export default authenticate;
