import { asRecord } from "@nimiplatform/sdk/mod";
import type {
    NarrativeContextScopes,
    NarrativeContextSnapshot,
    NarrativeTurnInputNormalized,
} from '../types.js';

// ── Shared utilities (also consumed by step1-formatters and step1-assembly) ──

export function toString(value: unknown): string {
    return String(value || '').trim();
}

export function normalizeWhitespace(value: string): string {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function clipText(value: unknown, maxChars: number): string {
    const normalized = normalizeWhitespace(toString(value));
    if (!normalized) {
        return '';
    }
    if (normalized.length <= maxChars) {
        return normalized;
    }
    if (maxChars <= 3) {
        return normalized.slice(0, maxChars);
    }
    return `${normalized.slice(0, maxChars - 3)}...`;
}

export function clipJson(value: unknown, maxChars: number): string {
    if (value == null) {
        return '';
    }
    try {
        return clipText(JSON.stringify(value), maxChars);
    }
    catch {
        return clipText(String(value), maxChars);
    }
}

export function toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return parsed;
}

export function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => toString(item)).filter(Boolean);
}

export function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((item) => toString(item)).filter(Boolean))];
}

export function toTimestampMs(value: unknown): number {
    const parsed = Date.parse(toString(value) || '1970-01-01T00:00:00.000Z');
    return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveTurnEntryEventId(turn: NarrativeTurnInputNormalized): string {
    return toString(turn.entryEventId);
}

export function resolveRequestedStoryContextId(turn: NarrativeTurnInputNormalized): string {
    const entryEventId = resolveTurnEntryEventId(turn);
    if (entryEventId) {
        return `story.${toString(turn.worldId)}.${entryEventId}`;
    }
    return toString(turn.storyId);
}

export function toRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
        return value
            .map((item) => asRecord(item))
            .filter((item) => Object.keys(item).length > 0);
    }
    const record = asRecord(value);
    if (Array.isArray(record.items)) {
        return toRecordArray(record.items);
    }
    if (Array.isArray(record.rows)) {
        return toRecordArray(record.rows);
    }
    if (Array.isArray(record.data)) {
        return toRecordArray(record.data);
    }
    return [];
}

// ── Extraction functions ──

export function extractWorldviewRules(lorebooks: Array<Record<string, unknown>>): string[] {
    const rules: string[] = [];
    for (const lorebook of lorebooks) {
        const key = toString(lorebook.key || lorebook.id || lorebook.title);
        const content = toString(lorebook.content || lorebook.summary || lorebook.description);
        const valueText = typeof lorebook.value === 'object' && lorebook.value
            ? JSON.stringify(lorebook.value)
            : toString(lorebook.value);
        if (key) {
            rules.push(key);
        }
        if (content) {
            rules.push(content);
        }
        if (valueText) {
            rules.push(valueText);
        }
    }
    return uniqueStrings(rules).slice(0, 60);
}

export function extractFuturePressure(worldEvents: Array<Record<string, unknown>>): string[] {
    const rows = worldEvents
        .filter((event) => toString(event.eventHorizon).toUpperCase() === 'FUTURE')
        .flatMap((event) => [
        toString(event.title || event.name),
        toString(event.summary || event.description || event.process),
        toString(event.result),
    ])
        .filter(Boolean);
    return uniqueStrings(rows).slice(0, 12);
}

export function extractSceneMaterial(input: {
    worldEvents: Array<Record<string, unknown>>;
    storyScope: Record<string, unknown>;
    scene: Record<string, unknown> | null;
}): string[] {
    const materials: string[] = [];
    for (const event of input.worldEvents) {
        const title = toString(event.title || event.name);
        const summary = toString(event.summary || event.description || event.process);
        const cause = toString(event.cause);
        const result = toString(event.result);
        if (title)
            materials.push(title);
        if (summary)
            materials.push(summary);
        if (cause)
            materials.push(cause);
        if (result)
            materials.push(result);
    }
    const materialHints = asRecord(input.storyScope.materialHints);
    if (Object.keys(materialHints).length > 0) {
        materials.push(JSON.stringify(materialHints));
    }
    if (input.scene) {
        const sceneName = toString(input.scene.name);
        const sceneDescription = toString(input.scene.description);
        if (sceneName) {
            materials.push(sceneName);
        }
        if (sceneDescription) {
            materials.push(sceneDescription);
        }
    }
    return uniqueStrings(materials).slice(0, 80);
}

export function extractActors(input: {
    worldEvents: Array<Record<string, unknown>>;
    scene: Record<string, unknown> | null;
    turn: NarrativeTurnInputNormalized;
}): string[] {
    const actors: string[] = [input.turn.agentId, input.turn.userId];
    for (const event of input.worldEvents) {
        const fields = [
            ...toStringArray(event.characterRefs),
            ...toStringArray(event.actors),
        ];
        fields.forEach((field) => actors.push(field));
    }
    if (input.scene) {
        toStringArray(input.scene.activeEntities).forEach((entity) => actors.push(entity));
    }
    return uniqueStrings(actors).slice(0, 24);
}

