export type RetryScope = 'all' | 'json' | 'coarse' | 'fine';

export type TerminalChunkTask = {
  chunkIndex: number;
  status: 'success' | 'failed';
  stage?: string;
  errorCode?: string;
  errorMessage?: string;
};

export function toTerminalChunkTaskMap(
  tasks: TerminalChunkTask[],
  totalChunks: number,
): Map<number, TerminalChunkTask> {
  const map = new Map<number, TerminalChunkTask>();
  tasks.forEach((task) => {
    const existing = map.get(task.chunkIndex);
    if (!existing) {
      map.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      map.set(task.chunkIndex, task);
    }
  });
  for (let index = 0; index < totalChunks; index += 1) {
    if (!map.has(index)) {
      map.set(index, {
        chunkIndex: index,
        status: 'failed',
        stage: 'coarse',
        errorCode: 'WORLD_STUDIO_UNKNOWN_CHUNK_STATE',
      });
    }
  }
  return map;
}

export function toFailedChunkIndices(
  tasks: TerminalChunkTask[],
  totalChunks: number,
  retryScope: RetryScope,
  retryErrorCode?: string | null,
): number[] {
  const statusMap = toTerminalChunkTaskMap(tasks, totalChunks);
  const failed: number[] = [];
  const matchesScope = (task: { stage?: string; errorCode?: string; errorMessage?: string }) => {
    if (retryErrorCode && String(task.errorCode || '').trim() !== String(retryErrorCode).trim()) {
      return false;
    }
    if (retryScope === 'all') return true;
    const stage = String(task.stage || '').toLowerCase();
    const code = String(task.errorCode || '').toLowerCase();
    const message = String(task.errorMessage || '').toLowerCase();
    if (retryScope === 'coarse') return stage === 'coarse' || code.includes('coarse');
    if (retryScope === 'fine') return stage === 'fine' || code.includes('fine');
    return (
      code.includes('json')
      || code.includes('parse')
      || message.includes('json')
      || message.includes('parse')
    );
  };
  for (let index = 0; index < totalChunks; index += 1) {
    const task = statusMap.get(index);
    if (task && task.status !== 'success' && matchesScope(task)) {
      failed.push(index);
    }
  }
  return failed;
}

export function toHandleFragment(input: string): string {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return normalized || 'character';
}
