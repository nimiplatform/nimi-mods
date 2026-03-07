import type { ChunkTaskResult } from '../../../contracts.js';

type SourceInputDiagnosticsProps = {
  chunkTasks: ChunkTaskResult[];
  retryErrorCode?: string | null;
  onRunFailedChunksByErrorCode?: (errorCode: string) => void;
  onClearRetryErrorCode?: () => void;
  working: boolean;
};

function recommendAction(errorCodeOrMessage: string): string {
  const normalized = String(errorCodeOrMessage || '').toLowerCase();
  if (normalized.includes('encoding') || normalized.includes('utf') || normalized.includes('gb')) {
    return 'Try switching source file encoding (UTF-8 / GB18030 / UTF-16LE).';
  }
  if (normalized.includes('json') || normalized.includes('parse')) {
    return 'Retry failed chunks using Fine route, or lower concurrency to 1.';
  }
  if (normalized.includes('context_overflow') || normalized.includes('context window') || normalized.includes('maximum context length')) {
    return 'Auto-shrunk chunks were triggered; if it still fails, switch to a model with larger context.';
  }
  if (normalized.includes('coarse')) {
    return 'Enable Fine-route retry for failed chunks.';
  }
  if (normalized.includes('fine')) {
    return 'Switch Fine route to a stronger structured-output model.';
  }
  if (
    normalized.includes('provider_internal')
    || normalized.includes('ai_output_invalid')
    || normalized.includes('runtime_bridge_unary')
    || normalized.includes('missing required key payload')
  ) {
    return 'Provider internal error detected. Retry failed chunks after checking runtime bridge and provider health.';
  }
  if (normalized.includes('timeout') || normalized.includes('network')) {
    return 'Retry failed chunks; if repeated failures occur, lower concurrency and retry.';
  }
  return 'Retry failed chunks and review diagnostics before next synthesis.';
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

function buildDiagnosticsReport(
  phase: string,
  completed: number,
  total: number,
  failedTasks: ChunkTaskResult[],
  failedByCode: Array<[string, number]>,
  recoveredChunkCount: number,
) {
  const lines: string[] = [];
  lines.push(`phase=${phase}`);
  lines.push(`chunks=${completed}/${total}`);
  lines.push(`terminal_failed=${failedTasks.length}`);
  lines.push(`fallback_recovered=${recoveredChunkCount}`);
  if (failedByCode.length > 0) {
    lines.push('failed_by_code:');
    failedByCode.forEach(([code, count]) => lines.push(`- ${code}: ${count}`));
  }
  if (failedTasks.length > 0) {
    lines.push('failed_chunks:');
    failedTasks.forEach((task) => {
      lines.push(
        `- #${task.chunkIndex + 1} [${task.stage}] retry=${task.retryCount} ${task.errorCode || task.errorMessage || 'failed'}`,
      );
    });
  }
  return lines.join('\n');
}

export function SourceInputDiagnostics(props: SourceInputDiagnosticsProps) {
  const terminalChunkMap = buildTerminalChunkMap(props.chunkTasks);
  const failedTasks = Array.from(terminalChunkMap.values())
    .filter((item) => item.status === 'failed')
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .slice(0, 8);
  const recoveredTasks = props.chunkTasks
    .filter((item) => {
      if (item.status !== 'success') return false;
      const code = String(item.errorCode || '');
      return code.includes('HEURISTIC_FALLBACK') || code.includes('HEURISTIC_ENRICH');
    })
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
  const recoveredChunkCount = new Set(recoveredTasks.map((item) => item.chunkIndex)).size;
  const recoveredPreview = recoveredTasks.slice(0, 8);
  const retriedTerminalTasks = Array.from(terminalChunkMap.values())
    .filter((item) => Number(item.retryCount || 0) > 0);
  const retriedSuccessCount = retriedTerminalTasks.filter((item) => item.status === 'success').length;
  const retriedFailedCount = retriedTerminalTasks.filter((item) => item.status === 'failed').length;
  const retriedSuccessRate = retriedTerminalTasks.length > 0
    ? Math.round((retriedSuccessCount / retriedTerminalTasks.length) * 100)
    : 0;
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
  const topFailure = failedByCode[0] || null;
  const topFailureCode = topFailure ? topFailure[0] : null;
  const topFailureCount = topFailure ? topFailure[1] : 0;
  const topFailureAction = topFailureCode ? recommendAction(topFailureCode) : null;
  const diagnosticsReport = buildDiagnosticsReport(
    'extract',
    props.chunkTasks.filter((task) => task.status === 'success' || task.status === 'failed').length,
    terminalChunkMap.size,
    failedTasks,
    failedByCode,
    recoveredChunkCount,
  );

  if (failedTasks.length === 0 && recoveredChunkCount === 0 && retriedTerminalTasks.length === 0) {
    return null;
  }

  return (
    <>
      {recoveredChunkCount > 0 ? (
        <div className="ui-sync-alert ui-sync-alert-success mt-3 p-2.5">
          <p className="text-[11px] font-semibold text-emerald-700">
            Heuristic fallback recovered {recoveredChunkCount} chunks (latest run)
          </p>
          <div className="mt-1 space-y-1">
            {recoveredPreview.map((task) => (
              <p key={`recovered-${task.stage}-${task.chunkIndex}`} className="text-[11px] text-emerald-700">
                #{task.chunkIndex + 1} [{task.stage}] {task.errorCode || 'fallback'}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {retriedTerminalTasks.length > 0 ? (
        <div className="ui-sync-alert ui-sync-alert-info mt-3 p-2.5">
          <p className="text-[11px] font-semibold text-sky-700">
            Retry result: retried {retriedTerminalTasks.length} chunks · recovered {retriedSuccessCount} · still failed {retriedFailedCount} · success rate {retriedSuccessRate}%
          </p>
        </div>
      ) : null}

      {failedTasks.length > 0 ? (
        <div className="ui-sync-alert ui-sync-alert-danger mt-3 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-red-700">Chunk Diagnostics (Terminal Failure)</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="ui-sync-btn rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(diagnosticsReport);
                  }
                }}
              >
                Copy Diagnostics
              </button>
              {props.retryErrorCode ? (
                <button
                  type="button"
                  className="ui-sync-btn rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700"
                  onClick={() => props.onClearRetryErrorCode?.()}
                >
                  Clear Error-Code Filter
                </button>
              ) : null}
            </div>
          </div>
          {props.retryErrorCode ? (
            <p className="mt-1 text-[11px] text-red-700">
              Current error-code filter: {props.retryErrorCode}
            </p>
          ) : null}
          {topFailureCode ? (
            <div className="ui-sync-card mt-1 p-2">
              <p className="text-[11px] font-semibold text-red-700">
                Suggested retry target: {topFailureCode} ({topFailureCount})
              </p>
              <p className="mt-0.5 text-[11px] text-red-700">{topFailureAction}</p>
              <button
                type="button"
                className="ui-sync-btn mt-1 rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700 disabled:opacity-60"
                disabled={props.working || !props.onRunFailedChunksByErrorCode}
                onClick={() => props.onRunFailedChunksByErrorCode?.(topFailureCode)}
              >
                Retry This Error Code
              </button>
            </div>
          ) : null}
          {failedByCode.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {failedByCode.slice(0, 8).map(([code, count]) => (
                <button
                  key={`diag-code-${code}`}
                  type="button"
                  className={`ui-sync-pill rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    props.retryErrorCode === code
                      ? 'ui-sync-status-danger border border-red-400 bg-red-200 text-red-800'
                      : 'bg-red-100 text-red-700'
                  }`}
                  onClick={() => props.onRunFailedChunksByErrorCode?.(code)}
                  title={`Retry failed chunks for this error code. ${recommendAction(code)}`}
                >
                  {code} × {count}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-1 space-y-1">
            {failedTasks.map((task) => (
              <p key={`${task.stage}-${task.chunkIndex}`} className="text-[11px] text-red-700">
                #{task.chunkIndex + 1} [{task.stage}] {task.errorCode || task.errorMessage || 'failed'}
                {' · '}
                {recommendAction(String(task.errorCode || task.errorMessage || ''))}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
