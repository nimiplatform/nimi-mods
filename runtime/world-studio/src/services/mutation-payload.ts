import type { DistillRouteBindingMap } from '../generation/pipeline.js';
import {
    asRecord,
    createModKvStore,
    createModStorageClient,
    parseRuntimeRouteBinding,
    type RuntimeRouteBinding,
} from "@nimiplatform/sdk/mod";
import { WORLD_STUDIO_MOD_ID } from '../contracts.js';
const WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX = 'nimi.world-studio.route-override.v2';
let routeBindingStore: ReturnType<typeof createModKvStore> | null = null;
function getRouteBindingStore() {
    if (!routeBindingStore) {
        // Route overrides are persisted through mod-scoped host storage, keyed per user.
        routeBindingStore = createModKvStore({
            storage: createModStorageClient(WORLD_STUDIO_MOD_ID),
            namespace: 'world-studio.route-overrides',
        });
    }
    return routeBindingStore;
}
function bindingStorageKey(userId: string): string {
    const normalizedUserId = String(userId || '').trim() || 'anonymous';
    return `${WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX}.${normalizedUserId}`;
}
export async function loadWorldStudioRouteBindingMap(userId: string): Promise<DistillRouteBindingMap> {
    const parsed = await getRouteBindingStore().getJson<DistillRouteBindingMap>(bindingStorageKey(userId));
    const record = asRecord(parsed);
    return {
        coarse: parseRuntimeRouteBinding(record.coarse),
        fine: parseRuntimeRouteBinding(record.fine),
    };
}
export async function persistWorldStudioRouteBindingMap(userId: string, value: DistillRouteBindingMap): Promise<void> {
    await getRouteBindingStore().setJson(bindingStorageKey(userId), value);
}
export function formatRouteBindingSummary(binding: RuntimeRouteBinding | null): string {
    if (!binding)
        return 'runtime default';
    if (binding.source === 'local') {
        return `local / ${binding.model || '-'}`;
    }
    return `cloud / ${binding.connectorId || '-'} / ${binding.model || '-'}`;
}
