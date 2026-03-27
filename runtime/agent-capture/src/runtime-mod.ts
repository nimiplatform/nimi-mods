import {
  createHookClient,
  type RuntimeModLifecycleContext,
  type RuntimeModRegistration,
} from '@nimiplatform/sdk/mod';
import { AGENT_CAPTURE_CAPABILITIES, AGENT_CAPTURE_MOD_ID } from './contracts.js';
import { emitAgentCaptureLog } from './logging.js';
import { registerAgentCaptureUiExtensions } from './registrars/ui.js';

export function createAgentCaptureRuntimeMod(): RuntimeModRegistration {
  return {
    modId: AGENT_CAPTURE_MOD_ID,
    capabilities: [...AGENT_CAPTURE_CAPABILITIES],
    isDefaultPrivateExecution: false,
    setup: async ({ sdkRuntimeContext }: RuntimeModLifecycleContext) => {
      const startedAt = performance.now();
      emitAgentCaptureLog('phase:setup:start');
      const hookClient = createHookClient(AGENT_CAPTURE_MOD_ID, sdkRuntimeContext);
      await registerAgentCaptureUiExtensions({ hookClient });
      emitAgentCaptureLog('phase:setup:done', {
        costMs: Number((performance.now() - startedAt).toFixed(2)),
      });
    },
  };
}

export const createRuntimeMod = createAgentCaptureRuntimeMod;
