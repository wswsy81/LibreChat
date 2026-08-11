import { act, renderHook } from '@testing-library/react';
import useSpeechToTextExternal from '../useSpeechToTextExternal';

const mockShowToast = jest.fn();
const mockProcessAudio = jest.fn();
const mockTrackStop = jest.fn();

class MockMediaRecorder {
  static isTypeSupported = () => true;
  state: RecordingState = 'recording';
  private listeners = new Map<string, EventListener>();

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  start() {}

  stop() {
    this.state = 'inactive';
    this.listeners.get('stop')?.(new Event('stop'));
  }
}

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
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: MockMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: mockTrackStop }],
        }),
      },
    });
  });

  it('silently ignores a stale stop after the recording session already ended', () => {
    const { result } = renderHook(() => useSpeechToTextExternal(jest.fn(), jest.fn()));

    act(() => {
      result.current.externalStopRecording();
    });

    expect(result.current.isListening).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('discards a cancelled recording without uploading it for transcription', async () => {
    const { result } = renderHook(() => useSpeechToTextExternal(jest.fn(), jest.fn()));

    await act(async () => {
      await result.current.externalStartRecording();
    });
    act(() => {
      result.current.externalCancelRecording();
    });

    expect(mockTrackStop).toHaveBeenCalledTimes(1);
    expect(mockProcessAudio).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
