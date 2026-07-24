import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, request } from '@playwright/test';

const BASE_URL = process.env.CL3_BASE_URL ?? 'http://localhost:3080';
const EMAIL = process.env.CL3_TEST_EMAIL ?? 'cl3-evidence@local.test';
const PASSWORD = process.env.CL3_TEST_PASSWORD;
const OUTPUT = path.resolve(process.env.CL3_OUTPUT ?? 'cl3-evidence');
const CHROMIUM_CHANNEL = process.env.CL3_CHROMIUM_CHANNEL ?? 'chrome';

if (!PASSWORD) {
  throw new Error('缺少 CL3_TEST_PASSWORD；只允许使用本地隔离验收账号');
}

const HOUSES = [
  ['h1', '自我呈现', 180, 150, 165, true],
  ['h2', '钱与价值感', 150, 120, 135, false],
  ['h3', '沟通与学习', 120, 90, 105, false],
  ['h4', '家与根', 90, 60, 75, true],
  ['h5', '恋爱与创造', 60, 30, 45, false],
  ['h6', '工作与健康', 30, 0, 15, false],
  ['h7', '亲密与伙伴', 0, -30, -15, true],
  ['h8', '共担与蜕变', -30, -60, -45, false],
  ['h9', '远方与信念', -60, -90, -75, false],
  ['h10', '事业与公众', -90, -120, -105, true],
  ['h11', '朋友与群体', -120, -150, -135, false],
  ['h12', '独处与内心', -150, -180, -165, false],
];

const CONDITIONS = {
  h2: ['owned', 'depleted', 'worsening', '钱一直在流动，但安全垫没有跟着长出来。'],
  h5: ['draft', 'unknown', 'unknown', null],
  h6: ['owned', 'strained', 'improving', '每天仍在救火，但已经停掉一件最耗神的小事。'],
  h10: ['owned', 'energizing', 'improving', '把手里的系统拿出去见人后，反馈开始变得具体。'],
};

const lifeWheel = {
  schemaVersion: 1,
  lanternHouse: 'h6',
  houses: HOUSES.map(
    ([id, publicName, startAngleDeg, endAngleDeg, centerAngleDeg, axisBoundary]) => {
      const [recognition, level, trend, evidenceSummary] = CONDITIONS[id] ?? [
        'unknown',
        'unknown',
        'unknown',
        null,
      ];
      return {
        id,
        publicName,
        startAngleDeg,
        endAngleDeg,
        centerAngleDeg,
        sweepDeg: -30,
        axisBoundary,
        recognition,
        condition: {
          currentSnapshotId: level === 'unknown' ? null : `snapshot-${id}`,
          level,
          status: level === 'unknown' ? null : 'user_confirmed',
          trend,
          asOf: level === 'unknown' ? null : '2026-07-24T10:00:00.000Z',
          evidenceSummary,
        },
      };
    },
  ),
};

const emptyBootstrap = {
  authenticated: true,
  user: { id: 'cl3-fixture-user', name: '未命名存档' },
  profileState: 'empty',
  hasSubstantiveProfile: false,
  summary: {},
  latestReportId: null,
  reportCount: 0,
  lastConversationId: null,
  lastConversationTitle: null,
  recommendedRoute: '/home',
};

const returningBootstrap = {
  authenticated: true,
  user: { id: 'cl3-fixture-user', name: '证据样本' },
  profileState: 'ready',
  hasSubstantiveProfile: true,
  profileVersion: '2026-07-24T10:00:00.000Z',
  summary: {
    alias: '证据样本',
    lastSurface: '工作一直在推进，但身体已经开始替我发出停下来的信号。',
    nextStep: '停掉一件最耗神的小事，观察一周。',
    lifeWheel,
  },
  latestReportId: null,
  reportCount: 0,
  lastConversationId: null,
  lastConversationTitle: null,
  recommendedRoute: '/home',
};

