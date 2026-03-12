import type { DistillRouteBindingMap } from '../generation/pipeline.js';
import { asRecord, loadLocalStorageJson, saveLocalStorageJson, parseRuntimeRouteBinding, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
const WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX = 'nimi.world-studio.route-override.v2';
function bindingStorageKey(userId: string): string {
    const normalizedUserId = String(userId || '').trim() || 'anonymous';
    return `${WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX}.${normalizedUserId}`;
}
export function loadWorldStudioRouteBindingMap(userId: string): DistillRouteBindingMap {
    return loadLocalStorageJson<DistillRouteBindingMap>(bindingStorageKey(userId), { coarse: null, fine: null }, (parsed) => {
        const record = asRecord(parsed);
        return {
            coarse: parseRuntimeRouteBinding(record.coarse),
            fine: parseRuntimeRouteBinding(record.fine),
        };
    });
}
export function persistWorldStudioRouteBindingMap(userId: string, value: DistillRouteBindingMap): void {
    saveLocalStorageJson(bindingStorageKey(userId), value);
}
export function formatRouteBindingSummary(binding: RuntimeRouteBinding | null): string {
    if (!binding)
        return 'runtime default';
    if (binding.source === 'local') {
        return `local / ${binding.model || '-'}`;
    }
    return `cloud / ${binding.connectorId || '-'} / ${binding.model || '-'}`;
}
