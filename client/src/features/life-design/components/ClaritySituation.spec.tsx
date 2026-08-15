/**
 * @jest-environment @happy-dom/jest-environment
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import ClaritySituation from './ClaritySituation';

let mockIsSmallScreen = false;
const mockRefetch = jest.fn();
let mockSnapshot = {
  schemaVersion: 1 as const,
  conversationId: 'conversation-a',
  revision: 'revision-a',
  sourceTurnId: 'assistant-a',
  updatedAt: '2026-08-15T02:03:04.000Z',
  freshness: 'committed' as const,
  posture: 'clarifying' as const,
  issue: '分开看工作收入与消耗',
  ownership: 'user_stated' as const,
  layers: {
    judgment: '现在更像是投入回报失衡。',
    keyUnknowns: ['消耗来自工作本身还是合作方式'],
    whyNotConverged: '这两个来源会导向不同的下一步。',
  },
  remaining: { kind: 'key_unknowns' as const, count: 1 },
};

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => mockIsSmallScreen,
}));

jest.mock('~/data-provider', () => ({
  useLifeClarityQuery: () => ({
    data: { schemaVersion: 1, snapshot: mockSnapshot },
    refetch: mockRefetch,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('ClaritySituation', () => {
  beforeEach(() => {
    mockIsSmallScreen = false;
    mockRefetch.mockClear();
    mockSnapshot = {
      ...mockSnapshot,
      conversationId: 'conversation-a',
      sourceTurnId: 'assistant-a',
    };
  });

  it('opens the committed snapshot in a side surface', () => {
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        isSubmitting={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_life_clarity_open' }));

    expect(screen.getByText('现在更像是投入回报失衡。')).toBeInTheDocument();
    expect(screen.getByText('消耗来自工作本身还是合作方式')).toBeInTheDocument();
    expect(
      screen.queryByText(/confidence|facilitatorNext|evidenceQuotes/u),
    ).not.toBeInTheDocument();
  });

  it('does not show a snapshot from another active turn', () => {
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-b"
        isSubmitting={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_life_clarity_open' }));

    expect(screen.getByText('com_life_clarity_empty')).toBeInTheDocument();
    expect(screen.queryByText('现在更像是投入回报失衡。')).not.toBeInTheDocument();
  });

  it('uses a bottom sheet trigger on small screens', () => {
    mockIsSmallScreen = true;
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        isSubmitting={false}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'com_life_clarity_open' });
    expect(trigger.className).toContain('fixed');
    fireEvent.click(trigger);
    expect(screen.getByLabelText('com_life_clarity_title').className).toContain('bottom-0');
  });

  it('refreshes only three times after the main reply finishes', () => {
    jest.useFakeTimers();
    const view = render(
      <ClaritySituation conversationId="conversation-a" sourceTurnId="assistant-a" isSubmitting />,
    );

    view.rerender(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        isSubmitting={false}
      />,
    );
    act(() => jest.advanceTimersByTime(3500));

    expect(mockRefetch).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });
});
