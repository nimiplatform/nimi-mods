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

function parseMarkdownBlocks(text: string): React.ReactNode[] {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] || '';
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i]?.startsWith('```')) {
        codeLines.push(lines[i] || '');
        i += 1;
      }
      if (i < lines.length && lines[i]?.startsWith('```')) {
        i += 1;
      }
      blocks.push(
        <pre key={`block-${key++}`} className="my-1 overflow-x-auto rounded-xl bg-gray-900/95 px-3 py-2 text-[12px] text-gray-100">
          {language ? <p className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">{language}</p> : null}
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] || '').startsWith('>')) {
        quoteLines.push((lines[i] || '').replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`block-${key++}`} className="my-1 border-l-2 border-mint-300/80 pl-3 text-[13px] text-gray-700">
          {quoteLines.join('\n')}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] || '')) {
        items.push((lines[i] || '').replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`block-${key++}`} className="my-1 list-disc space-y-1 pl-4">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] || '')) {
        items.push((lines[i] || '').replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`block-${key++}`} className="my-1 list-decimal space-y-1 pl-4">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && (lines[i] || '').trim() && !lines[i]?.startsWith('```') && !lines[i]?.startsWith('>') && !/^[-*]\s+/.test(lines[i] || '') && !/^\d+\.\s+/.test(lines[i] || '')) {
      paragraphLines.push(lines[i] || '');
      i += 1;
    }
    const paragraph = paragraphLines.join('\n');
    blocks.push(
      <p key={`block-${key++}`} className="whitespace-pre-wrap">
        {parseInlineMarkdown(paragraph)}
      </p>,
    );
  }

  return blocks.length > 0 ? blocks : [text];
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
  const isImagePending = message.kind === 'image-pending';
  const isVideoPending = message.kind === 'video-pending';
  const isStreaming = message.kind === 'streaming';
  const isPlaying = isVoice && voicePlayingMessageId === message.id;
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const bubbleShapeClass = bubbleShapeFor(message.role, position);

  const [imagePreviewOpen, setImagePreviewOpen] = React.useState(false);
  const [imageLoadError, setImageLoadError] = React.useState(false);
  const [videoLoadError, setVideoLoadError] = React.useState(false);

  React.useEffect(() => {
    setImageLoadError(false);
    setVideoLoadError(false);
  }, [message.id, message.media?.uri]);

  React.useEffect(() => {
    if (!imagePreviewOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImagePreviewOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [imagePreviewOpen]);

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
    if (message.meta?.mediaStatus) {
      parts.push(`Media: ${message.meta.mediaStatus}`);
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

  const mediaUri = String(message.media?.uri || '').trim();

  return (
    <>
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
            ) : isImagePending || isVideoPending ? (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-mint-600" />
                <span>{message.content || (isImagePending ? t('ChatBubble.generatingImage') : t('ChatBubble.generatingVideo'))}</span>
              </div>
            ) : isImage ? (
              mediaUri && !imageLoadError ? (
                <button
                  type="button"
                  onClick={() => setImagePreviewOpen(true)}
                  className="group block overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                >
                  <img
                    src={mediaUri}
                    alt={message.content || t('ChatBubble.imagePlaceholder')}
                    className="max-h-[320px] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                    onError={() => setImageLoadError(true)}
                  />
                </button>
              ) : (
                <p className="text-xs italic opacity-70">{message.meta?.mediaError || t('ChatBubble.imagePlaceholder')}</p>
              )
            ) : isVideo ? (
              mediaUri && !videoLoadError ? (
                <video
                  src={mediaUri}
                  controls
                  preload="metadata"
                  className="max-h-[320px] w-full rounded-xl border border-gray-200 bg-black"
                  poster={message.media?.previewUri}
                  onError={() => setVideoLoadError(true)}
                />
              ) : (
                <p className="text-xs italic opacity-70">{message.meta?.mediaError || t('ChatBubble.videoPlaceholder')}</p>
              )
            ) : isStreaming ? (
              <span className={message.content ? '' : 'italic opacity-70'}>
                {message.content || t('ChatBubble.streamingPlaceholder')}
                <span className="ml-0.5 inline-block animate-pulse text-mint-600">|</span>
              </span>
            ) : (
              <div className="space-y-1">{parseMarkdownBlocks(message.content)}</div>
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

      {imagePreviewOpen && mediaUri ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setImagePreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('ChatBubble.imagePreviewDialogLabel')}
        >
          <img
            src={mediaUri}
            alt={message.content || t('ChatBubble.imagePlaceholder')}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

export function TypingBubble({ agentAvatarUrl, agentName }: { agentAvatarUrl: string | null; agentName: string }) {
  const { t } = useModTranslation('local-chat');
  const agentInitial = (String(agentName || 'A').trim().charAt(0) || 'A').toUpperCase();
  return (
    <div
      className="flex gap-2"
      style={{ animation: 'chat-slide-up 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both' }}
      role="status"
      aria-live="polite"
      aria-label={t('ChatBubble.agentPending')}
    >
      {agentAvatarUrl ? (
        <img src={agentAvatarUrl} alt={agentName || t('ChatBubble.roleAgent')} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/5" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-semibold text-white ring-1 ring-black/5">
          {agentInitial}
        </div>
      )}
      <div className="max-w-[70%]">
        <div className="lc-typing-bubble px-4 py-3">
          <div className="lc-typing-row flex items-center gap-2">
            <span className="lc-typing-label text-[13px] font-medium italic tracking-[0.01em]">
              {t('ChatBubble.agentPending')}
            </span>
            <span className="lc-typing-caret" aria-hidden />
          </div>
          <div className="lc-typing-row mt-2 flex items-center gap-2.5">
            <div className="flex items-center gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={`dot-${i}`}
                  className="lc-typing-dot inline-block h-2.5 w-2.5 rounded-full"
                  style={{ animation: `typing-dot-bounce 1.4s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
            <div className="lc-typing-trail" aria-hidden>
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
