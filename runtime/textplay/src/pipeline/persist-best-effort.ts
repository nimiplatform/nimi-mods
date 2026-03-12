import type { TextplayNormalizedRenderInput, TextplayPresenceReport, TextplayRunEvent, TextplayRunSnapshot, TextplayWarning, } from '../types.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
export async function persistTextplayRenderBestEffort(input: {
    hookClient: HookClient;
    normalized: TextplayNormalizedRenderInput;
    text: string;
    meta: Record<string, unknown>;
    runEvents: TextplayRunEvent[];
    runSnapshot: TextplayRunSnapshot;
    warnings: TextplayWarning[];
    presenceReports: TextplayPresenceReport[];
}): Promise<TextplayWarning | null> {
    void input;
    return null;
}
