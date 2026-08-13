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

test('公开首页恢复三条短内容与迷雾图，但不展示三条未来线预览', () => {
  render(<PublicHero />);

  expect(screen.getByTestId('public-mist-map')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  for (const text of ['先说一件最近发生的事', '一起弄清现在要处理什么', '找到现实里能试的一步']) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  for (const label of ['照现在这样走', '先试一小步', '彻底转向']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
});
