import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { easings } from '@react-spring/web';
import { EModelEndpoint } from 'librechat-data-provider';
import { SplitText } from '@librechat/client';
import {
  getIconEndpoint,
  getEntity,
  getModelSpec,
  createConfigHtmlSanitizer,
  CONFIG_HTML_MEDIA_TAGS,
  CONFIG_HTML_MEDIA_ATTR,
} from '~/utils';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import AgentContact from '~/components/Agents/AgentContact';
import { useLocalize, useAuthContext } from '~/hooks';

const FUTURE_LINE_GREETING_KEYS = [
  'com_life_chat_greeting_1',
  'com_life_chat_greeting_2',
  'com_life_chat_greeting_3',
  'com_life_chat_greeting_4',
  'com_life_chat_greeting_5',
  'com_life_chat_greeting_6',
  'com_life_chat_greeting_7',
  'com_life_chat_greeting_8',
  'com_life_chat_greeting_9',
  'com_life_chat_greeting_10',
  'com_life_chat_greeting_11',
  'com_life_chat_greeting_12',
] as const;

const FUTURE_LINE_GREETING_INDEX_KEY = 'life:chat-greeting-index';

export function nextFutureLineGreetingIndex(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const stored = Number.parseInt(storage.getItem(FUTURE_LINE_GREETING_INDEX_KEY) ?? '', 10);
  const next = Number.isInteger(stored) ? (stored + 1) % FUTURE_LINE_GREETING_KEYS.length : 0;
  storage.setItem(FUTURE_LINE_GREETING_INDEX_KEY, String(next));
  return next;
}

function getTextSizeClass(text: string | undefined | null) {
  // 人生设计室:欢迎语用统一字号梯度,不再飙到 4xl/5xl(见 DESIGN.md 字号梯度)
  if (!text) {
    return 'text-life-title';
  }

  if (text.length < 40) {
    return 'text-life-title sm:text-life-display';
  }

  if (text.length < 70) {
    return 'text-life-title';
  }

  return 'text-life-lead';
}

