import { useCallback, useEffect, useRef, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { useRuntimeModSettings } from '@nimiplatform/sdk/mod/settings';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import {
  type LocalChatBooleanSettingKey,
  type LocalChatDefaultSettings,
  DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
  normalizeLocalChatDefaultSettings,
} from '../state/index.js';
import { LOCAL_CHAT_MOD_ID } from '../contracts.js';

type SpeechProvider = {
  id: string;
  name: string;
  status: 'available' | 'unavailable';
};

type SpeechVoice = {
  id: string;
  providerId: string;
  name: string;
  modelResolved?: string;
  voiceCatalogSource?: string;
  voiceCatalogVersion?: string;
};

type SpeechVoiceCatalogMeta = {
  modelResolved: string;
  voiceCatalogSource: string;
  voiceCatalogVersion: string;
  voiceCount: number;
};

type UseLocalChatSpeechSettingsInput = {
  runtimeClient: Pick<ModRuntimeClient, 'route' | 'media'>;
};

type VoiceQueryOverride = {
  routeSource?: 'auto' | 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
};

const MODEL_CATALOG_UPDATED_EVENT = 'nimi:runtime:model-catalog-updated';

export function useLocalChatSpeechSettings(input: UseLocalChatSpeechSettingsInput) {
  const [speechProviders, setSpeechProviders] = useState<SpeechProvider[]>([]);
  const [allSpeechVoices, setAllSpeechVoices] = useState<SpeechVoice[]>([]);
  const [speechVoices, setSpeechVoices] = useState<SpeechVoice[]>([]);
  const [speechVoiceCatalogMeta, setSpeechVoiceCatalogMeta] = useState<SpeechVoiceCatalogMeta>({
    modelResolved: '',
    voiceCatalogSource: '',
    voiceCatalogVersion: '',
    voiceCount: 0,
  });
  const [selectedSpeechProviderId, setSelectedSpeechProviderId] = useState('');
  const latestVoiceRequestRef = useRef(0);
  const {
    settings: defaultSettings,
    updateSettings,
  } = useRuntimeModSettings<LocalChatDefaultSettings>({
    modId: LOCAL_CHAT_MOD_ID,
    defaults: DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
    normalize: normalizeLocalChatDefaultSettings,
  });

  const buildVoiceInput = useCallback((override?: VoiceQueryOverride) => {
    const routeSource = (override?.routeSource || defaultSettings.ttsRouteSource);
    const connectorId = String(override?.connectorId || defaultSettings.ttsConnectorId || '').trim();
    const model = String(override?.model || defaultSettings.ttsModel || '').trim();
    if (routeSource === 'token-api') {
      return {
        routeSource: 'token-api' as const,
        connectorId: connectorId || undefined,
        model: model || undefined,
      };
    }
    return undefined;
  }, [
    defaultSettings.ttsRouteSource,
    defaultSettings.ttsConnectorId,
    defaultSettings.ttsModel,
  ]);

  const deriveSpeechProviders = useCallback((voices: SpeechVoice[]): SpeechProvider[] => {
    const seen = new Set<string>();
    const providers: SpeechProvider[] = [];
    for (const voice of voices) {
      const providerId = String(voice.providerId || '').trim();
      if (!providerId || seen.has(providerId)) {
        continue;
      }
      seen.add(providerId);
      providers.push({
        id: providerId,
        name: providerId,
        status: 'available',
      });
    }
    return providers;
  }, []);

  const filterVisibleVoices = useCallback((voices: SpeechVoice[], providerId: string, override?: VoiceQueryOverride) => {
    const routeSource = String(override?.routeSource || defaultSettings.ttsRouteSource || '').trim();
    if (routeSource === 'token-api') {
      return voices;
    }
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) {
      return voices;
    }
    return voices.filter((voice) => String(voice.providerId || '').trim() === normalizedProviderId);
  }, [defaultSettings.ttsRouteSource]);

  const loadSpeechVoices = useCallback(async (override?: VoiceQueryOverride) => {
    const voiceInput = buildVoiceInput(override);
    const requestId = latestVoiceRequestRef.current + 1;
    latestVoiceRequestRef.current = requestId;
    try {
      const binding = voiceInput
        ? {
          source: voiceInput.routeSource,
          connectorId: voiceInput.connectorId || '',
          model: voiceInput.model || '',
        }
        : undefined;
      const [resolved, listed] = await Promise.all([
        input.runtimeClient.route.resolve({
          capability: 'audio.synthesize',
          binding,
        }),
        input.runtimeClient.media.tts.listVoices({
          binding,
          model: String(voiceInput?.model || '').trim() || undefined,
        }),
      ]);
      const voices: SpeechVoice[] = listed.voices.map((voice) => ({
        id: voice.voiceId,
        providerId: resolved.provider,
        name: voice.name,
        modelResolved: listed.modelResolved,
        voiceCatalogSource: listed.voiceCatalogSource,
        voiceCatalogVersion: listed.voiceCatalogVersion,
      }));
      if (requestId === latestVoiceRequestRef.current) {
        const providers = deriveSpeechProviders(voices);
        const nextProviderId = String(selectedSpeechProviderId || providers[0]?.id || '').trim();
        const visibleVoices = filterVisibleVoices(voices, nextProviderId, override);
        setAllSpeechVoices(voices);
        setSpeechProviders(providers);
        setSpeechVoices(visibleVoices);
        setSelectedSpeechProviderId((previous) => {
          const current = String(previous || '').trim();
          if (current && providers.some((provider) => provider.id === current)) {
            return current;
          }
          return nextProviderId;
        });
        const representative = voices[0] || null;
        const configuredModel = String(
          override?.model
          || voiceInput?.model
          || defaultSettings.ttsModel
          || '',
        ).trim();
        setSpeechVoiceCatalogMeta({
          modelResolved: String(representative?.modelResolved || configuredModel || '').trim(),
          voiceCatalogSource: String(representative?.voiceCatalogSource || '').trim(),
          voiceCatalogVersion: String(representative?.voiceCatalogVersion || '').trim(),
          voiceCount: voices.length,
        });
      }
      return voices;
    } catch (error) {
      if (requestId === latestVoiceRequestRef.current) {
        setAllSpeechVoices([]);
        setSpeechProviders([]);
        setSpeechVoices([]);
        setSpeechVoiceCatalogMeta({
          modelResolved: String(
            override?.model
            || voiceInput?.model
            || defaultSettings.ttsModel
            || '',
          ).trim(),
          voiceCatalogSource: '',
          voiceCatalogVersion: '',
          voiceCount: 0,
        });
      }
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:speech-voices:failed',
        details: {
          voiceInput: voiceInput || null,
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
      return [];
    }
  }, [
    input.runtimeClient,
    buildVoiceInput,
    defaultSettings.ttsModel,
    deriveSpeechProviders,
    filterVisibleVoices,
    selectedSpeechProviderId,
  ]);

  const loadSpeechCatalog = useCallback(async () => {
    try {
      await loadSpeechVoices();
    } catch (error) {
      setAllSpeechVoices([]);
      setSpeechProviders([]);
      setSpeechVoices([]);
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:speech-catalog:failed',
        details: {
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    }
  }, [loadSpeechVoices]);

  useEffect(() => {
    void loadSpeechCatalog();
  }, [loadSpeechCatalog]);

  useEffect(() => {
    let cancelled = false;
    void loadSpeechVoices().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [
    loadSpeechVoices,
    defaultSettings.ttsRouteSource,
    defaultSettings.ttsConnectorId,
    defaultSettings.ttsModel,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const onCatalogUpdated = () => {
      void loadSpeechVoices();
    };
    window.addEventListener(MODEL_CATALOG_UPDATED_EVENT, onCatalogUpdated as EventListener);
    return () => {
      window.removeEventListener(MODEL_CATALOG_UPDATED_EVENT, onCatalogUpdated as EventListener);
    };
  }, [loadSpeechVoices]);

  useEffect(() => {
    setSpeechVoices(filterVisibleVoices(allSpeechVoices, selectedSpeechProviderId));
  }, [allSpeechVoices, filterVisibleVoices, selectedSpeechProviderId]);

  // Auto-select first voice when voice list changes and current selection is not in the list
  useEffect(() => {
    const currentVoice = defaultSettings.voiceName;
    if (speechVoices.length === 0) {
      if (currentVoice) {
        updateSettings((previous) => ({
          ...previous,
          voiceName: '',
        }));
      }
      return;
    }
    const exists = speechVoices.some((v) => v.id === currentVoice);
    if (!exists) {
      updateSettings((previous) => ({
        ...previous,
        voiceName: speechVoices[0]?.id ?? '',
      }));
    }
  }, [speechVoices, defaultSettings.voiceName, updateSettings]);

  const handleSpeechProviderChange = useCallback((providerId: string) => {
    setSelectedSpeechProviderId(providerId);
  }, []);

  const handleVoiceIdChange = useCallback((voiceId: string) => {
    updateSettings((previous) => ({
      ...previous,
      voiceName: voiceId,
    }));
  }, [updateSettings]);

  const handleDefaultSettingChange = useCallback((
    key: LocalChatBooleanSettingKey,
    value: boolean,
  ) => {
    updateSettings((previous) => ({
      ...previous,
      [key]: value,
    }));
  }, [updateSettings]);

  const handleDefaultVoiceNameChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      voiceName: value,
    }));
  }, [updateSettings]);

  const handleTtsRouteSourceChange = useCallback((value: 'auto' | 'local-runtime' | 'token-api') => {
    updateSettings((previous) => ({
      ...previous,
      ttsRouteSource: value,
    }));
  }, [updateSettings]);

  const handleTtsConnectorChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      ttsConnectorId: value,
    }));
  }, [updateSettings]);

  const handleTtsModelChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      ttsModel: value,
    }));
  }, [updateSettings]);

  const handleSttRouteSourceChange = useCallback((value: 'auto' | 'local-runtime' | 'token-api') => {
    updateSettings((previous) => ({
      ...previous,
      sttRouteSource: value,
    }));
  }, [updateSettings]);

  const handleSttConnectorChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      sttConnectorId: value,
    }));
  }, [updateSettings]);

  const handleSttModelChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      sttModel: value,
    }));
  }, [updateSettings]);

  const handleImageRouteSourceChange = useCallback((value: 'auto' | 'local-runtime' | 'token-api') => {
    updateSettings((previous) => ({
      ...previous,
      imageRouteSource: value,
    }));
  }, [updateSettings]);

  const handleImageConnectorChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      imageConnectorId: value,
    }));
  }, [updateSettings]);

  const handleImageModelChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      imageModel: value,
    }));
  }, [updateSettings]);

  const handleVideoRouteSourceChange = useCallback((value: 'auto' | 'local-runtime' | 'token-api') => {
    updateSettings((previous) => ({
      ...previous,
      videoRouteSource: value,
    }));
  }, [updateSettings]);

  const handleVideoConnectorChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      videoConnectorId: value,
    }));
  }, [updateSettings]);

  const handleVideoModelChange = useCallback((value: string) => {
    updateSettings((previous) => ({
      ...previous,
      videoModel: value,
    }));
  }, [updateSettings]);

  return {
    speechProviders,
    speechVoices,
    speechVoiceCatalogMeta,
    selectedSpeechProviderId,
    defaultSettings,
    loadSpeechCatalog,
    loadSpeechVoices,
    handleSpeechProviderChange,
    handleVoiceIdChange,
    handleDefaultSettingChange,
    handleDefaultVoiceNameChange,
    handleTtsRouteSourceChange,
    handleTtsConnectorChange,
    handleTtsModelChange,
    handleSttRouteSourceChange,
    handleSttConnectorChange,
    handleSttModelChange,
    handleImageRouteSourceChange,
    handleImageConnectorChange,
    handleImageModelChange,
    handleVideoRouteSourceChange,
    handleVideoConnectorChange,
    handleVideoModelChange,
  };
}
