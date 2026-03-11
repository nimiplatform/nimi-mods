import React from 'react';

type EventGraphEditorInspectorProps = {
  missingDependencyCount: number;
  selfReferenceCount: number;
  cycleNodeCount: number;
  orphanSecondaryCount: number;
  missingDependencySampleText: string;
  cycleNodeSampleText: string;
};

export function EventGraphEditorInspector(props: EventGraphEditorInspectorProps) {
  const hasIssues = props.missingDependencyCount > 0
    || props.selfReferenceCount > 0
    || props.cycleNodeCount > 0
    || props.orphanSecondaryCount > 0;

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">Dependency Diagnostics</p>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          hasIssues ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
        }`}>
          {hasIssues ? 'Issues' : 'Healthy'}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700">
          Missing deps: {props.missingDependencyCount}
        </div>
        <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700">
          Self refs: {props.selfReferenceCount}
        </div>
        <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700">
          Cycles: {props.cycleNodeCount}
        </div>
        <div className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700">
          Orphan secondary: {props.orphanSecondaryCount}
        </div>
      </div>
      {props.missingDependencySampleText ? (
        <p className="mt-2 text-[11px] text-amber-800">
          Missing reference sample: {props.missingDependencySampleText}
        </p>
      ) : null}
      {props.cycleNodeSampleText ? (
        <p className="mt-1 text-[11px] text-amber-800">
          Cycle node sample: {props.cycleNodeSampleText}
        </p>
      ) : null}
    </div>
  );
}
