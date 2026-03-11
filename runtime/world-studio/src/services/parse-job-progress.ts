import type { WorldStudioParseJobState } from '../contracts.js';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function resolveParseJobProcessed(parseJob: WorldStudioParseJobState): number {
  const derived = (Number(parseJob.chunkCompleted) || 0) + (Number(parseJob.chunkFailed) || 0);
  return Math.max(0, Number(parseJob.chunkProcessed) || derived);
}

export function resolveParseJobVisibleProgress(parseJob: WorldStudioParseJobState): number {
  const total = Math.max(0, Number(parseJob.chunkTotal) || 0);
  if (total > 0 && (parseJob.phase === 'ingest' || parseJob.phase === 'extract' || parseJob.phase === 'merge')) {
    const processed = Math.min(total, resolveParseJobProcessed(parseJob));
    return clamp01(processed / total);
  }
  if (parseJob.phase === 'done') return 1;
  return clamp01(Number(parseJob.progress) || 0);
}
