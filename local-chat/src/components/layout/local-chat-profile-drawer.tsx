import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { DerivedInteractionProfile, InteractionSnapshot, RelationMemorySlot } from '../../state/index.js';
import type { MemorySyncStatus } from '../../services/memory/memory-sync-adapter.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatProfileDrawerProps = {
  open: boolean;
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  interactionProfile: DerivedInteractionProfile | null;
  interactionSnapshot: InteractionSnapshot | null;
  relationMemorySlots: RelationMemorySlot[];
  memorySyncStatus: MemorySyncStatus;
  onClose: () => void;
  onOpenSelectedTargetProfile: () => void;
  onClearChatHistory: () => void;
  onMemoryOverrideChange: (slotId: string, override: RelationMemorySlot['userOverride']) => void;
  onDeleteMemorySlot: (slotId: string) => void;
};

function badgeClass(value: string): string {
  if (value === 'portable' || value === 'safe' || value === 'warm') {
    return 'border-mint-200 bg-mint-50 text-mint-700';
  }
  if (value === 'blocked' || value === 'intimate') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-gray-200 bg-gray-100 text-gray-600';
}

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

function syncStatusLabel(
  value: MemorySyncStatus['state'],
  t: (key: string) => string,
): string {
  if (value === 'ready') return t('ProfileDrawer.syncReady');
  if (value === 'syncing') return t('ProfileDrawer.syncSyncing');
  if (value === 'idle') return t('ProfileDrawer.syncIdle');
  return t('ProfileDrawer.syncUnsupported');
}

function slotTypeLabel(
  value: string,
  t: (key: string) => string,
): string {
  if (value === 'preference') return t('ProfileDrawer.slotTypePreference');
  if (value === 'boundary') return t('ProfileDrawer.slotTypeBoundary');
  if (value === 'rapport') return t('ProfileDrawer.slotTypeRapport');
  if (value === 'promise') return t('ProfileDrawer.slotTypePromise');
  if (value === 'recurringCue') return t('ProfileDrawer.slotTypeRecurringCue');
  if (value === 'taboo') return t('ProfileDrawer.slotTypeTaboo');
  return value;
}

export function LocalChatProfileDrawer(props: LocalChatProfileDrawerProps) {
  const { t } = useModTranslation('local-chat');
  const {
    open,
    selectedTarget,
    selectedTargetAvatarUrl,
    selectedTargetInitial,
    interactionSnapshot,
    relationMemorySlots,
    memorySyncStatus,
    onClose,
    onOpenSelectedTargetProfile,
    onClearChatHistory,
    onDeleteMemorySlot,
  } = props;

  return (
    <div
      className={`absolute inset-y-0 right-0 z-30 w-[380px] max-w-[94vw] border-l border-white/70 bg-[#f8fbfb] shadow-[-12px_0_32px_rgba(15,23,42,0.10)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t('ProfileDrawer.title')}</p>
            <p className="text-[11px] text-gray-500">{t('ProfileDrawer.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
            aria-label={t('ProfileDrawer.close')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section className="rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(237,247,247,0.86))] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-mint-100 via-sky-50 to-brand-100">
                {selectedTargetAvatarUrl ? (
                  <img src={selectedTargetAvatarUrl} alt={selectedTarget?.displayName || 'Agent'} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-mint-700">{selectedTargetInitial}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-gray-900">{selectedTarget?.displayName || t('ProfileDrawer.noTarget')}</p>
                <p className="truncate text-sm text-gray-500">{selectedTarget?.handle || t('ProfileDrawer.waiting')}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{selectedTarget?.bio || t('ProfileDrawer.noBio')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSelectedTargetProfile}
              disabled={!selectedTarget}
              className="mt-4 inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('ProfileDrawer.openProfile')}
            </button>
          </section>

          <section className="rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('ProfileDrawer.relationshipTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('ProfileDrawer.relationshipHint')}</p>
            </div>
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${relationshipBadgeClass(interactionSnapshot?.relationshipState || 'new')}`}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
                <span>{relationshipStateLabel(interactionSnapshot?.relationshipState || 'new', t)}</span>
              </span>
            </div>
          </section>

          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('ProfileDrawer.clearChatHistoryTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('ProfileDrawer.clearChatHistoryHint')}</p>
            </div>
            <button
              type="button"
              onClick={onClearChatHistory}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              {t('ProfileDrawer.clearChatHistoryAction')}
            </button>
          </section>

          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('ProfileDrawer.memoryTitle')}</p>
                <p className="mt-1 text-sm text-gray-600">{t('ProfileDrawer.memoryHint')}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${badgeClass(memorySyncStatus.state === 'unsupported' ? 'blocked' : 'portable')}`}>
                {t('ProfileDrawer.syncStatus')}: {syncStatusLabel(memorySyncStatus.state, t)}
              </span>
            </div>
            {memorySyncStatus.detail ? (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                {memorySyncStatus.detail}
              </p>
            ) : null}
            {relationMemorySlots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                {t('ProfileDrawer.memoryEmpty')}
              </div>
            ) : (
              <div className="space-y-3">
                {relationMemorySlots.map((slot) => (
                  <div key={slot.id} className="rounded-[20px] border border-gray-200 bg-white px-4 py-3">
                    <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">{slotTypeLabel(slot.slotType, t)}</span>
                    <p className="mt-3 text-sm font-semibold text-gray-900">{slot.key}</p>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{slot.value}</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => onDeleteMemorySlot(slot.id)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        {t('ProfileDrawer.deleteMemory')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
