import React from 'react';
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type WorldviewPanelProps = {
    worldviewPatch: Record<string, unknown>;
    onWorldviewPatchChange: (value: Record<string, unknown>) => void;
};
function updateWorldview(raw: Record<string, unknown>, patch: (next: Record<string, unknown>) => void): Record<string, unknown> {
    const next = { ...(raw || {}) };
    patch(next);
    return next;
}
function ModuleEditor(props: {
    label: string;
    value: unknown;
    onChange: (next: Record<string, unknown>) => void;
}) {
    const objectValue = props.value && typeof props.value === 'object' && !Array.isArray(props.value)
        ? (props.value as Record<string, unknown>)
        : {};
    return (<div className="ui-sync-soft-card p-2.5">
      <KeyValueObjectEditor label={props.label} value={objectValue} onChange={props.onChange}/>
    </div>);
}
export function WorldviewPanel(props: WorldviewPanelProps) {
    const { t } = useModTranslation('world-studio');
    const worldview = props.worldviewPatch || {};
    const worldviewPatchText = JSON.stringify(worldview, null, 2);
    const requiredModules = ['timeModel', 'spaceTopology', 'causality', 'coreSystem'] as const;
    const missingModules = requiredModules.filter((moduleKey) => {
        const value = worldview[moduleKey];
        return !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length === 0;
    });
    return (<section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('worldview.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('worldview.requiredModules')}
      </p>
      {missingModules.length > 0 ? (<div className="ui-sync-alert ui-sync-alert-warning mt-2 px-2.5 py-2 text-xs text-amber-800">
          {t('worldview.missingModules', { modules: missingModules.join(', ') })}
        </div>) : (<div className="ui-sync-alert ui-sync-alert-success mt-2 px-2.5 py-2 text-xs text-emerald-800">
          {t('worldview.ready')}
        </div>)}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ModuleEditor label="timeModel" value={worldview.timeModel} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.timeModel = next;
        }))}/>
        <ModuleEditor label="spaceTopology" value={worldview.spaceTopology} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.spaceTopology = next;
        }))}/>
        <ModuleEditor label="causality" value={worldview.causality} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.causality = next;
        }))}/>
        <ModuleEditor label="coreSystem" value={worldview.coreSystem} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.coreSystem = next;
        }))}/>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ModuleEditor label="visualGuide" value={worldview.visualGuide} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.visualGuide = next;
        }))}/>
        <ModuleEditor label="narrativeHooks" value={worldview.narrativeHooks} onChange={(next) => props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
            draft.narrativeHooks = next;
        }))}/>
      </div>

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea className="mt-2 h-52 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600" value={worldviewPatchText} readOnly/>
      </details>
    </section>);
}
