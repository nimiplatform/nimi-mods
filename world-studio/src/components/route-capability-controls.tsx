import React, { useEffect, useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { filterModelOptions } from '@nimiplatform/sdk/mod/model-options';
import type { RouteStage } from '../hooks/use-world-studio-route-overrides.js';
import {
  normalizeRuntimeRouteSource,
  type RuntimeRouteBinding,
  type RuntimeRouteConnectorOption,
  type RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import { ReasonCode } from '@nimiplatform/sdk/types';

type RouteCapabilityControlsProps = {
  profile: RouteStage;
  title: string;
  activeSource: RuntimeRouteSource;
  activeConnectorId: string;
  binding: RuntimeRouteBinding | null;
  connectors: RuntimeRouteConnectorOption[];
  modelOptions: string[];
  readiness?: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  onRouteSourceChange: (profile: RouteStage, source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: RouteStage, connectorId: string) => void;
  onRouteModelChange: (profile: RouteStage, model: string) => void;
  onClearRouteOverride: (profile: RouteStage | 'all') => void;
  onOpenRuntimeSetup?: () => void;
};

export function RouteCapabilityControls(props: RouteCapabilityControlsProps) {
  const { t } = useModTranslation('world-studio');
  const modelListId = `world-studio-${props.profile}-model-list`;
  const setActiveTab = (tab: string): void => {
    if (tab === 'runtime') {
      props.onOpenRuntimeSetup?.();
    }
  };
  const readiness = props.readiness || {
    ready: true,
    reasonCode: ReasonCode.WORLD_STUDIO_ROUTE_READY,
    actionHint: 'none',
    message: 'Route is ready.',
  };
  const [modelQuery, setModelQuery] = useState(props.binding?.model || '');
  const filteredModelOptions = useMemo(
    () => filterModelOptions(props.modelOptions, modelQuery),
    [modelQuery, props.modelOptions],
  );

  useEffect(() => {
    setModelQuery(props.binding?.model || '');
  }, [props.binding?.model]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700">{props.title}</p>
      <div>
        <p className="mb-1 text-xs text-gray-500">{t('routeCapabilityControls.source')}</p>
        <select
          value={props.activeSource}
          onChange={(event) => props.onRouteSourceChange(props.profile, normalizeRuntimeRouteSource(event.target.value))}
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900"
        >
          <option value="local">Local Runtime</option>
          <option value="cloud">Token API</option>
        </select>
      </div>
      <div>
        <p className="mb-1 text-xs text-gray-500">{t('routeCapabilityControls.connector')}</p>
        <select
          value={props.activeConnectorId}
          disabled={props.activeSource !== 'cloud'}
          onChange={(event) => props.onRouteConnectorChange(props.profile, event.target.value)}
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">--</option>
          {props.connectors.map((connector) => (
            <option key={`world-studio-${props.profile}-connector-${connector.id}`} value={connector.id}>
              {connector.label || connector.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-1 text-xs text-gray-500">{t('routeCapabilityControls.model')}</p>
        <input
          list={modelListId}
          value={modelQuery}
          disabled={props.modelOptions.length === 0}
          onChange={(event) => {
            const nextValue = event.target.value;
            setModelQuery(nextValue);
            if (props.modelOptions.includes(nextValue)) {
              props.onRouteModelChange(props.profile, nextValue);
            }
          }}
          placeholder={t('routeCapabilityControls.modelPlaceholder')}
          className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-400"
        />
        <datalist id={modelListId}>
          {filteredModelOptions.map((model) => (
            <option key={`world-studio-${props.profile}-model-${model}`} value={model} />
          ))}
        </datalist>
        {props.modelOptions.length === 0 ? (
          <p className="mt-1 text-[11px] text-amber-700">{t('routeCapabilityControls.noAvailableModel')}</p>
        ) : null}
        {props.modelOptions.length > 0 && filteredModelOptions.length === 0 ? (
          <p className="mt-1 text-[11px] text-amber-700">{t('routeCapabilityControls.noMatchModel')}</p>
        ) : null}
        {props.activeSource === 'local' && props.modelOptions.length === 0 ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 space-y-2">
            <p className="text-[11px] text-amber-800">{t('routeCapabilityControls.emptyLocalRuntimeHint')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800"
                onClick={() => setActiveTab('runtime')}
              >
                {t('routeCapabilityControls.goInstallModels')}
              </button>
              <button
                type="button"
                className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800"
                onClick={() => props.onRouteSourceChange(props.profile, 'cloud')}
              >
                {t('routeCapabilityControls.switchToTokenApi')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {!readiness.ready ? (
        <p className="text-[11px] text-rose-700">
          {readiness.message} ({readiness.reasonCode})
        </p>
      ) : null}
      <button
        type="button"
        className="ui-sync-btn ui-sync-btn-secondary w-full rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
        onClick={() => props.onClearRouteOverride(props.profile)}
      >
        {t('routeCapabilityControls.useRuntimeDefault')}
      </button>
    </div>
  );
}
