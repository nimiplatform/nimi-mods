import type { LocalChatTarget } from './types.js';
import { asNullableRecord, asString } from './read-context.js';

function readDirectReferenceImageUrl(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  return asString(record.referenceImageUrl) || asString(record.reference_image_url);
}

function readAgentProfileReferenceImageUrl(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  return readDirectReferenceImageUrl(asNullableRecord(record.agentProfile))
    || readDirectReferenceImageUrl(asNullableRecord(record.agent_profile));
}

function readPayloadReferenceImageUrl(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const payload = asNullableRecord(record.payload);
  return readDirectReferenceImageUrl(payload) || readAgentProfileReferenceImageUrl(payload);
}

export function readLocalChatReferenceImageUrl(value: unknown): string | null {
  const record = asNullableRecord(value);
  return readDirectReferenceImageUrl(record)
    || readAgentProfileReferenceImageUrl(record)
    || readPayloadReferenceImageUrl(record);
}

export function resolveLocalChatTargetReferenceImageUrl(
  target: Pick<LocalChatTarget, 'referenceImageUrl' | 'agentProfile' | 'payload'> | null | undefined,
): string | null {
  if (!target) return null;
  return readLocalChatReferenceImageUrl(target);
}
