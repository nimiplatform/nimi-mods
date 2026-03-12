import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';
import { buildLocalChatTurnContextSnapshot, shouldCancelForTurnContextChange, } from '../turn-send/context-key.js';
import { logRendererEvent } from "@nimiplatform/sdk/mod";
type LocalChatPageState = ReturnType<typeof useLocalChatPageState>;
type VoiceAutoplayMessageLike = {
    id?: string;
    role?: string;
    kind?: string;
    meta?: {
        autoPlayVoice?: boolean;
    } | null;
};
type ScrollAnchorMessageLike = {
    id?: string;
    kind?: string;
    content?: string;
};
type ScrollStateSnapshot = {
    targetId: string | null;
    sessionId: string | null;
    viewMode: 'stage' | 'chat';
    messageTailKey: string;
    pendingState: 'pending' | 'settled';
};
function findScrollRoot(anchor: HTMLDivElement | null): HTMLElement | null {
    if (!anchor) {
        return null;
    }
    const root = anchor.closest('[data-local-chat-scroll-root="true"]');
    return root instanceof HTMLElement ? root : null;
}
export function resolveVoiceAutoplayDecision(input: {
    enableVoice: boolean;
    autoPlayEnabled: boolean;
    playingVoiceMessageId: string | null;
}): 'skip-voice-disabled' | 'skip-disabled' | 'skip-playing' | 'play' {
    if (!input.enableVoice) {
        return 'skip-voice-disabled';
    }
    if (!input.autoPlayEnabled) {
        return 'skip-disabled';
    }
    if (input.playingVoiceMessageId) {
        return 'skip-playing';
    }
    return 'play';
}
function isAutoPlayableVoiceMessage(message: VoiceAutoplayMessageLike | null | undefined): message is VoiceAutoplayMessageLike & {
    id: string;
} {
    return Boolean(message
        && String(message.id || '').trim()
        && message.role === 'assistant'
        && message.kind === 'voice'
        && message.meta?.autoPlayVoice);
}
export function listAutoPlayVoiceMessageIds(messages: ReadonlyArray<VoiceAutoplayMessageLike>): string[] {
    return messages
        .filter(isAutoPlayableVoiceMessage)
        .map((message) => String(message.id || '').trim())
        .filter(Boolean);
}
export function findPendingAutoPlayVoiceMessage<T extends VoiceAutoplayMessageLike>(input: {
    messages: ReadonlyArray<T>;
    autoPlayedVoiceIds: ReadonlySet<string>;
}): T | null {
    for (let index = 0; index < input.messages.length; index += 1) {
        const message = input.messages[index];
        if (!isAutoPlayableVoiceMessage(message))
            continue;
        if (input.autoPlayedVoiceIds.has(message.id))
            continue;
        return message;
    }
    return null;
}
export function buildMessageTailKey(messages: ReadonlyArray<ScrollAnchorMessageLike>): string {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
        return 'empty';
    }
    return [
        messages.length,
        String(lastMessage.id || '').trim(),
        String(lastMessage.kind || '').trim(),
        String(lastMessage.content || '').trim().length,
    ].join(':');
}
export function resolveAutoScrollBehavior(input: {
    loadingSessions: boolean;
    isNearBottom: boolean;
    previous: ScrollStateSnapshot | null;
    next: ScrollStateSnapshot;
}): 'skip' | 'auto' {
    if (input.loadingSessions) {
        return 'skip';
    }
    if (!input.previous) {
        return 'auto';
    }
    if (input.previous.targetId !== input.next.targetId
        || input.previous.sessionId !== input.next.sessionId) {
        return 'auto';
    }
    if (input.previous.viewMode !== input.next.viewMode) {
        return 'auto';
    }
    if (input.previous.messageTailKey !== input.next.messageTailKey) {
        return input.next.viewMode === 'stage' || input.isNearBottom ? 'auto' : 'skip';
    }
    if (input.previous.pendingState !== input.next.pendingState) {
        return input.next.viewMode === 'stage' || input.isNearBottom ? 'auto' : 'skip';
    }
    return 'skip';
}
function buildTurnContextSnapshot(state: LocalChatPageState) {
    return buildLocalChatTurnContextSnapshot({
        targetId: state.targetsState.selectedTargetId,
        sessionId: state.sessionsState.selectedSessionId,
        routeBinding: state.runtimeRouteState.routeBinding || null,
    });
}
export function useLocalChatPageEffects(state: LocalChatPageState) {
    const autoPlayedVoiceIdsRef = useRef<Set<string>>(new Set());
    const sessionVoiceHistoryPrimedRef = useRef(false);
    const lastTurnContextRef = useRef<ReturnType<typeof buildTurnContextSnapshot> | null>(null);
    const lastAutoplayDecisionKeyRef = useRef<string>('');
    const lastScrollStateRef = useRef<ScrollStateSnapshot | null>(null);
    useEffect(() => {
        if (!state.voiceContextMenu)
            return;
        const onWindowClick = () => state.setVoiceContextMenu(null);
        const onWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                state.setVoiceContextMenu(null);
        };
        window.addEventListener('click', onWindowClick);
        window.addEventListener('keydown', onWindowKeyDown);
        return () => {
            window.removeEventListener('click', onWindowClick);
            window.removeEventListener('keydown', onWindowKeyDown);
        };
    }, [state.voiceContextMenu, state.setVoiceContextMenu]);
    useLayoutEffect(() => {
        if (state.sessionsState.loadingSessions) {
            return undefined;
        }
        const nextScrollState: ScrollStateSnapshot = {
            targetId: state.targetsState.selectedTargetId || null,
            sessionId: state.sessionsState.selectedSessionId || null,
            viewMode: state.conversationViewMode,
            messageTailKey: buildMessageTailKey(state.messages),
            pendingState: state.turnSendState.isSending ? 'pending' : 'settled',
        };
        const behavior = resolveAutoScrollBehavior({
            loadingSessions: false,
            isNearBottom: state.isTranscriptNearBottom,
            previous: lastScrollStateRef.current,
            next: nextScrollState,
        });
        lastScrollStateRef.current = nextScrollState;
        if (behavior === 'skip') {
            return undefined;
        }
        let rafId = 0;
        let settleRafId = 0;
        const scrollToBottom = () => {
            const anchor = state.messagesEndRef.current;
            const scrollRoot = findScrollRoot(anchor);
            if (scrollRoot) {
                scrollRoot.scrollTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
                return;
            }
            anchor?.scrollIntoView({ behavior: 'auto', block: 'end' });
        };
        rafId = window.requestAnimationFrame(() => {
            scrollToBottom();
            settleRafId = window.requestAnimationFrame(() => {
                scrollToBottom();
            });
        });
        return () => {
            window.cancelAnimationFrame(rafId);
            window.cancelAnimationFrame(settleRafId);
        };
    }, [
        state.messages,
        state.messagesEndRef,
        state.sessionsState.loadingSessions,
        state.sessionsState.selectedSessionId,
        state.targetsState.selectedTargetId,
        state.conversationViewMode,
        state.isTranscriptNearBottom,
        state.turnSendState.isSending,
    ]);
    useEffect(() => {
        if (!state.targetsState.selectedTarget)
            return;
        state.setRuntimeField('targetType', 'AGENT');
        state.setRuntimeField('agentId', state.targetsState.selectedTarget.id);
        state.setRuntimeField('worldId', state.targetsState.selectedTarget.worldId || '');
    }, [state.targetsState.selectedTarget, state.setRuntimeField]);
    useEffect(() => {
        autoPlayedVoiceIdsRef.current.clear();
        sessionVoiceHistoryPrimedRef.current = false;
        lastAutoplayDecisionKeyRef.current = '';
    }, [state.sessionsState.selectedSessionId]);
    const turnContext = useMemo(() => buildTurnContextSnapshot(state), [
        state.targetsState.selectedTargetId,
    ]);
    useEffect(() => {
        const previous = lastTurnContextRef.current;
        lastTurnContextRef.current = turnContext;
        if (!shouldCancelForTurnContextChange({
            previous,
            next: turnContext,
            activeSchedule: state.turnSendState.getActiveScheduleContext(),
        })) {
            return;
        }
        state.turnSendState.cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_CONTEXT_CHANGE');
        state.speechPlaybackState.stopVoicePlayback();
        state.speechTranscribeState.cancelRecording('LOCAL_CHAT_STT_RECORDING_CANCELLED_BY_CONTEXT_CHANGE');
    }, [
        turnContext,
        state.turnSendState,
        state.speechPlaybackState,
        state.speechTranscribeState.cancelRecording,
    ]);
    useEffect(() => {
        if (state.sessionsState.loadingSessions) {
            return;
        }
        if (!sessionVoiceHistoryPrimedRef.current) {
            for (const messageId of listAutoPlayVoiceMessageIds(state.messages)) {
                autoPlayedVoiceIdsRef.current.add(messageId);
            }
            sessionVoiceHistoryPrimedRef.current = true;
            return;
        }
        const candidate = findPendingAutoPlayVoiceMessage({
            messages: state.messages,
            autoPlayedVoiceIds: autoPlayedVoiceIdsRef.current,
        });
        if (!candidate)
            return;
        const enableVoice = state.speechSettingsState.defaultSettings.enableVoice;
        const autoPlayEnabled = state.speechSettingsState.defaultSettings.autoPlayVoiceReplies;
        const playingVoiceMessageId = state.speechPlaybackState.playingVoiceMessageId;
        const decision = resolveVoiceAutoplayDecision({
            enableVoice,
            autoPlayEnabled,
            playingVoiceMessageId,
        });
        const decisionKey = `${candidate.id}:${decision}`;
        if (decisionKey !== lastAutoplayDecisionKeyRef.current) {
            lastAutoplayDecisionKeyRef.current = decisionKey;
            logRendererEvent({
                level: 'info',
                area: 'local-chat',
                message: 'local-chat:voice-autoplay:decision',
                details: {
                    messageId: candidate.id,
                    targetId: state.targetsState.selectedTargetId,
                    sessionId: state.sessionsState.selectedSessionId,
                    enableVoice,
                    autoPlayEnabled,
                    decision,
                    playingVoiceMessageId: playingVoiceMessageId || null,
                    channelDecision: candidate.meta?.channelDecision || null,
                },
            });
        }
        if (decision !== 'play')
            return;
        autoPlayedVoiceIdsRef.current.add(candidate.id);
        void state.speechPlaybackState.playVoiceMessage(candidate);
    }, [
        state.messages,
        state.sessionsState.loadingSessions,
        state.speechPlaybackState,
        state.speechSettingsState.defaultSettings.enableVoice,
        state.speechSettingsState.defaultSettings.autoPlayVoiceReplies,
        state.targetsState.selectedTargetId,
        state.sessionsState.selectedSessionId,
    ]);
}
