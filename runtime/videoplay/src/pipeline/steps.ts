import { VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT, VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY, VIDEOPLAY_DATA_API_EPISODE_UPSERT, VIDEOPLAY_PROMPT_ID, VIDEOPLAY_REASON, VIDEOPLAY_RETRY_CLASS, type VideoPlayPipelineStep, } from '../contracts.js';
import { createHash, createUlid } from '../id.js';
import { VideoPlayError } from '../errors.js';
import { emitVideoPlayLog } from '../logging.js';
import { AssetRenderOutputSchema, AudioDesignOutputSchema, CandidateSelectionOutputSchema, CharacterCastingOutputSchema, NarrativeProjectionRenderInputSchema, NarrativeTurnWindowSchema, ReleasePackageSchema, ScenePlanningOutputSchema, ScreenplaySchema, StoryboardSchema, VideoStoryPackageSchema, } from '../schemas.js';
import { AUDIO_DESIGN_POLICY, CANDIDATE_SELECTION_POLICY, CHARACTER_CASTING_POLICY, SCENE_PLANNING_POLICY, } from '../policy.js';
import { resolvePromptLocale, renderPromptTemplate, validatePromptVariables, } from '../prompt/registry.js';
import type { AssetRenderOutput, AudioDesignOutput, BgmTrack, CandidateSelectionOutput, CharacterBrief, CharacterCastingOutput, EditComposeOutput, EpisodeRecord, FallbackAuditRecord, RenderedAsset, ReleasePackage, ScenePlanningOutput, ScreenplayOutput, SelectedTimelineSegment, SfxLayer, VideoPlayPipelineDeps, VideoPlayPipelineInput, VideoPlayRunEvent, } from '../types.js';
import { actionHintByReasonCode, buildLipSyncAnchors, createJsonDataUri, extractFallbackAuditRecord, nowIso, parseStructuredModelOutput, requireMaterializedUri, type VoiceProfile, } from './util.js';
import { segmentEpisodes, buildDeterministicScreenplay, buildDeterministicStoryboard, composeEpisode, ensureSourceEventTraceability, evaluateQualityGates, buildAssetAnalysisPlan, buildAssetRenderQueue, buildTraceCoverage, } from './domain.js';
import { loadRuntimeRouteCatalog, invokeWithRouteFallback, resolveVoiceProfile, } from './route.js';
import type { RuntimeSnapshot, NormalizedExecutionControl, StepExecutionResult, } from './runtime.js';
import { throwIfCanceled, createRunEventFactory, } from './runtime.js';

