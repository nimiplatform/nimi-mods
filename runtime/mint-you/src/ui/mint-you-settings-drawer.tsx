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

function toDefaultBinding(
  routeBinding: RuntimeRouteBinding | null,
  routeOptions: ReturnType<typeof useMintYouRouteOptions>['routeOptions'],
): RuntimeRouteBinding {
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

type MintYouSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function MintYouSettingsDrawer({
  open,
  onClose,
}: MintYouSettingsDrawerProps) {
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

  useEffect(() => {
    setModelQuery(effectiveBinding.model || '');
  }, [effectiveBinding.model]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredModelOptions = useMemo(
    () => filterModelOptions(modelOptions, modelQuery),
    [modelOptions, modelQuery],
  );

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
    <>
      <div
        className={`absolute inset-0 z-20 bg-slate-900/12 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`absolute inset-y-0 right-0 z-30 w-[360px] max-w-[92vw] border-l border-white/60 bg-[#f7fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('SettingsDrawer.title')}</p>
              <p className="mt-1 text-xs text-gray-500">{t('SettingsDrawer.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ui-sync-btn ui-sync-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-full border text-gray-600"
              aria-label={t('SettingsDrawer.close')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section className="ui-sync-card space-y-3 rounded-[24px] p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {t('SettingsDrawer.routeKicker')}
                </p>
                <p className="mt-2 text-sm text-gray-600">{t('SettingsDrawer.routeHint')}</p>
              </div>
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs leading-5 text-gray-500">
                {t('SettingsDrawer.storedNote')}
              </div>
            </section>

            <section className="ui-sync-card space-y-4 rounded-[24px] p-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">{t('SettingsDrawer.modelTitle')}</p>
                <p className="mt-1 text-xs text-gray-500">{t('SettingsDrawer.modelSubtitle')}</p>
              </div>

              {error ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p>{t('SettingsDrawer.loadFailed')}</p>
                  <p className="mt-1 break-all">{error}</p>
                </div>
              ) : null}

              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500">{t('SettingsDrawer.source')}</p>
                <select
                  value={activeSource}
                  onChange={(event) => handleSourceChange(event.target.value)}
                  disabled={!routeOptions}
                  className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="local">{t('SettingsDrawer.sourceLocal')}</option>
                  <option value="cloud">{t('SettingsDrawer.sourceCloud')}</option>
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500">{t('SettingsDrawer.connector')}</p>
                <select
                  value={activeConnectorId}
                  disabled={!routeOptions || activeSource !== 'cloud'}
                  onChange={(event) => handleConnectorChange(event.target.value)}
                  className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <option value="">--</option>
                  {connectors.map((connector) => (
                    <option key={`mint-you-settings-connector-${connector.id}`} value={connector.id}>
                      {connector.label || connector.id}
                    </option>
                  ))}
                </select>
                {activeSource === 'cloud' && connectors.length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">{t('SettingsDrawer.noConnectors')}</p>
                ) : null}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-gray-500">{t('SettingsDrawer.model')}</p>
                <input
                  list="mint-you-settings-model-list"
                  value={modelQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setModelQuery(nextValue);
                    if (modelOptions.includes(nextValue)) {
                      applyModel(nextValue);
                    }
                  }}
                  onBlur={() => applyModel(modelQuery)}
                  placeholder={t('SettingsDrawer.modelPlaceholder')}
                  disabled={!routeOptions}
                  className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-[#4ECCA3] focus:ring-1 focus:ring-[#4ECCA3] disabled:bg-gray-100 disabled:text-gray-400"
                />
                <datalist id="mint-you-settings-model-list">
                  {filteredModelOptions.map((model) => (
                    <option key={`mint-you-settings-model-${model}`} value={model} />
                  ))}
                </datalist>
                {modelOptions.length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">{t('SettingsDrawer.noModels')}</p>
                ) : null}
                {modelOptions.length > 0 && filteredModelOptions.length === 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">{t('SettingsDrawer.noMatchingModels')}</p>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRouteBinding(null)}
                  className="ui-sync-btn ui-sync-btn-secondary h-10 flex-1 rounded-2xl border px-3 text-sm font-medium text-gray-700"
                >
                  {t('SettingsDrawer.useRuntimeDefault')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void reloadRouteOptions({ forceRefresh: true });
                  }}
                  disabled={loading}
                  className="ui-sync-btn ui-sync-btn-secondary h-10 rounded-2xl border px-3 text-sm font-medium text-gray-700 disabled:opacity-50"
                >
                  {loading ? t('SettingsDrawer.loading') : t('SettingsDrawer.reload')}
                </button>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}
