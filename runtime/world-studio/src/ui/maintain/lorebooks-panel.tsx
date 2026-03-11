import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { WorldLorebookDraftRow } from '../../contracts.js';
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';

type LorebooksPanelProps = {
  lorebooksDraft: WorldLorebookDraftRow[];
  working: boolean;
  onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
  onSyncLorebooks: () => void;
  onDeleteFirstLorebook: () => void;
  showActions?: boolean;
};

export function LorebooksPanel(props: LorebooksPanelProps) {
  const { t } = useModTranslation('world-studio');
  const rows = props.lorebooksDraft || [];
  const invalidRows = rows.filter((row) => String(row.key || '').trim().length === 0);

  const updateRows = (nextRows: WorldLorebookDraftRow[]) => props.onLorebooksChange(nextRows);
  const lorebooksText = JSON.stringify(rows, null, 2);

  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('lorebooks.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('lorebooks.description')}</p>
        </div>
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
          onClick={() => {
            updateRows([...rows, {
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
            }]);
          }}
        >
          {t('lorebooks.addLorebook')}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {invalidRows.length > 0 ? (
          <div className="ui-sync-alert ui-sync-alert-warning px-2.5 py-2 text-xs text-amber-800">
            {t('lorebooks.invalidRows', { count: invalidRows.length })}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-xs text-gray-500">{t('lorebooks.empty')}</p>
        ) : rows.map((row, index) => (
          <div key={`lorebook-row-${row.id || index}`} className="ui-sync-soft-card p-2.5">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs text-gray-700">
                <span className="mb-1 block font-medium">{t('lorebooks.key')}</span>
                <input
                  className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
                  value={row.key}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, key: event.target.value };
                    updateRows(next);
                  }}
                />
              </label>
              <label className="text-xs text-gray-700">
                <span className="mb-1 block font-medium">{t('lorebooks.name')}</span>
                <input
                  className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
                  placeholder={t('lorebooks.namePlaceholder')}
                  value={row.name || ''}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, name: event.target.value };
                    updateRows(next);
                  }}
                />
              </label>
            </div>
            <label className="mt-2 block text-xs text-gray-700">
              <span className="mb-1 block font-medium">{t('lorebooks.content')}</span>
              <textarea
                className="h-20 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                placeholder={t('lorebooks.contentPlaceholder')}
                value={row.content || ''}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, content: event.target.value };
                  updateRows(next);
                }}
              />
            </label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-xs text-gray-700">
                <span className="mb-1 block font-medium">{t('lorebooks.keywords')}</span>
                <input
                  className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
                  placeholder={t('lorebooks.keywordsPlaceholder')}
                  value={(row.keywords || []).join(', ')}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = {
                      ...row,
                      keywords: event.target.value
                        .split(',')
                        .map((keyword) => keyword.trim())
                        .filter(Boolean),
                    };
                    updateRows(next);
                  }}
                />
              </label>
              <label className="text-xs text-gray-700">
                <span className="mb-1 block font-medium">{t('lorebooks.validFrom')}</span>
                <input
                  className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
                  value={row.validFrom || ''}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, validFrom: event.target.value };
                    updateRows(next);
                  }}
                />
              </label>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <label className="text-xs text-gray-700">
                <span className="mb-1 block font-medium">{t('lorebooks.priority')}</span>
                <input
                  type="number"
                  className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
                  value={row.priority ?? 0}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, priority: Number(event.target.value) || 0 };
                    updateRows(next);
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={row.constant ?? false}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, constant: event.target.checked };
                    updateRows(next);
                  }}
                />
                <span className="font-medium">{t('lorebooks.constant')}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={row.enabled ?? true}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, enabled: event.target.checked };
                    updateRows(next);
                  }}
                />
                <span className="font-medium">{t('lorebooks.enabled')}</span>
              </label>
            </div>
            <div className="ui-sync-card mt-2 p-2">
              <KeyValueObjectEditor
                label={t('lorebooks.value')}
                value={row.value || {}}
                compact
                onChange={(nextValue) => {
                  const next = [...rows];
                  next[index] = { ...row, value: nextValue };
                  updateRows(next);
                }}
              />
            </div>
            <div className="ui-sync-card mt-2 p-2">
              <KeyValueObjectEditor
                label={t('lorebooks.provenance')}
                value={row.provenance || {}}
                compact
                onChange={(nextValue) => {
                  const next = [...rows];
                  next[index] = { ...row, provenance: nextValue };
                  updateRows(next);
                }}
              />
            </div>
            <button
              type="button"
              className="ui-sync-btn mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700"
              onClick={() => {
                updateRows(rows.filter((_, rowIndex) => rowIndex !== index));
              }}
            >
              {t('lorebooks.deleteLorebook')}
            </button>
          </div>
        ))}
      </div>

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
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
            onClick={props.onDeleteFirstLorebook}
            disabled={props.working}
          >
            {t('lorebooks.deleteFirst')}
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
