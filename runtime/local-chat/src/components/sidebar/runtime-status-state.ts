import type { ChatRouteSnapshot } from '../../hooks/runtime-route/types.js';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
export function sourceLabel(source: RuntimeRouteSource | 'mixed' | 'unknown'): string {
    if (source === 'cloud')
        return 'Cloud';
    if (source === 'local')
        return 'Local';
    if (source === 'mixed')
        return 'Mixed';
    return 'Unknown';
}
export function bindingsEqual(a: RuntimeRouteBinding | null, b: RuntimeRouteBinding | null): boolean {
    if (!a || !b)
        return false;
    return (a.source === b.source
        && String(a.connectorId || '') === String(b.connectorId || '')
        && String(a.model || '') === String(b.model || '')
        && String(a.localModelId || '') === String(b.localModelId || ''));
}
export function formatRouteBindingLabel(input: {
    binding: RuntimeRouteBinding | null;
    connectors: RuntimeRouteOptionsSnapshot['connectors'];
}): string {
    const binding = input.binding;
    if (!binding)
        return '-';
    const routeSourceLabel = sourceLabel(binding.source);
    if (binding.source === 'cloud') {
        const connector = input.connectors.find((item) => item.id === binding.connectorId) || null;
        const connectorLabel = String(connector?.label || binding.connectorId || '').trim() || '-';
        const model = String(binding.model || '').trim() || '-';
        return `${routeSourceLabel} · ${connectorLabel} · ${model}`;
    }
    const model = String(binding.model || binding.localModelId || '').trim() || '-';
    return `${routeSourceLabel} · ${model}`;
}
export function formatRouteSnapshotLabel(input: {
    snapshot: ChatRouteSnapshot | null;
    fallbackBinding: RuntimeRouteBinding | null;
    connectors: RuntimeRouteOptionsSnapshot['connectors'];
}): string {
    if (!input.snapshot) {
        return formatRouteBindingLabel({
            binding: input.fallbackBinding,
            connectors: input.connectors,
        });
    }
    const normalizedSource = input.snapshot.source === 'cloud'
        ? 'cloud'
        : 'local';
    if (normalizedSource === 'cloud') {
        const connectorId = String(input.snapshot.connectorId || input.fallbackBinding?.connectorId || '').trim();
        const connector = input.connectors.find((item) => item.id === connectorId) || null;
        const connectorLabel = String(connector?.label || connectorId || '').trim() || '-';
        const model = String(input.snapshot.model || input.fallbackBinding?.model || '').trim() || '-';
        return `${sourceLabel(normalizedSource)} · ${connectorLabel} · ${model}`;
    }
    const model = String(input.snapshot.model
        || input.fallbackBinding?.model
        || input.fallbackBinding?.localModelId
        || '').trim() || '-';
    return `${sourceLabel(normalizedSource)} · ${model}`;
}
export function hasPendingChatModelChange(input: {
    activeModel: string;
    query: string;
}): boolean {
    const activeModel = String(input.activeModel || '').trim();
    const query = String(input.query || '').trim();
    if (!query) {
        return false;
    }
    return query !== activeModel;
}
