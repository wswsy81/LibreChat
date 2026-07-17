import { act, renderHook } from '@testing-library/react';
import useSpeechToTextBrowser from '../useSpeechToTextBrowser';

const mockStartListening = jest.fn();
const mockStopListening = jest.fn();
const mockResetTranscript = jest.fn();

let mockListening = false;
let mockFinalTranscript = '';
let mockInterimTranscript = '';

jest.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: (...args: unknown[]) => mockStartListening(...args),
    stopListening: (...args: unknown[]) => mockStopListening(...args),
  },
  useSpeechRecognition: () => ({
    listening: mockListening,
    finalTranscript: mockFinalTranscript,
    interimTranscript: mockInterimTranscript,
    resetTranscript: mockResetTranscript,
    isMicrophoneAvailable: true,
    browserSupportsSpeechRecognition: true,
  }),
}));

jest.mock('recoil', () => ({
  useRecoilState: (state: string) => {
    if (state === 'languageSTT') {
      return ['zh-CN', jest.fn()];
    }
    if (state === 'autoTranscribeAudio') {
      return [false, jest.fn()];
    }
    return [-1, jest.fn()];
  },
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    autoSendText: 'autoSendText',
    languageSTT: 'languageSTT',
    autoTranscribeAudio: 'autoTranscribeAudio',
  },
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../useGetAudioSettings', () => ({
  __esModule: true,
  default: () => ({ speechToTextEndpoint: 'browser' }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetCustomConfigSpeechQuery: () => ({ data: {} }),
}));

describe('useSpeechToTextBrowser continuous dictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListening = false;
    mockFinalTranscript = '';
    mockInterimTranscript = '';
  });

  it('keeps browser dictation continuous even when the legacy auto-transcribe setting is off', () => {
    const { result } = renderHook(() => useSpeechToTextBrowser(jest.fn(), jest.fn()));

    act(() => {
      result.current.startRecording();
    });

    expect(mockStartListening).toHaveBeenCalledWith({
      language: 'zh-CN',
      continuous: true,
    });
  });

  it('stopRecording is a no-op instead of starting a new session when the browser already ended one', () => {
    const { result } = renderHook(() => useSpeechToTextBrowser(jest.fn(), jest.fn()));

    act(() => {
      result.current.stopRecording();
    });

    expect(mockStopListening).not.toHaveBeenCalled();
    expect(mockStartListening).not.toHaveBeenCalled();
  });

  it('stopRecording stops an active recognition session', () => {
    mockListening = true;
    const { result } = renderHook(() => useSpeechToTextBrowser(jest.fn(), jest.fn()));

    act(() => {
      result.current.stopRecording();
    });

    expect(mockStopListening).toHaveBeenCalledTimes(1);
    expect(mockStartListening).not.toHaveBeenCalled();
  });

  it('ignores late browser transcripts after the message was submitted', () => {
    const setText = jest.fn();
    const { result, rerender } = renderHook(() => useSpeechToTextBrowser(setText, jest.fn()));

    act(() => {
      result.current.startRecording();
    });
    mockFinalTranscript = '已经发送的内容';
    rerender();
    expect(setText).toHaveBeenLastCalledWith('已经发送的内容');

    act(() => {
      result.current.resetAfterSubmit();
    });
    setText.mockClear();

    mockFinalTranscript = '已经发送的内容，迟到的尾巴';
    mockInterimTranscript = '已经发送的内容';
    rerender();

    expect(mockResetTranscript).toHaveBeenCalledTimes(1);
    expect(setText).not.toHaveBeenCalled();
  });

  it('accepts transcripts again when the user starts a new recording session', () => {
    const setText = jest.fn();
    const { result, rerender } = renderHook(() => useSpeechToTextBrowser(setText, jest.fn()));

    act(() => {
      result.current.resetAfterSubmit();
      result.current.startRecording();
    });

    mockFinalTranscript = '下一次真正的新语音';
    rerender();

    expect(setText).toHaveBeenLastCalledWith('下一次真正的新语音');
  });
});
