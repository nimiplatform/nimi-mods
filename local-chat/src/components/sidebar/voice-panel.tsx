import React, { useMemo, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { filterModelOptions } from '@nimiplatform/sdk/mod/model-options';

type Props = {
  open: boolean;
  onToggle: () => void;
  enableVoice: boolean;
  selectedSpeechProviderId: string;
  selectedVoiceId: string;
  ttsRouteSource: 'auto' | 'local-runtime' | 'token-api';
  ttsConnectorId: string;
  ttsModel: string;
  sttRouteSource: 'auto' | 'local-runtime' | 'token-api';
  sttConnectorId: string;
  sttModel: string;
  connectors: Array<{ id: string; label: string; models: string[] }>;
  localTtsRouteAvailable: boolean;
  localSttRouteAvailable: boolean;
  speechProviders: Array<{ id: string; name: string; status: 'available' | 'unavailable' }>;
  visibleSpeechVoices: Array<{ id: string; providerId: string; name: string }>;
  onSpeechProviderChange: (providerId: string) => void;
  onVoiceIdChange: (voiceId: string) => void;
  onTtsRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onTtsConnectorChange: (connectorId: string) => void;
  onTtsModelChange: (model: string) => void;
  onSttRouteSourceChange: (source: 'auto' | 'local-runtime' | 'token-api') => void;
  onSttConnectorChange: (connectorId: string) => void;
  onSttModelChange: (model: string) => void;
};

const selectClassName = 'h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400';
const inputClassName = 'h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-green-500 focus:ring-1 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-400';

export function VoicePanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const setActiveTab = useAppStore((state) => (state as { setActiveTab: (tab: string) => void }).setActiveTab);
  const {
    open,
    onToggle,
    enableVoice,
    selectedSpeechProviderId,
    selectedVoiceId,
    ttsRouteSource,
    ttsConnectorId,
    ttsModel,
    sttRouteSource,
    sttConnectorId,
    sttModel,
    connectors,
    localTtsRouteAvailable,
    localSttRouteAvailable,
    speechProviders,
    visibleSpeechVoices,
    onSpeechProviderChange,
    onVoiceIdChange,
    onTtsRouteSourceChange,
    onTtsConnectorChange,
    onTtsModelChange,
    onSttRouteSourceChange,
    onSttConnectorChange,
    onSttModelChange,
  } = props;

  const [ttsModelQuery, setTtsModelQuery] = useState(ttsModel);
  const [sttModelQuery, setSttModelQuery] = useState(sttModel);

  const ttsConnectorModels = useMemo(() => {
    if (!ttsConnectorId) return [];
    return connectors.find((c) => c.id === ttsConnectorId)?.models || [];
  }, [connectors, ttsConnectorId]);

  const sttConnectorModels = useMemo(() => {
    if (!sttConnectorId) return [];
    return connectors.find((c) => c.id === sttConnectorId)?.models || [];
  }, [connectors, sttConnectorId]);

  const filteredTtsModels = useMemo(
    () => filterModelOptions(ttsConnectorModels, ttsModelQuery),
    [ttsConnectorModels, ttsModelQuery],
  );

  const filteredSttModels = useMemo(
    () => filterModelOptions(sttConnectorModels, sttModelQuery),
    [sttConnectorModels, sttModelQuery],
  );

  return (
    <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-gray-700 font-medium"
      >
        <span>{t('VoicePanel.title')}</span>
        <span>{open ? '-' : '+'}</span>
      </button>
      {open ? (
        <>
          <p className="mt-2 text-[11px] text-gray-600">
            {enableVoice ? t('VoicePanel.enabledNote') : t('VoicePanel.disabledNote')}
          </p>
          <div className="mt-3 space-y-2">
            {/* ── TTS Section ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.ttsRouteSource')}</p>
              <select
                value={ttsRouteSource}
                disabled={!enableVoice}
                onChange={(event) => onTtsRouteSourceChange(
                  event.target.value === 'local-runtime'
                    ? 'local-runtime'
                    : event.target.value === 'token-api'
                      ? 'token-api'
                      : 'auto',
                )}
                className={selectClassName}
              >
                <option value="auto">{t('VoicePanel.routeAuto')}</option>
                <option value="local-runtime">Local Runtime</option>
                <option value="token-api">Token API</option>
              </select>
            </div>

            {ttsRouteSource === 'token-api' ? (
              <>
                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.ttsConnector')}</p>
                  <select
                    value={ttsConnectorId}
                    disabled={!enableVoice}
                    onChange={(event) => onTtsConnectorChange(event.target.value)}
                    className={selectClassName}
                  >
                    <option value="">{t('VoicePanel.auto')}</option>
                    {connectors.map((connector) => (
                      <option key={`tts-connector-${connector.id}`} value={connector.id}>
                        {connector.label || connector.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.ttsModel')}</p>
                  <input
                    list="voice-panel-tts-model-list"
                    value={ttsModelQuery}
                    disabled={!enableVoice || !ttsConnectorId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setTtsModelQuery(nextValue);
                      if (ttsConnectorModels.includes(nextValue)) {
                        onTtsModelChange(nextValue);
                      }
                    }}
                    placeholder={t('VoicePanel.modelPlaceholder')}
                    className={inputClassName}
                  />
                  <datalist id="voice-panel-tts-model-list">
                    {filteredTtsModels.map((m) => (
                      <option key={`tts-model-${m}`} value={m} />
                    ))}
                  </datalist>
                  {ttsConnectorModels.length === 0 && ttsConnectorId ? (
                    <p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noModels')}</p>
                  ) : null}
                  {ttsConnectorModels.length > 0 && filteredTtsModels.length === 0 ? (
                    <p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noMatchingModels')}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {/* ── STT Section ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.sttRouteSource')}</p>
              <select
                value={sttRouteSource}
                disabled={!enableVoice}
                onChange={(event) => onSttRouteSourceChange(
                  event.target.value === 'local-runtime'
                    ? 'local-runtime'
                    : event.target.value === 'token-api'
                      ? 'token-api'
                      : 'auto',
                )}
                className={selectClassName}
              >
                <option value="auto">{t('VoicePanel.routeAuto')}</option>
                <option value="local-runtime">Local Runtime</option>
                <option value="token-api">Token API</option>
              </select>
            </div>

            {sttRouteSource === 'token-api' ? (
              <>
                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.sttConnector')}</p>
                  <select
                    value={sttConnectorId}
                    disabled={!enableVoice}
                    onChange={(event) => onSttConnectorChange(event.target.value)}
                    className={selectClassName}
                  >
                    <option value="">{t('VoicePanel.auto')}</option>
                    {connectors.map((connector) => (
                      <option key={`stt-connector-${connector.id}`} value={connector.id}>
                        {connector.label || connector.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.sttModel')}</p>
                  <input
                    list="voice-panel-stt-model-list"
                    value={sttModelQuery}
                    disabled={!enableVoice || !sttConnectorId}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSttModelQuery(nextValue);
                      if (sttConnectorModels.includes(nextValue)) {
                        onSttModelChange(nextValue);
                      }
                    }}
                    placeholder={t('VoicePanel.modelPlaceholder')}
                    className={inputClassName}
                  />
                  <datalist id="voice-panel-stt-model-list">
                    {filteredSttModels.map((m) => (
                      <option key={`stt-model-${m}`} value={m} />
                    ))}
                  </datalist>
                  {sttConnectorModels.length === 0 && sttConnectorId ? (
                    <p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noModels')}</p>
                  ) : null}
                  {sttConnectorModels.length > 0 && filteredSttModels.length === 0 ? (
                    <p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noMatchingModels')}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {/* ── Provider (non-token-api) ── */}
            {ttsRouteSource !== 'token-api' ? (
              <div>
                <p className="mb-1 text-gray-500">{t('VoicePanel.provider')}</p>
                <select
                  value={selectedSpeechProviderId}
                  disabled={!enableVoice}
                  onChange={(event) => onSpeechProviderChange(event.target.value)}
                  className={selectClassName}
                >
                  <option value="">{t('VoicePanel.auto')}</option>
                  {speechProviders.map((provider) => (
                    <option key={`speech-provider-${provider.id}`} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* ── Voice ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.voice')}</p>
              <select
                value={selectedVoiceId}
                disabled={!enableVoice}
                onChange={(event) => onVoiceIdChange(event.target.value)}
                className={selectClassName}
              >
                {visibleSpeechVoices.map((voice) => (
                  <option key={`voice-option-${voice.providerId}-${voice.id}`} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
              {visibleSpeechVoices.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noVoices')}</p>
              ) : null}
            </div>

            {/* ── Warnings ── */}
            {ttsRouteSource === 'local-runtime' && !localTtsRouteAvailable ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="text-[11px] text-amber-800">{t('VoicePanel.noLocalTtsRoute')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => setActiveTab('runtime')}
                  >
                    {t('VoicePanel.goRuntime')}
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => onTtsRouteSourceChange('token-api')}
                  >
                    {t('VoicePanel.useTokenApi')}
                  </button>
                </div>
              </div>
            ) : null}

            {sttRouteSource === 'local-runtime' && !localSttRouteAvailable ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="text-[11px] text-amber-800">{t('VoicePanel.noLocalSttRoute')}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => setActiveTab('runtime')}
                  >
                    {t('VoicePanel.goRuntime')}
                  </button>
                  <button
                    type="button"
                    className="h-7 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-medium text-amber-800"
                    onClick={() => onSttRouteSourceChange('token-api')}
                  >
                    {t('VoicePanel.useTokenApi')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
