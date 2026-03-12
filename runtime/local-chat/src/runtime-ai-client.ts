import { emitLocalChatLog } from './logging.js';
import { buildLocalImageWorkflowExtensions, type ModRuntimeClient, type ModRuntimeLocalArtifactRecord, type ModRuntimeResolvedBinding, type RuntimeCanonicalCapability, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
type LocalChatFinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error';
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
    referenceImages?: string[];
    extensions?: Record<string, unknown>;
    timeoutMs?: number;
};
export type LocalChatAiVideoRequest = LocalChatAiRouteInput & {
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
    generateObject(input: LocalChatAiTextRequest & {
        parse?: (text: string) => Record<string, unknown>;
    }): Promise<{
        object: Record<string, unknown>;
        text: string;
        traceId: string;
        promptTraceId: string;
        route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
    }>;
    streamText(input: LocalChatAiTextRequest): AsyncIterable<{
        type: 'text_delta';
        textDelta: string;
    } | {
        type: 'done';
        traceId?: string;
        finishReason?: LocalChatFinishReason;
    }>;
    generateImage(input: LocalChatAiImageRequest): Promise<{
        images: Array<{
            uri?: string;
            b64Json?: string;
            mimeType?: string;
        }>;
        traceId: string;
        route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
    }>;
    generateVideo(input: LocalChatAiVideoRequest): Promise<{
        videos: Array<{
            uri?: string;
            mimeType?: string;
        }>;
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
export type LocalChatGenerateObjectFailureStage = 'call' | 'parse' | 'unknown';
type LocalChatGenerateObjectFailureError = Error & {
    failureStage: Exclude<LocalChatGenerateObjectFailureStage, 'unknown'>;
    reasonCode: string;
    traceId: string | null;
    rawTextPreview: string | null;
    rawTextChars: number;
    errorName: string | null;
};
export type LocalChatGenerateObjectFailureDetails = {
    failureStage: LocalChatGenerateObjectFailureStage;
    reasonCode: string;
    traceId: string | null;
    rawTextPreview: string | null;
    rawTextChars: number;
    errorName: string | null;
};
export type LocalChatAudioPlaybackSource = {
    audioUri?: string;
    audioBytes?: Uint8Array;
    mimeType?: string;
};
function resolveCapability(capability: LocalChatAiRouteInput['capability'], fallback: RuntimeCanonicalCapability = 'text.generate'): RuntimeCanonicalCapability {
    return capability || fallback;
}
const LOCAL_CHAT_LOCAL_IMAGE_MODEL_ID = 'z_image_turbo';
const LOCAL_CHAT_LOCAL_IMAGE_FAMILY = 'z-image';
const LOCAL_CHAT_LOCAL_IMAGE_SIZE = '512x512';
const LOCAL_CHAT_LOCAL_IMAGE_STEP = 8;
const LOCAL_CHAT_LOCAL_IMAGE_TIMEOUT_MS = 600000;
function normalizeLocalImageModelId(value: unknown): string {
    let normalized = String(value ?? '').trim().toLowerCase();
    if (normalized.startsWith('localai/'))
        normalized = normalized.slice('localai/'.length).trim();
    if (normalized.startsWith('local/'))
        normalized = normalized.slice('local/'.length).trim();
    return normalized;
}
function metadataString(metadata: Record<string, unknown> | undefined, key: string): string {
    if (!metadata)
        return '';
    const direct = metadata[key];
    if (typeof direct === 'string') {
        return direct.trim();
    }
    if (direct && typeof direct === 'object') {
        const record = direct as Record<string, unknown>;
        if (typeof record.stringValue === 'string') {
            return record.stringValue.trim();
        }
        const kind = record.kind;
        if (kind && typeof kind === 'object') {
            const kindRecord = kind as Record<string, unknown>;
            if (kindRecord.oneofKind === 'stringValue' && typeof kindRecord.stringValue === 'string') {
                return kindRecord.stringValue.trim();
            }
        }
    }
    const fields = metadata.fields;
    if (fields && typeof fields === 'object') {
        return metadataString(fields as Record<string, unknown>, key);
    }
    return '';
}
function isSelectableLocalArtifact(artifact: ModRuntimeLocalArtifactRecord): boolean {
    return artifact.status === 'active' || artifact.status === 'installed';
}
function localArtifactSortValue(artifact: ModRuntimeLocalArtifactRecord): [
    number,
    number,
    string
] {
    const familyPriority = metadataString(artifact.metadata, 'family').toLowerCase() === LOCAL_CHAT_LOCAL_IMAGE_FAMILY
        ? 0
        : 1;
    const statusPriority = artifact.status === 'active'
        ? 0
        : artifact.status === 'installed'
            ? 1
            : 9;
    return [familyPriority, statusPriority, artifact.artifactId];
}
function pickLocalImageCompanionArtifact(artifacts: ModRuntimeLocalArtifactRecord[], kind: 'vae' | 'llm'): ModRuntimeLocalArtifactRecord | null {
    const matches = artifacts
        .filter((artifact) => artifact.engine.toLowerCase() === 'localai')
        .filter(isSelectableLocalArtifact)
        .filter((artifact) => artifact.kind === kind)
        .sort((left, right) => {
        const leftKey = localArtifactSortValue(left);
        const rightKey = localArtifactSortValue(right);
        if (leftKey[0] !== rightKey[0])
            return leftKey[0] - rightKey[0];
        if (leftKey[1] !== rightKey[1])
            return leftKey[1] - rightKey[1];
        return leftKey[2].localeCompare(rightKey[2]);
    });
    return matches[0] || null;
}
function shouldInjectLocalImageWorkflow(input: {
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
    requestedModel?: string;
}): boolean {
    if (input.route.source !== 'local')
        return false;
    const resolvedModel = normalizeLocalImageModelId(input.requestedModel
        || input.route.model
        || input.route.modelId
        || input.route.localModelId);
    if (resolvedModel !== LOCAL_CHAT_LOCAL_IMAGE_MODEL_ID) {
        return false;
    }
    const engine = String(input.route.engine || input.route.provider || '').trim().toLowerCase();
    return !engine || engine === 'localai' || engine === 'local';
}
async function resolveLocalImageExtensions(input: {
    runtimeClient: ModRuntimeClient;
    route: Awaited<ReturnType<LocalChatAiClient['resolveRoute']>>;
    requestedModel?: string;
    extensions?: Record<string, unknown>;
}): Promise<Record<string, unknown> | undefined> {
    if (!shouldInjectLocalImageWorkflow({
        route: input.route,
        requestedModel: input.requestedModel,
    })) {
        return input.extensions;
    }
    emitLocalChatLog({
        level: 'debug',
        message: 'local-chat:image-localai-workflow:inject:start',
        details: {
            routeSource: input.route.source,
            provider: input.route.provider,
            engine: input.route.engine,
            routeModel: input.route.model,
            requestedModel: input.requestedModel || '',
        },
    });
    const artifacts = await input.runtimeClient.local.listArtifacts({ engine: 'localai' });
    const vaeArtifact = pickLocalImageCompanionArtifact(artifacts, 'vae');
    const llmArtifact = pickLocalImageCompanionArtifact(artifacts, 'llm');
    if (!vaeArtifact || !llmArtifact) {
        emitLocalChatLog({
            level: 'error',
            message: 'local-chat:image-localai-workflow:inject:companions-missing',
            details: {
                routeModel: input.route.model,
                requestedModel: input.requestedModel || '',
                selectableArtifacts: artifacts
                    .filter(isSelectableLocalArtifact)
                    .map((artifact) => ({
                    artifactId: artifact.artifactId,
                    localArtifactId: artifact.localArtifactId,
                    kind: artifact.kind,
                    status: artifact.status,
                    family: metadataString(artifact.metadata, 'family'),
                })),
            },
        });
        throw new Error('Local image route requires installed companion artifacts (VAE and LLM). Verify z_image_ae and qwen3_4b_companion in Runtime and try again.');
    }
    const baseExtensions: Record<string, unknown> = {
        ...(input.extensions || {}),
        size: LOCAL_CHAT_LOCAL_IMAGE_SIZE,
    };
    delete baseExtensions.aspectRatio;
    const resolvedExtensions = buildLocalImageWorkflowExtensions({
        components: [
            { slot: 'vae_path', localArtifactId: vaeArtifact.localArtifactId },
            { slot: 'llm_path', localArtifactId: llmArtifact.localArtifactId },
        ],
        profileOverrides: {
            step: LOCAL_CHAT_LOCAL_IMAGE_STEP,
        },
    }, baseExtensions);
    emitLocalChatLog({
        level: 'info',
        message: 'local-chat:image-localai-workflow:inject:ready',
        details: {
            routeModel: input.route.model,
            requestedModel: input.requestedModel || '',
            injectedSize: LOCAL_CHAT_LOCAL_IMAGE_SIZE,
            injectedStep: LOCAL_CHAT_LOCAL_IMAGE_STEP,
            vaeArtifactId: vaeArtifact.artifactId,
            vaeLocalArtifactId: vaeArtifact.localArtifactId,
            llmArtifactId: llmArtifact.artifactId,
            llmLocalArtifactId: llmArtifact.localArtifactId,
            inheritedStyle: typeof baseExtensions.style === 'string' ? baseExtensions.style : '',
            inheritedQuality: typeof baseExtensions.quality === 'string' ? baseExtensions.quality : '',
        },
    });
    return resolvedExtensions;
}
function createRawTextPreview(text: string): string | null {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, 280) : null;
}
function createGenerateObjectFailureError(input: {
    failureStage: Exclude<LocalChatGenerateObjectFailureStage, 'unknown'>;
    reasonCode: string;
    traceId?: string | null;
    rawText?: string;
    error: unknown;
}): LocalChatGenerateObjectFailureError {
    const wrapped = new Error(input.failureStage === 'call'
        ? 'LOCAL_CHAT_AI_GENERATE_OBJECT_CALL_FAILED'
        : 'LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED') as LocalChatGenerateObjectFailureError;
    const rawText = String(input.rawText || '');
    wrapped.failureStage = input.failureStage;
    wrapped.reasonCode = String(input.reasonCode || wrapped.message);
    wrapped.traceId = String(input.traceId || '').trim() || null;
    wrapped.rawTextPreview = createRawTextPreview(rawText);
    wrapped.rawTextChars = rawText.length;
    wrapped.errorName = input.error instanceof Error ? input.error.name : null;
    return wrapped;
}
export function describeLocalChatGenerateObjectFailure(error: unknown): LocalChatGenerateObjectFailureDetails {
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const failureStage = record.failureStage;
        if (failureStage === 'call' || failureStage === 'parse' || failureStage === 'unknown') {
            return {
                failureStage,
                reasonCode: String(record.reasonCode || (error instanceof Error ? error.message : 'UNKNOWN_ERROR')),
                traceId: String(record.traceId || '').trim() || null,
                rawTextPreview: String(record.rawTextPreview || '').trim() || null,
                rawTextChars: Number.isFinite(Number(record.rawTextChars)) ? Math.max(0, Number(record.rawTextChars)) : 0,
                errorName: String(record.errorName || (error instanceof Error ? error.name : '')).trim() || null,
            };
        }
    }
    return {
        failureStage: 'unknown',
        reasonCode: error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR'),
        traceId: null,
        rawTextPreview: null,
        rawTextChars: 0,
        errorName: error instanceof Error ? error.name : null,
    };
}
function extractJsonFromText(text: string): string {
    const trimmed = text.trim();
    // Strategy 1: extract from markdown code fence anywhere in text
    const fenceMatch = trimmed.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
    const fencedJson = fenceMatch?.[1];
    if (fencedJson)
        return fencedJson.trim();
    // Strategy 2: find first { and last } to extract JSON object
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
    }
    if (firstBrace !== -1) {
        return trimmed.slice(firstBrace);
    }
    return trimmed;
}
/**
 * Attempt to repair common JSON issues from LLM output:
 * - Raw control chars inside strings: escape them
 * - Unterminated strings: close them
 * - Unclosed arrays/objects: close them
 * - Unquoted object keys: quote them
 * - Bare string values after colon: quote them
 * - Trailing commas before } or ]
 */
