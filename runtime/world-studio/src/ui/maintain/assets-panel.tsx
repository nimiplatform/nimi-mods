import React, { useMemo, useState } from 'react';
import type { WorldStudioCreatorAgentSummary, WorldStudioResourceBindingSummary } from '../../ui/types.js';
import { findLinkedCreatorAgent } from '../../services/creator-agent-link.js';
import { asRecord, useModTranslation } from "@nimiplatform/sdk/mod";

function SectionCard(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{props.description}</p>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function SummaryCards(props: {
  items: Array<{ label: string; value: string }>;
}): React.ReactElement {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">{item.value}</p>
          <p className="mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function MissingCoverageCard(props: {
  title: string;
  description: string;
  items: string[];
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <SectionCard title={props.title} description={props.description}>
      {props.items.length === 0 ? (
        <p className="text-xs text-emerald-700">{t('assets.missing.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {props.items.map((item) => (
            <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {item}
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

type AssetInspectState = {
  title: string;
  eyebrow: string;
  summary: string;
  meta: Array<{ label: string; value: string }>;
};

function AssetInspectDrawer(props: {
  value: AssetInspectState | null;
  onClose: () => void;
}): React.ReactElement | null {
  const { t } = useModTranslation('world-studio');
  if (!props.value) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('shared.close')}
        className="fixed inset-0 z-40 bg-slate-900/12 backdrop-blur-[1px]"
        onClick={props.onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-l border-white/70 bg-[#f8fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.10)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {props.value.eyebrow}
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{props.value.title}</h3>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
            onClick={props.onClose}
          >
            {t('shared.close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">{props.value.summary}</p>
          </div>
          <div className="space-y-2">
            {props.value.meta.map((item) => (
              <div key={`${item.label}:${item.value}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 break-all text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function InspectableRow(props: {
  title: string;
  summary: string;
  badges?: string[];
  onInspect: () => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{props.title}</p>
          <p className="mt-1 text-xs text-slate-600">{props.summary}</p>
          {props.badges && props.badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {props.badges.map((badge) => (
                <span key={badge} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          onClick={props.onInspect}
        >
          {t('assets.inspect.open')}
        </button>
      </div>
    </div>
  );
}

function joinTags(tags: string[]): string {
  return tags.length > 0 ? tags.join(', ') : '-';
}

function conditionsSummary(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return '-';
  return JSON.stringify(value, null, 2);
}

export function WorldAssetsPanel(props: {
  resourceBindings: WorldStudioResourceBindingSummary[];
  worldCoverUrl: string | null;
  locationImages: Record<string, unknown>;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const [inspect, setInspect] = useState<AssetInspectState | null>(null);
  const worldBindings = props.resourceBindings.filter((item) => item.targetType === 'WORLD');
  const syncedSlots = new Set(worldBindings.map((item) => item.slot));
  const generatedLocations = Object.entries(props.locationImages || {})
    .map(([name, draft]) => ({
      name,
      imageUrl: String(asRecord(draft).imageUrl || '').trim(),
    }))
    .filter((item) => item.imageUrl);
  const missingSlots = ['WORLD_ICON', 'WORLD_BANNER', 'WORLD_GALLERY'].filter((slot) => !syncedSlots.has(slot));
  const summaryCards = [
    { label: t('assets.world.summary.generatedCover'), value: props.worldCoverUrl ? '1' : '0' },
    { label: t('assets.world.summary.generatedLocations'), value: String(generatedLocations.length) },
    { label: t('assets.world.summary.syncedBindings'), value: String(worldBindings.length) },
  ];
  const generatedItems = useMemo(() => {
    const items: Array<{ title: string; summary: string; badges: string[]; inspect: AssetInspectState }> = [];
    if (props.worldCoverUrl) {
      items.push({
        title: t('assets.world.coverItemTitle'),
        summary: props.worldCoverUrl,
        badges: [t('assets.inspect.generatedLocal')],
        inspect: {
          eyebrow: t('assets.inspect.generatedLocal'),
          title: t('assets.world.coverItemTitle'),
          summary: t('assets.world.cover', { value: props.worldCoverUrl }),
          meta: [
            { label: t('assets.inspect.storageRef'), value: props.worldCoverUrl },
          ],
        },
      });
    }
    generatedLocations.forEach((item) => {
      items.push({
        title: item.name,
        summary: item.imageUrl,
        badges: [t('assets.world.locationItemBadge')],
        inspect: {
          eyebrow: t('assets.inspect.generatedLocal'),
          title: item.name,
          summary: t('assets.world.locationItemSummary'),
          meta: [
            { label: t('assets.inspect.storageRef'), value: item.imageUrl },
          ],
        },
      });
    });
    return items;
  }, [generatedLocations, props.worldCoverUrl, t]);

  return (
    <>
      <div className="space-y-4">
        <SummaryCards items={summaryCards} />
        <SectionCard title={t('assets.world.generatedTitle')} description={t('assets.world.generatedDescription')}>
          <div className="space-y-3">
            {generatedItems.length === 0 ? (
              <p className="text-xs text-gray-500">{t('assets.world.emptyGenerated')}</p>
            ) : generatedItems.map((item) => (
              <InspectableRow
                key={`${item.title}:${item.summary}`}
                title={item.title}
                summary={item.summary}
                badges={item.badges}
                onInspect={() => setInspect(item.inspect)}
              />
            ))}
          </div>
        </SectionCard>
        <SectionCard title={t('assets.world.syncedTitle')} description={t('assets.world.syncedDescription')}>
          <div className="space-y-3">
            {worldBindings.length === 0 ? (
              <p className="text-xs text-gray-500">{t('assets.synced.empty')}</p>
            ) : worldBindings.map((binding) => (
              <InspectableRow
                key={`${binding.id || binding.slot}-${binding.targetId}`}
                title={`${binding.slot} · ${binding.targetId}`}
                summary={binding.resource.storageRef || t('assets.synced.noStorageRef')}
                badges={[binding.resource.resourceType || '-', binding.resource.label || '-']}
                onInspect={() => setInspect({
                  eyebrow: t('assets.inspect.syncedBinding'),
                  title: `${binding.slot} · ${binding.targetId}`,
                  summary: binding.resource.label || binding.resource.storageRef || t('assets.synced.noStorageRef'),
                  meta: [
                    { label: t('assets.inspect.storageRef'), value: binding.resource.storageRef || t('assets.inspect.none') },
                    { label: t('assets.inspect.tags'), value: joinTags(binding.tags) },
                    { label: t('assets.inspect.conditions'), value: conditionsSummary(binding.conditions) },
                  ],
                })}
              />
            ))}
          </div>
        </SectionCard>
        <MissingCoverageCard
          title={t('assets.world.missingTitle')}
          description={t('assets.world.missingDescription')}
          items={missingSlots}
        />
      </div>
      <AssetInspectDrawer value={inspect} onClose={() => setInspect(null)} />
    </>
  );
}

export function AgentAssetsPanel(props: {
  resourceBindings: WorldStudioResourceBindingSummary[];
  creatorAgents: WorldStudioCreatorAgentSummary[];
  portraits: Record<string, unknown>;
  draftsByCharacter: Record<string, unknown>;
  worldId: string;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const [inspect, setInspect] = useState<AssetInspectState | null>(null);
  const agentBindings = props.resourceBindings.filter((item) => item.targetType === 'AGENT');
  const localPortraits = Object.entries(props.portraits || {})
    .map(([name, draft]) => ({
      name,
      imageUrl: String(asRecord(draft).imageUrl || '').trim(),
      remoteAgent: findLinkedCreatorAgent({
        creatorAgents: props.creatorAgents,
        draft: props.draftsByCharacter[name],
        characterName: name,
        worldId: props.worldId,
      }),
    }))
    .filter((item) => item.imageUrl);
  const linkedPortraits = localPortraits.filter((item) => item.remoteAgent);
  const missingRemotePortraits = localPortraits.filter((item) => !item.remoteAgent);
  const summaryCards = [
    { label: t('assets.agent.summary.generatedPortraits'), value: String(localPortraits.length) },
    { label: t('assets.agent.summary.linkedPortraits'), value: String(linkedPortraits.length) },
    { label: t('assets.agent.summary.syncedBindings'), value: String(agentBindings.length) },
  ];

  return (
    <>
      <div className="space-y-4">
        <SummaryCards items={summaryCards} />
        <SectionCard title={t('assets.agent.generatedTitle')} description={t('assets.agent.generatedDescription')}>
          <div className="space-y-3">
            {localPortraits.length === 0 ? (
              <p className="text-xs text-gray-500">{t('assets.agent.emptyGenerated')}</p>
            ) : localPortraits.map((item) => (
              <InspectableRow
                key={item.name}
                title={item.name}
                summary={item.imageUrl}
                badges={[
                  item.remoteAgent
                    ? t('assets.agent.linked')
                    : t('assets.agent.unlinked'),
                ]}
                onInspect={() => setInspect({
                  eyebrow: t('assets.inspect.generatedLocal'),
                  title: item.name,
                  summary: item.imageUrl,
                  meta: [
                    { label: t('assets.inspect.storageRef'), value: item.imageUrl },
                    {
                      label: t('assets.inspect.linkedAgent'),
                      value: item.remoteAgent
                        ? `${item.remoteAgent.displayName || item.remoteAgent.handle} (${item.remoteAgent.id})`
                        : t('assets.agent.notCreated'),
                    },
                  ],
                })}
              />
            ))}
          </div>
        </SectionCard>
        <SectionCard title={t('assets.agent.syncedTitle')} description={t('assets.agent.syncedDescription')}>
          <div className="space-y-3">
            {agentBindings.length === 0 ? (
              <p className="text-xs text-gray-500">{t('assets.synced.empty')}</p>
            ) : agentBindings.map((binding) => (
              <InspectableRow
                key={`${binding.id || binding.slot}-${binding.targetId}`}
                title={`${binding.slot} · ${binding.targetId}`}
                summary={binding.resource.storageRef || t('assets.synced.noStorageRef')}
                badges={[binding.resource.resourceType || '-', binding.resource.label || '-']}
                onInspect={() => setInspect({
                  eyebrow: t('assets.inspect.syncedBinding'),
                  title: `${binding.slot} · ${binding.targetId}`,
                  summary: binding.resource.label || binding.resource.storageRef || t('assets.synced.noStorageRef'),
                  meta: [
                    { label: t('assets.inspect.storageRef'), value: binding.resource.storageRef || t('assets.inspect.none') },
                    { label: t('assets.inspect.tags'), value: joinTags(binding.tags) },
                    { label: t('assets.inspect.conditions'), value: conditionsSummary(binding.conditions) },
                  ],
                })}
              />
            ))}
          </div>
        </SectionCard>
        <MissingCoverageCard
          title={t('assets.agent.missingTitle')}
          description={t('assets.agent.missingDescription')}
          items={missingRemotePortraits.map((item) => item.name)}
        />
      </div>
      <AssetInspectDrawer value={inspect} onClose={() => setInspect(null)} />
    </>
  );
}
