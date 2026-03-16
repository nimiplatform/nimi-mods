import { Runtime, ExecutionMode, ScenarioType } from '@nimiplatform/sdk/runtime';
import util from 'node:util';
import { loadGoldFixture, loadGoldFixtureAudioInput } from '../../../../../scripts/ai-gold-path/fixtures.mjs';
import { createLocalChatAiClient } from '../../src/runtime-ai-client.js';
import { createModRuntimeClient, type ModRuntimeHost } from "@nimiplatform/sdk/mod";
const VoiceReferenceKind = {
    PRESET: 1,
    VOICE_ASSET: 2,
    PROVIDER_VOICE_REF: 3,
} as const;
function toTokenApiModelID(modelId: string): string {
    const normalized = String(modelId || '').trim();
    if (!normalized || normalized.startsWith('cloud/') || normalized.includes('/')) {
        return normalized;
    }
    return `cloud/${normalized}`;
}
function readArg(flag: string): string {
    const index = process.argv.indexOf(flag);
    if (index < 0) {
        return '';
    }
    return String(process.argv[index + 1] || '').trim();
}
function requireGoldSubjectUserId(): string {
    const value = String(process.env.NIMI_LIVE_GOLD_SUBJECT_USER_ID || '').trim();
    if (!value) {
        throw new Error('NIMI_LIVE_GOLD_SUBJECT_USER_ID_REQUIRED');
    }
    return value;
}

