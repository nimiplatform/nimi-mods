import React from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { EvidenceEditor } from '../shared/evidence-editor.js';
import { RelationEditor } from '../shared/relation-editor.js';

type EventDetailDrawerProps = {
  event: EventNodeDraft;
  onChange: (next: EventNodeDraft) => void;
  onDelete: () => void;
  sourceContextText?: string;
};

export function EventDetailDrawer(props: EventDetailDrawerProps) {
  const missingEvidence = props.event.level === 'PRIMARY' && props.event.evidenceRefs.length === 0;
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
      needsEvidence: props.event.level === 'PRIMARY' && nextEvidence.length === 0,
    });
  };

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          Event Details
        </h4>
        <button
          type="button"
          className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700"
          onClick={props.onDelete}
        >
          Delete
        </button>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Level</span>
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.event.level}
            onChange={(event) => props.onChange({
              ...props.event,
              level: event.target.value === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
            })}
          >
            <option value="PRIMARY">PRIMARY</option>
            <option value="SECONDARY">SECONDARY</option>
          </select>
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Time Ref</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.event.timeRef}
            onChange={(event) => props.onChange({
              ...props.event,
              timeRef: event.target.value,
            })}
            placeholder="e.g. 2008-01 / era:crisis"
          />
        </label>
      </div>
      <label className="mt-2 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">Title</span>
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
        <span className="mb-1 block font-medium">Summary</span>
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
          <span className="mb-1 block font-medium">Cause</span>
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
          <span className="mb-1 block font-medium">Process</span>
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
          <span className="mb-1 block font-medium">Result</span>
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
          label="Characters"
          value={props.event.characterRefs}
          onChange={(next) => props.onChange({ ...props.event, characterRefs: next })}
          placeholder="Ye Wenjie, Wang Miao"
        />
        <RelationEditor
          label="Locations"
          value={props.event.locationRefs}
          onChange={(next) => props.onChange({ ...props.event, locationRefs: next })}
          placeholder="Red Coast Base"
        />
        <RelationEditor
          label="Dependency Event IDs"
          value={props.event.dependsOnEventIds}
          onChange={(next) => props.onChange({ ...props.event, dependsOnEventIds: next })}
          placeholder="event-id-1, event-id-2"
        />
      </div>

      <div className="mt-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
            disabled={!autoEvidenceExcerpt}
            onClick={appendAutoEvidence}
          >
            Add Evidence from Event Text
          </button>
          <p className="text-[11px] text-gray-500">
            Quickly inject summary/cause/process/result as evidence.
          </p>
        </div>
        <EvidenceEditor
          value={props.event.evidenceRefs}
          required={props.event.level === 'PRIMARY'}
          contextText={props.sourceContextText}
          onChange={(next) => props.onChange({
            ...props.event,
            evidenceRefs: next,
            needsEvidence: props.event.level === 'PRIMARY' && next.length === 0,
          })}
        />
      </div>
      {missingEvidence ? (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          Primary events require evidence refs.
        </p>
      ) : null}
    </aside>
  );
}
