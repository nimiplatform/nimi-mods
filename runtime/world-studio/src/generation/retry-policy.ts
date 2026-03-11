import type { ChunkTaskResult } from '../engine/types.js';

const FAILURE_SUMMARY_LIMIT = 8;

export function toFailureSummary(chunkTasks: ChunkTaskResult[], totalChunks: number): string {
  const terminalStatus = new Map<number, ChunkTaskResult>();
  chunkTasks.forEach((task) => {
    const existing = terminalStatus.get(task.chunkIndex);
    if (!existing) {
      terminalStatus.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      terminalStatus.set(task.chunkIndex, task);
    }
  });
  const failed = Array.from(terminalStatus.values()).filter((item) => item.status === 'failed');
  const details = failed
    .slice(0, FAILURE_SUMMARY_LIMIT)
    .map((item) => `#${item.chunkIndex + 1} [${item.stage}] ${item.errorCode || item.errorMessage || 'unknown error'}`)
    .join(' | ');
  return `failed ${failed.length}/${totalChunks}${details ? ` | ${details}` : ''}`;
}

export async function runWithConcurrency<TStopReason extends string = never>(
  indices: number[],
  maxConcurrency: number,
  worker: (index: number, position: number) => Promise<void>,
  options?: {
    shouldStop?: () => TStopReason | null;
  },
): Promise<TStopReason | null> {
  if (indices.length === 0) return null;
  const safeConcurrency = Math.max(1, Math.min(maxConcurrency, indices.length));
  let cursor = 0;
  let stopReason: TStopReason | null = null;
  const takeNext = (): { index: number; position: number } | null => {
    if (stopReason) return null;
    const reason = options?.shouldStop?.() || null;
    if (reason) {
      stopReason = reason;
      return null;
    }
    if (cursor >= indices.length) return null;
    const position = cursor;
    const index = indices[cursor];
    cursor += 1;
    if (typeof index !== 'number') return null;
    return { index, position };
  };
  const runners = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const next = takeNext();
      if (!next) break;
      await worker(next.index, next.position);
      if (!stopReason) {
        const reason = options?.shouldStop?.() || null;
        if (reason) {
          stopReason = reason;
        }
      }
    }
  });
  await Promise.all(runners);
  return stopReason;
}
