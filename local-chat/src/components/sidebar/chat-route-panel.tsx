import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { normalizeRuntimeRouteSource, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import { resolveCommittedChatModelQuery } from '../../hooks/runtime-route/override-actions.js';

type Props = {
  open: boolean;
  onToggle: () => void;
  activeChatSource: RuntimeRouteBinding['source'];
  activeChatConnectorId: string;
  activeChatModel: string;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  chatModelQuery: string;
  setChatModelQuery: (value: string) => void;
  chatModelOptions: string[];
  filteredChatModelOptions: string[];
  onRouteSourceChange: (source: RuntimeRouteBinding['source']) => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onClearRouteBinding: () => void;
};

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5" />
  </svg>
);

export function ChatRoutePanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const setActiveTab = useAppStore((state) => (state as { setActiveTab: (tab: string) => void }).setActiveTab);
  const {
    open,
    onToggle,
    activeChatSource,
    activeChatConnectorId,
    activeChatModel,
    chatRouteOptions,
    chatModelQuery,
    setChatModelQuery,
    chatModelOptions,
    filteredChatModelOptions,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteBinding,
  } = props;
  const hasPendingModelChange = String(chatModelQuery || '').trim() !== String(activeChatModel || '').trim();
  const showEmptyLocalRuntimeCta = activeChatSource === 'local-runtime' && chatModelOptions.length === 0;
  const commitChatModelQuery = (query: string) => {
    const resolved = resolveCommittedChatModelQuery({
      source: activeChatSource,
      query,
      activeModel: activeChatModel,
      availableModels: chatModelOptions,
    });
    setChatModelQuery(resolved.nextQuery);
    if (resolved.nextModel) {
      onRouteModelChange(resolved.nextModel);
    }
  };

  return (
    <div className="lc-card rounded-2xl p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center justify-between text-left text-[13px] font-semibold text-gray-700"
      >
        <span>{t('ChatRoute.title')}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      {open ? (
        <div className="mt-3">
          <div className="min-h-0 space-y-2 lc-panel-expand">
          <p className="text-[11px] text-gray-600">{t('ChatRoute.storedNote')}</p>
          <div className="space-y-2">
            <div>
              <p className="mb-1 text-gray-500">{t('ChatRoute.source')}</p>
              <select
                value={activeChatSource}
                onChange={(event) => onRouteSourceChange(normalizeRuntimeRouteSource(event.target.value))}
                className="h-8 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs text-gray-900"
              >
                <option value="local-runtime">Local Runtime</option>
                <option value="token-api">Token API</option>
              </select>
            </div>

            <div>
              <p className="mb-1 text-gray-500">{t('ChatRoute.connector')}</p>
              <select
                value={activeChatConnectorId}
                disabled={activeChatSource !== 'token-api'}
                onChange={(event) => onRouteConnectorChange(event.target.value)}
                className="h-8 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">--</option>
                {(chatRouteOptions?.connectors || []).map((connector) => (
                  <option key={`route-connector-${connector.id}`} value={connector.id}>{connector.label || connector.id}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-1 text-gray-500">{t('ChatRoute.model')}</p>
              <input
                list="local-chat-chat-model-list"
                value={chatModelQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setChatModelQuery(nextValue);
                  if (chatModelOptions.includes(nextValue.trim())) {
                    onRouteModelChange(nextValue.trim());
                  }
                }}
                onBlur={(event) => {
                  commitChatModelQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitChatModelQuery(chatModelQuery);
                  }
                }}
                placeholder={t('ChatRoute.modelPlaceholder')}
                className={`h-8 w-full rounded-xl bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:ring-1 ${
                  hasPendingModelChange
                    ? 'border border-amber-300 focus:border-amber-400 focus:ring-amber-200'
                    : 'border border-gray-200 focus:border-mint-500 focus:ring-mint-500'
                }`}
              />
              <datalist id="local-chat-chat-model-list">
                {filteredChatModelOptions.map((model) => (
                  <option key={`route-model-${model}`} value={model} />
                ))}
              </datalist>
              {hasPendingModelChange ? (
                <p className="mt-1 text-[11px] text-amber-700">{t('ChatRoute.pendingModelHint')}</p>
              ) : null}
              {chatModelOptions.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">{t('ChatRoute.noModels')}</p>
              ) : null}
              {chatModelOptions.length > 0 && filteredChatModelOptions.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">{t('ChatRoute.noMatchingModels')}</p>
              ) : null}
            </div>

            {showEmptyLocalRuntimeCta ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="text-[11px] text-amber-800">{t('ChatRoute.emptyLocalRuntimeHint')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium"
                    onClick={() => setActiveTab('runtime')}
                  >
                    {t('ChatRoute.goInstallModels')}
                  </button>
                  <button
                    type="button"
                    className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium"
                    onClick={() => onRouteSourceChange('token-api')}
                  >
                    {t('ChatRoute.switchToTokenApi')}
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onClearRouteBinding}
              className="lc-btn lc-btn-secondary h-9 w-full px-2 text-xs font-semibold"
            >
              {t('ChatRoute.useRuntimeDefault')}
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
