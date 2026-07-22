import React from 'react';
import { act, render, screen } from '@testing-library/react';

import ResponseProgress from '../ResponseProgress';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => {
    const messages: Record<string, string> = {
      com_life_advisor_thinking: '在想…',
      com_life_advisor_writing: '在整理回答…',
    };
    return messages[key] ?? key;
  },
}));

describe('ResponseProgress', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('announces thinking immediately and moves to writing after a bounded delay', () => {
    render(<ResponseProgress />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('在想…');

    act(() => jest.advanceTimersByTime(6000));

    expect(status).toHaveTextContent('在整理回答…');
  });
});
