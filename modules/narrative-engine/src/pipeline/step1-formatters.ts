import { asRecord } from "@nimiplatform/sdk/mod";
import type {
    NarrativeContextScopes,
    NarrativeContextSnapshot,
    NarrativeRouteOptionsSnapshot,
    NarrativeTurnInputNormalized,
} from '../types.js';
import {
    clipJson,
    clipText,
    normalizeWhitespace,
    toString,
    toStringArray,
    uniqueStrings,
} from './step1-extractors.js';

type NarrativePromptStats = {
    sectionChars: Record<string, number>;
    totalPromptChars: number;
    sourceCounts: {
        worldEvents: number;
        worldLorebooks: number;
        worldScenes: number;
        narrativeContexts: number;
        memoryItems: number;
    };
    selectedCounts: {
        timelineEvents: number;
        futureEvents: number;
        advanceHints: number;
        lorebooks: number;
        scenes: number;
        relations: number;
        memories: number;
    };
};

export type { NarrativePromptStats };

type SpineEventLike = {
    type?: string;
    [key: string]: unknown;
};

export type { SpineEventLike };

export function formatEventLine(event: Record<string, unknown>): string {
    const id = toString(event.id || event.eventId || 'event');
    const level = toString(event.level || 'PRIMARY').toUpperCase();
    const horizon = toString(event.eventHorizon || 'ONGOING').toUpperCase();
    const title = clipText(event.title || event.name || id, 80);
    const summary = clipText(event.summary || event.description || event.process, 140);
    const result = clipText(event.result, 90);
    const characterRefs = toStringArray(event.characterRefs).slice(0, 5).join(',');
    const locationRefs = toStringArray(event.locationRefs).slice(0, 4).join(',');
    const details = [
        `[${level}/${horizon}]`,
        `${id}: ${title}`,
        summary ? `summary=${summary}` : '',
        result ? `result=${result}` : '',
        characterRefs ? `characters=${characterRefs}` : '',
        locationRefs ? `locations=${locationRefs}` : '',
    ].filter(Boolean);
    return details.join(' | ');
}

export function formatLorebookLine(lorebook: Record<string, unknown>): string {
    const id = toString(lorebook.key || lorebook.id || lorebook.title || 'lorebook');
    const title = clipText(lorebook.title || lorebook.key || lorebook.id, 70);
    const summary = clipText(lorebook.summary || lorebook.description || lorebook.content, 180);
    const constantTag = Boolean(lorebook.constant) ? '[constant]' : '[dynamic]';
    return `${constantTag} ${id}${title ? ` (${title})` : ''} :: ${summary || '(empty)'}`;
}

export function formatSceneLine(scene: Record<string, unknown>): string {
    const id = toString(scene.id || scene.sceneId || 'scene');
    const name = clipText(scene.name || scene.title || id, 64);
    const description = clipText(scene.description || asRecord(scene.setting).atmosphere, 150);
    const activeEntities = toStringArray(scene.activeEntities).slice(0, 6).join(',');
    return `${id}: ${name}${description ? ` | ${description}` : ''}${activeEntities ? ` | entities=${activeEntities}` : ''}`;
}

export function formatRelationLine(relation: Record<string, unknown>): string {
    const subjectId = toString(relation.subjectId || relation.sourceId || relation.sourceLabel);
    const targetId = toString(relation.targetSubjectId || relation.targetId || relation.targetLabel);
    const relationType = clipText(relation.relationType
        || asRecord(relation.relationContract).relationType
        || asRecord(relation.narrativeSetting).relationType
        || asRecord(relation.narrativeState).relationType, 60);
    const detail = clipText(relation.detail
        || relation.summary
        || relation.description
        || clipJson(relation, 180), 180);
    return `${subjectId || '(subject)'} -> ${targetId || '(target)'}${relationType ? ` [${relationType}]` : ''} :: ${detail}`;
}

export function formatFutureNoteLine(event: Record<string, unknown>): string {
    const title = clipText(event.title || event.name || event.id, 80) || '(untitled)';
    const pressure = clipText(event.summary || event.description || event.process, 120);
    const consequence = clipText(event.result, 80);
    return [
        `[hidden-note] ${title}`,
        pressure ? `pressure=${pressure}` : '',
        consequence ? `possible-consequence=${consequence}` : '',
    ].filter(Boolean).join(' | ');
}

