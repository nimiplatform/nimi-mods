import type { EventNodeDraft, FinalDraftAccumulator, Phase2Result, RouteCapabilityLlmInvoker, WorldStudioAgentDna, WorldStudioAgentDraft, WorldStudioCharacterProfile, WorldStudioKnowledgeGraphDraft, } from './types.js';
import { parseJsonRecord } from './json-repair.js';
import { emitWorldStudioLog } from '../logging.js';
import { normalizeDnaPrimaryTrait, } from '../services/agent-dna-traits.js';
import { applyDraftPatch, buildFinalDraftAccumulatorSlice, createEmptyFinalDraftAccumulator, } from './final-draft-accumulator.js';
import { deriveNeedsEvidence, normalizeEventHorizon, } from '../services/event-horizon.js';
import { asRecord } from "@nimiplatform/sdk/mod";
import {
    inferGenderFromText,
    inferVisualAgeFromText,
    inferRoleFromText,
    inferMbtiFromText,
    inferRelationshipModeFromText,
    inferCommunicationFormality,
    inferCommunicationResponseLength,
    inferCommunicationSentiment,
    inferArtStyle,
    inferAppearanceField,
} from './synthesize-inference.js';
import {
    truncate,
    normalizeNullableString,
    firstClause,
    toHandleFragment,
    normalizeAgentDraft,
    validateAgentDna,
    validateEventGraph,
    buildEventLorebooks,
    extractSignatureItems,
    extractInterests,
    extractGoals,
} from './synthesize-normalize.js';

function diagLog(message: string, details?: Record<string, unknown>) {
    try {
        emitWorldStudioLog({
            level: 'error',
            message: `[MODS-TEST-DIAG] ${message}`,
            source: 'DIAG',
            details,
        });
    }
    catch {
        // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
    }
}

type SynthesizePromptBudget = {
    timeline: number;
    locations: number;
    primaryEvents: number;
    secondaryEvents: number;
    characterProfiles: number;
    characterRelations: number;
    evidenceSnippets: number;
    worldSettingMaxChars: number;
    maxTokens: number;
    accumulatorSlice: {
        maxLorebooks: number;
        maxFutureEvents: number;
        maxAgentDrafts: number;
        maxRevisions: number;
    };
};

const DEFAULT_SYNTHESIZE_PROMPT_BUDGET: SynthesizePromptBudget = {
    timeline: 18,
    locations: 16,
    primaryEvents: 24,
    secondaryEvents: 32,
    characterProfiles: 16,
    characterRelations: 24,
    evidenceSnippets: 20,
    worldSettingMaxChars: 800,
    maxTokens: 2200,
    accumulatorSlice: {
        maxLorebooks: 12,
        maxFutureEvents: 12,
        maxAgentDrafts: 16,
        maxRevisions: 12,
    },
};

const COMPACT_SYNTHESIZE_PROMPT_BUDGET: SynthesizePromptBudget = {
    timeline: 12,
    locations: 12,
    primaryEvents: 14,
    secondaryEvents: 20,
    characterProfiles: 10,
    characterRelations: 16,
    evidenceSnippets: 12,
    worldSettingMaxChars: 500,
    maxTokens: 1400,
    accumulatorSlice: {
        maxLorebooks: 8,
        maxFutureEvents: 8,
        maxAgentDrafts: 10,
        maxRevisions: 8,
    },
};

function isTimeoutLikeError(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
    return message.includes('timeout') || message.includes('deadline');
}

function isJsonParseRetryableError(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
    return message.includes('json')
        || message.includes('object_required')
        || message.includes('empty_model_output');
}

