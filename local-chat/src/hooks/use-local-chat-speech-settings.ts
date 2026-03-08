import { useCallback, useEffect, useRef, useState } from 'react';
import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { useRuntimeModSettings } from '@nimiplatform/sdk/mod/settings';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import {
  type LocalChatBooleanSettingKey,
  type LocalChatDeliveryStyle,
  type LocalChatInspectSettings,
  type LocalChatMediaAutonomy,
  type LocalChatProductSettings,
  type LocalChatRelationshipBoundaryPreset,
  type LocalChatSettings,
  type LocalChatVisualComfortLevel,
  type LocalChatVoiceConversationMode,
  DEFAULT_LOCAL_CHAT_SETTINGS,
  mergeLocalChatSettings,
  normalizeLocalChatSettings,
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
  routeSource?: 'auto' | 'local' | 'cloud';
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
    settings,
    updateSettings,
  } = useRuntimeModSettings<LocalChatSettings>({
    modId: LOCAL_CHAT_MOD_ID,
    defaults: DEFAULT_LOCAL_CHAT_SETTINGS,
    normalize: normalizeLocalChatSettings,
  });
  const productSettings = settings.product;
  const inspectSettings = settings.inspect;
  const defaultSettings = mergeLocalChatSettings(settings);

  const updateProductSettings = useCallback((updater: (previous: LocalChatProductSettings) => LocalChatProductSettings) => {
    updateSettings((previous) => ({
      ...previous,
      product: updater(previous.product),
    }));
  }, [updateSettings]);

  const updateInspectSettings = useCallback((updater: (previous: LocalChatInspectSettings) => LocalChatInspectSettings) => {
    updateSettings((previous) => ({
      ...previous,
      inspect: updater(previous.inspect),
    }));
  }, [updateSettings]);

  const buildVoiceInput = useCallback((override?: VoiceQueryOverride) => {
    const routeSource = (override?.routeSource || inspectSettings.ttsRouteSource);
    const connectorId = String(override?.connectorId || inspectSettings.ttsConnectorId || '').trim();
    const model = String(override?.model || inspectSettings.ttsModel || '').trim();
    return {
      routeSource,
      connectorId: connectorId || undefined,
      model: model || undefined,
    };
  }, [
    inspectSettings.ttsRouteSource,
    inspectSettings.ttsConnectorId,
    inspectSettings.ttsModel,
  ]);

  const loadSpeechVoices = useCallback(async (override?: VoiceQueryOverride) => {
    if (!productSettings.enableVoice) {
      setSpeechVoices([]);
      setSpeechVoiceCatalogMeta(createEmptySpeechVoiceCatalogMeta());
      return [];
    }
    const voiceInput = buildVoiceInput(override);
    const requestId = latestVoiceRequestRef.current + 1;
    latestVoiceRequestRef.current = requestId;
    const binding = (
      voiceInput.routeSource === 'cloud' || voiceInput.routeSource === 'local'
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
    productSettings.enableVoice,
    input.runtimeClient,
    buildVoiceInput,
  ]);

  useEffect(() => {
    if (productSettings.enableVoice) {
      return;
    }
    setSpeechVoices([]);
    setSpeechVoiceCatalogMeta(createEmptySpeechVoiceCatalogMeta());
  }, [productSettings.enableVoice]);

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
    if (!productSettings.enableVoice) {
      return undefined;
    }
    void loadSpeechCatalog();
  }, [productSettings.enableVoice, loadSpeechCatalog]);

  useEffect(() => {
    if (!productSettings.enableVoice) {
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
    productSettings.enableVoice,
    loadSpeechVoices,
    inspectSettings.ttsRouteSource,
    inspectSettings.ttsConnectorId,
    inspectSettings.ttsModel,
  ]);

  useEffect(() => {
    if (!productSettings.enableVoice) {
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
  }, [productSettings.enableVoice, loadSpeechVoices]);

  // Keep manual inspect voice in sync with the currently available catalog.
  useEffect(() => {
    if (!productSettings.enableVoice) {
      return;
    }
    const currentVoice = inspectSettings.voiceName;
    if (speechVoices.length === 0) {
      return;
    }
    const exists = speechVoices.some((v) => v.id === currentVoice);
    if (!exists) {
      updateInspectSettings((previous) => ({
        ...previous,
        voiceName: speechVoices[0]?.id ?? '',
      }));
    }
  }, [speechVoices, productSettings.enableVoice, inspectSettings.voiceName, updateInspectSettings]);

  const handleVoiceIdChange = useCallback((voiceId: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      voiceName: voiceId,
    }));
  }, [updateInspectSettings]);

  const handleDefaultSettingChange = useCallback((
    key: LocalChatBooleanSettingKey,
    value: boolean,
  ) => {
    updateProductSettings((previous) => ({
      ...previous,
      [key]: value,
    }));
  }, [updateProductSettings]);

  const handleDeliveryStyleChange = useCallback((value: LocalChatDeliveryStyle) => {
    updateProductSettings((previous) => ({
      ...previous,
      deliveryStyle: value,
    }));
  }, [updateProductSettings]);

  const handleMediaAutonomyChange = useCallback((value: LocalChatMediaAutonomy) => {
    updateProductSettings((previous) => ({
      ...previous,
      mediaAutonomy: value,
    }));
  }, [updateProductSettings]);

  const handleVoiceConversationModeChange = useCallback((value: LocalChatVoiceConversationMode) => {
    updateProductSettings((previous) => ({
      ...previous,
      voiceConversationMode: value,
    }));
  }, [updateProductSettings]);

  const handleRelationshipBoundaryPresetChange = useCallback((value: LocalChatRelationshipBoundaryPreset) => {
    updateProductSettings((previous) => ({
      ...previous,
      relationshipBoundaryPreset: value,
    }));
  }, [updateProductSettings]);

  const handleVisualComfortLevelChange = useCallback((value: LocalChatVisualComfortLevel) => {
    updateProductSettings((previous) => ({
      ...previous,
      visualComfortLevel: value,
    }));
  }, [updateProductSettings]);

  const handleDefaultVoiceNameChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      voiceName: value,
    }));
  }, [updateInspectSettings]);

  const handleTtsRouteSourceChange = useCallback((value: 'auto' | 'local' | 'cloud') => {
    updateInspectSettings((previous) => ({
      ...previous,
      ttsRouteSource: value,
    }));
  }, [updateInspectSettings]);

  const handleTtsConnectorChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      ttsConnectorId: value,
    }));
  }, [updateInspectSettings]);

  const handleTtsModelChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      ttsModel: value,
    }));
  }, [updateInspectSettings]);

  const handleSttRouteSourceChange = useCallback((value: 'auto' | 'local' | 'cloud') => {
    updateInspectSettings((previous) => ({
      ...previous,
      sttRouteSource: value,
    }));
  }, [updateInspectSettings]);

  const handleSttConnectorChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      sttConnectorId: value,
    }));
  }, [updateInspectSettings]);

  const handleSttModelChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      sttModel: value,
    }));
  }, [updateInspectSettings]);

  const handleImageRouteSourceChange = useCallback((value: 'auto' | 'local' | 'cloud') => {
    updateInspectSettings((previous) => ({
      ...previous,
      imageRouteSource: value,
    }));
  }, [updateInspectSettings]);

  const handleImageConnectorChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      imageConnectorId: value,
    }));
  }, [updateInspectSettings]);

  const handleImageModelChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      imageModel: value,
    }));
  }, [updateInspectSettings]);

  const handleVideoRouteSourceChange = useCallback((value: 'auto' | 'local' | 'cloud') => {
    updateInspectSettings((previous) => ({
      ...previous,
      videoRouteSource: value,
    }));
  }, [updateInspectSettings]);

  const handleVideoConnectorChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      videoConnectorId: value,
    }));
  }, [updateInspectSettings]);

  const handleVideoModelChange = useCallback((value: string) => {
    updateInspectSettings((previous) => ({
      ...previous,
      videoModel: value,
    }));
  }, [updateInspectSettings]);

  const handleInspectFlagChange = useCallback((key: 'diagnosticsVisible' | 'runtimeInspectorVisible', value: boolean) => {
    updateInspectSettings((previous) => ({
      ...previous,
      [key]: value,
    }));
  }, [updateInspectSettings]);

  return {
    speechVoices,
    speechVoiceCatalogMeta,
    settings,
    defaultSettings,
    productSettings,
    inspectSettings,
    loadSpeechCatalog,
    loadSpeechVoices,
    handleVoiceIdChange,
    handleDefaultSettingChange,
    handleDeliveryStyleChange,
    handleMediaAutonomyChange,
    handleVoiceConversationModeChange,
    handleRelationshipBoundaryPresetChange,
    handleVisualComfortLevelChange,
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
    handleInspectFlagChange,
    updateProductSettings,
    updateInspectSettings,
  };
}
