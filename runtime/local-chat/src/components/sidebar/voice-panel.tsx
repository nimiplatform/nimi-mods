import React, { useMemo, useState } from 'react';
import { useShellNavigation } from '@nimiplatform/sdk/mod/shell';
import { resolveModelsForScenario } from '../../services/route/connector-model-capabilities.js';
import { useModTranslation, filterModelOptions } from "@nimiplatform/sdk/mod";
type Props = {
    open: boolean;
    onToggle: () => void;
    embedded?: boolean;
    enableVoice: boolean;
    selectedVoiceId: string;
    ttsRouteSource: 'auto' | 'local' | 'cloud';
    ttsConnectorId: string;
    ttsModel: string;
    sttRouteSource: 'auto' | 'local' | 'cloud';
    sttConnectorId: string;
    sttModel: string;
    ttsConnectors: Array<{
        id: string;
        label: string;
        models: string[];
        modelCapabilities?: Record<string, string[]>;
    }>;
    sttConnectors: Array<{
        id: string;
        label: string;
        models: string[];
        modelCapabilities?: Record<string, string[]>;
    }>;
    localTtsRouteAvailable: boolean;
    localSttRouteAvailable: boolean;
    speechVoices: Array<{
        id: string;
        name: string;
    }>;
    onVoiceIdChange: (voiceId: string) => void;
    onTtsRouteSourceChange: (source: 'auto' | 'local' | 'cloud') => void;
    onTtsConnectorChange: (connectorId: string) => void;
    onTtsModelChange: (model: string) => void;
    onSttRouteSourceChange: (source: 'auto' | 'local' | 'cloud') => void;
    onSttConnectorChange: (connectorId: string) => void;
    onSttModelChange: (model: string) => void;
};
export type VoicePanelVoiceOption = {
    id: string;
    name: string;
};
export function buildVoiceOptionItems(voices: VoicePanelVoiceOption[]): Array<{
    key: string;
    value: string;
    label: string;
}> {
    return voices.map((voice) => ({
        key: `voice-option-${voice.id}`,
        value: voice.id,
        label: voice.name,
    }));
}
const selectClassName = 'h-8 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400';
const inputClassName = 'h-8 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition-colors focus:border-mint-500 focus:ring-1 focus:ring-mint-500 disabled:bg-gray-100 disabled:text-gray-400';
const CHEVRON_ICON = (<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5"/>
  </svg>);
