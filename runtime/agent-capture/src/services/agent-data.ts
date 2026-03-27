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

export function toCreatorAgentSummary(payload: unknown): AgentCaptureAgentSummary | null {
  const record = toRecord(payload);
  const user = record.user && typeof record.user === 'object' ? toRecord(record.user) : record;
  const agent = toRecord(user.agent);
  const agentProfile = toRecord(user.agentProfile);
  const id = String(user.id || '').trim();
  if (!id) {
    return null;
  }
  return {
    id,
    handle: String(user.handle || '').trim(),
    displayName: String(user.displayName || user.handle || id).trim(),
    bio: toStringOrNull(user.bio),
    avatarUrl: toStringOrNull(user.avatarUrl),
    tags: toStringArray(user.tags),
    worldId: toStringOrNull(agentProfile.worldId || agent.worldId),
    activeWorldId: toStringOrNull(agentProfile.activeWorldId || agent.activeWorldId),
    ownershipType: toStringOrNull(agentProfile.ownershipType || agent.ownershipType),
    importance: toStringOrNull(agentProfile.importance || agent.importance),
    state: toStringOrNull(agentProfile.state || agent.state),
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
