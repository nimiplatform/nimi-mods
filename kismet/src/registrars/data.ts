import type { HookClient } from '@nimiplatform/mod-sdk/types';
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

  // Kismet only consumes data.query.data-api.runtime.route.options
  // which is provided by the host runtime - no custom data handlers needed.

  emitKismetLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerKismetDataCapabilities',
  });
}
