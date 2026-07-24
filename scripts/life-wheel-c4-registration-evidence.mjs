import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.C4_BASE_URL ?? 'http://127.0.0.1:3081';
const OUTPUT = path.resolve(process.env.C4_OUTPUT ?? 'c4-registration-evidence');
const CHROMIUM_CHANNEL = process.env.C4_CHROMIUM_CHANNEL ?? 'chrome';
const ENTRY_HOUSE = 'h10';
const ENTRY_NAME = '事业与公众';
const runId = randomUUID().slice(0, 12);
const email = `c4-${runId}@local.test`;
const password = `C4-${randomUUID()}-Aa1!`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sameOrigin(url) {
  return new URL(url).origin === new URL(BASE_URL).origin;
}

async function screenshot(page, name) {
  const file = path.join(OUTPUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  return file;
}

await fs.mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: CHROMIUM_CHANNEL });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
const responses = {};

page.on('console', (message) => {
  if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
});
page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  if (sameOrigin(request.url())) {
    diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  }
});
page.on('response', async (response) => {
  if (!sameOrigin(response.url())) return;
  const pathname = new URL(response.url()).pathname;
  if (response.status() >= 400) {
    diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
  }
  if (!['/api/auth/register', '/api/auth/login', '/api/life/onboarding'].includes(pathname)) return;
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  responses[pathname] = { status: response.status(), body };
});

const evidence = {
  checkedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  viewport: { width: 390, height: 844 },
  entryHouse: ENTRY_HOUSE,
  testAccount: { email },
  screenshots: {},
  chain: {},
  responses: {},
  diagnostics,
};

try {
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).waitFor();
  const houseButton = page.getByRole('button', { name: `${ENTRY_NAME} · 从这里开始` });
  await houseButton.click();
  const cta = page.getByRole('link', { name: /开始第一次对话/ });
  const ctaHref = await cta.getAttribute('href');
  assert(ctaHref === `/register?entryHouse=${ENTRY_HOUSE}`, `公开 CTA 未携带 ${ENTRY_HOUSE}`);
  evidence.chain.publicCta = ctaHref;
  evidence.screenshots.publicSelection = await screenshot(page, '01-public-selection');

  await cta.click();
  await page.waitForURL(`**/register?entryHouse=${ENTRY_HOUSE}`);
  assert(await page.getByTestId('email').isVisible(), '注册页未从公开 CTA 正常打开');
  evidence.chain.registrationUrl = page.url();

  await page.getByTestId('name').fill('C4 本地链路');
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(password);
  await page.getByTestId('confirm_password').fill(password);
  evidence.screenshots.registration = await screenshot(page, '02-registration-entry-house');

  await page.getByRole('button', { name: 'Submit registration' }).click();
  await page.waitForURL(`**/home?entryHouse=${ENTRY_HOUSE}`, { timeout: 30_000 });
  await page.getByRole('heading', { level: 1, name: '今天想先从哪里说起？' }).waitFor();
  evidence.chain.authenticatedHomeUrl = page.url();
  evidence.chain.storedEntryHouseBeforeOnboarding = await page.evaluate(() =>
    sessionStorage.getItem('life_entry_house'),
  );
  assert(
    evidence.chain.storedEntryHouseBeforeOnboarding === ENTRY_HOUSE,
    '注册登录后 session storage 未保留 entryHouse',
  );

  const selectedSector = page.getByRole('button', { name: new RegExp(`^${ENTRY_NAME}`) });
  assert(
    (await selectedSector.getAttribute('aria-pressed')) === 'true',
    '首次建档圆轮未预选 entryHouse',
  );
  evidence.screenshots.firstArchiveSetup = await screenshot(page, '03-first-archive-setup');

  await page.getByLabel('存档名').fill('C4 本地验收');
  await page.getByRole('button', { name: /从这块开始/ }).click();
  await page.waitForURL('**/c/new?**', { timeout: 30_000 });
  const onboarding = responses['/api/life/onboarding'];
  assert(onboarding?.status === 200, 'onboarding 未返回 HTTP 200');
  assert(onboarding.body?.entryEvent?.kind === 'house_entered', '缺少 canonical house_entered');
  assert(onboarding.body?.entryEvent?.entryHouse === ENTRY_HOUSE, 'house_entered 域不匹配');
  assert(onboarding.body?.entryEvent?.visitMode === 'first_entry', '新用户未走 first_entry');
  assert(
    onboarding.body?.prompt ===
      `[trigger:house_entered] entryHouse=${ENTRY_HOUSE};visitMode=first_entry`,
    'canonical house_entered prompt 不匹配',
  );
  evidence.chain.onboardingRoute = onboarding.body?.route;
  evidence.chain.storedEntryHouseAfterOnboarding = await page.evaluate(() =>
    sessionStorage.getItem('life_entry_house'),
  );
  assert(
    evidence.chain.storedEntryHouseAfterOnboarding === null,
    'onboarding 成功后 entryHouse 未清理',
  );

  const loginUser = responses['/api/auth/login']?.body?.user;
  evidence.testAccount.userId = loginUser?._id ?? loginUser?.id ?? null;
  assert(evidence.testAccount.userId, '自动登录响应缺少本地测试 userId');
  evidence.responses = {
    registerStatus: responses['/api/auth/register']?.status ?? null,
    loginStatus: responses['/api/auth/login']?.status ?? null,
    onboardingStatus: onboarding.status,
    entryEvent: onboarding.body.entryEvent,
    prompt: onboarding.body.prompt,
    operationId: onboarding.body.operationId,
  };
  assert(evidence.responses.registerStatus === 200, '注册请求未返回 HTTP 200');
  assert(evidence.responses.loginStatus === 200, '注册后自动登录未返回 HTTP 200');
  assert(diagnostics.consoleErrors.length === 0, '浏览器 console 出现错误');
  assert(diagnostics.pageErrors.length === 0, '浏览器 pageerror 非零');
  assert(diagnostics.failedRequests.length === 0, '存在同源 requestfailed');
  assert(diagnostics.httpErrors.length === 0, '存在同源 HTTP 错误');

  await fs.writeFile(
    path.join(OUTPUT, 'registration-report.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}
