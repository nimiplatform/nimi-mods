import { asRecord, loadLocalStorageJson, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import { parseRuntimeRouteBinding, type RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { DistillRouteOverrideMap } from '../generation/pipeline.js';

const WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX = 'nimi.world-studio.route-override.v2';

function routeOverrideStorageKey(userId: string): string {
  const normalizedUserId = String(userId || '').trim() || 'anonymous';
  return `${WORLD_STUDIO_ROUTE_OVERRIDE_STORAGE_KEY_PREFIX}.${normalizedUserId}`;
}

export function loadWorldStudioRouteOverrideMap(userId: string): DistillRouteOverrideMap {
  return loadLocalStorageJson<DistillRouteOverrideMap>(
    routeOverrideStorageKey(userId),
    { coarse: null, fine: null },
    (parsed) => {
      const record = asRecord(parsed);
      return {
        coarse: parseRuntimeRouteBinding(record.coarse),
        fine: parseRuntimeRouteBinding(record.fine),
      };
    },
  );
}

export function persistWorldStudioRouteOverrideMap(
  userId: string,
  value: DistillRouteOverrideMap,
): void {
  saveLocalStorageJson(routeOverrideStorageKey(userId), value);
}

export function formatRouteBindingSummary(binding: RuntimeRouteBinding | null): string {
  if (!binding) return 'runtime default';
  if (binding.source === 'local-runtime') {
    return `local-runtime / ${binding.model || '-'}`;
  }
  return `token-api / ${binding.connectorId || '-'} / ${binding.model || '-'}`;
}