function asEventArray(value: unknown): EventNodeDraft[] {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => {
        const record = item as Record<string, unknown>;
        const level = String(record.level || '').trim().toUpperCase() === 'SECONDARY'
            ? 'SECONDARY'
            : 'PRIMARY';
        const eventHorizon = normalizeEventHorizon(record.eventHorizon, 'PAST');
        const evidenceRefs = Array.isArray(record.evidenceRefs)
            ? record.evidenceRefs.filter((entry) => entry && typeof entry === 'object').map((entry) => ({
                segmentId: String(asRecord(entry).segmentId || ''),
                offsetStart: Number(asRecord(entry).offsetStart || 0),
                offsetEnd: Number(asRecord(entry).offsetEnd || 0),
                excerpt: String(asRecord(entry).excerpt || ''),
                confidence: Number(asRecord(entry).confidence || 0.5),
                sourceType: 'text' as const,
            }))
            : [];
        const temporalBeforeEventIds = Array.isArray(record.temporalBeforeEventIds || record.beforeEventIds)
            ? (record.temporalBeforeEventIds || record.beforeEventIds) as unknown[]
            : [];
        const temporalAfterEventIds = Array.isArray(record.temporalAfterEventIds || record.afterEventIds)
            ? (record.temporalAfterEventIds || record.afterEventIds) as unknown[]
            : [];
        const temporalConfidence = Number(record.temporalConfidence);
        return {
            id: String(record.id || `${level.toLowerCase()}-${index + 1}`),
            ...(Number.isFinite(Number(record.timelineSeq))
                ? { timelineSeq: Math.max(1, Math.trunc(Number(record.timelineSeq))) }
                : {}),
            level,
            eventHorizon,
            parentEventId: String(record.parentEventId || '').trim() || null,
            title: String(record.title || `Event ${index + 1}`),
            summary: String(record.summary || ''),
            cause: String(record.cause || ''),
            process: String(record.process || ''),
            result: String(record.result || ''),
            timeRef: String(record.timeRef || record.timelineAnchorLabel || ''),
            locationRefs: Array.isArray(record.locationRefs)
                ? record.locationRefs.map((entry) => String(entry || '')).filter(Boolean)
                : [],
            characterRefs: Array.isArray(record.characterRefs)
                ? record.characterRefs.map((entry) => String(entry || '')).filter(Boolean)
                : [],
            dependsOnEventIds: Array.isArray(record.dependsOnEventIds)
                ? record.dependsOnEventIds.map((entry) => String(entry || '')).filter(Boolean)
                : [],
            ...(temporalBeforeEventIds.length > 0
                ? { temporalBeforeEventIds: temporalBeforeEventIds.map((entry) => String(entry || '')).filter(Boolean) }
                : {}),
            ...(temporalAfterEventIds.length > 0
                ? { temporalAfterEventIds: temporalAfterEventIds.map((entry) => String(entry || '')).filter(Boolean) }
                : {}),
            ...(Number.isFinite(temporalConfidence)
                ? { temporalConfidence: Math.max(0, Math.min(1, temporalConfidence)) }
                : {}),
            evidenceRefs,
            confidence: Number(record.confidence || 0.5),
            needsEvidence: deriveNeedsEvidence({
                level,
                eventHorizon,
                evidenceRefs,
                needsEvidence: record.needsEvidence,
            }),
        };
    });
}

function buildEvidenceSnippets(graph: WorldStudioKnowledgeGraphDraft, maxSnippets = 32): Array<Record<string, unknown>> {
    const snippets: Array<Record<string, unknown>> = [];
    graph.events.primary.forEach((event) => {
        (event.evidenceRefs || []).slice(0, 2).forEach((evidence, evidenceIndex) => {
            snippets.push({
                eventId: event.id,
                eventTitle: event.title,
                index: evidenceIndex,
                segmentId: evidence.segmentId,
                excerpt: truncate(String(evidence.excerpt || ''), 220),
                confidence: Number(evidence.confidence || 0),
            });
        });
    });
    return snippets.slice(0, maxSnippets);
}

