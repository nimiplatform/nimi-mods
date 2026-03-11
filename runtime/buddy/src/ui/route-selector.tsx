import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type {
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';

export interface RouteSelectorValue {
  label: string;
  binding: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
  loading: boolean;
}

interface RouteSelectorProps {
  value: RouteSelectorValue;
  onChangeSource: (source: RuntimeRouteSource) => void;
  onChangeConnector: (connectorId: string) => void;
  onChangeModel: (model: string) => void;
}

function getModelOptions(value: RouteSelectorValue): string[] {
  if (value.binding?.source === 'cloud') {
    const connectorId = String(value.binding.connectorId || '').trim();
    const connector = value.options?.connectors.find((item) => item.id === connectorId) || null;
    return connector?.models || [];
  }
  return (value.options?.local.models || []).map((item) => item.model);
}

export function RouteSelector({
  value,
  onChangeSource,
  onChangeConnector,
  onChangeModel,
}: RouteSelectorProps) {
  const { t } = useModTranslation('buddy');
  const source = value.binding?.source || 'local';
  const connectorId = value.binding?.connectorId || '';
  const model = value.binding?.model || '';
  const modelOptions = getModelOptions(value);

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/88 px-3 py-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {value.label}
        </div>
        <div className="text-[11px] text-slate-400">
          {value.loading ? t('RouteSelector.loading') : t(`RouteSelector.${source}`)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={source}
          onChange={(event) => onChangeSource(event.target.value === 'cloud' ? 'cloud' : 'local')}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none"
        >
          <option value="local">{t('RouteSelector.local')}</option>
          <option value="cloud">{t('RouteSelector.cloud')}</option>
        </select>

        {source === 'cloud' ? (
          <select
            value={connectorId}
            onChange={(event) => onChangeConnector(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none"
          >
            {(value.options?.connectors || []).map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-400">
            {t('RouteSelector.runtimeLocal')}
          </div>
        )}
      </div>

      <select
        value={model}
        onChange={(event) => onChangeModel(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 outline-none"
      >
        {modelOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
