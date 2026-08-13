/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';

import PublicHero from './PublicHero';

const mockTranslation: Record<string, string> = jest.requireActual('~/locales/en/translation.json');

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslation[key] ?? '',
}));

jest.mock('./PublicMistMap', () => {
  const actual = jest.requireActual('./PublicMistMap');
  return {
    __esModule: true,
    ...actual,
    default: () => <div data-testid="public-mist-map" />,
  };
});

test('公开首页保留长期人生顾问定位、四步循环与迷雾图，但不展示三条线', () => {
  render(<PublicHero />);

  expect(screen.getByTestId('public-mist-map')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByText('一位会记得你的长期人生顾问。')).toBeInTheDocument();
  for (const text of [
    '你先说一件最近发生的事',
    '一起弄清现在要处理什么',
    '找到现实里能试的一步',
    '回来看看结果',
  ]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  for (const text of ['看见现在的状态', '留下你认领的判断', '一份会继续更新的存档']) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
  for (const label of ['照现在这样走', '先试一小步', '彻底转向']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});
