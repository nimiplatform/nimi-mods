import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';

type ModelSelectorProps = {
  routeBinding: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  routeOptionsLoading: boolean;
  routeOptionsError: string | null;
  onSourceChange: (source: RuntimeRouteSource) => void;
  onConnectorChange: (connectorId: string) => void;
  onModelChange: (model: string) => void;
  onClear: () => void;
  onReload: () => void;
};

export function ModelSelector({
  routeBinding,
  chatRouteOptions,
  routeOptionsLoading,
  routeOptionsError,
  onSourceChange,
  onConnectorChange,
  onModelChange,
  onClear,
  onReload,
}: ModelSelectorProps) {
  const { t } = useTranslation('kismet');

  const activeSource = routeBinding?.source || chatRouteOptions?.selected.source || 'local-runtime';
  const activeConnectorId = routeBinding?.connectorId || chatRouteOptions?.selected.connectorId || '';
  const activeModel = routeBinding?.model || chatRouteOptions?.selected.model || '';
  const [modelQuery, setModelQuery] = useState(activeModel);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setModelQuery(activeModel);
    }
  }, [activeModel]);

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

  const routeOptionsAlert = routeOptionsError ? (
    <div
      className="space-y-2 text-xs"
      style={{ color: '#C07C52', border: '1px solid rgba(166,56,46,0.35)', padding: '8px 12px' }}
    >
      <div>{t('ModelSelector.loadFailed')}</div>
      <div className="break-all" style={{ color: '#8C857B' }}>{routeOptionsError}</div>
      <button
        type="button"
        onClick={onReload}
        style={{ background: 'none', border: 'none', color: '#8A7254', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
      >
        {routeOptionsLoading ? t('ModelSelector.reloading') : t('ModelSelector.retry')}
      </button>
    </div>
  ) : null;

  if (!chatRouteOptions) {
    return (
      routeOptionsAlert || (
        <div className="text-xs" style={{ color: '#8C857B', border: '1px solid rgba(138,114,84,0.2)', padding: '8px 12px' }}>
          {t('ModelSelector.loading')}
        </div>
      )
    );
  }

  return (
    <div className="space-y-2">
      {routeOptionsAlert}
      <div className="flex items-center justify-between">
        <label className="text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('ModelSelector.title')}</label>
        {routeBinding && (
          <button onClick={onClear} style={{ background: 'none', border: 'none', color: '#8A7254', cursor: 'pointer', fontSize: '0.7rem' }}>
            {t('ModelSelector.reset')}
          </button>
        )}
      </div>

      <select
        value={activeSource}
        onChange={(e) => onSourceChange(e.target.value as RuntimeRouteSource)}
        className="ks-input"
        style={{ appearance: 'none', fontSize: '0.85rem' }}
      >
        <option value="local-runtime" style={{ background: '#181615' }}>{t('ModelSelector.localRuntime')}</option>
        <option value="token-api" style={{ background: '#181615' }}>{t('ModelSelector.tokenApi')}</option>
      </select>

      {activeSource === 'token-api' && (
        <select
          value={activeConnectorId}
          onChange={(e) => onConnectorChange(e.target.value)}
          className="ks-input"
          style={{ appearance: 'none', fontSize: '0.85rem' }}
        >
          <option value="" style={{ background: '#181615' }}>--</option>
          {chatRouteOptions.connectors.map((c) => (
            <option key={c.id} value={c.id} style={{ background: '#181615' }}>{c.label || c.id}</option>
          ))}
        </select>
      )}

      <div>
        <input
          list="kismet-model-list"
          value={modelQuery}
          onChange={(e) => {
            const val = e.target.value;
            setModelQuery(val);
            if (modelOptions.includes(val)) {
              onModelChange(val);
            }
          }}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => {
            focusedRef.current = false;
            if (!modelQuery.trim()) {
              setModelQuery(activeModel);
            }
          }}
          placeholder={t('ModelSelector.selectModel')}
          className="ks-input"
          style={{ fontSize: '0.85rem' }}
        />
        <datalist id="kismet-model-list">
          {filteredModels.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {modelOptions.length === 0 && (
          <p className="mt-1 text-xs" style={{ color: '#A6382E' }}>
            {activeSource === 'local-runtime'
              ? t('ModelSelector.noLocalModels')
              : t('ModelSelector.noConnectorModels')}
          </p>
        )}
      </div>
    </div>
  );
}
