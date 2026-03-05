import React, { useMemo } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { dedupeModelIds } from '../../services/index.js';
import { resolveModelsForScenario } from '../../services/route/connector-model-capabilities.js';
import type { RuntimeStatusSidebarProps } from './types.js';

type Props = {
  open: boolean;
  onToggle: () => void;
  imageRouteOptions: RuntimeStatusSidebarProps['imageRouteOptions'];
  videoRouteOptions: RuntimeStatusSidebarProps['videoRouteOptions'];
  imageRouteSource: RuntimeStatusSidebarProps['imageRouteSource'];
  videoRouteSource: RuntimeStatusSidebarProps['videoRouteSource'];
  imageConnectorId: string;
  imageModel: string;
  videoConnectorId: string;
  videoModel: string;
  imageConnectors: RuntimeStatusSidebarProps['imageConnectors'];
  videoConnectors: RuntimeStatusSidebarProps['videoConnectors'];
  onImageRouteSourceChange: RuntimeStatusSidebarProps['onImageRouteSourceChange'];
  onImageConnectorChange: RuntimeStatusSidebarProps['onImageConnectorChange'];
  onImageModelChange: RuntimeStatusSidebarProps['onImageModelChange'];
  onVideoRouteSourceChange: RuntimeStatusSidebarProps['onVideoRouteSourceChange'];
  onVideoConnectorChange: RuntimeStatusSidebarProps['onVideoConnectorChange'];
  onVideoModelChange: RuntimeStatusSidebarProps['onVideoModelChange'];
};

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5" />
  </svg>
);

function localRuntimeMediaModels(
  options: RuntimeStatusSidebarProps['imageRouteOptions'] | RuntimeStatusSidebarProps['videoRouteOptions'],
  scenario: 'image' | 'video',
): string[] {
  const models = (options?.localRuntime.models || [])
    .filter((item) => {
      const capabilities = Array.isArray(item.capabilities) ? item.capabilities : [];
      return capabilities.includes(scenario) || capabilities.includes(`llm.${scenario}.generate`);
    })
    .map((item) => String(item.model || item.localModelId || '').trim())
    .filter(Boolean);
  return dedupeModelIds(models);
}

function connectorMediaModels(input: {
  connectors: RuntimeStatusSidebarProps['imageConnectors'] | RuntimeStatusSidebarProps['videoConnectors'];
  connectorId: string;
  scenario: 'image' | 'video';
}): string[] {
  const connector = input.connectors.find((item) => item.id === input.connectorId) || null;
  if (!connector) return [];
  return resolveModelsForScenario({
    models: connector.models || [],
    modelCapabilities: connector.modelCapabilities,
    scenario: input.scenario,
  });
}

