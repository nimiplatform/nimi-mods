import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';

type ModelSelectorProps = {
  routeBinding: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  onSourceChange: (source: RuntimeRouteSource) => void;
  onConnectorChange: (connectorId: string) => void;
  onModelChange: (model: string) => void;
  onClearBinding: () => void;
};

export function ModelSelector({
  routeBinding,
  chatRouteOptions,
  onSourceChange,
  onConnectorChange,
  onModelChange,
  onClearBinding,
}: ModelSelectorProps) {
  const { t } = useTranslation('kismet');
  const [modelQuery, setModelQuery] = useState('');

  const activeSource = routeBinding?.source || chatRouteOptions?.selected.source || 'local-runtime';
  const activeConnectorId = routeBinding?.connectorId || chatRouteOptions?.selected.connectorId || '';
  const activeModel = routeBinding?.model || chatRouteOptions?.selected.model || '';

  const modelOptions = useMemo(() => {
    if (!chatRouteOptions) return [];
    if (activeSource === 'local-runtime') {
      return chatRouteOptions.localRuntime.models.map((m) => m.model);
    }
    const connector = chatRouteOptions.connectors.find((c) => c.id === activeConnectorId);
    return connector?.models || [];
  }, [chatRouteOptions, activeSource, activeConnectorId]);

  const filteredModels = useMemo(() => {
    if (!modelQuery) return modelOptions;
    const q = modelQuery.toLowerCase();
    return modelOptions.filter((m) => m.toLowerCase().includes(q));
  }, [modelOptions, modelQuery]);

  const hasLocalModels = (chatRouteOptions?.localRuntime.models.length ?? 0) > 0;
  const hasConnectors = (chatRouteOptions?.connectors.length ?? 0) > 0;

  if (!chatRouteOptions) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400">
        {t('ModelSelector.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700">{t('ModelSelector.title')}</label>
        {routeBinding && (
          <button
            onClick={onClearBinding}
            className="text-[10px] text-indigo-500 hover:text-indigo-700"
          >
            {t('ModelSelector.reset')}
          </button>
        )}
      </div>

      {/* Source */}
      <select
        value={activeSource}
        onChange={(e) => onSourceChange(e.target.value as RuntimeRouteSource)}
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
      >
        {hasLocalModels && <option value="local-runtime">{t('ModelSelector.localRuntime')}</option>}
        {hasConnectors && <option value="token-api">{t('ModelSelector.tokenApi')}</option>}
      </select>

      {/* Connector (token-api only) */}
      {activeSource === 'token-api' && chatRouteOptions.connectors.length > 0 && (
        <select
          value={activeConnectorId}
          onChange={(e) => onConnectorChange(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
        >
          {chatRouteOptions.connectors.map((c) => (
            <option key={c.id} value={c.id}>{c.label || c.id}</option>
          ))}
        </select>
      )}

      {/* Model */}
      <div>
        <input
          list="kismet-model-list"
          value={modelQuery || activeModel}
          onChange={(e) => {
            const val = e.target.value;
            setModelQuery(val);
            if (modelOptions.includes(val)) {
              onModelChange(val);
              setModelQuery('');
            }
          }}
          onBlur={() => setModelQuery('')}
          placeholder={activeModel || t('ModelSelector.selectModel')}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
        />
        <datalist id="kismet-model-list">
          {filteredModels.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
