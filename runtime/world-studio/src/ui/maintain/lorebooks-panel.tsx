import React, { useEffect, useMemo, useState } from 'react';
import type { WorldLorebookDraftRow } from '../../contracts.js';
import { worldStudioMessage } from '../../i18n/messages.js';
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type LorebooksPanelProps = {
  lorebooksDraft: WorldLorebookDraftRow[];
  working: boolean;
  onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
  onSyncLorebooks: () => void;
  showActions?: boolean;
};

type LorebookEditorMode = 'list' | 'focus';

function createEmptyLorebook(): WorldLorebookDraftRow {
  return {
    key: '',
    name: '',
    content: '',
    value: {},
    keywords: [],
    priority: 0,
    constant: false,
    enabled: true,
    validFrom: new Date().toISOString(),
    validTo: undefined,
    provenance: { source: 'world-studio.manual' },
  };
}

function summarizeText(value: string | undefined, emptyLabel: string): string {
  const text = String(value || '').trim();
  if (!text) return emptyLabel;
  if (text.length <= 68) return text;
  return `${text.slice(0, 68)}...`;
}

function summarizeKeywords(value: string[] | undefined, emptyLabel: string): string {
  const keywords = Array.isArray(value) ? value.filter(Boolean) : [];
  if (keywords.length === 0) return emptyLabel;
  if (keywords.length <= 3) return keywords.join(', ');
  return `${keywords.slice(0, 3).join(', ')} +${keywords.length - 3}`;
}

function summarizeValidity(row: WorldLorebookDraftRow): string {
  const validFrom = String(row.validFrom || '').trim();
  const validTo = String(row.validTo || '').trim();
  if (!validFrom && !validTo) {
    return worldStudioMessage('lorebooks.always', 'Always');
  }
  if (validFrom && validTo) {
    return worldStudioMessage('lorebooks.validRange', '{{from}} -> {{to}}', { from: validFrom, to: validTo });
  }
  if (validFrom) {
    return worldStudioMessage('lorebooks.from', 'From {{value}}', { value: validFrom });
  }
  return worldStudioMessage('lorebooks.until', 'Until {{value}}', { value: validTo });
}

function isRowInvalid(row: WorldLorebookDraftRow): boolean {
  return String(row.key || '').trim().length === 0;
}

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

