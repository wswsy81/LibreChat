import { act, fireEvent, render, screen } from '@testing-library/react';
import AudioRecorder from './AudioRecorder';
import { useSpeechToText } from '~/hooks';

const mockStartRecording = jest.fn();
const mockStopRecording = jest.fn();
const mockCancelRecording = jest.fn();
const mockResetAfterSubmit = jest.fn();
let mockSetSpeechText: ((text: string) => void) | undefined;
let mockIsListening = true;
let mockIsLoading = false;
let mockSpeechToTextEndpoint = 'browser';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useGetAudioSettings: () => ({ speechToTextEndpoint: mockSpeechToTextEndpoint }),
  useSpeechToText: jest.fn((setText: (text: string) => void) => {
    mockSetSpeechText = setText;
    return {
      isListening: mockIsListening,
      isLoading: mockIsLoading,
      startRecording: mockStartRecording,
      stopRecording: mockStopRecording,
      cancelRecording: mockCancelRecording,
      resetAfterSubmit: mockResetAfterSubmit,
    };
  }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
  ListeningIcon: () => null,
  Spinner: () => null,
}));

jest.mock('~/Providers', () => ({
  useChatFormContext: jest.fn(),
}));

jest.mock('~/common', () => ({
  globalAudioId: 'global-audio',
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

const mockUseSpeechToText = useSpeechToText as jest.MockedFunction<typeof useSpeechToText>;

const firePointerEvent = (
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  values: { button?: number; clientY: number; pointerId: number },
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.entries(values).forEach(([key, value]) => {
    Object.defineProperty(event, key, { value });
  });
  fireEvent(element, event);
};

describe('AudioRecorder submission cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSpeechText = undefined;
    mockIsListening = true;
    mockIsLoading = false;
    mockSpeechToTextEndpoint = 'browser';
  });

  it('stops and discards the recognition session when a message starts submitting', () => {
    const methods = {
      setValue: jest.fn(),
      reset: jest.fn(),
      getValues: jest.fn(() => ''),
    };
    const { rerender } = render(
      <AudioRecorder
        disabled={false}
        ask={jest.fn()}
        methods={methods as never}
        isSubmitting={false}
      />,
    );

    rerender(
      <AudioRecorder
        disabled={false}
        ask={jest.fn()}
        methods={methods as never}
        isSubmitting={true}
      />,
    );

    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(mockResetAfterSubmit).toHaveBeenCalledTimes(1);
    expect(mockUseSpeechToText).toHaveBeenCalled();
  });

  it('rejects a same-batch late transcript once submission is active', () => {
    const methods = {
      setValue: jest.fn(),
      reset: jest.fn(),
      getValues: jest.fn(() => ''),
    };
    const { rerender } = render(
      <AudioRecorder
        disabled={false}
        ask={jest.fn()}
        methods={methods as never}
        isSubmitting={false}
      />,
    );

    rerender(
      <AudioRecorder
        disabled={false}
        ask={jest.fn()}
        methods={methods as never}
        isSubmitting={true}
      />,
    );
    mockSetSpeechText?.('已经发送却迟到的识别结果');

    expect(methods.setValue).not.toHaveBeenCalled();
  });
});

describe('AudioRecorder hold-to-talk interaction', () => {
  const renderRecorder = () => {
    const methods = {
      setValue: jest.fn(),
      reset: jest.fn(),
      getValues: jest.fn(() => '原来的文字'),
    };
    render(
      <AudioRecorder
        disabled={false}
        ask={jest.fn()}
        methods={methods as never}
        isSubmitting={false}
      />,
    );
    return methods;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSpeechText = undefined;
    mockIsListening = false;
    mockIsLoading = false;
    mockSpeechToTextEndpoint = 'external';
    mockStartRecording.mockResolvedValue(true);
  });

  it('opens a full hold-to-talk control instead of starting on the mic tap', () => {
    renderRecorder();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_use_micrphone' }));

    expect(screen.getByRole('group', { name: 'com_life_voice_mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_life_voice_hold' })).toBeInTheDocument();
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('starts while held and stops for transcription on release', async () => {
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_use_micrphone' }));
    const holdButton = screen.getByRole('button', { name: 'com_life_voice_hold' });

    await act(async () => {
      firePointerEvent(holdButton, 'pointerdown', { button: 0, clientY: 200, pointerId: 1 });
    });
    firePointerEvent(holdButton, 'pointerup', { clientY: 200, pointerId: 1 });

    expect(mockStartRecording).toHaveBeenCalledTimes(1);
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(mockCancelRecording).not.toHaveBeenCalled();
    expect(screen.getByText('com_life_voice_transcribing')).toBeInTheDocument();
  });

  it('discards the recording and restores existing text after an upward cancel gesture', async () => {
    const methods = renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_use_micrphone' }));
    const holdButton = screen.getByRole('button', { name: 'com_life_voice_hold' });

    await act(async () => {
      firePointerEvent(holdButton, 'pointerdown', { button: 0, clientY: 200, pointerId: 2 });
    });
    firePointerEvent(holdButton, 'pointermove', { clientY: 120, pointerId: 2 });
    firePointerEvent(holdButton, 'pointerup', { clientY: 120, pointerId: 2 });

    expect(mockCancelRecording).toHaveBeenCalledTimes(1);
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(methods.setValue).toHaveBeenCalledWith('text', '原来的文字', {
      shouldValidate: true,
    });
  });

  it('returns to the ready state when microphone access does not start a recording', async () => {
    mockStartRecording.mockResolvedValue(false);
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_use_micrphone' }));
    const holdButton = screen.getByRole('button', { name: 'com_life_voice_hold' });

    await act(async () => {
      firePointerEvent(holdButton, 'pointerdown', { button: 0, clientY: 200, pointerId: 3 });
    });

    expect(screen.getByRole('button', { name: 'com_life_voice_hold' })).toBeInTheDocument();
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(mockCancelRecording).not.toHaveBeenCalled();
  });
});