export function MediaRoutePanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const imageConnectorModels = useMemo(() => connectorMediaModels({
    connectors: props.imageConnectors,
    connectorId: props.imageConnectorId,
    scenario: 'image',
  }), [props.imageConnectors, props.imageConnectorId]);
  const videoConnectorModels = useMemo(() => connectorMediaModels({
    connectors: props.videoConnectors,
    connectorId: props.videoConnectorId,
    scenario: 'video',
  }), [props.videoConnectors, props.videoConnectorId]);
  const imageLocalModels = useMemo(
    () => localRuntimeMediaModels(props.imageRouteOptions, 'image'),
    [props.imageRouteOptions],
  );
  const videoLocalModels = useMemo(
    () => localRuntimeMediaModels(props.videoRouteOptions, 'video'),
    [props.videoRouteOptions],
  );
  const imageModelOptions = props.imageRouteSource === 'token-api' ? imageConnectorModels : imageLocalModels;
  const videoModelOptions = props.videoRouteSource === 'token-api' ? videoConnectorModels : videoLocalModels;
  const imageConnectorMissing = props.imageRouteSource === 'token-api' && !String(props.imageConnectorId || '').trim();
  const videoConnectorMissing = props.videoRouteSource === 'token-api' && !String(props.videoConnectorId || '').trim();
  const fullyAutoWithoutOverrides = (
    props.imageRouteSource === 'auto'
    && props.videoRouteSource === 'auto'
    && !String(props.imageConnectorId || '').trim()
    && !String(props.imageModel || '').trim()
    && !String(props.videoConnectorId || '').trim()
    && !String(props.videoModel || '').trim()
  );

  return (
    <div className="lc-card rounded-2xl p-3 text-xs">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        className="flex h-7 w-full items-center justify-between text-left text-[13px] font-semibold text-gray-700"
      >
        <span>{t('MediaRoute.title')}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${props.open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      <div className={`grid overflow-hidden transition-all duration-200 ${props.open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className={`min-h-0 space-y-4 ${props.open ? 'lc-panel-expand' : ''}`}>
          {imageConnectorMissing || videoConnectorMissing ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              {t('MediaRoute.connectorRequiredHint')}
            </p>
          ) : null}
          {fullyAutoWithoutOverrides ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600">
              {t('MediaRoute.autoRouteHint')}
            </p>
          ) : null}
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-2">
            <p className="text-[11px] font-semibold text-gray-700">{t('MediaRoute.imageTitle')}</p>
            <select
              value={props.imageRouteSource}
              onChange={(event) => props.onImageRouteSourceChange(event.target.value as 'auto' | 'local-runtime' | 'token-api')}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
            >
              <option value="auto">{t('MediaRoute.auto')}</option>
              <option value="local-runtime">{t('MediaRoute.localRuntime')}</option>
              <option value="token-api">{t('MediaRoute.tokenApi')}</option>
            </select>
            <select
              value={props.imageConnectorId}
              disabled={props.imageRouteSource !== 'token-api'}
              onChange={(event) => props.onImageConnectorChange(event.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">--</option>
              {props.imageConnectors.map((connector) => (
                <option key={`image-connector-${connector.id}`} value={connector.id}>{connector.label || connector.id}</option>
              ))}
            </select>
            <input
              list="local-chat-image-model-list"
              value={props.imageModel}
              onChange={(event) => props.onImageModelChange(event.target.value)}
              placeholder={t('MediaRoute.modelPlaceholder')}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-mint-500 focus:ring-1 focus:ring-mint-500"
            />
            <datalist id="local-chat-image-model-list">
              {imageModelOptions.map((model) => (
                <option key={`image-model-${model}`} value={model} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-2">
            <p className="text-[11px] font-semibold text-gray-700">{t('MediaRoute.videoTitle')}</p>
            <select
              value={props.videoRouteSource}
              onChange={(event) => props.onVideoRouteSourceChange(event.target.value as 'auto' | 'local-runtime' | 'token-api')}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
            >
              <option value="auto">{t('MediaRoute.auto')}</option>
              <option value="local-runtime">{t('MediaRoute.localRuntime')}</option>
              <option value="token-api">{t('MediaRoute.tokenApi')}</option>
            </select>
            <select
              value={props.videoConnectorId}
              disabled={props.videoRouteSource !== 'token-api'}
              onChange={(event) => props.onVideoConnectorChange(event.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">--</option>
              {props.videoConnectors.map((connector) => (
                <option key={`video-connector-${connector.id}`} value={connector.id}>{connector.label || connector.id}</option>
              ))}
            </select>
            <input
              list="local-chat-video-model-list"
              value={props.videoModel}
              onChange={(event) => props.onVideoModelChange(event.target.value)}
              placeholder={t('MediaRoute.modelPlaceholder')}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-mint-500 focus:ring-1 focus:ring-mint-500"
            />
            <datalist id="local-chat-video-model-list">
              {videoModelOptions.map((model) => (
                <option key={`video-model-${model}`} value={model} />
              ))}
            </datalist>
          </div>
        </div>
      </div>
    </div>
  );
}
