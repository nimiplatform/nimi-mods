import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type {
  EventNodeDraft,
  FinalDraftAccumulator,
  Phase2Result,
  RouteCapabilityLlmInvoker,
  WorldStudioAgentDna,
  WorldStudioAgentDraft,
  WorldStudioAgentLorebookDraft,
  WorldStudioCharacterProfile,
  WorldStudioKnowledgeGraphDraft,
} from './types.js';
import { parseJsonRecord } from './json-repair.js';
import { emitWorldStudioLog } from '../logging.js';
import {
  normalizeDnaPrimaryTrait,
  normalizeDnaSecondaryTraits,
} from '../services/agent-dna-traits.js';
import {
  applyDraftPatch,
  buildFinalDraftAccumulatorSlice,
  createEmptyFinalDraftAccumulator,
} from './final-draft-accumulator.js';
import {
  PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD,
  summarizePrimaryEvidenceCoverage,
} from './primary-evidence.js';

function diagLog(message: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioLog({
      level: 'error',
      message: `[MODS-TEST-DIAG] ${message}`,
      source: 'DIAG',
      details,
    });
  } catch {
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
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      const level = String(record.level || '').trim().toUpperCase() === 'SECONDARY'
        ? 'SECONDARY'
        : 'PRIMARY';
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
        level,
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
        needsEvidence: Boolean(record.needsEvidence),
      };
    });
}

function toHandleFragment(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 12);
  if (ascii.length >= 4) return ascii;
  return 'agent';
}

function truncate(value: string, max: number): string {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeAgentRules(value: unknown): WorldStudioAgentDraft['rules'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = asRecord(value);
  if (String(record.format || '').trim() !== 'rule-lines-v1') return undefined;
  const lines = normalizeStringArray(record.lines);
  return {
    format: 'rule-lines-v1',
    lines,
    text: lines.join('\n'),
  };
}

function normalizeWakeStrategy(value: unknown): WorldStudioAgentDraft['wakeStrategy'] | undefined {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'PASSIVE' || text === 'PROACTIVE') {
    return text;
  }
  return undefined;
}

function firstClause(text: unknown, max = 48): string {
  const source = String(text || '').trim();
  if (!source) return '';
  const head = source
    .split(/[。！？!?，,；;:\n]/)
    .map((item) => item.trim())
    .find(Boolean) || '';
  return truncate(head, max);
}

function uniqueList(input: string[]): string[] {
  return Array.from(new Set(input.map((item) => String(item || '').trim()).filter(Boolean)));
}

function inferGenderFromText(text: string): 'male' | 'female' | 'unspecified' {
  if (/(她|女子|姑娘|少女|夫人|仙子|母)/.test(text)) return 'female';
  if (/(他|男子|少年|师兄|老者|父|门主|长老|老祖)/.test(text)) return 'male';
  return 'unspecified';
}

function inferVisualAgeFromText(text: string): string {
  if (/(孩|童|幼|少年|少女)/.test(text)) return 'teen';
  if (/(老|长老|老祖|前辈)/.test(text)) return 'elder';
  if (/(青年|年轻)/.test(text)) return 'young_adult';
  return 'adult';
}

function inferRoleFromText(text: string): string {
  const rules: Array<{ pattern: RegExp; role: string }> = [
    { pattern: /师父|导师/, role: '导师' },
    { pattern: /医师|大夫|郎中/, role: '医师' },
    { pattern: /弟子/, role: '弟子' },
    { pattern: /门主|宗主|掌门/, role: '门主' },
    { pattern: /主角/, role: '主角' },
    { pattern: /护法/, role: '护法' },
  ];
  const matched = rules.find((item) => item.pattern.test(text));
  if (matched) return matched.role;
  return firstClause(text, 20) || '关键角色';
}

function inferMbtiFromText(text: string): string {
  if (/(谨慎|理性|冷静|审慎|防范|克制)/.test(text)) return 'INTJ';
  if (/(热情|开朗|活泼|外向)/.test(text)) return 'ENFP';
  if (/(温和|关怀|体贴|照料)/.test(text)) return 'INFJ';
  if (/(威严|果断|统领|命令)/.test(text)) return 'ENTJ';
  return 'ISFJ';
}

function inferRelationshipModeFromText(text: string): string {
  if (/(谨慎|戒备|防范|警惕|冷淡)/.test(text)) return 'guarded';
  if (/(热情|友善|开朗|温和|亲切)/.test(text)) return 'friendly';
  if (/(威压|支配|命令|强势)/.test(text)) return 'dominant';
  return 'balanced';
}

