import { NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE, NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT, NARRATIVE_ENGINE_DATA_API_TURN_BY_ID, NARRATIVE_ENGINE_DATA_API_TURN_LATEST, NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT, NARRATIVE_ENGINE_DATA_API_TURN_WINDOW, } from './contracts.js';
import { registerNarrativeDataCapabilities } from './registrars/data.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
type RegisteredQueryHandler = (query: unknown) => unknown | Promise<unknown>;
function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}
export type NarrativeEngineModuleInput = {
    queryData: (capability: string, query: Record<string, unknown>) => Promise<unknown>;
    generateText: (payload: NarrativeAiTextRequest) => Promise<{
        text: string;
    }>;
};
export type NarrativeEngineModule = {
    invoke: (capability: string, query: unknown) => Promise<unknown>;
    contextResolve: (query: unknown) => Promise<unknown>;
    turnResultUpsert: (query: unknown) => Promise<unknown>;
    turnLatest: (query: unknown) => Promise<unknown>;
    turnById: (query: unknown) => Promise<unknown>;
    turnWindow: (query: unknown) => Promise<unknown>;
    projectionRenderInput: (query: unknown) => Promise<unknown>;
};
export function createNarrativeEngineModule(input: NarrativeEngineModuleInput): NarrativeEngineModule {
    const handlers = new Map<string, RegisteredQueryHandler>();
    let setupPromise: Promise<void> | null = null;
    const hookClient = {
        data: {
            register: async (payload: {
                capability: string;
                handler: RegisteredQueryHandler;
            }) => {
                handlers.set(String(payload.capability || ''), payload.handler);
            },
            query: async (payload: {
                capability: string;
                query: unknown;
            }) => input.queryData(String(payload.capability || ''), asRecord(payload.query)),
            unregister: (payload: {
                capability: string;
            }) => handlers.delete(String(payload.capability || '')),
            listCapabilities: () => [...handlers.keys()],
        },
    } as unknown as HookClient;
    const aiClient: NarrativeAiClient = {
        generateText: async (payload: NarrativeAiTextRequest) => input.generateText(payload),
    };
    async function ensureSetup(): Promise<void> {
        if (!setupPromise) {
            setupPromise = registerNarrativeDataCapabilities({
                hookClient,
                aiClient,
            });
        }
        await setupPromise;
    }
    async function invoke(capability: string, query: unknown): Promise<unknown> {
        await ensureSetup();
        const handler = handlers.get(capability);
        if (!handler) {
            throw new Error(`NARRATIVE_ENGINE_HANDLER_NOT_FOUND:${capability}`);
        }
        return Promise.resolve(handler(query));
    }
    return {
        invoke,
        contextResolve: (query) => invoke(NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE, query),
        turnResultUpsert: (query) => invoke(NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT, query),
        turnLatest: (query) => invoke(NARRATIVE_ENGINE_DATA_API_TURN_LATEST, query),
        turnById: (query) => invoke(NARRATIVE_ENGINE_DATA_API_TURN_BY_ID, query),
        turnWindow: (query) => invoke(NARRATIVE_ENGINE_DATA_API_TURN_WINDOW, query),
        projectionRenderInput: (query) => invoke(NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT, query),
    };
}
import type { NarrativeAiClient, NarrativeAiTextRequest } from './types.js';
