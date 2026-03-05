import { useCallback, useEffect, useRef, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { useRuntimeModSettings } from '@nimiplatform/sdk/mod/settings';
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
};

type UseLocalChatSpeechSettingsInput = {
  hookClient: {
    llm: {
      speech: {
        listProviders: () => Promise<SpeechProvider[]>;
        listVoices: (input?: {
          providerId?: string;
          routeSource?: 'auto' | 'local-runtime' | 'token-api';
          connectorId?: string;
          model?: string;
        }) => Promise<SpeechVoice[]>;
      };
    };
  };
};

type VoiceQueryOverride = {
  providerId?: string;
  routeSource?: 'auto' | 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
};

export function useLocalChatSpeechSettings(input: UseLocalChatSpeechSettingsInput) {
  const [speechProviders, setSpeechProviders] = useState<SpeechProvider[]>([]);
  const [speechVoices, setSpeechVoices] = useState<SpeechVoice[]>([]);
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
    const providerId = String(override?.providerId || selectedSpeechProviderId || '').trim();
    if (routeSource === 'token-api') {
      return {
        routeSource: 'token-api' as const,
        connectorId: connectorId || undefined,
        model: model || undefined,
      };
    }
    if (providerId) {
      return { providerId };
    }
    return undefined;
  }, [
    defaultSettings.ttsRouteSource,
    defaultSettings.ttsConnectorId,
    defaultSettings.ttsModel,
    selectedSpeechProviderId,
  ]);

  const loadSpeechVoices = useCallback(async (override?: VoiceQueryOverride) => {
    const voiceInput = buildVoiceInput(override);
    const requestId = latestVoiceRequestRef.current + 1;
    latestVoiceRequestRef.current = requestId;
    try {
      const voices = await input.hookClient.llm.speech.listVoices(voiceInput ? { ...voiceInput } : undefined);
      if (requestId === latestVoiceRequestRef.current) {
        setSpeechVoices(voices);
      }
      return voices;
    } catch (error) {
      if (requestId === latestVoiceRequestRef.current) {
        setSpeechVoices([]);
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
  }, [input.hookClient.llm.speech, buildVoiceInput]);

  const loadSpeechCatalog = useCallback(async () => {
    try {
      const providers = await input.hookClient.llm.speech.listProviders();
      setSpeechProviders(providers);
      const preferredProviderId = providers[0]?.id || '';
      setSelectedSpeechProviderId((previous) => previous || preferredProviderId);
      const activeProviderId = String(selectedSpeechProviderId || preferredProviderId).trim();
      await loadSpeechVoices(activeProviderId ? { providerId: activeProviderId } : undefined);
    } catch (error) {
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
  }, [
    input.hookClient.llm.speech,
    selectedSpeechProviderId,
    loadSpeechVoices,
  ]);

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

  // Auto-select first voice when voice list changes and current selection is not in the list
  useEffect(() => {
    if (speechVoices.length === 0) return;
    const currentVoice = defaultSettings.voiceName;
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
