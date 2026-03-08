import type { ModRuntimeClient, ModRuntimeResolvedBinding } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';

export type LocalChatAiRouteInput = {
  capability?: RuntimeCanonicalCapability;
  routeBinding?: RuntimeRouteBinding;
};

export type LocalChatAiTextRequest = LocalChatAiRouteInput & {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  mode?: 'STORY' | 'SCENE_TURN';
  worldId?: string;
  agentId?: string;
  abortSignal?: AbortSignal;
};

export type LocalChatAiImageRequest = LocalChatAiRouteInput & {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  extensions?: Record<string, unknown>;
};

export type LocalChatAiVideoRequest = LocalChatAiRouteInput & {
  mode: 't2v' | 'i2v-first-frame' | 'i2v-first-last' | 'i2v-reference';
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  content: Array<
    | { type: 'text'; role?: 'prompt'; text: string }
    | { type: 'image_url'; role: 'first_frame' | 'last_frame' | 'reference_image'; imageUrl: string }
  >;
  options?: {
    resolution?: string;
    ratio?: string;
    durationSec?: number;
    frames?: number;
    fps?: number;
    seed?: number;
    cameraFixed?: boolean;
    watermark?: boolean;
    generateAudio?: boolean;
    draft?: boolean;
    serviceTier?: string;
    executionExpiresAfterSec?: number;
    returnLastFrame?: boolean;
  };
};

export type LocalChatAiTranscribeRequest = LocalChatAiRouteInput & {
  audioUri?: string;
  audioBase64?: string;
  mimeType?: string;
  language?: string;
};

export type LocalChatAiSpeechRequest = LocalChatAiRouteInput & {
  text: string;
  voice?: string;
  audioFormat?: string;
  language?: string;
  model?: string;
  extensions?: Record<string, unknown>;
  timeoutMs?: number;
  preferStream?: boolean;
};

export type LocalChatAiClient = {
  resolveRoute(input?: LocalChatAiRouteInput): Promise<ModRuntimeResolvedBinding>;
  checkRouteHealth(input?: LocalChatAiRouteInput): Promise<unknown>;
  generateText(input: LocalChatAiTextRequest): Promise<{
    text: string;
    traceId: string;
    promptTraceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
  }>;
  generateObject(input: LocalChatAiTextRequest & { parse?: (text: string) => Record<string, unknown> }): Promise<{
    object: Record<string, unknown>;
    text: string;
    traceId: string;
    promptTraceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
  }>;
  streamText(input: LocalChatAiTextRequest): AsyncIterable<
    | { type: 'text_delta'; textDelta: string }
    | { type: 'done' }
  >;
  generateImage(input: LocalChatAiImageRequest): Promise<{
    images: Array<{ uri?: string; b64Json?: string; mimeType?: string }>;
    traceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
  }>;
  generateVideo(input: LocalChatAiVideoRequest): Promise<{
    videos: Array<{ uri?: string; mimeType?: string }>;
    traceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
  }>;
  transcribeAudio(input: LocalChatAiTranscribeRequest): Promise<{
    text: string;
    traceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
  }>;
  synthesizeSpeech(input: LocalChatAiSpeechRequest): Promise<{
    audioUri?: string;
    audioBytes?: Uint8Array;
    mimeType?: string;
    traceId: string;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
    usedStream: boolean;
  }>;
};

export type LocalChatAudioPlaybackSource = {
  audioUri?: string;
  audioBytes?: Uint8Array;
  mimeType?: string;
};

function resolveCapability(
  capability: LocalChatAiRouteInput['capability'],
  fallback: RuntimeCanonicalCapability = 'text.generate',
): RuntimeCanonicalCapability {
  return capability || fallback;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_EMPTY_TEXT');
  }
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT');
  }
  return parsed as Record<string, unknown>;
}

function decodeBase64Bytes(value: string): Uint8Array {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return new Uint8Array();
  }
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(normalized, 'base64'));
  }
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  }
  throw new Error('LOCAL_CHAT_AI_STT_BASE64_UNAVAILABLE');
}

function encodeBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return '';
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error('LOCAL_CHAT_AI_ARTIFACT_BASE64_UNAVAILABLE');
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 0) {
    return new Uint8Array();
  }
  const total = parts.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of parts) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function createLocalChatAiClient(runtimeClient: ModRuntimeClient): LocalChatAiClient {
  const resolveRoute: LocalChatAiClient['resolveRoute'] = async (input) => {
    const binding = input?.routeBinding;
    return runtimeClient.route.resolve({
      capability: resolveCapability(input?.capability),
      binding,
    });
  };

  const checkRouteHealth: LocalChatAiClient['checkRouteHealth'] = async (input) => {
    const binding = input?.routeBinding;
    return runtimeClient.route.checkHealth({
      capability: resolveCapability(input?.capability),
      binding,
    });
  };

  return {
    resolveRoute,
    checkRouteHealth,
    generateText: async (input) => {
      const route = await resolveRoute(input);
      const response = await runtimeClient.ai.text.generate({
        input: input.prompt,
        system: input.systemPrompt,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        temperature: input.temperature,
        model: route.model || undefined,
        binding: input.routeBinding,
      });
      const traceId = String(response.trace?.traceId || '').trim();
      return {
        text: String(response.text || ''),
        traceId,
        promptTraceId: traceId,
        route,
      };
    },
    generateObject: async (input) => {
      const parser = input.parse || parseJsonObject;
      const textResult = await runtimeClient.ai.text.generate({
        input: input.prompt,
        system: input.systemPrompt,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        temperature: input.temperature,
        binding: input.routeBinding,
      });
      const text = String(textResult.text || '');
      const traceId = String(textResult.trace?.traceId || '').trim();
      return {
        object: parser(text),
        text,
        traceId,
        promptTraceId: traceId,
        route: await resolveRoute(input),
      };
    },
    streamText: async function* (input) {
      const response = await runtimeClient.ai.text.stream({
        input: input.prompt,
        system: input.systemPrompt,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        temperature: input.temperature,
        signal: input.abortSignal,
        binding: input.routeBinding,
      });
      for await (const event of response.stream) {
        if (event.type === 'delta') {
          const textDelta = String(event.text || '');
          if (textDelta) {
            yield { type: 'text_delta', textDelta };
          }
          continue;
        }
        if (event.type === 'finish') {
          yield { type: 'done' };
          continue;
        }
        if (event.type === 'error') {
          throw event.error;
        }
      }
    },
    generateImage: async (input) => {
      const route = await resolveRoute(input);
      const response = await runtimeClient.media.image.generate({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        model: input.model || route.model || undefined,
        binding: input.routeBinding,
        extensions: input.extensions,
      });
      return {
        images: response.artifacts.map((artifact) => ({
          uri: artifact.uri || undefined,
          b64Json: artifact.bytes && artifact.bytes.length > 0 ? encodeBase64(artifact.bytes) : undefined,
          mimeType: artifact.mimeType || undefined,
        })),
        traceId: String(response.trace?.traceId || '').trim(),
        route,
      };
    },
    generateVideo: async (input) => {
      const route = await resolveRoute(input);
      const response = await runtimeClient.media.video.generate({
        mode: input.mode,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        model: input.model || route.model || undefined,
        content: input.content,
        options: input.options,
        binding: input.routeBinding,
      });
      return {
        videos: response.artifacts.map((artifact) => ({
          uri: artifact.uri || undefined,
          mimeType: artifact.mimeType || undefined,
        })),
        traceId: String(response.trace?.traceId || '').trim(),
        route,
      };
    },
    transcribeAudio: async (input) => {
      const route = await resolveRoute(input);
      const response = await runtimeClient.media.stt.transcribe({
        audio: input.audioUri
          ? { kind: 'url', url: input.audioUri }
          : {
            kind: 'bytes',
            bytes: decodeBase64Bytes(String(input.audioBase64 || '')),
          },
        mimeType: input.mimeType,
        language: input.language,
        model: route.model || undefined,
        binding: input.routeBinding,
      });
      return {
        text: String(response.text || ''),
        traceId: String(response.trace?.traceId || '').trim(),
        route,
      };
    },
    synthesizeSpeech: async (input) => {
      const route = await resolveRoute({
        ...input,
        capability: input.capability || 'audio.synthesize',
      });
      const request = {
        text: input.text,
        voice: input.voice,
        audioFormat: input.audioFormat,
        language: input.language,
        model: input.model || route.model || undefined,
        binding: input.routeBinding || input.routeOverride,
        extensions: input.extensions,
        timeoutMs: input.timeoutMs,
      };

      if (input.preferStream !== false) {
        try {
          const stream = await runtimeClient.media.tts.stream(request);
          const chunks: Uint8Array[] = [];
          let mimeType = '';
          let traceId = '';
          for await (const chunk of stream) {
            if (chunk.chunk instanceof Uint8Array && chunk.chunk.length > 0) {
              chunks.push(chunk.chunk);
            }
            if (!mimeType && String(chunk.mimeType || '').trim()) {
              mimeType = String(chunk.mimeType || '').trim();
            }
            if (!traceId && String(chunk.traceId || '').trim()) {
              traceId = String(chunk.traceId || '').trim();
            }
          }
          const audioBytes = concatBytes(chunks);
          if (audioBytes.length > 0) {
            return {
              audioBytes,
              mimeType: mimeType || undefined,
              traceId,
              route,
              usedStream: true,
            };
          }
        } catch {
          // Fallback to unary synthesize below.
        }
      }

      const response = await runtimeClient.media.tts.synthesize(request);
      const artifact = response.artifacts.find((item) => {
        return Boolean(String(item.uri || '').trim())
          || (item.bytes instanceof Uint8Array && item.bytes.length > 0);
      }) || null;
      const audioUri = String(artifact?.uri || '').trim();
      const audioBytes = artifact?.bytes instanceof Uint8Array && artifact.bytes.length > 0
        ? artifact.bytes
        : undefined;
      const mimeType = String(artifact?.mimeType || '').trim();
      return {
        audioUri: audioUri || undefined,
        audioBytes,
        mimeType: mimeType || undefined,
        traceId: String(response.trace?.traceId || '').trim(),
        route,
        usedStream: false,
      };
    },
  };
}
