import React from 'react';
import type { LocalChatTurnSendPhase } from '../../state/index.js';
import type { ChatMessage } from '../../types.js';
import { ChatBubble } from '../chat-bubbles.js';
import { LOCAL_CHAT_CONVERSATION_WIDTH_CLASS } from './chat-layout-width.js';
import { buildMessageVisualGroups } from './message-grouping.js';
import { ConversationTypingBubble } from './conversation-typing-bubble.js';
import type { LocalChatTargetItem } from './types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type ChatTranscriptViewProps = {
    selectedTarget: LocalChatTargetItem | null;
    selectedTargetAvatarUrl: string | null;
    loadingTargetDetail: boolean;
    messages: ChatMessage[];
    loadingSessions: boolean;
    sendPhase: LocalChatTurnSendPhase;
    currentUserDisplayName: string;
    currentUserAvatarUrl: string | null;
    playingVoiceMessageId: string | null;
    voiceTranscriptVisibleById: Record<string, boolean>;
    onPlayVoiceMessage: (message: ChatMessage) => void;
    onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    hasConversationHistory: boolean;
    onSeedFirstTurnComposer: () => void;
    onTranscriptNearBottomChange: (value: boolean) => void;
    widthClassName?: string;
};
function formatDateLabel(date: Date, t: (key: string, values?: Record<string, unknown>) => string): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = today.getTime() - messageDay.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays === 0)
        return t('MessagePane.today');
    if (diffDays === 1)
        return t('MessagePane.yesterday');
    return date.toLocaleDateString();
}
function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
type MessageListProps = {
    messages: ChatMessage[];
    selectedTargetAvatarUrl: string | null;
    selectedTargetName: string;
    currentUserDisplayName: string;
    currentUserAvatarUrl: string | null;
    playingVoiceMessageId: string | null;
    voiceTranscriptVisibleById: Record<string, boolean>;
    onPlayVoiceMessage: (message: ChatMessage) => void;
    onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
    sendPhase: LocalChatTurnSendPhase;
    t: (key: string, values?: Record<string, unknown>) => string;
};
const TranscriptMessageList = React.memo(function TranscriptMessageList({ messages, selectedTargetAvatarUrl, selectedTargetName, currentUserDisplayName, currentUserAvatarUrl, playingVoiceMessageId, voiceTranscriptVisibleById, onPlayVoiceMessage, onVoiceContextMenu, sendPhase, t, }: MessageListProps) {
    const visualGroups = React.useMemo(() => buildMessageVisualGroups(messages), [messages]);
    const showPendingCard = sendPhase === 'awaiting-first-beat';
    const focusGroupIndex = !showPendingCard && visualGroups.length > 0 && visualGroups[visualGroups.length - 1]?.role === 'assistant'
        ? visualGroups[visualGroups.length - 1]!.groupIndex
        : -1;
    const messageElements: React.ReactNode[] = [];
    let lastDate: Date | null = null;
    for (const group of visualGroups) {
        const groupNodes: React.ReactNode[] = [];
        for (const item of group.items) {
            const inFocusedAssistantGroup = group.groupIndex === focusGroupIndex;
            if (!lastDate || !isSameDay(lastDate, item.message.timestamp)) {
                groupNodes.push(<div key={`date-${item.message.id}`} className="flex items-center gap-3 py-4">
            <div className="h-px flex-1 bg-slate-200/70"/>
            <span className="lc-pill-divider shrink-0 px-3 py-1 text-[11px] font-semibold">
              {formatDateLabel(item.message.timestamp, t)}
            </span>
            <div className="h-px flex-1 bg-slate-200/70"/>
          </div>);
                lastDate = item.message.timestamp;
            }
            groupNodes.push(<ChatBubble key={item.message.id} message={item.message} agentAvatarUrl={selectedTargetAvatarUrl} agentName={selectedTargetName} userAvatarUrl={currentUserAvatarUrl} userName={currentUserDisplayName} voicePlayingMessageId={playingVoiceMessageId} isVoiceTranscriptVisible={Boolean(voiceTranscriptVisibleById[item.message.id])} onPlayVoiceMessage={onPlayVoiceMessage} onVoiceContextMenu={onVoiceContextMenu} showAvatar={inFocusedAssistantGroup ? true : item.showAvatar} showTimestamp={inFocusedAssistantGroup ? true : item.showTimestamp} position={inFocusedAssistantGroup ? 'single' : item.position}/>);
        }
        const isFocusedGroup = group.groupIndex === focusGroupIndex;
        const hasPendingVisual = group.items.some((item) => item.message.kind === 'image-pending' || item.message.kind === 'video-pending');
        const isVoicePlaying = group.items.some((item) => item.message.id === playingVoiceMessageId);
        const focusSummary = hasPendingVisual
            ? t('Header.presencePainting')
            : isVoicePlaying
                ? t('Header.presenceSpeaking')
                : '';
        messageElements.push(isFocusedGroup ? (<section key={`group-${group.groupIndex}`} className="lc-message-group lc-current-turn-shell">
          <div className="lc-current-turn-halo" aria-hidden/>
          <div className="lc-current-turn-card rounded-[28px] border border-white/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(238,247,247,0.9))] px-4 py-4">
            {focusSummary ? (<div className="mb-3 flex justify-end">
                <span className="lc-current-turn-chip text-[11px] font-medium text-mint-700">{focusSummary}</span>
              </div>) : null}
            <div className="space-y-2.5">
              {groupNodes}
            </div>
          </div>
        </section>) : (<section key={`group-${group.groupIndex}`} className="lc-message-group lc-message-group-history space-y-2.5">
          {groupNodes}
        </section>));
    }
    return (<>
      {messageElements}
      {showPendingCard ? (<section className="lc-message-group lc-current-turn-shell">
          <div className="lc-current-turn-halo lc-current-turn-halo-pending" aria-hidden/>
          <div className="lc-current-turn-card lc-current-turn-card-pending min-h-[112px] rounded-[26px] border border-dashed border-mint-200/80 bg-white/88 px-4 py-4">
            <ConversationTypingBubble agentAvatarUrl={selectedTargetAvatarUrl} agentName={selectedTargetName} agentRoleLabel={t('ChatBubble.agentPending')} thinkingLabel={t('Header.presenceThinking')}/>
          </div>
        </section>) : null}
    </>);
});
function isNearBottom(element: HTMLElement): boolean {
    return element.scrollTop + element.clientHeight >= element.scrollHeight - 80;
}
export const ChatTranscriptView = React.memo(function ChatTranscriptView({ selectedTarget, selectedTargetAvatarUrl, loadingTargetDetail, messages, loadingSessions, sendPhase, currentUserDisplayName, currentUserAvatarUrl, playingVoiceMessageId, voiceTranscriptVisibleById, onPlayVoiceMessage, onVoiceContextMenu, messagesEndRef, hasConversationHistory, onSeedFirstTurnComposer, onTranscriptNearBottomChange, widthClassName = LOCAL_CHAT_CONVERSATION_WIDTH_CLASS, }: ChatTranscriptViewProps) {
    const { t } = useModTranslation('local-chat');
    const scrollRootRef = React.useRef<HTMLDivElement | null>(null);
    const handleScroll = React.useCallback(() => {
        const root = scrollRootRef.current;
        if (!root) {
            onTranscriptNearBottomChange(true);
            return;
        }
        onTranscriptNearBottomChange(isNearBottom(root));
    }, [onTranscriptNearBottomChange]);
    React.useLayoutEffect(() => {
        handleScroll();
    }, [handleScroll, messages.length, loadingSessions]);
    const selectedTargetName = selectedTarget?.displayName || 'Agent';
    const showLoadingState = loadingSessions && Boolean(selectedTarget);
    const showFreshEmptyState = !showLoadingState && messages.length === 0;
    const shouldShowWelcomeCard = showFreshEmptyState && Boolean(selectedTarget) && !loadingTargetDetail;
    const shouldShowHistoryIntro = hasConversationHistory && messages.length > 0;
    const welcomeTarget = shouldShowWelcomeCard ? selectedTarget : null;
    return (<div ref={scrollRootRef} data-local-chat-scroll-root="true" className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-5" onScroll={handleScroll} style={{
            background: 'linear-gradient(180deg, rgba(250,252,252,0.88) 0%, rgba(243,247,248,0.92) 100%)',
            overflowAnchor: 'none',
        }}>
      {showLoadingState ? (<div className={`mx-auto flex h-full ${widthClassName} items-center justify-center`}>
          <div className="w-full rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(237,247,247,0.86))] px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="lc-skeleton-pill h-4 w-28"/>
            <div className="mt-4 lc-skeleton-card h-24 w-full"/>
            <div className="mt-4 lc-skeleton-card h-24 w-full"/>
          </div>
        </div>) : (<div className={`mx-auto ${widthClassName} space-y-5`}>
          {welcomeTarget ? (<section className="lc-card rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(239,247,247,0.88))] px-6 py-7 text-center shadow-[0_20px_52px_rgba(15,23,42,0.08)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mint-700/70">
                {t('MessagePane.welcomeEyebrow')}
              </p>
              <h2 className="mt-3 text-[30px] font-black tracking-tight text-slate-950">
                {t('MessagePane.welcomeTitle', { name: welcomeTarget.displayName })}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                {t('MessagePane.welcomeDescription', {
                    name: welcomeTarget.displayName,
                })}
              </p>
              <button type="button" onClick={onSeedFirstTurnComposer} className="lc-btn lc-btn-primary mt-5 h-11 rounded-full px-5 text-sm font-semibold">
                {t('MessagePane.onboardingStart')}
              </button>
            </section>) : null}

          {shouldShowHistoryIntro ? (<div className="rounded-full border border-white/80 bg-white/72 px-4 py-2 text-center text-[11px] font-medium text-slate-500 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              {t('MessagePane.historyIntro')}
            </div>) : null}

          <section className="space-y-4">
            <TranscriptMessageList messages={messages} selectedTargetAvatarUrl={selectedTargetAvatarUrl} selectedTargetName={selectedTargetName} currentUserDisplayName={currentUserDisplayName} currentUserAvatarUrl={currentUserAvatarUrl} playingVoiceMessageId={playingVoiceMessageId} voiceTranscriptVisibleById={voiceTranscriptVisibleById} onPlayVoiceMessage={onPlayVoiceMessage} onVoiceContextMenu={onVoiceContextMenu} sendPhase={sendPhase} t={t}/>
            <div ref={messagesEndRef}/>
          </section>
        </div>)}
    </div>);
});
