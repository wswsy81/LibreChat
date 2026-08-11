import { act, renderHook } from '@testing-library/react';
import useSpeechToTextExternal from '../useSpeechToTextExternal';

const mockShowToast = jest.fn();
const mockProcessAudio = jest.fn();
const mockTrackStop = jest.fn();

class MockMediaRecorder {
  static latest: MockMediaRecorder | null = null;

  static supportedTypes = new Set([
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/wav',
  ]);

  static isTypeSupported = (type: string) => MockMediaRecorder.supportedTypes.has(type);

  state: RecordingState = 'recording';
  mimeType: string;
  startArgs: number[] = [];
  private listeners = new Map<string, EventListener>();

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? '';
    MockMediaRecorder.latest = this;
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  start(timeslice?: number) {
    this.startArgs = timeslice == null ? [] : [timeslice];
  }

  emitData(data: Blob) {
    const event = new Event('dataavailable') as BlobEvent;
    Object.defineProperty(event, 'data', { value: data });
    this.listeners.get('dataavailable')?.(event);
  }

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
    MockMediaRecorder.latest = null;
    MockMediaRecorder.supportedTypes = new Set([
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
    ]);
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

  it('uploads one complete iOS MP4 recording without timeslicing', async () => {
    MockMediaRecorder.supportedTypes = new Set(['audio/mp4']);
    const { result } = renderHook(() => useSpeechToTextExternal(jest.fn(), jest.fn()));

    await act(async () => {
      await result.current.externalStartRecording();
    });

    expect(MockMediaRecorder.latest?.startArgs).toEqual([]);

    act(() => {
      MockMediaRecorder.latest?.emitData(new Blob(['complete recording'], { type: 'audio/mp4' }));
      result.current.externalStopRecording();
    });

    expect(mockProcessAudio).toHaveBeenCalledTimes(1);
    const formData = mockProcessAudio.mock.calls[0][0] as FormData;
    const audio = formData.get('audio') as File;
    expect(audio.type).toBe('audio/mp4');
    expect(audio.name).toBe('audio.m4a');
    expect(audio.size).toBeGreaterThan(0);
  });

  it('does not upload zero-byte recorder chunks', async () => {
    const { result } = renderHook(() => useSpeechToTextExternal(jest.fn(), jest.fn()));

    await act(async () => {
      await result.current.externalStartRecording();
    });
    act(() => {
      MockMediaRecorder.latest?.emitData(new Blob([]));
      result.current.externalStopRecording();
    });

    expect(mockProcessAudio).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'The audio was too short',
      status: 'warning',
    });
  });
});