export function LorebooksPanel(props: LorebooksPanelProps) {
  const { t } = useModTranslation('world-studio');
  const rows = props.lorebooksDraft || [];
  const invalidRows = rows.filter(isRowInvalid);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [mode, setMode] = useState<LorebookEditorMode>('list');

  const safeSelectedIndex = rows.length === 0 || selectedIndex < 0
    ? -1
    : Math.min(Math.max(selectedIndex, 0), rows.length - 1);
  const selectedRow = safeSelectedIndex >= 0 ? rows[safeSelectedIndex] : null;
  const lorebooksText = JSON.stringify(rows, null, 2);
  const enabledCount = useMemo(
    () => rows.filter((row) => row.enabled !== false).length,
    [rows],
  );

  useEffect(() => {
    if (rows.length > 0 && safeSelectedIndex < 0) {
      setSelectedIndex(0);
    }
  }, [rows.length, safeSelectedIndex]);

  const updateRows = (nextRows: WorldLorebookDraftRow[]) => {
    props.onLorebooksChange(nextRows);
    if (nextRows.length === 0) {
      setSelectedIndex(-1);
      setMode('list');
      return;
    }
    if (safeSelectedIndex >= 0 && safeSelectedIndex >= nextRows.length) {
      setSelectedIndex(nextRows.length - 1);
    }
  };

  const updateSelectedRow = (patch: Partial<WorldLorebookDraftRow>) => {
    if (!selectedRow || safeSelectedIndex < 0) return;
    const next = [...rows];
    next[safeSelectedIndex] = { ...selectedRow, ...patch };
    updateRows(next);
  };

  const openInspect = (index: number) => {
    setSelectedIndex(index);
    setMode('list');
  };

  const openFocus = (index: number) => {
    setSelectedIndex(index);
    setMode('focus');
  };

  const closeInspect = () => {
    setSelectedIndex(-1);
    setMode('list');
  };

  const removeRow = (index: number) => {
    updateRows(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const renderInspectPanel = (): React.ReactElement | null => {
    if (!selectedRow || mode !== 'list') return null;

    return (
      <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('shared.inspect')}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {selectedRow.name || selectedRow.key || `Lorebook ${safeSelectedIndex + 1}`}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t('lorebooks.inspectDescription')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white"
              onClick={() => setMode('focus')}
            >
              {t('shared.focusEdit')}
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
              onClick={closeInspect}
            >
              {t('shared.close')}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-medium text-slate-800">{t('shared.quickOverview')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {selectedRow.enabled === false ? t('lorebooks.disabledBadge') : t('lorebooks.enabledBadge')}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {t('lorebooks.priority')} {selectedRow.priority ?? 0}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {summarizeValidity(selectedRow)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              {summarizeText(selectedRow.content, t('lorebooks.emptyContent'))}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-3">
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.key')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  value={selectedRow.key}
                  onChange={(event) => updateSelectedRow({ key: event.target.value })}
                />
              </label>

              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.name')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  placeholder={t('lorebooks.namePlaceholder')}
                  value={selectedRow.name || ''}
                  onChange={(event) => updateSelectedRow({ name: event.target.value })}
                />
              </label>

              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.keywords')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  placeholder={t('lorebooks.keywordsPlaceholder')}
                  value={(selectedRow.keywords || []).join(', ')}
                  onChange={(event) => updateSelectedRow({ keywords: parseKeywords(event.target.value) })}
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-700">
                  <span className="mb-1 block font-medium">{t('lorebooks.validFrom')}</span>
                  <input
                    className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    value={selectedRow.validFrom || ''}
                    onChange={(event) => updateSelectedRow({ validFrom: event.target.value })}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  <span className="mb-1 block font-medium">{t('lorebooks.validTo')}</span>
                  <input
                    className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    value={selectedRow.validTo || ''}
                    onChange={(event) => updateSelectedRow({ validTo: event.target.value })}
                  />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-slate-700">
                  <span className="mb-1 block font-medium">{t('lorebooks.priority')}</span>
                  <input
                    type="number"
                    className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                    value={selectedRow.priority ?? 0}
                    onChange={(event) => updateSelectedRow({ priority: Number(event.target.value) || 0 })}
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedRow.constant ?? false}
                    onChange={(event) => updateSelectedRow({ constant: event.target.checked })}
                  />
                  <span className="font-medium">{t('lorebooks.constant')}</span>
                </label>
                <label className="flex items-center gap-2 pt-6 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedRow.enabled ?? true}
                    onChange={(event) => updateSelectedRow({ enabled: event.target.checked })}
                  />
                  <span className="font-medium">{t('lorebooks.enabled')}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-medium text-slate-800">{t('lorebooks.complexFields')}</p>
            <div className="mt-2 space-y-2 text-[11px] text-slate-600">
              <p>{t('lorebooks.valueFields', { count: Object.keys(selectedRow.value || {}).length })}</p>
              <p>{t('lorebooks.provenanceFields', { count: Object.keys(selectedRow.provenance || {}).length })}</p>
            </div>
          </div>

          <button
            type="button"
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
            onClick={() => removeRow(safeSelectedIndex)}
          >
            {t('lorebooks.deleteLorebook')}
          </button>
        </div>
      </section>
    );
  };

  const renderFocusEditor = (): React.ReactElement | null => {
    if (!selectedRow || mode !== 'focus') return null;

    return (
      <div className="mt-3 grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
        <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('lorebooks.listLabel')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{t('lorebooks.focusTitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                onClick={() => setMode('list')}
              >
                {t('worldview.focus.backToInspect')}
              </button>
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                onClick={closeInspect}
              >
                {t('worldview.focus.backToOverview')}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {rows.map((row, index) => {
              const active = index === safeSelectedIndex;
              return (
                <button
                  key={`focus-row-${row.id || index}`}
                  type="button"
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-[11px] ${
                    active
                      ? 'bg-[#ecfaf6] text-slate-900'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <p className="truncate font-medium">{row.name || row.key || `Lorebook ${index + 1}`}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{summarizeKeywords(row.keywords, t('lorebooks.keywordsEmpty'))}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.key')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  value={selectedRow.key}
                  onChange={(event) => updateSelectedRow({ key: event.target.value })}
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.name')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  placeholder={t('lorebooks.namePlaceholder')}
                  value={selectedRow.name || ''}
                  onChange={(event) => updateSelectedRow({ name: event.target.value })}
                />
              </label>
            </div>

            <label className="block text-xs text-slate-700">
              <span className="mb-1 block font-medium">{t('lorebooks.content')}</span>
              <textarea
                className="h-36 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                placeholder={t('lorebooks.contentPlaceholder')}
                value={selectedRow.content || ''}
                onChange={(event) => updateSelectedRow({ content: event.target.value })}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.keywords')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  placeholder={t('lorebooks.keywordsPlaceholder')}
                  value={(selectedRow.keywords || []).join(', ')}
                  onChange={(event) => updateSelectedRow({ keywords: parseKeywords(event.target.value) })}
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.priority')}</span>
                <input
                  type="number"
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  value={selectedRow.priority ?? 0}
                  onChange={(event) => updateSelectedRow({ priority: Number(event.target.value) || 0 })}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.validFrom')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  value={selectedRow.validFrom || ''}
                  onChange={(event) => updateSelectedRow({ validFrom: event.target.value })}
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="mb-1 block font-medium">{t('lorebooks.validTo')}</span>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs"
                  value={selectedRow.validTo || ''}
                  onChange={(event) => updateSelectedRow({ validTo: event.target.value })}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedRow.constant ?? false}
                  onChange={(event) => updateSelectedRow({ constant: event.target.checked })}
                />
                <span className="font-medium">{t('lorebooks.constant')}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedRow.enabled ?? true}
                  onChange={(event) => updateSelectedRow({ enabled: event.target.checked })}
                />
                <span className="font-medium">{t('lorebooks.enabled')}</span>
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <KeyValueObjectEditor
                label={t('lorebooks.value')}
                value={selectedRow.value || {}}
                onChange={(nextValue) => updateSelectedRow({ value: nextValue })}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <KeyValueObjectEditor
                label={t('lorebooks.provenance')}
                value={selectedRow.provenance || {}}
                onChange={(nextValue) => updateSelectedRow({ provenance: nextValue })}
              />
            </div>

            <button
              type="button"
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
              onClick={() => removeRow(safeSelectedIndex)}
            >
              {t('lorebooks.deleteLorebook')}
            </button>
          </div>
        </section>
      </div>
    );
  };

  return (
    <section className="relative rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('lorebooks.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('lorebooks.description')}</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"
          onClick={() => {
            updateRows([...rows, createEmptyLorebook()]);
            setSelectedIndex(rows.length);
            setMode('list');
          }}
        >
          {t('lorebooks.addLorebook')}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded-full bg-[#eef5f5] px-3 py-1">
          {t('lorebooks.summaryTotal', { count: rows.length })}
        </span>
        <span className="rounded-full bg-[#eef5f5] px-3 py-1">
          {t('lorebooks.summaryEnabled', { count: enabledCount })}
        </span>
        <span className={`rounded-full px-3 py-1 ${invalidRows.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-[#eef5f5]'}`}>
          {t('lorebooks.summaryInvalid', { count: invalidRows.length })}
        </span>
      </div>

      {invalidRows.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          {t('lorebooks.invalidRows', { count: invalidRows.length })}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">{t('lorebooks.empty')}</p>
      ) : mode === 'focus' ? (
        renderFocusEditor()
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
            <div className="space-y-2">
              {rows.map((row, index) => {
                const active = index === safeSelectedIndex;
                return (
                  <div
                    key={`lorebook-row-${row.id || index}`}
                    className={`rounded-xl border px-3 py-3 ${
                      active
                        ? 'border-teal-300 bg-[#ecfaf6]'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openInspect(index)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {row.name || row.key || `Lorebook ${index + 1}`}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            row.enabled === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {row.enabled === false ? t('lorebooks.disabledBadge') : t('lorebooks.enabledBadge')}
                          </span>
                          {isRowInvalid(row) ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              {t('lorebooks.invalidKey')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.key || t('lorebooks.noKey')} · {t('lorebooks.priority')} {row.priority ?? 0} · {summarizeValidity(row)}
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          {summarizeText(row.content, t('lorebooks.emptyContent'))}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {summarizeKeywords(row.keywords, t('lorebooks.keywordsEmpty'))}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {t('lorebooks.valueFields', { count: Object.keys(row.value || {}).length })}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">
                            {t('lorebooks.provenanceFields', { count: Object.keys(row.provenance || {}).length })}
                          </span>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                          onClick={() => openInspect(index)}
                        >
                          {t('shared.inspect')}
                        </button>
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                          onClick={() => openFocus(index)}
                        >
                          {t('shared.focusEdit')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {renderInspectPanel() || (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/76 p-4 text-xs text-slate-500">
              {t('lorebooks.inspectDescription')}
            </div>
          )}
        </div>
      )}

      {props.showActions !== false ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={props.onSyncLorebooks}
            disabled={props.working || invalidRows.length > 0}
          >
            {t('lorebooks.bulkUpdate')}
          </button>
        </div>
      ) : null}

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea
          className="mt-2 h-44 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600"
          value={lorebooksText}
          readOnly
        />
      </details>
    </section>
  );
}
