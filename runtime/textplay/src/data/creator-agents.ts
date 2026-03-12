import { TEXTPLAY_DATA_API_CREATOR_AGENTS_LIST } from '../contracts.js';
import type { TextplayAgentOption } from '../types.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value: unknown): string | null {
  const normalized = toText(value);
  return normalized || null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeAgentOption(value: unknown): TextplayAgentOption | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = toText(record.id);
  if (!id) {
    return null;
  }
  return {
    id,
    name: toText(record.name) || toText(record.displayName) || toText(record.title) || id,
    avatarUrl: toNullableText(record.avatarUrl) || toNullableText(record.imageUrl) || toNullableText(record.referenceImageUrl),
  };
}

export async function listEntryAgentOptions(input: {
  hookClient: HookClient;
  characterRefs: string[];
}): Promise<TextplayAgentOption[]> {
  const characterRefs = unique(input.characterRefs);
  if (characterRefs.length === 0) {
    return [];
  }

  try {
    const payload = await input.hookClient.data.query({
      capability: TEXTPLAY_DATA_API_CREATOR_AGENTS_LIST,
      query: {},
    });
    const rows = Array.isArray(payload) ? payload : [];
    const options = rows
      .map(normalizeAgentOption)
      .filter((item): item is TextplayAgentOption => item !== null);
    const byId = new Map(options.map((item) => [item.id, item]));
    return characterRefs.map((id) => byId.get(id) || {
      id,
      name: id,
      avatarUrl: null,
    });
  } catch {
    return characterRefs.map((id) => ({
      id,
      name: id,
      avatarUrl: null,
    }));
  }
}
