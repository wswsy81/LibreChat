import { render } from '@testing-library/react';
import AudioRecorder from './AudioRecorder';
import { useSpeechToText } from '~/hooks';

const mockStopRecording = jest.fn();
const mockResetAfterSubmit = jest.fn();
let mockSetSpeechText: ((text: string) => void) | undefined;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useGetAudioSettings: () => ({ speechToTextEndpoint: 'browser' }),
  useSpeechToText: jest.fn((setText: (text: string) => void) => {
    mockSetSpeechText = setText;
    return {
      isListening: true,
      isLoading: false,
      startRecording: jest.fn(),
      stopRecording: mockStopRecording,
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

describe('AudioRecorder submission cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetSpeechText = undefined;
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
