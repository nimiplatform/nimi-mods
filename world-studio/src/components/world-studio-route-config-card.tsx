import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { RuntimeRouteBinding, RuntimeRouteConnectorOption, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import { RouteCapabilityControls } from './route-capability-controls.js';

export function WorldStudioRouteConfigCard(props: {
  activeCoarseRouteSource: RuntimeRouteSource;
  activeCoarseRouteConnectorId: string;
  activeFineRouteSource: RuntimeRouteSource;
  activeFineRouteConnectorId: string;
  effectiveCoarseRouteBinding: RuntimeRouteBinding | null;
  effectiveFineRouteBinding: RuntimeRouteBinding | null;
  coarseRouteModelOptions: string[];
  fineRouteModelOptions: string[];
  coarseRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  fineRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  routeConnectors: RuntimeRouteConnectorOption[];
  onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
  onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
  onClearRouteBinding: (profile: 'coarse' | 'fine' | 'all') => void;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
  routeConfigReady: boolean;
  routeConfigReasonCode: string;
  routeConfigActionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'select-model' | 'select-connector';
  embeddingReadiness: {
    healthy: boolean;
    reasonCode: string;
    actionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'retry';
    message: string;
  };
  embeddingIndexStatus: 'idle' | 'building' | 'ready' | 'failed';
  embeddingEntryCount: number;
  embeddingIndexLastBuiltAt: string | null;
  embeddingIndexErrorMessage: string | null;
  expertMode: boolean;
  onSetExpertMode: (value: boolean) => void;
  onOpenRuntimeSetup?: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
}) {
  const { t } = useModTranslation('world-studio');
  return (
    <div>
      <p className="text-xs text-gray-600">
        {t('routeConfig.intro')}
      </p>
      <p className="mt-2 text-xs text-gray-600">{t('routeConfig.coarseSummary')}: {props.effectiveCoarseRouteSummary}</p>
      <p className="mt-1 text-xs text-gray-600">{t('routeConfig.fineSummary')}: {props.effectiveFineRouteSummary}</p>

      <div className="mt-3 space-y-2">
        <RouteCapabilityControls
          profile="coarse"
          title={t('routeConfig.coarseTitle')}
          activeSource={props.activeCoarseRouteSource}
          activeConnectorId={props.activeCoarseRouteConnectorId}
          binding={props.effectiveCoarseRouteBinding}
          connectors={props.routeConnectors}
          modelOptions={props.coarseRouteModelOptions}
          readiness={props.coarseRouteReadiness}
          onRouteSourceChange={props.onRouteSourceChange}
          onRouteConnectorChange={props.onRouteConnectorChange}
          onRouteModelChange={props.onRouteModelChange}
          onClearRouteOverride={props.onClearRouteBinding}
          onOpenRuntimeSetup={props.onOpenRuntimeSetup}
        />
        <RouteCapabilityControls
          profile="fine"
          title={t('routeConfig.fineTitle')}
          activeSource={props.activeFineRouteSource}
          activeConnectorId={props.activeFineRouteConnectorId}
          binding={props.effectiveFineRouteBinding}
          connectors={props.routeConnectors}
          modelOptions={props.fineRouteModelOptions}
          readiness={props.fineRouteReadiness}
          onRouteSourceChange={props.onRouteSourceChange}
          onRouteConnectorChange={props.onRouteConnectorChange}
          onRouteModelChange={props.onRouteModelChange}
          onClearRouteOverride={props.onClearRouteBinding}
          onOpenRuntimeSetup={props.onOpenRuntimeSetup}
        />
      </div>

      <button
        type="button"
        className="ui-sync-btn ui-sync-btn-secondary mt-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
        onClick={() => props.onClearRouteBinding('all')}
      >
        {t('routeConfig.resetAll')}
      </button>

      <p className={`mt-2 text-[11px] ${props.routeConfigReady ? 'text-emerald-700' : 'text-amber-700'}`}>
        {props.routeConfigReady
          ? t('routeConfig.ready')
          : `${t('routeConfig.notReady')} ${props.routeConfigReasonCode}（${props.routeConfigActionHint}）`}
      </p>

      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2">
        <p className="text-xs font-semibold text-gray-800">{t('routeConfig.embeddingIndexTitle')}</p>
        <p className="mt-1 text-[11px] text-gray-600">
          {t('routeConfig.embeddingStatus')}: {props.embeddingIndexStatus} · {t('routeConfig.embeddingEntries')}: {props.embeddingEntryCount}
        </p>
        <p className={`mt-1 text-[11px] ${props.embeddingReadiness.healthy ? 'text-emerald-700' : 'text-amber-700'}`}>
          {props.embeddingReadiness.message} ({props.embeddingReadiness.reasonCode})
        </p>
        {props.embeddingIndexLastBuiltAt ? (
          <p className="mt-1 text-[11px] text-gray-500">
            {t('routeConfig.embeddingLastBuiltAt')}: {props.embeddingIndexLastBuiltAt}
          </p>
        ) : null}
        {props.embeddingIndexErrorMessage ? (
          <p className="mt-1 text-[11px] text-rose-700">{props.embeddingIndexErrorMessage}</p>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700"
            onClick={() => {
              void props.onRebuildEmbeddingIndex();
            }}
          >
            {t('routeConfig.rebuildEmbeddingIndex')}
          </button>
          {!props.embeddingReadiness.healthy && props.embeddingReadiness.actionHint !== 'none' && props.onOpenRuntimeSetup ? (
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700"
              onClick={() => props.onOpenRuntimeSetup?.()}
            >
              {t('routeConfig.goRuntime')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3">
        <p className="text-xs font-semibold text-gray-700">{t('routeConfig.expertModeTitle')}</p>
        <p className="mt-1 text-[11px] text-gray-600">{t('routeConfig.expertModeDesc')}</p>
        <button
          type="button"
          className={`ui-sync-btn mt-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${
            props.expertMode
              ? 'ui-sync-btn-selected border-brand-200 bg-brand-50 text-brand-700'
              : 'ui-sync-btn-secondary border-gray-300 bg-white text-gray-700'
          }`}
          onClick={() => props.onSetExpertMode(!props.expertMode)}
        >
          {props.expertMode ? t('routeConfig.expertModeOn') : t('routeConfig.expertModeOff')}
        </button>
      </div>
    </div>
  );
}
