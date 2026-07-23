import { act, renderHook } from '@testing-library/react';
import useSpeechToTextExternal from '../useSpeechToTextExternal';

const mockShowToast = jest.fn();
const mockProcessAudio = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('recoil', () => ({
  useRecoilState: () => [false, jest.fn()],
}));

jest.mock('~/data-provider', () => ({
  useSpeechToTextMutation: () => ({ mutate: mockProcessAudio, isLoading: false }),
}));

jest.mock('../useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: 'external' }),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    decibelValue: 'decibelValue',
    autoSendText: 'autoSendText',
    languageSTT: 'languageSTT',
    speechToText: 'speechToText',
    autoTranscribeAudio: 'autoTranscribeAudio',
  },
}));

describe('useSpeechToTextExternal idempotent stop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('silently ignores a stale stop after the recording session already ended', () => {
    const { result } = renderHook(() => useSpeechToTextExternal(jest.fn(), jest.fn()));

    act(() => {
      result.current.externalStopRecording();
    });

    expect(result.current.isListening).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
