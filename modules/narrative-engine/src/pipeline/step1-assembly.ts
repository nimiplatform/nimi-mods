import {
    pickNarrativeRelationContextRow,
    pickNarrativeStoryContextRow,
    pickNarrativeSubjectContextRow,
    resolveNarrativeContextStoryAnchor,
} from '../context-anchor.js';
import { NARRATIVE_REASON_CODES } from '../contracts.js';
import { NarrativeContextSnapshotSchema } from '../schemas.js';
import type {
    NarrativeContextScopes,
    NarrativeContextSnapshot,
    NarrativeRouteOptionsSnapshot,
    NarrativeStepResult,
    NarrativeTurnInputNormalized,
} from '../types.js';
import { asRecord } from "@nimiplatform/sdk/mod";
import {
    extractActors,
    extractCharacterRelations,
    extractFuturePressure,
    extractMemorySnippets,
    extractSceneMaterial,
    extractWorldviewRules,
    pickLatestScopeRow,
    resolveRequestedStoryContextId,
    resolveTurnEntryEventId,
    selectFutureEvents,
    selectLorebooks,
    selectRelationRows,
    selectScenes,
    selectTimelineEvents,
    toNumber,
    toRecordArray,
    toString,
    toStringArray,
    uniqueStrings,
} from './step1-extractors.js';
import {
    buildAdvanceHints,
    buildCompiledPromptContext,
} from './step1-formatters.js';
import type { NarrativePromptStats, SpineEventLike } from './step1-formatters.js';

type NarrativeAssemblyAssets = {
    routeOptions: NarrativeRouteOptionsSnapshot;
    compiledPrompt: string;
    promptStats: NarrativePromptStats;
};

export type NarrativeStep1AssemblyResult = {
    snapshot: NarrativeContextSnapshot;
    assets: NarrativeAssemblyAssets;
};

export function toNarrativeRouteOptions(turn: NarrativeTurnInputNormalized): NarrativeRouteOptionsSnapshot {
    const selected = asRecord(turn.binding);
    return {
        capability: turn.capability,
        selected: {
            source: toString(selected.source),
            model: toString(selected.model),
            connectorId: toString(selected.connectorId),
        },
    };
}

export function resolveNarrativeScopes(input: {
    rows: Array<Record<string, unknown>>;
    turn: NarrativeTurnInputNormalized;
    worldEvents: Array<Record<string, unknown>>;
}): {
    scopes: NarrativeContextScopes;
    coverage: NarrativeContextSnapshot['contextCoverage'];
} {
    const canon = pickLatestScopeRow({
        rows: input.rows,
        scope: 'CANON',
    });
    const entryEventId = resolveTurnEntryEventId(input.turn);
    const anchorResolution = resolveNarrativeContextStoryAnchor({
        rows: input.rows,
        requestedStoryId: resolveRequestedStoryContextId(input.turn),
        primaryAgentId: input.turn.agentId,
        participantIds: uniqueStrings(input.worldEvents.flatMap((event) => toStringArray(event.characterRefs))),
        locationRefs: uniqueStrings(input.worldEvents.flatMap((event) => toStringArray(event.locationRefs))),
        entryEventId,
    });
    const story = pickNarrativeStoryContextRow({
        rows: input.rows,
        resolvedStoryId: anchorResolution.resolvedStoryId,
    });
    const storyScope = {
        ...asRecord(story?.narrativeSetting),
        ...asRecord(story?.narrativeState),
    };
    const castPolicy = asRecord(storyScope.castPolicy);
    const relationCandidateAgentIds = uniqueStrings([
        ...toStringArray(castPolicy.mandatorySubjectIds),
        ...toStringArray(castPolicy.optionalSubjectIds),
        ...input.worldEvents.flatMap((event) => toStringArray(event.characterRefs)),
    ]).filter((candidate) => candidate !== input.turn.agentId);
    const subject = pickNarrativeSubjectContextRow({
        rows: input.rows,
        resolvedStoryId: anchorResolution.resolvedStoryId,
        primaryAgentId: input.turn.agentId,
    });
    const relation = pickNarrativeRelationContextRow({
        rows: input.rows,
        resolvedStoryId: anchorResolution.resolvedStoryId,
        primaryAgentId: input.turn.agentId,
        userId: input.turn.userId,
        candidateAgentIds: relationCandidateAgentIds,
    });
    const canonScope = {
        ...asRecord(canon?.narrativeSetting),
        ...asRecord(canon?.narrativeState),
    };
    const subjectScope = {
        ...asRecord(subject?.narrativeSetting),
        ...asRecord(subject?.narrativeState),
    };
    const relationScope = {
        ...asRecord(relation?.narrativeSetting),
        ...asRecord(relation?.narrativeState),
    };
    const warnings: string[] = [];
    if (story && anchorResolution.strategy !== 'exact') {
        warnings.push('NARRATIVE_CONTEXT_STORY_SCOPE_FALLBACK_WARN');
    }
    if (!subject) {
        warnings.push('NARRATIVE_CONTEXT_SUBJECT_MISSING_WARN');
    }
    if (!relation) {
        warnings.push('NARRATIVE_CONTEXT_RELATION_MISSING_WARN');
    }
    return {
        scopes: {
            CANON: canonScope,
            STORY: storyScope,
            SUBJECT: subjectScope,
            RELATION: relationScope,
        },
        coverage: {
            canon: Boolean(canon),
            story: Boolean(story),
            subject: Boolean(subject),
            relation: Boolean(relation),
            scene: false,
            warnings,
        },
    };
}

