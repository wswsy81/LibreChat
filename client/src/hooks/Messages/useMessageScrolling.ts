import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import useScrollToRef from '~/hooks/useScrollToRef';
import { reconcileMessageContentLayout } from './messageLayout';
import store from '~/store';

const threshold = 0.85;
const debounceRate = 150;
const resizeFollowThreshold = 120;

export default function useMessageScrolling(messagesTree?: TMessage[] | null) {
  const autoScroll = useRecoilValue(store.autoScroll);
  const { data: startupConfig } = useGetStartupConfig();
  const shouldScrollOnOpen = startupConfig?.lifeUnifiedShell === true || autoScroll;

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const followInitialLayoutRef = useRef(false);
  const initialScrollConversationRef = useRef<string | null>(null);
  const suppressNextResizeFollowRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { conversation, conversationId } = useMessagesConversation();
  const { setAbortScroll, isSubmitting, abortScroll } = useMessagesSubmission();

  const timeoutIdRef = useRef<NodeJS.Timeout>();

  const getIsNearBottom = useCallback(() => {
    const scrollEl = scrollableRef.current;
    if (!scrollEl) {
      return true;
    }
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    return distance <= resizeFollowThreshold;
  }, []);

  const debouncedSetShowScrollButton = useCallback((value: boolean) => {
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      setShowScrollButton(value);
    }, debounceRate);
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isNearBottomRef.current = entry.isIntersecting;
        debouncedSetShowScrollButton(!entry.isIntersecting);
      },
      { root: scrollableRef.current, threshold },
    );

    observer.observe(messagesEndRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutIdRef.current);
    };
  }, [messagesEndRef, scrollableRef, debouncedSetShowScrollButton]);

  const debouncedHandleScroll = useCallback(() => {
    isNearBottomRef.current = getIsNearBottom();
    if (!isNearBottomRef.current) {
      followInitialLayoutRef.current = false;
    }
    if (messagesEndRef.current && scrollableRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          isNearBottomRef.current = entry.isIntersecting;
          debouncedSetShowScrollButton(!entry.isIntersecting);
        },
        { root: scrollableRef.current, threshold },
      );
      observer.observe(messagesEndRef.current);
      return () => observer.disconnect();
    }
  }, [debouncedSetShowScrollButton, getIsNearBottom]);

  const scrollCallback = () => {
    reconcileMessageContentLayout(scrollableRef.current);
    isNearBottomRef.current = true;
    debouncedSetShowScrollButton(false);
  };

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: scrollCallback,
    smoothCallback: () => {
      scrollCallback();
      setAbortScroll(false);
    },
  });

  const clampScrollToContent = useCallback(() => {
    const scrollEl = scrollableRef.current;
    if (!scrollEl) {
      return false;
    }

    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    if (scrollEl.scrollTop <= maxScrollTop) {
      return false;
    }

    scrollEl.scrollTop = maxScrollTop;
    isNearBottomRef.current = getIsNearBottom();
    return true;
  }, [getIsNearBottom]);

  const reconcileContentResize = useCallback(
    (shouldFollowResize = true) => {
      if (clampScrollToContent()) {
        return;
      }

      if (suppressNextResizeFollowRef.current) {
        suppressNextResizeFollowRef.current = false;
        isNearBottomRef.current = getIsNearBottom();
        return;
      }

      const shouldFollowStreaming = isSubmitting && abortScroll !== true;
      if (
        shouldFollowResize &&
        (shouldFollowStreaming || followInitialLayoutRef.current) &&
        isNearBottomRef.current
      ) {
        scrollToBottom?.();
      }
    },
    [abortScroll, clampScrollToContent, getIsNearBottom, isSubmitting, scrollToBottom],
  );

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => reconcileContentResize());
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [reconcileContentResize]);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) {
      return;
    }

    const suppressNextResizeFollow = () => {
      suppressNextResizeFollowRef.current = true;
      followInitialLayoutRef.current = false;
    };

    // 只有真滚动意图(滚轮/拖动/键盘)才取消跟随;轻点卡片按钮不算离开底部。
    contentEl.addEventListener('wheel', suppressNextResizeFollow, true);
    contentEl.addEventListener('touchmove', suppressNextResizeFollow, true);
    contentEl.addEventListener('keydown', suppressNextResizeFollow, true);
    return () => {
      contentEl.removeEventListener('wheel', suppressNextResizeFollow, true);
      contentEl.removeEventListener('touchmove', suppressNextResizeFollow, true);
      contentEl.removeEventListener('keydown', suppressNextResizeFollow, true);
    };
  }, []);

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (isSubmitting && scrollToBottom && abortScroll !== true) {
      scrollToBottom();
    }

    return () => {
      if (abortScroll === true) {
        scrollToBottom && scrollToBottom.cancel();
      }
    };
  }, [isSubmitting, messagesTree, scrollToBottom, abortScroll]);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (
      !messagesTree ||
      messagesTree.length === 0 ||
      !conversationId ||
      conversationId === Constants.NEW_CONVO ||
      !shouldScrollOnOpen ||
      initialScrollConversationRef.current === conversationId
    ) {
      return;
    }

    initialScrollConversationRef.current = conversationId;
    followInitialLayoutRef.current = true;
    scrollToBottom?.();
  }, [conversationId, messagesTree, scrollToBottom, shouldScrollOnOpen]);

  return {
    conversation,
    contentRef,
    scrollableRef,
    messagesEndRef,
    scrollToBottom,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  };
}