export function extractCharacterRelations(scopes: NarrativeContextScopes): Array<Record<string, unknown>> {
    const relation = asRecord(scopes.RELATION);
    const relationArray = relation.relations;
    if (Array.isArray(relationArray)) {
        return relationArray
            .map((item) => asRecord(item))
            .filter((item) => Object.keys(item).length > 0)
            .slice(0, 20);
    }
    if (Object.keys(relation).length > 0) {
        return [relation];
    }
    return [];
}

export function pickLatestScopeRow(input: {
    rows: Array<Record<string, unknown>>;
    scope: 'CANON' | 'STORY' | 'SUBJECT' | 'RELATION';
    score?: (row: Record<string, unknown>) => number;
    minimumScore?: number;
}): Record<string, unknown> | null {
    const rows = input.rows.filter((row) => toString(row.scope).toUpperCase() === input.scope);
    if (rows.length === 0) {
        return null;
    }
    const ordered = rows
        .map((row) => ({
        row,
        updatedAt: Date.parse(toString(row.updatedAt) || '1970-01-01T00:00:00.000Z') || 0,
        score: input.score ? input.score(row) : 0,
    }))
        .sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.updatedAt !== left.updatedAt) {
            return right.updatedAt - left.updatedAt;
        }
        return toString(right.row.id).localeCompare(toString(left.row.id));
    });
    if (ordered.length === 0) {
        return null;
    }
    if (typeof input.minimumScore === 'number' && ordered[0]!.score < input.minimumScore) {
        return null;
    }
    return ordered[0]!.row;
}

export function selectTimelineEvents(input: {
    worldEvents: Array<Record<string, unknown>>;
    turn: NarrativeTurnInputNormalized;
    entryEventId: string;
}): Array<Record<string, unknown>> {
    const rows = input.worldEvents
        .filter((event) => toString(event.eventHorizon).toUpperCase() !== 'FUTURE')
        .map((event) => {
        const refs = toStringArray(event.characterRefs);
        const level = toString(event.level).toUpperCase();
        const horizon = toString(event.eventHorizon).toUpperCase();
        const id = toString(event.id);
        let score = 0;
        if (id && id === input.entryEventId) {
            score += 100;
        }
        if (level === 'PRIMARY') {
            score += 30;
        }
        if (horizon === 'ONGOING') {
            score += 16;
        }
        else if (horizon === 'PAST') {
            score += 8;
        }
        if (refs.includes(input.turn.agentId)) {
            score += 12;
        }
        if (refs.includes(input.turn.userId)) {
            score += 10;
        }
        return {
            event,
            score,
            updatedAt: toTimestampMs(event.updatedAt || event.createdAt),
        };
    })
        .sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.updatedAt !== left.updatedAt) {
            return right.updatedAt - left.updatedAt;
        }
        return toString(left.event.id).localeCompare(toString(right.event.id));
    })
        .map((item) => item.event);
    return rows.slice(0, 10);
}

export function selectFutureEvents(input: {
    worldEvents: Array<Record<string, unknown>>;
    turn: NarrativeTurnInputNormalized;
}): Array<Record<string, unknown>> {
    const rows = input.worldEvents
        .filter((event) => toString(event.eventHorizon).toUpperCase() === 'FUTURE')
        .map((event) => {
        const refs = toStringArray(event.characterRefs);
        let score = 0;
        if (toString(event.level).toUpperCase() === 'PRIMARY') {
            score += 20;
        }
        if (refs.includes(input.turn.agentId)) {
            score += 12;
        }
        if (refs.includes(input.turn.userId)) {
            score += 10;
        }
        return {
            event,
            score,
            updatedAt: toTimestampMs(event.updatedAt || event.createdAt),
        };
    })
        .sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.updatedAt !== left.updatedAt) {
            return right.updatedAt - left.updatedAt;
        }
        return toString(left.event.id).localeCompare(toString(right.event.id));
    })
        .map((item) => item.event);
    return rows.slice(0, 6);
}

export function extractKeywordCandidates(input: {
    turn: NarrativeTurnInputNormalized;
    snapshot: NarrativeContextSnapshot;
    timelineEvents: Array<Record<string, unknown>>;
}): string[] {
    const candidates: string[] = [];
    candidates.push(...input.snapshot.openThreads);
    candidates.push(input.snapshot.place);
    candidates.push(input.turn.userMessage);
    for (const event of input.timelineEvents.slice(0, 4)) {
        candidates.push(toString(event.title || event.name));
        candidates.push(toString(event.summary || event.description || event.process));
    }
    const tokens: string[] = [];
    for (const candidate of candidates) {
        const trimmed = normalizeWhitespace(candidate);
        if (!trimmed) {
            continue;
        }
        tokens.push(trimmed);
        for (const piece of trimmed.split(/[\s,，。；;：:、|/]+/g)) {
            const token = piece.trim();
            if (token.length >= 2) {
                tokens.push(token);
            }
        }
    }
    return uniqueStrings(tokens).slice(0, 24);
}

