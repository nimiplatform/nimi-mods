export type ChunkTaskLike = {
  chunkIndex: number;
  status: 'success' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type TerminalChunkOutcome = {
  chunkIndex: number;
  status: 'success' | 'failed';
  errorCode: string;
};

export type TerminalChunkSummary = {
  outcomes: TerminalChunkOutcome[];
  total: number;
  success: number;
  failed: number;
  topFailure: { code: string; count: number } | null;
};

export type ConflictReloadSummaryInput = {
  beforePrimaryCount: number;
  afterPrimaryCount: number;
  beforeSecondaryCount: number;
  afterSecondaryCount: number;
  beforeLorebookCount: number;
  afterLorebookCount: number;
  beforeSnapshotVersion: string;
  afterSnapshotVersion: string;
};

function normalizeErrorCode(input: ChunkTaskLike): string {
  return String(input.errorCode || input.errorMessage || 'UNKNOWN_ERROR');
}

export function summarizeTerminalChunkTasks(tasks: ChunkTaskLike[]): TerminalChunkSummary {
  const byChunk = new Map<number, TerminalChunkOutcome>();
  tasks.forEach((task) => {
    const next: TerminalChunkOutcome = {
      chunkIndex: task.chunkIndex,
      status: task.status === 'success' ? 'success' : 'failed',
      errorCode: normalizeErrorCode(task),
    };
    const existing = byChunk.get(task.chunkIndex);
    if (!existing) {
      byChunk.set(task.chunkIndex, next);
      return;
    }
    if (next.status === 'success' || existing.status !== 'success') {
      byChunk.set(task.chunkIndex, next);
    }
  });

  const outcomes = Array.from(byChunk.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
  const failedOutcomes = outcomes.filter((item) => item.status === 'failed');
  const successCount = outcomes.length - failedOutcomes.length;
  const failureCounter = new Map<string, number>();
  failedOutcomes.forEach((item) => {
    failureCounter.set(item.errorCode, (failureCounter.get(item.errorCode) || 0) + 1);
  });
  const top = Array.from(failureCounter.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0];

  return {
    outcomes,
    total: outcomes.length,
    success: successCount,
    failed: failedOutcomes.length,
    topFailure: top ? { code: top[0], count: top[1] } : null,
  };
}

export function formatConflictReloadSummary(input: ConflictReloadSummaryInput): string {
  const beforeSnapshot = String(input.beforeSnapshotVersion || '-');
  const afterSnapshot = String(input.afterSnapshotVersion || '-');
  return (
    `events P:${input.beforePrimaryCount}->${input.afterPrimaryCount}, `
    + `S:${input.beforeSecondaryCount}->${input.afterSecondaryCount}; `
    + `lorebooks ${input.beforeLorebookCount}->${input.afterLorebookCount}; `
    + `snapshot ${beforeSnapshot}->${afterSnapshot}`
  );
}
