import React from 'react';
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
  const clockConfigText = Object.keys(clockConfig).length > 0
    ? JSON.stringify(clockConfig, null, 2)
    : '';

  const Field = (fieldProps: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label className="text-xs text-gray-700">
      <span className="mb-1 block font-medium">{fieldProps.label}</span>
      <input
        className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
        value={fieldProps.value}
        onChange={(event) => fieldProps.onChange(event.target.value)}
      />
    </label>
  );

  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('worldBase.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('worldBase.explainer')}
      </p>

      <div className="mt-4 space-y-4">
        <section className="ui-sync-soft-card p-3">
          <div className="mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('worldBase.identityTitle')}</h4>
            <p className="mt-1 text-[11px] text-gray-500">{t('worldBase.identityDescription')}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label={t('worldBase.name')}
              value={String(world.name || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.name = value;
              }))}
            />
            <Field
              label={t('worldBase.genre')}
              value={String(world.genre || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.genre = value;
              }))}
            />
            <Field
              label={t('worldBase.tagline')}
              value={String(world.tagline || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.tagline = value;
              }))}
            />
            <Field
              label={t('worldBase.motto')}
              value={String(world.motto || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.motto = value;
              }))}
            />
            <Field
              label={t('worldBase.era')}
              value={String(world.era || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.era = value;
              }))}
            />
            <Field
              label={t('worldBase.status')}
              value={String(world.status || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.status = value;
              }))}
            />
            <Field
              label={t('worldBase.contentRating')}
              value={String(world.contentRating || '')}
              onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => {
                next.contentRating = value;
              }))}
            />
          </div>
        </section>

        <section className="ui-sync-soft-card p-3">
          <div className="mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('worldBase.narrativeTitle')}</h4>
            <p className="mt-1 text-[11px] text-gray-500">{t('worldBase.narrativeDescription')}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
                className="h-24 w-full rounded-md border border-gray-300 p-2 text-xs"
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
        </section>

        <section className="ui-sync-soft-card p-3">
          <div className="mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('worldBase.clockTitle')}</h4>
            <p className="mt-1 text-[11px] text-gray-500">{t('worldBase.clockDescription')}</p>
          </div>
          {clockConfigText ? (
            <textarea
              className="h-48 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600"
              value={clockConfigText}
              readOnly
            />
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
              {t('worldBase.clockEmpty')}
            </div>
          )}
        </section>
      </div>

      <details className="ui-sync-code-panel mt-3 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea className="mt-2 h-52 w-full rounded-md border border-gray-300 bg-gray-100 p-2 font-mono text-xs text-gray-600" value={worldPatchText} readOnly />
      </details>
    </section>
  );
}
