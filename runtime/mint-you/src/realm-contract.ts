export type WorldAccessSummaryDto = {
  userId: string;
  hasActiveAccess: boolean;
  canCreateWorld: boolean;
  canMaintainWorld: boolean;
  records: unknown[];
};

export type OasisWorld = {
  id: string;
  name: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasBoolean(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === 'boolean';
}

export function parseWorldAccessSummary(payload: unknown): WorldAccessSummaryDto | null {
  const record = toRecord(payload);
  if (!toNonEmptyString(record.userId)) {
    return null;
  }
  if (!hasBoolean(record, 'hasActiveAccess') || !hasBoolean(record, 'canCreateWorld') || !hasBoolean(record, 'canMaintainWorld')) {
    return null;
  }
  if (!Array.isArray(record.records)) {
    return null;
  }
  return record as unknown as WorldAccessSummaryDto;
}

export function extractScopeKeyFromWorldAccess(payload: unknown): string {
  return parseWorldAccessSummary(payload)?.userId ?? '';
}

export function parseOasisWorld(payload: unknown): OasisWorld | null {
  const record = toRecord(payload);
  const id = toNonEmptyString(record.id);
  const name = toNonEmptyString(record.name);
  if (!id || !name) {
    return null;
  }
  return { id, name };
}

export function extractCreateAgentId(payload: unknown): string {
  return toNonEmptyString(toRecord(payload).id);
}

export function extractPhotoOwnerId(
  profile: Record<string, unknown>,
  fallbackAgentId: string,
): string {
  const profileOwner = toRecord(profile.owner);
  const profileUser = toRecord(profile.user);
  const nestedAgent = toRecord(profile.agent);
  const nestedAgentProfile = toRecord(profile.agentProfile);
  const candidates = [
    profile.creatorId,
    profile.ownerUserId,
    profile.userId,
    profileOwner.id,
    profileOwner.userId,
    profileUser.id,
    profileUser.userId,
    nestedAgent.creatorId,
    nestedAgent.ownerUserId,
    nestedAgent.userId,
    nestedAgentProfile.creatorId,
    nestedAgentProfile.ownerUserId,
    nestedAgentProfile.userId,
    fallbackAgentId,
  ];

  for (const value of candidates) {
    const normalized = toNonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}
