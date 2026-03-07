import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';

type ModelSelectorProps = {
  routeOverride: RuntimeRouteBinding | null;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  onSourceChange: (source: RuntimeRouteSource) => void;
  onConnectorChange: (connectorId: string) => void;
  onModelChange: (model: string) => void;
  onClear: () => void;
};

export function ModelSelector({
  routeOverride,
  chatRouteOptions,
  onSourceChange,
  onConnectorChange,
  onModelChange,
  onClear,
}: ModelSelectorProps) {
  const { t } = useTranslation('kismet');

  const activeSource = routeOverride?.source || chatRouteOptions?.selected.source || 'local-runtime';
  const activeConnectorId = routeOverride?.connectorId || chatRouteOptions?.selected.connectorId || '';
  const activeModel = routeOverride?.model || chatRouteOptions?.selected.model || '';
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

  if (!chatRouteOptions) {
    return (
      <div className="text-xs" style={{ color: '#8C857B', border: '1px solid rgba(138,114,84,0.2)', padding: '8px 12px' }}>
        {t('ModelSelector.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('ModelSelector.title')}</label>
        {routeOverride && (
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
