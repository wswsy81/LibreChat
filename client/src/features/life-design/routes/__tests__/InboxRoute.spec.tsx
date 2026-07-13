import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InboxRoute from '../InboxRoute';

const mockCapture = jest.fn();
const mockRefetch = jest.fn();

jest.mock('~/data-provider', () => ({
  useLifeInboxQuery: () => ({
    data: {
      items: [
        {
          id: 'entry-1',
          text: '今天终于推进了一步',
          capturedAt: '2026-07-13T08:00:00.000Z',
          digested: false,
          digestedAt: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
  }),
  useLifeInboxMutation: () => ({
    mutate: mockCapture,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function renderRoute() {
  return render(
    <MemoryRouter>
      <InboxRoute />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders recent entries with their digestion state', () => {
  renderRoute();
  expect(screen.getByText('今天终于推进了一步')).toBeInTheDocument();
  expect(screen.getByText('com_life_inbox_pending')).toBeInTheDocument();
});

test('captures trimmed text with the keyboard shortcut and clears after success', async () => {
  renderRoute();
  const input = screen.getByPlaceholderText('com_life_inbox_placeholder');
  await userEvent.type(input, '  一个新想法  ');
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

  expect(mockCapture).toHaveBeenCalledWith('一个新想法', expect.any(Object));
  const options = mockCapture.mock.calls[0][1];
  act(() => options.onSuccess());
  expect(input).toHaveValue('');
});
