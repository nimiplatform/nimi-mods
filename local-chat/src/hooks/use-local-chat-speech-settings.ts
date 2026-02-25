import { useCallback, useEffect, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/mod-sdk/logging';
import { useRuntimeModSettings } from '@nimiplatform/mod-sdk/settings';
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
        listVoices: (input?: { providerId?: string; routeSource?: 'auto' | 'local-runtime' | 'token-api'; connectorId?: string }) => Promise<SpeechVoice[]>;
      };
    };
  };
};

export function useLocalChatSpeechSettings(input: UseLocalChatSpeechSettingsInput) {
  const [speechProviders, setSpeechProviders] = useState<SpeechProvider[]>([]);
  const [speechVoices, setSpeechVoices] = useState<SpeechVoice[]>([]);
  const [selectedSpeechProviderId, setSelectedSpeechProviderId] = useState('');
  const {
    settings: defaultSettings,
    updateSettings,
  } = useRuntimeModSettings<LocalChatDefaultSettings>({
    modId: LOCAL_CHAT_MOD_ID,
    defaults: DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
    normalize: normalizeLocalChatDefaultSettings,
  });

  const loadSpeechCatalog = useCallback(async () => {
    try {
      const providers = await input.hookClient.llm.speech.listProviders();
      setSpeechProviders(providers);
      const preferredProviderId = providers[0]?.id || '';
      setSelectedSpeechProviderId((previous) => previous || preferredProviderId);
      const voices = await input.hookClient.llm.speech.listVoices({
        providerId: preferredProviderId || undefined,
      });
      setSpeechVoices(voices);
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
  }, [input.hookClient.llm.speech]);

  useEffect(() => {
    void loadSpeechCatalog();
  }, [loadSpeechCatalog]);

  useEffect(() => {
    let cancelled = false;
    const ttsRouteSource = defaultSettings.ttsRouteSource;
    const ttsConnectorId = defaultSettings.ttsConnectorId;
    const voiceInput = ttsRouteSource === 'token-api' && ttsConnectorId
      ? { routeSource: ttsRouteSource as 'token-api', connectorId: ttsConnectorId }
      : selectedSpeechProviderId
        ? { providerId: selectedSpeechProviderId }
        : undefined;
    void input.hookClient.llm.speech.listVoices(voiceInput).then((voices) => {
      if (cancelled) return;
      setSpeechVoices(voices);
    }).catch(() => {
      if (cancelled) return;
      setSpeechVoices([]);
    });
    return () => {
      cancelled = true;
    };
  }, [input.hookClient.llm.speech, selectedSpeechProviderId, defaultSettings.ttsRouteSource, defaultSettings.ttsConnectorId]);

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

  return {
    speechProviders,
    speechVoices,
    selectedSpeechProviderId,
    defaultSettings,
    loadSpeechCatalog,
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
  };
}