export function selectLorebooks(input: {
    worldLorebooks: Array<Record<string, unknown>>;
    turn: NarrativeTurnInputNormalized;
    snapshot: NarrativeContextSnapshot;
    timelineEvents: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
    const keywordCandidates = extractKeywordCandidates({
        turn: input.turn,
        snapshot: input.snapshot,
        timelineEvents: input.timelineEvents,
    }).map((item) => item.toLowerCase());
    const scored = input.worldLorebooks
        .map((lorebook) => {
        const haystack = normalizeWhitespace([
            toString(lorebook.key),
            toString(lorebook.title),
            toString(lorebook.summary),
            toString(lorebook.content),
        ].join(' ')).slice(0, 900).toLowerCase();
        let score = 0;
        if (Boolean(lorebook.constant)) {
            score += 20;
        }
        for (const keyword of keywordCandidates) {
            if (keyword && haystack.includes(keyword)) {
                score += 3;
            }
        }
        return {
            lorebook,
            score,
            updatedAt: toTimestampMs(lorebook.updatedAt || lorebook.createdAt),
        };
    })
        .sort((left, right) => {
        if (right.score !== left.score) {
            return right.score - left.score;
        }
        if (right.updatedAt !== left.updatedAt) {
            return right.updatedAt - left.updatedAt;
        }
        return toString(left.lorebook.id).localeCompare(toString(right.lorebook.id));
    });
    const constants = scored.filter((item) => Boolean(item.lorebook.constant)).slice(0, 4);
    const matched = scored.filter((item) => item.score > 0 && !Boolean(item.lorebook.constant)).slice(0, 8);
    const fallback = scored.slice(0, 8);
    const selected = constants.length + matched.length > 0
        ? [...constants, ...matched]
        : fallback;
    const ids = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];
    for (const row of selected) {
        const id = toString(row.lorebook.id || row.lorebook.key || row.lorebook.title);
        if (id && ids.has(id)) {
            continue;
        }
        if (id) {
            ids.add(id);
        }
        rows.push(row.lorebook);
        if (rows.length >= 12) {
            break;
        }
    }
    return rows;
}

export function selectScenes(input: {
    worldScenes: Array<Record<string, unknown>>;
    selectedScene: Record<string, unknown> | null;
    timelineEvents: Array<Record<string, unknown>>;
    futureEvents: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
    const sceneById = new Map<string, Record<string, unknown>>();
    for (const scene of input.worldScenes) {
        const id = toString(scene.id);
        if (id) {
            sceneById.set(id, scene);
        }
    }
    const orderedIds: string[] = [];
    const pushSceneId = (id: string) => {
        const normalized = toString(id);
        if (!normalized) {
            return;
        }
        if (!sceneById.has(normalized)) {
            return;
        }
        if (orderedIds.includes(normalized)) {
            return;
        }
        orderedIds.push(normalized);
    };
    pushSceneId(toString(input.selectedScene?.id));
    const projectedEvents = [...input.timelineEvents, ...input.futureEvents];
    for (const event of projectedEvents) {
        for (const ref of toStringArray(event.locationRefs)) {
            pushSceneId(ref);
        }
    }
    for (const scene of input.worldScenes) {
        pushSceneId(toString(scene.id));
        if (orderedIds.length >= 4) {
            break;
        }
    }
    const rows: Array<Record<string, unknown>> = [];
    for (const id of orderedIds) {
        const row = sceneById.get(id);
        if (row) {
            rows.push(row);
        }
        if (rows.length >= 4) {
            break;
        }
    }
    return rows;
}

export function selectRelationRows(input: {
    snapshot: NarrativeContextSnapshot;
    resolvedScopes: NarrativeContextScopes;
}): Array<Record<string, unknown>> {
    if (input.snapshot.characterRelations.length > 0) {
        return input.snapshot.characterRelations.slice(0, 8);
    }
    const relationScope = asRecord(input.resolvedScopes.RELATION);
    if (Object.keys(relationScope).length > 0) {
        return [relationScope];
    }
    return [];
}

export function extractMemorySnippets(memoryRecall: Record<string, unknown>): string[] {
    const snippets: string[] = [];
    const collect = (value: unknown) => {
        if (value == null) {
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => collect(item));
            return;
        }
        if (typeof value === 'object') {
            const record = asRecord(value);
            const content = clipText(record.content
                || record.text
                || record.summary
                || record.memory
                || record.fact
                || record.value, 160);
            if (content) {
                snippets.push(content);
            }
            return;
        }
        const text = clipText(value, 160);
        if (text) {
            snippets.push(text);
        }
    };
    collect(memoryRecall.items);
    collect(memoryRecall.core);
    collect(memoryRecall.e2e);
    collect(memoryRecall.memories);
    collect(memoryRecall.rows);
    collect(memoryRecall.data);
    if (snippets.length === 0 && Object.keys(memoryRecall).length > 0) {
        snippets.push(clipJson(memoryRecall, 180));
    }
    return uniqueStrings(snippets).slice(0, 10);
}
