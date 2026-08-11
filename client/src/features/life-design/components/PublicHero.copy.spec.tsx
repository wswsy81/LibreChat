/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PublicHero from './PublicHero';

const mockTranslation: Record<string, string> = jest.requireActual('~/locales/en/translation.json');

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslation[key] ?? '',
}));

test('公开首页先说明长期人生顾问与四步续接循环', () => {
  render(
    <MemoryRouter>
      <PublicHero />
    </MemoryRouter>,
  );

  expect(screen.getByText('一位会记得你的长期人生顾问。')).toBeInTheDocument();
  for (const label of [
    '你先说一件最近发生的事',
    '一起弄清现在要处理什么',
    '找到现实里能试的一步',
    '回来看看结果',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(
    screen.getByText('你确认的内容会进入自己的人生存档；不对的可以改写或划掉。'),
  ).toBeInTheDocument();
});

test('公开首页不展示三线示例、默认工作或公开可选地图', () => {
  render(
    <MemoryRouter>
      <PublicHero />
    </MemoryRouter>,
  );
  for (const text of ['照现在这样走', '先试一小步', '彻底转向', '看你自己的「工作」']) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
  expect(screen.queryByRole('group', { name: /迷雾人生地图/ })).not.toBeInTheDocument();
});
