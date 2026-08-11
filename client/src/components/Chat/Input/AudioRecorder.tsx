import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, MicOff } from 'lucide-react';
import { useToastContext, TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize, useSpeechToText, useGetAudioSettings } from '~/hooks';
import { globalAudioId, type TAskFunction } from '~/common';
import { useChatFormContext } from '~/Providers';
import { cn } from '~/utils';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';
const CANCEL_DISTANCE_PX = 56;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export default memo(function AudioRecorder({
  disabled,
  ask,
  methods,
  isSubmitting,
  onVoiceModeChange,
}: {
  disabled: boolean;
  ask: TAskFunction;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
  onVoiceModeChange?: (isVoiceMode: boolean) => void;
}) {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAwaitingTranscription, setIsAwaitingTranscription] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const updateVoiceMode = useCallback(
    (nextVoiceMode: boolean) => {
      setIsVoiceMode(nextVoiceMode);
      onVoiceModeChange?.(nextVoiceMode);
    },
    [onVoiceModeChange],
  );

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  const activePointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const isActiveHoldRef = useRef(false);
  const isCancellingRef = useRef(false);
  const isRecordingReadyRef = useRef(false);
  const pendingFinishRef = useRef<'cancel' | 'transcribe' | null>(null);
  const awaitingTranscriptionRef = useRef(false);
  const sawLoadingRef = useRef(false);
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
      if (isExternalSTT(speechToTextEndpoint) && awaitingTranscriptionRef.current) {
        awaitingTranscriptionRef.current = false;
        setIsAwaitingTranscription(false);
        updateVoiceMode(false);
      }
    },
    [setValue, speechToTextEndpoint, updateVoiceMode],
  );

  const {
    isListening,
    isLoading,
    cancelRecording,
    startRecording,
    stopRecording,
    resetAfterSubmit,
  } = useSpeechToText(setText, onTranscriptionComplete);
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
      /** 只有真的在听时才停:外部 STT 的 stop 在未录音时会弹
       *  "Not currently recording" 警告,曾导致每条消息提交都误报。 */
      if (isListening) {
        stopRecording();
      }
      resetAfterSubmitRef.current();
      existingTextRef.current = '';
    }
    wasSubmittingRef.current = isSubmitting;
  }, [isSubmitting, isListening, stopRecording]);

  useEffect(() => {
    if (!isHolding) {
      return;
    }

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => window.clearInterval(timer);
  }, [isHolding]);

  useEffect(() => {
    if (!isAwaitingTranscription) {
      sawLoadingRef.current = false;
      return;
    }
    if (isLoading) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current) {
      return;
    }

    awaitingTranscriptionRef.current = false;
    setIsAwaitingTranscription(false);
    updateVoiceMode(false);
  }, [isAwaitingTranscription, isLoading, updateVoiceMode]);

  const finalizeRecording = useCallback(
    (action: 'cancel' | 'transcribe') => {
      pendingFinishRef.current = null;
      isRecordingReadyRef.current = false;

      if (action === 'cancel') {
        cancelRecording();
        setValue('text', existingTextRef.current, { shouldValidate: true });
        setIsAwaitingTranscription(false);
        awaitingTranscriptionRef.current = false;
        return;
      }

      if (isExternalSTT(speechToTextEndpoint)) {
        awaitingTranscriptionRef.current = true;
        setIsAwaitingTranscription(true);
        stopRecording();
        return;
      }

      stopRecording();
      updateVoiceMode(false);
    },
    [cancelRecording, setValue, speechToTextEndpoint, stopRecording, updateVoiceMode],
  );

  const finishHold = useCallback(
    (action: 'cancel' | 'transcribe') => {
      if (!isActiveHoldRef.current) {
        return;
      }

      isActiveHoldRef.current = false;
      isCancellingRef.current = false;
      setIsHolding(false);
      setIsCancelling(false);
      activePointerIdRef.current = null;

      if (!isRecordingReadyRef.current) {
        pendingFinishRef.current = action;
        return;
      }

      finalizeRecording(action);
    },
    [finalizeRecording],
  );

  const beginHold = useCallback(async () => {
    if (disabled || isLoading || isAwaitingTranscription || isActiveHoldRef.current) {
      return;
    }

    existingTextRef.current = getValues('text') || '';
    isActiveHoldRef.current = true;
    isCancellingRef.current = false;
    isRecordingReadyRef.current = false;
    pendingFinishRef.current = null;
    setIsCancelling(false);
    setIsHolding(true);

    const didStart = await Promise.resolve(startRecording());
    if (!didStart) {
      isActiveHoldRef.current = false;
      isRecordingReadyRef.current = false;
      pendingFinishRef.current = null;
      setIsHolding(false);
      setIsCancelling(false);
      return;
    }
    isRecordingReadyRef.current = true;

    const pendingFinish = pendingFinishRef.current;
    if (pendingFinish) {
      finalizeRecording(pendingFinish);
    }
  }, [disabled, finalizeRecording, getValues, isAwaitingTranscription, isLoading, startRecording]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button > 0 || disabled || isLoading || isAwaitingTranscription) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activePointerIdRef.current = event.pointerId;
    startYRef.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    void beginHold();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId || !isActiveHoldRef.current) {
      return;
    }

    const shouldCancel = startYRef.current - event.clientY >= CANCEL_DISTANCE_PX;
    if (shouldCancel === isCancellingRef.current) {
      return;
    }

    isCancellingRef.current = shouldCancel;
    setIsCancelling(shouldCancel);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    finishHold(isCancellingRef.current ? 'cancel' : 'transcribe');
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    finishHold('cancel');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void beginHold();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    finishHold('transcribe');
  };

  const closeVoiceMode = () => {
    if (isActiveHoldRef.current) {
      finishHold('cancel');
    }
    updateVoiceMode(false);
  };

  const toggleVoiceMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isVoiceMode) {
      closeVoiceMode();
      return;
    }
    updateVoiceMode(true);
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

  let holdLabel = localize('com_life_voice_hold');
  let holdMeta = localize('com_life_voice_hold_help');
  if (isHolding) {
    holdLabel = localize('com_life_voice_release_transcribe');
    holdMeta = `${localize('com_life_voice_slide_cancel')} · ${formatDuration(elapsedSeconds)}`;
  }
  if (isCancelling) {
    holdLabel = localize('com_life_voice_release_cancel');
    holdMeta = localize('com_life_voice_cancel_help');
  }
  if (isAwaitingTranscription) {
    holdLabel = localize('com_life_voice_transcribing');
    holdMeta = localize('com_life_voice_transcribing_help');
  }

  if (isVoiceMode) {
    return (
      <div
        role="group"
        aria-label={localize('com_life_voice_mode')}
        className="flex min-h-16 w-full flex-1 items-stretch gap-2 p-2 text-life-ink"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label={localize('com_life_voice_keyboard')}
          onClick={closeVoiceMode}
          disabled={isAwaitingTranscription}
          className="flex min-h-12 min-w-12 items-center justify-center rounded-[4px] border border-life-rule text-life-muted transition-colors hover:border-life-ink hover:text-life-ink disabled:cursor-wait disabled:opacity-50"
        >
          <Keyboard className="size-5" />
        </button>
        <button
          type="button"
          aria-label={holdLabel}
          aria-pressed={isHolding}
          disabled={disabled || isAwaitingTranscription}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={cn(
            'flex min-h-12 flex-1 touch-none select-none items-center justify-center gap-3 rounded-[4px] border px-4 font-life-sans transition-colors',
            isAwaitingTranscription &&
              'cursor-wait border-life-rule bg-life-paper-deep text-life-muted',
            isCancelling && 'border-life-cinnabar bg-life-cinnabar text-life-paper',
            isHolding && !isCancelling && 'border-life-moss bg-life-moss text-life-paper',
            !isHolding &&
              !isAwaitingTranscription &&
              'border-life-ink/20 bg-life-paper text-life-ink hover:border-life-moss',
          )}
        >
          {isAwaitingTranscription ? (
            <Spinner className="size-5 stroke-life-muted" />
          ) : (
            <Mic className="size-5" />
          )}
          <span aria-live="polite" className="flex flex-col items-start leading-none">
            <span className="text-life-sm font-medium">{holdLabel}</span>
            <span className="mt-1 font-life-mono text-life-meta opacity-80">{holdMeta}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={toggleVoiceMode}
          disabled={disabled || isLoading}
          className="flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover"
          title={localize('com_ui_use_micrphone')}
          aria-pressed={false}
        >
          {renderIcon()}
        </button>
      }
    />
  );
});
