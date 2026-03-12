import React from 'react';
import type { ChatMessage } from '../../types.js';
import type { InteractionSnapshot, LocalChatTurnSendPhase } from '../../state/index.js';
import { resolvePresenceTheme } from './presence-theme.js';
import type { LocalChatTargetItem } from './types.js';
import { StageDialogueCard } from './stage-dialogue-card.js';
import { resolvePresenceStatus } from './local-chat-presence-status.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type StageConversationViewProps = {
    selectedTarget: LocalChatTargetItem;
    selectedTargetAvatarUrl: string | null;
    selectedTargetInitial: string;
    loadingTargetDetail: boolean;
    interactionSnapshot: InteractionSnapshot | null;
    hasInputText: boolean;
    isSending: boolean;
    sendPhase: LocalChatTurnSendPhase;
    messages: ChatMessage[];
    currentUserDisplayName: string;
    currentUserAvatarUrl: string | null;
    playingVoiceMessageId: string | null;
    voiceTranscriptVisibleById: Record<string, boolean>;
    onPlayVoiceMessage: (message: ChatMessage) => void;
    onVoiceContextMenu: (message: ChatMessage, event: React.MouseEvent<HTMLButtonElement>) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    onBackToTargetStage: () => void;
    onOpenSelectedTargetProfile: () => void;
    onOpenSettings: () => void;
    onOpenHistory: () => void;
};
const ICON_ARROW_LEFT = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>);
const ICON_SETTINGS = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.91 3H11a2 2 0 1 1 4 0h.09a1.65 1.65 0 0 0 1.51 1 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>);
const ICON_HISTORY = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v5h5"/>
    <path d="M3.05 13A9 9 0 1 0 6 6.3L3 8"/>
    <path d="M12 7v5l3 3"/>
  </svg>);
const STAGE_SWITCH_DELTA_THRESHOLD = 120;
const STAGE_SWITCH_WINDOW_MS = 400;
export const StageConversationView = React.memo(function StageConversationView({ selectedTarget, selectedTargetAvatarUrl, selectedTargetInitial, loadingTargetDetail, interactionSnapshot, hasInputText, isSending, sendPhase, messages, currentUserDisplayName, currentUserAvatarUrl, playingVoiceMessageId, voiceTranscriptVisibleById, onPlayVoiceMessage, onVoiceContextMenu, messagesEndRef, onBackToTargetStage, onOpenSelectedTargetProfile, onOpenSettings, onOpenHistory, }: StageConversationViewProps) {
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
    const stageCardScrollRef = React.useRef<HTMLDivElement | null>(null);
    const upwardIntentRef = React.useRef({ distance: 0, lastAt: 0 });
    const handleWheelCapture = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const now = performance.now();
        const scrollRoot = stageCardScrollRef.current;
        const cardAtTop = !scrollRoot || scrollRoot.scrollTop <= 4;
        if (event.deltaY >= 0 || !cardAtTop) {
            upwardIntentRef.current = { distance: 0, lastAt: now };
            return;
        }
        const previous = upwardIntentRef.current;
        const nextDistance = now - previous.lastAt > STAGE_SWITCH_WINDOW_MS
            ? Math.abs(event.deltaY)
            : previous.distance + Math.abs(event.deltaY);
        upwardIntentRef.current = { distance: nextDistance, lastAt: now };
        if (nextDistance >= STAGE_SWITCH_DELTA_THRESHOLD) {
            upwardIntentRef.current = { distance: 0, lastAt: now };
            onOpenHistory();
        }
    }, [onOpenHistory]);
    const supportingCopy = String(selectedTarget.bio || '').trim() || t('Header.noBio');
    return (<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-3 pt-4" onWheelCapture={handleWheelCapture}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[72%]" style={{ background: theme.roomAura, opacity: 0.94 }}/>

      <div className="relative z-10 flex items-center justify-between gap-4">
        <button type="button" onClick={onBackToTargetStage} className="lc-btn lc-btn-secondary h-10 w-10 rounded-full text-slate-700" aria-label={t('Header.backToTargets')} title={t('Header.backToTargets')}>
          {ICON_ARROW_LEFT}
        </button>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenHistory} className="lc-btn lc-btn-secondary h-10 w-10 rounded-full text-slate-700" aria-label={t('Header.openHistory')} title={t('Header.openHistory')}>
            {ICON_HISTORY}
          </button>
          <button type="button" onClick={onOpenSettings} className="lc-btn lc-btn-secondary h-10 w-10 rounded-full text-slate-700" aria-label={t('Header.openSettings')} title={t('Header.openSettings')}>
            {ICON_SETTINGS}
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-5 pt-4">
        <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center text-center">
          <button type="button" onClick={onOpenSelectedTargetProfile} className="group relative rounded-full outline-none transition-transform duration-300 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-white/85" aria-label={t('Header.openProfileDrawer')} title={t('Header.openProfileDrawer')}>
            <span className="lc-stage-aura absolute inset-[-22px] rounded-full opacity-70 blur-2xl" style={{ background: theme.accentSoft }}/>
            <span className="absolute inset-[-10px] rounded-full border border-white/70" style={{ boxShadow: `0 18px 48px ${theme.accentSoft}` }}/>
            <span className="lc-stage-avatar-frame relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/85 bg-white/78 shadow-[0_20px_52px_rgba(15,23,42,0.12)]">
              {selectedTargetAvatarUrl ? (<img src={selectedTargetAvatarUrl} alt={selectedTarget.displayName} className="h-full w-full object-cover"/>) : (<span className="text-5xl font-black" style={{ color: theme.text }}>
                  {selectedTargetInitial}
                </span>)}
            </span>
          </button>

          <p className="mt-6 text-[38px] font-black tracking-tight text-slate-950">
            {selectedTarget.displayName}
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
            {supportingCopy}
          </p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-[0_10px_28px_rgba(15,23,42,0.08)]" style={{
            borderColor: theme.border,
            background: 'rgba(255,255,255,0.82)',
            color: theme.text,
        }}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${presenceState.busy ? 'animate-pulse' : ''}`} style={{ background: theme.accentStrong }}/>
            <span>{presenceState.label}</span>
          </div>
        </div>

        <StageDialogueCard agentAvatarUrl={selectedTargetAvatarUrl} agentName={selectedTarget.displayName} theme={theme} currentUserDisplayName={currentUserDisplayName} currentUserAvatarUrl={currentUserAvatarUrl} messages={messages} sendPhase={sendPhase} playingVoiceMessageId={playingVoiceMessageId} voiceTranscriptVisibleById={voiceTranscriptVisibleById} onPlayVoiceMessage={onPlayVoiceMessage} onVoiceContextMenu={onVoiceContextMenu} messagesEndRef={messagesEndRef} scrollRootRef={stageCardScrollRef}/>
      </div>
    </div>);
});
