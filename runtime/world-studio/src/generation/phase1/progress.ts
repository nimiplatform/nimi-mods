import type { WorldStudioProgressState } from '../../engine/types.js';

export function createProgressEmitter(
  startedAt: number,
  onProgress?: (state: WorldStudioProgressState) => void,
) {
  return (state: Omit<WorldStudioProgressState, 'etaSeconds'>) => {
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const processed = Math.max(0, state.chunkProcessed || state.chunkCompleted + state.chunkFailed);
    const speed = Math.max(1, processed);
    const remaining = Math.max(0, state.chunkTotal - processed);
    const etaSeconds = remaining > 0 ? Math.ceil((elapsedSec / speed) * remaining) : 0;
    onProgress?.({
      ...state,
      chunkProcessed: processed,
      etaSeconds,
    });
  };
}