function buildStructuredGraphForPrompt(input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
}, budget: SynthesizePromptBudget): Record<string, unknown> {
    const profileMap = new Map((input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const));
    const selectedCharacterProfiles = input.selectedCharacters
        .map((name) => profileMap.get(name))
        .filter((item) => Boolean(item));
    const timeline = input.knowledgeGraph.timeline.slice(0, budget.timeline);
    const normalizedPrimaryEvents = input.knowledgeGraph.events.primary.slice(0, budget.primaryEvents).map((event) => ({
        id: event.id,
        title: event.title,
        summary: event.summary,
        cause: event.cause,
        process: event.process,
        result: event.result,
        timeRef: event.timeRef,
        locationRefs: event.locationRefs,
        characterRefs: event.characterRefs,
        evidenceRefs: (event.evidenceRefs || []).slice(0, 3).map((evidence) => ({
            segmentId: evidence.segmentId,
            excerpt: truncate(String(evidence.excerpt || ''), 220),
            confidence: evidence.confidence,
        })),
    }));
    const normalizedSecondaryEvents = input.knowledgeGraph.events.secondary.slice(0, budget.secondaryEvents).map((event) => ({
        id: event.id,
        parentEventId: event.parentEventId,
        title: event.title,
        summary: event.summary,
        timeRef: event.timeRef,
        locationRefs: event.locationRefs,
        characterRefs: event.characterRefs,
    }));
    return {
        selectedStartTimeId: input.selectedStartTimeId,
        selectedCharacters: input.selectedCharacters,
        worldSetting: truncate(input.knowledgeGraph.worldSetting, budget.worldSettingMaxChars),
        narrativeArc: input.knowledgeGraph.narrativeArc || null,
        timeline,
        locations: input.knowledgeGraph.locations.slice(0, budget.locations),
        characterProfiles: selectedCharacterProfiles.length > 0
            ? selectedCharacterProfiles
            : (input.knowledgeGraph.characterProfiles || []).slice(0, budget.characterProfiles),
        characterAliasMap: input.knowledgeGraph.characterAliasMap || {},
        characterRelations: input.knowledgeGraph.characterRelations.slice(0, budget.characterRelations),
        primaryEvents: normalizedPrimaryEvents,
        secondaryEvents: normalizedSecondaryEvents,
        evidenceSnippets: buildEvidenceSnippets(input.knowledgeGraph, budget.evidenceSnippets),
    };
}

