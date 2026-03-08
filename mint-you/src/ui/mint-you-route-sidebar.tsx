import React, { useEffect, useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { filterModelOptions } from '@nimiplatform/sdk/mod/model-options';
import {
  normalizeRuntimeRouteSource,
  type RuntimeRouteBinding,
} from '@nimiplatform/sdk/mod/runtime-route';
import { useMintYouStore } from '../state/mint-you-store.js';
import { useMintYouRouteOptions } from '../hooks/use-mint-you-route-options.js';

function dedupeModelIds(models: string[]): string[] {
  return Array.from(new Set(
    models
      .map((model) => String(model || '').trim())
      .filter(Boolean),
  ));
}

function toDefaultBinding(routeBinding: RuntimeRouteBinding | null, routeOptions: ReturnType<typeof useMintYouRouteOptions>['routeOptions']): RuntimeRouteBinding {
  if (routeBinding) {
    return routeBinding;
  }
  if (routeOptions?.selected) {
    return routeOptions.selected;
  }
  return {
    source: 'local',
    connectorId: '',
    model: '',
  };
}

export function MintYouRouteSidebar() {
  const { t } = useModTranslation('mint-you');
  const routeBinding = useMintYouStore((state) => state.routeBinding);
  const setRouteBinding = useMintYouStore((state) => state.setRouteBinding);

  const {
    routeOptions,
    loading,
    error,
    reloadRouteOptions,
  } = useMintYouRouteOptions();

  const effectiveBinding = toDefaultBinding(routeBinding, routeOptions);
  const activeSource = effectiveBinding.source;

  const connectors = routeOptions?.connectors || [];
  const activeConnectorId = activeSource === 'cloud'
    ? (effectiveBinding.connectorId || connectors[0]?.id || '')
    : '';
  const activeConnector = connectors.find((item) => item.id === activeConnectorId)
    || connectors[0]
    || null;

  const modelOptionsRaw = activeSource === 'local'
    ? (routeOptions?.local?.models.map((item) => item.model) || [])
    : (activeConnector?.models || []);
  const modelOptions = useMemo(() => dedupeModelIds(modelOptionsRaw), [modelOptionsRaw]);

  const [modelQuery, setModelQuery] = useState(effectiveBinding.model || '');
  const filteredModelOptions = useMemo(
    () => filterModelOptions(modelOptions, modelQuery),
    [modelOptions, modelQuery],
  );

  useEffect(() => {
    setModelQuery(effectiveBinding.model || '');
  }, [effectiveBinding.model]);

  const applyModel = (model: string) => {
    const normalized = String(model || '').trim();
    if (!normalized) {
      return;
    }
    const matchedLocalModel = routeOptions?.local?.models.find((item) => item.model === normalized) || null;
    const nextBinding: RuntimeRouteBinding = activeSource === 'cloud'
      ? {
        source: 'cloud',
        connectorId: activeConnectorId,
        model: normalized,
      }
      : {
        source: 'local',
        connectorId: '',
        model: normalized,
        localModelId: matchedLocalModel?.localModelId,
        engine: matchedLocalModel?.engine,
      };
    setRouteBinding(nextBinding);
  };

  const handleSourceChange = (sourceRaw: string) => {
    const source = normalizeRuntimeRouteSource(sourceRaw);
    if (source === 'cloud') {
      const fallbackConnector = connectors[0] || null;
      setRouteBinding({
        source: 'cloud',
        connectorId: fallbackConnector?.id || '',
        model: fallbackConnector?.models[0] || '',
      });
      return;
    }

    const fallbackLocalModel = routeOptions?.local?.models[0] || null;
    setRouteBinding({
      source: 'local',
      connectorId: '',
      model: fallbackLocalModel?.model || '',
      localModelId: fallbackLocalModel?.localModelId,
      engine: fallbackLocalModel?.engine,
    });
  };

  const handleConnectorChange = (connectorId: string) => {
    const connector = connectors.find((item) => item.id === connectorId) || null;
    if (!connector) {
      setRouteBinding({
        source: 'cloud',
        connectorId,
        model: '',
      });
      return;
    }

    const model = connector.models.includes(effectiveBinding.model)
      ? effectiveBinding.model
      : (connector.models[0] || '');

    setRouteBinding({
      source: 'cloud',
      connectorId,
      model,
    });
  };

  return (
    <aside className="ui-sync-pane ui-sync-pane-right h-full w-80 shrink-0 overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{t('RouteSidebar.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('RouteSidebar.subtitle')}</p>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <p className="text-[11px] text-gray-500">{t('RouteSidebar.storedNote')}</p>

          {error ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              <p>{t('RouteSidebar.loadFailed')}</p>
              <p className="mt-1 break-all">{error}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-xs text-gray-500">{t('RouteSidebar.source')}</p>
            <select
              value={activeSource}
              onChange={(event) => handleSourceChange(event.target.value)}
              disabled={!routeOptions}
              className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="local">Local Runtime</option>
              <option value="cloud">Token API</option>
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs text-gray-500">{t('RouteSidebar.connector')}</p>
            <select
              value={activeConnectorId}
              disabled={!routeOptions || activeSource !== 'cloud'}
              onChange={(event) => handleConnectorChange(event.target.value)}
              className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">--</option>
              {connectors.map((connector) => (
                <option key={`mint-you-route-connector-${connector.id}`} value={connector.id}>
                  {connector.label || connector.id}
                </option>
              ))}
            </select>
            {activeSource === 'cloud' && connectors.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">{t('RouteSidebar.noConnectors')}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1 text-xs text-gray-500">{t('RouteSidebar.model')}</p>
            <input
              list="mint-you-route-model-list"
              value={modelQuery}
              onChange={(event) => {
                const nextValue = event.target.value;
                setModelQuery(nextValue);
                if (modelOptions.includes(nextValue)) {
                  applyModel(nextValue);
                }
              }}
              onBlur={() => {
                applyModel(modelQuery);
              }}
              placeholder={t('RouteSidebar.modelPlaceholder')}
              disabled={!routeOptions}
              className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-[#4ECCA3] focus:ring-1 focus:ring-[#4ECCA3] disabled:bg-gray-100 disabled:text-gray-400"
            />
            <datalist id="mint-you-route-model-list">
              {filteredModelOptions.map((model) => (
                <option key={`mint-you-route-model-${model}`} value={model} />
              ))}
            </datalist>
            {modelOptions.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">{t('RouteSidebar.noModels')}</p>
            ) : null}
            {modelOptions.length > 0 && filteredModelOptions.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">{t('RouteSidebar.noMatchingModels')}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setRouteBinding(null);
            }}
            className="ui-sync-btn ui-sync-btn-secondary h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('RouteSidebar.useRuntimeDefault')}
          </button>

          <button
            type="button"
            onClick={() => {
              void reloadRouteOptions({ forceRefresh: true });
            }}
            disabled={loading}
            className="ui-sync-btn ui-sync-btn-secondary h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? t('RouteSidebar.loading') : t('RouteSidebar.reload')}
          </button>
        </div>
      </div>
    </aside>
  );
}