function inferCommunicationFormality(text: string): 'casual' | 'formal' | 'slang' {
  if (/(老夫|在下|本座|阁下|道友)/.test(text)) return 'formal';
  if (/(哈哈|嘿|哟|老铁)/.test(text)) return 'slang';
  return 'casual';
}

function inferCommunicationResponseLength(text: string): 'short' | 'medium' | 'long' {
  if (/(寡言|沉默|惜字如金|简短)/.test(text)) return 'short';
  if (/(健谈|滔滔不绝|话痨)/.test(text)) return 'long';
  return 'medium';
}

function inferCommunicationSentiment(text: string): 'positive' | 'neutral' | 'cynical' {
  if (/(仇恨|敌意|阴冷|贪婪|杀意|冷笑)/.test(text)) return 'cynical';
  if (/(温和|友善|开朗|热情|关怀|鼓励)/.test(text)) return 'positive';
  return 'neutral';
}

function inferArtStyle(worldSetting: string): string {
  if (/(修仙|仙侠|仙门|灵根|金丹)/.test(worldSetting)) return 'xianxia_illustration';
  if (/(科幻|机甲|未来|星际)/.test(worldSetting)) return 'sci_fi_illustration';
  return 'illustration';
}

function inferAppearanceField(text: string, kind: 'hair' | 'eyes' | 'skin'): string {
  if (kind === 'hair') {
    if (/(白发|银发)/.test(text)) return 'white';
    if (/(黑发|乌发)/.test(text)) return 'black';
  }
  if (kind === 'eyes') {
    if (/(碧眼|蓝眸)/.test(text)) return 'blue';
    if (/(黑眸|乌眸)/.test(text)) return 'dark';
  }
  if (kind === 'skin') {
    if (/(苍白|惨白)/.test(text)) return 'pale';
    if (/(黝黑|古铜)/.test(text)) return 'tan';
  }
  return 'unknown';
}

function extractSignatureItems(text: string): string[] {
  const rules: Array<{ pattern: RegExp; item: string }> = [
    { pattern: /剑|飞剑/, item: '佩剑' },
    { pattern: /药|丹|炼丹/, item: '药箱' },
    { pattern: /瓶|绿瓶|小瓶/, item: '神秘小瓶' },
    { pattern: /功法|口诀|秘术/, item: '功法玉简' },
  ];
  return uniqueList(rules.filter((item) => item.pattern.test(text)).map((item) => item.item));
}

function extractInterests(text: string): string[] {
  const rules: Array<{ pattern: RegExp; interest: string }> = [
    { pattern: /修炼|功法|突破/, interest: '修炼' },
    { pattern: /医|药|丹/, interest: '医药' },
    { pattern: /阵法/, interest: '阵法' },
    { pattern: /权谋|门派|统领/, interest: '门派事务' },
  ];
  return uniqueList(rules.filter((item) => item.pattern.test(text)).map((item) => item.interest)).slice(0, 4);
}

function extractGoals(goalText: string, fallbackSummary: string): string[] {
  const goals = String(goalText || '')
    .split(/[。！？!?，,；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (goals.length > 0) return goals;
  const head = firstClause(fallbackSummary, 24);
  return head ? [head] : [];
}

function normalizeAgentLorebookDraft(value: unknown): WorldStudioAgentLorebookDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = asRecord(value);
  const name = String(record.name || '').trim();
  const content = String(record.content || '').trim();
  if (!name && !content) return null;
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

function normalizeAgentLorebookDrafts(value: unknown): WorldStudioAgentLorebookDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeAgentLorebookDraft(item))
    .filter((item): item is WorldStudioAgentLorebookDraft => Boolean(item));
}

