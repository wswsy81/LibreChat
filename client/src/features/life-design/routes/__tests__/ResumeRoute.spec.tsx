/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ResumeRoute from '../ResumeRoute';

const mockNavigate = jest.fn();
const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockResume = {
  isError: true,
  mutate: mockMutate,
  reset: mockReset,
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/data-provider', () => ({
  useLifeResumeMutation: () => mockResume,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../../components/PageState', () => ({
  LifeError: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>
      continue
    </button>
  ),
  LifeLoading: () => <div>loading</div>,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockResume.isError = true;
});

test('恢复失败时也回到“说件新事”的领域选择，不落入通用空白聊天', () => {
  render(
    <MemoryRouter>
      <ResumeRoute />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'continue' }));

  expect(mockNavigate).toHaveBeenCalledWith('/home?new=1');
  expect(mockNavigate).not.toHaveBeenCalledWith('/c/new');
});

test('another tab replaying the same new-page operation waits instead of opening a duplicate page', () => {
  jest.useFakeTimers();
  mockResume.isError = false;
  const { unmount } = render(
    <MemoryRouter>
      <ResumeRoute />
    </MemoryRouter>,
  );

  const callbacks = mockMutate.mock.calls[0][1] as {
    onSuccess: (response: {
      action: 'new';
      conversationId: null;
      route: string;
      operationId: string;
      replayed: true;
    }) => void;
  };
  callbacks.onSuccess({
    action: 'new',
    conversationId: null,
    route: '/c/new?q=resume&submit=true',
    operationId: 'shared-resume-operation',
    replayed: true,
  });

  expect(mockNavigate).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1200);
  expect(mockReset).toHaveBeenCalledTimes(1);

  unmount();
  jest.useRealTimers();
});
