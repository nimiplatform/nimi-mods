import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMintYouStore } from '../state/mint-you-store.js';
import { processInterviewTurn, shouldForceEnd, canUserEnd, isDegradedEnd, needsExtension, MIN_VALID_TURNS, } from '../services/interview-engine.js';
import { getMintYouRuntimeClient } from '../runtime-mod.js';
import { createUlid } from '../utils/ulid.js';
import { emitMintYouLog } from '../logging.js';
import { normalizeInterviewLanguage } from '../utils/interview-language.js';
import { InterviewChatPane } from './interview-chat-pane.js';
import { InterviewInput } from './interview-input.js';
import type { InterviewMessage } from '../types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
export function StepInterview() {
    const { t, i18n } = useModTranslation('mint-you');
    const store = useMintYouStore();
    const [typingText, setTypingText] = useState<string | null>(null);
    const localeLanguage = String(i18n.resolvedLanguage || i18n.language || 'en');
    const { interviewMessages, interviewSignals, interviewTurnCount, interviewValidTurnCount, interviewLanguage, interviewStatus, memoryDigest, selectedInterests, currentFocus, routeBinding, currentRequestId, sessionPersistWarning, error, } = store;
    const resolvedInterviewLanguage = interviewLanguage || normalizeInterviewLanguage(localeLanguage);
    const turnCountRef = useRef(interviewTurnCount);
    turnCountRef.current = interviewTurnCount;
    const lastFailedTurnRef = useRef<{
        userText: string;
        userMessageId?: string;
    } | null>(null);
    // Opening: AI sends first message when interview starts
    const hasInitRef = useRef(false);
    useEffect(() => {
        if (interviewLanguage)
            return;
        store.setInterviewLanguage(resolvedInterviewLanguage);
    }, [interviewLanguage, resolvedInterviewLanguage, store]);
    useEffect(() => {
        if (hasInitRef.current)
            return;
        if (interviewMessages.length > 0) {
            hasInitRef.current = true;
            return;
        }
        hasInitRef.current = true;
        emitMintYouLog({
            message: 'action:interview:started',
            source: 'StepInterview',
            details: { interests: selectedInterests },
        });
        // Send an empty opening turn to get the AI's first message
        void handleSendMessage('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const handleSendMessage = useCallback(async (userText: string, options?: {
        skipAppendUserMessage?: boolean;
        reuseUserMessageId?: string;
    }) => {
        const requestId = createUlid();
        store.setCurrentRequestId(requestId);
        store.setInterviewStatus('ai-thinking');
        store.setError(null);
        // Add user message to store (skip empty opening message)
        let userMsg: InterviewMessage | null = null;
        if (userText && !options?.skipAppendUserMessage) {
            userMsg = {
                id: createUlid(),
                role: 'user',
                content: userText,
                timestamp: Date.now(),
            };
            store.addInterviewMessage(userMsg);
        }
        const effectiveUserMessageId = options?.reuseUserMessageId ?? userMsg?.id;
        try {
            const runtimeClient = getMintYouRuntimeClient();
            const state = useMintYouStore.getState();
            const result = await processInterviewTurn({
                runtimeClient,
                userMessage: userText,
                userMessageId: effectiveUserMessageId,
                messages: state.interviewMessages,
                signals: state.interviewSignals,
                memoryDigest: state.memoryDigest,
                turnCount: state.interviewTurnCount,
                validTurnCount: state.interviewValidTurnCount,
                interests: state.selectedInterests,
                currentFocus: state.currentFocus,
                language: state.interviewLanguage || resolvedInterviewLanguage,
                binding: state.routeBinding || undefined,
            });
            // Concurrency guard: discard if a newer request superseded this one
            if (useMintYouStore.getState().currentRequestId !== requestId)
                return;
            if (!result.ok) {
                store.setInterviewStatus('error');
                store.setError({
                    reasonCode: result.error.reasonCode,
                    message: result.error.message,
                    actionHint: result.error.actionHint,
                });
                if (userText) {
                    lastFailedTurnRef.current = {
                        userText,
                        userMessageId: effectiveUserMessageId,
                    };
                }
                return;
            }
            lastFailedTurnRef.current = null;
            const { assistantReply, newSignals, memoryDigest: newDigest, turnControl, isValidTurn } = result.data;
            // Update signals and counters
            if (newSignals.length > 0) {
                store.addInterviewSignals(newSignals);
            }
            store.setMemoryDigest(newDigest);
            // Increment turn count (only for non-opening turns where user actually sent a message)
            if (userText) {
                const newTurnCount = state.interviewTurnCount + 1;
                const newValidCount = state.interviewValidTurnCount + (isValidTurn ? 1 : 0);
                store.setInterviewTurnCount(newTurnCount);
                store.setInterviewValidTurnCount(newValidCount);
                // Check force-end conditions AFTER updating counts
                if (shouldForceEnd(newTurnCount, newValidCount)) {
                    // Complete the interview
                    store.setInterviewStatus('typing');
                    setTypingText(assistantReply);
                    return;
                }
            }
            // Show typing animation for AI reply
            store.setInterviewStatus('typing');
            setTypingText(assistantReply);
        }
        catch (err) {
            if (useMintYouStore.getState().currentRequestId !== requestId)
                return;
            store.setInterviewStatus('error');
            store.setError({
                reasonCode: 'MINTYOU_INTERVIEW_TURN_FAILED',
                message: err instanceof Error ? err.message : t('Messages.unknownError'),
                actionHint: t('Messages.interviewRetryHint'),
            });
            if (userText) {
                lastFailedTurnRef.current = {
                    userText,
                    userMessageId: effectiveUserMessageId,
                };
            }
        }
    }, [store, resolvedInterviewLanguage, t, currentFocus]);
    const handleTypingDone = useCallback(() => {
        const state = useMintYouStore.getState();
        // Add the AI message to the chat
        if (typingText) {
            store.addInterviewMessage({
                id: createUlid(),
                role: 'ai',
                content: typingText,
                timestamp: Date.now(),
            });
            setTypingText(null);
        }
        // Check if interview should complete after typing finishes
        if (shouldForceEnd(state.interviewTurnCount, state.interviewValidTurnCount)) {
            store.setInterviewStatus('complete');
            return;
        }
        store.setInterviewStatus('idle');
    }, [store, typingText]);
    const handleEndInterview = useCallback(() => {
        store.setInterviewStatus('complete');
    }, [store]);
    const handleRetry = useCallback(() => {
        store.setError(null);
        const failed = lastFailedTurnRef.current;
        if (failed?.userText) {
            void handleSendMessage(failed.userText, {
                skipAppendUserMessage: true,
                reuseUserMessageId: failed.userMessageId,
            });
            return;
        }
        store.setInterviewStatus('idle');
    }, [store, handleSendMessage]);
    const handleContinue = useCallback(() => {
        store.goNext();
    }, [store]);
    const isThinking = interviewStatus === 'ai-thinking';
    const isTyping = interviewStatus === 'typing';
    const isComplete = interviewStatus === 'complete';
    const isError = interviewStatus === 'error';
    const canEnd = canUserEnd(interviewValidTurnCount);
    const extended = needsExtension(interviewTurnCount, interviewValidTurnCount);
    const degraded = isDegradedEnd(interviewTurnCount, interviewValidTurnCount);
    const progressPercent = Math.min(100, Math.round((interviewValidTurnCount / MIN_VALID_TURNS) * 100));
    return (<div className="ui-sync-card mx-auto my-4 flex h-full max-w-lg flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('Interview.title')}</h2>
          <p className="text-xs text-gray-500">{t('Interview.subtitle')}</p>
        </div>
        <span className="ui-sync-pill rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {progressPercent}%
        </span>
      </div>

      {/* Session persist warning */}
      {sessionPersistWarning && (<div className="bg-amber-50 px-4 py-1.5 text-xs text-amber-700">
          {sessionPersistWarning}
        </div>)}

      {/* Extension notice */}
      {extended && !isComplete && (<div className="bg-blue-50 px-4 py-1.5 text-xs text-blue-700">
          {t('Interview.needMore')}
        </div>)}

      {/* Chat pane */}
      <InterviewChatPane messages={interviewMessages} status={interviewStatus} typingText={typingText} onTypingDone={handleTypingDone}/>

      {/* Error */}
      {isError && error && (<div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-600">{error.message}</p>
          <button onClick={handleRetry} className="ui-sync-btn mt-1.5 rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
            {t('Interview.retry')}
          </button>
        </div>)}

      {/* Input area or completion */}
      {isComplete ? (<div className="border-t border-gray-200 px-4 py-4">
          {degraded && (<p className="mb-2 text-xs text-amber-600">{t('Interview.degradedNotice')}</p>)}
          <button onClick={handleContinue} className="ui-sync-btn ui-sync-btn-primary w-full rounded-lg bg-[#4ECCA3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3DBB92]">
            {t('Interview.continue')}
          </button>
        </div>) : (<>
          <InterviewInput disabled={isThinking || isTyping || isError} onSend={handleSendMessage}/>
          {/* End interview button */}
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
            <button onClick={() => store.goBack()} className="text-xs text-gray-500 hover:text-gray-700">
              {t('Common.back')}
            </button>
            <button onClick={handleEndInterview} disabled={!canEnd || isThinking || isTyping} className="ui-sync-btn ui-sync-btn-selected rounded-lg border border-[#4ECCA3] px-4 py-1.5 text-xs font-medium text-[#4ECCA3] hover:bg-[#4ECCA3]/10 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent">
              {t('Interview.endAndGenerate')}
            </button>
          </div>
        </>)}
    </div>);
}