export function eventNarrativeText(event: Record<string, unknown>): string {
    return normalizeWhitespace([
        toString(event.title || event.name),
        toString(event.summary || event.description || event.process),
        toString(event.result),
    ].join(' ')).toLowerCase();
}

export function hasActionSignal(text: string): boolean {
    if (!text) {
        return false;
    }
    return /(attack|retreat|reveal|discover|decide|move|trigger|冲|杀|战|破|撤|突|追|逃|揭|现|决|转移|引爆|反击|围攻|封锁)/i.test(text);
}

export function hasEscalationSignal(text: string): boolean {
    if (!text) {
        return false;
    }
    return /(crisis|collapse|deadline|siege|injury|fatal|urgent|危机|失控|崩|迫近|倒计时|重伤|灭|围城|逼近|绝境)/i.test(text);
}

export function buildAdvanceHints(input: {
    turn: NarrativeTurnInputNormalized;
    snapshot: NarrativeContextSnapshot;
    timelineEvents: Array<Record<string, unknown>>;
    futureEvents: Array<Record<string, unknown>>;
    recentSpineEvents?: SpineEventLike[];
}): string[] {
    const hints: string[] = [];
    const recentTimeline = input.timelineEvents.slice(0, 6);
    const recentTexts = recentTimeline.map(eventNarrativeText).filter(Boolean);
    const actionCount = recentTexts.filter((text) => hasActionSignal(text)).length;
    const escalationCount = recentTexts.filter((text) => hasEscalationSignal(text)).length;
    if (recentTexts.length >= 4 && actionCount === 0) {
        hints.push('P2 low_action_plateau: Inject at least one concrete ACTION/DECISION/DISCOVERY beat this turn.');
    }
    if (input.snapshot.tensionTarget >= 0.6 && recentTexts.length >= 3 && escalationCount === 0) {
        hints.push('P2 tension_stagnation: Target tension is high; add pressure/escalation without instant resolution.');
    }
    if (input.snapshot.openThreads.length > 0) {
        hints.push(`P2 unresolved_threads: Keep at least one thread unresolved -> ${input.snapshot.openThreads.slice(0, 3).map((item) => clipText(item, 70)).join(' | ')}`);
    }
    if (input.futureEvents.length > 0) {
        hints.push('P2 anti-spoiler: Future notes are hidden; only foreshadow via atmosphere or NPC behavior.');
    }
    if (input.turn.triggerSource === 'AgentInitiative' && input.snapshot.openThreads.length === 0) {
        hints.push('P3 initiative_guard: No open thread; prefer subtle world pressure over hard plot leap.');
    }
    // Spine-history-based rhythm hints
    const spine = Array.isArray(input.recentSpineEvents) ? input.recentSpineEvents : [];
    if (spine.length >= 5) {
        const last5 = spine.slice(-5);
        const typeCounts = new Map<string, number>();
        for (const event of last5) {
            const eventType = toString(event.type || 'scene-beat');
            typeCounts.set(eventType, (typeCounts.get(eventType) || 0) + 1);
        }
        for (const [eventType, count] of typeCounts) {
            if (count >= 3) {
                hints.push(`P2 rhythm_monotony: Last 5 spine events have ${count}x "${eventType}"; vary event types for narrative rhythm.`);
                break;
            }
        }
        const dialogueCount = typeCounts.get('dialogue') || 0;
        if (dialogueCount >= 4) {
            hints.push('P2 dialogue_stagnation: 4+ of last 5 spine events are dialogue; inject action, observation, or scene-beat.');
        }
    }
    return uniqueStrings(hints).slice(0, 8);
}

