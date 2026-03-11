import React from 'react';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import { parseRuntimeRouteOptions } from '@nimiplatform/sdk/mod/runtime-route';
import {
  CAPABILITIES,
  type CapabilityId,
  type CapabilityState,
  type CapabilityStates,
  type DiagnosticsInfo,
} from './types.js';
import {
  ensureRouteOptionsSnapshotShape,
  linkedRouteCapabilityIds,
  routeCapabilityFor,
} from './route.js';

export function makeEmptyDiagnostics(): DiagnosticsInfo {
  return { requestParams: null, resolvedRoute: null, responseMetadata: null };
}

export function makeInitialCapabilityState(): CapabilityState {
  return {
    snapshot: null,
    binding: null,
    routeLoading: false,
    routeError: '',
    result: 'idle',
    output: null,
    rawResponse: '',
    busy: false,
    busyLabel: '',
    error: '',
    diagnostics: makeEmptyDiagnostics(),
  };
}

export function makeInitialCapabilityStates(): CapabilityStates {
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [capability.id, makeInitialCapabilityState()]),
  ) as CapabilityStates;
}

export async function loadRouteSnapshot(input: {
  runtimeClient: ModRuntimeClient;
  capabilityId: CapabilityId;
  setStates: React.Dispatch<React.SetStateAction<CapabilityStates>>;
}): Promise<void> {
  const { runtimeClient, capabilityId, setStates } = input;
  const targetCapability = routeCapabilityFor(capabilityId);
  if (!targetCapability) {
    return;
  }
  const linkedIds = linkedRouteCapabilityIds(capabilityId);
  setStates((prev) => ({
    ...prev,
    ...Object.fromEntries(linkedIds.map((id) => [
      id,
      { ...prev[id], routeLoading: true, routeError: '' },
    ])),
  }));
  try {
    const snapshot = ensureRouteOptionsSnapshotShape(
      parseRuntimeRouteOptions(await runtimeClient.route.listOptions({
        capability: targetCapability,
      }), {
        includeResolvedDefault: true,
      }),
    );
    if (!snapshot) {
      throw new Error('TEST_AI_ROUTE_OPTIONS_INVALID');
    }
    setStates((prev) => ({
      ...prev,
      ...Object.fromEntries(linkedIds.map((id) => [
        id,
        { ...prev[id], snapshot, routeLoading: false, routeError: '' },
      ])),
    }));
  } catch (error) {
    setStates((prev) => ({
      ...prev,
      ...Object.fromEntries(linkedIds.map((id) => [
        id,
        {
          ...prev[id],
          routeLoading: false,
          routeError: error instanceof Error ? error.message : String(error || 'Failed to load route options.'),
        },
      ])),
    }));
  }
}
