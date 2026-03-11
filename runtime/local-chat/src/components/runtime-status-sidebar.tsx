import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import {
  filterModelOptions,
} from '@nimiplatform/sdk/mod/model-options';
import {
  type RuntimeRouteBinding,
} from '@nimiplatform/sdk/mod/runtime-route';
import { dedupeModelIds } from '../services/index.js';
import {
  resolveLocalRuntimeModelsForScenario,
  resolveModelsForScenario,
} from '../services/route/connector-model-capabilities.js';
import { ChatRoutePanel } from './sidebar/chat-route-panel.js';
import { VoicePanel } from './sidebar/voice-panel.js';
import { DiagnosticsPanel } from './sidebar/diagnostics-panel.js';
import { MediaRoutePanel } from './sidebar/media-route-panel.js';
import type { RuntimeStatusSidebarProps } from './sidebar/types.js';
import {
  bindingsEqual,
  formatRouteBindingLabel,
  formatRouteSnapshotLabel,
  hasPendingChatModelChange,
  sourceLabel,
} from './sidebar/runtime-status-state.js';

const ICON_SHIELD = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

type RuntimeSpeechVoice = RuntimeStatusSidebarProps['speechVoices'][number];

export function resolveVisibleSpeechVoices(input: {
  speechVoices: RuntimeSpeechVoice[];
}): RuntimeSpeechVoice[] {
  return input.speechVoices;
}

