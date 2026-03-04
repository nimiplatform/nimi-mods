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
import type { RuntimeStatusSidebarProps } from './sidebar/types.js';

const C = {
  gray700: '#374151',
} as const;

const ICON_SHIELD = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export function RuntimeStatusSidebar(props: RuntimeStatusSidebarProps) {
  const { t } = useModTranslation('local-chat');
  const {
    healthStatus,
    checkingHealth,
    chatRouteOptions,
    routeOverride,
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
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteOverride,
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
    routeOverride?.source === 'token-api'
      ? (
        (chatRouteOptions?.connectors.length || 0) === 0
          || chatRouteOptions?.connectors.some((connector) => connector.id === routeOverride.connectorId)
      )
      : true
  );
  const effectiveChatBinding: RuntimeRouteBinding | null = (
    routeOverride && hasValidTokenApiOverride
      ? routeOverride
      : chatRouteOptions?.selected || routeOverride || null
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

  const [openPanel, setOpenPanel] = useState<'defaults' | 'chat' | 'voice' | 'diagnostics' | null>('defaults');
  const [chatModelQuery, setChatModelQuery] = useState(effectiveChatBinding?.model || '');
  const filteredChatModelOptions = useMemo(
    () => filterModelOptions(chatModelOptions, chatModelQuery),
    [chatModelOptions, chatModelQuery],
  );
  const visibleSpeechVoices = useMemo(
    () => ttsRouteSource === 'token-api'
      ? speechVoices
      : speechVoices.filter((voice) => !selectedSpeechProviderId || voice.providerId === selectedSpeechProviderId),
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

  return (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <span style={{ color: C.gray700 }}>{ICON_SHIELD}</span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('RuntimeSidebar.title')}</h3>
          <p className="text-[11px] text-gray-500">{t('RuntimeSidebar.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-xs">
          <p className="font-medium text-gray-700">{t('RuntimeSidebar.autoBoundSource')}</p>
          <p className="mt-1 text-gray-600">
            {autoBoundSource === 'token-api'
              ? 'Token API'
              : autoBoundSource === 'local-runtime'
                ? 'Local Runtime'
                : autoBoundSource === 'mixed'
                  ? 'Mixed'
                  : '-'}
            {autoBoundModel ? ` · ${autoBoundModel}` : ''}
          </p>
          <p className={`mt-1 ${chatCapabilityMatched ? 'text-green-700' : 'text-amber-700'}`}>
            {chatCapabilityMatched ? t('RuntimeSidebar.capabilityHit') : t('RuntimeSidebar.capabilityMissing')}
          </p>
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-medium text-gray-700">{t('RuntimeSidebar.dependencyStatus')}</p>
            <p className={`text-[11px] ${
              dependencyStatus === 'ready'
                ? 'text-green-700'
                : dependencyStatus === 'degraded'
                  ? 'text-amber-700'
                  : dependencyStatus === 'missing'
                    ? 'text-amber-800'
                    : 'text-gray-600'
            }`}
            >
              {dependencyStatus === 'ready'
                ? t('RuntimeSidebar.dependencyStatusReady')
                : dependencyStatus === 'degraded'
                  ? t('RuntimeSidebar.dependencyStatusDegraded')
                  : dependencyStatus === 'missing'
                    ? t('RuntimeSidebar.dependencyStatusMissing')
                    : t('RuntimeSidebar.dependencyStatusUnknown')}
              {dependencyReasonCode ? ` · ${dependencyReasonCode}` : ''}
            </p>
            {visibleDependencyCapabilities.map((item) => (
              <p
                key={`runtime-dependency-${item.capability}`}
                className={`text-[11px] ${item.matched ? 'text-green-700' : 'text-amber-700'}`}
              >
                {item.matched
                  ? t('RuntimeSidebar.dependencyReady', { capability: item.capability.toUpperCase() })
                  : t('RuntimeSidebar.dependencyMissing', { capability: item.capability.toUpperCase() })}
              </p>
            ))}
            {dependencyUpdatedAt ? (
              <p className="text-[10px] text-gray-500">
                {t('RuntimeSidebar.dependencyUpdatedAt')}: {new Date(dependencyUpdatedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
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
          onClearRouteOverride={onClearRouteOverride}
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

        <DiagnosticsPanel
          open={openPanel === 'diagnostics'}
          onToggle={() => setOpenPanel((prev) => (prev === 'diagnostics' ? null : 'diagnostics'))}
          latestPromptTrace={latestPromptTrace}
          latestTurnAudit={latestTurnAudit}
          healthStatus={healthStatus}
          checkingHealth={checkingHealth}
          onHealthCheck={onHealthCheck}
        />
      </div>
    </aside>
  );
}
