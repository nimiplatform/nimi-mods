import type React from 'react';
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
  return (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col border-r border-gray-200 bg-white" style={{ width: 320 }}>
      <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
        <div>
          <p className="text-xl font-semibold text-gray-900">{t('TargetPane.title')}</p>
          <p className="text-[11px] text-gray-500">{t('TargetPane.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
        >
          {t('TargetPane.refresh')}
        </button>
      </div>
      <div className="border-b border-gray-100 px-3 py-3">
        <div className="flex h-[38px] items-center rounded-[10px] border border-gray-200 bg-gray-50 px-3">
          {searchIcon}
          <input
            className="ml-2 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            placeholder={t('TargetPane.searchPlaceholder')}
            value={targetSearchText}
            onChange={(event) => setTargetSearchText(event.target.value)}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleTargets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
              {loadingTargets ? t('TargetPane.loading') : t('TargetPane.noResults')}
            </div>
          ) : (
            <div>
              {visibleTargets.map((target) => {
                const active = selectedTargetId === target.id;
                const previewText = target.latestLocalMessage
                  || target.handle
                  || t('TargetPane.noLocalMessage');
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setSelectedTargetId(target.id)}
                    className={`flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors ${active ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="relative shrink-0">
                      {target.avatarUrl ? (
                        <img
                          src={target.avatarUrl}
                          alt={target.displayName}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                          {getTargetInitial(target)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{target.displayName}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{previewText}</p>
                      {target.latestLocalMessage ? (
                        <p className="mt-1 truncate text-[11px] text-gray-400">{target.handle}</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
