import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { createMintYouFlowId, emitMintYouLog } from '../logging.js';

export async function registerMintYouDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient: _hookClient } = input;
  const flowId = createMintYouFlowId('mint-you-data-registrar');

  emitMintYouLog({
    level: 'debug',
    message: 'action:data-registrar:init',
    flowId,
    source: 'registerMintYouDataCapabilities',
  });

  // mint-you consumes:
  //   data.query.data-api.creator.agents.create   — provided by host runtime
  //   data.query.data-api.world.access.me         — provided by host runtime
  //   data.query.data-api.world.oasis.get         — provided by host runtime
  // No custom data handlers needed for these capabilities.

  // TODO: hook.agent-profile.read — photo access control interception.
  // Blocked on platform dispatch point for agent profile reads.
  // When available, register a data handler here that filters
  // referenceImageUrl based on photo authorization state.

  emitMintYouLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerMintYouDataCapabilities',
  });
}