export async function executeStep(input: {
    step: VideoPlayPipelineStep;
    deps: VideoPlayPipelineDeps;
    pipelineInput: VideoPlayPipelineInput;
    snapshot: RuntimeSnapshot;
    runEventFactory: ReturnType<typeof createRunEventFactory>;
    fallbackAudits: FallbackAuditRecord[];
    attempt: number;
    stepInputHash: string;
    control: NormalizedExecutionControl;
    traceId: string;
    runId: string;
}): Promise<StepExecutionResult> {
    switch (input.step) {
        case 'narrative-ingest': {
            const storyPackageParsed = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
            if (!storyPackageParsed.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
                    stage: 'story-package',
                    message: 'VIDEOPLAY_STORY_PACKAGE_SCHEMA_INVALID',
                    details: {
                        issues: storyPackageParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
                    },
                });
            }
            const storyPackage = storyPackageParsed.data;
            if (storyPackage.storyId !== input.pipelineInput.storyId) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
                    stage: 'story-package',
                    message: 'VIDEOPLAY_STORY_PACKAGE_STORY_ID_MISMATCH',
                    details: {
                        packageStoryId: storyPackage.storyId,
                        inputStoryId: input.pipelineInput.storyId,
                    },
                });
            }
            if (storyPackage.sourceMode !== input.pipelineInput.sourceMode) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
                    stage: 'story-package',
                    message: 'VIDEOPLAY_STORY_PACKAGE_SOURCE_MODE_MISMATCH',
                    details: {
                        packageSourceMode: storyPackage.sourceMode,
                        inputSourceMode: input.pipelineInput.sourceMode,
                    },
                });
            }
            const maxTurns = Number.isFinite(Number(input.pipelineInput.windowPolicy?.maxTurns))
                ? Math.max(1, Math.floor(Number(input.pipelineInput.windowPolicy?.maxTurns)))
                : storyPackage.windowPolicy.maxTurns;
            const requiredTriggerSources = Array.isArray(input.pipelineInput.windowPolicy?.enrichedRequiredTriggerSources)
                ? [...new Set(input.pipelineInput.windowPolicy.enrichedRequiredTriggerSources
                        .map((item) => String(item || '').trim())
                        .filter((item): item is 'UserTurn' | 'AgentInitiative' => item === 'UserTurn' || item === 'AgentInitiative'))]
                : storyPackage.windowPolicy.enrichedRequiredTriggerSources;
            const trimmedTurns = storyPackage.turnWindow.turns.slice(-maxTurns);
            if (trimmedTurns.length === 0) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE),
                    stage: 'narrative-ingest',
                    message: 'VIDEOPLAY_STORY_WINDOW_EMPTY',
                });
            }
            const turnWindowParsed = NarrativeTurnWindowSchema.safeParse({
                ...storyPackage.turnWindow,
                ingestCursorStart: trimmedTurns[0]!.turnId,
                turns: trimmedTurns,
            });
            if (!turnWindowParsed.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
                    stage: 'story-package',
                    message: 'VIDEOPLAY_STORY_TURN_WINDOW_SCHEMA_INVALID',
                    details: {
                        issues: turnWindowParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
                    },
                });
            }
            const turnWindow = turnWindowParsed.data;
            if (input.pipelineInput.sourceMode === 'textplay-enriched-story') {
                const required = new Set(requiredTriggerSources);
                const hasEnrichedTurn = turnWindow.turns.some((turn) => required.has(String(turn.triggerSource || '').trim() as 'UserTurn' | 'AgentInitiative'));
                if (!hasEnrichedTurn) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE),
                        stage: 'narrative-ingest',
                        message: 'VIDEOPLAY_ENRICHED_SOURCE_TRIGGER_MISSING',
                        details: {
                            requiredTriggerSources,
                        },
                    });
                }
            }
            const projectionParsed = NarrativeProjectionRenderInputSchema.safeParse(storyPackage.projection);
            if (!projectionParsed.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
                    stage: 'story-package',
                    message: 'VIDEOPLAY_STORY_PROJECTION_SCHEMA_INVALID',
                    details: {
                        issues: projectionParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
                    },
                });
            }
            input.snapshot.turnWindow = turnWindow;
            input.snapshot.projection = projectionParsed.data;
            input.snapshot.routeCatalog = await loadRuntimeRouteCatalog({
                deps: input.deps,
                modId: 'world.nimi.videoplay',
            });
            input.snapshot.storyPackageVersion = storyPackage.snapshot.version;
            input.snapshot.sourceMode = storyPackage.sourceMode;
            input.snapshot.episodes = [];
            input.snapshot.releaseCandidates = [];
            return {
                lastCompletedUnit: turnWindow.turns[turnWindow.turns.length - 1]?.turnId ?? undefined,
                details: {
                    sourceMode: storyPackage.sourceMode,
                    storyPackageVersion: storyPackage.snapshot.version,
                    turnCount: turnWindow.turns.length,
                    projectionEvents: input.snapshot.projection.events.length,
                    routeSelected: {
                        chat: input.snapshot.routeCatalog.chat.selected.source,
                        image: input.snapshot.routeCatalog.image.selected.source,
                        video: input.snapshot.routeCatalog.video.selected.source,
                        tts: input.snapshot.routeCatalog.tts.selected.source,
                    },
                },
            };
        }
        case 'character-casting': {
            const storyPackageParsedForCasting = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
            if (!storyPackageParsedForCasting.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
                    stage: 'character-casting',
                    message: 'VIDEOPLAY_CHARACTER_CASTING_STORY_PACKAGE_INVALID',
                });
            }
            const castingPackage = storyPackageParsedForCasting.data;
            const participants: string[] = Array.isArray(castingPackage.cast?.participants)
                ? castingPackage.cast.participants.map((id: unknown) => String(id || '').trim()).filter(Boolean)
                : [];
            const characters: CharacterBrief[] = [];
            for (const agentId of participants) {
                throwIfCanceled(input.control, input.step);
                let memoryRecall = '';
                try {
                    const recallResult = await input.deps.hookClient.data.query({
                        capability: VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
                        query: {
                            worldId: castingPackage.worldId,
                            storyId: input.pipelineInput.storyId,
                            entityType: 'AGENT',
                            entityId: agentId,
                            topK: 12,
                        },
                    });
                    memoryRecall = typeof recallResult === 'string'
                        ? recallResult
                        : JSON.stringify(recallResult || '');
                }
                catch {
                    memoryRecall = '';
                }
                const characterName = agentId.split('-').pop() || agentId;
                const castingTextVars = {
                    agentId,
                    characterName,
                    visualKeywords: memoryRecall ? 'from-memory' : 'default-appearance',
                    roleLevel: 'B',
                    memoryRecall: memoryRecall || 'No memory available',
                };
                const castingTextValidated = validatePromptVariables('character-visual', castingTextVars);
                if (!castingTextValidated.ok) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
                        stage: 'character-casting',
                        message: castingTextValidated.issues.join(';'),
                    });
                }
                const castingTextPrompt = renderPromptTemplate('character-visual', resolvePromptLocale((input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string || ''), castingTextValidated.data);
                const castingTextResult = await invokeWithRouteFallback({
                    stage: 'character-casting-text',
                    capability: 'text.generate',
                    traceId: input.traceId,
                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateText({
                        prompt: castingTextPrompt,
                        systemPrompt: 'Return JSON with agentId, name, visualKeywords, appearanceDescription.',
                        capability: 'text.generate',
                        binding,
                        maxTokens: 512,
                    }),
                });
                if (castingTextResult.fallbackAudit) {
                    input.fallbackAudits.push(castingTextResult.fallbackAudit);
                }
                const castingTextParsed = parseStructuredModelOutput(castingTextResult.result.text);
                const description = String(castingTextParsed?.appearanceDescription || castingTextParsed?.description || memoryRecall || 'Default appearance');
                const visualKeywords = Array.isArray(castingTextParsed?.visualKeywords)
                    ? (castingTextParsed!.visualKeywords as string[]).map((kw) => String(kw))
                    : [];
                const imageUrls: string[] = [];
                const maxCandidates = CHARACTER_CASTING_POLICY.maxCandidateImages;
                for (let candidateIndex = 0; candidateIndex < maxCandidates; candidateIndex += 1) {
                    const imageResult = await invokeWithRouteFallback({
                        stage: 'character-casting-visual',
                        capability: 'image.generate',
                        traceId: input.traceId,
                        checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                        invoke: async (binding) => input.deps.aiClient.generateImage({
                            prompt: `Character portrait: ${description}. Keywords: ${visualKeywords.join(', ')}`,
                            capability: 'image.generate',
                            binding,
                        }),
                    });
                    if (imageResult.fallbackAudit) {
                        input.fallbackAudits.push(imageResult.fallbackAudit);
                    }
                    imageUrls.push(requireMaterializedUri({
                        uri: imageResult.result.images[0]?.uri,
                        reasonCode: VIDEOPLAY_REASON.CASTING_VISUAL_FAILED,
                        stage: 'character-casting',
                        message: 'VIDEOPLAY_CHARACTER_IMAGE_URI_REQUIRED',
                        details: {
                            agentId,
                            candidateIndex,
                        },
                    }));
                }
                characters.push({
                    agentId,
                    name: String(castingTextParsed?.name || characterName),
                    roleLevel: CHARACTER_CASTING_POLICY.defaultRoleLevel,
                    visualKeywords,
                    appearances: [{
                            appearanceIndex: 0,
                            description,
                            imageUrls,
                            selectedIndex: 0,
                            changeReason: 'initial-casting',
                            previousImageUrl: null,
                        }],
                    activeAppearanceIndex: 0,
                    referenceImageUri: imageUrls[0] || null,
                });
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: agentId,
                    details: {
                        agentId,
                        candidateImages: imageUrls.length,
                    },
                });
            }
            const castingOutput: CharacterCastingOutput = {
                storyId: input.pipelineInput.storyId,
                characters,
            };
            const castingParsed = CharacterCastingOutputSchema.safeParse(castingOutput);
            if (!castingParsed.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
                    stage: 'character-casting',
                    message: 'VIDEOPLAY_CHARACTER_CASTING_OUTPUT_INVALID',
                });
            }
            input.snapshot.characterCasting = castingParsed.data;
            return {
                lastCompletedUnit: participants[participants.length - 1] ?? undefined,
                details: {
                    characterCount: characters.length,
                },
            };
        }
        case 'scene-planning': {
            const storyPackageParsedForScene = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
            if (!storyPackageParsedForScene.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
                    stage: 'scene-planning',
                    message: 'VIDEOPLAY_SCENE_PLANNING_STORY_PACKAGE_INVALID',
                });
            }
            const scenePlanningPackage = storyPackageParsedForScene.data;
            const rawScenes = Array.isArray(scenePlanningPackage.materials?.scenes)
                ? scenePlanningPackage.materials.scenes
                : [];
            const scenes: ScenePlanningOutput['scenes'] = [];
            const locale = resolvePromptLocale((input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string || '');
            for (const rawScene of rawScenes) {
                throwIfCanceled(input.control, input.step);
                const sceneRecord = rawScene as Record<string, unknown>;
                const sceneId = String(sceneRecord.sceneId || sceneRecord.id || createUlid());
                const sceneName = String(sceneRecord.name || sceneRecord.sceneName || 'Unnamed Scene');
                const sceneDescription = String(sceneRecord.description || sceneRecord.environmentDescription || '');
                const sceneTextVars = { sceneId, sceneName, sceneDescription };
                const sceneTextValidated = validatePromptVariables('scene-description', sceneTextVars);
                if (!sceneTextValidated.ok) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
                        stage: 'scene-planning',
                        message: sceneTextValidated.issues.join(';'),
                    });
                }
                const sceneTextPrompt = renderPromptTemplate('scene-description', locale, sceneTextValidated.data);
                const sceneTextResult = await invokeWithRouteFallback({
                    stage: 'scene-planning-text',
                    capability: 'text.generate',
                    traceId: input.traceId,
                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateText({
                        prompt: sceneTextPrompt,
                        systemPrompt: 'Return JSON with sceneId, environmentDescription.',
                        capability: 'text.generate',
                        binding,
                        maxTokens: 512,
                    }),
                });
                if (sceneTextResult.fallbackAudit) {
                    input.fallbackAudits.push(sceneTextResult.fallbackAudit);
                }
                const sceneTextParsed = parseStructuredModelOutput(sceneTextResult.result.text);
                const environmentDescription = String(sceneTextParsed?.environmentDescription || sceneDescription || 'A scene environment');
                const referenceImageUrls: string[] = [];
                const maxSceneImages = SCENE_PLANNING_POLICY.maxCandidateImages;
                for (let candidateIndex = 0; candidateIndex < maxSceneImages; candidateIndex += 1) {
                    const imageResult = await invokeWithRouteFallback({
                        stage: 'scene-planning-visual',
                        capability: 'image.generate',
                        traceId: input.traceId,
                        checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                        invoke: async (binding) => input.deps.aiClient.generateImage({
                            prompt: `Scene environment: ${environmentDescription}`,
                            capability: 'image.generate',
                            binding,
                        }),
                    });
                    if (imageResult.fallbackAudit) {
                        input.fallbackAudits.push(imageResult.fallbackAudit);
                    }
                    referenceImageUrls.push(requireMaterializedUri({
                        uri: imageResult.result.images[0]?.uri,
                        reasonCode: VIDEOPLAY_REASON.SCENE_VISUAL_FAILED,
                        stage: 'scene-planning',
                        message: 'VIDEOPLAY_SCENE_IMAGE_URI_REQUIRED',
                        details: {
                            sceneId,
                            candidateIndex,
                        },
                    }));
                }
                scenes.push({
                    sceneId,
                    name: sceneName,
                    environmentDescription,
                    referenceImageUrls,
                    selectedIndex: 0,
                });
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: sceneId,
                    details: {
                        sceneId,
                        candidateImages: referenceImageUrls.length,
                    },
                });
            }
            const scenePlanningOutput: ScenePlanningOutput = {
                storyId: input.pipelineInput.storyId,
                scenes,
            };
            const sceneParsed = ScenePlanningOutputSchema.safeParse(scenePlanningOutput);
            if (!sceneParsed.success) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
                    stage: 'scene-planning',
                    message: 'VIDEOPLAY_SCENE_PLANNING_OUTPUT_INVALID',
                });
            }
            input.snapshot.scenePlanning = sceneParsed.data;
            return {
                lastCompletedUnit: scenes[scenes.length - 1]?.sceneId ?? undefined,
                details: {
                    sceneCount: scenes.length,
                },
            };
        }
        case 'episode-segmentation': {
            if (!input.snapshot.turnWindow) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                    stage: 'segment',
                    message: 'VIDEOPLAY_SEGMENT_REQUIRES_TURN_WINDOW',
                });
            }
            const segmentation = segmentEpisodes({
                storyId: input.pipelineInput.storyId,
                ingestCursorStart: input.pipelineInput.ingestCursorStart,
                turns: input.snapshot.turnWindow.turns,
                policy: input.snapshot.policy,
            });
            const secondPass = segmentEpisodes({
                storyId: input.pipelineInput.storyId,
                ingestCursorStart: input.pipelineInput.ingestCursorStart,
                turns: input.snapshot.turnWindow.turns,
                policy: input.snapshot.policy,
            });
            if (JSON.stringify(segmentation) !== JSON.stringify(secondPass)) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC),
                    stage: 'segment',
                    message: 'VIDEOPLAY_SEGMENT_NON_DETERMINISTIC',
                });
            }
            const projectionLocale = resolvePromptLocale((input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string
                || (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.language as string
                || (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.promptLocale as string
                || '');
            input.snapshot.segmentation = segmentation;
            input.snapshot.episodeContexts = segmentation.episodes.map((episode) => ({
                segmentedEpisode: episode,
                baselineSourceEventIds: [...episode.sourceEventIds],
                projectionLocale,
                screenplay: null,
                storyboard: null,
                assetOutput: null,
                candidateSelection: null,
                audioDesign: null,
                composeOutput: null,
                qcReport: null,
                releaseCandidate: null,
                episodeRecord: null,
            }));
            input.snapshot.episodes = [];
            input.snapshot.releaseCandidates = [];
            return {
                lastCompletedUnit: segmentation.episodes[segmentation.episodes.length - 1]?.episodeId ?? undefined,
                details: {
                    episodeCount: segmentation.episodes.length,
                    backlogTurnCount: segmentation.backlogTurnIds.length,
                    nextIngestCursor: segmentation.nextIngestCursor,
                },
            };
        }
        case 'screenplay': {
            if (!input.snapshot.projection || input.snapshot.episodeContexts.length === 0) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                    stage: 'screenplay',
                    message: 'VIDEOPLAY_SCREENPLAY_CONTEXT_MISSING',
                });
            }
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                const screenplayVars = {
                    storyId: input.pipelineInput.storyId,
                    episodeId: context.segmentedEpisode.episodeId,
                    worldStyle: JSON.stringify(input.snapshot.projection.worldStyle),
                    beatsJson: JSON.stringify(context.segmentedEpisode.turns.map((turn) => ({ turnId: turn.turnId, message: turn.userMessage }))),
                };
                const screenplayValidated = validatePromptVariables('storyboard-plan', screenplayVars);
                if (!screenplayValidated.ok) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID),
                        stage: 'screenplay',
                        message: screenplayValidated.issues.join(';'),
                    });
                }
                const screenplayPrompt = renderPromptTemplate('storyboard-plan', context.projectionLocale, screenplayValidated.data);
                const screenplayInvoke = await invokeWithRouteFallback({
                    stage: 'screenplay',
                    capability: 'text.generate',
                    traceId: input.traceId,
                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateText({
                        prompt: screenplayPrompt,
                        systemPrompt: 'Return concise structured planning hints in JSON.',
                        capability: 'text.generate',
                        binding,
                        maxTokens: 1024,
                    }),
                });
                if (screenplayInvoke.fallbackAudit) {
                    input.fallbackAudits.push(screenplayInvoke.fallbackAudit);
                }
                const screenplayStructured = parseStructuredModelOutput(screenplayInvoke.result.text);
                let screenplay = buildDeterministicScreenplay(context.segmentedEpisode);
                if (screenplayStructured && Array.isArray(screenplayStructured.beats)) {
                    const beatsPayload = screenplayStructured.beats as unknown[];
                    const deterministic = buildDeterministicScreenplay(context.segmentedEpisode);
                    screenplay = {
                        ...deterministic,
                        beats: deterministic.beats.map((beat, index) => {
                            const src = beatsPayload[index];
                            if (src && typeof src === 'object') {
                                return {
                                    ...beat,
                                    summary: String((src as Record<string, unknown>).summary || beat.summary),
                                };
                            }
                            return beat;
                        }),
                    };
                }
                const screenplayParsed = ScreenplaySchema.safeParse(screenplay);
                if (!screenplayParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID),
                        stage: 'screenplay',
                        message: 'VIDEOPLAY_SCREENPLAY_SCHEMA_INVALID',
                    });
                }
                context.screenplay = screenplayParsed.data;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        routeSource: screenplayInvoke.routeSource,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'storyboard': {
            if (input.snapshot.episodeContexts.length === 0) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                    stage: 'storyboard',
                    message: 'VIDEOPLAY_STORYBOARD_CONTEXT_MISSING',
                });
            }
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.screenplay) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'storyboard',
                        message: 'VIDEOPLAY_STORYBOARD_REQUIRES_SCREENPLAY',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const screenplay = context.screenplay;
                const storyboardInvoke = await invokeWithRouteFallback({
                    stage: 'storyboard',
                    capability: 'text.generate',
                    traceId: input.traceId,
                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateText({
                        prompt: renderPromptTemplate('storyboard-plan', context.projectionLocale, {
                            storyId: input.pipelineInput.storyId,
                            episodeId: context.segmentedEpisode.episodeId,
                            worldStyle: JSON.stringify(input.snapshot.projection?.worldStyle || {}),
                            beatsJson: JSON.stringify(screenplay.beats.map((beat) => ({
                                beatId: beat.beatId,
                                summary: beat.summary,
                                sourceEventIds: beat.sourceEventIds,
                            }))),
                        }),
                        systemPrompt: 'Return JSON with episodeId, clipPlans, shotPlans, sourceEventIds.',
                        capability: 'text.generate',
                        binding,
                        maxTokens: 1024,
                    }),
                });
                if (storyboardInvoke.fallbackAudit) {
                    input.fallbackAudits.push(storyboardInvoke.fallbackAudit);
                }
                // Phase 1: Planning — build deterministic storyboard + merge LLM hints
                let storyboard = buildDeterministicStoryboard(screenplay);
                const storyboardStructured = parseStructuredModelOutput(storyboardInvoke.result.text);
                if (storyboardStructured && Array.isArray(storyboardStructured.shotPlans)) {
                    const shotPlansPayload = storyboardStructured.shotPlans as unknown[];
                    storyboard = {
                        ...storyboard,
                        shotPlans: storyboard.shotPlans.map((shot, index) => {
                            const src = shotPlansPayload[index];
                            if (!src || typeof src !== 'object') {
                                return shot;
                            }
                            const srcRecord = src as Record<string, unknown>;
                            return {
                                ...shot,
                                visualPrompt: String(srcRecord.visualPrompt || shot.visualPrompt),
                                motionCue: String(srcRecord.motionCue || shot.motionCue),
                                shotType: String(srcRecord.shotType || shot.shotType),
                                cameraMove: String(srcRecord.cameraMove || shot.cameraMove),
                                characterIds: Array.isArray(srcRecord.characterIds)
                                    ? (srcRecord.characterIds as string[])
                                    : shot.characterIds,
                                locationId: srcRecord.locationId !== undefined
                                    ? (srcRecord.locationId as string | null)
                                    : shot.locationId,
                            };
                        }),
                    };
                }
                // Phase 2A: Cinematography — per-shot photography rules
                const cinematographyVars = {
                    episodeId: context.segmentedEpisode.episodeId,
                    shotId: storyboard.shotPlans[0]?.shotId || '',
                    visualPrompt: storyboard.shotPlans[0]?.visualPrompt || '',
                    shotType: storyboard.shotPlans[0]?.shotType || 'medium',
                    sceneAtmosphere: 'neutral',
                };
                const cinematographyValidated = validatePromptVariables('storyboard-cinematography', cinematographyVars);
                if (cinematographyValidated.ok) {
                    const cinematographyPrompt = renderPromptTemplate('storyboard-cinematography', context.projectionLocale, cinematographyValidated.data);
                    try {
                        const cinematographyResult = await invokeWithRouteFallback({
                            stage: 'storyboard-cinematography',
                            capability: 'text.generate',
                            traceId: input.traceId,
                            checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                            invoke: async (binding) => input.deps.aiClient.generateText({
                                prompt: cinematographyPrompt,
                                systemPrompt: 'Return JSON array of per-shot photography rules with composition, lighting, colorPalette, atmosphere.',
                                capability: 'text.generate',
                                binding,
                                maxTokens: 1024,
                            }),
                        });
                        if (cinematographyResult.fallbackAudit) {
                            input.fallbackAudits.push(cinematographyResult.fallbackAudit);
                        }
                        const cinematographyParsed = parseStructuredModelOutput(cinematographyResult.result.text);
                        const rulesArray = Array.isArray(cinematographyParsed?.rules)
                            ? cinematographyParsed!.rules as unknown[]
                            : Array.isArray(cinematographyParsed?.shots)
                                ? cinematographyParsed!.shots as unknown[]
                                : [];
                        storyboard = {
                            ...storyboard,
                            shotPlans: storyboard.shotPlans.map((shot, idx) => {
                                const rule = rulesArray[idx] as Record<string, unknown> | undefined;
                                if (!rule)
                                    return shot;
                                return {
                                    ...shot,
                                    photographyRule: {
                                        composition: String(rule.composition || shot.photographyRule.composition),
                                        lighting: String(rule.lighting || shot.photographyRule.lighting),
                                        colorPalette: String(rule.colorPalette || shot.photographyRule.colorPalette),
                                        atmosphere: String(rule.atmosphere || shot.photographyRule.atmosphere),
                                        technicalNotes: String(rule.technicalNotes || shot.photographyRule.technicalNotes),
                                    },
                                };
                            }),
                        };
                    }
                    catch {
                        // Cinematography enrichment is best-effort; keep defaults
                    }
                }
                // Phase 2B: Acting — per-shot acting direction
                const actingVars = {
                    episodeId: context.segmentedEpisode.episodeId,
                    shotId: storyboard.shotPlans[0]?.shotId || '',
                    characterIds: storyboard.shotPlans.flatMap((s) => s.characterIds).filter(Boolean).join(',') || 'none',
                    beatSummary: screenplay.beats.map((b) => b.summary).join('; '),
                };
                const actingValidated = validatePromptVariables('storyboard-acting', actingVars);
                if (actingValidated.ok) {
                    const actingPrompt = renderPromptTemplate('storyboard-acting', context.projectionLocale, actingValidated.data);
                    try {
                        const actingResult = await invokeWithRouteFallback({
                            stage: 'storyboard-acting',
                            capability: 'text.generate',
                            traceId: input.traceId,
                            checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                            invoke: async (binding) => input.deps.aiClient.generateText({
                                prompt: actingPrompt,
                                systemPrompt: 'Return JSON array of per-shot acting directions with characters array.',
                                capability: 'text.generate',
                                binding,
                                maxTokens: 1024,
                            }),
                        });
                        if (actingResult.fallbackAudit) {
                            input.fallbackAudits.push(actingResult.fallbackAudit);
                        }
                        const actingParsed = parseStructuredModelOutput(actingResult.result.text);
                        const actingArray = Array.isArray(actingParsed?.shots)
                            ? actingParsed!.shots as unknown[]
                            : Array.isArray(actingParsed?.directions)
                                ? actingParsed!.directions as unknown[]
                                : [];
                        storyboard = {
                            ...storyboard,
                            shotPlans: storyboard.shotPlans.map((shot, idx) => {
                                const dir = actingArray[idx] as Record<string, unknown> | undefined;
                                if (!dir)
                                    return shot;
                                const characters = Array.isArray(dir.characters)
                                    ? (dir.characters as Array<Record<string, unknown>>).map((c) => ({
                                        characterId: String(c.characterId || ''),
                                        actingDescription: String(c.actingDescription || ''),
                                    }))
                                    : shot.actingDirection.characters;
                                return {
                                    ...shot,
                                    actingDirection: { characters },
                                };
                            }),
                        };
                    }
                    catch {
                        // Acting enrichment is best-effort; keep defaults
                    }
                }
                // Phase 3: Detail merge — generate final videoPrompt per shot
                storyboard = {
                    ...storyboard,
                    shotPlans: storyboard.shotPlans.map((shot) => ({
                        ...shot,
                        videoPrompt: `${shot.visualPrompt}. ${shot.photographyRule.composition} composition, ${shot.photographyRule.lighting} lighting, ${shot.photographyRule.atmosphere} atmosphere.${shot.actingDirection.characters.length > 0 ? ` Acting: ${shot.actingDirection.characters.map((c) => `${c.characterId}: ${c.actingDescription}`).join('; ')}.` : ''}`,
                    })),
                };
                const storyboardParsed = StoryboardSchema.safeParse(storyboard);
                if (!storyboardParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID),
                        stage: 'storyboard',
                        message: 'VIDEOPLAY_STORYBOARD_SCHEMA_INVALID',
                    });
                }
                ensureSourceEventTraceability({
                    baseline: new Set<string>(context.baselineSourceEventIds),
                    episode: context.segmentedEpisode,
                    screenplay,
                    storyboard: storyboardParsed.data,
                });
                context.storyboard = storyboardParsed.data;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        routeSource: storyboardInvoke.routeSource,
                        shotCount: storyboardParsed.data.shotPlans.length,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'asset-render': {
            if (input.snapshot.episodeContexts.length === 0) {
                throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                    stage: 'render',
                    message: 'VIDEOPLAY_RENDER_CONTEXT_MISSING',
                });
            }
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.storyboard || !context.screenplay) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'render',
                        message: 'VIDEOPLAY_RENDER_REQUIRES_STORYBOARD_AND_SCREENPLAY',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const analysisPlans = buildAssetAnalysisPlan({
                    storyboard: context.storyboard,
                    screenplay: context.screenplay,
                    projectionLocale: context.projectionLocale,
                });
                const queuePlan = buildAssetRenderQueue({
                    episodeId: context.segmentedEpisode.episodeId,
                    plans: analysisPlans,
                });
                const analysisByShotId = new Map(analysisPlans.map((plan) => [plan.shotId, plan] as const));
                const queueItems = queuePlan.queueItems.map((item) => ({ ...item }));
                const voiceProfileCache = new Map<string, VoiceProfile>();
                const shotAssets: AssetRenderOutput['shotAssets'] = [];
                const clipAssets: AssetRenderOutput['clipAssets'] = [];
                const sourceEventMap: Record<string, string[]> = {};
                const renderedShotIds = new Set<string>();
                const renderedVoiceShotIds = new Set<string>();
                const lipSyncByShotId = new Map<string, RenderedAsset>();
                for (const plan of analysisPlans) {
                    sourceEventMap[plan.shotId] = [...plan.sourceEventIds];
                }
                const plannedVoiceShots = analysisPlans.filter((plan) => plan.requiredModalities.includes('voice')).length;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        phase: 'voice-analyze',
                        plannedShots: analysisPlans.length,
                        plannedVoiceShots,
                    },
                });
                for (const batch of queuePlan.batches) {
                    let batchSucceeded = 0;
                    let batchFailed = 0;
                    let batchLipSyncGenerated = 0;
                    for (const queueItem of queueItems.filter((item) => item.batchId === batch.batchId)) {
                        throwIfCanceled(input.control, input.step);
                        const plan = analysisByShotId.get(queueItem.shotId);
                        if (!plan) {
                            queueItem.status = 'FAILED';
                            queueItem.errorMessage = 'VIDEOPLAY_RENDER_QUEUE_PLAN_MISSING';
                            batchFailed += 1;
                            continue;
                        }
                        const storyboardShot = context.storyboard.shotPlans.find((shot) => shot.shotId === plan.shotId);
                        if (!storyboardShot) {
                            queueItem.status = 'FAILED';
                            queueItem.errorMessage = 'VIDEOPLAY_RENDER_QUEUE_SHOT_MISSING';
                            batchFailed += 1;
                            continue;
                        }
                        queueItem.status = 'RUNNING';
                        try {
                            if (queueItem.modality === 'image') {
                                const candidateCount = CHARACTER_CASTING_POLICY.maxCandidateImages;
                                for (let ci = 0; ci < candidateCount; ci += 1) {
                                    const imageResult = await invokeWithRouteFallback({
                                        stage: 'asset-render-image',
                                        capability: 'image.generate',
                                        traceId: input.traceId,
                                        checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                                        invoke: async (binding) => input.deps.aiClient.generateImage({
                                            prompt: storyboardShot.visualPrompt,
                                            capability: 'image.generate',
                                            binding,
                                        }),
                                    });
                                    if (imageResult.fallbackAudit) {
                                        input.fallbackAudits.push(imageResult.fallbackAudit);
                                    }
                                    queueItem.routeSource = imageResult.routeSource;
                                    shotAssets.push({
                                        assetId: createUlid(),
                                        episodeId: context.segmentedEpisode.episodeId,
                                        shotId: storyboardShot.shotId,
                                        clipId: storyboardShot.clipId,
                                        assetType: 'image',
                                        uri: requireMaterializedUri({
                                            uri: imageResult.result.images[0]?.uri,
                                            reasonCode: VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED,
                                            stage: 'render',
                                            message: 'VIDEOPLAY_RENDER_IMAGE_URI_REQUIRED',
                                            details: {
                                                shotId: storyboardShot.shotId,
                                                candidateIndex: ci,
                                            },
                                        }),
                                        mimeType: String(imageResult.result.images[0]?.mimeType || 'image/png'),
                                        durationMs: storyboardShot.durationMs,
                                        fps: 30,
                                        resolution: '1920x1080',
                                        sourceEventIds: [...storyboardShot.sourceEventIds],
                                        routeSource: imageResult.routeSource,
                                        metadata: {
                                            promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_PLAN,
                                            queueItemId: queueItem.queueItemId,
                                            candidateIndex: ci,
                                        },
                                    });
                                }
                                queueItem.status = 'SUCCEEDED';
                                batchSucceeded += 1;
                                continue;
                            }
                            if (queueItem.modality === 'video') {
                                const shotRequiresVoice = plan.requiredModalities.includes('voice');
                                const lipSyncAsset = lipSyncByShotId.get(storyboardShot.shotId);
                                if (shotRequiresVoice && !lipSyncAsset) {
                                    throw new VideoPlayError({
                                        reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
                                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.VOICE_RENDER_FAILED),
                                        stage: 'render',
                                        message: 'VIDEOPLAY_LIP_SYNC_REQUIRED_BEFORE_VIDEO',
                                        details: {
                                            shotId: storyboardShot.shotId,
                                        },
                                    });
                                }
                                const videoResult = await invokeWithRouteFallback({
                                    stage: 'asset-render-video',
                                    capability: 'video.generate',
                                    traceId: input.traceId,
                                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                                    invoke: async (binding) => input.deps.aiClient.generateVideo({
                                        mode: 't2v',
                                        prompt: `${storyboardShot.visualPrompt}. motion=${storyboardShot.motionCue}${lipSyncAsset ? `. lipSyncAnchors=${JSON.stringify((lipSyncAsset.metadata as Record<string, unknown>).anchors || [])}` : ''}`,
                                        content: [
                                            {
                                                type: 'text',
                                                role: 'prompt',
                                                text: storyboardShot.videoPrompt || storyboardShot.visualPrompt,
                                            },
                                        ],
                                        capability: 'video.generate',
                                        binding,
                                        options: {
                                            durationSec: Math.max(1, Math.round(storyboardShot.durationMs / 1000)),
                                        },
                                    }),
                                });
                                if (videoResult.fallbackAudit) {
                                    input.fallbackAudits.push(videoResult.fallbackAudit);
                                }
                                queueItem.status = 'SUCCEEDED';
                                queueItem.routeSource = videoResult.routeSource;
                                shotAssets.push({
                                    assetId: createUlid(),
                                    episodeId: context.segmentedEpisode.episodeId,
                                    shotId: storyboardShot.shotId,
                                    clipId: storyboardShot.clipId,
                                    assetType: 'video',
                                    uri: requireMaterializedUri({
                                        uri: videoResult.result.videos[0]?.uri,
                                        reasonCode: VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED,
                                        stage: 'render',
                                        message: 'VIDEOPLAY_RENDER_VIDEO_URI_REQUIRED',
                                        details: {
                                            shotId: storyboardShot.shotId,
                                        },
                                    }),
                                    mimeType: String(videoResult.result.videos[0]?.mimeType || 'video/mp4'),
                                    durationMs: storyboardShot.durationMs,
                                    fps: 30,
                                    resolution: '1920x1080',
                                    sourceEventIds: [...storyboardShot.sourceEventIds],
                                    routeSource: videoResult.routeSource,
                                    metadata: {
                                        motionCue: storyboardShot.motionCue,
                                        queueItemId: queueItem.queueItemId,
                                    },
                                });
                                renderedShotIds.add(storyboardShot.shotId);
                                batchSucceeded += 1;
                                continue;
                            }
                            const voiceResult = await invokeWithRouteFallback({
                                stage: 'asset-render-voice',
                                capability: 'audio.synthesize',
                                traceId: input.traceId,
                                checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                                invoke: async (binding) => {
                                    const routeSource = binding?.source === 'cloud' ? 'cloud' : 'local';
                                    const cacheKey = `${routeSource}:${plan.language}`;
                                    let profile = voiceProfileCache.get(cacheKey);
                                    if (!profile) {
                                        profile = await resolveVoiceProfile({
                                            deps: input.deps,
                                            binding,
                                            preferredLanguage: plan.language,
                                        });
                                        voiceProfileCache.set(cacheKey, profile);
                                    }
                                    const speech = await input.deps.aiClient.synthesizeSpeech({
                                        text: plan.voiceLineText,
                                        voiceId: profile.voiceId,
                                        ...(profile.providerId ? { providerId: profile.providerId } : {}),
                                        language: profile.language || plan.language,
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
                            if (voiceResult.fallbackAudit) {
                                input.fallbackAudits.push(voiceResult.fallbackAudit);
                            }
                            queueItem.status = 'SUCCEEDED';
                            queueItem.routeSource = voiceResult.routeSource;
                            const voiceDurationMs = Number(voiceResult.result.speech.durationMs ?? storyboardShot.durationMs);
                            const voiceAssetId = createUlid();
                            shotAssets.push({
                                assetId: createUlid(),
                                episodeId: context.segmentedEpisode.episodeId,
                                shotId: storyboardShot.shotId,
                                clipId: storyboardShot.clipId,
                                assetType: 'voice-script',
                                uri: createJsonDataUri({
                                    kind: 'videoplay.voice-script',
                                    episodeId: context.segmentedEpisode.episodeId,
                                    shotId: storyboardShot.shotId,
                                    text: plan.voiceLineText,
                                    language: voiceResult.result.profile.language || plan.language,
                                    voiceId: voiceResult.result.profile.voiceId,
                                    providerId: voiceResult.result.profile.providerId || '',
                                }),
                                mimeType: 'application/json',
                                durationMs: voiceDurationMs,
                                fps: 1,
                                resolution: 'n/a',
                                sourceEventIds: [...storyboardShot.sourceEventIds],
                                routeSource: voiceResult.routeSource,
                                metadata: {
                                    queueItemId: queueItem.queueItemId,
                                    language: voiceResult.result.profile.language || plan.language,
                                    voiceId: voiceResult.result.profile.voiceId,
                                    providerId: voiceResult.result.profile.providerId || '',
                                    text: plan.voiceLineText,
                                    source: 'runtime-tts',
                                },
                            });
                            shotAssets.push({
                                assetId: voiceAssetId,
                                episodeId: context.segmentedEpisode.episodeId,
                                shotId: storyboardShot.shotId,
                                clipId: storyboardShot.clipId,
                                assetType: 'voice-audio',
                                uri: requireMaterializedUri({
                                    uri: voiceResult.result.speech.audioUri,
                                    reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
                                    stage: 'render',
                                    message: 'VIDEOPLAY_RENDER_VOICE_URI_REQUIRED',
                                    details: {
                                        shotId: storyboardShot.shotId,
                                        voiceAssetId,
                                    },
                                }),
                                mimeType: String(voiceResult.result.speech.mimeType || 'audio/mpeg'),
                                durationMs: voiceDurationMs,
                                fps: 1,
                                resolution: 'audio-only',
                                sourceEventIds: [...storyboardShot.sourceEventIds],
                                routeSource: voiceResult.routeSource,
                                metadata: {
                                    queueItemId: queueItem.queueItemId,
                                    voiceId: voiceResult.result.profile.voiceId,
                                    providerId: voiceResult.result.profile.providerId || '',
                                    language: voiceResult.result.profile.language || plan.language,
                                    transcriptHash: createHash(plan.voiceLineText),
                                },
                            });
                            const lipSyncAsset: RenderedAsset = {
                                assetId: createUlid(),
                                episodeId: context.segmentedEpisode.episodeId,
                                shotId: storyboardShot.shotId,
                                clipId: storyboardShot.clipId,
                                assetType: 'lip-sync',
                                uri: createJsonDataUri({
                                    kind: 'videoplay.lip-sync',
                                    episodeId: context.segmentedEpisode.episodeId,
                                    shotId: storyboardShot.shotId,
                                    voiceAssetId,
                                    anchors: buildLipSyncAnchors({
                                        text: plan.voiceLineText,
                                        durationMs: voiceDurationMs,
                                    }),
                                }),
                                mimeType: 'application/json',
                                durationMs: voiceDurationMs,
                                fps: 30,
                                resolution: 'n/a',
                                sourceEventIds: [...storyboardShot.sourceEventIds],
                                routeSource: voiceResult.routeSource,
                                metadata: {
                                    queueItemId: queueItem.queueItemId,
                                    source: 'voice-audio-derived',
                                    anchors: buildLipSyncAnchors({
                                        text: plan.voiceLineText,
                                        durationMs: voiceDurationMs,
                                    }),
                                    voiceAssetId,
                                    transcriptHash: createHash(plan.voiceLineText),
                                },
                            };
                            shotAssets.push(lipSyncAsset);
                            lipSyncByShotId.set(storyboardShot.shotId, lipSyncAsset);
                            renderedVoiceShotIds.add(storyboardShot.shotId);
                            batchLipSyncGenerated += 1;
                            batchSucceeded += 1;
                        }
                        catch (error) {
                            const fallbackAudit = extractFallbackAuditRecord(error instanceof VideoPlayError ? error.details : undefined);
                            if (fallbackAudit) {
                                input.fallbackAudits.push(fallbackAudit);
                            }
                            queueItem.status = 'FAILED';
                            queueItem.errorMessage = error instanceof Error ? error.message : String(error || '');
                            batchFailed += 1;
                            emitVideoPlayLog({
                                level: 'warn',
                                message: `videoplay:asset-render:${queueItem.modality}-failed`,
                                details: {
                                    shotId: queueItem.shotId,
                                    queueItemId: queueItem.queueItemId,
                                    error: queueItem.errorMessage,
                                },
                            });
                        }
                    }
                    input.runEventFactory.pushEvent({
                        step: input.step,
                        eventType: 'step.chunk',
                        attempt: input.attempt,
                        stepInputHash: input.stepInputHash,
                        lastCompletedUnit: context.segmentedEpisode.episodeId,
                        details: {
                            episodeId: context.segmentedEpisode.episodeId,
                            phase: 'batch-queue-execute',
                            batchId: batch.batchId,
                            modality: batch.modality,
                            queueItems: batch.queueItemIds.length,
                            succeeded: batchSucceeded,
                            failed: batchFailed,
                        },
                    });
                    if (batch.modality === 'voice') {
                        input.runEventFactory.pushEvent({
                            step: input.step,
                            eventType: 'step.chunk',
                            attempt: input.attempt,
                            stepInputHash: input.stepInputHash,
                            lastCompletedUnit: context.segmentedEpisode.episodeId,
                            details: {
                                episodeId: context.segmentedEpisode.episodeId,
                                phase: 'voice-render',
                                succeeded: batchSucceeded,
                                failed: batchFailed,
                            },
                        });
                        input.runEventFactory.pushEvent({
                            step: input.step,
                            eventType: 'step.chunk',
                            attempt: input.attempt,
                            stepInputHash: input.stepInputHash,
                            lastCompletedUnit: context.segmentedEpisode.episodeId,
                            details: {
                                episodeId: context.segmentedEpisode.episodeId,
                                phase: 'lip-sync',
                                generated: batchLipSyncGenerated,
                            },
                        });
                    }
                    else if (batch.modality === 'video') {
                        input.runEventFactory.pushEvent({
                            step: input.step,
                            eventType: 'step.chunk',
                            attempt: input.attempt,
                            stepInputHash: input.stepInputHash,
                            lastCompletedUnit: context.segmentedEpisode.episodeId,
                            details: {
                                episodeId: context.segmentedEpisode.episodeId,
                                phase: 'video-render',
                                succeeded: batchSucceeded,
                                failed: batchFailed,
                            },
                        });
                    }
                }
                for (const clip of context.storyboard.clipPlans) {
                    const representative = shotAssets.find((asset) => asset.clipId === clip.clipId && asset.assetType === 'video');
                    if (representative) {
                        clipAssets.push({
                            ...representative,
                            assetId: createUlid(),
                            shotId: representative.shotId,
                        });
                    }
                }
                const plannedShots = context.storyboard.shotPlans.length;
                const renderedShots = renderedShotIds.size;
                const renderedVoiceShots = renderedVoiceShotIds.size;
                const assetOutput: AssetRenderOutput = {
                    episodeId: context.segmentedEpisode.episodeId,
                    clipAssets,
                    shotAssets,
                    sourceEventMap,
                    renderTrace: {
                        plannedShots,
                        renderedShots,
                        analysis: {
                            shotPlans: analysisPlans.map((plan) => ({
                                shotId: plan.shotId,
                                beatId: plan.beatId,
                                complexity: plan.complexity,
                                priority: plan.priority,
                                requiredModalities: [...plan.requiredModalities],
                                voiceLineHash: createHash(plan.voiceLineText),
                            })),
                        },
                        queue: {
                            batches: queuePlan.batches,
                            items: queueItems,
                            totalJobs: queueItems.length,
                            succeededJobs: queueItems.filter((item) => item.status === 'SUCCEEDED').length,
                            failedJobs: queueItems.filter((item) => item.status === 'FAILED').length,
                        },
                    },
                    coverage: {
                        plannedShots,
                        renderedShots,
                        ratio: plannedShots > 0
                            ? Number((renderedShots / plannedShots).toFixed(6))
                            : 0,
                        plannedVoiceShots,
                        renderedVoiceShots,
                        voiceRatio: plannedVoiceShots > 0
                            ? Number((renderedVoiceShots / plannedVoiceShots).toFixed(6))
                            : 1,
                    },
                };
                const assetParsed = AssetRenderOutputSchema.safeParse(assetOutput);
                if (!assetParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.SHOT_RENDER_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SHOT_RENDER_FAILED),
                        stage: 'render',
                        retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
                        message: 'VIDEOPLAY_ASSET_OUTPUT_INVALID',
                    });
                }
                context.assetOutput = assetParsed.data;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        coverage: assetParsed.data.coverage.ratio,
                        voiceCoverage: assetParsed.data.coverage.voiceRatio,
                        queueFailedJobs: queueItems.filter((item) => item.status === 'FAILED').length,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'candidate-selection': {
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.assetOutput || !context.storyboard) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'candidate-selection',
                        message: 'VIDEOPLAY_CANDIDATE_SELECTION_REQUIRES_ASSETS',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const shotOrder = new Map(context.storyboard.shotPlans
                    .slice()
                    .sort((left, right) => left.startMs - right.startMs)
                    .map((shot, index) => [shot.shotId, index] as const));
                const selectedSegments: SelectedTimelineSegment[] = context.assetOutput.shotAssets
                    .filter((asset) => asset.assetType === 'video')
                    .slice()
                    .sort((left, right) => {
                    const leftOrder = shotOrder.get(left.shotId) ?? Number.MAX_SAFE_INTEGER;
                    const rightOrder = shotOrder.get(right.shotId) ?? Number.MAX_SAFE_INTEGER;
                    if (leftOrder !== rightOrder) {
                        return leftOrder - rightOrder;
                    }
                    return left.assetId.localeCompare(right.assetId);
                })
                    .map((asset, order) => ({
                    assetId: asset.assetId,
                    shotId: asset.shotId,
                    order,
                    trimInMs: null,
                    trimOutMs: null,
                }));
                if (selectedSegments.length === 0) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
                        stage: 'candidate-selection',
                        message: 'VIDEOPLAY_NO_VIDEO_SEGMENTS_FOR_SELECTION',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const candidateOutput: CandidateSelectionOutput = {
                    episodeId: context.segmentedEpisode.episodeId,
                    selectedAssetIds: CANDIDATE_SELECTION_POLICY.autoSelectAllRenderedVideo
                        ? selectedSegments.map((segment) => segment.assetId)
                        : [],
                    timelineSegments: selectedSegments,
                };
                const candidateParsed = CandidateSelectionOutputSchema.safeParse(candidateOutput);
                if (!candidateParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
                        stage: 'candidate-selection',
                        message: 'VIDEOPLAY_CANDIDATE_SELECTION_OUTPUT_INVALID',
                    });
                }
                context.candidateSelection = candidateParsed.data;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        selectedSegmentCount: selectedSegments.length,
                        selectedAssetCount: candidateOutput.selectedAssetIds.length,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'audio-design': {
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.storyboard || !context.screenplay) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'audio-design',
                        message: 'VIDEOPLAY_AUDIO_DESIGN_REQUIRES_STORYBOARD',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const totalDurationMs = context.storyboard.shotPlans.reduce((sum, shot) => sum + shot.durationMs, 0);
                const audioVars = {
                    episodeId: context.segmentedEpisode.episodeId,
                    beatsSummary: context.screenplay.beats.map((beat) => beat.summary).join('; '),
                    shotCount: String(context.storyboard.shotPlans.length),
                    totalDurationMs: String(totalDurationMs),
                };
                const audioValidated = validatePromptVariables('audio-design', audioVars);
                if (!audioValidated.ok) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED),
                        stage: 'audio-design',
                        message: audioValidated.issues.join(';'),
                    });
                }
                const audioPrompt = renderPromptTemplate('audio-design', context.projectionLocale, audioValidated.data);
                const audioResult = await invokeWithRouteFallback({
                    stage: 'audio-design-bgm',
                    capability: 'text.generate',
                    traceId: input.traceId,
                    checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateText({
                        prompt: audioPrompt,
                        systemPrompt: 'Return JSON with bgmRecommendation and sfxPlan.',
                        capability: 'text.generate',
                        binding,
                        maxTokens: 512,
                    }),
                });
                if (audioResult.fallbackAudit) {
                    input.fallbackAudits.push(audioResult.fallbackAudit);
                }
                const audioParsed = parseStructuredModelOutput(audioResult.result.text);
                const bgmRec = audioParsed?.bgmRecommendation as Record<string, unknown> | undefined;
                const bgmTrack: BgmTrack = {
                    trackId: createUlid(),
                    uri: String(bgmRec?.uri || '').trim() || createJsonDataUri({
                        kind: 'videoplay.audio-design.bgm-plan',
                        episodeId: context.segmentedEpisode.episodeId,
                        recommendation: bgmRec || null,
                    }),
                    durationMs: totalDurationMs,
                    fadeInMs: AUDIO_DESIGN_POLICY.defaultFadeInMs,
                    fadeOutMs: AUDIO_DESIGN_POLICY.defaultFadeOutMs,
                    volume: AUDIO_DESIGN_POLICY.defaultBgmVolume,
                    startOffsetMs: 0,
                };
                const sfxPlanRaw = Array.isArray(audioParsed?.sfxPlan) ? audioParsed!.sfxPlan : [];
                const sfxLayers: SfxLayer[] = sfxPlanRaw.map((entry: unknown, sfxIndex: number) => {
                    const sfxEntry = entry as Record<string, unknown>;
                    return {
                        sfxId: createUlid(),
                        uri: String(sfxEntry.uri || '').trim() || createJsonDataUri({
                            kind: 'videoplay.audio-design.sfx-plan',
                            episodeId: context.segmentedEpisode.episodeId,
                            sfxIndex,
                            plan: sfxEntry,
                        }),
                        startMs: Number(sfxEntry.startMs || 0),
                        endMs: Number(sfxEntry.endMs || totalDurationMs),
                        volume: AUDIO_DESIGN_POLICY.defaultSfxVolume,
                    };
                });
                const audioDesignOutput: AudioDesignOutput = {
                    episodeId: context.segmentedEpisode.episodeId,
                    bgmTrack,
                    sfxLayers,
                };
                const audioDesignParsed = AudioDesignOutputSchema.safeParse(audioDesignOutput);
                if (!audioDesignParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED),
                        stage: 'audio-design',
                        message: 'VIDEOPLAY_AUDIO_DESIGN_OUTPUT_INVALID',
                    });
                }
                context.audioDesign = audioDesignParsed.data;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        hasBgm: bgmTrack !== null,
                        sfxLayerCount: sfxLayers.length,
                        routeSource: audioResult.routeSource,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'edit-compose': {
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.storyboard || !context.assetOutput || !context.candidateSelection) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'edit',
                        message: 'VIDEOPLAY_EDIT_REQUIRES_STORYBOARD_ASSET_SELECTION',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const composeOutput = composeEpisode({
                    episodeId: context.segmentedEpisode.episodeId,
                    storyboard: context.storyboard,
                    assetOutput: context.assetOutput,
                    candidateSelection: context.candidateSelection,
                });
                if (context.audioDesign) {
                    composeOutput.bgmTrack = context.audioDesign.bgmTrack;
                    composeOutput.sfxLayers = [...context.audioDesign.sfxLayers];
                }
                context.composeOutput = composeOutput;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        durationMs: composeOutput.episodeMasterVideo.durationMs,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'qc-gate': {
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.screenplay || !context.storyboard || !context.assetOutput || !context.composeOutput) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'qc',
                        message: 'VIDEOPLAY_QC_REQUIRES_UPSTREAM_OUTPUTS',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const qcReport = evaluateQualityGates({
                    baselineSourceEventIds: new Set<string>(context.baselineSourceEventIds),
                    episode: context.segmentedEpisode,
                    screenplay: context.screenplay,
                    storyboard: context.storyboard,
                    assetOutput: context.assetOutput,
                    composeOutput: context.composeOutput,
                });
                if (qcReport.status === 'REJECTED') {
                    const reasonCode = qcReport.failReasonCode || VIDEOPLAY_REASON.QC_FAILED;
                    throw new VideoPlayError({
                        reasonCode,
                        actionHint: actionHintByReasonCode(reasonCode),
                        stage: 'qc',
                        message: 'VIDEOPLAY_QC_REJECTED_FAIL_CLOSE',
                        details: {
                            episodeId: context.segmentedEpisode.episodeId,
                            gates: qcReport.gates,
                        },
                    });
                }
                context.qcReport = qcReport;
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        status: qcReport.status,
                    },
                });
            }
            return {
                lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
                details: {
                    episodeCount: input.snapshot.episodeContexts.length,
                },
            };
        }
        case 'release-package': {
            const episodes: EpisodeRecord[] = [];
            const releaseCandidates: ReleasePackage[] = [];
            for (const context of input.snapshot.episodeContexts) {
                throwIfCanceled(input.control, input.step);
                if (!context.screenplay || !context.storyboard || !context.assetOutput || !context.composeOutput || !context.qcReport) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
                        stage: 'package',
                        message: 'VIDEOPLAY_RELEASE_REQUIRES_UPSTREAM_OUTPUTS',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                if (!(context.qcReport.status === 'APPROVED' || context.qcReport.status === 'ADJUSTED')) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID),
                        stage: 'package',
                        message: 'VIDEOPLAY_RELEASE_QC_STATUS_INVALID',
                        details: { episodeId: context.segmentedEpisode.episodeId },
                    });
                }
                const releaseCandidate: ReleasePackage = {
                    releaseId: createUlid(),
                    episodeId: context.segmentedEpisode.episodeId,
                    qcStatus: context.qcReport.status,
                    episodeMasterVideo: context.composeOutput.episodeMasterVideo,
                    episodePoster: context.composeOutput.episodePoster,
                    episodeCaptionTrack: context.composeOutput.episodeCaptionTrack,
                    episodeMetadata: {
                        storyId: input.pipelineInput.storyId,
                        sourceTurnIds: [...context.segmentedEpisode.sourceTurnIds],
                        sourceEventIds: [...context.segmentedEpisode.sourceEventIds],
                        durationSec: context.qcReport.durationSec,
                        policyHash: context.segmentedEpisode.policyHash,
                    },
                    episodeTraceBundle: {
                        traceId: input.traceId,
                        runId: input.runId,
                        fallbackAudits: [...input.fallbackAudits],
                        runEvents: [...input.runEventFactory.events],
                        sourceCoverage: buildTraceCoverage({
                            episode: context.segmentedEpisode,
                            screenplay: context.screenplay,
                            storyboard: context.storyboard,
                        }),
                    },
                    published: false,
                    publishedAt: null,
                    createdAt: nowIso(),
                };
                const releaseParsed = ReleasePackageSchema.safeParse(releaseCandidate);
                if (!releaseParsed.success) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID),
                        stage: 'package',
                        message: 'VIDEOPLAY_RELEASE_CANDIDATE_INVALID',
                    });
                }
                const branchId = createUlid();
                const baseVersionId = createUlid();
                const episodeRecord: EpisodeRecord = {
                    episodeId: context.segmentedEpisode.episodeId,
                    storyId: input.pipelineInput.storyId,
                    sourceTurnIds: [...context.segmentedEpisode.sourceTurnIds],
                    sourceEventIds: [...context.segmentedEpisode.sourceEventIds],
                    policyHash: context.segmentedEpisode.policyHash,
                    segmentationReason: context.segmentedEpisode.segmentationReason,
                    screenplay: context.screenplay,
                    storyboard: context.storyboard,
                    quality: context.qcReport,
                    candidateRelease: releaseParsed.data,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                    editor: {
                        activeBranchId: branchId,
                        branches: {
                            [branchId]: {
                                branchId,
                                name: 'main',
                                headVersionId: baseVersionId,
                                createdAt: nowIso(),
                            },
                        },
                        lineage: [
                            {
                                versionId: baseVersionId,
                                parentVersionId: null,
                                branchId,
                                operationType: 'insert-shot',
                                deltaSummary: 'bootstrap-lineage',
                                operator: input.pipelineInput.operator || 'system',
                                timestamp: nowIso(),
                            },
                        ],
                        conflictRecords: [],
                    },
                };
                const episodeIdempotencyKey = createHash(`${input.runId}:${episodeRecord.episodeId}:episode-upsert`);
                const assetIdempotencyKey = createHash(`${input.runId}:${episodeRecord.episodeId}:asset-upsert`);
                await input.deps.hookClient.data.query({
                    capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
                    query: {
                        operation: 'upsert',
                        idempotencyKey: episodeIdempotencyKey,
                        episode: episodeRecord,
                    },
                });
                await input.deps.hookClient.data.query({
                    capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
                    query: {
                        operation: 'upsert',
                        idempotencyKey: assetIdempotencyKey,
                        episodeId: episodeRecord.episodeId,
                        assets: context.assetOutput.shotAssets,
                    },
                });
                context.releaseCandidate = releaseParsed.data;
                context.episodeRecord = episodeRecord;
                if (context.candidateSelection) {
                    await input.deps.hookClient.data.query({
                        capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
                        query: {
                            operation: 'upsert-candidate-selection',
                            episodeId: episodeRecord.episodeId,
                            candidateSelection: context.candidateSelection,
                        },
                    });
                }
                if (context.audioDesign) {
                    await input.deps.hookClient.data.query({
                        capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
                        query: {
                            operation: 'upsert-audio-design',
                            episodeId: episodeRecord.episodeId,
                            audioDesign: context.audioDesign,
                        },
                    });
                }
                episodes.push(episodeRecord);
                releaseCandidates.push(releaseParsed.data);
                input.runEventFactory.pushEvent({
                    step: input.step,
                    eventType: 'step.chunk',
                    attempt: input.attempt,
                    stepInputHash: input.stepInputHash,
                    lastCompletedUnit: context.segmentedEpisode.episodeId,
                    idempotencyKey: episodeIdempotencyKey,
                    details: {
                        episodeId: context.segmentedEpisode.episodeId,
                        releaseId: releaseParsed.data.releaseId,
                        assetIdempotencyKey,
                    },
                });
            }
            if (input.snapshot.characterCasting) {
                await input.deps.hookClient.data.query({
                    capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
                    query: {
                        operation: 'upsert-character-casting',
                        storyId: input.pipelineInput.storyId,
                        characterCasting: input.snapshot.characterCasting,
                    },
                });
            }
            if (input.snapshot.scenePlanning) {
                await input.deps.hookClient.data.query({
                    capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
                    query: {
                        operation: 'upsert-scene-planning',
                        storyId: input.pipelineInput.storyId,
                        scenePlanning: input.snapshot.scenePlanning,
                    },
                });
            }
            input.snapshot.episodes = episodes;
            input.snapshot.releaseCandidates = releaseCandidates;
            return {
                lastCompletedUnit: episodes[episodes.length - 1]?.episodeId ?? undefined,
                details: {
                    episodeCount: episodes.length,
                    releaseCandidateCount: releaseCandidates.length,
                },
            };
        }
        default:
            return {};
    }
}
