import { parseRuntimeRouteOptions, type ModRuntimeClient, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod';
import type { AgentCaptureRouteState } from '../types.js';

function hasText(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

export function isRouteBindingAvailable(
  binding: RuntimeRouteBinding | null | undefined,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): boolean {
  if (!binding) {
    return true;
  }
  if (!routeOptions) {
    return false;
  }
  if (binding.source === 'local') {
    if (!hasText(binding.model)) {
      return false;
    }
    const localModels = routeOptions.local?.models || [];
    return Boolean(localModels.find((item) => item.model === binding.model || item.localModelId === binding.localModelId));
  }
  if (!hasText(binding.connectorId) || !hasText(binding.model)) {
    return false;
  }
  const connector = routeOptions.connectors.find((item) => item.id === binding.connectorId) || null;
  if (!connector) {
    return false;
  }
  return connector.models.length === 0 || connector.models.includes(binding.model);
}

export function sanitizeRouteStateAgainstSnapshots(input: {
  routeState: AgentCaptureRouteState;
  textRouteOptions: RuntimeRouteOptionsSnapshot | null;
  imageRouteOptions: RuntimeRouteOptionsSnapshot | null;
}): { routeState: AgentCaptureRouteState; changed: boolean } {
  const nextRouteState: AgentCaptureRouteState = {
    textRouteBinding: isRouteBindingAvailable(input.routeState.textRouteBinding, input.textRouteOptions)
      ? input.routeState.textRouteBinding
      : null,
    imageRouteBinding: isRouteBindingAvailable(input.routeState.imageRouteBinding, input.imageRouteOptions)
      ? input.routeState.imageRouteBinding
      : null,
  };
  const changed = nextRouteState.textRouteBinding !== input.routeState.textRouteBinding
    || nextRouteState.imageRouteBinding !== input.routeState.imageRouteBinding;
  return {
    routeState: nextRouteState,
    changed,
  };
}

export async function loadRouteOptionsSnapshot(
  runtimeClient: ModRuntimeClient,
  capability: 'text.generate' | 'image.generate',
): Promise<RuntimeRouteOptionsSnapshot | null> {
  const payload = await runtimeClient.route.listOptions({ capability });
  return parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
}

export async function sanitizeRouteStateAgainstRuntime(
  runtimeClient: ModRuntimeClient,
  routeState: AgentCaptureRouteState,
  options?: { includeText?: boolean; includeImage?: boolean },
): Promise<{ routeState: AgentCaptureRouteState; changed: boolean }> {
  const includeText = options?.includeText !== false;
  const includeImage = options?.includeImage !== false;
  const [textRouteOptions, imageRouteOptions] = await Promise.all([
    includeText ? loadRouteOptionsSnapshot(runtimeClient, 'text.generate') : Promise.resolve(null),
    includeImage ? loadRouteOptionsSnapshot(runtimeClient, 'image.generate') : Promise.resolve(null),
  ]);
  const sanitized = sanitizeRouteStateAgainstSnapshots({
    routeState,
    textRouteOptions,
    imageRouteOptions,
  });
  if (includeText && includeImage) {
    return sanitized;
  }
  const nextRouteState: AgentCaptureRouteState = {
    textRouteBinding: includeText ? sanitized.routeState.textRouteBinding : routeState.textRouteBinding,
    imageRouteBinding: includeImage ? sanitized.routeState.imageRouteBinding : routeState.imageRouteBinding,
  };
  const changed = nextRouteState.textRouteBinding !== routeState.textRouteBinding
    || nextRouteState.imageRouteBinding !== routeState.imageRouteBinding;
  return {
    routeState: nextRouteState,
    changed,
  };
}
