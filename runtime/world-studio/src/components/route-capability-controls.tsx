import React, { useEffect, useMemo, useState } from 'react';
import type { RouteStage } from '../hooks/use-world-studio-route-overrides.js';
import { ReasonCode } from '@nimiplatform/sdk/types';
import { useModTranslation, filterModelOptions, normalizeRuntimeRouteSource, type RuntimeRouteBinding, type RuntimeRouteConnectorOption, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
type RouteCapabilityControlsProps = {
    profile: RouteStage;
    title: string;
    showTitle?: boolean;
    activeSource: RuntimeRouteSource;
    activeConnectorId: string;
    binding: RuntimeRouteBinding | null;
    connectors: RuntimeRouteConnectorOption[];
    modelOptions: string[];
    readiness?: {
        ready: boolean;
        reasonCode: string;
        actionHint: string;
        message: string;
    };
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
        message: t('routeCapabilityControls.routeReady'),
    };
    const [modelQuery, setModelQuery] = useState(props.binding?.model || '');
    const filteredModelOptions = useMemo(() => filterModelOptions(props.modelOptions, modelQuery), [modelQuery, props.modelOptions]);
    useEffect(() => {
        setModelQuery(props.binding?.model || '');
    }, [props.binding?.model]);
    return (<div className="space-y-2.5">
      {props.showTitle === false ? null : <p className="text-[13px] font-semibold text-slate-900">{props.title}</p>}
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-500">{t('routeCapabilityControls.source')}</p>
        <select value={props.activeSource} onChange={(event) => props.onRouteSourceChange(props.profile, normalizeRuntimeRouteSource(event.target.value))} className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm">
          <option value="local">{t('routeCapabilityControls.sourceLocal')}</option>
          <option value="cloud">{t('routeCapabilityControls.sourceCloud')}</option>
        </select>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-500">{t('routeCapabilityControls.connector')}</p>
        <select value={props.activeConnectorId} disabled={props.activeSource !== 'cloud'} onChange={(event) => props.onRouteConnectorChange(props.profile, event.target.value)} className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm disabled:bg-gray-100 disabled:text-gray-400">
          <option value="">--</option>
          {props.connectors.map((connector) => (<option key={`world-studio-${props.profile}-connector-${connector.id}`} value={connector.id}>
              {connector.label || connector.id}
            </option>))}
        </select>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-slate-500">{t('routeCapabilityControls.model')}</p>
        <input list={modelListId} value={modelQuery} disabled={props.modelOptions.length === 0} onChange={(event) => {
            const nextValue = event.target.value;
            setModelQuery(nextValue);
            if (props.modelOptions.includes(nextValue)) {
                props.onRouteModelChange(props.profile, nextValue);
            }
        }} placeholder={t('routeCapabilityControls.modelPlaceholder')} className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 disabled:text-gray-400"/>
        <datalist id={modelListId}>
          {filteredModelOptions.map((model) => (<option key={`world-studio-${props.profile}-model-${model}`} value={model}/>))}
        </datalist>
        {props.modelOptions.length === 0 ? (<p className="mt-1 text-[11px] text-amber-700">{t('routeCapabilityControls.noAvailableModel')}</p>) : null}
        {props.modelOptions.length > 0 && filteredModelOptions.length === 0 ? (<p className="mt-1 text-[11px] text-amber-700">{t('routeCapabilityControls.noMatchModel')}</p>) : null}
        {props.activeSource === 'local' && props.modelOptions.length === 0 ? (<div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] text-amber-800">{t('routeCapabilityControls.emptyLocalHint')}</p>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 shadow-sm" onClick={() => setActiveTab('runtime')}>
                {t('routeCapabilityControls.goInstallModels')}
              </button>
              <button type="button" className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 shadow-sm" onClick={() => props.onRouteSourceChange(props.profile, 'cloud')}>
                {t('routeCapabilityControls.switchToCloud')}
              </button>
            </div>
          </div>) : null}
      </div>
      {!readiness.ready ? (<p className="rounded-xl bg-red-50 px-3 py-2 text-[11px] text-rose-700">
          {readiness.message} ({readiness.reasonCode})
        </p>) : null}
      <button type="button" className="h-8 w-full rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm" onClick={() => props.onClearRouteOverride(props.profile)}>
        {t('routeCapabilityControls.useRuntimeDefault')}
      </button>
    </div>);
}
