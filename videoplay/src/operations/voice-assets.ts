import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import { VIDEOPLAY_OPERATION_TYPE, VIDEOPLAY_REASON, type VideoPlayOperationType } from '../contracts.js';
import { VideoPlayError } from '../errors.js';
import { createHash, createUlid } from '../id.js';
import { invokeWithRouteFallback } from '../pipeline/orchestrator.js';
import type {
  EpisodeRecord,
  FallbackAuditRecord,
  RenderedAsset,
} from '../types.js';

type RuntimeSpeechClientLike = Pick<ModRuntimeClient, 'route' | 'media'>;

type AiClientLike = {
  checkRouteHealth: (input: {
    capability: RuntimeCanonicalCapability;
    binding?: RuntimeRouteBinding;
  }) => Promise<{
    status?: string;
    reasonCode?: string;
  }>;
  synthesizeSpeech: (input: {
    text: string;
    voiceId: string;
    providerId?: string;
    language?: string;
    format?: 'mp3';
    capability: RuntimeCanonicalCapability;
    binding?: RuntimeRouteBinding;
  }) => Promise<{
    audioUri?: string;
    mimeType?: string;
    durationMs?: number;
  }>;
};

function createJsonDataUri(value: unknown): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(value))}`;
}

function requireAudioUri(uri: unknown): string {
  const normalized = String(uri || '').trim();
  if (normalized.length > 0 && !normalized.startsWith('videoplay://')) {
    return normalized;
  }
  throw new VideoPlayError({
    reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
    actionHint: 'Fix TTS route or voice profile, then rerun render.',
    stage: 'asset-render-voice',
    message: 'VIDEOPLAY_VOICE_AUDIO_URI_REQUIRED',
  });
}

function normalizeLanguageTag(input: string): string {
  const normalized = String(input || '').trim().toLowerCase();
  if (!normalized) {
    return 'zh';
  }
  if (normalized.startsWith('zh')) {
    return 'zh';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return normalized;
}

export function buildLipSyncAnchors(input: {
  text: string;
  durationMs: number;
}): Array<{ t: number; viseme: string }> {
  const durationMs = Math.max(300, Math.floor(input.durationMs));
  const tokenCount = Math.max(3, Math.min(24, Math.ceil(String(input.text || '').length / 4)));
  const visemes = ['A', 'E', 'I', 'O', 'U', 'M'];
  const anchors: Array<{ t: number; viseme: string }> = [];
  for (let index = 0; index < tokenCount; index += 1) {
    const t = index === tokenCount - 1
      ? durationMs
      : Math.floor((durationMs * index) / Math.max(1, tokenCount - 1));
    anchors.push({
      t,
      viseme: visemes[index % visemes.length]!,
    });
  }
  return anchors;
}

export function buildManualLipSyncAssets(input: {
  episode: EpisodeRecord;
  operationType: VideoPlayOperationType;
  payload: Record<string, unknown>;
}): RenderedAsset[] {
  const shotId = String(input.payload.shotId || input.payload.baseShotId || '').trim();
  if (!shotId) {
    return [];
  }
  const shot = input.episode.storyboard.shotPlans.find((item) => item.shotId === shotId);
  if (!shot) {
    return [];
  }

  const anchors = Array.isArray(input.payload.anchors)
    ? input.payload.anchors
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        const t = Number(record.t);
        const viseme = String(record.viseme || '').trim();
        if (!Number.isFinite(t) || t < 0 || !viseme) {
          return null;
        }
        return {
          t: Math.floor(t),
          viseme,
        };
      })
      .filter((item): item is { t: number; viseme: string } => item !== null)
    : buildLipSyncAnchors({
      text: String(input.payload.voiceLine || `Voice line for ${shot.shotId}`).trim() || `Voice line for ${shot.shotId}`,
      durationMs: shot.durationMs,
    });

  const assets: RenderedAsset[] = [];
  if (input.operationType === VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC) {
    assets.push({
      assetId: createUlid(),
      episodeId: input.episode.episodeId,
      shotId: shot.shotId,
      clipId: shot.clipId,
      assetType: 'lip-sync',
      uri: createJsonDataUri({
        kind: 'videoplay.lip-sync',
        episodeId: input.episode.episodeId,
        shotId: shot.shotId,
        anchors,
      }),
      mimeType: 'application/json',
      durationMs: shot.durationMs,
      fps: 30,
      resolution: 'n/a',
      sourceEventIds: [...shot.sourceEventIds],
      routeSource: 'local',
      metadata: {
        anchors,
        source: 'manual-lip-sync',
      },
    });
  }
  return assets;
}

async function resolveCreatorVoiceProfile(input: {
  runtimeClient: RuntimeSpeechClientLike;
  routeSource: 'local' | 'cloud';
  preferredLanguage: string;
}): Promise<{
  voiceId: string;
  providerId: string | null;
  language: string;
}> {
  const binding = {
    source: input.routeSource,
    connectorId: '',
    model: '',
  } as const;
  const [resolved, listed] = await Promise.all([
    input.runtimeClient.route.resolve({
      capability: 'audio.synthesize',
      binding,
    }),
    input.runtimeClient.media.tts.listVoices({
      binding,
      model: '',
    }),
  ]);
  const voices = listed.voices.map((voice) => ({
    id: voice.voiceId,
    providerId: resolved.provider,
    lang: voice.lang,
  }));
  if (!Array.isArray(voices) || voices.length === 0) {
    throw new Error('VIDEOPLAY_TTS_VOICE_LIST_EMPTY');
  }

  const preferred = normalizeLanguageTag(input.preferredLanguage);
  const selected = voices.find((voice) => normalizeLanguageTag(String(voice.lang || '')) === preferred) || voices[0]!;
  const voiceId = String(selected.id || '').trim();
  if (!voiceId) {
    throw new Error('VIDEOPLAY_TTS_VOICE_ID_MISSING');
  }
  return {
    voiceId,
    providerId: String(selected.providerId || '').trim() || null,
    language: normalizeLanguageTag(String(selected.lang || '').trim() || preferred),
  };
}

export async function buildGeneratedVoiceAssets(input: {
  runtimeClient: RuntimeSpeechClientLike;
  aiClient: AiClientLike;
  traceId: string;
  episode: EpisodeRecord;
  payload: Record<string, unknown>;
}): Promise<{
  assets: RenderedAsset[];
  fallbackAudit: FallbackAuditRecord | null;
}> {
  const shotId = String(input.payload.shotId || input.payload.baseShotId || '').trim();
  if (!shotId) {
    return { assets: [], fallbackAudit: null };
  }
  const shot = input.episode.storyboard.shotPlans.find((item) => item.shotId === shotId);
  if (!shot) {
    return { assets: [], fallbackAudit: null };
  }

  const voiceLine = String(input.payload.voiceLine || `Voice line for ${shot.shotId}`).trim() || `Voice line for ${shot.shotId}`;
  const preferredLanguage = normalizeLanguageTag(String(input.payload.language || input.payload.locale || 'zh'));

  const voiceResult = await invokeWithRouteFallback({
    stage: 'asset-render-voice',
          capability: 'audio.synthesize',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.aiClient.checkRouteHealth({ capability, binding }),
    invoke: async (binding) => {
      const routeSource = binding?.source === 'cloud' ? 'cloud' : 'local';
      const profile = await resolveCreatorVoiceProfile({
        runtimeClient: input.runtimeClient,
        routeSource,
        preferredLanguage,
      });
      const speech = await input.aiClient.synthesizeSpeech({
        text: voiceLine,
        voiceId: profile.voiceId,
        ...(profile.providerId ? { providerId: profile.providerId } : {}),
        language: profile.language,
        format: 'mp3',
        capability: 'audio.synthesize',
        binding,
      });
      return {
        speech,
        profile,
      };
    },
  });

  const durationMs = Number(voiceResult.result.speech.durationMs ?? shot.durationMs);
  const lipSyncAnchors = buildLipSyncAnchors({
    text: voiceLine,
    durationMs,
  });
  const voiceAssetId = createUlid();
  const routeSource = voiceResult.routeSource;
  return {
    assets: [
      {
        assetId: createUlid(),
        episodeId: input.episode.episodeId,
        shotId: shot.shotId,
        clipId: shot.clipId,
        assetType: 'voice-script',
        uri: createJsonDataUri({
          kind: 'videoplay.voice-script',
          episodeId: input.episode.episodeId,
          shotId: shot.shotId,
          text: voiceLine,
          locale: preferredLanguage,
          language: voiceResult.result.profile.language,
          voiceId: voiceResult.result.profile.voiceId,
          providerId: voiceResult.result.profile.providerId || '',
        }),
        mimeType: 'application/json',
        durationMs,
        fps: 1,
        resolution: 'n/a',
        sourceEventIds: [...shot.sourceEventIds],
        routeSource,
        metadata: {
          text: voiceLine,
          locale: preferredLanguage,
          language: voiceResult.result.profile.language,
          voiceId: voiceResult.result.profile.voiceId,
          providerId: voiceResult.result.profile.providerId || '',
          source: 'runtime-tts',
        },
      },
      {
        assetId: voiceAssetId,
        episodeId: input.episode.episodeId,
        shotId: shot.shotId,
        clipId: shot.clipId,
        assetType: 'voice-audio',
        uri: requireAudioUri(voiceResult.result.speech.audioUri),
        mimeType: String(voiceResult.result.speech.mimeType || 'audio/mpeg'),
        durationMs,
        fps: 1,
        resolution: 'audio-only',
        sourceEventIds: [...shot.sourceEventIds],
        routeSource,
        metadata: {
          textHash: createHash(voiceLine),
          language: voiceResult.result.profile.language,
          voiceId: voiceResult.result.profile.voiceId,
          providerId: voiceResult.result.profile.providerId || '',
          source: 'runtime-tts',
        },
      },
      {
        assetId: createUlid(),
        episodeId: input.episode.episodeId,
        shotId: shot.shotId,
        clipId: shot.clipId,
        assetType: 'lip-sync',
        uri: createJsonDataUri({
          kind: 'videoplay.lip-sync',
          episodeId: input.episode.episodeId,
          shotId: shot.shotId,
          voiceAssetId,
          anchors: lipSyncAnchors,
        }),
        mimeType: 'application/json',
        durationMs,
        fps: 30,
        resolution: 'n/a',
        sourceEventIds: [...shot.sourceEventIds],
        routeSource,
        metadata: {
          anchors: lipSyncAnchors,
          source: 'runtime-tts',
          voiceAssetId,
          transcriptHash: createHash(voiceLine),
        },
      },
    ],
    fallbackAudit: voiceResult.fallbackAudit,
  };
}
