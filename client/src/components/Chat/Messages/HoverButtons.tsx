import React, { useState, useMemo, memo } from 'react';
import { Clipboard, CheckMark, ContinueIcon, RegenerateIcon } from '@librechat/client';
import type { TConversation, TMessage, TFeedback } from 'librechat-data-provider';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * 人生设计室:消息动作栏只留 复制 / 重说一次 / 继续。
 * 砍掉原生 TTS(🔊,浏览器只有英文音色,读中文出英文腔)与 👍👎 反馈(含"准确/创造/清晰/
 * 细节"风格下拉)——聊天软件那套评分噪音,破坏"另一个自己"的镜子感。
 */
type THoverButtons = {
  isEditing: boolean;
  enterEdit: (cancel?: boolean) => void;
  copyToClipboard: (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => void;
  conversation: TConversation | null;
  isSubmitting: boolean;
  message: TMessage;
  regenerate: () => void;
  handleContinue: (e: React.MouseEvent<HTMLButtonElement>) => void;
  latestMessageId?: string;
  isLast: boolean;
  index: number;
  handleFeedback?: ({ feedback }: { feedback: TFeedback | undefined }) => void;
};

type HoverButtonProps = {
  id?: string;
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  isLast?: boolean;
  className?: string;
  buttonStyle?: string;
  dataTestId?: string;
};

const HoverButton = memo(
  ({
    id,
    onClick,
    title,
    icon,
    isActive = false,
    isVisible = true,
    isDisabled = false,
    isLast = false,
    className = '',
    dataTestId,
  }: HoverButtonProps) => {
    const buttonStyle = cn(
      'hover-button rounded-lg p-1.5 text-text-secondary-alt',
      'hover:text-text-primary hover:bg-surface-hover',
      'group-hover:visible group-focus-within:visible group-[.final-completion]:visible',
      !isLast &&
        'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0',
      !isVisible && 'opacity-0',
      'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
      isActive && isVisible && 'active text-text-primary bg-surface-hover',
      className,
    );

    return (
      <button
        id={id}
        data-testid={dataTestId}
        className={buttonStyle}
        onClick={onClick}
        type="button"
        title={title}
        disabled={isDisabled}
      >
        {icon}
      </button>
    );
  },
);

HoverButton.displayName = 'HoverButton';

const HoverButtons = ({
  index,
  isEditing,
  copyToClipboard,
  conversation,
  isSubmitting,
  message,
  regenerate,
  handleContinue,
  latestMessageId,
  isLast,
}: THoverButtons) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);

  const endpoint = useMemo(() => {
    if (!conversation) {
      return '';
    }
    return conversation.endpointType ?? conversation.endpoint;
  }, [conversation]);

  const generationCapabilities = useGenerationsByLatest({
    isEditing,
    isSubmitting,
    error: message.error,
    endpoint: endpoint ?? '',
    messageId: message.messageId,
    searchResult: message.searchResult,
    finish_reason: message.finish_reason,
    isCreatedByUser: message.isCreatedByUser,
    latestMessageId: latestMessageId,
  });

  const { regenerateEnabled, continueSupported } = generationCapabilities;

  if (!conversation) {
    return null;
  }

  const { isCreatedByUser, error } = message;

  if (error === true) {
    return (
      <div className="visible flex justify-center self-end lg:justify-start">
        {regenerateEnabled && (
          <HoverButton
            onClick={regenerate}
            title={localize('com_ui_regenerate')}
            icon={<RegenerateIcon size="19" />}
            isLast={isLast}
            dataTestId={isLast ? 'regenerate-generation-button' : undefined}
          />
        )}
      </div>
    );
  }

  const handleCopy = () => copyToClipboard(setIsCopied);

  return (
    <div className="group visible flex justify-center gap-0.5 self-end focus-within:outline-none lg:justify-start">
      {/* Copy Button */}
      <HoverButton
        onClick={handleCopy}
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
        icon={isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
        isLast={isLast}
        className={cn(
          'ml-0 flex items-center gap-1.5 text-xs',
          isSubmitting && isCreatedByUser
            ? 'group-hover:opacity-100 [@media(hover:hover)]:opacity-0'
            : '',
        )}
        dataTestId={!isCreatedByUser ? 'copy-response-button' : undefined}
      />

      {/* Regenerate Button */}
      {regenerateEnabled && (
        <HoverButton
          onClick={regenerate}
          title={localize('com_ui_regenerate')}
          icon={<RegenerateIcon size="19" />}
          isLast={isLast}
          dataTestId={isLast ? 'regenerate-generation-button' : undefined}
          className="active"
        />
      )}

      {/* Continue Button */}
      {continueSupported && (
        <HoverButton
          onClick={(e) => e && handleContinue(e)}
          title={localize('com_ui_continue')}
          icon={<ContinueIcon className="w-19 h-19 -rotate-180" />}
          isLast={isLast}
          dataTestId={isLast ? 'continue-generation-button' : undefined}
          className="active"
        />
      )}
    </div>
  );
};

export default memo(HoverButtons);
