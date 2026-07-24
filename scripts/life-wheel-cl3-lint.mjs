import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_FILE = 'client/src/locales/en/translation.json';
const TARGET_FILES = [
  'client/src/features/life-design/routes/HomeRoute.tsx',
  'client/src/features/life-design/components/PublicHero.tsx',
  'client/src/features/life-design/components/PublicMistMap.tsx',
  'client/src/features/life-design/components/FirstArchiveSetup.tsx',
  'client/src/features/life-design/components/ReturningHome.tsx',
  'client/src/features/life-design/components/LifeSidebarPanel.tsx',
  'client/src/features/life-design/components/LifeWheel/LifeWheel.tsx',
  'client/src/features/life-design/components/LifeWheel/Explorer.tsx',
];
const PUBLIC_FILES = TARGET_FILES.slice(0, 3);

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const issue = (kind, file, detail) => ({ kind, file, detail });

const issues = [];
const locale = JSON.parse(read(LOCALE_FILE));
const localizationKeys = new Set();
const publicLocalizationKeys = new Set();

for (const file of TARGET_FILES) {
  const source = read(file);
  for (const match of source.matchAll(/localize\(\s*['"]([^'"]+)['"]/g)) {
    localizationKeys.add(match[1]);
    if (PUBLIC_FILES.includes(file)) {
      publicLocalizationKeys.add(match[1]);
    }
  }
  for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    issues.push(issue('typography-token', file, `禁止硬编码字号 ${match[0]}`));
  }
  for (const match of source.matchAll(/血条|最低(?:血条|分)|重新做一次|重新评分/g)) {
    issues.push(issue('retired-score-copy', file, `命中 ${match[0]}`));
  }
}

for (const file of PUBLIC_FILES) {
  const source = read(file);
  for (const match of source.matchAll(
    /生辰|出生(?:日期|时间|地点|信息)|星盘|占星|命理|运势|十二宫|宫位/g,
  )) {
    issues.push(issue('public-redline-copy', file, `命中 ${match[0]}`));
  }
}

for (const key of localizationKeys) {
  if (typeof locale[key] !== 'string' || locale[key].trim() === '') {
    issues.push(issue('missing-localization', LOCALE_FILE, key));
    continue;
  }
  for (const match of locale[key].matchAll(/血条|最低(?:血条|分)|\/10|重新做一次|重新评分/g)) {
    issues.push(issue('retired-score-copy', LOCALE_FILE, `${key} 命中 ${match[0]}`));
  }
}

for (const key of publicLocalizationKeys) {
  for (const match of locale[key].matchAll(
    /生辰|出生(?:日期|时间|地点|信息)|星盘|占星|命理|运势|十二宫|宫位/g,
  )) {
    issues.push(issue('public-redline-copy', LOCALE_FILE, `${key} 命中 ${match[0]}`));
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  targetFiles: TARGET_FILES,
  localizationKeyCount: localizationKeys.size,
  rules: {
    publicRedline: '公开首页不得出现生辰、出生排盘指纹、星盘/占星/命理/运势/宫位术语',
    retiredScoreCopy: '活动界面不得恢复血条、最低分、/10 或重评分话术',
    typography: 'CL3 页面不得使用 text-[Npx]，统一使用 DESIGN 六档字号 token',
    localization: '所有静态 localize(...) 键必须在英文权威 locale 中存在且非空',
  },
  issueCount: issues.length,
  issues,
};

const outputFlag = process.argv.indexOf('--output');
if (outputFlag >= 0) {
  const outputPath = process.argv[outputFlag + 1];
  if (!outputPath) {
    throw new Error('--output 缺少路径');
  }
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (issues.length > 0) {
  process.exitCode = 1;
}
