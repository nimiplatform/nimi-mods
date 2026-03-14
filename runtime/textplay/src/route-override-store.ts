import {
    asRecord,
    createModKvStore,
    createModStorageClient,
    type RuntimeRouteBinding,
} from "@nimiplatform/sdk/mod";
import { TEXTPLAY_MOD_ID } from './contracts.js';
const TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY = 'nimi.textplay.route-override.v1';
let routeOverrideStore: ReturnType<typeof createModKvStore> | null = null;
function getRouteOverrideStore() {
    if (!routeOverrideStore) {
        // Route overrides stay mod-scoped and host-persisted; they do not mutate runtime defaults.
        routeOverrideStore = createModKvStore({
            storage: createModStorageClient(TEXTPLAY_MOD_ID),
            namespace: 'textplay.route-overrides',
        });
    }
    return routeOverrideStore;
}
function normalizeRouteBinding(parsed: unknown): RuntimeRouteBinding | null {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const record = asRecord(parsed);
    const source = String(record.source || '').trim();
    const connectorId = String(record.connectorId || '').trim();
    const model = String(record.model || '').trim();
    if (!source || !model) {
        return null;
    }
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
export async function loadTextplayRouteBinding(): Promise<RuntimeRouteBinding | null> {
    const parsed = await getRouteOverrideStore().getJson<RuntimeRouteBinding | null>(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY);
    return normalizeRouteBinding(parsed);
}
export async function persistTextplayRouteBinding(value: RuntimeRouteBinding | null): Promise<void> {
    if (!value) {
        await getRouteOverrideStore().delete(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY);
        return;
    }
    await getRouteOverrideStore().setJson(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY, value);
}
