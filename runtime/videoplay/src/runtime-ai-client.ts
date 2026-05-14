import { type ModRuntimeClient, type RuntimeCanonicalCapability, type RuntimeRouteBinding, type RuntimeRouteHealthResult } from "@nimiplatform/sdk/mod";
type VideoPlayAiRouteInput = {
    capability?: RuntimeCanonicalCapability;
    binding?: RuntimeRouteBinding | Record<string, unknown>;
};
type VideoPlayAiTextRequest = VideoPlayAiRouteInput & {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    mode?: 'STORY' | 'SCENE_TURN';
    worldId?: string;
    agentId?: string;
    abortSignal?: AbortSignal;
};
type VideoPlayAiImageRequest = VideoPlayAiRouteInput & {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    size?: string;
    aspectRatio?: string;
    quality?: string;
    style?: string;
    seed?: number;
    n?: number;
    referenceImages?: string[];
    mask?: string;
    responseFormat?: 'url' | 'base64';
    extensions?: Record<string, unknown>;
};
type VideoPlayAiVideoRequest = VideoPlayAiRouteInput & {
    mode: 't2v' | 'i2v-first-frame' | 'i2v-first-last' | 'i2v-reference';
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    content: Array<{
        type: 'text';
        role?: 'prompt';
        text: string;
    } | {
        type: 'image_url';
        role: 'first_frame' | 'last_frame' | 'reference_image';
        imageUrl: string;
    }>;
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
type VideoPlayAiSpeechRequest = VideoPlayAiRouteInput & {
    text: string;
    voiceId: string;
    providerId?: string;
    language?: string;
    format?: 'mp3' | 'wav' | 'opus' | 'pcm';
    speakingRate?: number;
    pitch?: number;
    sampleRateHz?: number;
    stylePrompt?: string;
    targetId?: string;
    sessionId?: string;
};
export type VideoPlayRuntimeAiClient = {
    checkRouteHealth(input: VideoPlayAiRouteInput): Promise<RuntimeRouteHealthResult>;
    generateText(input: VideoPlayAiTextRequest): Promise<{
        text: string;
        traceId: string;
        promptTraceId: string;
    }>;
    generateImage(input: VideoPlayAiImageRequest): Promise<{
        images: Array<{
            uri?: string;
            b64Json?: string;
            mimeType?: string;
        }>;
        traceId: string;
    }>;
    generateVideo(input: VideoPlayAiVideoRequest): Promise<{
        videos: Array<{
            uri?: string;
            mimeType?: string;
        }>;
        traceId: string;
    }>;
    synthesizeSpeech(input: VideoPlayAiSpeechRequest): Promise<{
        audioUri?: string;
        mimeType?: string;
        durationMs?: number;
        traceId: string;
    }>;
};
function resolveCapability(capability?: RuntimeCanonicalCapability, fallback: RuntimeCanonicalCapability = 'text.generate'): RuntimeCanonicalCapability {
    return capability || fallback;
}
function toRouteBinding(value: RuntimeRouteBinding | Record<string, unknown> | undefined): RuntimeRouteBinding | undefined {
    if (!value)
        return undefined;
    return {
        source: String(value.source || '').trim() === 'cloud' ? 'cloud' : 'local',
        connectorId: String(value.connectorId || '').trim(),
        model: String(value.model || '').trim(),
        localModelId: String(value.localModelId || '').trim() || undefined,
        engine: String(value.engine || '').trim() || undefined,
    };
}
function encodeBase64(bytes: Uint8Array): string | undefined {
    if (!bytes.length)
        return undefined;
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    if (typeof btoa === 'function') {
        let binary = '';
        for (const byte of bytes)
            binary += String.fromCharCode(byte);
        return btoa(binary);
    }
    return undefined;
}
export function createVideoPlayRuntimeAiClient(runtimeClient: ModRuntimeClient): VideoPlayRuntimeAiClient {
    return {
        checkRouteHealth: async (input) => runtimeClient.route.checkHealth({
            capability: resolveCapability(input.capability),
            binding: toRouteBinding(input.binding),
        }),
        generateText: async (input) => {
            const binding = toRouteBinding(input.binding);
            const route = await runtimeClient.route.resolve({
                capability: 'text.generate',
                binding,
            });
            const result = await runtimeClient.ai.text.generate({
                input: input.prompt,
                system: input.systemPrompt,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
                model: route.model || undefined,
                binding,
            });
            const traceId = String(result.trace?.traceId || '').trim();
            return {
                text: String(result.text || ''),
                traceId,
                promptTraceId: traceId,
            };
        },
        generateImage: async (input) => {
            const binding = toRouteBinding(input.binding);
            const route = await runtimeClient.route.resolve({
                capability: 'image.generate',
                binding,
            });
            const result = await runtimeClient.media.image.generate({
                prompt: input.prompt,
                negativePrompt: input.negativePrompt,
                model: input.model || route.model || undefined,
                size: input.size,
                aspectRatio: input.aspectRatio,
                quality: input.quality,
                style: input.style,
                seed: input.seed,
                n: input.n,
                referenceImages: input.referenceImages,
                mask: input.mask,
                responseFormat: input.responseFormat,
                extensions: input.extensions,
                binding,
            });
            return {
                images: result.artifacts.map((artifact) => ({
                    uri: artifact.uri || undefined,
                    b64Json: artifact.bytes && artifact.bytes.length > 0 ? encodeBase64(artifact.bytes) : undefined,
                    mimeType: artifact.mimeType || undefined,
                })),
                traceId: String(result.trace?.traceId || '').trim(),
            };
        },
        generateVideo: async (input) => {
            const binding = toRouteBinding(input.binding);
            const route = await runtimeClient.route.resolve({
                capability: 'video.generate',
                binding,
            });
            const result = await runtimeClient.media.video.generate({
                mode: input.mode,
                prompt: input.prompt,
                negativePrompt: input.negativePrompt,
                model: input.model || route.model || undefined,
                content: input.content,
                options: input.options,
                binding,
            });
            return {
                videos: result.artifacts.map((artifact) => ({
                    uri: artifact.uri || undefined,
                    mimeType: artifact.mimeType || undefined,
                })),
                traceId: String(result.trace?.traceId || '').trim(),
            };
        },
        synthesizeSpeech: async (input) => {
            const binding = toRouteBinding(input.binding);
            const route = await runtimeClient.route.resolve({
                capability: 'audio.synthesize',
                binding,
            });
            const extensions: Record<string, unknown> = {};
            if (String(input.stylePrompt || '').trim()) {
                extensions.instruct = String(input.stylePrompt || '').trim();
            }
            if (String(input.providerId || '').trim()) {
                extensions.providerId = String(input.providerId || '').trim();
            }
            if (String(input.targetId || '').trim()) {
                extensions.targetId = String(input.targetId || '').trim();
            }
            if (String(input.sessionId || '').trim()) {
                extensions.sessionId = String(input.sessionId || '').trim();
            }
            const result = await runtimeClient.media.tts.synthesize({
                text: input.text,
                voiceRef: { kind: 'preset_voice_id', presetVoiceId: input.voiceId },
                model: route.model || undefined,
                audioFormat: input.format,
                speed: input.speakingRate,
                pitch: input.pitch,
                sampleRateHz: input.sampleRateHz,
                language: input.language,
                extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
                binding,
            });
            const audioArtifact = result.artifacts.find((artifact) => String(artifact.uri || '').trim()) || null;
            const durationMs = Number(audioArtifact?.durationMs);
            return {
                audioUri: audioArtifact?.uri || undefined,
                mimeType: audioArtifact?.mimeType || undefined,
                durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
                traceId: String(result.trace?.traceId || '').trim(),
            };
        },
    };
}
