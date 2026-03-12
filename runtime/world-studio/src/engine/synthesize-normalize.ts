import type { EventNodeDraft, WorldStudioAgentDna, WorldStudioAgentDraft, WorldStudioAgentLorebookDraft, WorldStudioKnowledgeGraphDraft, } from './types.js';
import { PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD, summarizePrimaryEvidenceCoverage, } from './primary-evidence.js';
import { normalizeDnaPrimaryTrait, normalizeDnaSecondaryTraits, } from '../services/agent-dna-traits.js';
import { asRecord } from "@nimiplatform/sdk/mod";

export function truncate(value: string, max: number): string {
    const text = String(value || '').trim();
    if (text.length <= max)
        return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function normalizeNullableString(value: unknown): string | null {
    if (value == null)
        return null;
    const text = String(value || '').trim();
    return text.length > 0 ? text : null;
}

export function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}

export function firstClause(text: unknown, max = 48): string {
    const source = String(text || '').trim();
    if (!source)
        return '';
    const head = source
        .split(/[。！？!?，,；;:\n]/)
        .map((item) => item.trim())
        .find(Boolean) || '';
    return truncate(head, max);
}

function uniqueList(input: string[]): string[] {
    return Array.from(new Set(input.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function toHandleFragment(value: string): string {
    const ascii = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 12);
    if (ascii.length >= 4)
        return ascii;
    return 'agent';
}

export function normalizeAgentRules(value: unknown): WorldStudioAgentDraft['rules'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = asRecord(value);
    if (String(record.format || '').trim() !== 'rule-lines-v1')
        return undefined;
    const lines = normalizeStringArray(record.lines);
    return {
        format: 'rule-lines-v1',
        lines,
        text: lines.join('\n'),
    };
}

export function normalizeWakeStrategy(value: unknown): WorldStudioAgentDraft['wakeStrategy'] | undefined {
    const text = String(value || '').trim().toUpperCase();
    if (text === 'PASSIVE' || text === 'PROACTIVE') {
        return text;
    }
    return undefined;
}

export function extractSignatureItems(text: string): string[] {
    const rules: Array<{
        pattern: RegExp;
        item: string;
    }> = [
        { pattern: /剑|飞剑/, item: '佩剑' },
        { pattern: /药|丹|炼丹/, item: '药箱' },
        { pattern: /瓶|绿瓶|小瓶/, item: '神秘小瓶' },
        { pattern: /功法|口诀|秘术/, item: '功法玉简' },
    ];
    return uniqueList(rules.filter((item) => item.pattern.test(text)).map((item) => item.item));
}

export function extractInterests(text: string): string[] {
    const rules: Array<{
        pattern: RegExp;
        interest: string;
    }> = [
        { pattern: /修炼|功法|突破/, interest: '修炼' },
        { pattern: /医|药|丹/, interest: '医药' },
        { pattern: /阵法/, interest: '阵法' },
        { pattern: /权谋|门派|统领/, interest: '门派事务' },
    ];
    return uniqueList(rules.filter((item) => item.pattern.test(text)).map((item) => item.interest)).slice(0, 4);
}

export function extractGoals(goalText: string, fallbackSummary: string): string[] {
    const goals = String(goalText || '')
        .split(/[。！？!?，,；;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    if (goals.length > 0)
        return goals;
    const head = firstClause(fallbackSummary, 24);
    return head ? [head] : [];
}

export function normalizeAgentLorebookDraft(value: unknown): WorldStudioAgentLorebookDraft | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = asRecord(value);
    const name = String(record.name || '').trim();
    const content = String(record.content || '').trim();
    if (!name && !content)
        return null;
    return {
        name,
        content,
        keywords: normalizeStringArray(record.keywords),
        ...(Number.isFinite(Number(record.priority))
            ? { priority: Number(record.priority) }
            : {}),
        ...(Number.isFinite(Number(record.insertionOrder))
            ? { insertionOrder: Number(record.insertionOrder) }
            : {}),
        ...(typeof record.constant === 'boolean' ? { constant: record.constant } : {}),
        ...(typeof record.selective === 'boolean' ? { selective: record.selective } : {}),
        ...(Array.isArray(record.secondaryKeys)
            ? { secondaryKeys: normalizeStringArray(record.secondaryKeys) }
            : {}),
        ...(typeof record.enabled === 'boolean' ? { enabled: record.enabled } : {}),
        ...(record.source == null
            ? {}
            : { source: normalizeNullableString(record.source) }),
    };
}

export function normalizeAgentLorebookDrafts(value: unknown): WorldStudioAgentLorebookDraft[] {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => normalizeAgentLorebookDraft(item))
        .filter((item): item is WorldStudioAgentLorebookDraft => Boolean(item));
}

export type AgentDnaValidation = {
    dna: WorldStudioAgentDna | null;
    reason: string | null;
    rawKeys: string[];
    identityName: string | null;
};

export function validateAgentDna(value: unknown): AgentDnaValidation {
    if (!value || typeof value !== 'object') {
        return {
            dna: null,
            reason: 'DNA_NOT_OBJECT',
            rawKeys: [],
            identityName: null,
        };
    }
    const dna = value as Record<string, unknown>;
    const rawKeys = Object.keys(dna);
    const identity = dna.identity && typeof dna.identity === 'object' ? dna.identity as Record<string, unknown> : null;
    const biological = dna.biological && typeof dna.biological === 'object' ? dna.biological as Record<string, unknown> : null;
    const appearance = dna.appearance && typeof dna.appearance === 'object' ? dna.appearance as Record<string, unknown> : null;
    const personality = dna.personality && typeof dna.personality === 'object' ? dna.personality as Record<string, unknown> : null;
    const communication = dna.communication && typeof dna.communication === 'object' ? dna.communication as Record<string, unknown> : null;
    const voice = dna.voice && typeof dna.voice === 'object' ? dna.voice as Record<string, unknown> : null;
    if (!identity || typeof identity.name !== 'string' || typeof identity.role !== 'string' ||
        !biological || typeof biological.gender !== 'string' ||
        !appearance || typeof appearance.hair !== 'string' ||
        !personality || typeof personality.mbti !== 'string' ||
        !communication || typeof communication.responseLength !== 'string') {
        return {
            dna: null,
            reason: 'DNA_SCHEMA_INVALID',
            rawKeys,
            identityName: identity && typeof identity.name === 'string' ? String(identity.name || '') : null,
        };
    }
    return {
        dna: {
            identity: {
                name: String(identity.name || ''),
                role: String(identity.role || ''),
                worldview: String(identity.worldview || ''),
                species: String(identity.species || 'human'),
                ...(normalizeNullableString(identity.summary) ? { summary: normalizeNullableString(identity.summary) || undefined } : {}),
            },
            biological: {
                gender: String(biological.gender || 'unspecified'),
                visualAge: String(biological.visualAge || 'unknown'),
                ethnicity: String(biological.ethnicity || 'unspecified'),
                heightCm: Number(biological.heightCm) || 170,
                weightKg: Number(biological.weightKg) || 55,
            },
            appearance: {
                artStyle: String(appearance.artStyle || 'portrait'),
                hair: String(appearance.hair || 'unknown'),
                eyes: String(appearance.eyes || 'unknown'),
                skin: String(appearance.skin || 'unknown'),
                fashionStyle: String(appearance.fashionStyle || 'casual'),
                signatureItems: Array.isArray(appearance.signatureItems)
                    ? appearance.signatureItems.map((item) => String(item || '')).filter(Boolean)
                    : [],
            },
            personality: {
                ...(normalizeNullableString(personality.summary) ? { summary: normalizeNullableString(personality.summary) || undefined } : {}),
                mbti: String(personality.mbti || 'INTJ'),
                interests: Array.isArray(personality.interests)
                    ? personality.interests.map((item) => String(item || '')).filter(Boolean)
                    : [],
                goals: Array.isArray(personality.goals)
                    ? personality.goals.map((item) => String(item || '')).filter(Boolean)
                    : [],
                relationshipMode: String(personality.relationshipMode || 'friendly'),
            },
            communication: {
                ...(normalizeNullableString(communication.summary) ? { summary: normalizeNullableString(communication.summary) || undefined } : {}),
                responseLength: (['short', 'medium', 'long'].includes(String(communication.responseLength))
                    ? String(communication.responseLength) : 'medium') as 'short' | 'medium' | 'long',
                formality: (['casual', 'formal', 'slang'].includes(String(communication.formality))
                    ? String(communication.formality) : 'casual') as 'casual' | 'formal' | 'slang',
                sentiment: (['positive', 'neutral', 'cynical'].includes(String(communication.sentiment))
                    ? String(communication.sentiment) : 'neutral') as 'positive' | 'neutral' | 'cynical',
            },
            ...(voice && typeof voice.voiceId === 'string' && String(voice.voiceId || '').trim()
                ? {
                    voice: {
                        voiceId: String(voice.voiceId || '').trim(),
                        ...(typeof voice.emotionEnabled === 'boolean' ? { emotionEnabled: voice.emotionEnabled } : {}),
                        ...(Number.isFinite(Number(voice.speed)) ? { speed: Number(voice.speed) } : {}),
                        ...(Number.isFinite(Number(voice.pitch)) ? { pitch: Number(voice.pitch) } : {}),
                    },
                }
                : {}),
            nsfwLevel: String(dna.nsfwLevel || 'SAFE'),
        },
        reason: null,
        rawKeys,
        identityName: String(identity.name || ''),
    };
}

export function normalizeAgentDraft(value: unknown, fallbackName: string, index: number): WorldStudioAgentDraft {
    const record = asRecord(value);
    const characterName = String(record.characterName || fallbackName || '').trim() || fallbackName;
    const normalizedRules = normalizeAgentRules(record.rules);
    const normalizedWakeStrategy = normalizeWakeStrategy(record.wakeStrategy);
    const normalizedDnaPrimary = normalizeDnaPrimaryTrait(record.dnaPrimary);
    const normalizedDnaSecondary = normalizeDnaSecondaryTraits(record.dnaSecondary, 3);
    const dnaValidation = validateAgentDna(record.dna);
    const dna = dnaValidation.dna;
    // Enforce: dna.identity.name must match characterName
    if (dna) {
        dna.identity.name = characterName;
    }
    return {
        characterName,
        handle: String(record.handle || `~${toHandleFragment(characterName)}_${index + 1}`).trim(),
        concept: String(record.concept || '').trim(),
        backstory: String(record.backstory || '').trim(),
        coreValues: String(record.coreValues || '').trim(),
        relationshipStyle: String(record.relationshipStyle || '').trim(),
        ...(Object.prototype.hasOwnProperty.call(record, 'description')
            ? { description: normalizeNullableString(record.description) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'scenario')
            ? { scenario: normalizeNullableString(record.scenario) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'greeting')
            ? { greeting: normalizeNullableString(record.greeting) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'exampleDialogue')
            ? { exampleDialogue: normalizeNullableString(record.exampleDialogue) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'systemPromptBase')
            ? { systemPromptBase: normalizeNullableString(record.systemPromptBase) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'rules') && normalizedRules
            ? { rules: normalizedRules }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'postHistoryInstructions')
            ? { postHistoryInstructions: normalizeNullableString(record.postHistoryInstructions) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'referenceImageUrl')
            ? { referenceImageUrl: normalizeNullableString(record.referenceImageUrl) }
            : {}),
        ...(Object.prototype.hasOwnProperty.call(record, 'wakeStrategy') && normalizedWakeStrategy
            ? { wakeStrategy: normalizedWakeStrategy }
            : {}),
        ...(Array.isArray(record.alternateGreetings)
            ? { alternateGreetings: normalizeStringArray(record.alternateGreetings) }
            : {}),
        ...(Array.isArray(record.agentLorebooks)
            ? { agentLorebooks: normalizeAgentLorebookDrafts(record.agentLorebooks) }
            : {}),
        ...(normalizedDnaPrimary ? { dnaPrimary: normalizedDnaPrimary } : {}),
        ...(normalizedDnaSecondary.length > 0 ? { dnaSecondary: normalizedDnaSecondary } : {}),
        ...(dna ? { dna } : {}),
    };
}

export function validateEventGraph(knowledgeGraph: WorldStudioKnowledgeGraphDraft): void {
    const primaryEvents = knowledgeGraph.events.primary || [];
    if (primaryEvents.length === 0) {
        throw new Error('WORLD_STUDIO_SYNTHESIZE_BLOCKED_BY_EVENT_GRAPH: missing primary events');
    }
    const summary = summarizePrimaryEvidenceCoverage(primaryEvents);
    if (summary.coverage < PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD) {
        throw new Error(`WORLD_STUDIO_SYNTHESIZE_BLOCKED_BY_EVENT_GRAPH: primary evidence coverage below threshold (coverage=${summary.coverage.toFixed(3)}, threshold=${PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD.toFixed(3)})`);
    }
}

export function buildEventLorebooks(events: EventNodeDraft[]): Array<Record<string, unknown>> {
    return events.map((event) => ({
        key: `event:${event.id}:summary`,
        name: event.title || '',
        content: event.summary || '',
        keywords: [
            ...(event.characterRefs || []),
            ...(event.locationRefs || []),
        ].filter(Boolean),
        value: {
            id: event.id,
            level: event.level,
            title: event.title,
            summary: event.summary,
            timeRef: event.timeRef,
        },
        provenance: {
            source: 'world-studio.synthesize',
        },
    }));
}
