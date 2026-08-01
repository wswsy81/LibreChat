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

describe('Explorer mist map', () => {
  test('老用户首页使用与公开首页同源的迷雾图，不再渲染圆轮图例', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);
    expect(screen.getByText('com_life_public_map_kicker')).toBeInTheDocument();
    expect(screen.queryByText('com_life_legend_lantern')).not.toBeInTheDocument();
    expect(screen.queryByText('com_life_legend_marker')).not.toBeInTheDocument();
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

    const career = screen
      .getAllByText('com_life_map_house_h10')
      .map((node) => node.closest('button'))
      .find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    fireEvent.click(career as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /com_life_enter_house/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h10' });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('390px 分支保留四个可点入口，其余地块和健康留在雾里', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);

    const buttonFor = (label: string) =>
      screen
        .getAllByText(label)
        .map((node) => node.closest('button'))
        .find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);

    for (const key of ['h2', 'h6', 'h7', 'h10']) {
      expect(buttonFor(`com_life_map_house_${key}`)).not.toBeDisabled();
    }
    expect(buttonFor('com_life_map_house_h1')).toBeDisabled();
    expect(buttonFor('com_life_map_health')).toBeDisabled();
  });
});
