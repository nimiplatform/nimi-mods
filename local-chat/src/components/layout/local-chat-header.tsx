import type { RefObject, ReactNode } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import type { InteractionSnapshot, LocalChatSession } from '../../state/index.js';
import { SessionMenu } from '../session-menu.js';
import { resolvePresenceTheme } from './presence-theme.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatHeaderProps = {
  selectedTarget: LocalChatTargetItem;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  loadingTargetDetail: boolean;
  interactionSnapshot: InteractionSnapshot | null;
  hasInputText: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  playingVoiceMessageId: string | null;
  onBackToTargetStage: () => void;
  onOpenSelectedTargetProfile: () => void;
  onOpenSettings: () => void;
  selectedTargetId: string;
  sessions: LocalChatSession[];
  selectedSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isSessionMenuOpen: boolean;
  setIsSessionMenuOpen: (updater: boolean | ((previous: boolean) => boolean)) => void;
  sessionMenuAnchorRef: RefObject<HTMLDivElement | null>;
  sessionMenuPanelRef: RefObject<HTMLDivElement | null>;
  chevronIcon: ReactNode;
};

const ICON_ARROW_LEFT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ICON_SETTINGS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function resolvePresenceStatus(input: {
  loadingTargetDetail: boolean;
  hasInputText: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  playingVoiceMessageId: string | null;
  t: (key: string) => string;
}): { label: string; busy: boolean } {
  if (input.loadingTargetDetail) {
    return { label: input.t('Header.presenceArriving'), busy: false };
  }
  if (input.playingVoiceMessageId) {
    return { label: input.t('Header.presenceSpeaking'), busy: true };
  }
  const lastAssistantMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === 'assistant') || null;
  if (lastAssistantMessage?.kind === 'image-pending') {
    return { label: input.t('Header.presencePainting'), busy: true };
  }
  if (lastAssistantMessage?.kind === 'video-pending') {
    return { label: input.t('Header.presenceFilming'), busy: true };
  }
  if (input.isSending) {
    return { label: input.t('Header.presenceThinking'), busy: true };
  }
  if (input.hasInputText) {
    return { label: input.t('Header.presenceListening'), busy: false };
  }
  return { label: input.t('Header.presenceIdle'), busy: false };
}

export function LocalChatHeader({
  selectedTarget,
  selectedTargetAvatarUrl,
  selectedTargetInitial,
  loadingTargetDetail,
  interactionSnapshot,
  hasInputText,
  isSending,
  messages,
  playingVoiceMessageId,
  onBackToTargetStage,
  onOpenSelectedTargetProfile,
  onOpenSettings,
  selectedTargetId,
  sessions,
  selectedSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  isSessionMenuOpen,
  setIsSessionMenuOpen,
  sessionMenuAnchorRef,
  sessionMenuPanelRef,
  chevronIcon,
}: LocalChatHeaderProps) {
  const { t } = useModTranslation('local-chat');
  const theme = resolvePresenceTheme({
    seed: selectedTarget.id || selectedTarget.displayName,
    emotionalTemperature: interactionSnapshot?.emotionalTemperature || 'low',
  });
  const presenceState = resolvePresenceStatus({
    loadingTargetDetail,
    hasInputText,
    isSending,
    messages,
    playingVoiceMessageId,
    t,
  });
  const supportingCopy = String(selectedTarget.bio || '').trim() || selectedTarget.handle || t('Header.noBio');

  return (
    <div className="relative overflow-hidden border-b border-white/70 px-6 pb-8 pt-5">
      <div className="absolute inset-0 opacity-95" style={{ background: theme.roomAura }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/70" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onBackToTargetStage}
          className="lc-btn lc-btn-secondary h-10 rounded-full px-4 text-sm font-semibold text-slate-700"
          aria-label={t('Header.backToTargets')}
          title={t('Header.backToTargets')}
        >
          {ICON_ARROW_LEFT}
          <span>{t('Header.backToTargets')}</span>
        </button>

        <div className="flex items-center gap-2">
          <SessionMenu
            selectedTargetId={selectedTargetId}
            isOpen={isSessionMenuOpen}
            setIsOpen={setIsSessionMenuOpen}
            sessions={sessions}
            selectedSessionId={selectedSessionId || ''}
            anchorRef={sessionMenuAnchorRef}
            panelRef={sessionMenuPanelRef}
            onCreateSession={onCreateSession}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            chevronIcon={chevronIcon}
          />
          <button
            type="button"
            onClick={onOpenSettings}
            title={t('Header.openSettings')}
            aria-label={t('Header.openSettings')}
            className="lc-btn lc-btn-secondary h-10 w-10 rounded-full text-slate-700"
          >
            {ICON_SETTINGS}
          </button>
        </div>
      </div>

      <div className="relative z-10 mt-8 flex flex-col items-center text-center">
        <button
          type="button"
          onClick={onOpenSelectedTargetProfile}
          className="group relative rounded-full outline-none transition-transform duration-300 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-white/80"
          aria-label={t('Header.openProfileDrawer')}
          title={t('Header.openProfileDrawer')}
        >
          <span
            className="absolute inset-[-10px] rounded-full opacity-60"
            style={{ background: theme.accentSoft }}
          />
          <span
            className="absolute inset-[-6px] rounded-full border border-white/80"
            style={{ boxShadow: `0 18px 42px ${theme.accentSoft}` }}
          />
          <span className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
            {selectedTargetAvatarUrl ? (
              <img
                src={selectedTargetAvatarUrl}
                alt={selectedTarget.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-black" style={{ color: theme.text }}>
                {selectedTargetInitial}
              </span>
            )}
          </span>
        </button>

        <p className="mt-5 text-[32px] font-black tracking-tight text-slate-950">
          {selectedTarget.displayName}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {supportingCopy}
        </p>

        <div
          className="mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
          style={{
            borderColor: theme.border,
            background: 'rgba(255,255,255,0.78)',
            color: theme.text,
          }}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${presenceState.busy ? 'animate-pulse' : ''}`}
            style={{ background: theme.accentStrong }}
          />
          <span>{presenceState.label}</span>
        </div>
      </div>
    </div>
  );
}