function buildSynthesizePrompt(input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
    finalDraftAccumulator: FinalDraftAccumulator;
}, options?: {
    compact?: boolean;
}): string {
    const promptBudget = options?.compact
        ? COMPACT_SYNTHESIZE_PROMPT_BUDGET
        : DEFAULT_SYNTHESIZE_PROMPT_BUDGET;
    const structuredGraph = buildStructuredGraphForPrompt(input, promptBudget);
    const accumulatorSlice = buildFinalDraftAccumulatorSlice(input.finalDraftAccumulator, promptBudget.accumulatorSlice);
    const worldviewModuleLines = options?.compact
        ? [
            '## Worldview Module Descriptions',
            '- Required: timeModel, spaceTopology, causality, coreSystem.',
            '- Also include: existences, resources, structures, visualGuide, narrativeHooks (concise but complete).',
            'Note: Do NOT include a "knowledge" module — it is deprecated.',
        ]
        : [
            '## Worldview Module Descriptions',
            '- timeModel (REQUIRED): The world\'s temporal structure. Infer the appropriate time model type from the source material — it may be absolute (calendar dates), relative (narrative progression), cyclical, or mixed.',
            '- spaceTopology (REQUIRED): Geographic/spatial structure — realms, regions, dimensions, boundaries.',
            '- causality (REQUIRED): How cause-and-effect works — power systems, natural laws, fate mechanisms.',
            '- coreSystem (REQUIRED): The fundamental system that drives the world — cultivation ranks, magic system, technology tiers, etc.',
            '- existences: Types of beings and their classifications.',
            '- resources: Important materials, currencies, energy sources.',
            '- structures: Social hierarchies, organizations, factions.',
            '- visualGuide: Art style, color palette, atmosphere descriptions.',
            '- narrativeHooks: Unresolved tensions, prophecies, mysteries.',
            'Note: Do NOT include a "knowledge" module — it is deprecated.',
        ];
    return [
        'You are an event-driven world generation closure engine.',
        'Use the accumulator as the primary draft source and perform global consistency closure.',
        'Generate publish-ready world/worldview/lorebooks/events/agentDrafts JSON ONLY.',
        '',
        '## Language Rule',
        'Output ALL field values in the SAME language as the structured context below.',
        'Preserve the original language of names, descriptions, and lore. Never translate.',
        '',
        'Schema:',
        '{',
        '  "world": {"name":"...","tagline":"...","motto":"...","overview":"...","description":"...","lore":"...","genre":"...","themes":["..."],"era":"...","status":"ACTIVE","contentRating":"TEEN","clockConfig":{"startRealTime":"...","startWorldTime":"...","anchorRealTime":"...","anchorWorldTime":"..."}},',
        '  "worldview": {"lifecycle": {},"timeModel": {"timeFlowRatio":1,"calendarSystem":{}},"spaceTopology": {},"causality": {},"coreSystem": {"rules": {}},"languages":{"languages":[]},"existences": {},"resources": {},"structures": {},"visualGuide": {},"narrativeHooks": {}},',
        '  "worldEvents":[{"id":"evt-p1","level":"PRIMARY","eventHorizon":"PAST","parentEventId":null,"title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"text"}],"confidence":0.0,"needsEvidence":false}],',
        '  "worldLorebooks":[{"key":"topic:subtopic:item_name","name":"...","content":"...","keywords":["..."],"value":{"details":{}},"provenance":{"source":"synthesize"}}],',
        '  "futureHistoricalEvents":[{"id":"future-1","title":"...","description":"...","timeNode":"...","impact":"..."}],',
        '  "agentDrafts":[{"characterName":"...","handle":"...","concept":"...","backstory":"...","coreValues":"...","relationshipStyle":"...","description":"...","scenario":"...","greeting":"...","exampleDialogue":"...","systemPromptBase":"...","rules":{"format":"rule-lines-v1","lines":["..."],"text":"..."},"postHistoryInstructions":"...","alternateGreetings":["..."],"agentLorebooks":[{"name":"...","content":"...","keywords":["..."],"priority":10,"insertionOrder":100,"constant":false,"selective":false,"secondaryKeys":[],"enabled":true,"source":"world-studio.synthesize"}],"dna":{"identity":{"name":"...","role":"...","worldview":"...","species":"...","summary":"..."},"biological":{"gender":"...","visualAge":"...","ethnicity":"...","heightCm":0,"weightKg":0},"appearance":{"artStyle":"...","hair":"...","eyes":"...","skin":"...","fashionStyle":"...","signatureItems":[]},"personality":{"summary":"...","mbti":"...","interests":[],"goals":[],"relationshipMode":"..."},"communication":{"summary":"...","responseLength":"medium","formality":"casual","sentiment":"neutral"},"voice":{"voiceId":"...","emotionEnabled":true,"speed":0,"pitch":0},"nsfwLevel":"SAFE"}}]',
        '}',
        '',
        '## World Fields',
        '- genre: The primary genre of the source material (e.g. "xianxia", "sci-fi", "fantasy").',
        '- themes: Array of 2-5 core thematic elements.',
        '- era: The narrative era or time period setting.',
        '',
        ...worldviewModuleLines,
        '',
        '## Agent Draft Rules',
        '- agentDrafts must cover all selectedCharacters and keep canonical character names.',
        '- handle: use only lowercase letters, numbers, underscore (4-16 chars). If unknown, return empty string.',
        '- concept: A concise description of the character\'s core identity, role, and narrative position.',
        '- backstory: Key background events that shaped this character.',
        '- coreValues: The character\'s fundamental beliefs and motivations.',
        '- description/scenario/greeting/exampleDialogue/systemPromptBase/postHistoryInstructions: populate when evidence exists, otherwise use empty string.',
        '- rules: must use canonical object {"format":"rule-lines-v1","lines":[],"text":""}.',
        '- alternateGreetings/agentLorebooks: return arrays (can be empty when evidence is insufficient).',
        '- dna: Include when evidence is sufficient. If insufficient, omit dna field (do not fabricate).',
        '- dna.identity.name MUST match characterName exactly when dna exists.',
        '- dna.biological: Infer from source text (gender, visualAge, ethnicity, height, weight). Use realistic values consistent with the world setting.',
        '- dna.appearance: Infer from source text descriptions. Use the world\'s art style for artStyle.',
        '- dna.personality.mbti: Infer from character behavior patterns in the source text.',
        '- dna.communication: Match the character\'s speech patterns from the source text.',
        '',
        '## Lorebook Rules',
        '- Generate at least 5 worldLorebooks covering: world geography, power systems, organizations, key items/artifacts, cultural customs.',
        '- Each lorebook entry should have meaningful content — not just event summaries.',
        '- worldLorebooks keys should use topic:subtopic:item_name format.',
        '',
        '## General Rules',
        '- worldEvents must align with the event graph, keep PRIMARY/SECONDARY hierarchy, and preserve explicit eventHorizon.',
        '- PRIMARY events with PAST or ONGOING horizon should keep evidenceRefs when the source provides them.',
        '- Prefer accumulator values when they are already specific and consistent; only refine when needed.',
        '- futureHistoricalEvents: ONLY include events explicitly described as future or prophesied in the source text. If none exist in the source, return empty array [].',
        '- No markdown, no explanation, JSON only.',
        `CHECKPOINT_START_TIME_ID: ${input.selectedStartTimeId}`,
        `CHECKPOINT_CHARACTERS: ${input.selectedCharacters.join(', ')}`,
        '<accumulator_context>',
        JSON.stringify(accumulatorSlice),
        '</accumulator_context>',
        '<structured_context>',
        JSON.stringify(structuredGraph),
        '</structured_context>',
    ].join('\n');
}

