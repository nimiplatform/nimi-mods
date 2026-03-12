import React from 'react';
import type { EventNodeDraft, WorldLorebookDraftRow } from '../../contracts.js';
import { WorldBasePanel } from '../maintain/world-base-panel.js';
import { WorldviewPanel } from '../maintain/worldview-panel.js';
import { LorebooksPanel } from '../maintain/lorebooks-panel.js';
import { EventGraphEditor } from './event-graph-editor.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type DraftEditorPanelProps = {
    sourceText: string;
    worldPatch: Record<string, unknown>;
    worldviewPatch: Record<string, unknown>;
    events: {
        primary: EventNodeDraft[];
        secondary: EventNodeDraft[];
    };
    lorebooksDraft: WorldLorebookDraftRow[];
    onWorldPatchChange: (value: Record<string, unknown>) => void;
    onWorldviewPatchChange: (value: Record<string, unknown>) => void;
    onEventsChange: (value: {
        primary: EventNodeDraft[];
        secondary: EventNodeDraft[];
    }) => void;
    onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
    eventGraphLayout?: {
        selectedEventId: string;
        expandedPrimaryIds: string[];
    };
    onEventGraphLayoutChange?: (next: {
        selectedEventId: string;
        expandedPrimaryIds: string[];
    }) => void;
};
export function DraftEditorPanel(props: DraftEditorPanelProps) {
    const { t } = useModTranslation('world-studio');
    return (<div className="space-y-4">
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('draftEditor.title')}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {t('draftEditor.description')}
        </p>
      </section>

      <WorldBasePanel worldPatch={props.worldPatch} onWorldPatchChange={props.onWorldPatchChange}/>

      <WorldviewPanel worldviewPatch={props.worldviewPatch} onWorldviewPatchChange={props.onWorldviewPatchChange}/>

      <EventGraphEditor title={t('draftEditor.eventGraph')} events={props.events} sourceContextText={props.sourceText} onChange={props.onEventsChange} layout={props.eventGraphLayout} onLayoutChange={props.onEventGraphLayoutChange}/>

      <LorebooksPanel lorebooksDraft={props.lorebooksDraft} working={false} onLorebooksChange={props.onLorebooksChange} onSyncLorebooks={() => undefined} onDeleteFirstLorebook={() => undefined} showActions={false}/>
    </div>);
}
