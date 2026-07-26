import { stanceFeedbackErrorOf, stanceFeedbackFromMessage } from './stanceFeedback';

const validMessage = {
  type: 'life-reveal-stance-feedback',
  payload: {
    reportId: 'report-1',
    reportVersion: 2,
    selection: 'more_direct',
    effectiveLevel: 'direct',
    stancePolicyVersion: 'stance-v1',
  },
};

test('accepts the frozen cross-repo message contract', () => {
  expect(stanceFeedbackFromMessage(validMessage)).toEqual({
    reportId: 'report-1',
    payload: {
      reportVersion: 2,
      selection: 'more_direct',
      effectiveLevel: 'direct',
      stancePolicyVersion: 'stance-v1',
    },
  });
});

test('drops fields the API contract does not allow', () => {
  const parsed = stanceFeedbackFromMessage({
    ...validMessage,
    payload: { ...validMessage.payload, stancePreference: 'decisive' },
  });
  expect(parsed?.payload).not.toHaveProperty('stancePreference');
  expect(parsed?.payload).not.toHaveProperty('reportId');
});

test.each([
  ['a different message type', { ...validMessage, type: 'life-annotate' }],
  ['a size protocol message', { type: 'ui-size-change', payload: { height: 900 } }],
  ['a missing payload', { type: 'life-reveal-stance-feedback' }],
  ['a missing report id', { ...validMessage, payload: { ...validMessage.payload, reportId: '' } }],
  [
    'an unknown selection',
    { ...validMessage, payload: { ...validMessage.payload, selection: 'much_more_direct' } },
  ],
  [
    'an unknown level',
    { ...validMessage, payload: { ...validMessage.payload, effectiveLevel: 'brutal' } },
  ],
  [
    'a non integer version',
    { ...validMessage, payload: { ...validMessage.payload, reportVersion: 1.5 } },
  ],
  [
    'a malformed policy version',
    { ...validMessage, payload: { ...validMessage.payload, stancePolicyVersion: 'Stance V1' } },
  ],
  ['a string', 'life-reveal-stance-feedback'],
  ['null', null],
])('ignores %s', (_label, data) => {
  expect(stanceFeedbackFromMessage(data)).toBeNull();
});

test('reads the coded error shape both layers return', () => {
  const error = {
    response: {
      data: { error: { code: 'REPORT_VERSION_MISMATCH', message: '版本不一致', retryable: false } },
    },
  };
  expect(stanceFeedbackErrorOf(error)).toEqual({
    code: 'REPORT_VERSION_MISMATCH',
    retryable: false,
  });
});

test('treats an unreadable failure as retryable', () => {
  expect(stanceFeedbackErrorOf(new Error('network down'))).toEqual({
    code: null,
    retryable: true,
  });
});
