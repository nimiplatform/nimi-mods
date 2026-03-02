import { parseRuntimeRouteOptions } from '@nimiplatform/sdk/mod/runtime-route';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_REASON,
} from '../contracts.js';
import { TextplayPipelineError } from '../pipeline/error.js';

export type TextplayRouteAvailability = {
  source: string;
  connectorId: string;
  model: string;
};

export async function assertTextplayChatRouteAvailable(input: {
  hookClient: HookClient;
}): Promise<TextplayRouteAvailability> {
  const payload = await input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
    query: {
      capability: 'chat',
      modId: TEXTPLAY_MOD_ID,
    },
  }).catch((error) => {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: 'Switch to an available route source and retry.',
      message: error instanceof Error ? error.message : String(error || ''),
      stage: 'route',
      retryClass: 'retryable',
    });
  });

  const parsed = parseRuntimeRouteOptions(payload, {
    includeResolvedDefault: true,
  });

  if (!parsed) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: 'Switch to an available route source and retry.',
      message: 'TEXTPLAY_ROUTE_OPTIONS_INVALID',
      stage: 'route',
      retryClass: 'retryable',
    });
  }

  return {
    source: parsed.selected.source,
    connectorId: parsed.selected.connectorId,
    model: parsed.selected.model,
  };
}
