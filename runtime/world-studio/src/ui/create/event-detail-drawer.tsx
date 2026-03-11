import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { EventNodeDraft } from '../../contracts.js';
import {
  deriveNeedsEvidence,
  isEvidenceRequiredForEvent,
} from '../../services/event-horizon.js';
import { EvidenceEditor } from '../shared/evidence-editor.js';
import { RelationEditor } from '../shared/relation-editor.js';

type EventDetailDrawerProps = {
  event: EventNodeDraft;
  onChange: (next: EventNodeDraft) => void;
  onDelete: () => void;
  sourceContextText?: string;
};

export function EventDetailDrawer(props: EventDetailDrawerProps) {
  const { t } = useModTranslation('world-studio');
  const missingEvidence = isEvidenceRequiredForEvent(props.event) && props.event.evidenceRefs.length === 0;
  const autoEvidenceExcerpt = [
    props.event.summary,
    props.event.cause,
    props.event.process,
    props.event.result,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 280);

  const appendAutoEvidence = () => {
    if (!autoEvidenceExcerpt) return;
    const contextText = props.sourceContextText || '';
    const matchedIndex = contextText ? contextText.indexOf(autoEvidenceExcerpt) : -1;
    const offsetStart = matchedIndex >= 0 ? matchedIndex : 0;
    const offsetEnd = matchedIndex >= 0
      ? matchedIndex + autoEvidenceExcerpt.length
      : Math.max(1, autoEvidenceExcerpt.length);
    const nextEvidence = [...props.event.evidenceRefs, {
      segmentId: props.event.id || `manual-${Date.now()}`,
      offsetStart,
      offsetEnd,
      excerpt: autoEvidenceExcerpt,
      confidence: 0.45,
      sourceType: 'text' as const,
    }];
    props.onChange({
      ...props.event,
      evidenceRefs: nextEvidence,
      needsEvidence: deriveNeedsEvidence({
        ...props.event,
        evidenceRefs: nextEvidence,
      }),
    });
  };

  return (
    <aside className="ui-sync-card ui-sync-card-inset p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          {t('eventDetail.title')}
        </h4>
        <button
          type="button"
          className="ui-sync-btn rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700"
          onClick={props.onDelete}
        >
          {t('eventDetail.delete')}
        </button>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-3">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.level')}</span>
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.event.level}
            onChange={(event) => props.onChange({
              ...props.event,
              level: event.target.value === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
              needsEvidence: deriveNeedsEvidence({
                ...props.event,
                level: event.target.value === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
              }),
            })}
          >
            <option value="PRIMARY">PRIMARY</option>
            <option value="SECONDARY">SECONDARY</option>
          </select>
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.horizon')}</span>
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.event.eventHorizon}
            onChange={(event) => {
              const eventHorizon = event.target.value === 'FUTURE'
                ? 'FUTURE'
                : event.target.value === 'ONGOING'
                  ? 'ONGOING'
                  : 'PAST';
              props.onChange({
                ...props.event,
                eventHorizon,
                needsEvidence: deriveNeedsEvidence({
                  ...props.event,
                  eventHorizon,
                }),
              });
            }}
          >
            <option value="PAST">PAST</option>
            <option value="ONGOING">ONGOING</option>
            <option value="FUTURE">FUTURE</option>
          </select>
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.timeRef')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.event.timeRef}
            onChange={(event) => props.onChange({
              ...props.event,
              timeRef: event.target.value,
            })}
            placeholder={t('eventDetail.timeRefPlaceholder')}
          />
        </label>
      </div>
      <label className="mt-2 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">{t('eventDetail.titleField')}</span>
        <input
          className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
          value={props.event.title}
          onChange={(event) => props.onChange({
            ...props.event,
            title: event.target.value,
          })}
        />
      </label>
      <label className="mt-2 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">{t('eventDetail.summary')}</span>
        <textarea
          className="h-16 w-full rounded-md border border-gray-300 p-2 text-xs"
          value={props.event.summary}
          onChange={(event) => props.onChange({
            ...props.event,
            summary: event.target.value,
          })}
        />
      </label>
      <div className="mt-2 grid gap-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.cause')}</span>
          <textarea
            className="h-14 w-full rounded-md border border-gray-300 p-2 text-xs"
            value={props.event.cause}
            onChange={(event) => props.onChange({
              ...props.event,
              cause: event.target.value,
              editableCause: event.target.value,
            })}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.process')}</span>
          <textarea
            className="h-14 w-full rounded-md border border-gray-300 p-2 text-xs"
            value={props.event.process}
            onChange={(event) => props.onChange({
              ...props.event,
              process: event.target.value,
              editableProcess: event.target.value,
            })}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventDetail.result')}</span>
          <textarea
            className="h-14 w-full rounded-md border border-gray-300 p-2 text-xs"
            value={props.event.result}
            onChange={(event) => props.onChange({
              ...props.event,
              result: event.target.value,
              editableResult: event.target.value,
            })}
          />
        </label>
      </div>

      <div className="mt-2 grid gap-2">
        <RelationEditor
          label={t('eventDetail.characters')}
          value={props.event.characterRefs}
          onChange={(next) => props.onChange({ ...props.event, characterRefs: next })}
          placeholder={t('eventDetail.charactersPlaceholder')}
        />
        <RelationEditor
          label={t('eventDetail.locations')}
          value={props.event.locationRefs}
          onChange={(next) => props.onChange({ ...props.event, locationRefs: next })}
          placeholder={t('eventDetail.locationsPlaceholder')}
        />
        <RelationEditor
          label={t('eventDetail.dependencyEventIds')}
          value={props.event.dependsOnEventIds}
          onChange={(next) => props.onChange({ ...props.event, dependsOnEventIds: next })}
          placeholder={t('eventDetail.dependencyEventIdsPlaceholder')}
        />
      </div>

      <div className="mt-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
            disabled={!autoEvidenceExcerpt}
            onClick={appendAutoEvidence}
          >
            {t('eventDetail.addEvidenceFromText')}
          </button>
          <p className="text-[11px] text-gray-500">
            {t('eventDetail.addEvidenceHint')}
          </p>
        </div>
        <EvidenceEditor
          value={props.event.evidenceRefs}
          required={props.event.level === 'PRIMARY'}
          contextText={props.sourceContextText}
          onChange={(next) => props.onChange({
            ...props.event,
            evidenceRefs: next,
            needsEvidence: deriveNeedsEvidence({
              ...props.event,
              evidenceRefs: next,
            }),
          })}
        />
      </div>
      {missingEvidence ? (
        <p className="ui-sync-alert ui-sync-alert-danger mt-2 px-2 py-1 text-[11px] text-red-700">
          {t('eventDetail.missingEvidence')}
        </p>
      ) : null}
    </aside>
  );
}
