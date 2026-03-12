import { asRecord, loadLocalStorageJson, removeLocalStorageKey, saveLocalStorageJson, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
const TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY = 'nimi.textplay.route-override.v1';
export function loadTextplayRouteBinding(): RuntimeRouteBinding | null {
    return loadLocalStorageJson<RuntimeRouteBinding | null>(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY, null, (parsed) => {
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
    });
}
export function persistTextplayRouteBinding(value: RuntimeRouteBinding | null): void {
    if (!value) {
        removeLocalStorageKey(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY);
        return;
    }
    saveLocalStorageJson(TEXTPLAY_ROUTE_OVERRIDE_STORAGE_KEY, value);
}