function repairJson(text: string): string {
    let json = text;
    json = sanitizeJsonStringLiterals(json);
    json = balanceJsonContainers(json);
    json = quoteBareJsonKeys(json);
    json = quoteBareJsonValues(json);
    json = json.replace(/,\s*([}\]])/g, '$1');
    return json;
}
function sanitizeJsonStringLiterals(text: string): string {
    let sanitized = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i] || '';
        if (inString) {
            if (escaped) {
                if (ch === '\n') {
                    sanitized += 'n';
                    escaped = false;
                    continue;
                }
                if (ch === '\r') {
                    sanitized += 'r';
                    escaped = false;
                    continue;
                }
                if (ch === '\t') {
                    sanitized += 't';
                    escaped = false;
                    continue;
                }
                sanitized += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                sanitized += ch;
                escaped = true;
                continue;
            }
            if (ch === '"') {
                sanitized += ch;
                inString = false;
                continue;
            }
            if (ch === '\n') {
                sanitized += '\\n';
                continue;
            }
            if (ch === '\r') {
                sanitized += '\\r';
                continue;
            }
            if (ch === '\t') {
                sanitized += '\\t';
                continue;
            }
            sanitized += ch;
            continue;
        }
        if (ch === '"') {
            sanitized += ch;
            inString = true;
            escaped = false;
            continue;
        }
        sanitized += ch;
    }
    if (inString) {
        if (escaped) {
            sanitized += '\\';
        }
        sanitized += '"';
    }
    return sanitized;
}
function balanceJsonContainers(text: string): string {
    let json = text;
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (ch === '{')
            openBraces++;
        else if (ch === '}')
            openBraces--;
        else if (ch === '[')
            openBrackets++;
        else if (ch === ']')
            openBrackets--;
    }
    // Close unclosed arrays then objects
    while (openBrackets > 0) {
        json += ']';
        openBrackets--;
    }
    while (openBraces > 0) {
        json += '}';
        openBraces--;
    }
    return json;
}
function quoteBareJsonKeys(text: string): string {
    return text.replace(/([{,]\s*)([^"{\[\]},:\s][^:{},\[\]]*?)(\s*:)/g, (_match, prefix: string, key: string, suffix: string) => `${prefix}${JSON.stringify(String(key || '').trim())}${suffix}`);
}
function quoteBareJsonValues(text: string): string {
    return text.replace(/(:\s*)([^"{\[\]},\s][^,\]}]*)(?=\s*[,}\]])/g, (_match, prefix: string, rawValue: string) => {
        const value = String(rawValue || '').trim();
        if (!value) {
            return prefix;
        }
        if (/^(?:true|false|null)$/u.test(value)) {
            return `${prefix}${value}`;
        }
        if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value)) {
            return `${prefix}${value}`;
        }
        return `${prefix}${JSON.stringify(value)}`;
    });
}
function parseJsonObject(text: string): Record<string, unknown> {
    const extracted = extractJsonFromText(String(text || '').trim());
    if (!extracted) {
        throw new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_EMPTY_TEXT');
    }
    // Try strict parse first
    try {
        const parsed = JSON.parse(extracted);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    }
    catch {
        // Fall through to repair attempt
    }
    // Try repaired parse
    const repaired = repairJson(extracted);
    const parsed = JSON.parse(repaired);
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
            let textResult;
            try {
                textResult = await runtimeClient.ai.text.generate({
                    input: input.prompt,
                    system: input.systemPrompt,
                    maxTokens: input.maxTokens,
                    timeoutMs: input.timeoutMs,
                    temperature: input.temperature,
                    binding: input.routeBinding,
                });
            }
            catch (error) {
                throw createGenerateObjectFailureError({
                    failureStage: 'call',
                    reasonCode: error instanceof Error ? error.message : String(error || 'LOCAL_CHAT_AI_GENERATE_OBJECT_CALL_FAILED'),
                    error,
                });
            }
            const text = String(textResult.text || '');
            const traceId = String(textResult.trace?.traceId || '').trim();
            let object: Record<string, unknown>;
            try {
                object = parser(text);
            }
            catch (error) {
                throw createGenerateObjectFailureError({
                    failureStage: 'parse',
                    reasonCode: error instanceof Error ? error.message : String(error || 'LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED'),
                    traceId,
                    rawText: text,
                    error,
                });
            }
            return {
                object,
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
                    yield {
                        type: 'done',
                        traceId: String(event.trace?.traceId || '').trim() || undefined,
                        finishReason: event.finishReason,
                    };
                    continue;
                }
                if (event.type === 'error') {
                    throw event.error;
                }
            }
        },
        generateImage: async (input) => {
            const route = await resolveRoute(input);
            const useLocalImageWorkflow = shouldInjectLocalImageWorkflow({
                route,
                requestedModel: input.model,
            });
            const inputTimeoutMs = Number(input.timeoutMs || 0);
            const resolvedTimeoutMs = useLocalImageWorkflow
                ? Math.max(Number.isFinite(inputTimeoutMs) && inputTimeoutMs > 0 ? inputTimeoutMs : 0, LOCAL_CHAT_LOCAL_IMAGE_TIMEOUT_MS)
                : (Number.isFinite(inputTimeoutMs) && inputTimeoutMs > 0 ? inputTimeoutMs : undefined);
            try {
                const extensions = await resolveLocalImageExtensions({
                    runtimeClient,
                    route,
                    requestedModel: input.model,
                    extensions: input.extensions,
                });
                emitLocalChatLog({
                    level: 'info',
                    message: 'local-chat:image-generate:request',
                    details: {
                        routeSource: route.source,
                        provider: route.provider,
                        engine: route.engine,
                        routeModel: route.model,
                        requestedModel: input.model || '',
                        promptChars: input.prompt.length,
                        hasNegativePrompt: Boolean(String(input.negativePrompt || '').trim()),
                        hasReferenceImages: Array.isArray(input.referenceImages) && input.referenceImages.length > 0,
                        extensionKeys: Object.keys(extensions || {}),
                        size: typeof extensions?.size === 'string' ? extensions.size : '',
                        aspectRatio: typeof extensions?.aspectRatio === 'string' ? extensions.aspectRatio : '',
                        style: typeof extensions?.style === 'string' ? extensions.style : '',
                        quality: typeof extensions?.quality === 'string' ? extensions.quality : '',
                        componentCount: Array.isArray(extensions?.components) ? extensions.components.length : 0,
                        profileOverrides: extensions?.profile_overrides && typeof extensions.profile_overrides === 'object'
                            ? extensions.profile_overrides
                            : null,
                        timeoutMs: resolvedTimeoutMs || 0,
                        dispatchModel: route.source === 'local'
                            ? (route.model || input.model || '')
                            : (input.model || route.model || ''),
                    },
                });
                const resolvedImageModel = route.source === 'local'
                    ? (route.model || input.model || undefined)
                    : (input.model || route.model || undefined);
                const response = await runtimeClient.media.image.generate({
                    prompt: input.prompt,
                    negativePrompt: input.negativePrompt,
                    model: resolvedImageModel,
                    referenceImages: input.referenceImages,
                    binding: input.routeBinding,
                    extensions,
                    timeoutMs: resolvedTimeoutMs,
                });
                const traceId = String(response.trace?.traceId || '').trim();
                emitLocalChatLog({
                    level: 'info',
                    message: 'local-chat:image-generate:response',
                    details: {
                        routeSource: route.source,
                        routeModel: route.model,
                        traceId,
                        artifactCount: response.artifacts.length,
                        mimeTypes: response.artifacts.map((artifact) => String(artifact.mimeType || '').trim()).filter(Boolean),
                    },
                });
                return {
                    images: response.artifacts.map((artifact) => ({
                        uri: artifact.uri || undefined,
                        b64Json: artifact.bytes && artifact.bytes.length > 0 ? encodeBase64(artifact.bytes) : undefined,
                        mimeType: artifact.mimeType || undefined,
                    })),
                    traceId,
                    route,
                };
            }
            catch (error) {
                emitLocalChatLog({
                    level: 'error',
                    message: 'local-chat:image-generate:failed',
                    details: {
                        routeSource: route.source,
                        provider: route.provider,
                        engine: route.engine,
                        routeModel: route.model,
                        requestedModel: input.model || '',
                        error: error instanceof Error ? error.message : String(error || 'unknown error'),
                        reasonCode: (error
                            && typeof error === 'object'
                            && 'reasonCode' in error) ? String((error as {
                            reasonCode?: unknown;
                        }).reasonCode || '') : '',
                    },
                });
                throw error;
            }
        },
        generateVideo: async (input) => {
            const route = await resolveRoute(input);
            try {
                emitLocalChatLog({
                    level: 'info',
                    message: 'local-chat:video-generate:request',
                    details: {
                        routeSource: route.source,
                        provider: route.provider,
                        engine: route.engine,
                        routeModel: route.model,
                        requestedModel: input.model || '',
                        mode: input.mode,
                        contentCount: Array.isArray(input.content) ? input.content.length : 0,
                        hasPrompt: Boolean(String(input.prompt || '').trim()),
                    },
                });
                const response = await runtimeClient.media.video.generate({
                    mode: input.mode,
                    prompt: input.prompt,
                    negativePrompt: input.negativePrompt,
                    model: input.model || route.model || undefined,
                    content: input.content,
                    options: input.options,
                    binding: input.routeBinding,
                });
                const traceId = String(response.trace?.traceId || '').trim();
                emitLocalChatLog({
                    level: 'info',
                    message: 'local-chat:video-generate:response',
                    details: {
                        routeSource: route.source,
                        routeModel: route.model,
                        traceId,
                        artifactCount: response.artifacts.length,
                        mimeTypes: response.artifacts.map((artifact) => String(artifact.mimeType || '').trim()).filter(Boolean),
                    },
                });
                return {
                    videos: response.artifacts.map((artifact) => ({
                        uri: artifact.uri || undefined,
                        mimeType: artifact.mimeType || undefined,
                    })),
                    traceId,
                    route,
                };
            }
            catch (error) {
                emitLocalChatLog({
                    level: 'error',
                    message: 'local-chat:video-generate:failed',
                    details: {
                        routeSource: route.source,
                        provider: route.provider,
                        engine: route.engine,
                        routeModel: route.model,
                        requestedModel: input.model || '',
                        error: error instanceof Error ? error.message : String(error || 'unknown error'),
                        reasonCode: (error
                            && typeof error === 'object'
                            && 'reasonCode' in error) ? String((error as {
                            reasonCode?: unknown;
                        }).reasonCode || '') : '',
                    },
                });
                throw error;
            }
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
                binding: input.routeBinding,
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
                }
                catch {
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
