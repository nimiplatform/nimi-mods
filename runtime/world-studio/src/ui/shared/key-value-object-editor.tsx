import React from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type KeyValueObjectEditorProps = {
    label: string;
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
    compact?: boolean;
};
type ObjectRow = {
    key: string;
    value: string;
};
function normalizeRows(input: Record<string, unknown>): ObjectRow[] {
    return Object.entries(input || {}).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
}
function parseMaybeJson(value: string): unknown {
    const trimmed = String(value || '').trim();
    if (!trimmed)
        return '';
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed))
        return Number(trimmed);
    if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return value;
        }
    }
    return value;
}
function toObject(rows: ObjectRow[]): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    rows.forEach((row) => {
        const key = String(row.key || '').trim();
        if (!key)
            return;
        output[key] = parseMaybeJson(row.value);
    });
    return output;
}
export function KeyValueObjectEditor(props: KeyValueObjectEditorProps) {
    const { t } = useModTranslation('world-studio');
    const rows = normalizeRows(props.value || {});
    const spacing = props.compact ? 'space-y-1.5' : 'space-y-2';
    return (<div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-700">{props.label}</span>
        <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700" onClick={() => {
            props.onChange({
                ...props.value,
                [`field_${rows.length + 1}`]: '',
            });
        }}>
          {t('shared.addField')}
        </button>
      </div>
      <div className={spacing}>
        {rows.length === 0 ? (<p className="text-[11px] text-gray-500">{t('shared.noFieldsYet')}</p>) : rows.map((row, index) => (<div key={`${row.key}-${index}`} className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={row.key} onChange={(event) => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, key: event.target.value };
                props.onChange(toObject(nextRows));
            }} placeholder={t('shared.keyPlaceholder')}/>
            <input className="h-8 rounded border border-gray-300 px-2 text-xs" value={row.value} onChange={(event) => {
                const nextRows = [...rows];
                nextRows[index] = { ...row, value: event.target.value };
                props.onChange(toObject(nextRows));
            }} placeholder={t('shared.valuePlaceholder')}/>
            <button type="button" className="ui-sync-btn rounded border border-red-300 bg-white px-2 text-[11px] font-semibold text-red-700" onClick={() => {
                const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
                props.onChange(toObject(nextRows));
            }}>
              {t('shared.deleteShort')}
            </button>
          </div>))}
      </div>
    </div>);
}
