import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import type { InteractionSnapshot, LocalChatTurnSendPhase } from '../../state/index.js';
import { resolvePresenceStatus } from './local-chat-presence-status.js';
import type { LocalChatPresenceTheme } from './presence-theme.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatCharacterRailProps = {
  selectedTarget: LocalChatTargetItem;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  theme: LocalChatPresenceTheme;
  avatarAnchorRef?: React.RefObject<HTMLButtonElement | null>;
  interactionSnapshot: InteractionSnapshot | null;
  loadingTargetDetail: boolean;
  hasInputText: boolean;
  isSending: boolean;
  sendPhase: LocalChatTurnSendPhase;
  messages: ChatMessage[];
  playingVoiceMessageId: string | null;
  onBackToTargets: () => void;
  onOpenSelectedTargetProfile: () => void;
};

const ICON_ARROW_LEFT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

function relationshipBadgeClass(
  value: InteractionSnapshot['relationshipState'] | 'new',
): string {
  if (value === 'friendly') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (value === 'warm') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (value === 'intimate') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function relationshipStateLabel(
  value: InteractionSnapshot['relationshipState'] | 'new',
  t: (key: string) => string,
): string {
  if (value === 'friendly') return t('ProfileDrawer.relationshipStateFriendly');
  if (value === 'warm') return t('ProfileDrawer.relationshipStateWarm');
  if (value === 'intimate') return t('ProfileDrawer.relationshipStateIntimate');
  return t('ProfileDrawer.relationshipStateNew');
}

export const LocalChatCharacterRail = React.memo(function LocalChatCharacterRail({
  selectedTarget,
  selectedTargetAvatarUrl,
  selectedTargetInitial,
  theme,
  avatarAnchorRef,
  interactionSnapshot,
  loadingTargetDetail,
  hasInputText,
  isSending,
  sendPhase,
  messages,
  playingVoiceMessageId,
  onBackToTargets,
  onOpenSelectedTargetProfile,
}: LocalChatCharacterRailProps) {
  const { t } = useModTranslation('local-chat');
  const presenceState = resolvePresenceStatus({
    loadingTargetDetail,
    hasInputText,
    isSending,
    sendPhase,
    messages,
    playingVoiceMessageId,
    t,
  });
  const supportingCopy = String(selectedTarget.bio || '').trim() || t('Header.noBio');

  return (
    <aside className="relative flex min-h-0 w-[clamp(360px,30vw,600px)] shrink-0 flex-col overflow-hidden border-r border-white/70 bg-[linear-gradient(180deg,rgba(250,252,252,0.98),rgba(244,247,248,0.96))]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-64px] top-[-52px] h-48 w-48 rounded-full bg-mint-100/70 blur-3xl" />
        <div className="absolute bottom-16 right-[-56px] h-56 w-56 rounded-full bg-sky-100/70 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col px-5 py-5">
        <div className="shrink-0">
          <button
            type="button"
            onClick={onBackToTargets}
            className="lc-btn lc-btn-secondary h-10 w-10 rounded-full text-slate-700"
            aria-label={t('Header.backToTargets')}
            title={t('Header.backToTargets')}
          >
            {ICON_ARROW_LEFT}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-4">
          <div className="flex min-h-0 flex-1 items-center justify-center pb-8">
            <button
              type="button"
              ref={avatarAnchorRef}
              onClick={onOpenSelectedTargetProfile}
              className="group relative rounded-full outline-none transition-transform duration-300 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-white/85"
              aria-label={t('Header.openProfileDrawer')}
              title={t('Header.openProfileDrawer')}
            >
              <span
                className="lc-stage-aura absolute inset-[-28px] rounded-full opacity-75 blur-3xl"
                style={{ background: theme.accentSoft }}
              />
              <span
                className="absolute inset-[-12px] rounded-full border border-white/75"
                style={{ boxShadow: `0 22px 56px ${theme.accentSoft}` }}
              />
              <span className="lc-stage-avatar-frame relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border border-white/90 bg-white/82 shadow-[0_24px_60px_rgba(15,23,42,0.12)] xl:h-48 xl:w-48">
                {selectedTargetAvatarUrl ? (
                  <img
                    src={selectedTargetAvatarUrl}
                    alt={selectedTarget.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-6xl font-black xl:text-7xl" style={{ color: theme.text }}>
                    {selectedTargetInitial}
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="shrink-0 space-y-4 pb-4 text-center">
            <div className="space-y-2">
              <p className="text-[34px] font-black leading-none tracking-tight text-slate-950">
                {selectedTarget.displayName}
              </p>
              <p className="text-sm font-medium text-slate-500">
                {selectedTarget.handle}
              </p>
              <p className="line-clamp-3 min-h-[72px] text-sm leading-6 text-slate-500">
                {supportingCopy}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                style={{
                  borderColor: theme.border,
                  background: 'rgba(255,255,255,0.86)',
                  color: theme.text,
                }}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${presenceState.busy ? 'animate-pulse' : ''}`}
                  style={{ background: theme.accentStrong }}
                />
                <span>{presenceState.label}</span>
              </span>

              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${relationshipBadgeClass(interactionSnapshot?.relationshipState || 'new')}`}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
                <span>{relationshipStateLabel(interactionSnapshot?.relationshipState || 'new', t)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
});
