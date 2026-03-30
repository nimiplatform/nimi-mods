import type { LocalChatDefaultSettings } from '../../state/index.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';
import { findLocalRuntimeModelForBinding, isLocalRuntimeModelReady, isSelectableLocalRuntimeModelForScenario, } from '../../services/route/connector-model-capabilities.js';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
type MediaKind = 'image' | 'video';
type MediaRouteSource = LocalChatDefaultSettings['imageRouteSource'];
type MediaRouteCapability = 'image.generate' | 'video.generate';
function normalizeRouteSource(value: string): MediaRouteSource {
    if (value === 'local' || value === 'cloud') {
        return value;
    }
    return 'auto';
}
function asTrimmedString(value: unknown): string {
    return String(value ?? '').trim();
}
function isActiveGoRuntimeStatus(value: unknown): boolean {
    const normalized = asTrimmedString(value).toLowerCase();
    return normalized === 'active';
}
function resolveReadyLocalRuntimeBinding(input: {
    binding?: RuntimeRouteBinding | null;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding | null {
    const localModels = input.routeOptions?.local?.models || [];
    const matchedLocalModel = findLocalRuntimeModelForBinding({
        models: localModels,
        binding: {
            model: input.binding?.model,
            localModelId: input.binding?.localModelId,
            goRuntimeLocalModelId: input.binding?.goRuntimeLocalModelId,
        },
    });
    if (matchedLocalModel && isLocalRuntimeModelReady(matchedLocalModel)) {
        return {
            source: 'local',
            connectorId: '',
            model: asTrimmedString(matchedLocalModel.model || matchedLocalModel.localModelId),
            ...(asTrimmedString(matchedLocalModel.localModelId) ? { localModelId: asTrimmedString(matchedLocalModel.localModelId) } : {}),
            ...(asTrimmedString(matchedLocalModel.engine) ? { engine: asTrimmedString(matchedLocalModel.engine) } : {}),
            ...(asTrimmedString(matchedLocalModel.goRuntimeLocalModelId) ? { goRuntimeLocalModelId: asTrimmedString(matchedLocalModel.goRuntimeLocalModelId) } : {}),
            ...(asTrimmedString(matchedLocalModel.goRuntimeStatus) ? { goRuntimeStatus: asTrimmedString(matchedLocalModel.goRuntimeStatus) } : {}),
        };
    }
    if (input.binding && isActiveGoRuntimeStatus(input.binding.goRuntimeStatus)) {
        return {
            ...input.binding,
            source: 'local',
            connectorId: '',
            model: asTrimmedString(input.binding.model || input.binding.localModelId),
        };
    }
    if (!input.binding || (!asTrimmedString(input.binding.model) && !asTrimmedString(input.binding.localModelId))) {
        const firstReadyModel = localModels.find((model) => isLocalRuntimeModelReady(model)) || null;
        if (firstReadyModel) {
            return {
                source: 'local',
                connectorId: '',
                model: asTrimmedString(firstReadyModel.model || firstReadyModel.localModelId),
                ...(asTrimmedString(firstReadyModel.localModelId) ? { localModelId: asTrimmedString(firstReadyModel.localModelId) } : {}),
                ...(asTrimmedString(firstReadyModel.engine) ? { engine: asTrimmedString(firstReadyModel.engine) } : {}),
                ...(asTrimmedString(firstReadyModel.goRuntimeLocalModelId) ? { goRuntimeLocalModelId: asTrimmedString(firstReadyModel.goRuntimeLocalModelId) } : {}),
                ...(asTrimmedString(firstReadyModel.goRuntimeStatus) ? { goRuntimeStatus: asTrimmedString(firstReadyModel.goRuntimeStatus) } : {}),
            };
        }
    }
    if (localModels.length === 0 && input.binding && !asTrimmedString(input.binding.goRuntimeStatus)) {
        const model = asTrimmedString(input.binding.model || input.binding.localModelId);
        const localModelId = asTrimmedString(input.binding.localModelId);
        if (model) {
            return {
                ...input.binding,
                source: 'local',
                connectorId: '',
                model,
                ...(localModelId ? { localModelId } : {}),
            };
        }
    }
    return null;
}
function isResolvedMediaRouteOperational(input: {
    resolvedRoute: LocalChatResolvedMediaRoute;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
}): boolean {
    if (input.resolvedRoute.source === 'cloud') {
        return true;
    }
    const goRuntimeStatus = asTrimmedString(input.resolvedRoute.goRuntimeStatus).toLowerCase();
    if (goRuntimeStatus) {
        return goRuntimeStatus === 'active';
    }
    const matchedLocalModel = findLocalRuntimeModelForBinding({
        models: input.routeOptions?.local?.models || [],
        binding: {
            model: input.resolvedRoute.model,
            localModelId: input.resolvedRoute.localModelId,
            goRuntimeLocalModelId: input.resolvedRoute.goRuntimeLocalModelId,
        },
    });
    if (matchedLocalModel) {
        return isSelectableLocalRuntimeModelForScenario(matchedLocalModel, 'image.generate')
            && isLocalRuntimeModelReady(matchedLocalModel);
    }
    return Boolean(asTrimmedString(input.resolvedRoute.model || input.resolvedRoute.localModelId));
}
function toResolvedMediaRouteIfReady(input: {
    binding: RuntimeRouteBinding;
    resolvedBy: LocalChatResolvedMediaRoute['resolvedBy'];
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
    routeOptionsRevision?: number;
    provider?: string;
}): LocalChatResolvedMediaRoute | null {
    if (input.binding.source === 'local') {
        const readyBinding = resolveReadyLocalRuntimeBinding({
            binding: input.binding,
            routeOptions: input.routeOptions,
        });
        if (!readyBinding) {
            return null;
        }
        return toResolvedMediaRoute({
            binding: readyBinding,
            resolvedBy: input.resolvedBy,
            kind: input.kind,
            settings: input.settings,
            routeOptionsRevision: input.routeOptionsRevision,
            provider: input.provider,
        });
    }
    return toResolvedMediaRoute(input);
}
export function resolveMediaRouteConfig(input: {
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    fallbackSource?: 'local' | 'cloud';
}): {
    routeSource: MediaRouteSource;
    routeBinding?: RuntimeRouteBinding;
    model?: string;
} {
    const routeSource = normalizeRouteSource(input.kind === 'image'
        ? input.settings.imageRouteSource
        : input.settings.videoRouteSource);
    const connectorId = asTrimmedString(input.kind === 'image'
        ? input.settings.imageConnectorId
        : input.settings.videoConnectorId);
    const model = asTrimmedString(input.kind === 'image'
        ? input.settings.imageModel
        : input.settings.videoModel);
    const fallbackSource = input.fallbackSource || 'local';
    if (routeSource === 'local') {
        const override: RuntimeRouteBinding = {
            source: 'local',
            connectorId: '',
            model: model || '',
            ...(model ? { model, localModelId: model } : {}),
        };
        return {
            routeSource,
            routeBinding: override,
            model: model || undefined,
        };
    }
    if (routeSource === 'cloud') {
        const override: RuntimeRouteBinding = {
            source: 'cloud',
            connectorId,
            model: model || '',
            ...(connectorId ? { connectorId } : {}),
            ...(model ? { model } : {}),
        };
        return {
            routeSource,
            routeBinding: override,
            model: model || undefined,
        };
    }
    if (connectorId || model) {
        const inferredSource = connectorId ? 'cloud' : fallbackSource;
        const override: RuntimeRouteBinding = {
            source: inferredSource,
            connectorId,
            model: model || '',
            ...(connectorId ? { connectorId } : {}),
            ...(model ? { model } : {}),
            ...(model && inferredSource === 'local' ? { localModelId: model } : {}),
        };
        return {
            routeSource,
            routeBinding: override,
            model: model || undefined,
        };
    }
    return {
        routeSource,
        model: undefined,
    };
}
export function isMediaRouteReady(input: {
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
    resolvedRoute?: LocalChatResolvedMediaRoute | null;
    routeOptionsRevision?: number;
}): boolean {
    if (input.resolvedRoute) {
        const expectedSettingsRevision = buildMediaSettingsRevision({
            kind: input.kind,
            settings: input.settings,
        });
        const expectedRouteOptionsRevision = Number.isFinite(input.routeOptionsRevision)
            ? Math.max(0, Math.floor(Number(input.routeOptionsRevision)))
            : 0;
        return input.resolvedRoute.settingsRevision === expectedSettingsRevision
            && input.resolvedRoute.routeOptionsRevision === expectedRouteOptionsRevision
            && isResolvedMediaRouteOperational({
                resolvedRoute: input.resolvedRoute,
                routeOptions: input.routeOptions || null,
            });
    }
    const routeSource = normalizeRouteSource(input.kind === 'image'
        ? input.settings.imageRouteSource
        : input.settings.videoRouteSource);
    if (routeSource === 'auto') {
        return Boolean(resolveMediaRouteFromOptions({
            kind: input.kind,
            settings: input.settings,
            routeOptions: input.routeOptions || null,
            routeOptionsRevision: input.routeOptionsRevision,
        }));
    }
    if (routeSource === 'local') {
        return Boolean(resolveReadyLocalRuntimeBinding({
            binding: resolveMediaRouteConfig({
                kind: input.kind,
                settings: input.settings,
            }).routeBinding,
            routeOptions: input.routeOptions || null,
        }));
    }
    const connectorId = asTrimmedString(input.kind === 'image'
        ? input.settings.imageConnectorId
        : input.settings.videoConnectorId);
    return Boolean(connectorId);
}
function capabilityForKind(kind: MediaKind): MediaRouteCapability {
    return kind === 'image' ? 'image.generate' : 'video.generate';
}
function toResolvedMediaRoute(input: {
    binding: RuntimeRouteBinding;
    resolvedBy: LocalChatResolvedMediaRoute['resolvedBy'];
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    routeOptionsRevision?: number;
    provider?: string;
}): LocalChatResolvedMediaRoute {
    return {
        source: input.binding.source,
        ...(asTrimmedString(input.binding.connectorId) ? { connectorId: asTrimmedString(input.binding.connectorId) } : {}),
        model: asTrimmedString(input.binding.model || input.binding.localModelId),
        ...(asTrimmedString(input.binding.localModelId) ? { localModelId: asTrimmedString(input.binding.localModelId) } : {}),
        ...(asTrimmedString(input.binding.goRuntimeLocalModelId) ? { goRuntimeLocalModelId: asTrimmedString(input.binding.goRuntimeLocalModelId) } : {}),
        ...(asTrimmedString(input.binding.goRuntimeStatus) ? { goRuntimeStatus: asTrimmedString(input.binding.goRuntimeStatus) } : {}),
        ...(asTrimmedString(input.provider) ? { provider: asTrimmedString(input.provider) } : {}),
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date().toISOString(),
        settingsRevision: buildMediaSettingsRevision({
            kind: input.kind,
            settings: input.settings,
        }),
        routeOptionsRevision: Number.isFinite(input.routeOptionsRevision)
            ? Math.max(0, Math.floor(Number(input.routeOptionsRevision)))
            : 0,
    };
}
export function buildMediaSettingsRevision(input: {
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
}): string {
    const routeConfig = resolveMediaRouteConfig({
        kind: input.kind,
        settings: input.settings,
    });
    return [
        input.kind,
        routeConfig.routeSource,
        asTrimmedString(routeConfig.routeBinding?.connectorId),
        asTrimmedString(routeConfig.routeBinding?.model || routeConfig.routeBinding?.localModelId),
    ].join('|');
}
export function resolveMediaRouteFromOptions(input: {
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    routeOptions?: RuntimeRouteOptionsSnapshot | null;
    routeOptionsRevision?: number;
}): LocalChatResolvedMediaRoute | null {
    const routeOptions = input.routeOptions || null;
    if (!routeOptions) {
        return null;
    }
    const routeConfig = resolveMediaRouteConfig({
        kind: input.kind,
        settings: input.settings,
    });
    const selected = routeOptions.selected || null;
    const resolvedDefault = routeOptions.resolvedDefault || null;
    if (routeConfig.routeSource === 'auto') {
        if (resolvedDefault) {
            const resolved = toResolvedMediaRouteIfReady({
                binding: resolvedDefault,
                resolvedBy: 'resolved-default',
                kind: input.kind,
                settings: input.settings,
                routeOptions,
                routeOptionsRevision: input.routeOptionsRevision,
            });
            if (resolved) {
                return resolved;
            }
        }
        if (selected) {
            return toResolvedMediaRouteIfReady({
                binding: selected,
                resolvedBy: 'selected',
                kind: input.kind,
                settings: input.settings,
                routeOptions,
                routeOptionsRevision: input.routeOptionsRevision,
            });
        }
        return null;
    }
    if (!routeConfig.routeBinding) {
        return null;
    }
    return toResolvedMediaRouteIfReady({
        binding: routeConfig.routeBinding,
        resolvedBy: 'selected',
        kind: input.kind,
        settings: input.settings,
        routeOptions,
        routeOptionsRevision: input.routeOptionsRevision,
    });
}
export async function preflightResolveMediaRoute(input: {
    aiClient: {
        resolveRoute: (input: {
            capability: MediaRouteCapability;
            routeBinding?: RuntimeRouteBinding;
        }) => Promise<{
            source: string;
            connectorId: string;
            model: string;
            localModelId?: string;
            provider?: string;
            goRuntimeLocalModelId?: string;
            goRuntimeStatus?: string;
        }>;
    };
    kind: MediaKind;
    settings: LocalChatDefaultSettings;
    fallbackSource?: 'local' | 'cloud';
    routeOptionsRevision?: number;
}): Promise<LocalChatResolvedMediaRoute | null> {
    const routeConfig = resolveMediaRouteConfig({
        kind: input.kind,
        settings: input.settings,
        fallbackSource: input.fallbackSource,
    });
    const resolved = await input.aiClient.resolveRoute({
        capability: capabilityForKind(input.kind),
        routeBinding: routeConfig.routeBinding,
    });
    const resolvedRoute = toResolvedMediaRouteIfReady({
        binding: {
            source: resolved.source === 'cloud' ? 'cloud' : 'local',
            connectorId: asTrimmedString(resolved.connectorId),
            model: asTrimmedString(resolved.model || resolved.localModelId),
            ...(asTrimmedString(resolved.localModelId) ? { localModelId: asTrimmedString(resolved.localModelId) } : {}),
            ...(asTrimmedString(resolved.goRuntimeLocalModelId) ? { goRuntimeLocalModelId: asTrimmedString(resolved.goRuntimeLocalModelId) } : {}),
            ...(asTrimmedString(resolved.goRuntimeStatus) ? { goRuntimeStatus: asTrimmedString(resolved.goRuntimeStatus) } : {}),
        },
        resolvedBy: 'preflight',
        kind: input.kind,
        settings: input.settings,
        routeOptionsRevision: input.routeOptionsRevision,
        provider: resolved.provider,
    });
    if (!resolvedRoute) {
        return null;
    }
    return resolvedRoute;
}
export function toPinnedRouteBinding(route: {
    source: string;
    connectorId?: string;
    model?: string;
    localModelId?: string;
}): RuntimeRouteBinding {
    if (route.source === 'cloud') {
        const connectorId = asTrimmedString(route.connectorId);
        const model = asTrimmedString(route.model);
        return {
            source: 'cloud',
            connectorId,
            model,
        };
    }
    const model = asTrimmedString(route.model);
    const localModelId = asTrimmedString(route.localModelId) || model;
    return {
        source: 'local',
        connectorId: '',
        model,
        ...(localModelId ? { localModelId } : {}),
    };
}
