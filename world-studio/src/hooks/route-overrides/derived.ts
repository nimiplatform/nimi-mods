import { useMemo } from 'react';
import type {
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { DistillRouteBindingMap } from '../../generation/pipeline.js';
import type { WorldStudioWorkspaceSnapshot } from '../../contracts.js';
import { formatRouteBindingSummary } from '../../services/mutation-payload.js';
import { evaluateEmbeddingReadiness, evaluateRouteBindingReadiness } from './readiness.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

export function useWorldStudioRouteBindingDerived(input: {
  bindingMap: DistillRouteBindingMap;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  snapshot: WorldStudioWorkspaceSnapshot;
}) {
  const effectiveCoarseRouteBinding = useMemo(
    () => input.bindingMap.coarse || input.runtimeDefaultRouteBinding || null,
    [input.bindingMap.coarse, input.runtimeDefaultRouteBinding],
  );
  const effectiveFineRouteBinding = useMemo(
    () => input.bindingMap.fine || input.runtimeDefaultRouteBinding || null,
    [input.bindingMap.fine, input.runtimeDefaultRouteBinding],
  );
  const effectiveCoarseRouteSummary = useMemo(
    () => formatRouteBindingSummary(effectiveCoarseRouteBinding),
    [effectiveCoarseRouteBinding],
  );
  const effectiveFineRouteSummary = useMemo(
    () => formatRouteBindingSummary(effectiveFineRouteBinding),
    [effectiveFineRouteBinding],
  );

  const activeCoarseRouteSource = effectiveCoarseRouteBinding?.source || 'local';
  const activeCoarseRouteConnectorId = effectiveCoarseRouteBinding?.connectorId || '';
  const activeFineRouteSource = effectiveFineRouteBinding?.source || 'local';
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

  const coarseRouteModelOptions = activeCoarseRouteSource === 'local'
    ? (input.routeOptions?.local.models.map((model) => model.model) || [])
    : (activeCoarseRouteConnector?.models || []);
  const fineRouteModelOptions = activeFineRouteSource === 'local'
    ? (input.routeOptions?.local.models.map((model) => model.model) || [])
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
      : ReasonCode.WORLD_STUDIO_ROUTE_READY;
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
