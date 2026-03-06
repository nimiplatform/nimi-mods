import React from 'react';
import type { WorldStudioKnowledgeGraphDraft } from '../../../contracts.js';

function PreviewList(props: {
  title: string;
  items: unknown[];
  emptyText: string;
  renderItem: (item: Record<string, unknown>, index: number) => React.ReactNode;
}) {
  return (
    <div className="ui-sync-card p-3">
      <h4 className="text-xs font-semibold text-gray-900">{props.title}</h4>
      <div className="mt-2 space-y-2">
        {props.items.length === 0 ? (
          <p className="text-xs text-gray-500">{props.emptyText}</p>
        ) : (
          props.items.slice(0, 8).map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            return (
              <div key={`${props.title}-${index}`} className="ui-sync-soft-card px-2 py-1.5">
                {props.renderItem(item as Record<string, unknown>, index)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function Phase1PreviewGrid(props: { graph: WorldStudioKnowledgeGraphDraft }) {
  const primaryEvents = props.graph.events.primary || [];
  const secondaryEvents = props.graph.events.secondary || [];

  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-2">
      <PreviewList
        title="Event Graph (Primary -> Secondary)"
        items={primaryEvents}
        emptyText="Primary events have not been extracted yet."
        renderItem={(item, index) => {
          const eventId = String(item.id || `Primary Event ${index + 1}`);
          const children = secondaryEvents.filter((child) => String(child.parentEventId || '') === eventId);
          const evidenceCount = Array.isArray(item.evidenceRefs) ? item.evidenceRefs.length : 0;
          return (
            <>
              <p className="text-xs font-medium text-gray-900">{String(item.title || `Primary Event ${index + 1}`)}</p>
              <p className="mt-0.5 text-[11px] text-gray-600">{String(item.summary || item.cause || '')}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  evidenceCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  Evidence {evidenceCount}
                </span>
                <span className="ui-sync-pill rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                  Secondary {children.length}
                </span>
              </div>
            </>
          );
        }}
      />
      <PreviewList
        title="Primary Events"
        items={primaryEvents}
        emptyText="Primary events have not been extracted yet."
        renderItem={(item, index) => (
          <>
            <p className="text-xs font-medium text-gray-900">{String(item.title || `Primary Event ${index + 1}`)}</p>
            <p className="mt-0.5 text-[11px] text-gray-600">{String(item.summary || item.cause || '')}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">Evidence: {Array.isArray(item.evidenceRefs) ? item.evidenceRefs.length : 0}</p>
          </>
        )}
      />
      <PreviewList
        title="Secondary Events"
        items={secondaryEvents}
        emptyText="Secondary events have not been extracted yet."
        renderItem={(item, index) => (
          <>
            <p className="text-xs font-medium text-gray-900">{String(item.title || `Secondary Event ${index + 1}`)}</p>
            <p className="mt-0.5 text-[11px] text-gray-600">{String(item.summary || item.cause || '')}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">Parent Event: {String(item.parentEventId || '-')}</p>
          </>
        )}
      />
      <PreviewList
        title="Timeline"
        items={props.graph.timeline}
        emptyText="Timeline nodes have not been extracted yet."
        renderItem={(item, index) => (
          <>
            <p className="text-xs font-medium text-gray-900">{String(item.label || item.time || `Timeline ${index + 1}`)}</p>
            <p className="mt-0.5 text-[11px] text-gray-600">{String(item.description || '')}</p>
          </>
        )}
      />
      <PreviewList
        title="Characters"
        items={props.graph.characters}
        emptyText="Characters have not been extracted yet."
        renderItem={(item, index) => (
          <>
            <p className="text-xs font-medium text-gray-900">{String(item.name || `Character ${index + 1}`)}</p>
            <p className="mt-0.5 text-[11px] text-gray-600">{String(item.summary || '')}</p>
          </>
        )}
      />
    </div>
  );
}
