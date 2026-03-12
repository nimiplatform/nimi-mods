import React from 'react';
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type WorldBasePanelProps = {
    worldPatch: Record<string, unknown>;
    onWorldPatchChange: (value: Record<string, unknown>) => void;
};
function updateWorld(raw: Record<string, unknown>, patch: (next: Record<string, unknown>) => void): Record<string, unknown> {
    const next = { ...(raw || {}) };
    patch(next);
    return next;
}
export function WorldBasePanel(props: WorldBasePanelProps) {
    const { t } = useModTranslation('world-studio');
    const world = props.worldPatch || {};
    const worldPatchText = JSON.stringify(world, null, 2);
    return (<section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('worldBase.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">{t('worldBase.description')}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.name')}</span>
          <input className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={String(world.name || '')} onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.name = event.target.value;
        }))}/>
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.timeFlowRatio')}</span>
          <input type="number" step="0.1" className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={Number.isFinite(Number(world.timeFlowRatio)) ? Number(world.timeFlowRatio) : 1} onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.timeFlowRatio = Number(event.target.value) || 1;
        }))}/>
        </label>
      </div>

      <label className="mt-3 block text-xs text-gray-700">
        <span className="mb-1 block font-medium">{t('worldBase.descriptionField')}</span>
        <textarea className="h-20 w-full rounded-md border border-gray-300 p-2 text-xs" value={String(world.description || '')} onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.description = event.target.value;
        }))}/>
      </label>

      <div className="ui-sync-soft-card mt-3 p-2.5">
        <KeyValueObjectEditor label={t('worldBase.rules')} value={world.rules && typeof world.rules === 'object' && !Array.isArray(world.rules)
            ? (world.rules as Record<string, unknown>)
            : {}} onChange={(nextRules) => props.onWorldPatchChange(updateWorld(world, (next) => {
            next.rules = nextRules;
        }))}/>
      </div>

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea className="mt-2 h-52 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600" value={worldPatchText} readOnly/>
      </details>
    </section>);
}
