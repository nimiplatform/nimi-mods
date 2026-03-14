import React from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { KeyValueObjectEditor } from '../shared/key-value-object-editor.js';

type WorldBasePanelProps = {
  worldPatch: Record<string, unknown>;
  worldviewPatch: Record<string, unknown>;
  onWorldPatchChange: (value: Record<string, unknown>) => void;
  onWorldviewPatchChange: (value: Record<string, unknown>) => void;
};

function updateWorld(raw: Record<string, unknown>, patch: (next: Record<string, unknown>) => void): Record<string, unknown> {
  const next = { ...(raw || {}) };
  patch(next);
  return next;
}

function themesToText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
}

export function WorldBasePanel(props: WorldBasePanelProps) {
  const { t } = useModTranslation('world-studio');
  const world = props.worldPatch || {};
  const clockConfig = world.clockConfig && typeof world.clockConfig === 'object' && !Array.isArray(world.clockConfig)
    ? world.clockConfig as Record<string, unknown>
    : {};
  const worldPatchText = JSON.stringify(world, null, 2);

  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('worldBase.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('worldBase.explainer')}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.name')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.name || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.name = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.genre')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.genre || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.genre = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.tagline')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.tagline || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.tagline = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.motto')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.motto || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.motto = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.era')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.era || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.era = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.status')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.status || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.status = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('worldBase.contentRating')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={String(world.contentRating || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.contentRating = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700 md:col-span-2">
          <span className="mb-1 block font-medium">{t('worldBase.descriptionField')}</span>
          <textarea
            className="h-20 w-full rounded-md border border-gray-300 p-2 text-xs"
            value={String(world.description || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.description = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700 md:col-span-2">
          <span className="mb-1 block font-medium">{t('worldBase.overview')}</span>
          <textarea
            className="h-20 w-full rounded-md border border-gray-300 p-2 text-xs"
            value={String(world.overview || '')}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.overview = event.target.value;
            }))}
          />
        </label>
        <label className="text-xs text-gray-700 md:col-span-2">
          <span className="mb-1 block font-medium">{t('worldBase.themes')}</span>
          <input
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={themesToText(world.themes)}
            onChange={(event) => props.onWorldPatchChange(updateWorld(world, (next) => {
              next.themes = event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            }))}
          />
        </label>
      </div>

      <div className="mt-3 ui-sync-soft-card p-3">
        <div className="mb-2">
          <h4 className="text-xs font-semibold text-gray-900">{t('worldBase.clockConfig')}</h4>
          <p className="mt-1 text-[11px] text-gray-500">{t('worldBase.clockConfigDescription')}</p>
        </div>
        <KeyValueObjectEditor
          label={t('worldBase.clockConfig')}
          value={clockConfig}
          onChange={(next) => props.onWorldPatchChange(updateWorld(world, (draft) => {
            draft.clockConfig = next;
          }))}
        />
      </div>

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea className="mt-2 h-52 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600" value={worldPatchText} readOnly />
      </details>
    </section>
  );
}
