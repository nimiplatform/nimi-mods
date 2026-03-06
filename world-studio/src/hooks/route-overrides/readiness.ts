import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { DistillRouteBindingMap } from '../../generation/pipeline.js';
import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

function hasText(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

export type RouteReadinessResult = {
  ready: boolean;
  reasonCode: string;
  actionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'select-model' | 'select-connector';
  message: string;
};

export type EmbeddingReadinessResult = {
  healthy: boolean;
  reasonCode: string;
  actionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'retry';
  message: string;
};

export function evaluateRouteBindingReadiness(
  binding: RuntimeRouteBinding | null | undefined,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): RouteReadinessResult {
  if (!binding) {
    return {
      ready: false,
      reasonCode: ReasonCode.WORLD_STUDIO_ROUTE_BINDING_MISSING,
      actionHint: 'select-model',
      message: 'Route binding is missing.',
    };
  }

  if (binding.source === 'local-runtime') {
    if (!hasText(binding.model)) {
      return {
        ready: false,
        reasonCode: ReasonCode.WORLD_STUDIO_LOCAL_MODEL_MISSING,
        actionHint: 'install-local-model',
        message: 'No local runtime model selected.',
      };
    }
    const localModels = routeOptions?.localRuntime.models || [];
    const matchedModel = localModels.find((item) => item.model === binding.model || item.localModelId === binding.localModelId) || null;
    if (!matchedModel) {
      return {
        ready: false,
        reasonCode: ReasonCode.WORLD_STUDIO_LOCAL_MODEL_UNAVAILABLE,
        actionHint: 'install-local-model',
        message: 'Selected local model is unavailable.',
      };
    }
    if (String(matchedModel.status || '').trim() === 'unhealthy') {
      return {
        ready: false,
        reasonCode: ReasonCode.WORLD_STUDIO_LOCAL_MODEL_UNHEALTHY,
        actionHint: 'install-local-model',
        message: 'Selected local model is unhealthy.',
      };
    }
    return {
      ready: true,
      reasonCode: ReasonCode.WORLD_STUDIO_ROUTE_READY,
      actionHint: 'none',
      message: 'Local route is ready.',
    };
  }

  if (!hasText(binding.connectorId) || !hasText(binding.model)) {
    return {
      ready: false,
      reasonCode: ReasonCode.WORLD_STUDIO_TOKEN_ROUTE_INCOMPLETE,
      actionHint: 'select-connector',
      message: 'Token API route requires connector and model.',
    };
  }
  if (!routeOptions) {
    return {
      ready: true,
      reasonCode: ReasonCode.WORLD_STUDIO_ROUTE_READY,
      actionHint: 'none',
      message: 'Token API route is ready.',
    };
  }

  const connector = routeOptions.connectors.find((item) => item.id === binding.connectorId) || null;
  if (!connector) {
    return {
      ready: false,
      reasonCode: ReasonCode.WORLD_STUDIO_CONNECTOR_MISSING,
      actionHint: 'select-connector',
      message: 'Selected Token API connector is missing.',
    };
  }
  if (connector.models.length === 0 || connector.models.includes(binding.model)) {
    return {
      ready: true,
      reasonCode: ReasonCode.WORLD_STUDIO_ROUTE_READY,
      actionHint: 'none',
      message: 'Token API route is ready.',
    };
  }
  return {
    ready: false,
    reasonCode: ReasonCode.WORLD_STUDIO_TOKEN_MODEL_UNAVAILABLE,
    actionHint: 'select-model',
    message: 'Selected Token API model is unavailable on connector.',
  };
}

export function areDistillRoutesReady(
  bindings: Pick<DistillRouteBindingMap, 'coarse' | 'fine'>,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): boolean {
  return (
    evaluateRouteBindingReadiness(bindings.coarse, routeOptions).ready
    && evaluateRouteBindingReadiness(bindings.fine, routeOptions).ready
  );
}

function mapActionHintForEmbedding(
  _actionHint: RouteReadinessResult['actionHint'],
): EmbeddingReadinessResult['actionHint'] {
  // Embedding route readiness keeps a single retry action per spec contract.
  return 'retry';
}

export function evaluateEmbeddingReadiness(input: {
  snapshot: WorldStudioWorkspaceSnapshot;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
}): EmbeddingReadinessResult {
  const lorebooksCount = Array.isArray(input.snapshot.lorebooksDraft) ? input.snapshot.lorebooksDraft.length : 0;
  if (lorebooksCount === 0) {
    return {
      healthy: true,
      reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_NOT_REQUIRED,
      actionHint: 'none',
      message: 'No lorebooks available for embedding index.',
    };
  }

  const routeReadiness = evaluateRouteBindingReadiness(
    input.runtimeDefaultRouteBinding,
    input.routeOptions,
  );
  if (!routeReadiness.ready) {
    return {
      healthy: false,
      reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_ROUTE_UNREADY,
      actionHint: mapActionHintForEmbedding(routeReadiness.actionHint),
      message: routeReadiness.message,
    };
  }

  const embeddingIndex = input.snapshot.embeddingIndex;
  const entryCount = Object.keys(embeddingIndex.entries || {}).length;
  if (embeddingIndex.status === 'building') {
    return {
      healthy: true,
      reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_BUILDING,
      actionHint: 'none',
      message: 'Embedding index is building.',
    };
  }
  if (embeddingIndex.status === 'ready' && entryCount > 0) {
    return {
      healthy: true,
      reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_READY,
      actionHint: 'none',
      message: 'Embedding index is ready.',
    };
  }
  if (embeddingIndex.status === 'failed') {
    return {
      healthy: false,
      reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_BUILD_FAILED,
      actionHint: 'retry',
      message: embeddingIndex.errorMessage || 'Embedding index build failed.',
    };
  }
  return {
    healthy: false,
    reasonCode: ReasonCode.WORLD_STUDIO_EMBEDDING_NOT_BUILT,
    actionHint: 'retry',
    message: 'Embedding index is not built yet.',
  };
}
