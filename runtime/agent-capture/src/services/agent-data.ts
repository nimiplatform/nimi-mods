import type { HookClient } from '@nimiplatform/sdk/mod';
import {
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
} from '../contracts.js';
import type { AgentCaptureAgentSummary } from '../types.js';

function toRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function toStringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function toStringOrNull(input: unknown): string | null {
  const normalized = String(input || '').trim();
  return normalized ? normalized : null;
}

function toLooseRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function toIdentitySummary(input: unknown): AgentCaptureAgentSummary['identity'] {
  const record = toLooseRecord(input);
  const role = toStringOrNull(record.role);
  const species = toStringOrNull(record.species);
  const summary = toStringOrNull(record.summary);
  if (!role && !species && !summary) {
    return null;
  }
  return {
    role,
    species,
    summary,
  };
}

function toAppearanceSummary(input: unknown): AgentCaptureAgentSummary['appearance'] {
  const record = toLooseRecord(input);
  const fashionStyle = toStringOrNull(record.fashionStyle);
  const signatureItems = toStringArray(record.signatureItems);
  if (!fashionStyle && signatureItems.length === 0) {
    return null;
  }
  return {
    fashionStyle,
    signatureItems,
  };
}

export function toCreatorAgentSummary(payload: unknown): AgentCaptureAgentSummary | null {
  const record = toRecord(payload);
  const user = record.user && typeof record.user === 'object' ? toRecord(record.user) : record;
  const agent = toRecord(user.agent);
  const agentProfile = toRecord(user.agentProfile);
  const itemDna = toLooseRecord(record.dna);
  const profileDna = toLooseRecord(agentProfile.dna);
  const dna = Object.keys(itemDna).length > 0 ? itemDna : profileDna;
  const id = String(user.id || '').trim();
  if (!id) {
    return null;
  }
  return {
    id,
    handle: String(user.handle || '').trim(),
    displayName: String(user.displayName || user.handle || id).trim(),
    bio: toStringOrNull(user.bio),
    description: toStringOrNull(record.description ?? record.bio ?? user.bio),
    greeting: toStringOrNull(record.greeting),
    tags: toStringArray(user.tags),
    importance: toStringOrNull(agentProfile.importance || agent.importance),
    identity: toIdentitySummary(dna.identity),
    appearance: toAppearanceSummary(dna.appearance),
  };
}

export function toCreatorAgentSummaryList(payload: unknown): AgentCaptureAgentSummary[] {
  const record = toRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray(record.items) ? record.items : []);
  return items
    .map((item) => toCreatorAgentSummary(item))
    .filter((item): item is AgentCaptureAgentSummary => Boolean(item));
}

export async function listCreatorAgents(hookClient: HookClient): Promise<AgentCaptureAgentSummary[]> {
  const payload = await hookClient.data.query({
    capability: AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
    query: {},
  });
  return toCreatorAgentSummaryList(payload);
}

export async function getCreatorAgent(
  hookClient: HookClient,
  agentId: string,
): Promise<AgentCaptureAgentSummary | null> {
  const payload = await hookClient.data.query({
    capability: AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
    query: { agentId },
  });
  return toCreatorAgentSummary(payload);
}
