import { memo, useCallback, useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { useToastContext, TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize, useSpeechToText, useGetAudioSettings } from '~/hooks';
import { globalAudioId, type TAskFunction } from '~/common';
import { useChatFormContext } from '~/Providers';
import { cn } from '~/utils';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';
export default memo(function AudioRecorder({
  disabled,
  ask,
  methods,
  isSubmitting,
}: {
  disabled: boolean;
  ask: TAskFunction;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
}) {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  /** useSpeechToText 的 resetAfterSubmit 依赖 onTranscriptionComplete 本身(循环依赖),
   *  用"最新 ref"打破环:提交时永远调用当次渲染赋的最新实现,不进依赖数组。 */
  const resetAfterSubmitRef = useRef<() => void>(() => {});

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isSubmittingRef.current) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      if (text) {
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        /** For external STT, append existing text to the transcription */
        const finalText =
          isExternalSTT(speechToTextEndpoint) && existingTextRef.current
            ? `${existingTextRef.current} ${text}`
            : text;
        const submitted = ask({ text: finalText });
        if (submitted === false) {
          return;
        }
        reset({ text: '' });
        existingTextRef.current = '';
        resetAfterSubmitRef.current();
      }
    },
    [ask, reset, showToast, localize, speechToTextEndpoint],
  );

  const setText = useCallback(
    (text: string) => {
      // iOS may deliver its final recognition event in the same render batch
      // that flips submission on. The hook cleanup effect runs afterwards, so
      // reject the write at the form boundary as well.
      if (isSubmittingRef.current) {
        return;
      }
      let newText = text;
      if (isExternalSTT(speechToTextEndpoint)) {
        /** For external STT, the text comes as a complete transcription, so append to existing */
        newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      } else {
        /** For browser STT, the transcript is cumulative, so we only need to prepend the existing text once */
        newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      }
      setValue('text', newText, {
        shouldValidate: true,
      });
    },
    [setValue, speechToTextEndpoint],
  );

  const { isListening, isLoading, startRecording, stopRecording, resetAfterSubmit } =
    useSpeechToText(setText, onTranscriptionComplete);
  resetAfterSubmitRef.current = resetAfterSubmit;

  /** autoSendText 默认关闭(-1),这时 onTranscriptionComplete 永远不会被
   *  useSpeechToTextBrowser 调用——用户只会是"语音填完文字,自己点常规发送键"。
   *  常规发送键走 ChatForm 自己的提交路径,和这个组件毫无关联,所以上面那处
   *  resetAfterSubmit 接线对默认配置用户根本触发不到。改盯 isSubmitting 从
   *  false→true 的跳变:不管消息是靠哪条路径发出去的,只要一提交就把还在监听的
   *  识别引擎停掉、清空累积文本——防止识别引擎的尾随结果把已清空的输入框重新填回刚发过的话。 */
  const wasSubmittingRef = useRef(isSubmitting);
  useEffect(() => {
    if (isSubmitting && !wasSubmittingRef.current) {
      stopRecording();
      resetAfterSubmitRef.current();
      existingTextRef.current = '';
    }
    wasSubmittingRef.current = isSubmitting;
  }, [isSubmitting, stopRecording]);

  const handleStartRecording = async () => {
    existingTextRef.current = getValues('text') || '';
    startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
    /** For browser STT, clear the reference since text was already being updated */
    if (!isExternalSTT(speechToTextEndpoint)) {
      existingTextRef.current = '';
    }
  };

  const renderIcon = () => {
    if (isListening === true) {
      return <MicOff className="stroke-red-500" />;
    }
    if (isLoading === true) {
      return <Spinner className="stroke-text-secondary" />;
    }
    return <ListeningIcon className="stroke-text-secondary" />;
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={isListening === true ? handleStopRecording : handleStartRecording}
          disabled={disabled}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          )}
          title={localize('com_ui_use_micrphone')}
          aria-pressed={isListening}
        >
          {renderIcon()}
        </button>
      }
    />
  );
});
