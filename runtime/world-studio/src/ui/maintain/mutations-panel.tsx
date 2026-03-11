import React from 'react';
import type { WorldMutationSummary } from '../types.js';

type MutationsPanelProps = {
  mutations: WorldMutationSummary[];
};

export function MutationsPanel(props: MutationsPanelProps) {
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">Mutation Timeline</h3>
      <p className="mt-1 text-xs text-gray-500">Audit trail for world maintenance mutations.</p>
      <div className="mt-3 max-h-[560px] space-y-2 overflow-auto">
        {props.mutations.length === 0 ? (
          <div className="text-xs text-gray-500">No mutations yet.</div>
        ) : (
          props.mutations.map((item) => (
            <article key={item.id} className="ui-sync-soft-card p-2 text-xs">
              <p className="font-medium text-gray-900">{item.mutationType}</p>
              <p className="mt-1 text-gray-600">Target: {item.targetPath}</p>
              {item.reason ? <p className="mt-1 text-gray-600">Reason: {item.reason}</p> : null}
              <p className="mt-1 text-gray-500">
                Operator {item.creatorId} · {new Date(item.createdAt).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
