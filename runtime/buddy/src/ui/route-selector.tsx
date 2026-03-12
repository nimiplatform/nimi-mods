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
  const statusLabel = value.loading ? t('RouteSelector.loading') : t(`RouteSelector.${source}`);

  return (
    <div className="rounded-[20px] border border-white/70 bg-white/72 px-4 py-4 shadow-[0_8px_24px_rgba(31,38,135,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">
          {value.label}
        </div>
        <div className="rounded-md bg-slate-100/90 px-2 py-1 text-[11px] font-medium text-slate-500">
          {statusLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={source}
          onChange={(event) => onChangeSource(event.target.value === 'cloud' ? 'cloud' : 'local')}
          className="h-[38px] rounded-[10px] border border-black/5 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-sky-300 focus:shadow-[0_0_0_3px_rgba(122,186,255,0.18)]"
        >
          <option value="local">{t('RouteSelector.local')}</option>
          <option value="cloud">{t('RouteSelector.cloud')}</option>
        </select>

        {source === 'cloud' ? (
          <select
            value={connectorId}
            onChange={(event) => onChangeConnector(event.target.value)}
            className="h-[38px] rounded-[10px] border border-black/5 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-sky-300 focus:shadow-[0_0_0_3px_rgba(122,186,255,0.18)]"
          >
            {(value.options?.connectors || []).map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex h-[38px] items-center rounded-[10px] border border-dashed border-slate-200 bg-white/65 px-3 text-[14px] text-slate-400">
            {t('RouteSelector.runtimeLocal')}
          </div>
        )}
      </div>

      <select
        value={model}
        onChange={(event) => onChangeModel(event.target.value)}
        className="mt-2 h-[38px] w-full rounded-[10px] border border-black/5 bg-white px-3 text-[14px] text-slate-700 outline-none transition focus:border-sky-300 focus:shadow-[0_0_0_3px_rgba(122,186,255,0.18)]"
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
