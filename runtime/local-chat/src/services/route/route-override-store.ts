import {
    asRecord,
    createModKvStore,
    createModStorageClient,
    type RuntimeRouteBinding,
} from "@nimiplatform/sdk/mod";
import { LOCAL_CHAT_MOD_ID } from '../../contracts.js';
const LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY = 'nimi.local-chat.route-override.v1';
let routeOverrideStore: ReturnType<typeof createModKvStore> | null = null;
function getRouteOverrideStore() {
    if (!routeOverrideStore) {
        routeOverrideStore = createModKvStore({
            storage: createModStorageClient(LOCAL_CHAT_MOD_ID),
            namespace: 'local-chat.route-overrides',
        });
    }
    return routeOverrideStore;
}
export function dedupeModelIds(models: string[]): string[] {
    return Array.from(new Set((Array.isArray(models) ? models : [])
        .map((model) => String(model || '').trim())
        .filter(Boolean)));
}
function normalizeRouteBinding(parsed: unknown): RuntimeRouteBinding | null {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const record = asRecord(parsed);
    const source = String(record.source || '').trim();
    const connectorId = String(record.connectorId || '').trim();
    const model = String(record.model || '').trim();
    if (!source || !model)
        return null;
    const normalizedSource = source === 'cloud' ? 'cloud' : 'local';
    return {
        source: normalizedSource,
        connectorId,
        model,
        localModelId: normalizedSource === 'local'
            ? (String(record.localModelId || '').trim() || undefined)
            : undefined,
        engine: normalizedSource === 'local'
            ? (String(record.engine || '').trim() || undefined)
            : undefined,
    };
}
export async function loadLocalChatRouteBinding(): Promise<RuntimeRouteBinding | null> {
    const parsed = await getRouteOverrideStore().getJson<RuntimeRouteBinding | null>(LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY);
    return normalizeRouteBinding(parsed);
}
export async function persistLocalChatRouteBinding(value: RuntimeRouteBinding | null): Promise<void> {
    if (!value) {
        await getRouteOverrideStore().delete(LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY);
        return;
    }
    await getRouteOverrideStore().setJson(LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY, value);
}
export function pickChatModelForConnector(connector: {
    vendor?: string;
    models: string[];
} | null, fallback: string): string {
    if (!connector)
        return fallback;
    const models = dedupeModelIds(connector.models);
    return models[0] || fallback;
}