function buildFallbackAgentDrafts(input: {
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
}): WorldStudioAgentDraft[] {
    const profileByName = new Map((input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const));
    return input.selectedCharacters.map((name, index) => {
        const profile = profileByName.get(name);
        const fallbackDnaPrimary = normalizeDnaPrimaryTrait(profile?.motivation || '');
        const concept = profile?.summary
            ? `${name}: ${profile.summary}`
            : `${name} is a key character in the world narrative.`;
        return {
            characterName: name,
            handle: `~${toHandleFragment(name)}_${index + 1}`,
            concept,
            backstory: String(profile?.background || ''),
            coreValues: String(profile?.motivation || ''),
            relationshipStyle: Array.isArray(profile?.relationships)
                ? profile.relationships.slice(0, 3).join('；')
                : '',
            description: normalizeNullableString(profile?.summary || ''),
            scenario: null,
            greeting: null,
            exampleDialogue: null,
            systemPromptBase: null,
            rules: {
                format: 'rule-lines-v1',
                lines: [],
                text: '',
            },
            postHistoryInstructions: null,
            alternateGreetings: [],
            agentLorebooks: [],
            ...(fallbackDnaPrimary ? { dnaPrimary: fallbackDnaPrimary } : {}),
        };
    });
}

function deriveDnaFromExtraction(input: {
    characterName: string;
    draft: WorldStudioAgentDraft;
    profile: WorldStudioCharacterProfile | null;
    characterSummary: string;
    worldSetting: string;
}): {
    dna: WorldStudioAgentDna | null;
    evidenceLength: number;
} {
    const evidenceText = [
        input.draft.concept,
        input.draft.backstory,
        input.draft.coreValues,
        input.draft.relationshipStyle,
        input.draft.description || '',
        input.profile?.summary || '',
        input.profile?.background || '',
        input.profile?.motivation || '',
        input.characterSummary,
    ].map((item) => String(item || '').trim()).filter(Boolean).join(' ');
    if (evidenceText.length < 12) {
        return { dna: null, evidenceLength: evidenceText.length };
    }
    const gender = inferGenderFromText(evidenceText);
    const visualAge = inferVisualAgeFromText(evidenceText);
    const roleSource = [
        input.draft.concept,
        input.profile?.summary || '',
        input.characterSummary,
    ].join(' ');
    const role = inferRoleFromText(roleSource);
    const summary = normalizeNullableString(input.draft.description
        || input.profile?.summary
        || input.characterSummary
        || input.draft.concept);
    const goalSource = String(input.draft.coreValues || input.profile?.motivation || '').trim();
    const relationshipSource = String(input.draft.relationshipStyle || input.profile?.relationships?.join('；') || '').trim();
    const dna: WorldStudioAgentDna = {
        identity: {
            name: input.characterName,
            role,
            worldview: firstClause(input.worldSetting, 40) || 'world',
            species: /(妖|魔|灵兽|龙|凤|鬼|魂)/.test(evidenceText) ? 'non-human' : 'human',
            ...(summary ? { summary } : {}),
        },
        biological: {
            gender,
            visualAge,
            ethnicity: 'unspecified',
            heightCm: gender === 'female' ? 162 : (gender === 'male' ? 172 : 168),
            weightKg: gender === 'female' ? 52 : (gender === 'male' ? 63 : 58),
        },
        appearance: {
            artStyle: inferArtStyle(input.worldSetting),
            hair: inferAppearanceField(evidenceText, 'hair'),
            eyes: inferAppearanceField(evidenceText, 'eyes'),
            skin: inferAppearanceField(evidenceText, 'skin'),
            fashionStyle: /(宗门|弟子|修士|道友|长袍)/.test(evidenceText) ? 'ancient_robe' : 'casual',
            signatureItems: extractSignatureItems(evidenceText),
        },
        personality: {
            ...(summary ? { summary } : {}),
            mbti: inferMbtiFromText(evidenceText),
            interests: extractInterests(evidenceText),
            goals: extractGoals(goalSource, summary || input.draft.concept),
            relationshipMode: inferRelationshipModeFromText(relationshipSource || evidenceText),
        },
        communication: {
            ...(summary ? { summary: firstClause(summary, 60) } : {}),
            responseLength: inferCommunicationResponseLength(evidenceText),
            formality: inferCommunicationFormality(evidenceText),
            sentiment: inferCommunicationSentiment(evidenceText),
        },
        nsfwLevel: 'SAFE',
    };
    const validation = validateAgentDna(dna);
    if (!validation.dna) {
        return { dna: null, evidenceLength: evidenceText.length };
    }
    validation.dna.identity.name = input.characterName;
    return { dna: validation.dna, evidenceLength: evidenceText.length };
}

