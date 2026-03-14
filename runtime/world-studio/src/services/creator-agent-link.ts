import { asRecord } from "@nimiplatform/sdk/mod";

export function normalizeCreatorAgentHandle(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/^[@~]+/, '').toLowerCase();
}

export function findLinkedCreatorAgent<T>(args: {
  creatorAgents: T[];
  draft?: unknown;
  characterName: string;
  worldId?: string | null;
}): T | null {
  const normalizedCharacterName = String(args.characterName || '').trim();
  const normalizedDraftHandle = normalizeCreatorAgentHandle(asRecord(args.draft).handle);
  const candidates = args.creatorAgents.filter((item) => {
    if (!args.worldId) {
      return true;
    }
    return String(asRecord(item).worldId || '').trim() === String(args.worldId || '').trim();
  });

  if (normalizedDraftHandle) {
    const matchedByHandle = candidates.find((item) => (
      normalizeCreatorAgentHandle(asRecord(item).handle) === normalizedDraftHandle
    ));
    if (matchedByHandle) {
      return matchedByHandle;
    }
  }

  return candidates.find((item) => (
    String(asRecord(item).displayName || '').trim() === normalizedCharacterName
  )) || null;
}
