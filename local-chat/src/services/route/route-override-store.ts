import { asRecord, loadLocalStorageJson, removeLocalStorageKey, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import { type RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';

const LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY = 'nimi.local-chat.route-override.v1';

export function dedupeModelIds(models: string[]): string[] {
  return Array.from(new Set(
    (Array.isArray(models) ? models : [])
      .map((model) => String(model || '').trim())
      .filter(Boolean),
  ));
}

export function loadLocalChatRouteBinding(): RuntimeRouteBinding | null {
  return loadLocalStorageJson<RuntimeRouteBinding | null>(
    LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY,
    null,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const record = asRecord(parsed);
      const source = String(record.source || '').trim();
      const connectorId = String(record.connectorId || '').trim();
      const model = String(record.model || '').trim();
      if (!source || !model) return null;
      const normalizedSource = source === 'token-api' ? 'token-api' : 'local-runtime';
      return {
        source: normalizedSource,
        connectorId,
        model,
        localModelId: normalizedSource === 'local-runtime'
          ? (String(record.localModelId || '').trim() || undefined)
          : undefined,
        engine: normalizedSource === 'local-runtime'
          ? (String(record.engine || '').trim() || undefined)
          : undefined,
      };
    },
  );
}

export function persistLocalChatRouteBinding(value: RuntimeRouteBinding | null): void {
  if (!value) {
    removeLocalStorageKey(LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY);
    return;
  }
  saveLocalStorageJson(LOCAL_CHAT_ROUTE_OVERRIDE_STORAGE_KEY, value);
}

export function pickChatModelForConnector(
  connector: { vendor?: string; models: string[] } | null,
  fallback: string,
): string {
  if (!connector) return fallback;
  const models = dedupeModelIds(connector.models);
  return models[0] || fallback;
}
