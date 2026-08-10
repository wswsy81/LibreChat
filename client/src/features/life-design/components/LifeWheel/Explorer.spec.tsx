/**
 * @jest-environment @happy-dom/jest-environment
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { LifeWheelView } from 'librechat-data-provider';
import Explorer from './Explorer';

const mockEnter = jest.fn();

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

describe('Explorer personal life wheel', () => {
  test('登录后的个人地图使用真实 lifeWheel，而不是公开首页迷雾图', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);
    expect(screen.getByRole('group', { name: 'com_life_wheel_title' })).toBeInTheDocument();
    expect(screen.queryByText('com_life_public_map_kicker')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /com_life_map_house_h6 · com_life_recognition_owned · com_life_wheel_current_state · com_life_wheel_previous_trend/,
      }),
    ).toBeInTheDocument();
  });

  test('趋势行带方向符号且符号对读屏隐藏', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);
    const glyph = screen.getByText('↗');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('com_life_trend_improving')).toBeInTheDocument();
  });

  test('点击当前领域也统一走领域入口，由后端恢复它自己的长期会话', () => {
    render(
      <Explorer
        wheel={wheel}
        archiveName="修文"
        domainConversations={[{ entryHouse: 'h6', conversationId: 'work-conversation' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /com_life_continue_here/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h6' });
  });

  test('选择非当前领域时仍走领域入口', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);

    fireEvent.click(screen.getByRole('button', { name: /^com_life_map_house_h10 ·/ }));
    fireEvent.click(screen.getByRole('button', { name: /com_life_start_house/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h10' });
  });

  test('选择聊过但不是当前的领域时显示“回到这块”并恢复旧页', () => {
    render(
      <Explorer
        wheel={wheel}
        archiveName="修文"
        domainConversations={[{ entryHouse: 'h2', conversationId: 'money-conversation' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^com_life_map_house_h2 ·/ }));
    fireEvent.click(screen.getByRole('button', { name: /com_life_return_to_house/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h2' });
  });

  test('登录后的十二个领域全部可进入，未知领域也能从这里开始', () => {
    render(<Explorer wheel={wheel} archiveName="修文" />);

    for (const key of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^com_life_map_house_${key} ·`) }),
      ).toHaveAttribute('tabindex', '0');
    }

    fireEvent.click(screen.getByRole('button', { name: /^com_life_map_house_h1 ·/ }));
    fireEvent.click(screen.getByRole('button', { name: /com_life_start_house/ }));

    expect(mockEnter).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h1' });
  });
});
