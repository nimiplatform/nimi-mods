import { readRuntimeModSettings, writeRuntimeModSettings } from '@nimiplatform/mod-sdk/settings';
import { LOCAL_CHAT_MOD_ID } from './contracts.js';

export const LOCAL_CHAT_TTS_VOICE_OPTIONS = [
  'Cherry',
  'Serena',
  'Ethan',
  'Chelsie',
  'Momo',
  'Vivian',
  'Moon',
  'Maia',
  'Kai',
  'Nofish',
  'alloy',
  'nova',
  'shimmer',
] as const;

export type LocalChatTtsVoice = string;
export type LocalChatBooleanSettingKey =
  | 'enableVoice'
  | 'allowMultiReply'
  | 'allowProactiveContact'
  | 'autoPlayVoiceReplies';

export type LocalChatDefaultSettings = {
  enableVoice: boolean;
  allowMultiReply: boolean;
  allowProactiveContact: boolean;
  autoPlayVoiceReplies: boolean;
  voiceName: LocalChatTtsVoice;
  ttsRouteSource: 'auto' | 'local-runtime' | 'token-api';
  ttsConnectorId: string;
  ttsModel: string;
  sttRouteSource: 'auto' | 'local-runtime' | 'token-api';
  sttConnectorId: string;
  sttModel: string;
};

export const DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS: LocalChatDefaultSettings = {
  enableVoice: false,
  allowMultiReply: false,
  allowProactiveContact: false,
  autoPlayVoiceReplies: false,
  voiceName: 'Cherry',
  ttsRouteSource: 'auto',
  ttsConnectorId: '',
  ttsModel: '',
  sttRouteSource: 'auto',
  sttConnectorId: '',
  sttModel: '',
};

export function normalizeLocalChatDefaultSettings(value: unknown): LocalChatDefaultSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS };
  }
  const record = value as Record<string, unknown>;
  const normalizedVoiceName = String(record.voiceName || '').trim();
  const voiceName = normalizedVoiceName || DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS.voiceName;
  const normalizedTtsRouteSource = String(record.ttsRouteSource || '').trim();
  const normalizedSttRouteSource = String(record.sttRouteSource || '').trim();
  const ttsRouteSource = normalizedTtsRouteSource === 'local-runtime' || normalizedTtsRouteSource === 'token-api'
    ? normalizedTtsRouteSource
    : 'auto';
  const sttRouteSource = normalizedSttRouteSource === 'local-runtime' || normalizedSttRouteSource === 'token-api'
    ? normalizedSttRouteSource
    : 'auto';
  const ttsConnectorId = String(record.ttsConnectorId || '').trim();
  const ttsModel = String(record.ttsModel || '').trim();
  const sttConnectorId = String(record.sttConnectorId || '').trim();
  const sttModel = String(record.sttModel || '').trim();
  return {
    enableVoice: Boolean(record.enableVoice),
    allowMultiReply: Boolean(record.allowMultiReply),
    allowProactiveContact: Boolean(record.allowProactiveContact),
    autoPlayVoiceReplies: Boolean(record.autoPlayVoiceReplies),
    voiceName,
    ttsRouteSource,
    ttsConnectorId,
    ttsModel,
    sttRouteSource,
    sttConnectorId,
    sttModel,
  };
}

export function loadLocalChatDefaultSettings(): LocalChatDefaultSettings {
  const runtimeSettings = readRuntimeModSettings(LOCAL_CHAT_MOD_ID);
  if (Object.keys(runtimeSettings).length > 0) {
    return normalizeLocalChatDefaultSettings(runtimeSettings);
  }
  return { ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS };
}

export function persistLocalChatDefaultSettings(settings: LocalChatDefaultSettings): void {
  writeRuntimeModSettings(LOCAL_CHAT_MOD_ID, settings as Record<string, unknown>);
}
