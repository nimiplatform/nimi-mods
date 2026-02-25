import type { ChunkTaskResult } from '../../../contracts.js';

function recommendAction(errorCodeOrMessage: string): string {
  const normalized = String(errorCodeOrMessage || '').toLowerCase();
  if (normalized.includes('encoding') || normalized.includes('utf') || normalized.includes('gb')) {
    return 'Switch source file encoding and retry failed chunks';
  }
  if (normalized.includes('json') || normalized.includes('parse')) {
    return 'Retry JSON failures with Fine route / reduce concurrency';
  }
  if (normalized.includes('coarse')) {
    return 'Enable Fine-route retry';
  }
  if (normalized.includes('fine')) {
    return 'Switch Fine-route model and retry';
  }
  return 'Retry failed chunks from diagnostics filtering';
}

function buildTerminalChunkMap(chunkTasks: ChunkTaskResult[]) {
  const map = new Map<number, ChunkTaskResult>();
  chunkTasks.forEach((task) => {
    const existing = map.get(task.chunkIndex);
    if (!existing) {
      map.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      map.set(task.chunkIndex, task);
    }
  });
  return map;
}

export function Phase1Diagnostics(props: { chunkTasks: ChunkTaskResult[] }) {
  const terminalChunkMap = buildTerminalChunkMap(props.chunkTasks);
  const failedTasks = Array.from(terminalChunkMap.values())
    .filter((item) => item.status === 'failed')
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .slice(0, 12);
  const failedByCode = (() => {
    const counter = new Map<string, number>();
    Array.from(terminalChunkMap.values())
      .filter((item) => item.status === 'failed')
      .forEach((item) => {
        const key = String(item.errorCode || item.errorMessage || 'UNKNOWN_ERROR');
        counter.set(key, (counter.get(key) || 0) + 1);
      });
    return Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  })();

  const recoveredTasks = props.chunkTasks
    .filter((item) => item.status === 'success' && String(item.errorCode || '').includes('HEURISTIC_FALLBACK'))
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .slice(0, 12);
  const recoveredChunkCount = new Set(recoveredTasks.map((item) => item.chunkIndex)).size;

  return (
    <>
      {failedTasks.length > 0 ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">Chunk Failure Diagnostics</p>
          {failedByCode.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {failedByCode.slice(0, 8).map(([code, count]) => (
                <span key={`phase1-failed-code-${code}`} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  {code} × {count}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-2 grid gap-1">
            {failedTasks.map((task) => (
              <p key={`phase1-failed-${task.stage}-${task.chunkIndex}`} className="text-[11px] text-red-700">
                #{task.chunkIndex + 1} [{task.stage}] retry={task.retryCount} · {task.errorCode || task.errorMessage || 'failed'}
                {' · '}
                {recommendAction(String(task.errorCode || task.errorMessage || ''))}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {recoveredChunkCount > 0 ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700">Fallback Recovery Diagnostics</p>
          <div className="mt-2 grid gap-1">
            {recoveredTasks.map((task) => (
              <p key={`phase1-recovered-${task.stage}-${task.chunkIndex}`} className="text-[11px] text-emerald-700">
                #{task.chunkIndex + 1} [{task.stage}] retry={task.retryCount} · {task.errorCode || 'heuristic fallback recovered'}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
