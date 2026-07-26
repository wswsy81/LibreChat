import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseMutationResult } from '@tanstack/react-query';
import type { LifeStanceFeedbackResponse } from 'librechat-data-provider';
import type { LifeStanceFeedbackVariables } from '~/data-provider/Life/mutations';
import StanceFeedbackShell from '../StanceFeedbackShell';

type MutateOptions = {
  onSuccess?: (result: LifeStanceFeedbackResponse) => void;
  onError?: (error: unknown) => void;
};

const mockMutate = jest.fn();

jest.mock('~/data-provider', () => ({
  useLifeStanceFeedbackMutation: () =>
    ({ mutate: mockMutate }) as unknown as UseMutationResult<
      LifeStanceFeedbackResponse,
      Error,
      LifeStanceFeedbackVariables
    >,
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, params?: Record<string, string>): string =>
      params ? `${key}|${Object.values(params).join('|')}` : key,
}));

const payloadOf = (selection = 'more_direct') => ({
  reportId: 'report-1',
  reportVersion: 1,
  selection,
  effectiveLevel: 'direct',
  stancePolicyVersion: 'stance-v1',
});

const recordedResponse: LifeStanceFeedbackResponse = {
  ok: true,
  reportId: 'report-1',
  reportVersion: 1,
  selection: 'more_direct',
  effectiveLevel: 'direct',
  stancePolicyVersion: 'stance-v1',
  recordedAt: '2026-07-26T12:00:00.000Z',
  replayed: false,
};

function renderShell(initial: React.ComponentProps<typeof StanceFeedbackShell>['initial'] = null) {
  const view = render(
    <StanceFeedbackShell initial={initial}>
      <iframe title="report" data-testid="report-frame" />
    </StanceFeedbackShell>,
  );
  const frame = screen.getByTestId('report-frame') as HTMLIFrameElement;
  return { ...view, frame };
}

function postFromFrame(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, source: frame.contentWindow as Window }),
    );
  });
}

const lastCall = () =>
  mockMutate.mock.calls[mockMutate.mock.calls.length - 1] as [
    LifeStanceFeedbackVariables,
    MutateOptions,
  ];

beforeEach(() => {
  jest.clearAllMocks();
});

test('submits a stance selection posted by the report frame', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });

  const [variables] = lastCall();
  expect(variables.reportId).toBe('report-1');
  expect(variables.payload).toEqual({
    reportVersion: 1,
    selection: 'more_direct',
    effectiveLevel: 'direct',
    stancePolicyVersion: 'stance-v1',
  });
  expect(variables.idempotencyKey).toEqual(expect.any(String));
  expect(variables.idempotencyKey.length).toBeGreaterThan(8);
  expect(screen.getByText('com_life_stance_feedback_saving')).toBeInTheDocument();
});

test('confirms the recorded selection and invites a change', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });

  const [, options] = lastCall();
  act(() => options.onSuccess?.(recordedResponse));

  expect(
    screen.getByText('com_life_stance_feedback_saved|com_life_stance_more_direct'),
  ).toBeInTheDocument();
});

test('retries a failed submission with the same idempotency key', async () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [first, options] = lastCall();
  act(() => options.onError?.(new Error('offline')));

  expect(screen.getByRole('alert')).toHaveTextContent('com_life_stance_feedback_failed');
  await userEvent.click(screen.getByTestId('life-stance-feedback-retry'));

  const [retried] = lastCall();
  expect(mockMutate).toHaveBeenCalledTimes(2);
  expect(retried.idempotencyKey).toBe(first.idempotencyKey);
  expect(retried.payload).toEqual(first.payload);
});

test('uses a new idempotency key when the reader changes their pick', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [first, options] = lastCall();
  act(() => options.onSuccess?.(recordedResponse));

  postFromFrame(frame, {
    type: 'life-reveal-stance-feedback',
    payload: payloadOf('less_direct'),
  });

  const [second] = lastCall();
  expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  expect(second.payload.selection).toBe('less_direct');
  expect(screen.getByText('com_life_stance_feedback_saving')).toBeInTheDocument();
});

