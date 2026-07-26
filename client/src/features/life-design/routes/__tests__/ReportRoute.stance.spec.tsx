import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeStanceFeedbackVariables } from '~/data-provider/Life/mutations';
import ReportRoute from '../ReportRoute';

const mockMutate = jest.fn();
const mockStanceFeedback: { current: unknown } = { current: null };

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ reportId: 'report-1' }),
}));

jest.mock('@librechat/client', () => ({
  ThemeContext: jest.requireActual('react').createContext({ theme: 'light' }),
  useMediaQuery: () => false,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));

jest.mock('../../components/ReportActions', () => () => <div data-testid="report-actions" />);

jest.mock('~/data-provider', () => ({
  useLifeReportQuery: () => ({
    data: {
      report: {
        id: 'report-1',
        title: '三条未来线',
        mode: 'decision',
        createdAt: '2026-07-26T00:00:00.000Z',
        stanceFeedback: mockStanceFeedback,
      },
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useLifeReportHtmlQuery: () => ({
    data: '<html><body>report</body></html>',
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useLifeStanceFeedbackMutation: () => ({ mutate: mockMutate }),
}));

function renderReport() {
  render(
    <MemoryRouter initialEntries={['/archive/reports/report-1']}>
      <ReportRoute />
    </MemoryRouter>,
  );
  return screen.getByTestId('life-report-frame') as HTMLIFrameElement;
}

function postFromFrame(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data, source: frame.contentWindow as Window }),
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStanceFeedback.current = null;
});

test('records a stance selection sent by the archive report frame', () => {
  const frame = renderReport();
  postFromFrame(frame, {
    type: 'life-reveal-stance-feedback',
    payload: {
      reportId: 'report-1',
      reportVersion: 1,
      selection: 'less_direct',
      effectiveLevel: 'direct',
      stancePolicyVersion: 'stance-v1',
    },
  });

  const [variables] = mockMutate.mock.calls[0] as [LifeStanceFeedbackVariables];
  expect(variables.reportId).toBe('report-1');
  expect(variables.payload.selection).toBe('less_direct');
  expect(screen.getByTestId('life-stance-feedback-status')).toHaveTextContent(
    'com_life_stance_feedback_saving',
  );
});

test('keeps the report height protocol working alongside the feedback protocol', () => {
  const frame = renderReport();
  postFromFrame(frame, { type: 'ui-size-change', payload: { height: 1500 } });

  expect(frame).toHaveStyle({ height: '1500px' });
  expect(mockMutate).not.toHaveBeenCalled();
});

test('shows the selection this report already carries', () => {
  mockStanceFeedback.current = {
    selection: 'just_right',
    effectiveLevel: 'direct',
    stancePolicyVersion: 'stance-v1',
    recordedAt: '2026-07-26T12:00:00.000Z',
  };
  renderReport();

  expect(screen.getByTestId('life-stance-feedback-status')).toHaveTextContent(
    'com_life_stance_feedback_saved',
  );
});
