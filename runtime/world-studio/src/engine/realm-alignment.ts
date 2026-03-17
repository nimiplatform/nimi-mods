import type {
  AgentProseCandidateField,
  DraftPatchEvidenceRef,
  ProseCandidateDraft,
  WorldProseCandidateField,
  WorldStudioAgentDraft,
} from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";

export const WORLD_PATCH_FIELD_SET = new Set([
  'bannerUrl',
  'contentRating',
  'description',
  'era',
  'genre',
  'iconUrl',
  'motto',
  'name',
  'overview',
  'status',
  'tagline',
  'themes',
]);

export const WORLDVIEW_PATCH_FIELD_SET = new Set([
  'causality',
  'coreSystem',
  'existences',
  'languages',
  'lifecycle',
  'narrativeHooks',
  'resources',
  'spaceTopology',
  'structures',
  'timeModel',
  'visualGuide',
]);

export const AGENT_STRUCTURAL_FIELD_SET = new Set([
  'characterName',
  'handle',
  'concept',
  'backstory',
  'coreValues',
  'relationshipStyle',
  'description',
  'rules',
  'postHistoryInstructions',
  'alternateGreetings',
  'agentLorebooks',
  'referenceImageUrl',
  'wakeStrategy',
  'dnaPrimary',
  'dnaSecondary',
  'dna',
]);

export const WORLD_PROSE_FIELDS: WorldProseCandidateField[] = [
  'description',
  'tagline',
  'motto',
  'overview',
];

export const AGENT_PROSE_FIELDS: AgentProseCandidateField[] = [
  'scenario',
  'greeting',
  'exampleDialogue',
  'systemPromptBase',
];

export const PROSE_CANDIDATE_LIMIT = 3;

function pickAllowedRecord(
  value: unknown,
  allowed: Set<string>,
): Record<string, unknown> {
  const record = asRecord(value);
  return Object.entries(record).reduce<Record<string, unknown>>((acc, [key, next]) => {
    if (!allowed.has(key) || next == null) {
      return acc;
    }
    if (typeof next === 'string' && next.trim().length === 0) {
      return acc;
    }
    if (typeof next === 'object' && !Array.isArray(next)) {
      acc[key] = next;
      return acc;
    }
    if (Array.isArray(next) && next.length === 0) {
      return acc;
    }
    acc[key] = next;
    return acc;
  }, {});
}

export function alignWorldPatch(value: unknown): Record<string, unknown> {
  return pickAllowedRecord(value, WORLD_PATCH_FIELD_SET);
}

export function alignWorldviewPatch(value: unknown): Record<string, unknown> {
  return pickAllowedRecord(value, WORLDVIEW_PATCH_FIELD_SET);
}

export function alignAgentStructuralDraft(value: unknown): WorldStudioAgentDraft | null {
  const record = pickAllowedRecord(value, AGENT_STRUCTURAL_FIELD_SET);
  const characterName = String(record.characterName || '').trim();
  if (!characterName) {
    return null;
  }
  return {
    characterName,
    handle: String(record.handle || '').trim(),
    concept: String(record.concept || '').trim(),
    backstory: String(record.backstory || '').trim(),
    coreValues: String(record.coreValues || '').trim(),
    relationshipStyle: String(record.relationshipStyle || '').trim(),
    ...(typeof record.description === 'string' ? { description: record.description.trim() || null } : {}),
    ...(record.rules && typeof record.rules === 'object' && !Array.isArray(record.rules) ? { rules: record.rules as WorldStudioAgentDraft['rules'] } : {}),
    ...(typeof record.postHistoryInstructions === 'string' ? { postHistoryInstructions: record.postHistoryInstructions.trim() || null } : {}),
    ...(Array.isArray(record.alternateGreetings) ? { alternateGreetings: record.alternateGreetings.map((item) => String(item || '').trim()).filter(Boolean) } : {}),
    ...(Array.isArray(record.agentLorebooks) ? { agentLorebooks: record.agentLorebooks as WorldStudioAgentDraft['agentLorebooks'] } : {}),
    ...(typeof record.referenceImageUrl === 'string' ? { referenceImageUrl: record.referenceImageUrl.trim() || null } : {}),
    ...(record.wakeStrategy === 'PASSIVE' || record.wakeStrategy === 'PROACTIVE' ? { wakeStrategy: record.wakeStrategy } : {}),
    ...(typeof record.dnaPrimary === 'string' ? { dnaPrimary: record.dnaPrimary } : {}),
    ...(Array.isArray(record.dnaSecondary) ? { dnaSecondary: record.dnaSecondary.map((item) => String(item || '')).filter(Boolean) } : {}),
    ...(record.dna && typeof record.dna === 'object' && !Array.isArray(record.dna) ? { dna: record.dna as WorldStudioAgentDraft['dna'] } : {}),
  };
}

export function normalizeCandidateDrafts(
  value: unknown,
): ProseCandidateDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const record = asRecord(item);
      const content = String(record.content || '').trim();
      const confidence = Number(record.confidence);
      const evidenceRefs = Array.isArray(record.evidenceRefs)
        ? (record.evidenceRefs as DraftPatchEvidenceRef[])
        : [];
      return {
        content,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        ...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
      } satisfies ProseCandidateDraft;
    })
    .filter((item) => item.content.length > 0);
}
