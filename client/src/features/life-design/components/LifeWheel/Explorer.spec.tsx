/**
 * @jest-environment @happy-dom/jest-environment
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { LifeWheelView } from 'librechat-data-provider';
import Explorer from './Explorer';

const mockNavigate = jest.fn();
const mockEnter = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));

jest.mock('../../hooks/useEntry', () => ({
  __esModule: true,
  default: () => ({ enterHouse: mockEnter, error: null, isLoading: false }),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
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

beforeEach(() => {
  jest.clearAllMocks();
});

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

  test('点击当前亮灯领域应恢复最近会话，不新建 house_entered 回访', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);

    fireEvent.click(screen.getByRole('button', { name: /com_life_enter_house/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/resume');
    expect(mockEnter).not.toHaveBeenCalled();
  });

  test('选择非当前领域时仍走领域入口', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);

    fireEvent.click(screen.getByRole('button', { name: /事业与公众/ }));
    fireEvent.click(screen.getByRole('button', { name: /com_life_enter_house/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h10' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
