import React from 'react';
import type { EvidenceRefDraft } from '../../contracts.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type EvidenceEditorProps = {
    value: EvidenceRefDraft[];
    onChange: (next: EvidenceRefDraft[]) => void;
    required?: boolean;
    contextText?: string;
};
function createEmptyEvidence(): EvidenceRefDraft {
    return {
        segmentId: '',
        offsetStart: 0,
        offsetEnd: 0,
        excerpt: '',
        confidence: 0.5,
        sourceType: 'chunk',
    };
}
function extractContextPreview(contextText: string, start: number, end: number): string {
    const safeStart = Math.max(0, Math.min(start, contextText.length));
    const safeEnd = Math.max(safeStart, Math.min(end, contextText.length));
    const previewStart = Math.max(0, safeStart - 40);
    const previewEnd = Math.min(contextText.length, safeEnd + 40);
    return contextText.slice(previewStart, previewEnd);
}
export function EvidenceEditor(props: EvidenceEditorProps) {
    const { t } = useModTranslation('world-studio');
    const missingRequired = Boolean(props.required) && props.value.length === 0;
    return (<div className="ui-sync-soft-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">
          {t('evidenceEditor.title')}
        </p>
        <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700" onClick={() => props.onChange([...props.value, createEmptyEvidence()])}>
          {t('evidenceEditor.addEvidence')}
        </button>
      </div>
      {missingRequired ? (<p className="ui-sync-alert ui-sync-alert-danger mt-1 px-2 py-1 text-[11px] text-red-700">{t('evidenceEditor.requiredHint')}</p>) : null}
      <div className="mt-2 space-y-2">
        {props.value.length === 0 ? (<p className="text-[11px] text-gray-500">{t('evidenceEditor.empty')}</p>) : props.value.map((item, index) => (<div key={`evidence-${index}`} className="ui-sync-card p-2">
            {props.contextText ? (<div className="ui-sync-toolbar mb-2 px-2 py-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 disabled:opacity-50" disabled={!item.excerpt.trim() || props.contextText.indexOf(item.excerpt.trim()) < 0} onClick={() => {
                    const excerpt = item.excerpt.trim();
                    if (!excerpt)
                        return;
                    const matchedIndex = props.contextText ? props.contextText.indexOf(excerpt) : -1;
                    if (matchedIndex < 0)
                        return;
                    const next = [...props.value];
                    next[index] = {
                        ...item,
                        offsetStart: matchedIndex,
                        offsetEnd: matchedIndex + excerpt.length,
                    };
                    props.onChange(next);
                }}>
                    {t('evidenceEditor.locateExcerpt')}
                  </button>
                  <p className="text-[10px] text-gray-600">
                    {item.excerpt.trim()
                    ? (props.contextText.indexOf(item.excerpt.trim()) >= 0
                        ? t('evidenceEditor.excerptFoundAt', { index: props.contextText.indexOf(item.excerpt.trim()) })
                        : t('evidenceEditor.excerptNotFound'))
                    : t('evidenceEditor.excerptEmpty')}
                  </p>
                </div>
                {Number.isFinite(item.offsetStart)
                    && Number.isFinite(item.offsetEnd)
                    && item.offsetStart >= 0
                    && item.offsetEnd > item.offsetStart
                    && item.offsetEnd <= props.contextText.length ? (<pre className="mt-1.5 max-h-20 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-1 text-[10px] text-gray-700">
                      {extractContextPreview(props.contextText, item.offsetStart, item.offsetEnd)}
                    </pre>) : null}
              </div>) : null}
            <div className="grid gap-2 lg:grid-cols-2">
              <label className="text-[11px] text-gray-700">
                <span className="mb-0.5 block">{t('evidenceEditor.segmentId')}</span>
                <input className="h-8 w-full rounded border border-gray-300 px-2 text-[11px]" value={item.segmentId} onChange={(event) => {
                const next = [...props.value];
                next[index] = { ...item, segmentId: event.target.value };
                props.onChange(next);
            }}/>
              </label>
              <label className="text-[11px] text-gray-700">
                <span className="mb-0.5 block">{t('evidenceEditor.sourceType')}</span>
                <select className="h-8 w-full rounded border border-gray-300 px-2 text-[11px]" value={item.sourceType} onChange={(event) => {
                const next = [...props.value];
                next[index] = {
                    ...item,
                    sourceType: event.target.value as EvidenceRefDraft['sourceType'],
                };
                props.onChange(next);
            }}>
                  <option value="chunk">chunk</option>
                  <option value="text">text</option>
                  <option value="file">file</option>
                </select>
              </label>
            </div>
            <label className="mt-2 block text-[11px] text-gray-700">
              <span className="mb-0.5 block">{t('evidenceEditor.excerpt')}</span>
              <textarea className="h-16 w-full rounded border border-gray-300 p-1.5 text-[11px]" value={item.excerpt} onChange={(event) => {
                const next = [...props.value];
                next[index] = { ...item, excerpt: event.target.value };
                props.onChange(next);
            }}/>
            </label>
            <div className="mt-2 grid gap-2 lg:grid-cols-3">
              <label className="text-[11px] text-gray-700">
                <span className="mb-0.5 block">{t('evidenceEditor.offsetStart')}</span>
                <input type="number" className="h-8 w-full rounded border border-gray-300 px-2 text-[11px]" value={item.offsetStart} onChange={(event) => {
                const next = [...props.value];
                next[index] = {
                    ...item,
                    offsetStart: Number(event.target.value) || 0,
                };
                props.onChange(next);
            }}/>
              </label>
              <label className="text-[11px] text-gray-700">
                <span className="mb-0.5 block">{t('evidenceEditor.offsetEnd')}</span>
                <input type="number" className="h-8 w-full rounded border border-gray-300 px-2 text-[11px]" value={item.offsetEnd} onChange={(event) => {
                const next = [...props.value];
                next[index] = {
                    ...item,
                    offsetEnd: Number(event.target.value) || 0,
                };
                props.onChange(next);
            }}/>
              </label>
              <label className="text-[11px] text-gray-700">
                <span className="mb-0.5 block">{t('evidenceEditor.confidence')}</span>
                <input type="number" min={0} max={1} step={0.05} className="h-8 w-full rounded border border-gray-300 px-2 text-[11px]" value={item.confidence} onChange={(event) => {
                const next = [...props.value];
                const numeric = Number(event.target.value);
                next[index] = {
                    ...item,
                    confidence: Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0.5,
                };
                props.onChange(next);
            }}/>
              </label>
            </div>
            <button type="button" className="ui-sync-btn mt-2 rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700" onClick={() => {
                const next = props.value.filter((_, valueIndex) => valueIndex !== index);
                props.onChange(next);
            }}>
              {t('evidenceEditor.delete')}
            </button>
          </div>))}
      </div>
    </div>);
}