function buildEvidenceSnippets(
  graph: WorldStudioKnowledgeGraphDraft,
  maxSnippets = 32,
): Array<Record<string, unknown>> {
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
  const profileMap = new Map(
    (input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const),
  );
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
  const accumulatorSlice = buildFinalDraftAccumulatorSlice(
    input.finalDraftAccumulator,
    promptBudget.accumulatorSlice,
  );
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
    '  "world": {"name":"...","description":"...","lore":"...","genre":"...","themes":["..."],"era":"...","timeFlowRatio":1,"rules": {}},',
    '  "worldview": {"timeModel": {"currentNode":"...","timeline":[]},"spaceTopology": {},"causality": {},"coreSystem": {},"existences": {},"resources": {},"structures": {},"visualGuide": {},"narrativeHooks": {}},',
    '  "worldEvents":[{"id":"evt-p1","level":"PRIMARY","parentEventId":null,"title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"text"}],"confidence":0.0,"needsEvidence":false}],',
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
    '- worldEvents must align with the event graph and keep PRIMARY/SECONDARY hierarchy.',
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

function validateEventGraph(knowledgeGraph: WorldStudioKnowledgeGraphDraft): void {
  const primaryEvents = knowledgeGraph.events.primary || [];
  if (primaryEvents.length === 0) {
    throw new Error('WORLD_STUDIO_SYNTHESIZE_BLOCKED_BY_EVENT_GRAPH: missing primary events');
  }
  const summary = summarizePrimaryEvidenceCoverage(primaryEvents);
  if (summary.coverage < PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD) {
    throw new Error(
      `WORLD_STUDIO_SYNTHESIZE_BLOCKED_BY_EVENT_GRAPH: primary evidence coverage below threshold (coverage=${summary.coverage.toFixed(3)}, threshold=${PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD.toFixed(3)})`,
    );
  }
}

function buildEventLorebooks(events: EventNodeDraft[]): Array<Record<string, unknown>> {
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

type AgentDnaValidation = {
  dna: WorldStudioAgentDna | null;
  reason: string | null;
  rawKeys: string[];
  identityName: string | null;
};

function validateAgentDna(value: unknown): AgentDnaValidation {
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
  if (
    !identity || typeof identity.name !== 'string' || typeof identity.role !== 'string' ||
    !biological || typeof biological.gender !== 'string' ||
    !appearance || typeof appearance.hair !== 'string' ||
    !personality || typeof personality.mbti !== 'string' ||
    !communication || typeof communication.responseLength !== 'string'
  ) {
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

function normalizeAgentDraft(value: unknown, fallbackName: string, index: number): WorldStudioAgentDraft {
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

function buildFallbackAgentDrafts(input: {
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
}): WorldStudioAgentDraft[] {
  const profileByName = new Map(
    (input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const),
  );
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
}): { dna: WorldStudioAgentDna | null; evidenceLength: number } {
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
  const summary = normalizeNullableString(
    input.draft.description
    || input.profile?.summary
    || input.characterSummary
    || input.draft.concept,
  );
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
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(asRecord(value)).length > 0;
    return false;
  };
  const mergeDraft = (base: WorldStudioAgentDraft | undefined, incoming: WorldStudioAgentDraft): WorldStudioAgentDraft => {
    if (!base) return incoming;
    const merged: Record<string, unknown> = { ...asRecord(base) };
    Object.entries(asRecord(incoming)).forEach(([key, value]) => {
      if (!hasMeaningfulValue(value)) return;
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
    if (!key) return;
    byCharacter.set(key, mergeDraft(byCharacter.get(key), {
      ...draft,
      characterName: key,
    }));
  });
  fromModel.forEach((draft, index) => {
    const key = draft.characterName || input.selectedCharacters[index] || '';
    if (!key) return;
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
      if (!characterName) return draft;
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

export async function runSynthesizeDraft(
  llm: RouteCapabilityLlmInvoker,
  input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
    finalDraftAccumulator?: FinalDraftAccumulator;
    abortSignal?: AbortSignal;
  },
): Promise<Phase2Result> {
  validateEventGraph(input.knowledgeGraph);
  const finalDraftAccumulator = input.finalDraftAccumulator || createEmptyFinalDraftAccumulator();
  const attempts = [
    { attempt: 1, compact: false, maxTokens: DEFAULT_SYNTHESIZE_PROMPT_BUDGET.maxTokens },
    { attempt: 2, compact: true, maxTokens: COMPACT_SYNTHESIZE_PROMPT_BUDGET.maxTokens },
  ] as const;
  let response: { text: string; promptTraceId: string } | null = null;
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
    } catch (error) {
      lastError = error;
      if (input.abortSignal?.aborted) throw error;
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
    } catch (parseError) {
      lastError = parseError;
      if (input.abortSignal?.aborted) throw parseError;
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
    : (
      (finalDraftAccumulator.worldLorebooks || []).length > 0
        ? finalDraftAccumulator.worldLorebooks
        : buildEventLorebooks(worldEvents)
    );

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
