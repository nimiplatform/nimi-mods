import React, { useEffect, useMemo, useRef } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { getTargetInitial } from '../../services/index.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatTargetPaneProps = {
  visibleTargets: LocalChatTargetItem[];
  loadingTargets: boolean;
  selectedTargetId: string;
  setSelectedTargetId: (value: string) => void;
  targetSearchText: string;
  setTargetSearchText: (value: string) => void;
  onRefresh: () => void;
  searchIcon: React.ReactNode;
};

function formatRelativeTime(isoString: string | null | undefined, t: (key: string, vars?: Record<string, unknown>) => string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return '';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('TargetPane.justNow');
  if (diffMin < 60) return t('TargetPane.minutesAgo', { count: diffMin });
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date >= yesterday && date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return t('TargetPane.yesterday');
  }
  if (diffMin < 1440) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString();
}

export function resolveOnlineBadgeState(isOnline: LocalChatTargetItem['isOnline']): 'online' | 'offline' | null {
  if (typeof isOnline !== 'boolean') return null;
  return isOnline ? 'online' : 'offline';
}

export function resolveUnreadBadge(unreadCount: LocalChatTargetItem['unreadCount']): string | null {
  if (typeof unreadCount !== 'number' || unreadCount <= 0) return null;
  return unreadCount > 99 ? '99+' : String(unreadCount);
}

export function LocalChatTargetPane({
  visibleTargets,
  loadingTargets,
  selectedTargetId,
  setSelectedTargetId,
  targetSearchText,
  setTargetSearchText,
  onRefresh,
  searchIcon,
}: LocalChatTargetPaneProps) {
  const { t } = useModTranslation('local-chat');
  const targetButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasFollowedActiveTargetRef = useRef(false);
  const visibleTargetOrderKey = useMemo(
    () => visibleTargets.map((target) => target.id).join('|'),
    [visibleTargets],
  );

  useEffect(() => {
    const activeTargetId = String(selectedTargetId || '').trim();
    if (!activeTargetId) {
      return;
    }
    const activeButton = targetButtonRefs.current[activeTargetId];
    if (!activeButton) {
      return;
    }
    activeButton.scrollIntoView({
      behavior: hasFollowedActiveTargetRef.current ? 'smooth' : 'auto',
      block: 'nearest',
      inline: 'nearest',
    });
    hasFollowedActiveTargetRef.current = true;
  }, [selectedTargetId, visibleTargetOrderKey]);

  return (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col border-r border-[var(--lc-border)] bg-[#f3f8f8]" style={{ width: 332 }}>
      <div className="border-b border-[var(--lc-border)] px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[28px] font-black tracking-tight text-gray-900">{t('TargetPane.title')}</p>
            <p className="text-[12px] text-gray-500">{t('TargetPane.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="lc-btn lc-btn-secondary mt-1 h-9 shrink-0 px-3 text-xs font-semibold"
          >
            {t('TargetPane.refresh')}
          </button>
        </div>

        <div className="mt-4 flex h-11 items-center rounded-2xl border border-gray-200 bg-white px-3 shadow-sm transition-all duration-200 focus-within:border-mint-300 focus-within:bg-white focus-within:shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
          <span className="text-gray-400">{searchIcon}</span>
          <input
            className="ml-2 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            placeholder={t('TargetPane.searchPlaceholder')}
            value={targetSearchText}
            onChange={(event) => setTargetSearchText(event.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2 pb-3">
          {visibleTargets.length === 0 ? (
            <div className="lc-card rounded-2xl border-dashed p-4 text-xs text-gray-500">
              {loadingTargets ? t('TargetPane.loading') : t('TargetPane.noResults')}
            </div>
          ) : (
            visibleTargets.map((target) => {
              const active = selectedTargetId === target.id;
              const previewText = target.latestLocalMessage
                || target.handle
                || t('TargetPane.noLocalMessage');
              const timeLabel = formatRelativeTime(target.latestLocalMessageAt, t);
              const onlineState = resolveOnlineBadgeState(target.isOnline);
              const unreadBadge = resolveUnreadBadge(target.unreadCount);
              return (
                <button
                  key={target.id}
                  ref={(node) => {
                    targetButtonRefs.current[target.id] = node;
                  }}
                  type="button"
                  onClick={() => setSelectedTargetId(target.id)}
                  className={`group lc-card lc-target-card relative w-full scroll-mt-3 rounded-2xl p-3 text-left ${
                    active
                      ? 'lc-target-card-active border-mint-300 bg-gradient-to-br from-mint-50 to-white'
                      : 'hover:-translate-y-[1px] hover:border-mint-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.1)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative mt-0.5 shrink-0">
                      {target.avatarUrl ? (
                        <img
                          src={target.avatarUrl}
                          alt={target.displayName}
                          className="h-12 w-12 rounded-full object-cover ring-1 ring-black/5"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-mint-100 to-brand-100 text-sm font-semibold text-mint-700 ring-1 ring-black/5">
                          {getTargetInitial(target)}
                        </div>
                      )}
                      {onlineState ? (
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${onlineState === 'online' ? 'bg-mint-500' : 'bg-gray-300'}`} />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex h-5 items-center justify-between gap-2">
                        <p className="truncate text-[15px] font-semibold text-gray-900">{target.displayName}</p>
                        {timeLabel ? (
                          <span className={`shrink-0 text-[10px] font-medium ${active ? 'text-mint-700' : 'text-gray-400'}`}>
                            {timeLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className={`mt-1 truncate text-[12px] ${active ? 'text-gray-700' : 'text-gray-600'}`}>
                        {previewText}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-gray-400">{target.handle}</p>
                    </div>
                  </div>

                  {unreadBadge ? (
                    <span className="absolute right-3 top-3 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-mint-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                      {unreadBadge}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
