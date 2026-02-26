import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../types.js';

const C = {
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray700: '#374151',
  gray900: '#111827',
  white: '#ffffff',
} as const;

export function ChatBubble(props: {
  message: ChatMessage;
  agentAvatarUrl: string | null;
  agentName: string;
  userAvatarUrl: string | null;
  userName: string;
  voicePlayingMessageId: string | null;
  onPlayVoiceMessage: (message: ChatMessage) => void;
  isVoiceTranscriptVisible: boolean;
  onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useModTranslation('local-chat');
  const {
    message,
    agentAvatarUrl,
    agentName,
    userAvatarUrl,
    userName,
    voicePlayingMessageId,
    onPlayVoiceMessage,
    isVoiceTranscriptVisible,
    onVoiceContextMenu,
  } = props;
  const isUser = message.role === 'user';
  const isVoice = message.kind === 'voice';
  const isPlaying = isVoice && voicePlayingMessageId === message.id;
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const segmentLabel = typeof message.meta?.segmentIndex === 'number' && typeof message.meta?.segmentCount === 'number'
    ? ` · ${message.meta.segmentIndex}/${message.meta.segmentCount}`
    : '';
  const channelDecisionLabel = message.meta?.channelDecision
    ? ` · ${message.meta.channelDecision === 'voice' ? 'voice' : 'text'}`
    : '';
  const routeSourceLabel = !isUser && message.meta?.routeSource
    ? ` · ${message.meta.routeSource === 'token-api' ? 'Token API' : 'Local Runtime'}`
    : '';
  const routeModelLabel = !isUser && message.meta?.routeModel
    ? ` · ${message.meta.routeModel}`
    : '';
  const agentInitial = (String(agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  const userInitial = (String(userName || 'U').trim().charAt(0) || 'U').toUpperCase();

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isUser ? (
        userAvatarUrl ? (
          <img src={userAvatarUrl} alt={userName || t('ChatBubble.roleUser')} className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: C.gray700 }}
          >
            {userInitial}
          </div>
        )
      ) : (
        agentAvatarUrl ? (
          <img src={agentAvatarUrl} alt={agentName || t('ChatBubble.roleAgent')} className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${C.green500}, ${C.green700})` }}
          >
            {agentInitial}
          </div>
        )
      )}

      <div className="max-w-[70%]">
        <div
          className="rounded-2xl px-4 py-2.5 text-sm"
          style={
            isUser
              ? { backgroundColor: C.green600, color: C.white }
              : { backgroundColor: C.white, color: C.gray900, border: `1px solid ${C.gray200}` }
          }
        >
          {isVoice ? (
            <button
              type="button"
              onClick={() => onPlayVoiceMessage(message)}
              onContextMenu={(event) => onVoiceContextMenu(message, event)}
              className="flex items-center gap-2 text-left"
            >
              <span>{isPlaying ? '⏸' : '▶'}</span>
              <span>{isPlaying ? t('ChatBubble.playingVoice') : t('ChatBubble.voiceMessage')}</span>
            </button>
          ) : (
            message.content
          )}
          {isVoice && isVoiceTranscriptVisible ? (
            <div className="mt-2 border-t border-gray-200 pt-2 text-xs text-gray-700">
              {message.content}
            </div>
          ) : null}
        </div>
        <p className={`mt-1 text-[10px] ${isUser ? 'text-right' : 'text-left'}`} style={{ color: C.gray400 }}>
          {time} · {isUser ? t('ChatBubble.roleUser') : (isVoice ? t('ChatBubble.roleAgentVoice') : t('ChatBubble.roleAgent'))}
          {segmentLabel}
          {channelDecisionLabel}
          {routeSourceLabel}
          {routeModelLabel}
          {message.latencyMs != null ? ` · ${message.latencyMs}ms` : ''}
        </p>
      </div>
    </div>
  );
}

export function TypingBubble({ agentAvatarUrl, agentName }: { agentAvatarUrl: string | null; agentName: string }) {
  const { t } = useModTranslation('local-chat');
  const agentInitial = (String(agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  return (
    <div className="flex gap-2">
      {agentAvatarUrl ? (
        <img src={agentAvatarUrl} alt={agentName || t('ChatBubble.roleAgent')} className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: `linear-gradient(135deg, ${C.green500}, ${C.green700})` }}
        >
          {agentInitial}
        </div>
      )}
      <div className="max-w-[70%]">
        <div
          className="rounded-2xl px-4 py-2.5 text-sm"
          style={{ backgroundColor: C.white, color: C.gray900, border: `1px solid ${C.gray200}` }}
        >
          {t('ChatBubble.generating')}
        </div>
        <p className="mt-1 text-[10px] text-left" style={{ color: C.gray400 }}>
          {t('ChatBubble.agentPending')}
        </p>
      </div>
    </div>
  );
}