export function resolveScene(input: {
    worldScenes: Array<Record<string, unknown>>;
    worldEvents: Array<Record<string, unknown>>;
    storyScope: Record<string, unknown>;
}): Record<string, unknown> | null {
    const sceneById = new Map<string, Record<string, unknown>>();
    for (const scene of input.worldScenes) {
        const id = toString(scene.id);
        if (id) {
            sceneById.set(id, scene);
        }
    }
    const preferredSceneId = toString(input.storyScope.recommendedSceneId);
    if (preferredSceneId && sceneById.has(preferredSceneId)) {
        return sceneById.get(preferredSceneId) || null;
    }
    for (const event of input.worldEvents) {
        const refs = toStringArray(event.locationRefs);
        for (const ref of refs) {
            if (sceneById.has(ref)) {
                return sceneById.get(ref) || null;
            }
        }
    }
    return input.worldScenes[0] || null;
}

export function hasSufficientContext(snapshot: NarrativeContextSnapshot): boolean {
    if (!snapshot.contextCoverage.canon || !snapshot.contextCoverage.story) {
        return false;
    }
    if (!snapshot.place) {
        return false;
    }
    if (snapshot.worldviewRules.length === 0 && snapshot.sceneMaterial.length === 0) {
        return false;
    }
    return true;
}

export function countMemoryItems(memoryRecall: Record<string, unknown>): number {
    const rows: unknown[] = [
        memoryRecall.items,
        memoryRecall.core,
        memoryRecall.e2e,
        memoryRecall.memories,
        memoryRecall.rows,
        memoryRecall.data,
    ];
    const count = rows.reduce<number>((sum, row) => (sum + (Array.isArray(row) ? row.length : 0)), 0);
    if (count > 0) {
        return count;
    }
    return Object.keys(memoryRecall).length > 0 ? 1 : 0;
}

