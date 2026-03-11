import React, { useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { filterModelOptions } from '@nimiplatform/sdk/mod/model-options';
import { normalizeRuntimeRouteSource, type RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatProductSettings } from '../../state/index.js';
import { dedupeModelIds } from '../../services/index.js';
import {
  resolveLocalRuntimeModelsForScenario,
  resolveModelsForScenario,
} from '../../services/route/connector-model-capabilities.js';
import { resolveCommittedChatModelQuery } from '../../hooks/runtime-route/override-actions.js';
import { VoicePanel } from '../sidebar/voice-panel.js';
import { MediaRoutePanel } from '../sidebar/media-route-panel.js';
import type { RuntimeStatusSidebarProps } from '../sidebar/types.js';

type LocalChatSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  productSettings: LocalChatProductSettings;
  enableVoice: boolean;
  onToggleProductSetting: (key: 'allowProactiveContact' | 'autoPlayVoiceReplies', value: boolean) => void;
  onMediaAutonomyChange: (value: LocalChatProductSettings['mediaAutonomy']) => void;
  onVoiceAutonomyChange: (value: LocalChatProductSettings['voiceAutonomy']) => void;
  onVoiceConversationModeChange: (value: LocalChatProductSettings['voiceConversationMode']) => void;
  onVisualComfortLevelChange: (value: LocalChatProductSettings['visualComfortLevel']) => void;
  runtimeSidebarProps: RuntimeStatusSidebarProps;
};

function SegmentButton(props: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        props.active
          ? 'bg-mint-600 text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]'
          : 'bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {props.children}
    </button>
  );
}

function ToggleRow(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-mint-200 hover:bg-mint-50/40"
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">{props.label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{props.hint}</p>
      </div>
      <span
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors ${
          props.checked ? 'bg-mint-500 justify-end' : 'bg-gray-200 justify-start'
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  );
}

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5" />
  </svg>
);