function redirectConsoleToStderr(): void {
    const methods: Array<'log' | 'info' | 'debug' | 'warn' | 'error'> = ['log', 'info', 'debug', 'warn', 'error'];
    for (const method of methods) {
        console[method] = (...args: unknown[]) => {
            const rendered = util.format(...args);
            process.stderr.write(`${rendered}\n`);
        };
    }
}
function trimPreview(value: string): string {
    const normalized = String(value || '').trim();
    return normalized.length > 120 ? normalized.slice(0, 120) : normalized;
}
function summarizeArtifacts(artifacts: Array<{
    artifactId?: string;
    mimeType?: string;
    bytes?: Uint8Array;
}> | undefined): Record<string, unknown> {
    const safeArtifacts = Array.isArray(artifacts) ? artifacts : [];
    return {
        artifactCount: safeArtifacts.length,
        artifactIds: safeArtifacts.map((artifact) => String(artifact?.artifactId || '').trim()).filter(Boolean),
        mimeTypes: safeArtifacts.map((artifact) => String(artifact?.mimeType || '').trim()).filter(Boolean),
        totalBytes: safeArtifacts.reduce((total, artifact) => total + (artifact?.bytes instanceof Uint8Array ? artifact.bytes.length : 0), 0),
    };
}
function withFailure(base: Record<string, unknown>, error: unknown): Record<string, unknown> {
    const normalized = error as {
        traceId?: string;
        reasonCode?: string;
        actionHint?: string;
        message?: string;
    };
    return {
        ...base,
        status: 'failed',
        traceId: String(normalized?.traceId || '').trim() || undefined,
        reasonCode: String(normalized?.reasonCode || '').trim() || undefined,
        actionHint: String(normalized?.actionHint || '').trim() || undefined,
        error: error instanceof Error ? error.message : String(error || ''),
    };
}
function toVoiceReference(fixture: ReturnType<typeof loadGoldFixture>) {
    const voiceRef = fixture.voice_ref;
    const voiceID = String(voiceRef?.id || '').trim();
    const voiceKind = String(voiceRef?.kind || '').trim().toLowerCase();
    if (!voiceID) {
        return undefined;
    }
    if (voiceKind === 'provider_voice_ref' || voiceKind === 'provider') {
        return {
            kind: VoiceReferenceKind.PROVIDER_VOICE_REF,
            reference: {
                oneofKind: 'providerVoiceRef' as const,
                providerVoiceRef: voiceID,
            },
        };
    }
    if (voiceKind === 'voice_asset_id' || voiceKind === 'voice_asset' || voiceKind === 'asset') {
        return {
            kind: VoiceReferenceKind.VOICE_ASSET,
            reference: {
                oneofKind: 'voiceAssetId' as const,
                voiceAssetId: voiceID,
            },
        };
    }
    return {
        kind: VoiceReferenceKind.PRESET,
        reference: {
            oneofKind: 'presetVoiceId' as const,
            presetVoiceId: voiceID,
        },
    };
}
async function submitAndCollect(runtime: Runtime, request: Record<string, unknown>): Promise<{
    traceId: string;
    jobId: string;
    modelResolved: string;
    artifacts: Array<{
        artifactId?: string;
        mimeType?: string;
        bytes?: Uint8Array;
    }>;
}> {
    const submitResponse = await runtime.ai.submitScenarioJob(request as never);
    const jobId = String(submitResponse.job?.jobId || '').trim();
    if (!jobId) {
        throw new Error('LOCAL_CHAT_GOLD_JOB_ID_REQUIRED');
    }
    let traceId = String(submitResponse.job?.traceId || '').trim();
    let modelResolved = String(submitResponse.job?.modelResolved || '').trim();
    const deadline = Date.now() + 180000;
    for (;;) {
        const jobResponse = await runtime.ai.getScenarioJob({ jobId });
        const status = Number(jobResponse.job?.status || 0);
        if (!traceId) {
            traceId = String(jobResponse.job?.traceId || '').trim();
        }
        if (!modelResolved) {
            modelResolved = String(jobResponse.job?.modelResolved || '').trim();
        }
        if (status === 4) {
            const artifactsResponse = await runtime.ai.getScenarioArtifacts({ jobId });
            if (!traceId) {
                traceId = String(artifactsResponse.traceId || '').trim();
            }
            return {
                traceId,
                jobId,
                modelResolved,
                artifacts: Array.isArray(artifactsResponse.artifacts) ? artifactsResponse.artifacts as never : [],
            };
        }
        if (status === 5 || status === 6 || status === 7) {
            throw new Error(String(jobResponse.job?.reasonDetail || jobResponse.job?.reasonCode || 'LOCAL_CHAT_GOLD_JOB_FAILED'));
        }
        if (Date.now() >= deadline) {
            throw new Error(`LOCAL_CHAT_GOLD_JOB_TIMEOUT:${jobId}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}
function createRuntimeHost(runtime: Runtime, fixture: ReturnType<typeof loadGoldFixture>): ModRuntimeHost {
    const resolveBinding = (capability: string, binding?: {
        source?: string;
        model?: string;
        connectorId?: string;
    }) => {
        const source = binding?.source === 'local' ? 'local' : 'cloud';
        const defaultModel = source === 'cloud'
            ? toTokenApiModelID(fixture.model_id)
            : String(fixture.model_id || '').trim();
        return {
            capability,
            source,
            provider: fixture.provider,
            model: String(binding?.model || defaultModel).trim(),
            connectorId: String(binding?.connectorId || '').trim(),
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'runtime.mod-host.gold',
        };
    };
    return {
        checkLocalLlmHealth: async () => ({
            healthy: true,
            status: 'healthy',
            detail: '',
            provider: fixture.provider,
            endpoint: '',
            model: fixture.model_id,
            checkedAt: new Date().toISOString(),
        }),
        getRuntimeHookRuntime: () => ({}) as never,
        getModLocalProfileSnapshot: async () => ({}) as never,
        route: {
            listOptions: async ({ capability }) => ({
                connectors: [],
                selected: {
                    source: 'cloud',
                    connectorId: '',
                    model: toTokenApiModelID(fixture.model_id),
                },
            }),
            resolve: async ({ capability, binding }) => resolveBinding(capability, binding),
            checkHealth: async ({ capability, binding }) => {
                const resolved = resolveBinding(capability, binding);
                return {
                    healthy: true,
                    status: 'healthy',
                    provider: resolved.provider,
                    reasonCode: 'RUNTIME_ROUTE_HEALTHY',
                    actionHint: 'none',
                };
            },
        },
        ai: {
            text: {
                generate: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('text.generate', binding);
                    return runtime.ai.text.generate({
                        model: resolved.model,
                        input: request.input || '',
                        system: request.system,
                        maxTokens: request.maxTokens,
                        temperature: request.temperature,
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
                stream: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('text.generate', binding);
                    return runtime.ai.text.stream({
                        model: resolved.model,
                        input: request.input || '',
                        system: request.system,
                        maxTokens: request.maxTokens,
                        temperature: request.temperature,
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
            },
            embedding: {
                generate: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('text.embed', binding);
                    return runtime.ai.embedding.generate({
                        model: resolved.model,
                        input: request.input || '',
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
            },
        },
        media: {
            image: {
                generate: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('image.generate', binding);
                    return runtime.media.image.generate({
                        model: request.model || resolved.model,
                        prompt: request.prompt,
                        negativePrompt: request.negativePrompt,
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
                stream: async () => {
                    throw new Error('LOCAL_CHAT_GOLD_IMAGE_STREAM_UNSUPPORTED');
                },
            },
            video: {
                generate: async () => {
                    throw new Error('LOCAL_CHAT_GOLD_VIDEO_UNSUPPORTED');
                },
                stream: async () => {
                    throw new Error('LOCAL_CHAT_GOLD_VIDEO_STREAM_UNSUPPORTED');
                },
            },
            tts: {
                synthesize: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('audio.synthesize', binding);
                    const collected = await submitAndCollect(runtime, {
                        head: {
                            appId: runtime.appId,
                            modelId: request.model || resolved.model,
                            routePolicy: resolved.source === 'local' ? 1 : 2,
                            fallback: 1,
                            timeoutMs: 180000,
                            connectorId: '',
                        },
                        scenarioType: ScenarioType.SPEECH_SYNTHESIZE,
                        executionMode: ExecutionMode.ASYNC_JOB,
                        spec: {
                            spec: {
                                oneofKind: 'speechSynthesize',
                                speechSynthesize: {
                                    text: request.text,
                                    language: request.language,
                                    audioFormat: request.audioFormat,
                                    voiceRef: toVoiceReference(fixture),
                                },
                            },
                        },
                        extensions: [],
                    });
                    return {
                        trace: {
                            traceId: collected.traceId,
                            modelResolved: collected.modelResolved,
                        },
                        job: {
                            jobId: collected.jobId,
                        },
                        artifacts: collected.artifacts,
                    };
                },
                stream: async () => {
                    throw new Error('LOCAL_CHAT_GOLD_TTS_STREAM_UNSUPPORTED');
                },
                listVoices: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('audio.synthesize', binding);
                    return runtime.media.tts.listVoices({
                        model: request.model || resolved.model,
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
            },
            stt: {
                transcribe: async ({ binding, ...request }) => {
                    const resolved = resolveBinding('audio.transcribe', binding);
                    return runtime.media.stt.transcribe({
                        model: request.model || resolved.model,
                        audio: request.audio as never,
                        mimeType: request.mimeType,
                        language: request.language,
                        route: resolved.source,
                        fallback: 'deny',
                    });
                },
            },
            jobs: {
                get: async (input) => runtime.media.jobs.get(input.jobId),
                cancel: async (input) => runtime.media.jobs.cancel({ jobId: input.jobId, reason: input.reason }),
                subscribe: async (input) => runtime.media.jobs.subscribe(input.jobId),
                getArtifacts: async (input) => runtime.media.jobs.getArtifacts(input.jobId),
            },
        },
        voice: {
            getAsset: async () => { throw new Error('LOCAL_CHAT_GOLD_VOICE_ASSET_UNSUPPORTED'); },
            listAssets: async () => { throw new Error('LOCAL_CHAT_GOLD_VOICE_ASSET_UNSUPPORTED'); },
            deleteAsset: async () => { throw new Error('LOCAL_CHAT_GOLD_VOICE_ASSET_UNSUPPORTED'); },
            listPresetVoices: async () => { throw new Error('LOCAL_CHAT_GOLD_PRESET_VOICE_UNSUPPORTED'); },
        },
    };
}
async function main(): Promise<void> {
    redirectConsoleToStderr();
    const endpoint = readArg('--endpoint');
    const fixturePath = readArg('--fixture');
    if (!endpoint) {
        throw new Error('LOCAL_CHAT_GOLD_ENDPOINT_REQUIRED');
    }
    if (!fixturePath) {
        throw new Error('LOCAL_CHAT_GOLD_FIXTURE_REQUIRED');
    }
    const fixture = loadGoldFixture(fixturePath);
    const fixtureAudio = loadGoldFixtureAudioInput(fixture);
    const subjectUserId = requireGoldSubjectUserId();
    const runtime = new Runtime({
        appId: 'nimi.mods.local-chat.gold',
        transport: {
            type: 'node-grpc',
            endpoint,
        },
        defaults: {
            callerKind: 'desktop-core',
            callerId: 'local-chat-ai-gold-path',
        },
        subjectContext: {
            subjectUserId,
        },
    });
    const runtimeClient = createModRuntimeClient('local-chat', {
        runtimeHost: createRuntimeHost(runtime, fixture),
        runtime: {} as never,
    });
    const aiClient = createLocalChatAiClient(runtimeClient);
    const base = {
        fixtureId: fixture.fixture_id,
        capability: fixture.capability,
        layer: 'L4_LOCAL_CHAT_REPLAY',
        bridgeLayer: 'local-chat.consumer',
        requestDigest: fixture.request_digest,
        resolvedProvider: fixture.provider,
        resolvedModel: fixture.model_id,
        resolvedTargetModel: fixture.target_model_id || undefined,
        routePolicy: 'cloud',
        fallbackPolicy: 'deny',
    };
    try {
        if (fixture.capability === 'text.generate') {
            const output = await aiClient.generateText({
                capability: 'text.generate',
                prompt: String(fixture.request.prompt || '').trim(),
                systemPrompt: String(fixture.request.system_prompt || '').trim() || undefined,
            });
            process.stdout.write(`${JSON.stringify({
                ...base,
                status: 'passed',
                traceId: output.traceId || output.promptTraceId,
                resolvedModel: output.route.model || fixture.model_id,
                artifactSummary: {
                    textLength: String(output.text || '').trim().length,
                    textPreview: trimPreview(String(output.text || '')),
                },
            }, null, 2)}\n`);
            return;
        }
        if (fixture.capability === 'image.generate') {
            const output = await aiClient.generateImage({
                capability: 'image.generate',
                prompt: String(fixture.request.prompt || '').trim(),
                negativePrompt: String(fixture.request.negative_prompt || '').trim() || undefined,
            });
            process.stdout.write(`${JSON.stringify({
                ...base,
                status: 'passed',
                traceId: output.traceId,
                resolvedModel: output.route.model || fixture.model_id,
                artifactSummary: {
                    artifactCount: output.images.length,
                    mimeTypes: output.images.map((entry) => entry.mimeType).filter(Boolean),
                    uris: output.images.map((entry) => entry.uri).filter(Boolean),
                },
            }, null, 2)}\n`);
            return;
        }
        if (fixture.capability === 'audio.transcribe') {
            const output = await aiClient.transcribeAudio({
                capability: 'audio.transcribe',
                audioUri: fixtureAudio?.kind === 'url' ? fixtureAudio.url : undefined,
                audioBase64: fixtureAudio?.kind === 'bytes' ? fixtureAudio.base64 : undefined,
                mimeType: fixtureAudio?.mimeType || String(fixture.request.mime_type || '').trim() || undefined,
                language: String(fixture.request.language || '').trim() || undefined,
            });
            process.stdout.write(`${JSON.stringify({
                ...base,
                status: 'passed',
                traceId: output.traceId,
                resolvedModel: output.route.model || fixture.model_id,
                artifactSummary: {
                    textLength: String(output.text || '').trim().length,
                    textPreview: trimPreview(String(output.text || '')),
                },
            }, null, 2)}\n`);
            return;
        }
        if (fixture.capability === 'audio.synthesize') {
            const output = await runtimeClient.media.tts.synthesize({
                text: String(fixture.request.text || '').trim(),
                voice: String(fixture.voice_ref?.id || '').trim() || undefined,
                language: String(fixture.request.language || '').trim() || undefined,
                audioFormat: String(fixture.request.audio_format || '').trim() || undefined,
            });
            process.stdout.write(`${JSON.stringify({
                ...base,
                status: 'passed',
                traceId: String(output.trace?.traceId || '').trim() || undefined,
                resolvedModel: String(output.trace?.modelResolved || fixture.model_id).trim(),
                jobId: String(output.job?.jobId || '').trim() || undefined,
                artifactSummary: summarizeArtifacts(output.artifacts as never),
            }, null, 2)}\n`);
            return;
        }
        throw new Error(`LOCAL_CHAT_GOLD_CAPABILITY_UNSUPPORTED:${fixture.capability}`);
    }
    catch (error) {
        process.stdout.write(`${JSON.stringify(withFailure(base, error), null, 2)}\n`);
    }
}
void main().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error || '');
    process.stderr.write(`${detail}\n`);
    process.exitCode = 1;
});
