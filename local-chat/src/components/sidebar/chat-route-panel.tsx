import React from 'react';
import { useModTranslation } from '@nimiplatform/mod-sdk/i18n';
import { useAppStore } from '@nimiplatform/mod-sdk/ui';
import { normalizeRuntimeRouteSource, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/mod-sdk/runtime-route';

type Props = {
  open: boolean;
  onToggle: () => void;
  activeChatSource: RuntimeRouteBinding['source'];
  activeChatConnectorId: string;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  chatModelQuery: string;
  setChatModelQuery: (value: string) => void;
  chatModelOptions: string[];
  filteredChatModelOptions: string[];
  onRouteSourceChange: (source: RuntimeRouteBinding['source']) => void;
  onRouteConnectorChange: (connectorId: string) => void;
  onRouteModelChange: (model: string) => void;
  onClearRouteOverride: () => void;
};

export function ChatRoutePanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const setActiveTab = useAppStore((state) => (state as { setActiveTab: (tab: string) => void }).setActiveTab);
  const {
    open,
    onToggle,
    activeChatSource,
    activeChatConnectorId,
    chatRouteOptions,
    chatModelQuery,
    setChatModelQuery,
    chatModelOptions,
    filteredChatModelOptions,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteOverride,
  } = props;
  const showEmptyLocalRuntimeCta = activeChatSource === 'local-runtime' && chatModelOptions.length === 0;

  return (
    <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-gray-700 font-medium"
      >
        <span>{t('ChatRoute.title')}</span>
        <span>{open ? '-' : '+'}</span>
      </button>
      {open ? (
        <>
          <p className="mt-2 text-[11px] text-gray-600">{t('ChatRoute.storedNote')}</p>
          <div className="mt-3 space-y-2">
            <div>
              <p className="mb-1 text-gray-500">{t('ChatRoute.source')}</p>
              <select
                value={activeChatSource}
                onChange={(event) => onRouteSourceChange(normalizeRuntimeRouteSource(event.target.value))}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
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
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
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
                  if (chatModelOptions.includes(nextValue)) {
                    onRouteModelChange(nextValue);
                  }
                }}
                placeholder={t('ChatRoute.modelPlaceholder')}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-green-500 focus:ring-1 focus:ring-green-500"
              />
              <datalist id="local-chat-chat-model-list">
                {filteredChatModelOptions.map((model) => (
                  <option key={`route-model-${model}`} value={model} />
                ))}
              </datalist>
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
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => setActiveTab('runtime')}
                  >
                    {t('ChatRoute.goInstallModels')}
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => onRouteSourceChange('token-api')}
                  >
                    {t('ChatRoute.switchToTokenApi')}
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onClearRouteOverride}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('ChatRoute.useRuntimeDefault')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