export function buildCompiledPromptContext(input: {
    turn: NarrativeTurnInputNormalized;
    snapshot: NarrativeContextSnapshot;
    routeOptions: NarrativeRouteOptionsSnapshot;
    resolvedScopes: NarrativeContextScopes;
    timelineEvents: Array<Record<string, unknown>>;
    futureEvents: Array<Record<string, unknown>>;
    advanceHints: string[];
    lorebooks: Array<Record<string, unknown>>;
    scenes: Array<Record<string, unknown>>;
    relations: Array<Record<string, unknown>>;
    memories: string[];
    sourceCounts: NarrativePromptStats['sourceCounts'];
}): {
    compiledPrompt: string;
    promptStats: NarrativePromptStats;
} {
    const storyStateLines = [
        `phase=${input.snapshot.phase}`,
        `objective=${input.snapshot.objective}`,
        `tensionTarget=${String(input.snapshot.tensionTarget)}`,
        `openThreads=${input.snapshot.openThreads.join(' | ') || '(none)'}`,
    ];
    const sectionEntries: Array<[
        string,
        string
    ]> = [
        ['coordinates', [
                `storyId=${input.turn.storyId}`,
                `worldId=${input.turn.worldId}`,
                `agentId=${input.turn.agentId}`,
                `playerId=${input.turn.playerId}`,
                `triggerSource=${input.turn.triggerSource}`,
            ].join('\n')],
        ['route', [
                `source=${toString(input.routeOptions.selected.source || 'unknown')}`,
                `model=${toString(input.routeOptions.selected.model || 'unknown')}`,
                `connectorId=${toString(input.routeOptions.selected.connectorId || 'unknown')}`,
            ].join('\n')],
        ['story-state', storyStateLines.join('\n')],
        ['scene-anchor', [
                `place=${input.snapshot.place}`,
                `sceneMaterial=${input.snapshot.sceneMaterial.slice(0, 8).map((item) => clipText(item, 110)).join(' | ') || '(none)'}`,
                `availableActors=${input.snapshot.availableActors.slice(0, 16).join(' | ') || '(none)'}`,
                `futurePressure=${input.snapshot.futurePressure.slice(0, 8).map((item) => clipText(item, 90)).join(' | ') || '(none)'}`,
            ].join('\n')],
        ['timeline-events', input.timelineEvents.length > 0
                ? input.timelineEvents.map((event, index) => `${index + 1}. ${formatEventLine(event)}`).join('\n')
                : '(none)'],
        ['future-foreshadowing-hidden-notes', input.futureEvents.length > 0
                ? [
                    'IMPORTANT: Future events below are hidden author notes. Never narrate them as established facts.',
                    'Only use subtle foreshadowing through atmosphere, pacing pressure, or NPC behavior.',
                    ...input.futureEvents.map((event, index) => `${index + 1}. ${formatFutureNoteLine(event)}`),
                ].join('\n')
                : '(none)'],
        ['advance-hints', input.advanceHints.length > 0
                ? input.advanceHints.map((hint, index) => `${index + 1}. ${hint}`).join('\n')
                : '(none)'],
        ['world-lorebooks', input.lorebooks.length > 0
                ? input.lorebooks.map((lorebook, index) => `${index + 1}. ${formatLorebookLine(lorebook)}`).join('\n')
                : '(none)'],
        ['scene-options', input.scenes.length > 0
                ? input.scenes.map((scene, index) => `${index + 1}. ${formatSceneLine(scene)}`).join('\n')
                : '(none)'],
        ['relation-hints', input.relations.length > 0
                ? input.relations.map((relation, index) => `${index + 1}. ${formatRelationLine(relation)}`).join('\n')
                : '(none)'],
        ['memory-recall', input.memories.length > 0
                ? input.memories.map((memory, index) => `${index + 1}. ${clipText(memory, 180)}`).join('\n')
                : '(none)'],
        ['context-scopes', [
                `CANON=${clipJson(input.resolvedScopes.CANON, 280) || '{}'}`,
                `STORY=${clipJson(input.resolvedScopes.STORY, 280) || '{}'}`,
                `SUBJECT=${clipJson(input.resolvedScopes.SUBJECT, 220) || '{}'}`,
                `RELATION=${clipJson(input.resolvedScopes.RELATION, 220) || '{}'}`,
            ].join('\n')],
        ['trigger-context', [
                `userMessage=${clipText(input.turn.userMessage, 260) || '(empty)'}`,
                `systemContext=${clipJson(input.turn.systemContext, 260) || '{}'}`,
                `contextCoverage=${clipJson(input.snapshot.contextCoverage, 200)}`,
            ].join('\n')],
    ];
    const compiledPrompt = sectionEntries
        .map(([section, body]) => `## ${section}\n${body}`)
        .join('\n\n');
    const sectionChars: Record<string, number> = {};
    for (const [section, body] of sectionEntries) {
        sectionChars[section] = body.length;
    }
    return {
        compiledPrompt,
        promptStats: {
            sectionChars,
            totalPromptChars: compiledPrompt.length,
            sourceCounts: input.sourceCounts,
            selectedCounts: {
                timelineEvents: input.timelineEvents.length,
                futureEvents: input.futureEvents.length,
                advanceHints: input.advanceHints.length,
                lorebooks: input.lorebooks.length,
                scenes: input.scenes.length,
                relations: input.relations.length,
                memories: input.memories.length,
            },
        },
    };
}
