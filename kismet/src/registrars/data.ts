import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { createKismetFlowId, emitKismetLog } from '../logging.js';

export async function registerKismetDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient: _hookClient } = input;
  const flowId = createKismetFlowId('kismet-data-registrar');

  emitKismetLog({
    level: 'debug',
    message: 'action:data-registrar:init',
    flowId,
    source: 'registerKismetDataCapabilities',
  });

  // Kismet only consumes runtime.route.* and runtime.ai.* from the host runtime.
  // It does not register custom data handlers.

  emitKismetLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerKismetDataCapabilities',
  });
}