test('does not record a second event when the same option is clicked again', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [, options] = lastCall();
  act(() => options.onSuccess?.(recordedResponse));

  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });

  expect(mockMutate).toHaveBeenCalledTimes(1);
});

test('offers no retry when the report moved on', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [, options] = lastCall();
  act(() =>
    options.onError?.({
      response: {
        data: {
          error: { code: 'REPORT_VERSION_MISMATCH', message: '版本不一致', retryable: false },
        },
      },
    }),
  );

  expect(screen.getByRole('alert')).toHaveTextContent('com_life_stance_feedback_stale');
  expect(screen.queryByTestId('life-stance-feedback-retry')).not.toBeInTheDocument();
});

test('a slow first answer cannot overwrite a newer selection', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [, firstOptions] = lastCall();
  postFromFrame(frame, {
    type: 'life-reveal-stance-feedback',
    payload: payloadOf('less_direct'),
  });
  const [, secondOptions] = lastCall();

  act(() => secondOptions.onSuccess?.({ ...recordedResponse, selection: 'less_direct' }));
  act(() => firstOptions.onSuccess?.(recordedResponse));

  expect(
    screen.getByText('com_life_stance_feedback_saved|com_life_stance_less_direct'),
  ).toBeInTheDocument();
});

test('clicking the same option after a failure retries instead of writing twice', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [first, options] = lastCall();
  act(() => options.onError?.(new Error('offline')));

  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });

  const [retried] = lastCall();
  expect(retried.idempotencyKey).toBe(first.idempotencyKey);
});

test('a rejected request is not dressed up as a stale report', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-reveal-stance-feedback', payload: payloadOf() });
  const [, options] = lastCall();
  act(() =>
    options.onError?.({
      response: {
        data: {
          error: { code: 'STANCE_FEEDBACK_INVALID', message: '反馈无效', retryable: false },
        },
      },
    }),
  );

  expect(screen.getByRole('alert')).toHaveTextContent('com_life_stance_feedback_rejected');
  expect(screen.queryByTestId('life-stance-feedback-retry')).not.toBeInTheDocument();
});

test('shows the selection already recorded for this report', () => {
  renderShell({
    selection: 'just_right',
    effectiveLevel: 'direct',
    stancePolicyVersion: 'stance-v1',
    recordedAt: '2026-07-26T12:00:00.000Z',
  });

  expect(
    screen.getByText('com_life_stance_feedback_saved|com_life_stance_just_right'),
  ).toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});

test('ignores messages from windows outside this shell', () => {
  renderShell();
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'life-reveal-stance-feedback', payload: payloadOf() },
        source: window as Window,
      }),
    );
  });

  expect(mockMutate).not.toHaveBeenCalled();
});

test('leaves other frame protocols to their own handlers', () => {
  const { frame } = renderShell();
  postFromFrame(frame, { type: 'life-annotate', payload: { target: 'scenes#1', action: 'keep' } });
  postFromFrame(frame, { type: 'ui-size-change', payload: { height: 1200 } });

  expect(mockMutate).not.toHaveBeenCalled();
  expect(screen.queryByText('com_life_stance_feedback_saving')).not.toBeInTheDocument();
});

test('drops a report id that does not belong to this shell', () => {
  render(
    <StanceFeedbackShell reportId="report-1">
      <iframe title="report" data-testid="report-frame" />
    </StanceFeedbackShell>,
  );
  const frame = screen.getByTestId('report-frame') as HTMLIFrameElement;
  postFromFrame(frame, {
    type: 'life-reveal-stance-feedback',
    payload: { ...payloadOf(), reportId: 'report-other' },
  });

  expect(mockMutate).not.toHaveBeenCalled();
});