const archive = {
  schemaVersion: 1,
  profileVersion: '2026-07-24T10:00:00.000Z',
  profile: {
    alias: '证据样本',
    archetype: '能把复杂事情做成系统，但常常让身体替自己承担收尾成本。',
    basics: {},
    problemFrame: {
      surface: '工作太多，停不下来。',
      movable: '不是立刻离开，而是先停掉一件只靠惯性维持的事。',
      constraints: ['不能新增固定成本', '不能让现金流断掉'],
    },
    compass: { workview: '先把系统做出来，再从具体结果里选择。' },
    energy: { gain: ['完整造出一个可运行的系统'] },
    signals: [{ id: 'signal-1', description: '晚间不再继续补最后一轮', status: '正在验证' }],
    timeline: [
      { when: '2026-07-24T10:00:00.000Z', what: '停掉一件最耗神的小事', source: '已确认' },
    ],
    updatedAt: '2026-07-24T10:00:00.000Z',
  },
  reports: [],
};

const VIEWPORTS = [
  { key: '390x844', width: 390, height: 844 },
  { key: '392x852', width: 392, height: 852 },
  { key: '1440x900', width: 1440, height: 900 },
];

const sameOrigin = (url) => new URL(url).origin === new URL(BASE_URL).origin;
const json = (value) => JSON.stringify(value);

async function authenticate() {
  const api = await request.newContext({ baseURL: BASE_URL });
  const response = await api.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`本地 CL3 账号登录失败：HTTP ${response.status()}`);
  }
  const storageState = await api.storageState();
  await api.dispose();
  return storageState;
}

function attachDiagnostics(page) {
  const result = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      result.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('requestfailed', (requestItem) => {
    if (sameOrigin(requestItem.url())) {
      result.failedRequests.push({
        url: requestItem.url(),
        error: requestItem.failure()?.errorText,
      });
    }
  });
  page.on('response', (response) => {
    if (sameOrigin(response.url()) && response.status() >= 400) {
      result.httpErrors.push({ url: response.url(), status: response.status() });
    }
  });
  return result;
}

async function installFixtures(page, bootstrap) {
  await page.route('**/api/life/bootstrap', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(bootstrap) }),
  );
  await page.route('**/api/life/archive', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: json(archive) }),
  );
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(250);
}

async function scan(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map((node) => node.target),
  }));
}

async function auditHorizontalOverflow(page) {
  return page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
}

async function auditSvgTypography(page) {
  return page.locator('svg text').evaluateAll((nodes) => {
    const visible = nodes
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
      })
      .map((node) => {
        const matrix = node.getScreenCTM();
        const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
        return Number((Number.parseFloat(getComputedStyle(node).fontSize) * scale).toFixed(2));
      });
    return {
      visibleTextNodes: visible.length,
      minimumRenderedPx: visible.length ? Math.min(...visible) : null,
    };
  });
}

async function auditPublicKeyboard(page) {
  const h1 = page.getByRole('button', { name: '自我呈现 · 从这里开始' });
  await h1.focus();
  await h1.press('Enter');
  const pressed = await h1.getAttribute('aria-pressed');
  const href = await page.getByRole('link', { name: /开始第一次对话/ }).getAttribute('href');
  return {
    visibleHouseButtons: await page.getByRole('button', { name: /从这里开始/ }).count(),
    pressed,
    href,
  };
}

async function auditWheelKeyboard(page, name) {
  const sector = page.getByRole('button', { name: new RegExp(`^${name}`) });
  await sector.focus();
  await sector.press(' ');
  return {
    pressed: await sector.getAttribute('aria-pressed'),
    activeElement: await sector.evaluate((node) => node === document.activeElement),
  };
}

async function capture(page, outputDir, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  return file;
}

