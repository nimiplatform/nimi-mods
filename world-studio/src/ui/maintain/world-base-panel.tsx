import React from 'react';
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';

type WorldBasePanelProps = {
  worldPatch: Record<string, unknown>;
  onWorldPatchChange: (value: Record<string, unknown>) => void;
};

function updateWorld(
  raw: Record<string, unknown>,
  patch: (next: Record<string, unknown>) => void,
): Record<string, unknown> {
  const next = { ...(raw || {}) };
  patch(next);
  return next;
}

export function WorldBasePanel(props: WorldBasePanelProps) {
  const world = props.worldPatch || {};
  const worldPatchText = JSON.stringify(world, null, 2);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">World Base</h3>
      <p className="mt-1 text-xs text-gray-500">Structured editor for core world settings.</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Name</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.name || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.name = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">Time Flow Ratio</span>
          <input
            type="number"
            step="0.1"
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={Number.isFinite(Number(world.timeFlowRatio)) ? Number(world.timeFlowRatio) : 1}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.timeFlowRatio = Number(event.target.value) || 1;
            }))}
          />
        </label>
      </div>

      <label className="mt-3 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">Description</span>
        <textarea
          className="h-20 w-full rounded-md border border-gray-300 p-2 text-xs"
          value={String(world.description || '')}
          onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.description = event.target.value;
          }))}
        />
      </label>
      <label className="mt-3 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">Lore</span>
        <textarea
          className="h-24 w-full rounded-md border border-gray-300 p-2 text-xs"
          value={String(world.lore || '')}
          onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.lore = event.target.value;
          }))}
        />
      </label>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
        <KeyValueObjectEditor
          label="rules"
          value={world.rules && typeof world.rules === 'object' && !Array.isArray(world.rules)
            ? (world.rules as Record<string, unknown>)
            : {}}
          onChange={(nextRules) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.rules = nextRules;
          }))}
        />
      </div>

      <details className="mt-3 rounded border border-gray-200 bg-gray-50 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">Raw JSON (Debug)</summary>
        <textarea
          className="mt-2 h-52 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600"
          value={worldPatchText}
          readOnly
        />
      </details>
    </section>
  );
}
