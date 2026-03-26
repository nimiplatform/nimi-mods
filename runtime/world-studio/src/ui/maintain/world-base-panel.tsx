import React from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { worldStudioMessage } from '../../i18n/messages.js';
import {
  WorldBaseDetailsDisclosure,
  WorldBaseField,
  WorldBasePanelBlock,
  WorldBaseReadonlyCode,
  WorldBaseStatChip,
} from './world-base/world-base-components.js';

type WorldBasePanelProps = {
  worldPatch: Record<string, unknown>;
  onWorldPatchChange: (value: Record<string, unknown>) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function updateWorld(
  raw: Record<string, unknown>,
  patch: (next: Record<string, unknown>) => void,
): Record<string, unknown> {
  const next = { ...(raw || {}) };
  patch(next);
  return next;
}

function themesToText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function themesFromText(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

export function WorldBasePanel(props: WorldBasePanelProps) {
  const { t } = useModTranslation('world-studio');
  const world = props.worldPatch || {};
  const clockConfig = isRecord(world.clockConfig)
    ? world.clockConfig
    : {};
  const worldPatchText = JSON.stringify(world, null, 2);
  const clockConfigText = Object.keys(clockConfig).length > 0
    ? JSON.stringify(clockConfig, null, 2)
    : '';

  const summaryNote = stringValue(world.tagline || world.description || t('worldBase.explainer'));
  const summaryChips = [
    stringValue(world.genre) ? { label: '类型', value: stringValue(world.genre) } : null,
    stringValue(world.era) ? { label: '时代', value: stringValue(world.era) } : null,
    stringValue(world.status) ? { label: '状态', value: stringValue(world.status) } : null,
    stringValue(world.contentRating) ? { label: '分级', value: stringValue(world.contentRating) } : null,
    { label: '主题', value: `${Array.isArray(world.themes) ? world.themes.length : 0}` },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('worldBase.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('worldBase.explainer')}
      </p>

      <div className="mt-4 space-y-3">
        <WorldBasePanelBlock
          eyebrow={worldStudioMessage('worldBase.summaryTitle', '总览')}
          title={stringValue(world.name) || t('worldBase.title')}
          description={summaryNote}
        >
          <div className="flex flex-wrap gap-1.5">
            {summaryChips.map((chip) => (
              <WorldBaseStatChip
                key={`${chip.label}:${chip.value}`}
                label={chip.label}
                value={chip.value}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            {worldStudioMessage(
              'worldBase.summaryHint',
              '这里只负责世界基础信息与发布说明；更深的时间与规则仍在世界观页。',
            )}
          </p>
        </WorldBasePanelBlock>

        <WorldBasePanelBlock
          eyebrow={worldStudioMessage('worldBase.commonFieldsTitle', '常用字段编辑')}
          title={worldStudioMessage('worldBase.commonFieldsLabel', '可直接编辑的基础字段')}
          description={worldStudioMessage(
            'worldBase.commonFieldsNote',
            '这里直接改可展示、可发布的基础字段；更深的时间与规则仍在世界观页。',
          )}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            <section className="ui-sync-card p-3">
              <div className="mb-3">
                <h5 className="text-xs font-semibold text-slate-800">{t('worldBase.identityTitle')}</h5>
                <p className="mt-1 text-[11px] text-slate-500">{t('worldBase.identityDescription')}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <WorldBaseField label={t('worldBase.name')} value={stringValue(world.name)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.name = value; }))} />
                <WorldBaseField label={t('worldBase.genre')} value={stringValue(world.genre)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.genre = value; }))} />
                <WorldBaseField label={t('worldBase.tagline')} value={stringValue(world.tagline)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.tagline = value; }))} />
                <WorldBaseField label={t('worldBase.motto')} value={stringValue(world.motto)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.motto = value; }))} />
                <WorldBaseField label={t('worldBase.era')} value={stringValue(world.era)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.era = value; }))} />
                <WorldBaseField label={t('worldBase.status')} value={stringValue(world.status)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.status = value; }))} />
                <WorldBaseField label={t('worldBase.contentRating')} value={stringValue(world.contentRating)} onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.contentRating = value; }))} />
              </div>
            </section>

            <section className="ui-sync-card p-3">
              <div className="mb-3">
                <h5 className="text-xs font-semibold text-slate-800">{t('worldBase.narrativeTitle')}</h5>
                <p className="mt-1 text-[11px] text-slate-500">{t('worldBase.narrativeDescription')}</p>
              </div>
              <div className="grid gap-2">
                <WorldBaseField
                  label={t('worldBase.descriptionField')}
                  value={stringValue(world.description)}
                  multiline
                  rows={4}
                  onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.description = value; }))}
                />
                <WorldBaseField
                  label={t('worldBase.overview')}
                  value={stringValue(world.overview)}
                  multiline
                  rows={5}
                  onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.overview = value; }))}
                />
                <WorldBaseField
                  label={t('worldBase.themes')}
                  value={themesToText(world.themes)}
                  onChange={(value) => props.onWorldPatchChange(updateWorld(world, (next) => { next.themes = themesFromText(value); }))}
                />
              </div>
            </section>
          </div>
        </WorldBasePanelBlock>

        <WorldBaseDetailsDisclosure
          summary={worldStudioMessage('worldBase.clockDisclosure', '运行时时钟（只读）')}
          className="bg-slate-50 p-2.5"
        >
          <WorldBaseReadonlyCode
            value={clockConfigText}
            emptyLabel={t('worldBase.clockEmpty')}
            className="bg-white"
            heightClassName="h-40"
          />
        </WorldBaseDetailsDisclosure>

        <WorldBaseDetailsDisclosure
          summary={t('shared.rawJsonDebug')}
          className="bg-slate-50 p-2.5"
        >
          <WorldBaseReadonlyCode
            value={worldPatchText}
            emptyLabel={worldStudioMessage('worldBase.rawJsonEmpty', '当前没有可展示的原始补丁。')}
            className="bg-white"
            heightClassName="h-44"
          />
        </WorldBaseDetailsDisclosure>
      </div>
    </section>
  );
}
