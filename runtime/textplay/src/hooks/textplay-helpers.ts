import type { TextplayPersistRecord, TextplayRunEvent, TextplayStoryDetail, TextplayWorldSummary } from '../types.js';
import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod';
import { firstNonEmptyText } from './textplay-parsers.js';

export function mergeRunEvents(existing: TextplayRunEvent[], incoming: TextplayRunEvent[]): TextplayRunEvent[] {
    if (incoming.length === 0) {
        return existing;
    }
    const merged = new Map<number, TextplayRunEvent>();
    for (const event of existing) {
        merged.set(event.seq, event);
    }
    for (const event of incoming) {
        merged.set(event.seq, event);
    }
    return [...merged.values()].sort((left, right) => left.seq - right.seq);
}
export function upsertPersistRecord(records: TextplayPersistRecord[], next: TextplayPersistRecord): TextplayPersistRecord[] {
    const index = records.findIndex((item) => item.runId === next.runId);
    if (index === -1) {
        return [next, ...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    const copied = [...records];
    copied[index] = next;
    return copied.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
export function deriveStoryPlaceholder(input: {
    story: TextplayStoryDetail | null;
    startupReady: boolean;
    started: boolean;
    paused: boolean;
}): string {
    if (!input.story) {
        return 'Select a world and story first...';
    }
    if (!input.started) {
        return 'Fill Player Name, then click Start to load background and opening narration...';
    }
    if (input.paused) {
        return 'Session paused. Click Resume in Current Session before sending.';
    }
    if (!input.startupReady) {
        return 'Startup package is loading...';
    }
    return `在《${input.story.title}》中输入下一步行动...`;
}
export function formatRouteLabel(binding: RuntimeRouteBinding | null): string {
    if (!isRouteBindingUsable(binding)) {
        return 'unresolved';
    }
    const usableBinding = binding as RuntimeRouteBinding;
    return `${usableBinding.source}/${usableBinding.connectorId || 'default'}:${usableBinding.model}`;
}
export function toRouteBindingRecord(binding: RuntimeRouteBinding | null): Record<string, unknown> | undefined {
    if (!isRouteBindingUsable(binding)) {
        return undefined;
    }
    const usableBinding = binding as RuntimeRouteBinding;
    const model = usableBinding.model.trim();
    return {
        source: usableBinding.source,
        connectorId: usableBinding.connectorId,
        model,
        ...(usableBinding.localModelId ? { localModelId: usableBinding.localModelId } : {}),
        ...(usableBinding.engine ? { engine: usableBinding.engine } : {}),
    };
}
export function isRouteBindingUsable(binding: RuntimeRouteBinding | null): boolean {
    if (!binding) {
        return false;
    }
    const model = binding.model.trim();
    if (!model) {
        return false;
    }
    if (binding.source === 'local') {
        return true;
    }
    return binding.connectorId.trim().length > 0;
}
export function resolveEffectiveRouteBinding(input: {
    binding: RuntimeRouteBinding | null;
    selected: RuntimeRouteBinding | null;
}): RuntimeRouteBinding | null {
    return input.binding || input.selected || null;
}
export function pickWorldSummaryById(worlds: TextplayWorldSummary[], worldId: string): TextplayWorldSummary | null {
    const normalizedWorldId = worldId.trim();
    if (!normalizedWorldId) {
        return null;
    }
    return worlds.find((world) => world.id === normalizedWorldId) || null;
}
export function deriveRouteBindingBySource(input: {
    source: RuntimeRouteSource;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    if (input.source === 'local') {
        const firstLocal = input.options?.local?.models[0] || null;
        return {
            source: 'local',
            connectorId: '',
            model: firstLocal?.model || '',
            ...(firstLocal?.localModelId ? { localModelId: firstLocal.localModelId } : {}),
            ...(firstLocal?.engine ? { engine: firstLocal.engine } : {}),
        };
    }
    const firstConnector = input.options?.connectors[0] || null;
    const firstModel = firstConnector?.models[0] || '';
    return {
        source: 'cloud',
        connectorId: firstConnector?.id || '',
        model: firstModel || '',
    };
}
export function deriveRouteBindingByConnector(input: {
    connectorId: string;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    const connector = input.options?.connectors.find((item) => item.id === input.connectorId) || null;
    return {
        source: 'cloud',
        connectorId: input.connectorId,
        model: connector?.models[0] || '',
    };
}
export function deriveRouteBindingByModel(input: {
    model: string;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    const previous = input.previous || input.options?.selected || null;
    const source = previous?.source || 'local';
    return {
        source,
        connectorId: source === 'cloud' ? (previous?.connectorId || '') : '',
        model: input.model.trim(),
    };
}
export { firstNonEmptyText };
