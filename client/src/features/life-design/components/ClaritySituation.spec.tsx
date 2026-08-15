/**
 * @jest-environment @happy-dom/jest-environment
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LifeClaritySnapshot } from 'librechat-data-provider';
import ClaritySituation from './ClaritySituation';

let mockIsSmallScreen = false;
const mockRefetch = jest.fn();
const makeSnapshot = (overrides: Partial<LifeClaritySnapshot> = {}): LifeClaritySnapshot => ({
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
  ...overrides,
});
let mockSnapshot: LifeClaritySnapshot | null = makeSnapshot();

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
    mockSnapshot = makeSnapshot();
  });

  it('opens the committed snapshot in a side surface', async () => {
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'com_life_clarity_open' });
    fireEvent.click(trigger);

    expect(screen.getByText('现在更像是投入回报失衡。')).toBeInTheDocument();
    expect(screen.getByText('消耗来自工作本身还是合作方式')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'com_life_clarity_close' })).toHaveFocus(),
    );
    expect(trigger.parentElement).toHaveAttribute('aria-hidden', 'true');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'com_life_clarity_close' })).toHaveFocus();
    expect(
      screen.queryByText(/confidence|facilitatorNext|evidenceQuotes/u),
    ).not.toBeInTheDocument();
  });

  it('does not show a snapshot from another active turn', () => {
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-b"
        previousSourceTurnId="assistant-before-b"
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
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'com_life_clarity_open' });
    expect(trigger.className).toContain('fixed');
    fireEvent.click(trigger);
    expect(screen.getByLabelText('com_life_clarity_title').className).toContain('bottom-0');
  });

  it('performs three bounded refetches when an exact snapshot is missing on mount', () => {
    jest.useFakeTimers();
    mockSnapshot = null;
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );
    act(() => jest.advanceTimersByTime(3500));

    expect(mockRefetch).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('retains the accepted snapshot only for the next turn on the same active branch', async () => {
    const view = render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );

    mockSnapshot = null;
    view.rerender(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-b"
        previousSourceTurnId="assistant-a"
        isSubmitting={false}
      />,
    );
    expect(screen.getByText('com_life_clarity_summary_updating')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_life_clarity_open' }));

    expect(screen.getByText('现在更像是投入回报失衡。')).toBeInTheDocument();
    expect(screen.getByText('com_life_clarity_stale')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'com_life_clarity_open' })).toHaveFocus(),
    );
  });

  it('does not retain a snapshot when switching to a sibling branch', () => {
    const view = render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );

    mockSnapshot = null;
    view.rerender(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-sibling"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_life_clarity_open' }));

    expect(screen.getByText('com_life_clarity_empty')).toBeInTheDocument();
    expect(screen.queryByText('现在更像是投入回报失衡。')).not.toBeInTheDocument();
  });

  it('keeps a resolved takeaway visible', () => {
    mockSnapshot = makeSnapshot({
      posture: 'resolved',
      layers: {
        judgment: '已经确认主要是投入回报失衡。',
        keyUnknowns: [],
        whyNotConverged: null,
      },
      remaining: { kind: 'none_identified', count: 0 },
    });
    render(
      <ClaritySituation
        conversationId="conversation-a"
        sourceTurnId="assistant-a"
        previousSourceTurnId="assistant-before-a"
        isSubmitting={false}
      />,
    );

    expect(screen.getByText('com_life_clarity_summary_resolved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_life_clarity_open' }));
    expect(screen.getByText('com_life_clarity_resolved')).toBeInTheDocument();
    expect(screen.getByText('已经确认主要是投入回报失衡。')).toBeInTheDocument();
  });
});
