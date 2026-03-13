import React from 'react';
import type {
  WorldStudioCreateDisplayStage,
  WorldStudioCreateStageAccess,
} from '../../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../../i18n/messages.js';

const STAGES: Array<{
  value: WorldStudioCreateDisplayStage;
  label: string;
}> = [
  { value: 'IMPORT', label: worldStudioMessage('stage.import', 'Import') },
  { value: 'CURATE', label: worldStudioMessage('stage.curate', 'Curate') },
  { value: 'GENERATE', label: worldStudioMessage('stage.generate', 'Generate') },
  { value: 'REVIEW', label: worldStudioMessage('stage.review', 'Review') },
];

export function CreateStageNav(props: {
  activeStage: WorldStudioCreateDisplayStage;
  stageAccess: WorldStudioCreateStageAccess;
  onSelectStage: (stage: WorldStudioCreateDisplayStage) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2.5">
      {STAGES.map((stage) => {
        const state = props.stageAccess[stage.value];
        const disabled = !state.enabled;
        return (
          <button
            key={stage.value}
            type="button"
            disabled={disabled}
            title={state.reason || undefined}
            onClick={() => props.onSelectStage(stage.value)}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
              props.activeStage === stage.value
                ? 'border-teal-200 bg-gradient-to-r from-[#ecfaf6] to-[#f5fbff] text-teal-700 shadow-[0_8px_22px_rgba(20,184,166,0.12)]'
                : disabled
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-slate-700 shadow-sm'
            }`}
          >
            <div>
              <p className="text-sm font-semibold">{stage.label}</p>
              {state.reason && disabled ? (
                <p className="mt-1 text-[11px] font-medium text-gray-400">{state.reason}</p>
              ) : null}
            </div>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {stage.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