export function RuntimeStatusSidebar(props: RuntimeStatusSidebarProps) {
  const { t } = useModTranslation('local-chat');
  const {
    healthStatus,
    checkingHealth,
    chatRouteOptions,
    speechVoices,
    selectedVoiceId,
    ttsRouteSource,
    sttRouteSource,
    localTtsRouteAvailable,
    localSttRouteAvailable,
    autoBoundSource,
    autoBoundModel,
    chatCapabilityMatched,
    dependencyCapabilities,
    dependencyStatus,
    dependencyReasonCode,
    dependencyUpdatedAt,
    dependencyRepairActions,
    latestPromptTrace,
    latestTurnAudit,
    routeSnapshot,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onVoiceIdChange,
    onTtsRouteSourceChange,
    onTtsConnectorChange,
    onSttRouteSourceChange,
    onHealthCheck,
    onOpenRuntimeSetup,
    inspectSettings,
    enableVoice,
    sidebarVisible = true,
  } = props;
  const routeBinding = props.routeBinding || null;
  const onClearRouteBinding = props.onClearRouteBinding || (() => {});
  const onRefreshMediaDependencies = props.onRefreshMediaDependencies || (() => {});
  const onSidebarBootstrap = props.onSidebarBootstrap || (() => {});
  const onOpenChatPanel = props.onOpenChatPanel || (() => {});
  const onOpenVoicePanel = props.onOpenVoicePanel || (() => {});
  const onOpenMediaPanel = props.onOpenMediaPanel || (() => {});
  const isMediaRuntimeSidebarLoading = props.isMediaRuntimeSidebarLoading || false;
  const isImageRouteProbeLoading = props.isImageRouteProbeLoading || false;
  const isVideoRouteProbeLoading = props.isVideoRouteProbeLoading || false;

  const hasValidTokenApiOverride = (
    routeBinding?.source === 'cloud'
      ? (
        (chatRouteOptions?.connectors.length || 0) === 0
          || chatRouteOptions?.connectors.some((connector) => connector.id === routeBinding.connectorId)
      )
      : true
  );
  const effectiveChatBinding: RuntimeRouteBinding | null = (
    routeBinding && hasValidTokenApiOverride
      ? routeBinding
      : chatRouteOptions?.selected || routeBinding || null
  );
  const activeChatSource = effectiveChatBinding?.source || 'local';
  const fallbackConnectorId = chatRouteOptions?.connectors[0]?.id || '';
  const activeChatConnectorId = (
    activeChatSource === 'cloud'
      ? (effectiveChatBinding?.connectorId || fallbackConnectorId || '')
      : ''
  );
  const activeChatConnector = chatRouteOptions?.connectors.find((connector) => connector.id === activeChatConnectorId)
    || chatRouteOptions?.connectors[0]
    || null;
  const chatModelOptionsRaw = useMemo(() => {
    if (activeChatSource === 'local') {
      return resolveLocalRuntimeModelsForScenario({
        models: chatRouteOptions?.local?.models || [],
        scenario: 'chat',
      }).map((model) => model.model);
    }
    return resolveModelsForScenario({
      models: activeChatConnector?.models || [],
      modelCapabilities: activeChatConnector?.modelCapabilities,
      scenario: 'chat',
    });
  }, [
    activeChatConnector?.modelCapabilities,
    activeChatConnector?.models,
    activeChatSource,
    chatRouteOptions?.local?.models,
  ]);
  const chatModelOptions = useMemo(
    () => dedupeModelIds(chatModelOptionsRaw),
    [chatModelOptionsRaw],
  );

  const [openPanel, setOpenPanel] = useState<'chat' | 'media' | 'voice' | 'diagnostics' | null>(null);
  const [chatModelQuery, setChatModelQuery] = useState(effectiveChatBinding?.model || '');
  const didBootstrapRef = useRef(false);
  const filteredChatModelOptions = useMemo(
    () => filterModelOptions(chatModelOptions, chatModelQuery),
    [chatModelOptions, chatModelQuery],
  );
  const visibleSpeechVoices = useMemo(
    () => resolveVisibleSpeechVoices({
      speechVoices,
    }),
    [speechVoices],
  );

  useEffect(() => {
    setChatModelQuery(effectiveChatBinding?.model || '');
  }, [effectiveChatBinding?.model]);

  useEffect(() => {
    if (!sidebarVisible || didBootstrapRef.current) {
      return;
    }
    didBootstrapRef.current = true;
    onSidebarBootstrap();
  }, [onSidebarBootstrap, sidebarVisible]);

  const togglePanel = (panel: 'chat' | 'media' | 'voice' | 'diagnostics') => {
    setOpenPanel((previous) => (previous === panel ? null : panel));
  };

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (openPanel === 'chat') {
        onOpenChatPanel();
      }
      if (openPanel === 'voice') {
        onOpenVoicePanel();
      }
      if (openPanel === 'media') {
        onOpenMediaPanel();
      }
    }, openPanel === 'media' ? 120 : 50);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onOpenChatPanel, onOpenMediaPanel, onOpenVoicePanel, openPanel]);

  const missingRequiredDependencies = useMemo(
    () => dependencyCapabilities.filter((item) => item.required && item.resolved && !item.matched),
    [dependencyCapabilities],
  );
  const visibleDependencyCapabilities = dependencyCapabilities;
  const showMediaDependencyPending = isMediaRuntimeSidebarLoading;
  const resolvedDefaultBinding = chatRouteOptions?.resolvedDefault || chatRouteOptions?.selected || null;
  const connectors = chatRouteOptions?.connectors || [];
  const defaultRouteLabel = resolvedDefaultBinding
    ? formatRouteBindingLabel({
      binding: resolvedDefaultBinding,
      connectors,
    })
    : `${sourceLabel(autoBoundSource)}${autoBoundModel ? ` · ${autoBoundModel}` : ''}`;
  const effectiveRouteLabel = formatRouteSnapshotLabel({
    snapshot: routeSnapshot || null,
    fallbackBinding: effectiveChatBinding,
    connectors,
  });
  const hasPendingModelInput = hasPendingChatModelChange({
    activeModel: effectiveChatBinding?.model || routeSnapshot?.model || '',
    query: chatModelQuery,
  });
  const overrideApplied = Boolean(
    routeBinding
    && effectiveChatBinding
    && bindingsEqual(routeBinding, effectiveChatBinding)
    && !bindingsEqual(effectiveChatBinding, resolvedDefaultBinding),
  );
  const dependencyStatusLabel = (
    showMediaDependencyPending
      ? t('RuntimeSidebar.mediaDependencyChecking')
      : dependencyStatus === 'ready'
      ? t('RuntimeSidebar.dependencyStatusReady')
      : dependencyStatus === 'degraded'
        ? t('RuntimeSidebar.dependencyStatusDegraded')
        : dependencyStatus === 'missing'
          ? t('RuntimeSidebar.dependencyStatusMissing')
          : t('RuntimeSidebar.dependencyStatusUnknown')
  );
  const failedDependencyCapabilities = visibleDependencyCapabilities
    .filter((item) => item.required && item.resolved && !item.matched)
    .filter((item) => !showMediaDependencyPending || (item.capability !== 'image' && item.capability !== 'video'));
  const failedCapabilityLabels = failedDependencyCapabilities.map((item) => item.capability.toUpperCase());
  const hasOnlyMediaFailures = missingRequiredDependencies.length > 0
    && missingRequiredDependencies.every((item) => item.capability === 'image' || item.capability === 'video');
  const visibleDependencyReasonCode = showMediaDependencyPending && hasOnlyMediaFailures
    ? undefined
    : dependencyReasonCode;
  const dependencyUpdatedTimeLabel = useMemo(() => {
    const raw = String(dependencyUpdatedAt || '').trim();
    if (!raw) {
      return '';
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    try {
      return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [dependencyUpdatedAt]);

  return (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--lc-border)] bg-[#f4f8f9]">
      <div className="flex items-center gap-2 border-b border-[var(--lc-border)] px-4 py-3">
        <span className="text-gray-700">{ICON_SHIELD}</span>
        <div>
          <h3 className="text-[28px] font-black tracking-tight text-gray-900">{t('RuntimeSidebar.title')}</h3>
          <p className="text-[11px] text-gray-500">{t('RuntimeSidebar.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="lc-card rounded-2xl p-3 text-xs transition-all duration-200">
          <p className="text-[13px] font-semibold text-gray-700">{t('RuntimeSidebar.globalStatusTitle')}</p>
          <p className="mt-1 text-[11px] text-gray-500">{t('RuntimeSidebar.globalStatusSubtitle')}</p>
          <p className="mt-2 text-[11px] text-gray-600">
            <span className="font-semibold text-gray-700">{t('RuntimeSidebar.defaultRouteLabel')}:</span> {defaultRouteLabel}
          </p>
          <p className="mt-1 text-[11px] text-gray-600">
            <span className="font-semibold text-gray-700">{t('RuntimeSidebar.effectiveRouteLabel')}:</span> {effectiveRouteLabel}
          </p>
          {hasPendingModelInput ? (
            <p className="mt-1 text-[11px] text-amber-700">{t('RuntimeSidebar.pendingRouteHint')}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              {overrideApplied ? t('RuntimeSidebar.overrideBadge') : t('RuntimeSidebar.followsDefaultBadge')}
            </span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              chatCapabilityMatched ? 'bg-mint-100 text-mint-700' : 'bg-amber-100 text-amber-800'
            }`}
            >
              {chatCapabilityMatched ? t('RuntimeSidebar.capabilityHit') : t('RuntimeSidebar.capabilityMissing')}
            </span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              showMediaDependencyPending
                ? 'bg-sky-50 text-slate-600'
                : dependencyStatus === 'ready'
                ? 'bg-mint-100 text-mint-700'
                : dependencyStatus === 'degraded' || dependencyStatus === 'missing'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
            }`}
            >
              {dependencyStatusLabel}
            </span>
            {visibleDependencyReasonCode ? (
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {visibleDependencyReasonCode}
              </span>
            ) : null}
          </div>
          {failedCapabilityLabels.length > 0 ? (
            <p className="mt-2 text-[11px] text-amber-700">
              {failedCapabilityLabels.join(', ')} {t('RuntimeSidebar.capabilityMissing')}
            </p>
          ) : null}
          {dependencyUpdatedTimeLabel ? (
            <p className="mt-2 text-[10px] text-gray-500">
              {t('RuntimeSidebar.dependencyUpdatedAt')}: {dependencyUpdatedTimeLabel}
            </p>
          ) : null}
          <button
            type="button"
            className="lc-btn lc-btn-secondary mt-2 h-7 px-2 text-[11px] font-medium"
            onClick={onRefreshMediaDependencies}
            disabled={isMediaRuntimeSidebarLoading}
          >
            {isMediaRuntimeSidebarLoading ? t('RuntimeSidebar.mediaDependencyChecking') : t('RuntimeSidebar.refreshMediaDependencies')}
          </button>
          {!chatCapabilityMatched || missingRequiredDependencies.length > 0 || dependencyRepairActions.length > 0 ? (
            <button
              type="button"
              className="lc-btn lc-btn-warning mt-2 h-7 px-2 text-[11px] font-medium"
              onClick={onOpenRuntimeSetup}
            >
              {t('RuntimeSidebar.dependencyCta')}
            </button>
          ) : null}
          {dependencyRepairActions.length > 0 ? (
            <div className="mt-2 space-y-1">
              {dependencyRepairActions.slice(0, 3).map((action) => (
                <button
                  key={`runtime-repair-${action.actionId}`}
                  type="button"
                  className="lc-btn lc-btn-warning block h-7 px-2 text-left text-[11px]"
                  onClick={onOpenRuntimeSetup}
                  title={action.reasonCode}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <ChatRoutePanel
          open={openPanel === 'chat'}
          onToggle={() => togglePanel('chat')}
          activeChatSource={activeChatSource}
          activeChatConnectorId={activeChatConnectorId}
          activeChatModel={effectiveChatBinding?.model || ''}
          chatRouteOptions={chatRouteOptions}
          chatModelQuery={chatModelQuery}
          setChatModelQuery={setChatModelQuery}
          chatModelOptions={chatModelOptions}
          filteredChatModelOptions={filteredChatModelOptions}
          onRouteSourceChange={onRouteSourceChange}
          onRouteConnectorChange={onRouteConnectorChange}
          onRouteModelChange={onRouteModelChange}
          onClearRouteBinding={onClearRouteBinding}
        />

        <VoicePanel
          open={openPanel === 'voice'}
          onToggle={() => togglePanel('voice')}
          enableVoice={enableVoice}
          selectedVoiceId={selectedVoiceId}
          ttsRouteSource={ttsRouteSource}
          ttsConnectorId={props.ttsConnectorId}
          ttsModel={props.ttsModel}
          sttRouteSource={sttRouteSource}
          sttConnectorId={props.sttConnectorId}
          sttModel={props.sttModel}
          ttsConnectors={props.ttsConnectors}
          sttConnectors={props.sttConnectors}
          localTtsRouteAvailable={localTtsRouteAvailable}
          localSttRouteAvailable={localSttRouteAvailable}
          speechVoices={visibleSpeechVoices}
          onVoiceIdChange={onVoiceIdChange}
          onTtsRouteSourceChange={onTtsRouteSourceChange}
          onTtsConnectorChange={onTtsConnectorChange}
          onTtsModelChange={props.onTtsModelChange}
          onSttRouteSourceChange={onSttRouteSourceChange}
          onSttConnectorChange={props.onSttConnectorChange}
          onSttModelChange={props.onSttModelChange}
        />

        <MediaRoutePanel
          open={openPanel === 'media'}
          loading={isMediaRuntimeSidebarLoading}
          onToggle={() => togglePanel('media')}
          imageRouteOptions={props.imageRouteOptions}
          videoRouteOptions={props.videoRouteOptions}
          imageResolvedRoute={props.imageResolvedRoute || null}
          videoResolvedRoute={props.videoResolvedRoute || null}
          isImageRouteProbeLoading={isImageRouteProbeLoading}
          isVideoRouteProbeLoading={isVideoRouteProbeLoading}
          imageRouteSource={props.imageRouteSource}
          videoRouteSource={props.videoRouteSource}
          imageConnectorId={props.imageConnectorId}
          imageModel={props.imageModel}
          videoConnectorId={props.videoConnectorId}
          videoModel={props.videoModel}
          imageConnectors={props.imageConnectors}
          videoConnectors={props.videoConnectors}
          onImageRouteSourceChange={props.onImageRouteSourceChange}
          onImageConnectorChange={props.onImageConnectorChange}
          onImageModelChange={props.onImageModelChange}
          onVideoRouteSourceChange={props.onVideoRouteSourceChange}
          onVideoConnectorChange={props.onVideoConnectorChange}
          onVideoModelChange={props.onVideoModelChange}
        />

        {inspectSettings.diagnosticsVisible ? (
          <DiagnosticsPanel
            open={openPanel === 'diagnostics'}
            onToggle={() => togglePanel('diagnostics')}
            latestPromptTrace={latestPromptTrace}
            latestTurnAudit={latestTurnAudit}
            healthStatus={healthStatus}
            checkingHealth={checkingHealth}
            onHealthCheck={onHealthCheck}
          />
        ) : null}
      </div>
    </aside>
  );
}
