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

type SpeechVoice = {
  id: string;
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

function createEmptySpeechVoiceCatalogMeta(): SpeechVoiceCatalogMeta {
  return {
    modelResolved: '',
    voiceCatalogSource: '',
    voiceCatalogVersion: '',
    voiceCount: 0,
  };
}

export function shouldLoadSpeechVoices(input: {
  enableVoice: boolean;
  model?: string;
}): boolean {
  if (!input.enableVoice) {
    return false;
  }
  return Boolean(String(input.model || '').trim());
}

export function useLocalChatSpeechSettings(input: UseLocalChatSpeechSettingsInput) {
  const [speechVoices, setSpeechVoices] = useState<SpeechVoice[]>([]);
  const [speechVoiceCatalogMeta, setSpeechVoiceCatalogMeta] = useState<SpeechVoiceCatalogMeta>(
    createEmptySpeechVoiceCatalogMeta(),
  );
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
    return {
      routeSource,
      connectorId: connectorId || undefined,
      model: model || undefined,
    };
  }, [
    defaultSettings.ttsRouteSource,
    defaultSettings.ttsConnectorId,
    defaultSettings.ttsModel,
  ]);

  const loadSpeechVoices = useCallback(async (override?: VoiceQueryOverride) => {
    if (!defaultSettings.enableVoice) {
      setSpeechVoices([]);
      setSpeechVoiceCatalogMeta(createEmptySpeechVoiceCatalogMeta());
      return [];
    }
    const voiceInput = buildVoiceInput(override);
    const requestId = latestVoiceRequestRef.current + 1;
    latestVoiceRequestRef.current = requestId;
    const binding = (
      voiceInput.routeSource === 'token-api' || voiceInput.routeSource === 'local-runtime'
    ) ? {
      source: voiceInput.routeSource,
      connectorId: voiceInput.connectorId || '',
      model: voiceInput.model || '',
    } : undefined;
    const model = String(voiceInput.model || '').trim() || undefined;
    if (!shouldLoadSpeechVoices({
      enableVoice: defaultSettings.enableVoice,
      model,
    })) {
      if (requestId === latestVoiceRequestRef.current) {
        setSpeechVoices([]);
        setSpeechVoiceCatalogMeta(createEmptySpeechVoiceCatalogMeta());
      }
      return [];
    }
    try {
      const listed = await input.runtimeClient.media.tts.listVoices({
        binding,
        model,
      });
      const voices: SpeechVoice[] = listed.voices.map((voice) => ({
        id: voice.voiceId,
        name: voice.name,
        modelResolved: listed.modelResolved,
        voiceCatalogSource: listed.voiceCatalogSource,
        voiceCatalogVersion: listed.voiceCatalogVersion,
      }));
      if (requestId === latestVoiceRequestRef.current) {
        const representative = voices[0] || null;
        setSpeechVoices(voices);
        setSpeechVoiceCatalogMeta({
          modelResolved: String(representative?.modelResolved || model || '').trim(),
          voiceCatalogSource: String(representative?.voiceCatalogSource || '').trim(),
          voiceCatalogVersion: String(representative?.voiceCatalogVersion || '').trim(),
          voiceCount: voices.length,
        });
      }
      return voices;
    } catch (error) {
      if (requestId === latestVoiceRequestRef.current) {
        setSpeechVoices([]);
        setSpeechVoiceCatalogMeta({
          ...createEmptySpeechVoiceCatalogMeta(),
          modelResolved: model || '',
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
    defaultSettings.enableVoice,
    input.runtimeClient,
    buildVoiceInput,
  ]);

  useEffect(() => {
    if (defaultSettings.enableVoice) {
      return;
    }
    setSpeechVoices([]);
    setSpeechVoiceCatalogMeta(createEmptySpeechVoiceCatalogMeta());
  }, [defaultSettings.enableVoice]);

  const loadSpeechCatalog = useCallback(async () => {
    try {
      await loadSpeechVoices();
    } catch (error) {
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
    if (!defaultSettings.enableVoice) {
      return undefined;
    }
    void loadSpeechCatalog();
  }, [defaultSettings.enableVoice, loadSpeechCatalog]);

  useEffect(() => {
    if (!defaultSettings.enableVoice) {
      return undefined;
    }
    let cancelled = false;
    void loadSpeechVoices().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [
    defaultSettings.enableVoice,
    loadSpeechVoices,
    defaultSettings.ttsRouteSource,
    defaultSettings.ttsConnectorId,
    defaultSettings.ttsModel,
  ]);

  useEffect(() => {
    if (!defaultSettings.enableVoice) {
      return undefined;
    }
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
  }, [defaultSettings.enableVoice, loadSpeechVoices]);

  // Auto-select first voice when voice list changes and current selection is not in the list
  useEffect(() => {
    if (!defaultSettings.enableVoice) {
      return;
    }
    const currentVoice = defaultSettings.voiceName;
    if (speechVoices.length === 0) {
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
    speechVoices,
    speechVoiceCatalogMeta,
    defaultSettings,
    loadSpeechCatalog,
    loadSpeechVoices,
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
