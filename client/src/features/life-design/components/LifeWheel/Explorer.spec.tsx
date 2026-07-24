/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';
import type { LifeWheelView } from 'librechat-data-provider';
import Explorer from './Explorer';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));

jest.mock('../../hooks/useEntry', () => ({
  __esModule: true,
  default: () => ({ enterHouse: jest.fn(), error: null, isLoading: false }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

const wheel: LifeWheelView = {
  lanternHouse: 'h6',
  houses: [
    {
      id: 'h6',
      recognition: 'owned',
      condition: {
        level: 'strained',
        trend: 'improving',
        asOf: '2026-07-24T00:00:00.000Z',
        evidenceSummary: '每天都在救火',
      },
    },
  ],
} as unknown as LifeWheelView;

describe('Explorer wheel legend (盲态修单)', () => {
  test('圆轮下方渲染图例：三态 + 提灯 + 外圈箭头语义', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);
    expect(screen.getByText('com_life_recognition_unknown')).toBeInTheDocument();
    expect(screen.getByText('com_life_recognition_draft')).toBeInTheDocument();
    expect(screen.getByText('com_life_legend_lantern')).toBeInTheDocument();
    expect(screen.getByText('com_life_legend_marker')).toBeInTheDocument();
  });

  test('趋势行带方向符号且符号对读屏隐藏', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);
    const glyph = screen.getByText('↗');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('com_life_trend_improving')).toBeInTheDocument();
  });
});
