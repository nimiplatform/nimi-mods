import { VIDEOPLAY_REASON, VIDEOPLAY_RETRY_CLASS, type VideoPlayRouteStage, } from '../contracts.js';
import { VideoPlayError } from '../errors.js';
import type { FallbackAuditRecord, RouteInvokeInput, VideoPlayPipelineDeps, } from '../types.js';
import { type RuntimeRouteHealthResult, type RuntimeCanonicalCapability, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
import { isRouteHealthy, actionHintByReasonCode, parseRuntimeRouteCatalogSnapshot, normalizeLanguageTag, type RuntimeRouteCatalog, type VoiceProfile, } from './util.js';

export async function loadRuntimeRouteCatalog(input: {
    deps: VideoPlayPipelineDeps;
    modId: string;
}): Promise<RuntimeRouteCatalog> {
    const [chatRaw, imageRaw, videoRaw, ttsRaw] = await Promise.all([
        input.deps.runtimeClient.route.listOptions({ capability: 'text.generate' }),
        input.deps.runtimeClient.route.listOptions({ capability: 'image.generate' }),
        input.deps.runtimeClient.route.listOptions({ capability: 'video.generate' }),
        input.deps.runtimeClient.route.listOptions({ capability: 'audio.synthesize' }),
    ]);
    const chat = parseRuntimeRouteCatalogSnapshot(chatRaw);
    const image = parseRuntimeRouteCatalogSnapshot(imageRaw);
    const video = parseRuntimeRouteCatalogSnapshot(videoRaw);
    const tts = parseRuntimeRouteCatalogSnapshot(ttsRaw);
    if (!chat || !image || !video || !tts) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ROUTE_UNAVAILABLE),
            stage: 'route',
            retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
            message: 'VIDEOPLAY_RUNTIME_ROUTE_OPTIONS_INVALID',
        });
    }
    return {
        chat,
        image,
        video,
        tts,
    };
}
export function toRouteBinding(source: 'local' | 'cloud'): RuntimeRouteBinding {
    return {
        source,
        connectorId: '',
        model: '',
    };
}
export async function invokeWithRouteFallback<T>(input: RouteInvokeInput<T> & {
    checkHealth: (capability: RuntimeCanonicalCapability, binding?: RuntimeRouteBinding) => Promise<RuntimeRouteHealthResult>;
}): Promise<{
    result: T;
    routeSource: 'local' | 'cloud';
    fallbackAudit: FallbackAuditRecord | null;
}> {
    let localReason = 'local-unavailable';
    try {
        const health = await input.checkHealth(input.capability, toRouteBinding('local'));
        if (isRouteHealthy(health)) {
            try {
                const result = await input.invoke(toRouteBinding('local'));
                return {
                    result,
                    routeSource: 'local',
                    fallbackAudit: null,
                };
            }
            catch (error) {
                localReason = error instanceof Error ? error.message : String(error || 'local-error');
            }
        }
        else {
            localReason = String(health?.reasonCode || health?.status || localReason);
        }
    }
    catch (error) {
        localReason = error instanceof Error ? error.message : String(error || localReason);
    }
    let tokenReason = 'cloud-unavailable';
    try {
        const tokenHealth = await input.checkHealth(input.capability, toRouteBinding('cloud'));
        tokenReason = String(tokenHealth?.reasonCode || tokenHealth?.status || tokenReason);
    }
    catch (error) {
        tokenReason = error instanceof Error ? error.message : String(error || tokenReason);
    }
    const fallbackAudit: FallbackAuditRecord = {
        traceId: input.traceId,
        stage: input.stage as VideoPlayRouteStage,
        capability: input.capability,
        from: 'local',
        to: 'cloud',
        reason: localReason,
    };
    throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ROUTE_UNAVAILABLE),
        stage: 'route',
        retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
        message: `VIDEOPLAY_ROUTE_HARD_REJECT:${input.stage}`,
        details: {
            localReason,
            fallbackReasonCode: tokenReason,
            fallbackAllowed: false,
            fallbackAudit,
        },
    });
}
export async function resolveVoiceProfile(input: {
    deps: VideoPlayPipelineDeps;
    binding: RuntimeRouteBinding | undefined;
    preferredLanguage: string;
}): Promise<VoiceProfile> {
    const routeSource = input.binding?.source === 'cloud' ? 'cloud' : 'local';
    const binding = {
        source: routeSource,
        connectorId: '',
        model: '',
    } as const;
    const [resolved, listed] = await Promise.all([
        input.deps.runtimeClient.route.resolve({
            capability: 'audio.synthesize',
            binding,
        }),
        input.deps.runtimeClient.media.tts.listVoices({
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
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.VOICE_RENDER_FAILED),
            stage: 'render',
            message: 'VIDEOPLAY_TTS_VOICE_LIST_EMPTY',
            retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
            details: {
                routeSource,
            },
        });
    }
    const preferred = normalizeLanguageTag(input.preferredLanguage);
    const selected = voices.find((voice) => normalizeLanguageTag(String(voice.lang || '')) === preferred) || voices[0]!;
    return {
        voiceId: String(selected.id || '').trim(),
        ...(String(selected.providerId || '').trim()
            ? { providerId: String(selected.providerId || '').trim() }
            : {}),
        ...(String(selected.lang || '').trim()
            ? { language: normalizeLanguageTag(String(selected.lang || '').trim()) }
            : {}),
    };
}
