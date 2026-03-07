import type { WorldStudioParseJobState } from '../../../contracts.js';
import { resolveParseJobProcessed, resolveParseJobVisibleProgress } from '../../../services/parse-job-progress.js';

function ProgressBar(props: { progress: number }) {
  const width = `${Math.max(0, Math.min(100, Math.round(props.progress * 100)))}%`;
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className="h-2 rounded-full bg-brand-500 transition-all duration-300" style={{ width }} />
    </div>
  );
}

export function SourceInputProgressCard(props: { parseJob: WorldStudioParseJobState }) {
  const { parseJob } = props;
  const visibleProgress = resolveParseJobVisibleProgress(parseJob);
  const processed = resolveParseJobProcessed(parseJob);
  return (
    <div className="ui-sync-toolbar mt-3 p-2.5">
      <div className="mb-1 flex items-center justify-between text-[11px] text-gray-600">
        <span>Phase: {parseJob.phase}</span>
        <span>
          {processed}/{parseJob.chunkTotal} chunks · failed {parseJob.chunkFailed}
        </span>
      </div>
      <ProgressBar progress={visibleProgress} />
      <p className="mt-1 text-[11px] text-gray-500">
        ETA: {parseJob.etaSeconds == null ? '-' : `${parseJob.etaSeconds}s`}
      </p>
    </div>
  );
}
