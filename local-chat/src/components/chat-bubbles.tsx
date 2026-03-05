import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../types.js';
import type { MessageVisualPosition } from './layout/message-grouping.js';

function sanitizeLinkHref(href: string): string | null {
  const raw = String(href || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '');
  if (/^https?:\/\//i.test(normalized)) return raw;
  if (/^mailto:/i.test(normalized)) return raw;
  if (/^tel:/i.test(normalized)) return raw;
  return null;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      nodes.push(<strong key={`md-${key++}`}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={`md-${key++}`}>{match[3]}</em>);
    } else if (match[4]) {
      nodes.push(<code key={`md-${key++}`} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] font-mono">{match[4]}</code>);
    } else if (match[5] && match[6]) {
      const safeHref = sanitizeLinkHref(match[6]);
      if (safeHref) {
        nodes.push(<a key={`md-${key++}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="underline">{match[5]}</a>);
      } else {
        nodes.push(match[5]);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length > 0 ? nodes : [text];
}

function VoiceBubbleContent(props: {
  isPlaying: boolean;
  onPlay: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  playingLabel: string;
  idleLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onPlay}
      onContextMenu={props.onContextMenu}
      className="flex items-center gap-3 text-left"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
        {props.isPlaying ? '⏸' : '▶'}
      </span>
      <div className="flex items-end gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={`bar-${i}`}
            className="w-[3px] rounded-full bg-current"
            style={{
              height: props.isPlaying ? undefined : '4px',
              animation: props.isPlaying ? `voice-bar 1.2s ease-in-out ${i * 0.15}s infinite` : 'none',
              minHeight: '4px',
            }}
          />
        ))}
      </div>
      <span className="text-sm">{props.isPlaying ? props.playingLabel : props.idleLabel}</span>
    </button>
  );
}

function bubbleShapeFor(role: ChatMessage['role'], position: MessageVisualPosition): string {
  if (role === 'user') {
    if (position === 'single') return 'rounded-[22px]';
    if (position === 'start') return 'rounded-[22px] rounded-br-md';
    if (position === 'middle') return 'rounded-[14px] rounded-r-md';
    return 'rounded-[22px] rounded-tr-md';
  }
  if (position === 'single') return 'rounded-[22px]';
  if (position === 'start') return 'rounded-[22px] rounded-bl-md';
  if (position === 'middle') return 'rounded-[14px] rounded-l-md';
  return 'rounded-[22px] rounded-tl-md';
}

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
  showAvatar?: boolean;
  showTimestamp?: boolean;
  position?: MessageVisualPosition;
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
    showAvatar = true,
    showTimestamp = true,
    position = 'single',
  } = props;
  const isUser = message.role === 'user';
  const isVoice = message.kind === 'voice';
  const isImage = message.kind === 'image';
  const isVideo = message.kind === 'video';
  const isStreaming = message.kind === 'streaming';
  const isPlaying = isVoice && voicePlayingMessageId === message.id;
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const bubbleShapeClass = bubbleShapeFor(message.role, position);

  const agentInitial = (String(agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  const userInitial = (String(userName || 'U').trim().charAt(0) || 'U').toUpperCase();

  const debugMeta = (() => {
    const parts: string[] = [];
    if (typeof message.meta?.segmentIndex === 'number' && typeof message.meta?.segmentCount === 'number') {
      parts.push(`Segment ${message.meta.segmentIndex}/${message.meta.segmentCount}`);
    }
    if (message.meta?.channelDecision) {
      parts.push(`Channel: ${message.meta.channelDecision}`);
    }
    if (!isUser && message.meta?.routeSource) {
      parts.push(`Route: ${message.meta.routeSource === 'token-api' ? 'Token API' : 'Local Runtime'}`);
    }
    if (!isUser && message.meta?.routeModel) {
      parts.push(`Model: ${message.meta.routeModel}`);
    }
    if (message.latencyMs != null) {
      parts.push(`Latency: ${message.latencyMs}ms`);
    }
    return parts;
  })();

  const avatarNode = isUser ? (
    userAvatarUrl ? (
      <img src={userAvatarUrl} alt={userName || t('ChatBubble.roleUser')} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/5" />
    ) : (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold text-white ring-1 ring-black/5">
        {userInitial}
      </div>
    )
  ) : (
    agentAvatarUrl ? (
      <img src={agentAvatarUrl} alt={agentName || t('ChatBubble.roleAgent')} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/5" />
    ) : (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-semibold text-white ring-1 ring-black/5">
        {agentInitial}
      </div>
    )
  );

  return (
    <div
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      style={{ animation: 'chat-slide-up 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both' }}
    >
      {showAvatar ? avatarNode : <span className="h-8 w-8 shrink-0" aria-hidden />}

      <div className="max-w-[72%]">
        <div
          className={`${bubbleShapeClass} px-4 py-2.5 text-sm leading-[1.6] ${
            isUser
              ? 'bg-gradient-to-br from-mint-500 to-brand-500 text-white shadow-[0_2px_12px_-2px_rgb(78_204_163/0.45)]'
              : 'border border-gray-200 bg-white text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
          }`}
        >
          {isVoice ? (
            <VoiceBubbleContent
              isPlaying={isPlaying}
              onPlay={() => onPlayVoiceMessage(message)}
              onContextMenu={(event) => onVoiceContextMenu(message, event)}
              playingLabel={t('ChatBubble.playingVoice')}
              idleLabel={t('ChatBubble.voiceMessage')}
            />
          ) : isImage ? (
            <p className="text-xs italic opacity-70">{t('ChatBubble.imagePlaceholder')}</p>
          ) : isVideo ? (
            <p className="text-xs italic opacity-70">{t('ChatBubble.videoPlaceholder')}</p>
          ) : isStreaming ? (
            <span className={message.content ? '' : 'italic opacity-70'}>
              {message.content || t('ChatBubble.streamingPlaceholder')}
              <span className="ml-0.5 inline-block animate-pulse text-mint-600">|</span>
            </span>
          ) : (
            <span>{parseInlineMarkdown(message.content)}</span>
          )}
          {isVoice && isVoiceTranscriptVisible ? (
            <div className="mt-2 border-t border-gray-200/30 pt-2 text-xs opacity-80">
              {message.content}
            </div>
          ) : null}
        </div>
        {showTimestamp ? (
          <p className={`mt-1 text-[10px] text-gray-400 ${isUser ? 'text-right' : 'text-left'}`}>
            {time} · {isUser ? t('ChatBubble.roleUser') : (isVoice ? t('ChatBubble.roleAgentVoice') : t('ChatBubble.roleAgent'))}
          </p>
        ) : null}
        {showTimestamp && debugMeta.length > 0 ? (
          <details className={`mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
            <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-500">debug</summary>
            <div className="mt-1 space-y-0.5 text-[10px] text-gray-400">
              {debugMeta.map((line, i) => (
                <p key={`debug-${i}`}>{line}</p>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function TypingBubble({ agentAvatarUrl, agentName }: { agentAvatarUrl: string | null; agentName: string }) {
  const { t } = useModTranslation('local-chat');
  const agentInitial = (String(agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  return (
    <div className="flex gap-2" style={{ animation: 'chat-slide-up 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both' }}>
      {agentAvatarUrl ? (
        <img src={agentAvatarUrl} alt={agentName || t('ChatBubble.roleAgent')} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/5" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-semibold text-white ring-1 ring-black/5">
          {agentInitial}
        </div>
      )}
      <div className="max-w-[70%]">
        <div className="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-3">
          {[0, 1, 2].map((i) => (
            <span
              key={`dot-${i}`}
              className="inline-block h-2 w-2 rounded-full bg-mint-400"
              style={{ animation: `typing-dot-bounce 1.4s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <p className="mt-1 text-[10px] text-left text-gray-400">
          {t('ChatBubble.agentPending')}
        </p>
      </div>
    </div>
  );
}