function resolveAgentDrafts(payload: Record<string, unknown>, input: {
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
    finalDraftAccumulator: FinalDraftAccumulator;
}): WorldStudioAgentDraft[] {
    const hasMeaningfulValue = (value: unknown): boolean => {
        if (value == null)
            return false;
        if (typeof value === 'string')
            return value.trim().length > 0;
        if (typeof value === 'number')
            return Number.isFinite(value);
        if (typeof value === 'boolean')
            return true;
        if (Array.isArray(value))
            return value.length > 0;
        if (typeof value === 'object')
            return Object.keys(asRecord(value)).length > 0;
        return false;
    };
    const mergeDraft = (base: WorldStudioAgentDraft | undefined, incoming: WorldStudioAgentDraft): WorldStudioAgentDraft => {
        if (!base)
            return incoming;
        const merged: Record<string, unknown> = { ...asRecord(base) };
        Object.entries(asRecord(incoming)).forEach(([key, value]) => {
            if (!hasMeaningfulValue(value))
                return;
            merged[key] = value;
        });
        return {
            ...base,
            ...(merged as WorldStudioAgentDraft),
            characterName: incoming.characterName || base.characterName,
            handle: String(merged.handle || base.handle || ''),
            concept: String(merged.concept || base.concept || ''),
            backstory: String(merged.backstory || base.backstory || ''),
            coreValues: String(merged.coreValues || base.coreValues || ''),
            relationshipStyle: String(merged.relationshipStyle || base.relationshipStyle || ''),
        };
    };
    const fallback = buildFallbackAgentDrafts(input);
    const fromAccumulator = Object.values(input.finalDraftAccumulator.agentDraftsByCharacter || {});
    const rawModelDrafts = Array.isArray(payload.agentDrafts)
        ? payload.agentDrafts
            .filter((item) => item && typeof item === 'object')
        : [];
    const rawAgentDnaAudit = rawModelDrafts.map((item, index) => {
        const record = asRecord(item);
        const characterName = String(record.characterName || input.selectedCharacters[index] || '').trim();
        const dnaHasField = Object.prototype.hasOwnProperty.call(record, 'dna');
        const dnaValidation = validateAgentDna(record.dna);
        return {
            index,
            characterName: characterName || `(missing-name-${index + 1})`,
            rawFields: Object.keys(record).sort(),
            dnaHasField,
            dnaAccepted: Boolean(dnaValidation.dna),
            dnaRejectReason: dnaHasField ? dnaValidation.reason : 'DNA_FIELD_OMITTED',
            dnaRawKeys: dnaValidation.rawKeys,
            dnaIdentityName: dnaValidation.identityName,
            dnaPrimary: typeof record.dnaPrimary === 'string' ? record.dnaPrimary : null,
        };
    });
    diagLog('Phase2 raw agentDraft dna audit', {
        selectedCharacters: input.selectedCharacters,
        rawAgentDraftCount: rawModelDrafts.length,
        rawAgentDnaAudit,
    });
    const fromModel = rawModelDrafts
        .map((item, index) => normalizeAgentDraft(item, input.selectedCharacters[index] || '', index));
    const byCharacter = new Map<string, WorldStudioAgentDraft>();
    fallback.forEach((draft) => {
        byCharacter.set(draft.characterName, draft);
    });
    fromAccumulator.forEach((draft, index) => {
        const key = String(draft.characterName || input.selectedCharacters[index] || '').trim();
        if (!key)
            return;
        byCharacter.set(key, mergeDraft(byCharacter.get(key), {
            ...draft,
            characterName: key,
        }));
    });
    fromModel.forEach((draft, index) => {
        const key = draft.characterName || input.selectedCharacters[index] || '';
        if (!key)
            return;
        byCharacter.set(key, mergeDraft(byCharacter.get(key), {
            ...draft,
            characterName: key,
        }));
    });
    const dnaDerivationAudit: Array<Record<string, unknown>> = [];
    const resolvedDrafts = input.selectedCharacters
        .map((name, index) => byCharacter.get(name) || normalizeAgentDraft({}, name, index))
        .map((draft) => {
        const characterName = String(draft.characterName || '').trim();
        if (!characterName)
            return draft;
        if (draft.dna && typeof draft.dna === 'object') {
            dnaDerivationAudit.push({
                characterName,
                action: 'kept_existing_dna',
                source: fromModel.some((modelDraft) => modelDraft.characterName === characterName && Boolean(modelDraft.dna))
                    ? 'model'
                    : 'accumulator',
            });
            return draft;
        }
        dnaDerivationAudit.push({
            characterName,
            action: 'left_empty',
            reason: 'DNA_NOT_PROVIDED',
            sourcePriority: ['accumulator', 'model', 'fallback'],
        });
        return draft;
    })
        .filter((draft) => Boolean(String(draft.characterName || '').trim()));
    diagLog('Phase2 dna derivation audit', {
        selectedCharacters: input.selectedCharacters,
        derivedCount: 0,
        keptCount: dnaDerivationAudit.filter((item) => String(item.action || '') === 'kept_existing_dna').length,
        emptyCount: dnaDerivationAudit.filter((item) => String(item.action || '') === 'left_empty').length,
        dnaDerivationAudit,
    });
    return resolvedDrafts;
}