export function VoicePanel(props: Props) {
    const { t } = useModTranslation('local-chat');
    const { setActiveTab } = useShellNavigation();
    const { open, onToggle, enableVoice, selectedVoiceId, ttsRouteSource, ttsConnectorId, ttsModel, sttRouteSource, sttConnectorId, sttModel, ttsConnectors, sttConnectors, localTtsRouteAvailable, localSttRouteAvailable, speechVoices, onVoiceIdChange, onTtsRouteSourceChange, onTtsConnectorChange, onTtsModelChange, onSttRouteSourceChange, onSttConnectorChange, onSttModelChange, } = props;
    const [ttsModelQuery, setTtsModelQuery] = useState(ttsModel);
    const [sttModelQuery, setSttModelQuery] = useState(sttModel);
    const ttsConnectorModels = useMemo(() => {
        if (!ttsConnectorId)
            return [];
        const connector = ttsConnectors.find((c) => c.id === ttsConnectorId);
        if (!connector)
            return [];
        return resolveModelsForScenario({
            models: connector.models || [],
            modelCapabilities: connector.modelCapabilities,
            scenario: 'audio.synthesize',
        });
    }, [ttsConnectors, ttsConnectorId]);
    const sttConnectorModels = useMemo(() => {
        if (!sttConnectorId)
            return [];
        const connector = sttConnectors.find((c) => c.id === sttConnectorId);
        if (!connector)
            return [];
        return resolveModelsForScenario({
            models: connector.models || [],
            modelCapabilities: connector.modelCapabilities,
            scenario: 'audio.transcribe',
        });
    }, [sttConnectors, sttConnectorId]);
    const filteredTtsModels = useMemo(() => filterModelOptions(ttsConnectorModels, ttsModelQuery), [ttsConnectorModels, ttsModelQuery]);
    const filteredSttModels = useMemo(() => filterModelOptions(sttConnectorModels, sttModelQuery), [sttConnectorModels, sttModelQuery]);
    const voiceOptions = useMemo(() => buildVoiceOptionItems(speechVoices), [speechVoices]);
    const content = (<div className="min-h-0 lc-panel-expand">
      <p className="text-[11px] text-gray-600">
        {enableVoice ? t('VoicePanel.enabledNote') : t('VoicePanel.disabledNote')}
      </p>
          <div className="mt-3 space-y-2">
            {/* ── TTS Section ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.ttsRouteSource')}</p>
              <select value={ttsRouteSource} disabled={!enableVoice} onChange={(event) => onTtsRouteSourceChange(event.target.value === 'local'
            ? 'local'
            : event.target.value === 'cloud'
                ? 'cloud'
                : 'auto')} className={selectClassName}>
                <option value="auto">{t('VoicePanel.routeAuto')}</option>
                <option value="local">{t('MediaRoute.local')}</option>
                <option value="cloud">{t('MediaRoute.cloud')}</option>
              </select>
            </div>

            {ttsRouteSource === 'cloud' ? (<>
                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.ttsConnector')}</p>
                  <select value={ttsConnectorId} disabled={!enableVoice} onChange={(event) => onTtsConnectorChange(event.target.value)} className={selectClassName}>
                    <option value="">{t('VoicePanel.auto')}</option>
                    {ttsConnectors.map((connector) => (<option key={`tts-connector-${connector.id}`} value={connector.id}>
                        {connector.label || connector.id}
                      </option>))}
                  </select>
                </div>

                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.ttsModel')}</p>
                  <input list="voice-panel-tts-model-list" value={ttsModelQuery} disabled={!enableVoice || !ttsConnectorId} onChange={(event) => {
                const nextValue = event.target.value;
                setTtsModelQuery(nextValue);
                if (ttsConnectorModels.includes(nextValue)) {
                    onTtsModelChange(nextValue);
                }
            }} placeholder={t('VoicePanel.modelPlaceholder')} className={inputClassName}/>
                  <datalist id="voice-panel-tts-model-list">
                    {filteredTtsModels.map((m) => (<option key={`tts-model-${m}`} value={m}/>))}
                  </datalist>
                  {ttsConnectorModels.length === 0 && ttsConnectorId ? (<p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noModels')}</p>) : null}
                  {ttsConnectorModels.length > 0 && filteredTtsModels.length === 0 ? (<p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noMatchingModels')}</p>) : null}
                </div>
              </>) : null}

            {/* ── STT Section ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.sttRouteSource')}</p>
              <select value={sttRouteSource} disabled={!enableVoice} onChange={(event) => onSttRouteSourceChange(event.target.value === 'local'
            ? 'local'
            : event.target.value === 'cloud'
                ? 'cloud'
                : 'auto')} className={selectClassName}>
                <option value="auto">{t('VoicePanel.routeAuto')}</option>
                <option value="local">{t('MediaRoute.local')}</option>
                <option value="cloud">{t('MediaRoute.cloud')}</option>
              </select>
            </div>

            {sttRouteSource === 'cloud' ? (<>
                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.sttConnector')}</p>
                  <select value={sttConnectorId} disabled={!enableVoice} onChange={(event) => onSttConnectorChange(event.target.value)} className={selectClassName}>
                    <option value="">{t('VoicePanel.auto')}</option>
                    {sttConnectors.map((connector) => (<option key={`stt-connector-${connector.id}`} value={connector.id}>
                        {connector.label || connector.id}
                      </option>))}
                  </select>
                </div>

                <div>
                  <p className="mb-1 text-gray-500">{t('VoicePanel.sttModel')}</p>
                  <input list="voice-panel-stt-model-list" value={sttModelQuery} disabled={!enableVoice || !sttConnectorId} onChange={(event) => {
                const nextValue = event.target.value;
                setSttModelQuery(nextValue);
                if (sttConnectorModels.includes(nextValue)) {
                    onSttModelChange(nextValue);
                }
            }} placeholder={t('VoicePanel.modelPlaceholder')} className={inputClassName}/>
                  <datalist id="voice-panel-stt-model-list">
                    {filteredSttModels.map((m) => (<option key={`stt-model-${m}`} value={m}/>))}
                  </datalist>
                  {sttConnectorModels.length === 0 && sttConnectorId ? (<p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noModels')}</p>) : null}
                  {sttConnectorModels.length > 0 && filteredSttModels.length === 0 ? (<p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noMatchingModels')}</p>) : null}
                </div>
              </>) : null}

            {/* ── Voice ── */}
            <div>
              <p className="mb-1 text-gray-500">{t('VoicePanel.voice')}</p>
              <select value={selectedVoiceId} disabled={!enableVoice} onChange={(event) => onVoiceIdChange(event.target.value)} className={selectClassName}>
                {voiceOptions.map((voice) => (<option key={voice.key} value={voice.value}>
                    {voice.label}
                  </option>))}
              </select>
              {speechVoices.length === 0 ? (<p className="mt-1 text-[11px] text-amber-700">{t('VoicePanel.noVoices')}</p>) : null}
            </div>

            {/* ── Warnings ── */}
            {ttsRouteSource === 'local' && !localTtsRouteAvailable ? (<div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="text-[11px] text-amber-800">{t('VoicePanel.noLocalTtsRoute')}</p>
                <div className="flex gap-2">
                  <button type="button" className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium" onClick={() => setActiveTab('runtime')}>
                    {t('VoicePanel.goRuntime')}
                  </button>
                  <button type="button" className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium" onClick={() => onTtsRouteSourceChange('cloud')}>
                    {t('VoicePanel.useCloud')}
                  </button>
                </div>
              </div>) : null}

            {sttRouteSource === 'local' && !localSttRouteAvailable ? (<div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
                <p className="text-[11px] text-amber-800">{t('VoicePanel.noLocalSttRoute')}</p>
                <div className="flex gap-2">
                  <button type="button" className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium" onClick={() => setActiveTab('runtime')}>
                    {t('VoicePanel.goRuntime')}
                  </button>
                  <button type="button" className="lc-btn lc-btn-warning h-7 px-2 text-[11px] font-medium" onClick={() => onSttRouteSourceChange('cloud')}>
                    {t('VoicePanel.useCloud')}
                  </button>
                </div>
              </div>) : null}
          </div>
    </div>);
    if (props.embedded) {
        return <div className="text-xs">{content}</div>;
    }
    return (<div className="lc-card rounded-2xl p-3 text-xs">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex h-7 w-full items-center justify-between text-left text-[13px] font-semibold text-gray-700">
        <span>{t('VoicePanel.title')}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      {open ? <div className="mt-3">{content}</div> : null}
    </div>);
}