export default function Landing() {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();

  const [textHasMultipleLines, setTextHasMultipleLines] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [futureLineGreetingIndex] = useState(() =>
    nextFutureLineGreetingIndex(window.sessionStorage),
  );
  const contentRef = useRef<HTMLDivElement>(null);

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const brandedSpecLabel = modelSpec?.showOnLanding ? modelSpec.label : '';
  const brandedSpecDescription = (modelSpec?.showOnLanding && modelSpec.description) || '';
  const isFutureLines = conversation?.spec === 'future-lines' || brandedSpecLabel === '人生设计室';
  const name = entity?.name ?? brandedSpecLabel;
  const description =
    (entity?.description || brandedSpecDescription || conversation?.greeting) ?? '';
  const descriptionIsHTML = description.trim().startsWith('<');

  const sanitizeDescription = useMemo(
    () =>
      createConfigHtmlSanitizer({
        allowedTags: CONFIG_HTML_MEDIA_TAGS,
        allowedAttr: CONFIG_HTML_MEDIA_ATTR,
      }),
    [],
  );
  const selectedAgent =
    isAgent && conversation?.agent_id != null ? agentsMap?.[conversation.agent_id] : undefined;

  const getGreeting = useCallback(() => {
    if (typeof startupConfig?.interface?.customWelcome === 'string') {
      const customWelcome = startupConfig.interface.customWelcome;
      // Replace {{user.name}} with actual user name if available
      if (user?.name && customWelcome.includes('{{user.name}}')) {
        return customWelcome.replace(/{{user.name}}/g, user.name);
      }
      return customWelcome;
    }

    const now = new Date();
    const hours = now.getHours();

    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Early morning (midnight to 4:59 AM)
    if (hours >= 0 && hours < 5) {
      return localize('com_ui_late_night');
    }
    // Morning (6 AM to 11:59 AM)
    else if (hours < 12) {
      if (isWeekend) {
        return localize('com_ui_weekend_morning');
      }
      return localize('com_ui_good_morning');
    }
    // Afternoon (12 PM to 4:59 PM)
    else if (hours < 17) {
      return localize('com_ui_good_afternoon');
    }
    // Evening (5 PM to 8:59 PM)
    else {
      return localize('com_ui_good_evening');
    }
  }, [localize, startupConfig?.interface?.customWelcome, user?.name]);

  const handleLineCountChange = useCallback((count: number) => {
    setTextHasMultipleLines(count > 1);
    setLineCount(count);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [lineCount, description, selectedAgent]);

  const getDynamicMargin = useMemo(() => {
    let margin = 'mb-0';

    if (lineCount > 2 || (description && description.length > 100)) {
      margin = 'mb-10';
    } else if (lineCount > 1 || (description && description.length > 0)) {
      margin = 'mb-6';
    } else if (textHasMultipleLines) {
      margin = 'mb-4';
    }

    if (contentHeight > 200) {
      margin = 'mb-16';
    } else if (contentHeight > 150) {
      margin = 'mb-12';
    }

    return margin;
  }, [lineCount, description, textHasMultipleLines, contentHeight]);

  const futureLineGreeting = localize(FUTURE_LINE_GREETING_KEYS[futureLineGreetingIndex]);
  let greetingText = getGreeting() + (user?.name ? ', ' + user.name : '');
  if (typeof startupConfig?.interface?.customWelcome === 'string') {
    greetingText = getGreeting();
  }
  if (isFutureLines) {
    greetingText = user?.name ? `${user.name}，${futureLineGreeting}` : futureLineGreeting;
  }

  return (
    <div
      className={`flex max-h-full min-h-0 w-full flex-1 transform-gpu flex-col items-center overflow-y-auto pb-16 pt-8 transition-all duration-200 ${getDynamicMargin}`}
      style={{ justifyContent: 'safe center' }}
    >
      <div ref={contentRef} className="flex flex-col items-center gap-0 p-2">
        <div
          className={`flex ${textHasMultipleLines ? 'flex-col' : 'flex-col'} items-center justify-center gap-2`}
        >
          {/* 人生设计室:去机器人头像(见 DESIGN.md 禁机器人头像) */}
          {((isAgent || isAssistant) && name) || name ? (
            <div className="flex flex-col items-center gap-0 p-2">
              <SplitText
                key={`split-text-${name}`}
                text={name}
                className={`${getTextSizeClass(name)} font-life-serif font-black text-life-ink dark:text-text-primary`}
                delay={50}
                textAlign="center"
                animationFrom={{ opacity: 0, transform: 'translate3d(0,50px,0)' }}
                animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
                easing={easings.easeOutCubic}
                threshold={0}
                rootMargin="0px"
                onLineCountChange={handleLineCountChange}
              />
            </div>
          ) : (
            <SplitText
              key={`split-text-${greetingText}${user?.name ? '-user' : ''}`}
              text={greetingText}
              className={`${getTextSizeClass(greetingText)} font-life-serif font-black text-life-ink dark:text-text-primary`}
              delay={50}
              textAlign="center"
              animationFrom={{ opacity: 0, transform: 'translate3d(0,50px,0)' }}
              animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
              easing={easings.easeOutCubic}
              threshold={0}
              rootMargin="0px"
              onLineCountChange={handleLineCountChange}
            />
          )}
        </div>
        {description &&
          (descriptionIsHTML ? (
            <div
              className="animate-fadeIn mt-4 flex max-w-md items-center justify-center gap-2 text-center text-sm font-normal text-text-primary [&_img]:inline-block [&_img]:h-4 [&_img]:w-4"
              dangerouslySetInnerHTML={{ __html: sanitizeDescription(description) }}
            />
          ) : (
            <div className="animate-fadeIn mt-5 max-w-[36em] text-left text-[15px] font-normal leading-8 text-life-muted dark:text-gray-400">
              {/* 旧会话 greeting 里存有 **加粗** markdown:解析成 strong,不再裸奔 */}
              {description.split(/\*\*(.+?)\*\*/g).map((part, index) =>
                index % 2 === 1 ? (
                  <strong
                    key={index}
                    className="font-semibold text-life-ink dark:text-text-primary"
                  >
                    {part}
                  </strong>
                ) : (
                  part
                ),
              )}
            </div>
          ))}
        {selectedAgent && (
          <AgentContact
            agent={selectedAgent}
            className="animate-fadeIn mt-2 max-w-md justify-center text-center text-sm"
          />
        )}
      </div>
    </div>
  );
}
