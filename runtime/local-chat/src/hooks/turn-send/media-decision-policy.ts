import type { ChatMessage } from '../../types.js';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatDefaultSettings, LocalChatPromptTrace } from '../../state/index.js';
import type { NsfwMediaPolicy } from '../../services/policy/nsfw-media-policy.js';
import { isMediaGenerationAllowed, isPromptLikelyNsfw, } from '../../services/policy/nsfw-media-policy.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { ResolvedExperiencePolicy } from './resolved-experience-policy.js';
import { parseExplicitMediaRequest } from './explicit-media-request-parser.js';
import { planMediaTurn, type MediaPlannerDecision } from './media-planner.js';
import { createDefaultMediaPromptTracePatch, type MediaDependencyStatus, type MediaExecutionDecision, type MediaRouteSource, type PendingMediaIntent, type PreparedMediaExecution, } from './media-decision-types.js';
import { buildMediaGenerationSpec, compileMediaExecution, createMediaSpecHash, type MediaIntent, } from './media-spec.js';
import { collectMediaContextSnapshot, enrichMediaIntent, type MediaContextSnapshot, } from './media-context-enricher.js';
import { buildMediaSettingsRevision, isMediaRouteReady, preflightResolveMediaRoute, resolveMediaRouteConfig, resolveMediaRouteFromOptions, } from './media-route.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';
import { type ModRuntimeDependencySnapshot, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
type AssistantTurnMediaHistory = {
    timestampMs: number | null;
    hasMedia: boolean;
    hasVideo: boolean;
};
type RecentMediaSummary = {
    autoMediaCooling: boolean;
    autoVideoCooling: boolean;
    hasPendingMedia: boolean;
    summary: string;
};
type IntentGateResult = {
    allowed: true;
    routeSource: MediaRouteSource;
} | {
    allowed: false;
    routeSource: MediaRouteSource;
    blockedReason: string;
};
export type DecideMediaExecutionInput = {
    aiClient: Pick<LocalChatTurnAiClient, 'generateObject'> & Partial<Pick<LocalChatTurnAiClient, 'resolveRoute'>>;
    turnTxnId: string;
    routeBinding: RuntimeRouteBinding | null;
    defaultSettings: LocalChatDefaultSettings;
    resolvedPolicy: ResolvedExperiencePolicy;
    userText: string;
    assistantText: string;
    target: LocalChatTarget;
    worldId?: string | null;
    messages: ChatMessage[];
    promptTrace: LocalChatPromptTrace | null;
    nsfwPolicy: NsfwMediaPolicy;
    fallbackRouteSource: MediaRouteSource;
    imageRouteOptions?: RuntimeRouteOptionsSnapshot | null;
    videoRouteOptions?: RuntimeRouteOptionsSnapshot | null;
    imageRouteOptionsRevision?: number;
    videoRouteOptionsRevision?: number;
    imageResolvedRoute?: LocalChatResolvedMediaRoute | null;
    videoResolvedRoute?: LocalChatResolvedMediaRoute | null;
    imageDependencySnapshot: ModRuntimeDependencySnapshot | null;
    videoDependencySnapshot: ModRuntimeDependencySnapshot | null;
    markerOverrideIntent: PendingMediaIntent | null;
};
const IMAGE_AUTO_CONFIDENCE_THRESHOLD = 0.82;
const VIDEO_AUTO_CONFIDENCE_THRESHOLD = 0.93;
const AUTO_MEDIA_TURN_COOLDOWN = 6;
const AUTO_MEDIA_TIME_COOLDOWN_MS = 10 * 60 * 1000;
const AUTO_VIDEO_TURN_COOLDOWN = 20;
const AUTO_VIDEO_TIME_COOLDOWN_MS = 30 * 60 * 1000;
const ASSISTANT_OFFER_SIGNAL_RE = /\b(?:i(?:'ll| will)|let me|want me to|i can|here(?:'s| is)|sending)\b|(?:给你看|发你看|发给你|给你发|拍给你|给你拍|我给你看|我发你|我拍给你|给你来一张|给你来段|我这就发|我这就给你)/i;
const VISUAL_SCENE_SIGNAL_RE = /\b(?:frame|portrait|photo|image|light|lighting|color|dress|street|rain|beach|room|window|night|sunset|cinematic|close-up|wide shot|selfie)\b|(?:画面|镜头|样子|神情|表情|穿着|光影|灯光|夜色|海边|房间|窗边|雨夜|照片|图片|身影|背影|颜色|氛围|构图|电影感|特写|远景|自拍)/i;
const VIDEO_MOTION_SIGNAL_RE = /\b(?:walk|turn(?:\s+around)?|move|moving|spin|dance|approach|reach|camera|tracking|follow|pan|zoom|motion|sequence|clip|blink|glance|smile|nod|loop)\b|(?:走|转身|移动|舞动|迈步|靠近|抬手|镜头|跟拍|推进|拉远|动态|片段|过程|眨眼|回眸|微笑|点头|短循环)/i;
const GENERIC_MEDIA_DESCRIPTOR_RE = /^(?:当前对话中的主体|贴合当前对话语境|自然、精致、贴合陪伴式对话|贴合当前交流氛围|自然|普通问候场景|generic greeting|scene fits image|visual scene)$/i;
function resolveEffectiveMediaRouteSource(input: {
    kind: 'image' | 'video';
    settings: LocalChatDefaultSettings;
    fallbackRouteSource: MediaRouteSource;
    resolvedRoute?: LocalChatResolvedMediaRoute | null;
}): MediaRouteSource {
    const resolvedSource = input.resolvedRoute?.source;
    if (resolvedSource === 'local' || resolvedSource === 'cloud') {
        return resolvedSource;
    }
    return resolveConfiguredMediaRouteSource({
        kind: input.kind,
        settings: input.settings,
        fallbackRouteSource: input.fallbackRouteSource,
    });
}
export function normalizeMediaDependencyStatus(input: {
    snapshot: ModRuntimeDependencySnapshot | null;
    routeSource: MediaRouteSource;
}): MediaDependencyStatus {
    if (input.routeSource === 'cloud') {
        return 'ready';
    }
    const snapshot = input.snapshot;
    if (!snapshot)
        return 'unknown';
    if (snapshot.status === 'ready')
        return 'ready';
    if (snapshot.status === 'missing')
        return 'missing';
    if (snapshot.status === 'degraded')
        return 'degraded';
    return 'unknown';
}
export function isMediaDependencyReady(input: {
    snapshot: ModRuntimeDependencySnapshot | null;
    routeSource: MediaRouteSource;
}): boolean {
    if (input.routeSource === 'cloud') {
        return true;
    }
    return input.snapshot?.status === 'ready';
}
function resolveConfiguredMediaRouteSource(input: {
    kind: 'image' | 'video';
    settings: LocalChatDefaultSettings;
    fallbackRouteSource: MediaRouteSource;
}): MediaRouteSource {
    const configured = input.kind === 'image'
        ? input.settings.imageRouteSource
        : input.settings.videoRouteSource;
    if (configured === 'local' || configured === 'cloud') {
        return configured;
    }
    return input.fallbackRouteSource;
}
function collectAssistantTurnMediaHistory(messages: ChatMessage[]): AssistantTurnMediaHistory[] {
    const turns: AssistantTurnMediaHistory[] = [];
    let current: AssistantTurnMediaHistory | null = null;
    messages.forEach((message) => {
        if (message.role === 'user') {
            current = null;
            return;
        }
        if (!current) {
            current = {
                timestampMs: null,
                hasMedia: false,
                hasVideo: false,
            };
            turns.push(current);
        }
        const timestampMs = message.timestamp instanceof Date
            ? message.timestamp.getTime()
            : new Date(message.timestamp).getTime();
        if (Number.isFinite(timestampMs)) {
            current.timestampMs = Math.max(current.timestampMs || 0, timestampMs);
        }
        if (message.kind === 'image' || message.kind === 'video') {
            current.hasMedia = true;
            if (message.kind === 'video') {
                current.hasVideo = true;
            }
        }
    });
    return turns.reverse();
}
function summarizeRecentMedia(messages: ChatMessage[]): RecentMediaSummary {
    const now = Date.now();
    const pendingMedia = messages.some((message) => (message.kind === 'image-pending' || message.kind === 'video-pending'));
    const assistantTurns = collectAssistantTurnMediaHistory(messages);
    const lastMediaTurnIndex = assistantTurns.findIndex((turn) => turn.hasMedia);
    const lastVideoTurnIndex = assistantTurns.findIndex((turn) => turn.hasVideo);
    const lastMediaTurn = lastMediaTurnIndex >= 0 ? assistantTurns[lastMediaTurnIndex] : null;
    const lastVideoTurn = lastVideoTurnIndex >= 0 ? assistantTurns[lastVideoTurnIndex] : null;
    const turnsSinceLastMedia = lastMediaTurnIndex >= 0 ? lastMediaTurnIndex : null;
    const turnsSinceLastVideo = lastVideoTurnIndex >= 0 ? lastVideoTurnIndex : null;
    const msSinceLastMedia = lastMediaTurn?.timestampMs ? now - lastMediaTurn.timestampMs : null;
    const msSinceLastVideo = lastVideoTurn?.timestampMs ? now - lastVideoTurn.timestampMs : null;
    const autoMediaCooling = (turnsSinceLastMedia !== null && turnsSinceLastMedia < AUTO_MEDIA_TURN_COOLDOWN) || (msSinceLastMedia !== null && msSinceLastMedia < AUTO_MEDIA_TIME_COOLDOWN_MS);
    const autoVideoCooling = (turnsSinceLastVideo !== null && turnsSinceLastVideo < AUTO_VIDEO_TURN_COOLDOWN) || (msSinceLastVideo !== null && msSinceLastVideo < AUTO_VIDEO_TIME_COOLDOWN_MS);
    return {
        autoMediaCooling,
        autoVideoCooling,
        hasPendingMedia: pendingMedia,
        summary: [
            turnsSinceLastMedia === null
                ? 'recentMedia=none'
                : `recentMedia=${turnsSinceLastMedia}turn/${Math.max(0, Math.round((msSinceLastMedia || 0) / 60000))}m`,
            turnsSinceLastVideo === null
                ? 'recentVideo=none'
                : `recentVideo=${turnsSinceLastVideo}turn/${Math.max(0, Math.round((msSinceLastVideo || 0) / 60000))}m`,
            pendingMedia ? 'pending=yes' : 'pending=no',
        ].join(' · '),
    };
}
function isStructuredAssistantReply(text: string): boolean {
    const normalized = String(text || '').trim();
    if (!normalized)
        return false;
    return normalized.startsWith('{')
        || normalized.startsWith('[')
        || normalized.includes('```')
        || /^(?:\d+\.\s|-\s|\*\s)/m.test(normalized);
}
function joinMediaSignalText(values: Array<string | undefined | null>): string {
    return values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join('\n');
}
function hasAssistantOfferSignal(assistantText: string): boolean {
    return ASSISTANT_OFFER_SIGNAL_RE.test(String(assistantText || '').trim());
}
function hasVisualSceneSignal(input: {
    userText: string;
    assistantText: string;
    decision: MediaPlannerDecision;
}): boolean {
    const joined = joinMediaSignalText([
        input.userText,
        input.assistantText,
        input.decision.subject,
        input.decision.scene,
        input.decision.styleIntent,
        input.decision.hints?.composition,
    ]);
    if (!joined)
        return false;
    if (VISUAL_SCENE_SIGNAL_RE.test(joined)) {
        return true;
    }
    return [
        input.decision.subject,
        input.decision.scene,
        input.decision.styleIntent,
        input.assistantText,
        input.userText,
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value) => !GENERIC_MEDIA_DESCRIPTOR_RE.test(value))
        .some((value) => value.length >= 18);
}
function hasVideoMotionSignal(input: {
    userText: string;
    assistantText: string;
    decision: MediaPlannerDecision;
}): boolean {
    return VIDEO_MOTION_SIGNAL_RE.test(joinMediaSignalText([
        input.userText,
        input.assistantText,
        input.decision.scene,
        input.decision.reason,
        input.decision.hints?.composition,
    ]));
}
function buildMediaGateBlockedMessage(input: {
    type: 'image' | 'video';
    reason: 'route-not-ready' | 'dependency-not-ready' | 'nsfw-blocked';
    routeSource: MediaRouteSource;
    nsfwPolicy?: NsfwMediaPolicy;
}): string {
    const noun = input.type === 'image' ? '图片' : '视频';
    if (input.reason === 'route-not-ready') {
        return `${noun}发送暂时不可用：当前${noun}路由还没配置好。请先在右侧“媒体路由配置”里选择可用路由。`;
    }
    if (input.reason === 'dependency-not-ready') {
        return `${noun}发送暂时不可用：当前${noun}依赖还没就绪。请先安装或刷新媒体依赖后再试。`;
    }
    if (input.nsfwPolicy === 'disabled') {
        return `已拦截本次${noun}发送：当前内容风格已收敛，本次不发送这类画面。`;
    }
    if (input.nsfwPolicy === 'local-only' && input.routeSource !== 'local') {
        return `已拦截本次${noun}发送：当前内容风格仅支持本地生成，请切到“本地”后重试。`;
    }
    return `已拦截本次${noun}发送：当前内容风格不允许该请求。`;
}
function evaluateIntentGate(input: {
    intent: PendingMediaIntent;
    defaultSettings: LocalChatDefaultSettings;
    fallbackRouteSource: MediaRouteSource;
    nsfwPolicy: NsfwMediaPolicy;
    imageRouteReady: boolean;
    videoRouteReady: boolean;
    imageDependencyReady: boolean;
    videoDependencyReady: boolean;
    requireDependencyReady?: boolean;
}): IntentGateResult {
    const routeReady = input.intent.type === 'image' ? input.imageRouteReady : input.videoRouteReady;
    const dependencyReady = input.intent.type === 'image' ? input.imageDependencyReady : input.videoDependencyReady;
    const routeSource = resolveConfiguredMediaRouteSource({
        kind: input.intent.type,
        settings: input.defaultSettings,
        fallbackRouteSource: input.fallbackRouteSource,
    });
    if (!routeReady) {
        return {
            allowed: false,
            routeSource,
            blockedReason: buildMediaGateBlockedMessage({
                type: input.intent.type,
                reason: 'route-not-ready',
                routeSource,
            }),
        };
    }
    if (input.requireDependencyReady !== false && !dependencyReady) {
        return {
            allowed: false,
            routeSource,
            blockedReason: buildMediaGateBlockedMessage({
                type: input.intent.type,
                reason: 'dependency-not-ready',
                routeSource,
            }),
        };
    }
    const nsfwAllowed = isMediaGenerationAllowed({
        policy: input.nsfwPolicy,
        routeSource,
        prompt: input.intent.prompt,
        isNsfwPrompt: input.intent.plannerSuggestsNsfw || isPromptLikelyNsfw(input.intent.prompt),
    });
    if (!nsfwAllowed) {
        return {
            allowed: false,
            routeSource,
            blockedReason: buildMediaGateBlockedMessage({
                type: input.intent.type,
                reason: 'nsfw-blocked',
                routeSource,
                nsfwPolicy: input.nsfwPolicy,
            }),
        };
    }
    return {
        allowed: true,
        routeSource,
    };
}
function createDecisionPatch(input: Partial<ReturnType<typeof createDefaultMediaPromptTracePatch>>): ReturnType<typeof createDefaultMediaPromptTracePatch> {
    return {
        ...createDefaultMediaPromptTracePatch(),
        ...input,
    };
}
function buildSemanticIntentFromPrompt(input: {
    kind: 'image' | 'video';
    source: PendingMediaIntent['source'];
    plannerTrigger: PendingMediaIntent['plannerTrigger'];
    prompt: string;
    confidence?: number;
    nsfwIntent?: 'none' | 'suggested';
}): MediaIntent {
    const normalizedPrompt = String(input.prompt || '').trim();
    return {
        kind: input.kind,
        intentSource: input.source,
        plannerTrigger: input.plannerTrigger,
        confidence: Number.isFinite(input.confidence) ? Number(input.confidence) : null,
        nsfwIntent: input.nsfwIntent || (isPromptLikelyNsfw(normalizedPrompt) ? 'suggested' : 'none'),
        subject: '当前对话中的主体',
        scene: normalizedPrompt || '贴合当前对话语境',
        styleIntent: '自然、精致、贴合陪伴式对话',
        mood: '贴合当前交流氛围',
    };
}
function buildSemanticIntentFromPlannerDecision(input: {
    decision: MediaPlannerDecision;
}): MediaIntent {
    return {
        kind: input.decision.kind === 'video' ? 'video' : 'image',
        intentSource: 'planner',
        plannerTrigger: input.decision.trigger,
        confidence: input.decision.confidence,
        nsfwIntent: input.decision.nsfwIntent,
        subject: String(input.decision.subject || '').trim(),
        scene: String(input.decision.scene || '').trim(),
        styleIntent: String(input.decision.styleIntent || '').trim(),
        mood: String(input.decision.mood || '').trim(),
        hints: input.decision.hints,
    };
}
async function prepareMediaExecution(input: {
    semanticIntent: MediaIntent;
    pendingMessageId: string;
    target: LocalChatTarget;
    targetId: string;
    worldId?: string | null;
    userText: string;
    assistantText: string;
    contextSnapshot: MediaContextSnapshot;
}): Promise<{
    intent: PendingMediaIntent;
    prepared: PreparedMediaExecution;
}> {
    const spec = buildMediaGenerationSpec({
        intent: enrichMediaIntent({
            semanticIntent: input.semanticIntent,
            target: input.target,
            userText: input.userText,
            assistantText: input.assistantText,
            contextSnapshot: input.contextSnapshot,
        }),
        targetId: input.targetId,
        worldId: input.worldId,
    });
    const compiled = compileMediaExecution(spec);
    const specHash = await createMediaSpecHash(spec);
    const prepared = {
        spec,
        specHash,
        compiled,
        pendingMessageId: input.pendingMessageId,
    };
    return {
        intent: {
            type: spec.kind,
            prompt: compiled.compiledPromptText,
            source: spec.intentSource,
            plannerTrigger: spec.plannerTrigger,
            ...(Number.isFinite(spec.confidence) ? { plannerConfidence: Number(spec.confidence) } : {}),
            ...(spec.nsfwIntent === 'suggested' ? { plannerSuggestsNsfw: true } : {}),
            pendingMessageId: input.pendingMessageId,
        },
        prepared,
    };
}
async function resolveAuthorityMediaRoute(input: {
    aiClient: DecideMediaExecutionInput['aiClient'];
    kind: 'image' | 'video';
    defaultSettings: LocalChatDefaultSettings;
    fallbackRouteSource: MediaRouteSource;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
    routeOptionsRevision?: number;
    currentResolvedRoute?: LocalChatResolvedMediaRoute | null;
}): Promise<{
    routeSource: MediaRouteSource;
    resolvedRoute: LocalChatResolvedMediaRoute;
} | null> {
    const routeConfig = resolveMediaRouteConfig({
        kind: input.kind,
        settings: input.defaultSettings,
        fallbackSource: input.fallbackRouteSource,
    });
    const settingsRevision = buildMediaSettingsRevision({
        kind: input.kind,
        settings: input.defaultSettings,
    });
    const routeOptionsRevision = Number.isFinite(input.routeOptionsRevision)
        ? Math.max(0, Math.floor(Number(input.routeOptionsRevision)))
        : 0;
    const resolvedFromOptions = resolveMediaRouteFromOptions({
        kind: input.kind,
        settings: input.defaultSettings,
        routeOptions: input.routeOptions || null,
        routeOptionsRevision,
    });
    if (resolvedFromOptions) {
        return {
            routeSource: resolvedFromOptions.source,
            resolvedRoute: resolvedFromOptions,
        };
    }
    if (input.currentResolvedRoute
        && isMediaRouteReady({
            kind: input.kind,
            settings: input.defaultSettings,
            routeOptions: input.routeOptions || null,
            resolvedRoute: input.currentResolvedRoute,
            routeOptionsRevision,
        })) {
        return {
            routeSource: input.currentResolvedRoute.source,
            resolvedRoute: input.currentResolvedRoute,
        };
    }
    if (routeConfig.routeSource === 'auto' && !input.aiClient.resolveRoute) {
        return null;
    }
    const routeSource = routeConfig.routeSource === 'auto'
        ? input.fallbackRouteSource
        : routeConfig.routeSource;
    if (input.aiClient.resolveRoute) {
        const resolvedRoute = await preflightResolveMediaRoute({
            aiClient: { resolveRoute: input.aiClient.resolveRoute },
            kind: input.kind,
            settings: input.defaultSettings,
            fallbackSource: input.fallbackRouteSource,
            routeOptionsRevision,
        });
        if (resolvedRoute) {
            return {
                routeSource: resolvedRoute.source,
                resolvedRoute,
            };
        }
    }
    if (routeConfig.routeSource === 'auto') {
        return null;
    }
    const connectorId = String(routeConfig.routeBinding?.connectorId || '').trim();
    const model = String(routeConfig.model || routeConfig.routeBinding?.model || '').trim()
        || (routeSource === 'local' ? 'selected-local-model' : 'selected-token-model');
    return {
        routeSource,
        resolvedRoute: {
            source: routeSource,
            ...(connectorId ? { connectorId } : {}),
            model,
            resolvedBy: 'selected',
            resolvedAt: new Date().toISOString(),
            settingsRevision: buildMediaSettingsRevision({
                kind: input.kind,
                settings: input.defaultSettings,
            }),
            routeOptionsRevision,
        },
    };
}
async function createBlockedDecision(input: {
    intent: PendingMediaIntent;
    prepared: PreparedMediaExecution;
    blockedReason: string;
    routeSource: MediaRouteSource;
    plannerUsed?: boolean;
}): Promise<MediaExecutionDecision> {
    return {
        kind: 'blocked',
        intent: input.intent,
        prepared: input.prepared,
        blockedReason: input.blockedReason,
        routeSource: input.routeSource,
        resolvedRoute: null,
        promptTracePatch: createDecisionPatch({
            plannerUsed: Boolean(input.plannerUsed),
            plannerKind: input.intent.type,
            plannerTrigger: input.intent.plannerTrigger,
            plannerConfidence: input.intent.plannerConfidence ?? null,
            plannerBlockedReason: input.blockedReason,
            mediaDecisionSource: input.intent.source,
            mediaDecisionKind: input.intent.type,
            mediaExecutionStatus: 'blocked',
            mediaExecutionRouteSource: input.routeSource,
            mediaExecutionReason: input.blockedReason,
            mediaSpecHash: input.prepared.specHash,
            mediaCompilerRevision: input.prepared.compiled.compilerRevision,
        }),
    };
}
function createExecuteDecision(input: {
    intent: PendingMediaIntent;
    prepared: PreparedMediaExecution;
    resolvedRoute: LocalChatResolvedMediaRoute;
    plannerUsed?: boolean;
}): MediaExecutionDecision {
    return {
        kind: 'execute',
        intent: input.intent,
        prepared: input.prepared,
        resolvedRoute: input.resolvedRoute,
        promptTracePatch: createDecisionPatch({
            plannerUsed: Boolean(input.plannerUsed),
            plannerKind: input.intent.type,
            plannerTrigger: input.intent.plannerTrigger,
            plannerConfidence: input.intent.plannerConfidence ?? null,
            mediaDecisionSource: input.intent.source,
            mediaDecisionKind: input.intent.type,
            mediaExecutionStatus: 'pending',
            mediaExecutionRouteSource: input.resolvedRoute.source,
            mediaExecutionRouteModel: input.resolvedRoute.model || null,
            mediaExecutionReason: null,
            mediaSpecHash: input.prepared.specHash,
            mediaCompilerRevision: input.prepared.compiled.compilerRevision,
            mediaRouteResolvedBy: input.resolvedRoute.resolvedBy,
        }),
    };
}
export async function decideMediaExecution(input: DecideMediaExecutionInput): Promise<MediaExecutionDecision> {
    let imageResolvedRoute = input.imageResolvedRoute || null;
    let videoResolvedRoute = input.videoResolvedRoute || null;
    let imageRouteReady = isMediaRouteReady({
        kind: 'image',
        settings: input.defaultSettings,
        routeOptions: input.imageRouteOptions || null,
        resolvedRoute: imageResolvedRoute,
        routeOptionsRevision: input.imageRouteOptionsRevision,
    });
    let videoRouteReady = isMediaRouteReady({
        kind: 'video',
        settings: input.defaultSettings,
        routeOptions: input.videoRouteOptions || null,
        resolvedRoute: videoResolvedRoute,
        routeOptionsRevision: input.videoRouteOptionsRevision,
    });
    if (!imageRouteReady) {
        const resolved = await resolveAuthorityMediaRoute({
            aiClient: input.aiClient,
            kind: 'image',
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            routeOptions: input.imageRouteOptions,
            routeOptionsRevision: input.imageRouteOptionsRevision,
            currentResolvedRoute: imageResolvedRoute,
        });
        if (resolved) {
            imageResolvedRoute = resolved.resolvedRoute;
            imageRouteReady = true;
        }
    }
    if (!videoRouteReady) {
        const resolved = await resolveAuthorityMediaRoute({
            aiClient: input.aiClient,
            kind: 'video',
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            routeOptions: input.videoRouteOptions,
            routeOptionsRevision: input.videoRouteOptionsRevision,
            currentResolvedRoute: videoResolvedRoute,
        });
        if (resolved) {
            videoResolvedRoute = resolved.resolvedRoute;
            videoRouteReady = true;
        }
    }
    const imageDependencyRouteSource = resolveEffectiveMediaRouteSource({
        kind: 'image',
        settings: input.defaultSettings,
        fallbackRouteSource: input.fallbackRouteSource,
        resolvedRoute: imageResolvedRoute,
    });
    const videoDependencyRouteSource = resolveEffectiveMediaRouteSource({
        kind: 'video',
        settings: input.defaultSettings,
        fallbackRouteSource: input.fallbackRouteSource,
        resolvedRoute: videoResolvedRoute,
    });
    const imageDependencyStatus = normalizeMediaDependencyStatus({
        snapshot: input.imageDependencySnapshot,
        routeSource: imageDependencyRouteSource,
    });
    const videoDependencyStatus = normalizeMediaDependencyStatus({
        snapshot: input.videoDependencySnapshot,
        routeSource: videoDependencyRouteSource,
    });
    const imageDependencyReady = isMediaDependencyReady({
        snapshot: input.imageDependencySnapshot,
        routeSource: imageDependencyRouteSource,
    });
    const videoDependencyReady = isMediaDependencyReady({
        snapshot: input.videoDependencySnapshot,
        routeSource: videoDependencyRouteSource,
    });
    const explicitRequest = parseExplicitMediaRequest(input.userText);
    const recentMedia = summarizeRecentMedia(input.messages);
    const sceneLikelyNsfw = isPromptLikelyNsfw(`${input.userText}\n${input.assistantText}`);
    const mediaContextSnapshot = collectMediaContextSnapshot({
        target: input.target,
        messages: input.messages,
        userText: input.userText,
        assistantText: input.assistantText,
    });
    if (explicitRequest) {
        const preparedResult = await prepareMediaExecution({
            semanticIntent: buildSemanticIntentFromPrompt({
                kind: explicitRequest.kind,
                source: 'explicit',
                plannerTrigger: 'user-explicit',
                prompt: explicitRequest.prompt,
            }),
            pendingMessageId: `msg-${input.turnTxnId}-explicit-media`,
            target: input.target,
            targetId: input.target.id,
            worldId: input.worldId,
            userText: input.userText,
            assistantText: input.assistantText,
            contextSnapshot: mediaContextSnapshot,
        });
        const gate = evaluateIntentGate({
            intent: preparedResult.intent,
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            nsfwPolicy: input.nsfwPolicy,
            imageRouteReady,
            videoRouteReady,
            imageDependencyReady,
            videoDependencyReady,
            requireDependencyReady: false,
        });
        if (!gate.allowed) {
            return createBlockedDecision({
                intent: preparedResult.intent,
                prepared: preparedResult.prepared,
                blockedReason: gate.blockedReason,
                routeSource: gate.routeSource,
            });
        }
        const resolved = await resolveAuthorityMediaRoute({
            aiClient: input.aiClient,
            kind: preparedResult.intent.type,
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            routeOptions: preparedResult.intent.type === 'image' ? input.imageRouteOptions : input.videoRouteOptions,
            routeOptionsRevision: preparedResult.intent.type === 'image'
                ? input.imageRouteOptionsRevision
                : input.videoRouteOptionsRevision,
            currentResolvedRoute: preparedResult.intent.type === 'image' ? imageResolvedRoute : videoResolvedRoute,
        });
        if (!resolved) {
            return createBlockedDecision({
                intent: preparedResult.intent,
                prepared: preparedResult.prepared,
                blockedReason: buildMediaGateBlockedMessage({
                    type: preparedResult.intent.type,
                    reason: 'route-not-ready',
                    routeSource: resolveConfiguredMediaRouteSource({
                        kind: preparedResult.intent.type,
                        settings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                    }),
                }),
                routeSource: resolveConfiguredMediaRouteSource({
                    kind: preparedResult.intent.type,
                    settings: input.defaultSettings,
                    fallbackRouteSource: input.fallbackRouteSource,
                }),
            });
        }
        return createExecuteDecision({
            intent: preparedResult.intent,
            prepared: preparedResult.prepared,
            resolvedRoute: resolved.resolvedRoute,
        });
    }
    const mediaAutonomy = input.resolvedPolicy.mediaPolicy.autonomy;
    const canAutoImage = input.resolvedPolicy.mediaPolicy.allowVisualAuto && imageRouteReady && imageDependencyReady;
    const canAutoVideo = input.resolvedPolicy.mediaPolicy.allowVisualAuto && videoRouteReady && videoDependencyReady;
    const plannerLocalBlockReason = (() => {
        if (mediaAutonomy === 'off')
            return 'planner-disabled';
        if (mediaAutonomy === 'explicit-only')
            return 'explicit-only-mode';
        if (recentMedia.hasPendingMedia)
            return 'pending-media-active';
        if (recentMedia.autoMediaCooling)
            return 'media-cooldown-active';
        if (isStructuredAssistantReply(input.assistantText))
            return 'structured-reply';
        if (!canAutoImage && !canAutoVideo)
            return 'no-ready-media-route';
        if (sceneLikelyNsfw
            && input.nsfwPolicy === 'allowed'
            && !input.resolvedPolicy.mediaPolicy.allowAutoVisualHighRisk) {
            return 'relationship-boundary-blocked';
        }
        if (sceneLikelyNsfw
            && !((canAutoImage && isMediaGenerationAllowed({
                policy: input.nsfwPolicy,
                routeSource: resolveConfiguredMediaRouteSource({
                    kind: 'image',
                    settings: input.defaultSettings,
                    fallbackRouteSource: input.fallbackRouteSource,
                }),
                prompt: `${input.userText}\n${input.assistantText}`,
                isNsfwPrompt: true,
            }))
                || (canAutoVideo && isMediaGenerationAllowed({
                    policy: input.nsfwPolicy,
                    routeSource: resolveConfiguredMediaRouteSource({
                        kind: 'video',
                        settings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                    }),
                    prompt: `${input.userText}\n${input.assistantText}`,
                    isNsfwPrompt: true,
                })))) {
            return 'nsfw-policy-blocked';
        }
        return null;
    })();
    let fallbackPromptTracePatch = createDecisionPatch({
        plannerBlockedReason: plannerLocalBlockReason,
    });
    if (!plannerLocalBlockReason) {
        const plannerResult = await planMediaTurn({
            aiClient: input.aiClient,
            routeBinding: input.routeBinding,
            userText: input.userText,
            assistantText: input.assistantText,
            target: input.target,
            worldId: input.worldId,
            nsfwPolicy: input.nsfwPolicy,
            imageReady: canAutoImage,
            videoReady: canAutoVideo,
            imageDependencyStatus,
            videoDependencyStatus,
            recentMediaSummary: recentMedia.summary,
            promptTrace: input.promptTrace,
            visualAnchorSummary: mediaContextSnapshot.visualAnchorSummary,
            recentTurnSummary: mediaContextSnapshot.recentTurnSummary,
            continuitySummary: mediaContextSnapshot.continuitySummary,
        });
        if (plannerResult.status === 'ok') {
            const decision = plannerResult.decision;
            if (decision.kind !== 'none') {
                const preparedResult = await prepareMediaExecution({
                    semanticIntent: buildSemanticIntentFromPlannerDecision({ decision }),
                    pendingMessageId: `msg-${input.turnTxnId}-planner-media`,
                    target: input.target,
                    targetId: input.target.id,
                    worldId: input.worldId,
                    userText: input.userText,
                    assistantText: input.assistantText,
                    contextSnapshot: mediaContextSnapshot,
                });
                const confidenceThreshold = preparedResult.intent.type === 'image'
                    ? IMAGE_AUTO_CONFIDENCE_THRESHOLD
                    : VIDEO_AUTO_CONFIDENCE_THRESHOLD;
                const plannerBlockedReason = (() => {
                    if (decision.confidence < confidenceThreshold)
                        return 'planner-confidence-too-low';
                    if (preparedResult.intent.type === 'video'
                        && !hasVideoMotionSignal({
                            userText: input.userText,
                            assistantText: input.assistantText,
                            decision,
                        })) {
                        return 'video-motion-signal-missing';
                    }
                    if (decision.trigger === 'assistant-offer'
                        && !hasAssistantOfferSignal(input.assistantText)) {
                        return 'assistant-offer-signal-missing';
                    }
                    if (decision.trigger === 'scene-enhancement'
                        && !hasVisualSceneSignal({
                            userText: input.userText,
                            assistantText: input.assistantText,
                            decision,
                        })) {
                        return 'scene-signal-too-weak';
                    }
                    if (preparedResult.intent.type === 'video' && recentMedia.autoVideoCooling)
                        return 'video-cooldown-active';
                    if (input.nsfwPolicy === 'allowed'
                        && (preparedResult.intent.plannerSuggestsNsfw
                            || isPromptLikelyNsfw(preparedResult.intent.prompt))
                        && !input.resolvedPolicy.mediaPolicy.allowAutoVisualHighRisk) {
                        return 'relationship-boundary-blocked';
                    }
                    const gate = evaluateIntentGate({
                        intent: preparedResult.intent,
                        defaultSettings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                        nsfwPolicy: input.nsfwPolicy,
                        imageRouteReady,
                        videoRouteReady,
                        imageDependencyReady,
                        videoDependencyReady,
                    });
                    if (!gate.allowed)
                        return gate.blockedReason;
                    return null;
                })();
                if (!plannerBlockedReason) {
                    const resolved = await resolveAuthorityMediaRoute({
                        aiClient: input.aiClient,
                        kind: preparedResult.intent.type,
                        defaultSettings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                        routeOptions: preparedResult.intent.type === 'image' ? input.imageRouteOptions : input.videoRouteOptions,
                        routeOptionsRevision: preparedResult.intent.type === 'image'
                            ? input.imageRouteOptionsRevision
                            : input.videoRouteOptionsRevision,
                        currentResolvedRoute: preparedResult.intent.type === 'image' ? imageResolvedRoute : videoResolvedRoute,
                    });
                    if (!resolved) {
                        fallbackPromptTracePatch = createDecisionPatch({
                            plannerUsed: true,
                            plannerKind: decision.kind,
                            plannerTrigger: decision.trigger,
                            plannerConfidence: decision.confidence,
                            plannerBlockedReason: 'route-not-ready',
                            mediaSpecHash: preparedResult.prepared.specHash,
                            mediaCompilerRevision: preparedResult.prepared.compiled.compilerRevision,
                        });
                    }
                    else {
                        return createExecuteDecision({
                            intent: preparedResult.intent,
                            prepared: preparedResult.prepared,
                            resolvedRoute: resolved.resolvedRoute,
                            plannerUsed: true,
                        });
                    }
                }
                fallbackPromptTracePatch = createDecisionPatch({
                    plannerUsed: true,
                    plannerKind: decision.kind,
                    plannerTrigger: decision.trigger,
                    plannerConfidence: decision.confidence,
                    plannerBlockedReason,
                    mediaSpecHash: preparedResult.prepared.specHash,
                    mediaCompilerRevision: preparedResult.prepared.compiled.compilerRevision,
                });
            }
            else {
                fallbackPromptTracePatch = createDecisionPatch({
                    plannerUsed: true,
                    plannerConfidence: decision.confidence,
                    plannerBlockedReason: decision.reason || null,
                });
            }
        }
        else {
            fallbackPromptTracePatch = createDecisionPatch({
                plannerUsed: true,
                plannerBlockedReason: `planner-failed:${plannerResult.reason}`,
            });
        }
    }
    if (input.markerOverrideIntent) {
        const preparedResult = await prepareMediaExecution({
            semanticIntent: buildSemanticIntentFromPrompt({
                kind: input.markerOverrideIntent.type,
                source: 'tag',
                plannerTrigger: 'marker-override',
                prompt: input.markerOverrideIntent.prompt,
                confidence: input.markerOverrideIntent.plannerConfidence,
                nsfwIntent: input.markerOverrideIntent.plannerSuggestsNsfw ? 'suggested' : 'none',
            }),
            pendingMessageId: input.markerOverrideIntent.pendingMessageId,
            target: input.target,
            targetId: input.target.id,
            worldId: input.worldId,
            userText: input.userText,
            assistantText: input.assistantText,
            contextSnapshot: mediaContextSnapshot,
        });
        const gate = evaluateIntentGate({
            intent: preparedResult.intent,
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            nsfwPolicy: input.nsfwPolicy,
            imageRouteReady,
            videoRouteReady,
            imageDependencyReady,
            videoDependencyReady,
        });
        if (!gate.allowed) {
            return {
                ...(await createBlockedDecision({
                    intent: preparedResult.intent,
                    prepared: preparedResult.prepared,
                    blockedReason: gate.blockedReason,
                    routeSource: gate.routeSource,
                })),
                promptTracePatch: {
                    ...fallbackPromptTracePatch,
                    plannerKind: preparedResult.intent.type,
                    plannerTrigger: 'marker-override',
                    plannerBlockedReason: gate.blockedReason,
                    mediaDecisionSource: 'tag',
                    mediaDecisionKind: preparedResult.intent.type,
                    mediaExecutionStatus: 'blocked',
                    mediaExecutionRouteSource: gate.routeSource,
                    mediaExecutionReason: gate.blockedReason,
                    mediaSpecHash: preparedResult.prepared.specHash,
                    mediaCompilerRevision: preparedResult.prepared.compiled.compilerRevision,
                },
            };
        }
        const resolved = await resolveAuthorityMediaRoute({
            aiClient: input.aiClient,
            kind: preparedResult.intent.type,
            defaultSettings: input.defaultSettings,
            fallbackRouteSource: input.fallbackRouteSource,
            routeOptions: preparedResult.intent.type === 'image' ? input.imageRouteOptions : input.videoRouteOptions,
            routeOptionsRevision: preparedResult.intent.type === 'image'
                ? input.imageRouteOptionsRevision
                : input.videoRouteOptionsRevision,
            currentResolvedRoute: preparedResult.intent.type === 'image' ? imageResolvedRoute : videoResolvedRoute,
        });
        if (!resolved) {
            return {
                kind: 'blocked',
                intent: preparedResult.intent,
                prepared: preparedResult.prepared,
                blockedReason: buildMediaGateBlockedMessage({
                    type: preparedResult.intent.type,
                    reason: 'route-not-ready',
                    routeSource: resolveConfiguredMediaRouteSource({
                        kind: preparedResult.intent.type,
                        settings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                    }),
                }),
                routeSource: resolveConfiguredMediaRouteSource({
                    kind: preparedResult.intent.type,
                    settings: input.defaultSettings,
                    fallbackRouteSource: input.fallbackRouteSource,
                }),
                resolvedRoute: null,
                promptTracePatch: {
                    ...fallbackPromptTracePatch,
                    plannerKind: preparedResult.intent.type,
                    plannerTrigger: 'marker-override',
                    plannerBlockedReason: 'route-not-ready',
                    mediaDecisionSource: 'tag',
                    mediaDecisionKind: preparedResult.intent.type,
                    mediaExecutionStatus: 'blocked',
                    mediaExecutionRouteSource: resolveConfiguredMediaRouteSource({
                        kind: preparedResult.intent.type,
                        settings: input.defaultSettings,
                        fallbackRouteSource: input.fallbackRouteSource,
                    }),
                    mediaExecutionRouteModel: null,
                    mediaExecutionReason: 'route-not-ready',
                    mediaSpecHash: preparedResult.prepared.specHash,
                    mediaCompilerRevision: preparedResult.prepared.compiled.compilerRevision,
                },
            };
        }
        return {
            ...createExecuteDecision({
                intent: preparedResult.intent,
                prepared: preparedResult.prepared,
                resolvedRoute: resolved.resolvedRoute,
            }),
            promptTracePatch: {
                ...fallbackPromptTracePatch,
                plannerKind: preparedResult.intent.type,
                plannerTrigger: 'marker-override',
                plannerBlockedReason: null,
                mediaDecisionSource: 'tag',
                mediaDecisionKind: preparedResult.intent.type,
                mediaExecutionStatus: 'pending',
                mediaExecutionRouteSource: resolved.resolvedRoute.source,
                mediaExecutionRouteModel: resolved.resolvedRoute.model || null,
                mediaExecutionReason: null,
                mediaSpecHash: preparedResult.prepared.specHash,
                mediaCompilerRevision: preparedResult.prepared.compiled.compilerRevision,
                mediaRouteResolvedBy: resolved.resolvedRoute.resolvedBy,
            },
        };
    }
    return {
        kind: 'none',
        promptTracePatch: fallbackPromptTracePatch,
    };
}
