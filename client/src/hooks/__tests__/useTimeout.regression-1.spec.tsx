/**
 * @jest-environment @happy-dom/jest-environment
 */
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';

import useTimeout from '../useTimeout';

type ProbeProps = {
  callback: (value: string | number | boolean | null) => void;
  onReady: (handler: (value?: string) => void) => void;
  children?: ReactNode;
};

function Probe({ callback, onReady }: ProbeProps) {
  const handler = useTimeout({ callback, delay: 10 });

  useEffect(() => {
    onReady(handler);
  }, [handler, onReady]);

  return null;
}

describe('useTimeout callback stability', () => {
  it('keeps one handler across rerenders and calls the latest callback', () => {
    jest.useFakeTimers();
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();
    const handlers: Array<(value?: string) => void> = [];
    const onReady = (handler: (value?: string) => void) => handlers.push(handler);

    const view = render(<Probe callback={firstCallback} onReady={onReady} />);
    view.rerender(<Probe callback={secondCallback} onReady={onReady} />);

    expect(handlers).toHaveLength(1);

    act(() => {
      handlers[0]('refresh failed');
      jest.advanceTimersByTime(10);
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledWith('refresh failed');
    jest.useRealTimers();
  });
});