function CollapsibleSection(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex h-9 w-full items-center justify-between px-3 text-left text-[11px] font-semibold text-gray-500"
      >
        <span>{props.title}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${props.open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      {props.open ? (
        <div className="px-3 pb-3 lc-panel-expand">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

// ── Inline Chat Route (replaces importing ChatRoutePanel with full model resolution) ──

function InlineChatRoute(props: { rsp: RuntimeStatusSidebarProps }) {
  const { t } = useModTranslation('local-chat');
  const { rsp } = props;
  const routeBinding = rsp.routeBinding || null;
  const chatRouteOptions = rsp.chatRouteOptions;
  const effectiveChatBinding: RuntimeRouteBinding | null = (
    routeBinding
    || chatRouteOptions?.selected
    || null
  );
  const activeChatSource = effectiveChatBinding?.source || 'local';
  const fallbackConnectorId = chatRouteOptions?.connectors[0]?.id || '';
  const activeChatConnectorId = activeChatSource === 'cloud'
    ? (effectiveChatBinding?.connectorId || fallbackConnectorId || '')
    : '';
  const activeChatConnector = chatRouteOptions?.connectors.find((c) => c.id === activeChatConnectorId)
    || chatRouteOptions?.connectors[0]
    || null;

  const chatModelOptions = useMemo(() => {
    const raw = activeChatSource === 'local'
      ? resolveLocalRuntimeModelsForScenario({
        models: chatRouteOptions?.local?.models || [],
        scenario: 'chat',
      }).map((m) => m.model)
      : resolveModelsForScenario({
        models: activeChatConnector?.models || [],
        modelCapabilities: activeChatConnector?.modelCapabilities,
        scenario: 'chat',
      });
    return dedupeModelIds(raw);
  }, [activeChatConnector?.modelCapabilities, activeChatConnector?.models, activeChatSource, chatRouteOptions?.local?.models]);

  const [chatModelQuery, setChatModelQuery] = useState(effectiveChatBinding?.model || '');
  const filteredChatModelOptions = useMemo(
    () => filterModelOptions(chatModelOptions, chatModelQuery),
    [chatModelOptions, chatModelQuery],
  );
  const hasPendingModelChange = String(chatModelQuery || '').trim() !== String(effectiveChatBinding?.model || '').trim();
  const showEmptyLocalCta = activeChatSource === 'local' && chatModelOptions.length === 0;
  const onClearRouteBinding = rsp.onClearRouteBinding || (() => {});

  const commitChatModelQuery = (query: string) => {
    const resolved = resolveCommittedChatModelQuery({
      source: activeChatSource,
      query,
      activeModel: effectiveChatBinding?.model || '',
      availableModels: chatModelOptions,
    });
    setChatModelQuery(resolved.nextQuery);
    if (resolved.nextModel) {
      rsp.onRouteModelChange(resolved.nextModel);
    }
  };

  const selectClassName = 'h-8 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs text-gray-900';

  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="mb-1 text-gray-500">{t('ChatRoute.source')}</p>
        <select
          value={activeChatSource}
          onChange={(e) => rsp.onRouteSourceChange(normalizeRuntimeRouteSource(e.target.value))}
          className={selectClassName}
        >
          <option value="local">Local</option>
          <option value="cloud">Cloud</option>
        </select>
      </div>
      <div>
        <p className="mb-1 text-gray-500">{t('ChatRoute.connector')}</p>
        <select
          value={activeChatConnectorId}
          disabled={activeChatSource !== 'cloud'}
          onChange={(e) => rsp.onRouteConnectorChange(e.target.value)}
          className={`${selectClassName} disabled:bg-gray-100 disabled:text-gray-400`}
        >
          <option value="">--</option>
          {(chatRouteOptions?.connectors || []).map((c) => (
            <option key={`rc-${c.id}`} value={c.id}>{c.label || c.id}</option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-1 text-gray-500">{t('ChatRoute.model')}</p>
        <input
          list="settings-chat-model-list"
          value={chatModelQuery}
          onChange={(e) => {
            setChatModelQuery(e.target.value);
            if (chatModelOptions.includes(e.target.value.trim())) {
              rsp.onRouteModelChange(e.target.value.trim());
            }
          }}
          onBlur={(e) => commitChatModelQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitChatModelQuery(chatModelQuery); } }}
          placeholder={t('ChatRoute.modelPlaceholder')}
          className={`h-8 w-full rounded-xl bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:ring-1 ${
            hasPendingModelChange
              ? 'border border-amber-300 focus:border-amber-400 focus:ring-amber-200'
              : 'border border-gray-200 focus:border-mint-500 focus:ring-mint-500'
          }`}
        />
        <datalist id="settings-chat-model-list">
          {filteredChatModelOptions.map((m) => (
            <option key={`scm-${m}`} value={m} />
          ))}
        </datalist>
        {hasPendingModelChange ? <p className="mt-1 text-[11px] text-amber-700">{t('ChatRoute.pendingModelHint')}</p> : null}
        {chatModelOptions.length === 0 ? <p className="mt-1 text-[11px] text-amber-700">{t('ChatRoute.noModels')}</p> : null}
      </div>
      {showEmptyLocalCta ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          {t('ChatRoute.emptyLocalHint')}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClearRouteBinding}
        className="lc-btn lc-btn-secondary h-8 w-full px-2 text-xs font-semibold"
      >
        {t('ChatRoute.useRuntimeDefault')}
      </button>
    </div>
  );
}

export const LocalChatSettingsDrawer = React.memo(function LocalChatSettingsDrawer(props: LocalChatSettingsDrawerProps) {
  const { t } = useModTranslation('local-chat');
  const {
    open,
    onClose,
    productSettings,
    enableVoice,
    onToggleProductSetting,
    onMediaAutonomyChange,
    onVoiceAutonomyChange,
    onVoiceConversationModeChange,
    onVisualComfortLevelChange,
    runtimeSidebarProps,
  } = props;

  const [chatRouteOpen, setChatRouteOpen] = React.useState(false);
  const [voiceRouteOpen, setVoiceRouteOpen] = React.useState(false);
  const [mediaRouteOpen, setMediaRouteOpen] = React.useState(false);
  const [hasOpened, setHasOpened] = React.useState(false);

  React.useEffect(() => {
    if (open && !hasOpened) setHasOpened(true);
  }, [open, hasOpened]);

  if (!hasOpened) return null;

  return (
    <div
      className={`absolute inset-y-0 right-0 z-30 w-[360px] max-w-[92vw] border-l border-white/70 bg-[#f8fbfb] shadow-[-8px_0_24px_rgba(15,23,42,0.08)] transition-transform duration-280 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t('SettingsDrawer.title')}</p>
            <p className="text-[11px] text-gray-500">{t('SettingsDrawer.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
            aria-label={t('SettingsDrawer.close')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4" style={{ willChange: 'transform' }}>
          {/* ── Chat Model ── */}
          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('SettingsDrawer.chatTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('SettingsDrawer.chatHint')}</p>
            </div>
            <CollapsibleSection
              title={t('SettingsDrawer.chatRouteConfig')}
              open={chatRouteOpen}
              onToggle={() => setChatRouteOpen((v) => !v)}
            >
              <InlineChatRoute rsp={runtimeSidebarProps} />
            </CollapsibleSection>
          </section>

          {/* ── Voice ── */}
          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('SettingsDrawer.voiceTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('SettingsDrawer.voiceHint')}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-500">{t('SettingsDrawer.voiceAutonomy')}</p>
              <div className="flex flex-wrap gap-2 rounded-2xl bg-[#eef5f5] p-1.5">
                <SegmentButton active={productSettings.voiceAutonomy === 'off'} onClick={() => onVoiceAutonomyChange('off')}>
                  {t('SettingsDrawer.voiceAutonomyOff')}
                </SegmentButton>
                <SegmentButton active={productSettings.voiceAutonomy === 'explicit-only'} onClick={() => onVoiceAutonomyChange('explicit-only')}>
                  {t('SettingsDrawer.voiceAutonomyExplicitOnly')}
                </SegmentButton>
                <SegmentButton active={productSettings.voiceAutonomy === 'natural'} onClick={() => onVoiceAutonomyChange('natural')}>
                  {t('SettingsDrawer.voiceAutonomyNatural')}
                </SegmentButton>
              </div>
            </div>
            <ToggleRow
              label={t('SettingsDrawer.voiceConversationMode')}
              hint={t('SettingsDrawer.voiceConversationModeHint')}
              checked={productSettings.voiceConversationMode === 'on'}
              onChange={(value) => onVoiceConversationModeChange(value ? 'on' : 'off')}
            />
            <ToggleRow
              label={t('SettingsDrawer.autoPlayVoiceReplies')}
              hint={t('SettingsDrawer.autoPlayVoiceRepliesHint')}
              checked={productSettings.autoPlayVoiceReplies}
              onChange={(value) => onToggleProductSetting('autoPlayVoiceReplies', value)}
            />
            <CollapsibleSection
              title={t('SettingsDrawer.voiceRouteConfig')}
              open={voiceRouteOpen}
              onToggle={() => setVoiceRouteOpen((v) => !v)}
            >
              <VoicePanel
                embedded
                open
                onToggle={() => {}}
                enableVoice={enableVoice}
                selectedVoiceId={runtimeSidebarProps.selectedVoiceId}
                ttsRouteSource={runtimeSidebarProps.ttsRouteSource}
                ttsConnectorId={runtimeSidebarProps.ttsConnectorId}
                ttsModel={runtimeSidebarProps.ttsModel}
                sttRouteSource={runtimeSidebarProps.sttRouteSource}
                sttConnectorId={runtimeSidebarProps.sttConnectorId}
                sttModel={runtimeSidebarProps.sttModel}
                ttsConnectors={runtimeSidebarProps.ttsConnectors}
                sttConnectors={runtimeSidebarProps.sttConnectors}
                localTtsRouteAvailable={runtimeSidebarProps.localTtsRouteAvailable}
                localSttRouteAvailable={runtimeSidebarProps.localSttRouteAvailable}
                speechVoices={runtimeSidebarProps.speechVoices}
                onVoiceIdChange={runtimeSidebarProps.onVoiceIdChange}
                onTtsRouteSourceChange={runtimeSidebarProps.onTtsRouteSourceChange}
                onTtsConnectorChange={runtimeSidebarProps.onTtsConnectorChange}
                onTtsModelChange={runtimeSidebarProps.onTtsModelChange}
                onSttRouteSourceChange={runtimeSidebarProps.onSttRouteSourceChange}
                onSttConnectorChange={runtimeSidebarProps.onSttConnectorChange}
                onSttModelChange={runtimeSidebarProps.onSttModelChange}
              />
            </CollapsibleSection>
          </section>

          {/* ── Visuals ── */}
          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('SettingsDrawer.mediaTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('SettingsDrawer.mediaHint')}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-500">{t('SettingsDrawer.mediaAutonomy')}</p>
              <div className="flex flex-wrap gap-2 rounded-2xl bg-[#eef5f5] p-1.5">
                <SegmentButton active={productSettings.mediaAutonomy === 'off'} onClick={() => onMediaAutonomyChange('off')}>
                  {t('SettingsDrawer.mediaAutonomyOff')}
                </SegmentButton>
                <SegmentButton active={productSettings.mediaAutonomy === 'explicit-only'} onClick={() => onMediaAutonomyChange('explicit-only')}>
                  {t('SettingsDrawer.mediaAutonomyExplicitOnly')}
                </SegmentButton>
                <SegmentButton active={productSettings.mediaAutonomy === 'natural'} onClick={() => onMediaAutonomyChange('natural')}>
                  {t('SettingsDrawer.mediaAutonomyNatural')}
                </SegmentButton>
              </div>
            </div>
            {productSettings.mediaAutonomy !== 'off' ? (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500">{t('SettingsDrawer.visualComfort')}</p>
                <div className="flex flex-wrap gap-2 rounded-2xl bg-[#eef5f5] p-1.5">
                  <SegmentButton active={productSettings.visualComfortLevel === 'restrained-visuals'} onClick={() => onVisualComfortLevelChange('restrained-visuals')}>
                    {t('SettingsDrawer.visualComfortRestrained')}
                  </SegmentButton>
                  <SegmentButton active={productSettings.visualComfortLevel === 'natural-visuals'} onClick={() => onVisualComfortLevelChange('natural-visuals')}>
                    {t('SettingsDrawer.visualComfortNatural')}
                  </SegmentButton>
                </div>
              </div>
            ) : null}
            <CollapsibleSection
              title={t('SettingsDrawer.mediaRouteConfig')}
              open={mediaRouteOpen}
              onToggle={() => setMediaRouteOpen((v) => !v)}
            >
              <MediaRoutePanel
                embedded
                open
                loading={runtimeSidebarProps.isMediaRuntimeSidebarLoading || false}
                onToggle={() => {}}
                imageRouteOptions={runtimeSidebarProps.imageRouteOptions}
                videoRouteOptions={runtimeSidebarProps.videoRouteOptions}
                imageResolvedRoute={runtimeSidebarProps.imageResolvedRoute || null}
                videoResolvedRoute={runtimeSidebarProps.videoResolvedRoute || null}
                isImageRouteProbeLoading={runtimeSidebarProps.isImageRouteProbeLoading || false}
                isVideoRouteProbeLoading={runtimeSidebarProps.isVideoRouteProbeLoading || false}
                imageRouteSource={runtimeSidebarProps.imageRouteSource}
                videoRouteSource={runtimeSidebarProps.videoRouteSource}
                imageConnectorId={runtimeSidebarProps.imageConnectorId}
                imageModel={runtimeSidebarProps.imageModel}
                videoConnectorId={runtimeSidebarProps.videoConnectorId}
                videoModel={runtimeSidebarProps.videoModel}
                imageConnectors={runtimeSidebarProps.imageConnectors}
                videoConnectors={runtimeSidebarProps.videoConnectors}
                onImageRouteSourceChange={runtimeSidebarProps.onImageRouteSourceChange}
                onImageConnectorChange={runtimeSidebarProps.onImageConnectorChange}
                onImageModelChange={runtimeSidebarProps.onImageModelChange}
                onVideoRouteSourceChange={runtimeSidebarProps.onVideoRouteSourceChange}
                onVideoConnectorChange={runtimeSidebarProps.onVideoConnectorChange}
                onVideoModelChange={runtimeSidebarProps.onVideoModelChange}
              />
            </CollapsibleSection>
          </section>

          {/* ── Presence ── */}
          <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{t('SettingsDrawer.presenceTitle')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('SettingsDrawer.presenceHint')}</p>
            </div>
            <ToggleRow
              label={t('SettingsDrawer.allowProactiveContact')}
              hint={t('SettingsDrawer.allowProactiveContactHint')}
              checked={productSettings.allowProactiveContact}
              onChange={(value) => onToggleProductSetting('allowProactiveContact', value)}
            />
          </section>
        </div>
      </div>
    </div>
  );
});