export async function runNarrativeStep1Assembly(input: {
    turn: NarrativeTurnInputNormalized;
    queryWorldEvents: () => Promise<unknown>;
    queryWorldLorebooks: () => Promise<unknown>;
    queryWorldScenes: () => Promise<unknown>;
    queryNarrativeContexts: () => Promise<unknown>;
    queryAgentMemoryRecall: () => Promise<unknown>;
    recentSpineEvents?: SpineEventLike[];
}): Promise<NarrativeStepResult<NarrativeStep1AssemblyResult>> {
    try {
        const [worldEventsPayload, worldLorebooksPayload, worldScenesPayload, narrativeContextsPayload, memoryRecallPayload,] = await Promise.all([
            input.queryWorldEvents(),
            input.queryWorldLorebooks(),
            input.queryWorldScenes(),
            input.queryNarrativeContexts(),
            input.queryAgentMemoryRecall().catch(() => ({
                items: [],
                core: [],
                e2e: [],
                recallSource: 'unavailable',
            })),
        ]);
        const worldEvents = toRecordArray(worldEventsPayload);
        const worldLorebooks = toRecordArray(worldLorebooksPayload);
        const worldScenes = toRecordArray(worldScenesPayload);
        const narrativeContexts = toRecordArray(narrativeContextsPayload);
        const memoryRecall = asRecord(memoryRecallPayload);
        const routeOptions = toNarrativeRouteOptions(input.turn);
        const resolved = resolveNarrativeScopes({
            rows: narrativeContexts,
            turn: input.turn,
            worldEvents,
        });
        const scene = resolveScene({
            worldScenes,
            worldEvents,
            storyScope: resolved.scopes.STORY,
        });
        if (!scene) {
            resolved.coverage.warnings.push('NARRATIVE_CONTEXT_SCENE_MISSING_WARN');
        }
        resolved.coverage.scene = Boolean(scene);
        const phase = toString(resolved.scopes.STORY.phase || asRecord(resolved.scopes.STORY.narrativeState).phase)
            || 'opening';
        const objective = toString(resolved.scopes.STORY.objective
            || asRecord(resolved.scopes.STORY.narrativeState).objective) || 'advance-story';
        const tensionTarget = toNumber(resolved.scopes.STORY.tension
            || asRecord(resolved.scopes.STORY.narrativeState).tension, 0.5);
        const openThreads = toStringArray(resolved.scopes.STORY.openThreads
            || asRecord(resolved.scopes.STORY.narrativeState).openThreads);
        const startupPolicy = {
            initiative: asRecord(resolved.scopes.STORY.initiativePolicy
                || asRecord(resolved.scopes.STORY.narrativeSetting).initiativePolicy),
            pacing: asRecord(resolved.scopes.STORY.pacingPolicy
                || asRecord(resolved.scopes.STORY.narrativeSetting).pacingPolicy),
        };
        const place = toString(scene?.name)
            || toString(asRecord(resolved.scopes.STORY.narrativeSetting).location)
            || `world:${input.turn.worldId}`;
        const sceneMaterial = extractSceneMaterial({
            worldEvents,
            storyScope: resolved.scopes.STORY,
            scene,
        });
        const snapshot: NarrativeContextSnapshot = {
            place,
            worldviewRules: extractWorldviewRules(worldLorebooks),
            sceneMaterial,
            availableActors: extractActors({
                worldEvents,
                scene,
                turn: input.turn,
            }),
            narrativeStyle: {
                ...asRecord(resolved.scopes.CANON),
                routeCapability: input.turn.capability,
                routeSource: toString(routeOptions.selected.source),
                routeModel: toString(routeOptions.selected.model),
            },
            characterRelations: extractCharacterRelations(resolved.scopes),
            phase,
            objective,
            tensionTarget: Math.max(0, Math.min(1, tensionTarget)),
            openThreads: uniqueStrings(openThreads).slice(0, 20),
            startupPolicy,
            futurePressure: extractFuturePressure(worldEvents),
            contextCoverage: resolved.coverage,
            narrativeContextScopes: resolved.scopes,
        };
        const snapshotCheck = NarrativeContextSnapshotSchema.safeParse(snapshot);
        if (!snapshotCheck.success || !hasSufficientContext(snapshot)) {
            return {
                ok: false,
                reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
                actionHint: 'Complete CANON/STORY contexts and retry.',
                value: null,
            };
        }
        const entryEventId = resolveTurnEntryEventId(input.turn);
        const timelineEvents = selectTimelineEvents({
            worldEvents,
            turn: input.turn,
            entryEventId,
        });
        const futureEvents = selectFutureEvents({
            worldEvents,
            turn: input.turn,
        });
        const advanceHints = buildAdvanceHints({
            turn: input.turn,
            snapshot,
            timelineEvents,
            futureEvents,
            recentSpineEvents: input.recentSpineEvents,
        });
        const lorebooks = selectLorebooks({
            worldLorebooks,
            turn: input.turn,
            snapshot,
            timelineEvents,
        });
        const scenes = selectScenes({
            worldScenes,
            selectedScene: scene,
            timelineEvents,
            futureEvents,
        });
        const relations = selectRelationRows({
            snapshot,
            resolvedScopes: resolved.scopes,
        });
        const memories = extractMemorySnippets(memoryRecall);
        const sourceCounts: NarrativePromptStats['sourceCounts'] = {
            worldEvents: worldEvents.length,
            worldLorebooks: worldLorebooks.length,
            worldScenes: worldScenes.length,
            narrativeContexts: narrativeContexts.length,
            memoryItems: countMemoryItems(memoryRecall),
        };
        const compiled = buildCompiledPromptContext({
            turn: input.turn,
            snapshot,
            routeOptions,
            resolvedScopes: resolved.scopes,
            timelineEvents,
            futureEvents,
            advanceHints,
            lorebooks,
            scenes,
            relations,
            memories,
            sourceCounts,
        });
        const assets: NarrativeAssemblyAssets = {
            routeOptions,
            compiledPrompt: compiled.compiledPrompt,
            promptStats: compiled.promptStats,
        };
        return {
            ok: true,
            reasonCode: null,
            actionHint: 'step1-assembly-passed',
            value: {
                snapshot,
                assets,
            },
        };
    }
    catch {
        return {
            ok: false,
            reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
            actionHint: 'Complete CANON/STORY contexts and retry.',
            value: null,
        };
    }
}
