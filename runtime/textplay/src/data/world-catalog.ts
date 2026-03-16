import { TEXTPLAY_DATA_API_WORLD_WORLDS_MINE } from '../contracts.js';
import { TextplayWorldMineListResponseSchema } from './schemas.js';
import type { TextplayWorldSummary } from '../types.js';
import { normalizeTextplayLanguage, normalizeTextplayLanguageList } from '../language.js';
import { type HookClient } from "@nimiplatform/sdk/mod";

function toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function toIsoOrNow(value: unknown): string {
    const text = toText(value);
    return text || new Date().toISOString();
}
export async function listMyWorlds(input: {
    hookClient: HookClient;
}): Promise<TextplayWorldSummary[]> {
    const payload = await input.hookClient.data.query({
        capability: TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
        query: {},
    });
    const parsed = TextplayWorldMineListResponseSchema.safeParse(payload);
    if (!parsed.success) {
        return [];
    }
    const rows = Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
    return rows
        .map((row) => {
        const languages = asRecord((row as Record<string, unknown>).languages);
        return {
            id: toText(row.id),
            name: toText(row.name) || toText(row.id),
            status: toText(row.status) || 'UNKNOWN',
            description: row.description == null ? null : toText(row.description),
            updatedAt: toIsoOrNow(row.updatedAt),
            primaryLanguage: normalizeTextplayLanguage(languages?.primary),
            commonLanguages: normalizeTextplayLanguageList(languages?.common),
        };
    })
        .filter((row) => Boolean(row.id))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}
