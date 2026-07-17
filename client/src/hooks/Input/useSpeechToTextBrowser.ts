import { useCallback, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import SpeechRecognitionImport, { useSpeechRecognition } from 'react-speech-recognition';
import useGetAudioSettings from './useGetAudioSettings';
import { useLocalize } from '~/hooks';
import store from '~/store';

type SpeechRecognitionController = Pick<
  typeof SpeechRecognitionImport,
  'startListening' | 'stopListening'
>;
type SpeechRecognitionModule = Partial<SpeechRecognitionController> & {
  default?: Partial<SpeechRecognitionController>;
};

const hasSpeechRecognitionController = (
  controller?: Partial<SpeechRecognitionController>,
): controller is SpeechRecognitionController =>
  typeof controller?.startListening === 'function' &&
  typeof controller.stopListening === 'function';

const speechRecognitionModule = SpeechRecognitionImport as SpeechRecognitionModule;
const SpeechRecognition = hasSpeechRecognitionController(speechRecognitionModule)
  ? speechRecognitionModule
  : speechRecognitionModule.default;

const useSpeechToTextBrowser = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const isBrowserSTTEnabled = speechToTextEndpoint === 'browser';
  const { data: speechConfig } = useGetCustomConfigSpeechQuery({ enabled: true });
  const sttExternal = Boolean(speechConfig?.sttExternal);

  const lastTranscript = useRef<string | null>(null);
  const lastInterim = useRef<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>();
  const [autoSendText] = useRecoilState(store.autoSendText);
  const [languageSTT] = useRecoilState<string>(store.languageSTT);

  const {
    listening,
    finalTranscript,
    resetTranscript,
    interimTranscript,
    isMicrophoneAvailable,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const isListening = listening;

  useEffect(() => {
    if (interimTranscript == null || interimTranscript === '') {
      return;
    }

    if (lastInterim.current === interimTranscript) {
      return;
    }

    setText(interimTranscript);
    lastInterim.current = interimTranscript;
  }, [setText, interimTranscript]);

  useEffect(() => {
    if (finalTranscript == null || finalTranscript === '') {
      return;
    }

    if (lastTranscript.current === finalTranscript) {
      return;
    }

    setText(finalTranscript);
    lastTranscript.current = finalTranscript;
    if (autoSendText > -1 && finalTranscript.length > 0) {
      timeoutRef.current = setTimeout(() => {
        onTranscriptionComplete(finalTranscript);
        resetTranscript();
      }, autoSendText * 1000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setText, onTranscriptionComplete, resetTranscript, finalTranscript, autoSendText]);

  const startRecording = useCallback(() => {
    if (!browserSupportsSpeechRecognition) {
      showToast({
        message: sttExternal
          ? localize('com_ui_speech_not_supported_use_external')
          : localize('com_ui_speech_not_supported'),
        status: 'error',
      });
      return;
    }

    if (!isMicrophoneAvailable) {
      showToast({
        message: localize('com_ui_microphone_unavailable'),
        status: 'error',
      });
      return;
    }

    if (!hasSpeechRecognitionController(SpeechRecognition)) {
      showToast({
        message: sttExternal
          ? localize('com_ui_speech_not_supported_use_external')
          : localize('com_ui_speech_not_supported'),
        status: 'error',
      });
      return;
    }

    if (isListening) {
      return;
    }

    SpeechRecognition.startListening({
      language: languageSTT,
      continuous: true,
    });
  }, [
    browserSupportsSpeechRecognition,
    isListening,
    isMicrophoneAvailable,
    languageSTT,
    localize,
    showToast,
    sttExternal,
  ]);

  const stopRecording = useCallback(() => {
    if (!isListening || !hasSpeechRecognitionController(SpeechRecognition)) {
      return;
    }
    SpeechRecognition.stopListening();
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopRecording();
      return;
    }
    startRecording();
  }, [isListening, startRecording, stopRecording]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.altKey && e.code === 'KeyL' && !isBrowserSTTEnabled) {
        toggleListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBrowserSTTEnabled, toggleListening]);

  /** 提交后必须清空:resetTranscript() 之前只在内部自动发送计时器分支里调用——
   *  用户手动点发送(未开自动发送,或抢在计时器前点)时,react-speech-recognition
   *  的累积 transcript 从不清空,下次识别(尤其 iOS 连续模式重启)会把旧句子
   *  重新回填进已清空的输入框,看起来像"发过的话又跑回来了"(2026-07-17 自测抓到)。 */
  const resetAfterSubmit = useCallback(() => {
    resetTranscript();
    lastTranscript.current = null;
    lastInterim.current = null;
  }, [resetTranscript]);

  return {
    isListening,
    isLoading: false,
    startRecording,
    stopRecording,
    resetAfterSubmit,
  };
};

export default useSpeechToTextBrowser;
