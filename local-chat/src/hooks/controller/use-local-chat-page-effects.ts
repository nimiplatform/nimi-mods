import { useEffect, useRef } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { useLocalChatPageState } from './use-local-chat-page-state.js';

type LocalChatPageState = ReturnType<typeof useLocalChatPageState>;

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

function buildTurnContextKey(state: LocalChatPageState): string {
  return [
    state.targetsState.selectedTargetId,
    state.sessionsState.selectedSessionId,
    state.runtimeRouteState.routeBinding?.source || '',
    state.runtimeRouteState.routeBinding?.connectorId || '',
    state.runtimeRouteState.routeBinding?.model || '',
    state.runtimeRouteState.routeSnapshot?.source || '',
    state.runtimeRouteState.routeSnapshot?.model || '',
  ].join('|');
}

export function useLocalChatPageEffects(state: LocalChatPageState) {
  const autoPlayedVoiceIdsRef = useRef<Set<string>>(new Set());
  const lastContextKeyRef = useRef<string>('');
  const lastAutoplayDecisionKeyRef = useRef<string>('');

  useEffect(() => {
    if (!state.voiceContextMenu) return;
    const onWindowClick = () => state.setVoiceContextMenu(null);
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') state.setVoiceContextMenu(null);
    };
    window.addEventListener('click', onWindowClick);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('click', onWindowClick);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [state.voiceContextMenu, state.setVoiceContextMenu]);

  useEffect(() => {
    state.setIsSessionMenuOpen(false);
  }, [state.targetsState.selectedTargetId, state.setIsSessionMenuOpen]);

  useEffect(() => {
    state.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.messagesEndRef]);

  useEffect(() => {
    if (!state.isSessionMenuOpen) return;
    const handleWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideAnchor = Boolean(state.sessionMenuAnchorRef.current?.contains(target));
      const insidePanel = Boolean(state.sessionMenuPanelRef.current?.contains(target));
      if (!insideAnchor && !insidePanel) {
        state.setIsSessionMenuOpen(false);
      }
    };
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        state.setIsSessionMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleWindowMouseDown);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    state.isSessionMenuOpen,
    state.sessionMenuAnchorRef,
    state.sessionMenuPanelRef,
    state.setIsSessionMenuOpen,
  ]);

  useEffect(() => {
    if (!state.targetsState.selectedTarget) return;
    state.setRuntimeField('targetType', 'AGENT');
    state.setRuntimeField('agentId', state.targetsState.selectedTarget.id);
    state.setRuntimeField('worldId', state.targetsState.selectedTarget.worldId || '');
  }, [state.targetsState.selectedTarget, state.setRuntimeField]);

  useEffect(() => {
    autoPlayedVoiceIdsRef.current.clear();
    lastAutoplayDecisionKeyRef.current = '';
  }, [state.sessionsState.selectedSessionId]);

  const turnContextKey = buildTurnContextKey(state);
  useEffect(() => {
    const previous = lastContextKeyRef.current;
    lastContextKeyRef.current = turnContextKey;
    if (!previous || previous === turnContextKey) return;
    state.turnSendState.cancelPendingSchedule('LOCAL_CHAT_SCHEDULE_CANCELLED_BY_CONTEXT_CHANGE');
    state.speechPlaybackState.stopVoicePlayback();
    state.speechTranscribeState.cancelRecording('LOCAL_CHAT_STT_RECORDING_CANCELLED_BY_CONTEXT_CHANGE');
  }, [
    turnContextKey,
    state.turnSendState,
    state.speechPlaybackState,
    state.speechTranscribeState.cancelRecording,
  ]);

  useEffect(() => {
    let candidate: (typeof state.messages)[number] | undefined;
    for (let index = 0; index < state.messages.length; index += 1) {
      const message = state.messages[index];
      if (!message) continue;
      if (message.role !== 'assistant' || message.kind !== 'voice') continue;
      if (!message.meta?.autoPlayVoice) continue;
      if (autoPlayedVoiceIdsRef.current.has(message.id)) continue;
      candidate = message;
      break;
    }
    if (!candidate) return;

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
    if (decision !== 'play') return;

    autoPlayedVoiceIdsRef.current.add(candidate.id);
    void state.speechPlaybackState.playVoiceMessage(candidate);
  }, [
    state.messages,
    state.speechPlaybackState,
    state.speechSettingsState.defaultSettings.enableVoice,
    state.speechSettingsState.defaultSettings.autoPlayVoiceReplies,
    state.targetsState.selectedTargetId,
    state.sessionsState.selectedSessionId,
  ]);
}