async function captureViewport(browser, viewport) {
  const outputDir = path.join(OUTPUT, viewport.key);
  await fs.mkdir(outputDir, { recursive: true });
  const records = [];

  const publicContext = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const publicPage = await publicContext.newPage();
  const publicDiagnostics = attachDiagnostics(publicPage);
  await publicPage.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
  await publicPage.getByRole('heading', { level: 1 }).waitFor();
  await settle(publicPage);
  records.push({
    state: 'public-home',
    screenshot: await capture(publicPage, outputDir, '01-public-home'),
    axe: await scan(publicPage),
    keyboard: await auditPublicKeyboard(publicPage),
    overflow: await auditHorizontalOverflow(publicPage),
    svgTypography: await auditSvgTypography(publicPage),
    diagnostics: publicDiagnostics,
  });
  await publicContext.close();

  const setupContext = await browser.newContext({
    storageState: await authenticate(),
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const setupPage = await setupContext.newPage();
  const setupDiagnostics = attachDiagnostics(setupPage);
  await installFixtures(setupPage, emptyBootstrap);
  await setupPage.goto(`${BASE_URL}/home?entryHouse=h6`, { waitUntil: 'domcontentloaded' });
  await setupPage.getByRole('heading', { level: 1, name: '今天想先从哪里说起？' }).waitFor();
  await settle(setupPage);
  records.push({
    state: 'first-archive-setup',
    screenshot: await capture(setupPage, outputDir, '02-first-archive-setup'),
    axe: await scan(setupPage),
    keyboard: await auditWheelKeyboard(setupPage, '事业与公众'),
    overflow: await auditHorizontalOverflow(setupPage),
    svgTypography: await auditSvgTypography(setupPage),
    diagnostics: setupDiagnostics,
  });
  await setupContext.close();

  const returningContext = await browser.newContext({
    storageState: await authenticate(),
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const returningPage = await returningContext.newPage();
  const returningDiagnostics = attachDiagnostics(returningPage);
  await installFixtures(returningPage, returningBootstrap);
  await returningPage.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });
  await returningPage.getByRole('heading', { level: 2, name: '你的十二条路' }).waitFor();
  await returningPage
    .getByRole('group', { name: '十二域人生圆轮，可查看当前状态并选择入口' })
    .scrollIntoViewIfNeeded();
  await settle(returningPage);
  records.push({
    state: 'returning-wheel',
    screenshot: await capture(returningPage, outputDir, '03-returning-wheel'),
    axe: await scan(returningPage),
    keyboard: await auditWheelKeyboard(returningPage, '事业与公众'),
    overflow: await auditHorizontalOverflow(returningPage),
    svgTypography: await auditSvgTypography(returningPage),
    diagnostics: returningDiagnostics,
  });
  const detailHeading = returningPage.getByRole('heading', { level: 3, name: '事业与公众' });
  await detailHeading.scrollIntoViewIfNeeded();
  await settle(returningPage);
  records.push({
    state: 'sector-detail',
    screenshot: await capture(returningPage, outputDir, '04-sector-detail'),
    axe: await scan(returningPage),
    overflow: await auditHorizontalOverflow(returningPage),
    svgTypography: await auditSvgTypography(returningPage),
    diagnostics: returningDiagnostics,
  });
  await returningContext.close();

  return records;
}

await fs.mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: CHROMIUM_CHANNEL });
const viewports = [];
try {
  for (const viewport of VIEWPORTS) {
    viewports.push({
      ...viewport,
      records: await captureViewport(browser, viewport),
    });
  }
} finally {
  await browser.close();
}

const failures = viewports.flatMap((viewport) =>
  viewport.records.flatMap((record) => {
    const diagnostics = record.diagnostics;
    const problems = [];
    if (record.axe.length > 0) problems.push(`axe=${record.axe.length}`);
    if (record.overflow.overflow) problems.push('horizontal-overflow');
    if (
      record.svgTypography.minimumRenderedPx != null &&
      record.svgTypography.minimumRenderedPx < 11.5
    ) {
      problems.push(`svg-type=${record.svgTypography.minimumRenderedPx}`);
    }
    if (diagnostics.consoleErrors.length > 0)
      problems.push(`console=${diagnostics.consoleErrors.length}`);
    if (diagnostics.pageErrors.length > 0)
      problems.push(`pageerror=${diagnostics.pageErrors.length}`);
    if (diagnostics.failedRequests.length > 0)
      problems.push(`requestfailed=${diagnostics.failedRequests.length}`);
    if (diagnostics.httpErrors.length > 0) problems.push(`http=${diagnostics.httpErrors.length}`);
    if (record.keyboard && record.keyboard.pressed !== 'true') problems.push('keyboard-selection');
    return problems.map((problem) => `${viewport.key}/${record.state}:${problem}`);
  }),
);

const report = {
  generatedAt: new Date().toISOString(),
  baseURL: BASE_URL,
  account: EMAIL,
  fixtureOnly: true,
  productionTouched: false,
  viewports,
  failureCount: failures.length,
  failures,
};

await fs.writeFile(
  path.join(OUTPUT, 'browser-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ output: OUTPUT, failureCount: failures.length, failures }, null, 2)}\n`,
);
if (failures.length > 0) {
  process.exitCode = 1;
}
