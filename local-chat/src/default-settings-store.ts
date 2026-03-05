import { readRuntimeModSettings, writeRuntimeModSettings } from '@nimiplatform/sdk/mod/settings';
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
  | 'autoPlayVoiceReplies'
  | 'allowNsfwMedia';

export type LocalChatDefaultSettings = {
  enableVoice: boolean;
  allowMultiReply: boolean;
  allowProactiveContact: boolean;
  autoPlayVoiceReplies: boolean;
  allowNsfwMedia: boolean;
  mediaTriggerMode: 'marker_only' | 'marker_plus_heuristic';
  segmentationMode: 'adaptive' | 'single';
  voiceName: LocalChatTtsVoice;
  ttsRouteSource: 'auto' | 'local-runtime' | 'token-api';
  ttsConnectorId: string;
  ttsModel: string;
  sttRouteSource: 'auto' | 'local-runtime' | 'token-api';
  sttConnectorId: string;
  sttModel: string;
  imageRouteSource: 'auto' | 'local-runtime' | 'token-api';
  imageConnectorId: string;
  imageModel: string;
  videoRouteSource: 'auto' | 'local-runtime' | 'token-api';
  videoConnectorId: string;
  videoModel: string;
};

export const DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS: LocalChatDefaultSettings = {
  enableVoice: false,
  allowMultiReply: false,
  allowProactiveContact: false,
  autoPlayVoiceReplies: false,
  allowNsfwMedia: false,
  mediaTriggerMode: 'marker_only',
  segmentationMode: 'adaptive',
  voiceName: 'Cherry',
  ttsRouteSource: 'auto',
  ttsConnectorId: '',
  ttsModel: '',
  sttRouteSource: 'auto',
  sttConnectorId: '',
  sttModel: '',
  imageRouteSource: 'auto',
  imageConnectorId: '',
  imageModel: '',
  videoRouteSource: 'auto',
  videoConnectorId: '',
  videoModel: '',
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
  const normalizedImageRouteSource = String(record.imageRouteSource || '').trim();
  const normalizedVideoRouteSource = String(record.videoRouteSource || '').trim();
  const normalizedMediaTriggerMode = String(record.mediaTriggerMode || '').trim();
  const normalizedSegmentationMode = String(record.segmentationMode || '').trim();
  const ttsRouteSource = normalizedTtsRouteSource === 'local-runtime' || normalizedTtsRouteSource === 'token-api'
    ? normalizedTtsRouteSource
    : 'auto';
  const sttRouteSource = normalizedSttRouteSource === 'local-runtime' || normalizedSttRouteSource === 'token-api'
    ? normalizedSttRouteSource
    : 'auto';
  const imageRouteSource = normalizedImageRouteSource === 'local-runtime' || normalizedImageRouteSource === 'token-api'
    ? normalizedImageRouteSource
    : 'auto';
  const videoRouteSource = normalizedVideoRouteSource === 'local-runtime' || normalizedVideoRouteSource === 'token-api'
    ? normalizedVideoRouteSource
    : 'auto';
  const mediaTriggerMode = normalizedMediaTriggerMode === 'marker_plus_heuristic'
    ? 'marker_plus_heuristic'
    : 'marker_only';
  const segmentationMode = normalizedSegmentationMode === 'single'
    ? 'single'
    : 'adaptive';
  const ttsConnectorId = String(record.ttsConnectorId || '').trim();
  const ttsModel = String(record.ttsModel || '').trim();
  const sttConnectorId = String(record.sttConnectorId || '').trim();
  const sttModel = String(record.sttModel || '').trim();
  const imageConnectorId = String(record.imageConnectorId || '').trim();
  const imageModel = String(record.imageModel || '').trim();
  const videoConnectorId = String(record.videoConnectorId || '').trim();
  const videoModel = String(record.videoModel || '').trim();
  return {
    enableVoice: Boolean(record.enableVoice),
    allowMultiReply: Boolean(record.allowMultiReply),
    allowProactiveContact: Boolean(record.allowProactiveContact),
    autoPlayVoiceReplies: Boolean(record.autoPlayVoiceReplies),
    allowNsfwMedia: Boolean(record.allowNsfwMedia),
    mediaTriggerMode,
    segmentationMode,
    voiceName,
    ttsRouteSource,
    ttsConnectorId,
    ttsModel,
    sttRouteSource,
    sttConnectorId,
    sttModel,
    imageRouteSource,
    imageConnectorId,
    imageModel,
    videoRouteSource,
    videoConnectorId,
    videoModel,
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
