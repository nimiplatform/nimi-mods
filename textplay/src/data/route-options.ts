import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import {
  TEXTPLAY_REASON,
} from '../contracts.js';
import { TextplayPipelineError } from '../pipeline/error.js';

export type TextplayRouteAvailability = {
  source: string;
  connectorId: string;
  model: string;
};

export async function queryTextplayChatRouteOptions(input: {
  runtimeClient: ModRuntimeClient['route'];
}): Promise<RuntimeRouteOptionsSnapshot> {
  return input.runtimeClient.listOptions({
    capability: 'text.generate',
  }).catch((error) => {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: 'Switch to an available route source and retry.',
      message: error instanceof Error ? error.message : String(error || ''),
      stage: 'route',
      retryClass: 'retryable',
    });
  });
}

export async function assertTextplayChatRouteAvailable(input: {
  runtimeClient: ModRuntimeClient['route'];
}): Promise<TextplayRouteAvailability> {
  const parsed = await queryTextplayChatRouteOptions(input);
  return {
    source: parsed.selected.source,
    connectorId: parsed.selected.connectorId,
    model: parsed.selected.model,
  };
}
