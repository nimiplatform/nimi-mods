import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { ChatMessage } from '../../types.js';
import type { InteractionSnapshot, LocalChatTurnSendPhase } from '../../state/index.js';
import { resolvePresenceTheme } from './presence-theme.js';
import { resolvePresenceStatus } from './local-chat-presence-status.js';
import type { LocalChatTargetItem } from './types.js';

export type CompactConversationHeaderProps = {
  selectedTarget: LocalChatTargetItem;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  loadingTargetDetail: boolean;
  interactionSnapshot: InteractionSnapshot | null;
  hasInputText: boolean;
  isSending: boolean;
  sendPhase: LocalChatTurnSendPhase;
  messages: ChatMessage[];
  playingVoiceMessageId: string | null;
  onBackToTargetStage: () => void;
  onOpenSelectedTargetProfile: () => void;
  onOpenSettings: () => void;
  onReturnToStage: () => void;
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

const ICON_STAGE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 18v2" />
  </svg>
);

export function CompactConversationHeader({
  selectedTarget,
  selectedTargetAvatarUrl,
  selectedTargetInitial,
  loadingTargetDetail,
  interactionSnapshot,
  hasInputText,
  isSending,
  sendPhase,
  messages,
  playingVoiceMessageId,
  onBackToTargetStage,
  onOpenSelectedTargetProfile,
  onOpenSettings,
  onReturnToStage,
}: CompactConversationHeaderProps) {
  const { t } = useModTranslation('local-chat');
  const theme = resolvePresenceTheme({
    seed: selectedTarget.id || selectedTarget.displayName,
    emotionalTemperature: interactionSnapshot?.emotionalTemperature || 'low',
  });
  const presenceState = resolvePresenceStatus({
    loadingTargetDetail,
    hasInputText,
    isSending,
    sendPhase,
    messages,
    playingVoiceMessageId,
    t,
  });

  return (
    <div className="relative overflow-hidden border-b border-white/70 px-6 py-3">
      <div className="absolute inset-0 opacity-95" style={{ background: theme.roomAura }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/70" />

      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBackToTargetStage}
            className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
            aria-label={t('Header.backToTargets')}
            title={t('Header.backToTargets')}
          >
            {ICON_ARROW_LEFT}
          </button>

          <button
            type="button"
            onClick={onOpenSelectedTargetProfile}
            className="flex min-w-0 items-center gap-3 rounded-full bg-white/76 px-2.5 py-1.5 text-left shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition-transform duration-200 hover:translate-y-[-1px]"
            aria-label={t('Header.openProfileDrawer')}
            title={t('Header.openProfileDrawer')}
          >
            {selectedTargetAvatarUrl ? (
              <img
                src={selectedTargetAvatarUrl}
                alt={selectedTarget.displayName}
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-black/5"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black ring-1 ring-black/5" style={{ color: theme.text }}>
                {selectedTargetInitial}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{selectedTarget.displayName}</span>
              <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${presenceState.busy ? 'animate-pulse' : ''}`}
                  style={{ background: theme.accentStrong }}
                />
                <span className="truncate">{presenceState.label}</span>
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReturnToStage}
            className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
            aria-label={t('Header.returnToStage')}
            title={t('Header.returnToStage')}
          >
            {ICON_STAGE}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="lc-btn lc-btn-secondary h-9 w-9 rounded-full text-slate-700"
            aria-label={t('Header.openSettings')}
            title={t('Header.openSettings')}
          >
            {ICON_SETTINGS}
          </button>
        </div>
      </div>
    </div>
  );
}
