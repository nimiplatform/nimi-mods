import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';

type MissingDependencySample = {
  eventId: string;
  dependencyId: string;
};

type EventGraphEditorHeaderProps = {
  title: string;
  readonly?: boolean;
  primaryCount: number;
  secondaryCount: number;
  missingEvidencePrimaryCount: number;
  selectedTitle: string;
  canAddSecondary: boolean;
  canRepairSecondaryParents: boolean;
  canPruneInvalidDependencies: boolean;
  diagnosticsHasIssues: boolean;
  diagnosticsIssueLines: string[];
  missingDependencySample?: MissingDependencySample | null;
  onAddPrimary: () => void;
  onAddSecondary: () => void;
  onApplyEvidenceTemplate: () => void;
  onRepairSecondaryParents: () => void;
  onPruneInvalidDependencies: () => void;
};

export function EventGraphEditorHeader(props: EventGraphEditorHeaderProps) {
  const { t } = useModTranslation('world-studio');
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
        {!props.readonly ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
              onClick={props.onAddPrimary}
            >
              {t('eventGraphEditor.addPrimaryEvent')}
            </button>
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
              disabled={!props.canAddSecondary}
              onClick={props.onAddSecondary}
            >
              {t('eventGraphEditor.addSecondaryEvent')}
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <div className="ui-sync-metric-card px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('eventGraphEditor.primary')}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{props.primaryCount}</p>
        </div>
        <div className="ui-sync-metric-card px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('eventGraphEditor.secondary')}</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{props.secondaryCount}</p>
        </div>
        <div className="ui-sync-metric-card px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('eventGraphEditor.primaryMissingEvidence')}</p>
          <p className={`mt-1 text-sm font-semibold ${props.missingEvidencePrimaryCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {props.missingEvidencePrimaryCount}
          </p>
        </div>
        <div className="ui-sync-metric-card px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('eventGraphEditor.selected')}</p>
          <p className="mt-1 truncate text-sm font-semibold text-gray-900">{props.selectedTitle || '-'}</p>
        </div>
      </div>
      {!props.readonly ? (
        <div className="ui-sync-toolbar mt-3 p-2.5">
          <p className="text-xs font-semibold text-gray-700">{t('eventGraphEditor.batchRepair')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
              onClick={props.onApplyEvidenceTemplate}
              disabled={props.missingEvidencePrimaryCount === 0}
            >
              {t('eventGraphEditor.fillMissingEvidence')}
            </button>
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
              onClick={props.onRepairSecondaryParents}
              disabled={!props.canRepairSecondaryParents}
            >
              {t('eventGraphEditor.repairSecondaryParents')}
            </button>
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
              onClick={props.onPruneInvalidDependencies}
              disabled={!props.canPruneInvalidDependencies}
            >
              {t('eventGraphEditor.pruneInvalidDependencies')}
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={`ui-sync-alert mt-3 p-2.5 ${
          props.diagnosticsHasIssues
            ? 'ui-sync-alert-warning border-amber-200 bg-amber-50'
            : 'ui-sync-alert-success border-emerald-200 bg-emerald-50'
        }`}
      >
        <p
          className={`text-xs font-semibold ${
            props.diagnosticsHasIssues ? 'text-amber-700' : 'text-emerald-700'
          }`}
        >
          {t('eventGraphEditor.diagnostics')} {props.diagnosticsHasIssues ? `· ${t('eventGraphEditor.actionRequired')}` : `· ${t('eventGraphEditor.healthy')}`}
        </p>
        {props.diagnosticsHasIssues ? (
          <div className="mt-1 space-y-1">
            {props.diagnosticsIssueLines.map((line) => (
              <p key={`event-graph-diag-${line}`} className="text-[11px] text-amber-700">
                {line}
              </p>
            ))}
            {props.missingDependencySample ? (
              <p className="text-[11px] text-amber-700">
                {t('eventGraphEditor.missingDependencySample', {
                  eventId: props.missingDependencySample.eventId,
                  dependencyId: props.missingDependencySample.dependencyId,
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-emerald-700">
            {t('eventGraphEditor.healthyHint')}
          </p>
        )}
      </div>
    </>
  );
}
