import { useMemo } from 'react';
import type {
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/mod-sdk/runtime-route';
import type { DistillRouteOverrideMap } from '../../generation/pipeline.js';
import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { formatRouteBindingSummary } from '../../services/mutation-payload.js';
import { evaluateEmbeddingReadiness, evaluateRouteBindingReadiness } from './readiness.js';

export function useWorldStudioRouteOverrideDerived(input: {
  routeOverrideMap: DistillRouteOverrideMap;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  snapshot: WorldStudioWorkspaceSnapshot;
}) {
  const effectiveCoarseRouteBinding = useMemo(
    () => input.routeOverrideMap.coarse || input.runtimeDefaultRouteBinding || null,
    [input.routeOverrideMap.coarse, input.runtimeDefaultRouteBinding],
  );
  const effectiveFineRouteBinding = useMemo(
    () => input.routeOverrideMap.fine || input.runtimeDefaultRouteBinding || null,
    [input.routeOverrideMap.fine, input.runtimeDefaultRouteBinding],
  );
  const effectiveCoarseRouteSummary = useMemo(
    () => formatRouteBindingSummary(effectiveCoarseRouteBinding),
    [effectiveCoarseRouteBinding],
  );
  const effectiveFineRouteSummary = useMemo(
    () => formatRouteBindingSummary(effectiveFineRouteBinding),
    [effectiveFineRouteBinding],
  );

  const activeCoarseRouteSource = effectiveCoarseRouteBinding?.source || 'local-runtime';
  const activeCoarseRouteConnectorId = effectiveCoarseRouteBinding?.connectorId || '';
  const activeFineRouteSource = effectiveFineRouteBinding?.source || 'local-runtime';
  const activeFineRouteConnectorId = effectiveFineRouteBinding?.connectorId || '';

  const activeCoarseRouteConnector = useMemo(
    () => input.routeOptions?.connectors.find((item) => item.id === activeCoarseRouteConnectorId)
      || input.routeOptions?.connectors[0]
      || null,
    [activeCoarseRouteConnectorId, input.routeOptions?.connectors],
  );
  const activeFineRouteConnector = useMemo(
    () => input.routeOptions?.connectors.find((item) => item.id === activeFineRouteConnectorId)
      || input.routeOptions?.connectors[0]
      || null,
    [activeFineRouteConnectorId, input.routeOptions?.connectors],
  );

  const coarseRouteModelOptions = activeCoarseRouteSource === 'local-runtime'
    ? (input.routeOptions?.localRuntime.models.map((model) => model.model) || [])
    : (activeCoarseRouteConnector?.models || []);
  const fineRouteModelOptions = activeFineRouteSource === 'local-runtime'
    ? (input.routeOptions?.localRuntime.models.map((model) => model.model) || [])
    : (activeFineRouteConnector?.models || []);
  const coarseRouteReadiness = useMemo(
    () => evaluateRouteBindingReadiness(effectiveCoarseRouteBinding, input.routeOptions),
    [effectiveCoarseRouteBinding, input.routeOptions],
  );
  const fineRouteReadiness = useMemo(
    () => evaluateRouteBindingReadiness(effectiveFineRouteBinding, input.routeOptions),
    [effectiveFineRouteBinding, input.routeOptions],
  );
  const routeConfigReady = coarseRouteReadiness.ready && fineRouteReadiness.ready;
  const routeConfigReasonCode = !coarseRouteReadiness.ready
    ? coarseRouteReadiness.reasonCode
    : !fineRouteReadiness.ready
      ? fineRouteReadiness.reasonCode
      : 'WORLD_STUDIO_ROUTE_READY';
  const routeConfigActionHint = !coarseRouteReadiness.ready
    ? coarseRouteReadiness.actionHint
    : !fineRouteReadiness.ready
      ? fineRouteReadiness.actionHint
      : 'none';
  const embeddingReadiness = useMemo(
    () => evaluateEmbeddingReadiness({
      snapshot: input.snapshot,
      runtimeDefaultRouteBinding: input.runtimeDefaultRouteBinding,
      routeOptions: input.routeOptions,
    }),
    [input.snapshot, input.routeOptions, input.runtimeDefaultRouteBinding],
  );

  return {
    effectiveCoarseRouteBinding,
    effectiveFineRouteBinding,
    effectiveCoarseRouteSummary,
    effectiveFineRouteSummary,
    activeCoarseRouteSource,
    activeCoarseRouteConnectorId,
    activeFineRouteSource,
    activeFineRouteConnectorId,
    coarseRouteModelOptions,
    fineRouteModelOptions,
    coarseRouteReadiness,
    fineRouteReadiness,
    routeConfigReady,
    routeConfigReasonCode,
    routeConfigActionHint,
    embeddingReadiness,
  };
}