export async function runSynthesizeDraft(llm: RouteCapabilityLlmInvoker, input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
    finalDraftAccumulator?: FinalDraftAccumulator;
    abortSignal?: AbortSignal;
}): Promise<Phase2Result> {
    validateEventGraph(input.knowledgeGraph);
    const finalDraftAccumulator = input.finalDraftAccumulator || createEmptyFinalDraftAccumulator();
    const attempts = [
        { attempt: 1, compact: false, maxTokens: DEFAULT_SYNTHESIZE_PROMPT_BUDGET.maxTokens },
        { attempt: 2, compact: true, maxTokens: COMPACT_SYNTHESIZE_PROMPT_BUDGET.maxTokens },
    ] as const;
    let response: {
        text: string;
        promptTraceId: string;
    } | null = null;
    let payload: Record<string, unknown> | null = null;
    let lastError: unknown = null;
    for (const attempt of attempts) {
        try {
            response = await llm.generateText({
                capability: 'text.generate',
                prompt: buildSynthesizePrompt({
                    ...input,
                    finalDraftAccumulator,
                }, {
                    compact: attempt.compact,
                }),
                maxTokens: attempt.maxTokens,
                mode: 'STORY',
                abortSignal: input.abortSignal,
            });
            diagLog('Phase2 synthesize llm response', {
                attempt: attempt.attempt,
                promptTraceId: response.promptTraceId,
                textLength: String(response.text || '').length,
                maxTokens: attempt.maxTokens,
                compact: attempt.compact,
            });
        }
        catch (error) {
            lastError = error;
            if (input.abortSignal?.aborted)
                throw error;
            if (!isTimeoutLikeError(error) || attempt.attempt === attempts.length) {
                throw error;
            }
            diagLog('Phase2 synthesize timeout; retry with compact prompt budget', {
                maxTokens: COMPACT_SYNTHESIZE_PROMPT_BUDGET.maxTokens,
                selectedCharacters: input.selectedCharacters,
                timeline: input.knowledgeGraph.timeline.length,
                primaryEvents: input.knowledgeGraph.events.primary.length,
                secondaryEvents: input.knowledgeGraph.events.secondary.length,
                characterProfiles: (input.knowledgeGraph.characterProfiles || []).length,
                error: error instanceof Error ? error.message : String(error || ''),
            });
            continue;
        }
        try {
            payload = parseJsonRecord(response.text);
            break;
        }
        catch (parseError) {
            lastError = parseError;
            if (input.abortSignal?.aborted)
                throw parseError;
            const retryable = isJsonParseRetryableError(parseError);
            diagLog('Phase2 synthesize parse failed', {
                attempt: attempt.attempt,
                promptTraceId: response.promptTraceId,
                compact: attempt.compact,
                error: parseError instanceof Error ? parseError.message : String(parseError || ''),
                retryable,
            });
            if (!retryable || attempt.attempt === attempts.length) {
                throw parseError;
            }
        }
    }
    if (!response || !payload) {
        throw (lastError instanceof Error ? lastError : new Error('WORLD_STUDIO_JSON_OBJECT_REQUIRED'));
    }
    const world = {
        ...asRecord(finalDraftAccumulator.world || {}),
        ...asRecord(payload.world),
    };
    const worldview = {
        ...asRecord(finalDraftAccumulator.worldview || {}),
        ...asRecord(payload.worldview),
    };
    const modelEvents = asEventArray(payload.worldEvents);
    const worldEvents = modelEvents.length > 0
        ? modelEvents
        : [...input.knowledgeGraph.events.primary, ...input.knowledgeGraph.events.secondary];
    const lorebookPayload = Array.isArray(payload.worldLorebooks)
        ? (payload.worldLorebooks as Array<Record<string, unknown>>)
        : [];
    const worldLorebooks = lorebookPayload.length > 0
        ? lorebookPayload
        : ((finalDraftAccumulator.worldLorebooks || []).length > 0
            ? finalDraftAccumulator.worldLorebooks
            : buildEventLorebooks(worldEvents));
    const futureHistoricalEvents = Array.isArray(payload.futureHistoricalEvents)
        ? (payload.futureHistoricalEvents as Array<Record<string, unknown>>)
        : (finalDraftAccumulator.futureHistoricalEvents || []);
    diagLog('Phase2 synthesize parsed payload', {
        promptTraceId: response.promptTraceId,
        worldKeys: Object.keys(asRecord(payload.world || {})),
        worldviewKeys: Object.keys(asRecord(payload.worldview || {})),
        worldEvents: modelEvents.length,
        worldLorebooks: lorebookPayload.length,
        futureHistoricalEvents: futureHistoricalEvents.length,
        agentDrafts: Array.isArray(payload.agentDrafts) ? payload.agentDrafts.length : 0,
    });
    const agentDrafts = resolveAgentDrafts(payload, {
        selectedCharacters: input.selectedCharacters,
        knowledgeGraph: input.knowledgeGraph,
        finalDraftAccumulator,
    });
    const closureAccumulator = applyDraftPatch(finalDraftAccumulator, {
        chunkIndex: Math.max(finalDraftAccumulator.lastUpdatedChunk, input.knowledgeGraph.timeline.length),
        world,
        worldview,
        worldLorebooks,
        futureHistoricalEvents,
        agentDrafts,
        notes: ['phase2_synthesize_closure'],
    }).next;
    if (!world.name || !world.description) {
        throw new Error('WORLD_STUDIO_PHASE2_INVALID_WORLD');
    }
    if (!worldview.timeModel || !worldview.spaceTopology || !worldview.causality || !worldview.coreSystem) {
        throw new Error('WORLD_STUDIO_PHASE2_INVALID_WORLDVIEW_REQUIRED_MODULES');
    }
    return {
        world,
        worldview,
        worldLorebooks,
        worldEvents,
        futureHistoricalEvents,
        agentDrafts,
        finalDraftAccumulator: closureAccumulator,
        rawText: response.text,
    };
}
