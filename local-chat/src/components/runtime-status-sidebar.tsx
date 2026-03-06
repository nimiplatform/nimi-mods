import React, { useEffect, useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import {
  filterModelOptions,
} from '@nimiplatform/sdk/mod/model-options';
import {
  type RuntimeRouteBinding,
} from '@nimiplatform/sdk/mod/runtime-route';
import { dedupeModelIds } from '../services/index.js';
import { DefaultSettingsPanel } from './sidebar/default-settings-panel.js';
import { ChatRoutePanel } from './sidebar/chat-route-panel.js';
import { VoicePanel } from './sidebar/voice-panel.js';
import { DiagnosticsPanel } from './sidebar/diagnostics-panel.js';
import { MediaRoutePanel } from './sidebar/media-route-panel.js';
import type { RuntimeStatusSidebarProps } from './sidebar/types.js';

const ICON_SHIELD = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

type RuntimeSpeechVoice = RuntimeStatusSidebarProps['speechVoices'][number];

export function resolveVisibleSpeechVoices(input: {
  ttsRouteSource: RuntimeStatusSidebarProps['ttsRouteSource'];
  selectedSpeechProviderId: string;
  speechVoices: RuntimeSpeechVoice[];
}): RuntimeSpeechVoice[] {
  if (input.ttsRouteSource === 'token-api') {
    return input.speechVoices;
  }
  const providerId = String(input.selectedSpeechProviderId || '').trim();
  if (!providerId) {
    return input.speechVoices;
  }
  return input.speechVoices.filter((voice) => voice.providerId === providerId);
}

function sourceLabel(source: RuntimeRouteBinding['source'] | 'mixed' | 'unknown'): string {
  if (source === 'token-api') return 'Token API';
  if (source === 'local-runtime') return 'Local Runtime';
  if (source === 'mixed') return 'Mixed';
  return 'Unknown';
}

function bindingsEqual(a: RuntimeRouteBinding | null, b: RuntimeRouteBinding | null): boolean {
  if (!a || !b) return false;
  return (
    a.source === b.source
    && String(a.connectorId || '') === String(b.connectorId || '')
    && String(a.model || '') === String(b.model || '')
    && String(a.localModelId || '') === String(b.localModelId || '')
  );
}

export function RuntimeStatusSidebar(props: RuntimeStatusSidebarProps) {
  const { t } = useModTranslation('local-chat');
  const {
    healthStatus,
    checkingHealth,
    chatRouteOptions,
    routeBinding,
    speechProviders,
    speechVoices,
    selectedSpeechProviderId,
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
    voiceCatalogSource,
    voiceCatalogModelResolved,
    voiceCatalogVersion,
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteBinding,
    onSpeechProviderChange,
    onVoiceIdChange,
    onTtsRouteSourceChange,
    onTtsConnectorChange,
    onSttRouteSourceChange,
    onHealthCheck,
    onOpenRuntimeSetup,
    defaultSettings,
    onDefaultSettingChange,
    onDefaultVoiceNameChange,
  } = props;

  const hasValidTokenApiOverride = (
    routeBinding?.source === 'token-api'
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
  const activeChatSource = effectiveChatBinding?.source || 'local-runtime';
  const fallbackConnectorId = chatRouteOptions?.connectors[0]?.id || '';
  const activeChatConnectorId = (
    activeChatSource === 'token-api'
      ? (effectiveChatBinding?.connectorId || fallbackConnectorId || '')
      : ''
  );
  const activeChatConnector = chatRouteOptions?.connectors.find((connector) => connector.id === activeChatConnectorId)
    || chatRouteOptions?.connectors[0]
    || null;
  const chatModelOptionsRaw = activeChatSource === 'local-runtime'
    ? (chatRouteOptions?.localRuntime.models.map((model) => model.model) || [])
    : (activeChatConnector?.models || []);
  const chatModelOptions = useMemo(
    () => dedupeModelIds(chatModelOptionsRaw),
    [chatModelOptionsRaw],
  );

  const [openPanel, setOpenPanel] = useState<'defaults' | 'chat' | 'media' | 'voice' | 'diagnostics' | null>('defaults');
  const [chatModelQuery, setChatModelQuery] = useState(effectiveChatBinding?.model || '');
  const filteredChatModelOptions = useMemo(
    () => filterModelOptions(chatModelOptions, chatModelQuery),
    [chatModelOptions, chatModelQuery],
  );
  const visibleSpeechVoices = useMemo(
    () => resolveVisibleSpeechVoices({
      ttsRouteSource,
      selectedSpeechProviderId,
      speechVoices,
    }),
    [selectedSpeechProviderId, speechVoices, ttsRouteSource],
  );

  useEffect(() => {
    setChatModelQuery(effectiveChatBinding?.model || '');
  }, [effectiveChatBinding?.model]);

  const missingRequiredDependencies = useMemo(
    () => dependencyCapabilities.filter((item) => item.required && !item.matched),
    [dependencyCapabilities],
  );
  const visibleDependencyCapabilities = useMemo(
    () => dependencyCapabilities.filter((item) => item.capability === 'chat' || item.required),
    [dependencyCapabilities],
  );
  const resolvedDefaultBinding = chatRouteOptions?.resolvedDefault || chatRouteOptions?.selected || null;
  const formatRouteBindingLabel = useMemo(() => (
    (binding: RuntimeRouteBinding | null): string => {
      if (!binding) return '-';
      const routeSourceLabel = sourceLabel(binding.source);
      if (binding.source === 'token-api') {
        const connector = chatRouteOptions?.connectors.find((item) => item.id === binding.connectorId) || null;
        const connectorLabel = String(connector?.label || binding.connectorId || '').trim() || '-';
        const model = String(binding.model || '').trim() || '-';
        return `${routeSourceLabel} · ${connectorLabel} · ${model}`;
      }
      const model = String(binding.model || binding.localModelId || '').trim() || '-';
      return `${routeSourceLabel} · ${model}`;
    }
  ), [chatRouteOptions?.connectors]);
  const defaultRouteLabel = resolvedDefaultBinding
    ? formatRouteBindingLabel(resolvedDefaultBinding)
    : `${sourceLabel(autoBoundSource)}${autoBoundModel ? ` · ${autoBoundModel}` : ''}`;
  const effectiveRouteLabel = formatRouteBindingLabel(effectiveChatBinding);
  const overrideApplied = Boolean(
    routeBinding
    && effectiveChatBinding
    && bindingsEqual(routeBinding, effectiveChatBinding)
    && !bindingsEqual(effectiveChatBinding, resolvedDefaultBinding),
  );
  const dependencyStatusLabel = (
    dependencyStatus === 'ready'
      ? t('RuntimeSidebar.dependencyStatusReady')
      : dependencyStatus === 'degraded'
        ? t('RuntimeSidebar.dependencyStatusDegraded')
        : dependencyStatus === 'missing'
          ? t('RuntimeSidebar.dependencyStatusMissing')
          : t('RuntimeSidebar.dependencyStatusUnknown')
  );
  const failedCapabilityLabels = visibleDependencyCapabilities
    .filter((item) => !item.matched)
    .map((item) => item.capability.toUpperCase());

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
        <div className="lc-card rounded-2xl p-3 text-xs">
          <p className="text-[13px] font-semibold text-gray-700">{t('RuntimeSidebar.globalStatusTitle')}</p>
          <p className="mt-1 text-[11px] text-gray-500">{t('RuntimeSidebar.globalStatusSubtitle')}</p>
          <p className="mt-2 text-[11px] text-gray-600">
            <span className="font-semibold text-gray-700">{t('RuntimeSidebar.defaultRouteLabel')}:</span> {defaultRouteLabel}
          </p>
          <p className="mt-1 text-[11px] text-gray-600">
            <span className="font-semibold text-gray-700">{t('RuntimeSidebar.effectiveRouteLabel')}:</span> {effectiveRouteLabel}
          </p>
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
              dependencyStatus === 'ready'
                ? 'bg-mint-100 text-mint-700'
                : dependencyStatus === 'degraded' || dependencyStatus === 'missing'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
            }`}
            >
              {dependencyStatusLabel}
            </span>
            {dependencyReasonCode ? (
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                {dependencyReasonCode}
              </span>
            ) : null}
          </div>
          {failedCapabilityLabels.length > 0 ? (
            <p className="mt-2 text-[11px] text-amber-700">
              {failedCapabilityLabels.join(', ')} {t('RuntimeSidebar.capabilityMissing')}
            </p>
          ) : null}
          {dependencyUpdatedAt ? (
            <p className="mt-2 text-[10px] text-gray-500">
              {t('RuntimeSidebar.dependencyUpdatedAt')}: {new Date(dependencyUpdatedAt).toLocaleTimeString()}
            </p>
          ) : null}
          {!chatCapabilityMatched || missingRequiredDependencies.length > 0 || dependencyRepairActions.length > 0 ? (
            <button
              type="button"
              className="mt-2 h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
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
                  className="block h-7 rounded-md border border-amber-200 bg-white px-2 text-left text-[11px] text-amber-800"
                  onClick={onOpenRuntimeSetup}
                  title={action.reasonCode}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <DefaultSettingsPanel
          open={openPanel === 'defaults'}
          onToggle={() => setOpenPanel((prev) => (prev === 'defaults' ? null : 'defaults'))}
          defaultSettings={defaultSettings}
          speechVoices={speechVoices}
          onDefaultSettingChange={onDefaultSettingChange}
          onDefaultVoiceNameChange={onDefaultVoiceNameChange}
        />

        <ChatRoutePanel
          open={openPanel === 'chat'}
          onToggle={() => setOpenPanel((prev) => (prev === 'chat' ? null : 'chat'))}
          activeChatSource={activeChatSource}
          activeChatConnectorId={activeChatConnectorId}
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
          onToggle={() => setOpenPanel((prev) => (prev === 'voice' ? null : 'voice'))}
          enableVoice={defaultSettings.enableVoice}
          selectedSpeechProviderId={selectedSpeechProviderId}
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
          speechProviders={speechProviders}
          visibleSpeechVoices={visibleSpeechVoices}
          onSpeechProviderChange={onSpeechProviderChange}
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
          onToggle={() => setOpenPanel((prev) => (prev === 'media' ? null : 'media'))}
          imageRouteOptions={props.imageRouteOptions}
          videoRouteOptions={props.videoRouteOptions}
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

        <DiagnosticsPanel
          open={openPanel === 'diagnostics'}
          onToggle={() => setOpenPanel((prev) => (prev === 'diagnostics' ? null : 'diagnostics'))}
          latestPromptTrace={latestPromptTrace}
          latestTurnAudit={latestTurnAudit}
          voiceCatalogSource={voiceCatalogSource}
          voiceCatalogModelResolved={voiceCatalogModelResolved}
          voiceCatalogVersion={voiceCatalogVersion}
          healthStatus={healthStatus}
          checkingHealth={checkingHealth}
          onHealthCheck={onHealthCheck}
        />
      </div>
    </aside>
  );
}
