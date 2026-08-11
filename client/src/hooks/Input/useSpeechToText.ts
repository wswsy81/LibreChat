import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToText = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
): {
  isLoading?: boolean;
  isListening?: boolean;
  cancelRecording: () => void;
  stopRecording: () => void;
  startRecording: () => boolean | Promise<boolean>;
  /** 消息提交后调用:清空浏览器 STT 引擎的累积 transcript,防止旧语音文本回填。
   *  外部 STT 是单次录音单次转写,没有累积状态,这里是 no-op。 */
  resetAfterSubmit: () => void;
} => {
  const { speechToTextEndpoint } = useGetAudioSettings();
  const externalSpeechToText = speechToTextEndpoint === 'external';

  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    cancelRecording: cancelSpeechRecordingBrowser,
    startRecording: startSpeechRecordingBrowser,
    stopRecording: stopSpeechRecordingBrowser,
    resetAfterSubmit,
  } = useSpeechToTextBrowser(setText, onTranscriptionComplete);

  const {
    isListening: speechIsListeningExternal,
    isLoading: speechIsLoadingExternal,
    externalCancelRecording: cancelSpeechRecordingExternal,
    externalStartRecording: startSpeechRecordingExternal,
    externalStopRecording: stopSpeechRecordingExternal,
  } = useSpeechToTextExternal(setText, onTranscriptionComplete);

  const isListening = externalSpeechToText ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = externalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;

  const startRecording = externalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = externalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const cancelRecording = externalSpeechToText
    ? cancelSpeechRecordingExternal
    : cancelSpeechRecordingBrowser;

  return {
    isLoading,
    isListening,
    cancelRecording,
    stopRecording,
    startRecording,
    resetAfterSubmit,
  };
};

export default useSpeechToText;
